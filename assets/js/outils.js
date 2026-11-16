/* Poké-Raichu · outils du vendeur (pages non référencées) :
   - /gestion.html : statuts (réservée, vendue) et prix en direct écrits dans un Gist GitHub, lus par le site sans republier ;
   - /salon.html : caisse du stand utilisable sans réseau, export des ventes pour l'Excel. */
(function () {
  'use strict';
  var d = document;
  var C = window.PR_CONFIG || {};
  function all(sel, root) { return Array.prototype.slice.call((root || d).querySelectorAll(sel)); }
  function el(tag, cls, text) { var e = d.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = text; return e; }
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function getJSON(k, dflt) { try { return JSON.parse(get(k) || 'null') || dflt; } catch (e) { return dflt; } }
  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function eur(p) {
    try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(p); } catch (e) { return p.toFixed(2).replace('.', ',') + ' €'; }
  }
  function loadStock(url) { return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  function label(c) { return c.titre + (c.type === 'slab' ? ' ' + c.etat.libelle : ''); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function frDate(t) { var x = new Date(t); return pad(x.getDate()) + '/' + pad(x.getMonth() + 1) + '/' + x.getFullYear(); }
  function frTime(t) { var x = new Date(t); return pad(x.getHours()) + 'h' + pad(x.getMinutes()); }

  /* Statuts en direct : lien « Raw » du Gist dans config.js */
  var RAW = String(C.statuts_url || '').trim();
  var GM = RAW.match(/^https:\/\/gist\.githubusercontent\.com\/[\w-]+\/([0-9a-f]+)\/raw\/(?:[0-9a-f]+\/)?([\w.-]+)$/i);
  var GIST = GM ? GM[1] : '', GFILE = GM ? GM[2] : 'statuts.json';
  function token() { return get('pr.gestion.jeton') || ''; }
  function api(method, body) {
    return fetch('https://api.github.com/gists/' + GIST, {
      method: method, cache: 'no-store',
      headers: { 'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + token(),
        'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) { if (!r.ok) throw new Error('GitHub ' + r.status); return r.json(); });
  }
  /* fichier tolerant : contenu vide ou mal tape (ex. « {} » saisi sur un telephone) = aucun statut, aucun prix */
  function parseStatus(t) {
    try { var o = typeof t === 'string' ? JSON.parse(t || '{}') : t; return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; }
  }
  function refs(a) { return Array.isArray(a) ? a.map(String) : []; }
  function cleanPrix(p) {
    var o = {};
    if (p && typeof p === 'object' && !Array.isArray(p)) Object.keys(p).forEach(function (k) {
      var v = +p[k], r = String(k).trim().toUpperCase();
      if (/^[A-Z0-9]{1,12}$/.test(r) && isFinite(v) && v > 0 && v < 1e6) o[r] = Math.round(v * 100) / 100;
    });
    return o;
  }
  function readStatus() {
    if (!GIST) return Promise.resolve({ reservees: [], vendues: [], prix: {} });
    if (token()) return api('GET').then(function (g) { var f = g.files && g.files[GFILE]; return parseStatus(f ? f.content : '{}'); });
    return fetch(RAW + '?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : '{}'; }).then(parseStatus);
  }
  function writeStatus(s) {
    s.maj = new Date().toISOString();
    var files = {};
    files[GFILE] = { content: JSON.stringify({ maj: s.maj, reservees: refs(s.reservees), vendues: refs(s.vendues), prix: cleanPrix(s.prix) }, null, 1) };
    return api('PATCH', { files: files });
  }
  function soon(p) {
    return Promise.race([p.catch(function () { return {}; }), new Promise(function (ok) { setTimeout(function () { ok({}); }, 2500); })]);
  }

  /* ------------------------------------------------------------------ gestion */
  var G = d.getElementById('gestion');
  if (G) {
    var jet = d.getElementById('g-jeton'), info = G.querySelector('[data-gestion-info]');
    var save = G.querySelector('[data-gestion-save]'), forget = G.querySelector('[data-gestion-forget]');
    var q = d.getElementById('g-q'), list = G.querySelector('[data-gestion-list]'), count = G.querySelector('[data-gestion-count]');
    var cards = [], byRef = {}, state = { reservees: [], vendues: [], prix: {} }, timer = null, loaded = false;
    var AN = window.PR_ANNONCE || null, anOpen = null;
    function K(ref) { return String(ref).trim().toUpperCase(); }
    function eur0(n) { return Math.round(n) === n ? n + '\u202f€' : eur(n); }
    var note = { ref: null, text: '', warn: false };
    function setNote(ref, text, warn) {
      note = { ref: ref ? K(ref) : null, text: text, warn: !!warn };
      var e = ref ? list.querySelector('[data-note="' + K(ref) + '"]') : null;
      if (e) { e.textContent = text; e.classList.toggle('is-warn', !!warn); }
    }
    function setInfo(t) { info.textContent = t; }
    /* clé déjà enregistrée : le réglage se replie en une ligne, la liste remonte */
    var setupBox = G.querySelector('[data-gestion-setup] > div'), intro = setupBox ? setupBox.querySelector('p') : null, ready = null;
    if (setupBox) {
      ready = el('p');
      ready.appendChild(el('strong', '', 'Clé GitHub enregistrée sur ce téléphone.'));
      ready.appendChild(d.createTextNode(' Les changements partent directement sur le site.'));
      ready.hidden = true;
      setupBox.insertBefore(ready, setupBox.firstChild);
    }
    function syncSetup() {
      forget.hidden = !token();
      jet.value = '';
      jet.placeholder = token() ? 'Clé enregistrée sur ce téléphone' : 'github_pat_…';
      var has = !!token();
      if (intro) intro.hidden = has;
      if (ready) ready.hidden = !has;
      if (jet.closest('.field')) jet.closest('.field').hidden = has;
      save.hidden = has;
      if (!GIST) setInfo('Renseignez « statuts_url » dans config.js (lien Raw du Gist qui contient statuts.json), puis republiez.');
      else if (!token()) setInfo('Sans clé, la liste se lit mais ne peut pas être modifiée.');
      else setInfo('Prêt : chaque changement est publié en quelques secondes.');
    }
    save.addEventListener('click', function () {
      var v = jet.value.trim();
      if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(v)) { setInfo('Cette clé ne ressemble pas à une clé GitHub (github_pat_… ou ghp_…).'); return; }
      put('pr.gestion.jeton', v);
      syncSetup();
      load();
    });
    forget.addEventListener('click', function () { del('pr.gestion.jeton'); syncSetup(); });
    function statusOf(ref) { return state.vendues.indexOf(ref) !== -1 ? 'vendue' : state.reservees.indexOf(ref) !== -1 ? 'reservee' : 'dispo'; }
    function livePrice(ref) { var k = K(ref); return Object.prototype.hasOwnProperty.call(state.prix, k) ? state.prix[k] : null; }
    function failMsg(e) {
      var m = String((e && e.message) || '');
      if (/GitHub 40[13]/.test(m)) return 'Échec : la clé GitHub est refusée ou expirée. Créez-en une nouvelle (Gists : Read and write) et collez-la ci-dessus.';
      if (/GitHub 404/.test(m)) return 'Échec : Gist introuvable. Vérifiez « statuts_url » dans config.js.';
      return 'Échec de la publication (' + m + '). Vérifiez le réseau, puis réessayez.';
    }
    function publish(what, ref) {
      if (!GIST || !token()) { setInfo('Changement non publié : ajoutez la clé GitHub.'); setNote(ref, 'Non publié : ajoutez la clé GitHub en haut de la page.', true); return; }
      clearTimeout(timer);
      setInfo('Publication…');
      setNote(ref, 'Publication…');
      timer = setTimeout(function () {
        writeStatus(state).then(function () {
          timer = null;
          var t = 'Publié à ' + frTime(Date.now()) + ' : le site l’affiche d’ici une minute environ.';
          setInfo((what ? what + '. ' : '') + t);
          setNote(ref, '✓ ' + t);
        }).catch(function (e) { timer = null; setInfo(failMsg(e)); setNote(ref, failMsg(e), true); });
      }, 900);
    }
    function setStatus(ref, v) {
      state.reservees = state.reservees.filter(function (r) { return r !== ref; });
      state.vendues = state.vendues.filter(function (r) { return r !== ref; });
      if (v === 'reservee') state.reservees.push(ref);
      if (v === 'vendue') state.vendues.push(ref);
      render();
      publish('Réf. ' + ref + ' : ' + (v === 'vendue' ? 'vendue' : v === 'reservee' ? 'réservée' : 'disponible'), ref);
    }
    function parsePrice(s) {
      var v = String(s || '').replace(/[\s  €]/g, '').replace(',', '.');
      if (!/^\d{1,6}(\.\d{1,2})?$/.test(v)) return null;
      var n = Math.round(parseFloat(v) * 100) / 100;
      return n > 0 ? n : null;
    }
    function num(n) { return Math.round(n) === n ? String(n) : n.toFixed(2).replace('.', ','); }
    function setPrice(c, v) {
      if (v === c.prix_eur) delete state.prix[K(c.ref)]; else state.prix[K(c.ref)] = v;
      render();
      publish('Réf. ' + c.ref + ' : ' + eur0(v), c.ref);
    }
    function priceBox(c) {
      var lp = livePrice(c.ref), cur = lp !== null ? lp : c.prix_eur;
      var wrap = el('div', 'prix-edit');
      if (c.prix_eur === null || c.prix_eur === undefined) {
        wrap.appendChild(el('span', 'muted small', 'Prix sur demande : à changer lors d’une republication.'));
        return wrap;
      }
      var box = el('span', 'prix-box');
      var inp = el('input');
      inp.type = 'text';
      inp.inputMode = 'decimal';
      inp.autocomplete = 'off';
      inp.spellcheck = false;
      inp.setAttribute('enterkeyhint', 'done');
      inp.setAttribute('aria-label', 'Prix en euros, réf. ' + c.ref);
      inp.value = num(cur);
      var ok = el('button', '', 'Valider');
      ok.type = 'button';
      ok.disabled = true;
      box.appendChild(inp);
      box.appendChild(el('span', 'prix-box__eur', '€'));
      box.appendChild(ok);
      wrap.appendChild(box);
      var pending = null;
      inp.addEventListener('input', function () {
        if (pending !== null) setNote(c.ref, '');
        pending = null;
        wrap.classList.remove('is-confirm');
        ok.textContent = 'Valider';
        var v = parsePrice(inp.value);
        inp.setAttribute('aria-invalid', String(v === null && inp.value.trim() !== ''));
        ok.disabled = v === null || v === cur;
      });
      function commit() {
        var v = parsePrice(inp.value);
        if (v === null || v === cur) return;
        /* garde-fou contre la faute de frappe (un zéro en trop ou en moins) */
        if ((v < cur * 0.5 || v > cur * 2) && pending !== v) {
          pending = v;
          wrap.classList.add('is-confirm');
          ok.textContent = 'Confirmer';
          setInfo('Gros écart pour la réf. ' + c.ref + ' : ' + eur0(cur) + ' → ' + eur0(v) + '. Touchez « Confirmer » si c’est bien voulu.');
          setNote(c.ref, 'Gros écart : ' + eur0(cur) + ' → ' + eur0(v) + '. Touchez « Confirmer » si c’est bien voulu.', true);
          return;
        }
        setPrice(c, v);
      }
      ok.addEventListener('click', commit);
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
      if (lp !== null) {
        var back = el('button', 'linkbtn', 'Revenir au prix publié (' + eur0(c.prix_eur) + ')');
        back.type = 'button';
        back.addEventListener('click', function () { setPrice(c, c.prix_eur); });
        wrap.appendChild(back);
      }
      var nt = el('p', 'prix-note' + (note.ref === K(c.ref) && note.warn ? ' is-warn' : ''), note.ref === K(c.ref) ? note.text : '');
      nt.setAttribute('data-note', K(c.ref));
      nt.setAttribute('aria-live', 'polite');
      wrap.appendChild(nt);
      return wrap;
    }
    function render() {
      var t = norm(q.value).trim();
      list.textContent = '';
      var shown = 0, nPx = Object.keys(state.prix).length;
      cards.forEach(function (c) {
        if (t && norm(c.ref + ' ' + label(c) + ' ' + (c.nom_en || '')).indexOf(t) === -1) return;
        var cur = statusOf(c.ref), lp = livePrice(c.ref);
        if (!t && cur === 'dispo' && lp === null && shown >= 60) return;
        shown++;
        var li = el('li', 'sel-row' + (lp !== null ? ' is-live-price' : ''));
        li.appendChild(el('span', 'sel-row__name', label(c)));
        li.appendChild(el('span', 'sel-row__meta', 'Réf. ' + c.ref + ' · ' + c.quantite + ' en stock' +
          (lp !== null ? ' · prix changé en direct (publié : ' + eur0(c.prix_eur) + ')' : '')));
        var where = AN ? AN.ou(c.ref) : [];
        if (where.length) {
          var gone = cur === 'vendue';
          li.appendChild(el('span', 'sel-row__meta annonce-ou' + (gone ? ' is-warn' : ''),
            (gone ? 'Vendue : annonce à retirer sur ' : 'Annonce postée sur ') + where.join(', ')));
        }
        var seg = el('div', 'seg');
        seg.setAttribute('role', 'group');
        seg.setAttribute('aria-label', 'Statut de la réf. ' + c.ref);
        [['dispo', 'Disponible'], ['reservee', 'Réservée'], ['vendue', 'Vendue']].forEach(function (o) {
          var b = el('button', '', o[1]);
          b.type = 'button';
          b.setAttribute('data-v', o[0]);
          b.setAttribute('aria-pressed', String(cur === o[0]));
          b.addEventListener('click', function () { setStatus(c.ref, o[0]); });
          seg.appendChild(b);
        });
        var ctrl = el('div', 'sel-row__ctrl');
        ctrl.appendChild(seg);
        ctrl.appendChild(priceBox(c));
        li.appendChild(ctrl);
        if (AN) {
          var ab = el('button', 'btn btn--ghost annonce-btn', anOpen === c.ref ? 'Fermer l’annonce' : 'Annonce');
          ab.type = 'button';
          ab.setAttribute('aria-expanded', String(anOpen === c.ref));
          ab.addEventListener('click', function () { anOpen = anOpen === c.ref ? null : c.ref; render(); });
          ctrl.appendChild(ab);
          if (anOpen === c.ref) li.appendChild(AN.panel(c, c.prix_eur === null || c.prix_eur === undefined ? null : (lp !== null ? lp : c.prix_eur), render));
        }
        list.appendChild(li);
      });
      count.textContent = state.reservees.length + ' réservée(s) · ' + state.vendues.length + ' vendue(s) · ' + nPx +
        ' prix changé(s) en direct' + (t ? '' : ' · tapez une référence ou un nom pour trouver une carte');
    }
    function load() {
      Promise.all([loadStock(G.getAttribute('data-stock')), readStatus()]).then(function (r) {
        cards = r[0].cartes.slice().sort(function (a, b) { return (parseInt(a.ref, 10) || 1e6) - (parseInt(b.ref, 10) || 1e6) || a.ref.localeCompare(b.ref); });
        byRef = {};
        cards.forEach(function (c) { byRef[K(c.ref)] = c; });
        state.reservees = refs(r[1].reservees);
        state.vendues = refs(r[1].vendues);
        state.prix = cleanPrix(r[1].prix);
        /* prix revenus au prix publié (ou carte retirée) : plus rien à garder en direct */
        Object.keys(state.prix).forEach(function (k) {
          var c = byRef[k];
          if (!c || c.prix_eur === null || c.prix_eur === state.prix[k]) delete state.prix[k];
        });
        loaded = true;
        render();
      }).catch(function (e) { setInfo('Lecture impossible (' + e.message + ').'); });
    }
    q.addEventListener('input', render);
    /* retour sur l'onglet : relire le Gist (changements faits depuis la caisse du salon ou un autre appareil) */
    d.addEventListener('visibilitychange', function () {
      var a = d.activeElement;
      if (!d.hidden && loaded && !timer && !(a && a.closest && a.closest('.prix-edit, .annonce'))) load();
    });
    syncSetup();
    load();
  }

  /* ------------------------------------------------------------------ salon */
  var S = d.getElementById('salon');
  if (S) {
    var stock = [], byRef = {};
    var stateBox = S.querySelector('[data-salon-state]');
    var sq = d.getElementById('s-q'), results = S.querySelector('[data-salon-results]'), cartEl = S.querySelector('[data-salon-cart]');
    var remise = d.getElementById('s-remise'), moyen = d.getElementById('s-moyen');
    var nEl = S.querySelector('[data-salon-n]'), totEl = S.querySelector('[data-salon-total]');
    var pay = S.querySelector('[data-salon-encaisser]'), vider = S.querySelector('[data-salon-vider]');
    var jour = S.querySelector('[data-salon-jour]'), exp = S.querySelector('[data-salon-export]');
    var liveBtn = S.querySelector('[data-salon-live]'), purge = S.querySelector('[data-salon-purge]');
    function cart() { return getJSON('pr.salon.panier', []); }
    function setCart(c) { put('pr.salon.panier', JSON.stringify(c)); renderCart(); }
    function sales() { return getJSON('pr.salon.ventes', []); }
    function renderState(msg) {
      stateBox.textContent = '';
      var on = get('pr.salon') === '1';
      var box = el('div', 'callout');
      var p = el('p');
      p.appendChild(el('strong', '', on ? 'Mode salon actif sur ce téléphone. ' : 'Mode salon inactif sur ce téléphone. '));
      p.appendChild(d.createTextNode(msg || (on ? 'Les fiches affichent « Ajouter à la vente ». ' : 'Activez-le avant le salon, avec du réseau, pour garder toutes les fiches.')));
      box.appendChild(p);
      var b = el('button', on ? 'btn btn--ghost' : 'btn', on ? 'Désactiver' : 'Activer et garder les fiches hors ligne');
      b.type = 'button';
      b.addEventListener('click', function () {
        if (on) { del('pr.salon'); renderState(); return; }
        put('pr.salon', '1');
        put('pr.moi', 'oui');
        precache();
      });
      box.appendChild(b);
      stateBox.appendChild(box);
    }
    function precache() {
      var urls = ['/salon.html', '/catalogue.html', '/selection.html', '/data/stock.json', '/config.js'];
      stock.forEach(function (c) { urls.push('/cartes/' + c.slug + '.html'); });
      if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
        if (window.caches) {
          caches.open('pr-salon').then(function (c) {
            var done = 0;
            return Promise.all(urls.map(function (u) { return c.add(u).then(function () { done++; }).catch(function () {}); })).then(function () {
              renderState(done + ' pages conservées sur ' + urls.length + ' pour un usage sans réseau.');
            });
          });
        } else renderState('Ce navigateur ne peut pas garder les pages hors ligne.');
        return;
      }
      renderState('Mise de côté des fiches en cours…');
      navigator.serviceWorker.controller.postMessage({ type: 'salon-precache', urls: urls });
    }
    if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'salon-precache-done') renderState(e.data.done + ' pages conservées sur ' + e.data.total + ' pour un usage sans réseau.');
    });
    function parseRemise(total) {
      var v = String(remise.value || '').replace(',', '.').trim();
      if (!v) return 0;
      var m = v.match(/^(\d+(?:\.\d+)?)\s*%$/);
      if (m) return Math.round(total * (+m[1]) ) / 100;
      var n = parseFloat(v);
      return isFinite(n) && n > 0 ? Math.min(n, total) : 0;
    }
    function totals() {
      var c = cart(), n = 0, sub = 0;
      c.forEach(function (x) { n += x.q || 1; sub += (x.prix || 0) * (x.q || 1); });
      var r = parseRemise(sub);
      return { n: n, sub: sub, remise: r, total: Math.max(0, Math.round((sub - r) * 100) / 100) };
    }
    function renderCart() {
      var c = cart();
      cartEl.textContent = '';
      c.forEach(function (x, i) {
        var li = el('li', 'sel-row');
        li.appendChild(el('span', 'sel-row__name', x.titre || ('Réf. ' + x.ref)));
        var inp = el('input', 'input');
        inp.inputMode = 'decimal';
        inp.value = x.prix === null || x.prix === undefined ? '' : String(x.prix).replace('.', ',');
        inp.setAttribute('aria-label', 'Prix encaissé, réf. ' + x.ref);
        inp.placeholder = 'Prix';
        inp.addEventListener('change', function () { var cc = cart(); cc[i].prix = parseFloat(inp.value.replace(',', '.')) || 0; setCart(cc); });
        var meta = el('span', 'sel-row__meta', 'Réf. ' + x.ref + (x.q > 1 ? ' · ×' + x.q : ''));
        var ctrl = el('div', 'sel-row__ctrl');
        ctrl.appendChild(inp);
        var rm = el('button', 'linkbtn', 'Retirer');
        rm.type = 'button';
        rm.addEventListener('click', function () { var cc = cart(); cc.splice(i, 1); setCart(cc); });
        ctrl.appendChild(rm);
        li.appendChild(meta); li.appendChild(ctrl);
        cartEl.appendChild(li);
      });
      var t = totals();
      nEl.textContent = t.n;
      totEl.textContent = eur(t.total) + (t.remise ? ' (remise ' + eur(t.remise) + ')' : '');
      pay.disabled = !c.length;
    }
    function search() {
      var t = norm(sq.value).trim();
      results.textContent = '';
      if (!t) return;
      stock.filter(function (c) { return norm(c.ref + ' ' + label(c) + ' ' + (c.nom_en || '')).indexOf(t) !== -1; }).slice(0, 8).forEach(function (c) {
        var li = el('li', 'sel-row');
        li.appendChild(el('span', 'sel-row__name', label(c)));
        li.appendChild(el('span', 'sel-row__meta', 'Réf. ' + c.ref + ' · ' + (c.prix_eur === null ? 'sur demande' : eur(c.prix_eur))));
        var b = el('button', 'btn btn--ghost', 'Ajouter');
        b.type = 'button';
        b.addEventListener('click', function () {
          var cc = cart(), hit = cc.filter(function (x) { return x.ref === c.ref; })[0];
          if (hit) hit.q = (hit.q || 1) + 1; else cc.push({ ref: c.ref, titre: label(c), prix: c.prix_eur, q: 1 });
          setCart(cc);
          sq.value = ''; results.textContent = ''; sq.focus();
        });
        var ctrl = el('div', 'sel-row__ctrl'); ctrl.appendChild(b); li.appendChild(ctrl);
        results.appendChild(li);
      });
    }
    function renderDay() {
      var v = sales();
      jour.textContent = '';
      if (!v.length) { jour.appendChild(el('p', 'muted', 'Aucune vente enregistrée sur ce téléphone.')); exp.disabled = true; return; }
      exp.disabled = false;
      var days = {};
      v.forEach(function (s) { var k = frDate(s.t); (days[k] = days[k] || []).push(s); });
      Object.keys(days).forEach(function (k) {
        var list = days[k], tot = 0, n = 0, by = {};
        list.forEach(function (s) { tot += s.total; n += s.lignes.reduce(function (a, x) { return a + (x.q || 1); }, 0); by[s.moyen] = (by[s.moyen] || 0) + s.total; });
        var box = el('div', 'salon-day');
        box.appendChild(el('h3', '', k + ' · ' + n + ' carte(s) · ' + eur(tot)));
        box.appendChild(el('p', 'muted small', Object.keys(by).map(function (m) { return m + ' ' + eur(by[m]); }).join(' · ')));
        var ul = el('ul', 'sel-list');
        list.forEach(function (s) {
          var li = el('li', 'sel-row');
          li.appendChild(el('span', 'sel-row__name', frTime(s.t) + ' · ' + s.lignes.map(function (x) { return 'réf. ' + x.ref + (x.q > 1 ? ' ×' + x.q : ''); }).join(', ')));
          li.appendChild(el('span', 'sel-row__price', eur(s.total)));
          li.appendChild(el('span', 'sel-row__meta', s.moyen + (s.remise ? ' · remise ' + eur(s.remise) : '')));
          ul.appendChild(li);
        });
        box.appendChild(ul);
        jour.appendChild(box);
      });
      liveBtn.hidden = !(GIST && token());
    }
    pay.addEventListener('click', function () {
      var c = cart();
      if (!c.length) return;
      var t = totals();
      var v = sales();
      v.push({ t: Date.now(), lignes: c, sous_total: t.sub, remise: t.remise, total: t.total, moyen: moyen.value });
      put('pr.salon.ventes', JSON.stringify(v));
      remise.value = '';
      setCart([]);
      renderDay();
    });
    vider.addEventListener('click', function () { setCart([]); });
    remise.addEventListener('input', renderCart);
    sq.addEventListener('input', search);
    purge.addEventListener('click', function () {
      if (window.confirm && !window.confirm('Effacer toutes les ventes enregistrées sur ce téléphone ? Exportez-les d’abord.')) return;
      del('pr.salon.ventes'); renderDay();
    });
    exp.addEventListener('click', function () {
      var rows = [['Vendu le', 'Réf.', 'Carte', 'Quantité', 'Prix affiché', 'Prix encaissé', 'Paiement', 'Heure']];
      sales().forEach(function (s) {
        var sub = s.sous_total || 0;
        s.lignes.forEach(function (x) {
          var line = (x.prix || 0) * (x.q || 1);
          var share = sub ? line - (s.remise || 0) * line / sub : 0;
          var shown = byRef[x.ref] && byRef[x.ref].prix_eur !== null ? byRef[x.ref].prix_eur : '';
          rows.push([frDate(s.t), x.ref, x.titre || '', x.q || 1, shown === '' ? '' : String(shown).replace('.', ','), share.toFixed(2).replace('.', ','), s.moyen, frTime(s.t)]);
        });
      });
      var csv = '﻿' + rows.map(function (r) { return r.map(function (v) { v = String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(';'); }).join('\r\n');
      var a = el('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      var x = new Date();
      a.download = 'ventes-salon-' + x.getFullYear() + pad(x.getMonth() + 1) + pad(x.getDate()) + '.csv';
      d.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    });
    liveBtn.addEventListener('click', function () {
      var refs = {};
      sales().forEach(function (s) { s.lignes.forEach(function (x) { refs[x.ref] = 1; }); });
      liveBtn.disabled = true;
      readStatus().then(function (st) {
        st.reservees = (st.reservees || []).filter(function (r) { return !refs[r]; });
        st.vendues = (st.vendues || []).concat(Object.keys(refs).filter(function (r) { return (st.vendues || []).indexOf(r) === -1; }));
        return writeStatus(st);
      }).then(function () { liveBtn.textContent = 'Marquées vendues en ligne'; })
        .catch(function (e) { liveBtn.textContent = 'Échec (' + e.message + ')'; liveBtn.disabled = false; });
    });
    window.addEventListener('storage', function (e) { if (e.key === 'pr.salon.panier') renderCart(); });
    window.addEventListener('pageshow', renderCart);
    Promise.all([loadStock(S.getAttribute('data-stock')), soon(readStatus())]).then(function (r) {
      var data = r[0], px = cleanPrix((r[1] || {}).prix);
      /* prix changés en direct depuis /gestion.html */
      data.cartes.forEach(function (c) { var k = String(c.ref).toUpperCase(); if (c.prix_eur !== null && px[k]) c.prix_eur = px[k]; });
      stock = data.cartes;
      stock.forEach(function (c) { byRef[c.ref] = c; });
      renderState();
    }).catch(function () { renderState('Stock indisponible : ouvrez cette page une fois avec du réseau.'); });
    renderCart();
    renderDay();
  }
})();
