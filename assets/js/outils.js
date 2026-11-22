/* Poké-Raichu · outils du vendeur (pages non référencées) :
   - /gestion.html : statuts (réservée, vendue) et prix en direct écrits dans un Gist GitHub, lus par le site sans republier ;
     bouton « Modifier » (assets/js/modif.js) : nom, état et Pokémon d'une fiche déjà en ligne ;
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
  /* cartes vendues inscrites dans config.js (« vendues ») : reprises tant que le Gist n'a pas ete enregistre depuis
     « vendues_le » ; le prochain enregistrement les recopie dans le Gist, qui fait foi ensuite */
  var CV = refs(C.vendues);
  function seed(s) {
    if (!CV.length || Date.parse(s.maj) > Date.parse(C.vendues_le)) return s;
    s.vendues = refs(s.vendues);
    CV.forEach(function (r) { if (s.vendues.indexOf(r) === -1) s.vendues.push(r); });
    s.reservees = refs(s.reservees).filter(function (r) { return CV.indexOf(r) === -1; });
    return s;
  }
  function readStatus() {
    if (!GIST) return Promise.resolve(seed({ reservees: [], vendues: [], prix: {} }));
    if (token()) return api('GET').then(function (g) { var f = g.files && g.files[GFILE]; return seed(parseStatus(f ? f.content : '{}')); });
    return fetch(RAW + '?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : '{}'; }).then(parseStatus).then(seed);
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

  /* ------------------------------------------------------------------ recherche eBay (ventes reussies)
     data/ebay.json : recherches preparees carte par carte dans l'Excel. Sinon, recherche construite sur le meme modele :
     nom anglais, numero (court et complet), langue, grade, exclusions (autres notations, reproductions, lots). */
  var EBQ = {};
  var EB_ALT = { Raichu: ['Pikachu'], Pikachu: ['Raichu'], Mew: ['Mewtwo'], Mewtwo: ['Mew'] };
  var EB_GRADERS = ['PSA', 'BGS', 'CGC', 'PCA', 'TAG', 'ARS', 'AGS'];
  var EB_LANG = { JP: '(Japanese,Japan,JP)', FR: '(FR,VF,Français,Française,French)', KR: '(Korean,Korea,KR)' };
  function loadEbay() {
    return fetch('data/ebay.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (d) { EBQ = (d && d.recherches) || {}; }).catch(function () {});
  }
  function ebayQuery(c) {
    if (EBQ[c.ref]) return EBQ[c.ref];
    var en = c.en || {}, words = [], excl = [];
    var slab = c.etat && c.etat.type && c.etat.type !== 'brute' && c.etat.type !== 'scelle';
    var sealed = c.etat && c.etat.type === 'scelle';
    var pk = (en.pokemons && en.pokemons[0]) || en.nom || c.nom_en || c.nom_fr;
    var dark = /^(Dark|Light) /.exec(en.nom || '');
    if (slab) words.push('"' + c.etat.libelle + '"');
    if (sealed) words.push((en.nom || c.nom_fr).replace(/\s*\(.*$/, ''));
    else if (c.langue === 'FR') words.push('(' + ((c.pokemons && c.pokemons[0]) || c.nom_fr) + ',' + pk + ')');
    else words.push(dark ? dark[1] + ' ' + pk : pk);
    var n = String(c.numero || '').split(' + ')[0];
    var m = /^0*(\d+|[A-Z]*\d+)\/(.+)$/.exec(n);
    if (sealed) { /* scelle : le nom suffit */ }
    else if (m) words.push('(' + n.split('/')[0] + ',' + n + ')');
    else if (en.variante) words.push('(' + en.variante.replace(/, old back$/, '').split(/\s+/).join(',') + ')');
    if (c.edition) words.push('(1st,1ED,First)');
    if (EB_LANG[c.langue]) words.push(EB_LANG[c.langue]);
    if (!dark && c.categorie === 'vintage') excl.push('Dark');
    (EB_ALT[pk] || []).forEach(function (x) { excl.push(x); });
    if (slab) EB_GRADERS.forEach(function (g) { if (g !== c.etat.type) excl.push(g); });
    else if (!sealed) excl = excl.concat(EB_GRADERS, ['graded', 'slab']);
    excl = excl.concat(['reprint', 'replica', 'proxy', 'custom']);
    if (!sealed) excl.push('lot');
    return words.join(' ') + ' ' + excl.map(function (x) { return '-' + x; }).join(' ');
  }
  function ebayUrl(c) {
    return 'https://www.ebay.fr/sch/i.html?_nkw=' + encodeURIComponent(ebayQuery(c)).replace(/%20/g, '+') + '&LH_Sold=1&LH_Complete=1';
  }

  /* ------------------------------------------------------------------ gestion */
  var G = d.getElementById('gestion');
  if (G) {
    var jet = d.getElementById('g-jeton'), info = G.querySelector('[data-gestion-info]');
    var save = G.querySelector('[data-gestion-save]'), forget = G.querySelector('[data-gestion-forget]');
    var q = d.getElementById('g-q'), list = G.querySelector('[data-gestion-list]'), count = G.querySelector('[data-gestion-count]');
    /* filtre « Prix sur demande » : seulement les cartes sans prix, pour leur en donner un vite */
    var askBtn = G.querySelector('[data-gestion-ask]'), askN = G.querySelector('[data-gestion-ask-n]'), askOnly = false;
    function isAsk(c) { return c.prix_eur === null || c.prix_eur === undefined; }
    var cards = [], byRef = {}, state = { reservees: [], vendues: [], prix: {} }, timer = null, loaded = false;
    var AN = window.PR_ANNONCE || null, anOpen = null;
    var MO = window.PR_MODIF || null, moOpen = null;
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
    /* carte en prix sur demande : premier prix publie dans la fiche (2 a 3 minutes), plus en direct ensuite */
    function askBox(c, wrap) {
      if (!MO || !MO.prix || !MO.modifiable(c)) {
        wrap.appendChild(el('span', 'muted small', 'Prix sur demande'));
        return wrap;
      }
      var w = MO.prixEnAttente(c);
      var box = el('span', 'prix-box');
      var inp = el('input');
      inp.type = 'text';
      inp.inputMode = 'decimal';
      inp.autocomplete = 'off';
      inp.spellcheck = false;
      inp.setAttribute('enterkeyhint', 'done');
      inp.setAttribute('aria-label', 'Prix en euros, réf. ' + c.ref);
      inp.placeholder = 'Prix';
      if (w) inp.value = num(w.v);
      var ok = el('button', '', 'Publier');
      ok.type = 'button';
      ok.disabled = true;
      box.appendChild(inp);
      box.appendChild(el('span', 'prix-box__eur', '€'));
      box.appendChild(ok);
      wrap.appendChild(box);
      var nt = el('p', 'prix-note' + (note.ref === K(c.ref) && note.warn ? ' is-warn' : ''), note.ref === K(c.ref) ? note.text :
        (w ? 'Prix de ' + eur0(w.v) + ' envoyé à ' + frTime(w.t) + ' : en ligne dans 2 à 3 minutes.' : 'Prix sur demande pour l’instant.'));
      nt.setAttribute('data-note', K(c.ref));
      nt.setAttribute('aria-live', 'polite');
      wrap.appendChild(nt);
      inp.addEventListener('input', function () {
        var v = parsePrice(inp.value);
        inp.setAttribute('aria-invalid', String(v === null && inp.value.trim() !== ''));
        ok.disabled = v === null;
      });
      function go() {
        var v = parsePrice(inp.value);
        if (v === null) return;
        ok.disabled = true;
        setNote(c.ref, 'Envoi…');
        MO.prix(c, v, render).then(function () {
          setNote(c.ref, '✓ Prix de ' + eur0(v) + ' enregistré à ' + frTime(Date.now()) + ' : la fiche passe à ce prix dans 2 à 3 minutes.');
          setInfo('Réf. ' + c.ref + ' : prix de ' + eur0(v) + ' envoyé.');
        }).catch(function (e) { ok.disabled = false; setNote(c.ref, e.message, true); });
      }
      ok.addEventListener('click', go);
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
      return wrap;
    }
    function priceBox(c) {
      var lp = livePrice(c.ref), cur = lp !== null ? lp : c.prix_eur;
      var wrap = el('div', 'prix-edit');
      if (c.prix_eur === null || c.prix_eur === undefined) return askBox(c, wrap);
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
        if (askOnly && !isAsk(c)) return;
        if (t && norm(c.ref + ' ' + label(c) + ' ' + (c.nom_en || '')).indexOf(t) === -1) return;
        var cur = statusOf(c.ref), lp = livePrice(c.ref);
        shown++;
        var li = el('li', 'sel-row sel-row--pic' + (lp !== null ? ' is-live-price' : ''));
        var pic = el('a', 'sel-pic' + (c.photo_t ? '' : ' sel-pic--none'));
        pic.href = 'cartes/' + c.slug + '.html';
        pic.target = '_blank';
        pic.rel = 'noopener';
        pic.setAttribute('aria-label', 'Voir la fiche ' + label(c) + ' (nouvel onglet)');
        if (c.photo_t) {
          var im = el('img');
          im.src = c.photo_t;
          im.alt = '';
          im.width = 48;
          im.height = 67;
          im.loading = 'lazy';
          im.decoding = 'async';
          pic.appendChild(im);
        } else pic.appendChild(el('span', 'sel-pic__top', c.ref));
        li.appendChild(pic);
        li.appendChild(el('span', 'sel-row__name', label(c)));
        li.appendChild(el('span', 'sel-row__meta', 'Réf. ' + c.ref + ' · ' + c.quantite + ' en stock' +
          (lp !== null ? ' · prix changé en direct (publié : ' + eur0(c.prix_eur) + ')' : '')));
        var where = AN ? AN.ou(c.ref) : [];
        if (where.length) {
          var gone = cur === 'vendue';
          li.appendChild(el('span', 'sel-row__meta annonce-ou' + (gone ? ' is-warn' : ''),
            (gone ? 'Vendue : annonce à retirer sur ' : 'Annonce postée sur ') + where.join(', ')));
        }
        var wait = MO ? MO.etiquette(c) : '';
        if (wait) li.appendChild(el('span', 'sel-row__meta modif-attente', wait));
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
        if (!/^L\d/.test(c.ref)) {   /* lots : pas de recherche unique */
          var eb = el('a', 'btn btn--ghost ebay-btn', 'Ventes eBay ↗');
          eb.href = ebayUrl(c);
          eb.target = '_blank';
          eb.rel = 'noopener noreferrer';
          eb.title = ebayQuery(c);
          eb.setAttribute('aria-label', 'Ventes réussies sur eBay pour ' + label(c) + ' (nouvel onglet)');
          ctrl.appendChild(eb);
        }
        li.appendChild(ctrl);
        if (AN) {
          var ab = el('button', 'btn btn--ghost annonce-btn', anOpen === c.ref ? 'Fermer l’annonce' : 'Annonce');
          ab.type = 'button';
          ab.setAttribute('aria-expanded', String(anOpen === c.ref));
          ab.addEventListener('click', function () { anOpen = anOpen === c.ref ? null : c.ref; render(); });
          ctrl.appendChild(ab);
          if (anOpen === c.ref) li.appendChild(AN.panel(c, c.prix_eur === null || c.prix_eur === undefined ? null : (lp !== null ? lp : c.prix_eur), function () { render(); titresEbay(); }));
        }
        if (MO) {
          var mb = el('button', 'btn btn--ghost modif-btn', moOpen === c.ref ? 'Fermer la modification' : 'Modifier');
          mb.type = 'button';
          mb.setAttribute('aria-expanded', String(moOpen === c.ref));
          mb.addEventListener('click', function () { moOpen = moOpen === c.ref ? null : c.ref; render(); });
          ctrl.appendChild(mb);
          if (moOpen === c.ref) li.appendChild(MO.panel(c, render));
        }
        list.appendChild(li);
      });
      var nAsk = cards.filter(isAsk).length;
      if (askN) askN.textContent = ' · ' + nAsk;
      if (askBtn) askBtn.hidden = !nAsk && !askOnly;
      if (askOnly) {
        count.textContent = shown + ' carte(s) en prix sur demande' + (t ? ' pour cette recherche' : '') + ' · tapez le prix puis « Publier »';
        return;
      }
      count.textContent = state.reservees.length + ' réservée(s) · ' + state.vendues.length + ' vendue(s) · ' + nPx +
        ' prix changé(s) en direct' + (t ? '' : ' · tapez une référence ou un nom pour trouver une carte');
    }
    /* titres eBay français + anglais (demande d'Arthur, 22/11/2026) : les annonces eBay à renommer, une ligne par carte
       avec son nouveau titre et « Copier ». Cartes cochées « Annonce postée sur eBay » sur cet appareil, sinon toutes les
       cartes en vente. « Titre changé sur eBay » reste coché tant que le titre ne bouge pas (pr.annonce.titres). */
    var TE = d.querySelector('[data-titres-ebay]');
    function faitsEbay() { try { return JSON.parse(localStorage.getItem('pr.annonce.titres') || '{}') || {}; } catch (e) { return {}; } }
    function listeEbay() {
      var enVente = cards.filter(function (c) { return statusOf(c.ref) !== 'vendue'; });
      var postees = enVente.filter(function (c) { return AN.ou(c.ref).indexOf('eBay') !== -1; });
      return { liste: postees.length ? postees : enVente, postees: postees.length };
    }
    function compteEbay() {
      var f = faitsEbay(), L = listeEbay().liste;
      var reste = L.filter(function (c) { return f[c.ref] !== AN.titreEbay(c, 80); }).length;
      TE.querySelector('[data-titres-ebay-n]').textContent = ' · ' + (reste ? reste + ' à changer' : 'tous à jour');
    }
    function titresEbay() {
      if (!TE || !AN || !AN.titreEbay || !loaded) return;
      compteEbay();
      if (!TE.open) return;
      var body = TE.querySelector('[data-titres-ebay-body]'), L = listeEbay(), f = faitsEbay();
      body.textContent = '';
      body.appendChild(el('p', 'muted small', (L.postees
        ? L.postees + ' carte(s) cochée(s) « Annonce postée sur eBay » sur cet appareil.'
        : 'Aucune carte cochée « Annonce postée sur eBay » sur cet appareil : toutes les cartes en vente.') +
        ' Dans eBay : Modifier l’annonce › Titre, collez, enregistrez, puis cochez la ligne ici.'));
      var ul = el('ul', 'titres-ebay');
      ul.setAttribute('role', 'list');
      L.liste.forEach(function (c) {
        var t = AN.titreEbay(c, 80), fait = f[c.ref] === t;
        var li = el('li', 'titre-ebay' + (fait ? ' is-fait' : ''));
        var tete = el('p', 'titre-ebay__tete');
        var nom = el('span', 'titre-ebay__nom', label(c));
        nom.setAttribute('translate', 'no');
        tete.appendChild(nom);
        tete.appendChild(el('span', 'titre-ebay__ref', 'Réf. ' + c.ref + ' · ' + t.length + ' / 80'));
        li.appendChild(tete);
        var val = el('p', 'annonce__val', t);
        val.setAttribute('translate', 'no');
        li.appendChild(val);
        var act = el('div', 'titre-ebay__act');
        var cp = el('button', 'annonce__copy', 'Copier');
        cp.type = 'button';
        cp.addEventListener('click', function () { AN.copier(t, cp); });
        act.appendChild(cp);
        var lab = el('label', 'check');
        var cb = el('input');
        cb.type = 'checkbox';
        cb.checked = fait;
        cb.addEventListener('change', function () {
          var g = faitsEbay();
          if (cb.checked) g[c.ref] = t; else delete g[c.ref];
          try { localStorage.setItem('pr.annonce.titres', JSON.stringify(g)); } catch (e) {}
          li.classList.toggle('is-fait', cb.checked);
          compteEbay();
        });
        lab.appendChild(cb);
        lab.appendChild(d.createTextNode(' Titre changé sur eBay'));
        act.appendChild(lab);
        li.appendChild(act);
        ul.appendChild(li);
      });
      body.appendChild(ul);
    }
    if (TE) TE.addEventListener('toggle', titresEbay);
    function load() {
      Promise.all([loadStock(G.getAttribute('data-stock')), readStatus(), loadEbay()]).then(function (r) {
        cards = r[0].cartes.slice().sort(function (a, b) { return (parseInt(a.ref, 10) || 1e6) - (parseInt(b.ref, 10) || 1e6) || a.ref.localeCompare(b.ref); });
        byRef = {};
        cards.forEach(function (c) { byRef[K(c.ref)] = c; });
        if (MO) MO.apprendre(cards);
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
        titresEbay();
      }).catch(function (e) { setInfo('Lecture impossible (' + e.message + ').'); });
    }
    q.addEventListener('input', render);
    if (askBtn) askBtn.addEventListener('click', function () {
      askOnly = !askOnly;
      askBtn.setAttribute('aria-pressed', String(askOnly));
      render();
    });
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

/* Gestion : clients et listes d'éclairs (comptes créés avec Google sur la page Mes éclairs).
   La liste n'est servie qu'au propriétaire du dépôt GitHub, reconnu avec la clé déjà enregistrée sur ce téléphone. */
(function () {
  'use strict';
  var d = document, box = d.querySelector('[data-clients]');
  if (!box) return;
  var body = box.querySelector('[data-clients-body]'), nb = box.querySelector('[data-clients-n]');
  var stock = null, charge = false;
  function el(t, c, x) { var e = d.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function cle() { try { return localStorage.getItem('pr.gestion.jeton') || ''; } catch (e) { return ''; } }
  function date(iso, heure) {
    if (!iso) return '';
    var t = new Date(iso);
    return t.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) + (heure ? ' ' + t.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '');
  }
  function prix(c) {
    if (!c) return 'plus en stock';
    if (c.prix_eur === null || c.prix_eur === undefined) return 'sur demande';
    var v = +c.prix_eur;
    return (v % 1 ? v.toFixed(2).replace('.', ',') : v) + ' €';
  }
  function ligne(ref, extra) {
    var c = stock[ref];
    var li = el('li', 'sel-row sel-row--pic');
    var a = el('a', 'sel-pic' + (c && c.photo_t ? '' : ' sel-pic--none'));
    if (c) { a.href = 'cartes/' + c.slug + '.html'; a.target = '_blank'; a.rel = 'noopener'; }
    if (c && c.photo_t) { var im = el('img'); im.src = c.photo_t; im.alt = ''; im.width = 48; im.height = 67; im.loading = 'lazy'; a.appendChild(im); }
    else a.appendChild(el('span', 'sel-pic__top', ref));
    li.appendChild(a);
    li.appendChild(el('span', 'sel-row__name', c ? c.titre : 'Réf. ' + ref));
    li.appendChild(el('span', 'sel-row__meta', 'Réf. ' + ref + (c && c.langue ? ' · ' + c.langue : '') + ' · ' + prix(c) + (extra ? ' · ' + extra : '')));
    return li;
  }
  function message(t) { body.textContent = ''; body.appendChild(el('p', 'muted small', t)); }
  function afficher(data) {
    var cl = data.clients || [];
    nb.textContent = ' · ' + cl.length;
    body.textContent = '';
    var tot = 0, comptes = {};
    cl.forEach(function (c) { c.eclairs.forEach(function (e) { tot++; comptes[e.ref] = (comptes[e.ref] || 0) + 1; }); });
    var tete = el('div', 'clients__tete');
    tete.appendChild(el('p', 'count', cl.length + ' client(s) · ' + tot + ' favori(s)'));
    var maj = el('button', 'linkbtn', 'Rafraîchir');
    maj.type = 'button';
    maj.addEventListener('click', charger);
    tete.appendChild(maj);
    body.appendChild(tete);
    var top = Object.keys(comptes).sort(function (a, b) { return comptes[b] - comptes[a] || (a < b ? -1 : 1); }).slice(0, 10);
    if (top.length) {
      body.appendChild(el('h3', 'clients__h', 'Les plus demandées'));
      var ul = el('ul', 'sel-list'); ul.setAttribute('role', 'list');
      top.forEach(function (r) { ul.appendChild(ligne(r, comptes[r] + ' client(s)')); });
      body.appendChild(ul);
    }
    body.appendChild(el('h3', 'clients__h', 'Fiches clients'));
    if (!cl.length) body.appendChild(el('p', 'muted small', 'Aucun compte pour l’instant.'));
    cl.forEach(function (c) {
      var det = el('details', 'client');
      var nom = ((c.prenom || '') + ' ' + (c.nom || '')).trim() || c.email;
      det.appendChild(el('summary', 'client__sum', nom + ' · ' + c.eclairs.length + ' favori(s) · depuis le ' + date(c.cree_le)));
      var info = el('p', 'client__info');
      var mail = el('a', '', c.email);
      mail.href = 'mailto:' + c.email + '?subject=' + encodeURIComponent('Poké-Raichu : vos favoris');
      info.appendChild(mail);
      info.appendChild(d.createTextNode(' · ' + (c.langue === 'en' ? 'anglais' : 'français') + ' · inscrit le ' + date(c.cree_le, true) + ' · vu le ' + date(c.vu_le, true)));
      det.appendChild(info);
      var ul = el('ul', 'sel-list'); ul.setAttribute('role', 'list');
      c.eclairs.forEach(function (e) { ul.appendChild(ligne(e.ref, 'ajoutée le ' + date(e.le))); });
      if (!c.eclairs.length) det.appendChild(el('p', 'muted small', 'Liste vide.'));
      det.appendChild(ul);
      body.appendChild(det);
    });
  }
  function charger() {
    if (!cle()) { message('Enregistrez d’abord votre clé GitHub en haut de la page.'); return; }
    message('Chargement…');
    var st = stock ? Promise.resolve() : fetch('data/stock.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (s) {
      stock = {}; (s.cartes || []).forEach(function (c) { stock[c.ref] = c; });
    });
    st.then(function () {
      return fetch('api/admin/clients', { headers: { 'x-gestion': cle(), accept: 'application/json' }, cache: 'no-store' });
    }).then(function (r) {
      if (r.status === 503) { message('Les comptes clients ne sont pas encore activés : il reste à relier la base Cloudflare (voir le message de Claude).'); return; }
      if (r.status === 401) { message('Clé GitHub refusée : la liste des clients est réservée au propriétaire du site.'); return; }
      if (!r.ok) { message('Liste indisponible pour le moment (' + r.status + '). Réessayez.'); return; }
      return r.json().then(afficher);
    }).catch(function () { message('Pas de réseau. Réessayez.'); });
  }
  box.addEventListener('toggle', function () { if (box.open && !charge) { charge = true; charger(); } });
})();
