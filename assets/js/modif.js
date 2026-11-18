/* Poké-Raichu · /gestion.html : modifier une fiche déjà en ligne (nom, état, Pokémon sur la carte).
   La modification est enregistrée dans le dépôt GitHub du site (_ajouts/modifs.json). Cloudflare reconstruit alors le site
   (_outils/construire.py, puis _outils/modifier.py) et la reporte dans toutes les pages FR et EN, en 2 à 3 minutes.
   La référence et l'adresse de la fiche ne changent jamais : étiquettes et QR codes restent valables.
   Clé : la même que pour les prix (stockée sur ce téléphone), avec l'accès « Contents: Read and write » au dépôt. */
(function () {
  'use strict';
  var d = document;
  var C = window.PR_CONFIG || {};
  var REPO = String(C.depot || '').trim();
  var BRANCH = String(C.depot_branche || 'main').trim();
  var URL_FILE = 'https://api.github.com/repos/' + REPO + '/contents/_ajouts/modifs.json';
  var ACTIF = /^[\w.-]+\/[\w.-]+$/.test(REPO);
  var ETATS = ['Near Mint', 'Excellent', 'Très bon état', 'Bon état', 'Abîmée'];
  var MAXPK = 4, ATTENTE_MAX = 20 * 60 * 1000;

  function el(tag, cls, text) { var e = d.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = text; return e; }
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function getJSON(k, dflt) { try { return JSON.parse(get(k) || 'null') || dflt; } catch (e) { return dflt; } }
  function token() { return get('pr.gestion.jeton') || ''; }
  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
  function clean(s, n) { return String(s || '').replace(/[\u0000-\u001f<>"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n || 80); }
  function b64utf8(s) { return btoa(unescape(encodeURIComponent(s))); }
  function unb64utf8(s) { return decodeURIComponent(escape(atob(String(s).replace(/\s/g, '')))); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function heure(t) { var x = new Date(t); return pad(x.getHours()) + 'h' + pad(x.getMinutes()); }

  /* --------------------------------------------------------------- GitHub : un seul fichier */
  function gh(method, body) {
    return fetch(URL_FILE + (method === 'GET' ? '?ref=' + encodeURIComponent(BRANCH) : ''), {
      method: method, cache: 'no-store',
      headers: { 'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (r.status === 404 && method === 'GET') return null;
      if (!r.ok) { var e = new Error('GitHub ' + r.status); e.status = r.status; throw e; }
      return r.json();
    });
  }
  function lire() {
    return gh('GET').then(function (f) {
      var o = null;
      if (f) { try { o = JSON.parse(unb64utf8(f.content)); } catch (e) { o = null; } }
      if (!o || typeof o.modifs !== 'object' || !o.modifs || Array.isArray(o.modifs)) o = { modifs: {} };
      return { data: o, sha: f ? f.sha : null };
    });
  }
  function ecrire(r, message) {
    var body = { message: message, branch: BRANCH, content: b64utf8(JSON.stringify(r.data, null, 1) + '\n') };
    if (r.sha) body.sha = r.sha;
    return gh('PUT', body);
  }
  function failMsg(e) {
    if (!token()) return 'Enregistrez d’abord votre clé GitHub en haut de la page.';
    if (e && e.status === 401) return 'Clé refusée par GitHub : elle a peut-être expiré. Créez-en une nouvelle et collez-la en haut de la page.';
    if (e && (e.status === 403 || e.status === 404)) return 'Votre clé n’a pas accès au dépôt « ' + REPO + ' ». Sur GitHub, modifiez la clé : Repository access → ce dépôt, et Contents → Read and write.';
    if (e && (e.status === 409 || e.status === 422)) return 'GitHub était occupé. Réessayez dans quelques secondes.';
    return 'Envoi impossible pour le moment (réseau ?). Rien n’a été modifié, réessayez.';
  }

  /* --------------------------------------------------------------- valeurs d'une fiche */
  var PK_EN = {};
  function apprendre(cards) {
    (cards || []).forEach(function (c) {
      (c.pokemons || []).forEach(function (p, i) { var e = c.en && c.en.pokemons ? c.en.pokemons[i] : null; if (e && !PK_EN[p]) PK_EN[p] = e; });
    });
  }
  function modifiable(c) { return (c.type === 'carte' || c.type === 'slab') && !c.lot && !c.groupe; }
  function brute(c) { return c.etat && c.etat.type === 'brute'; }
  function valeurs(c) {
    var v = { nom_fr: c.nom_fr, nom_en: (c.en && c.en.nom) || c.nom_en || c.nom_fr, pokemons: (c.pokemons || []).slice(),
      pokemons_en: ((c.en && c.en.pokemons) || c.pokemons || []).slice() };
    if (brute(c)) v.etat = c.etat.libelle; else v.cert = (c.etat && c.etat.cert) || '';
    return v;
  }
  function pareil(a, b) {
    return a.nom_fr === b.nom_fr && a.nom_en === b.nom_en && (a.etat || '') === (b.etat || '') && (a.cert || '') === (b.cert || '') &&
      a.pokemons.join('|') === b.pokemons.join('|') && a.pokemons_en.join('|') === b.pokemons_en.join('|');
  }
  /* modification envoyée, pas encore visible dans le stock publié */
  function attentes() { return getJSON('pr.modif.attente', {}); }
  function attente(c) {
    var all = attentes(), w = all[c.ref];
    if (!w || !w.v) return null;
    if (pareil(valeurs(c), w.v) || Date.now() - w.t > ATTENTE_MAX) { delete all[c.ref]; put('pr.modif.attente', JSON.stringify(all)); return null; }
    return w;
  }
  function noter(ref, v) { var all = attentes(); all[ref] = { t: Date.now(), v: v }; put('pr.modif.attente', JSON.stringify(all)); }
  function etiquette(c) { var w = attente(c); return w ? 'Modification envoyée à ' + heure(w.t) + ' : en ligne dans 2 à 3 minutes' : ''; }

  /* --------------------------------------------------------------- formulaire */
  var brouillons = {}, flash = {}, suivi = {};
  function panel(c, onChange) {
    var box = el('div', 'modif');
    box.appendChild(el('p', 'modif__t', 'Modifier la fiche · réf. ' + c.ref));
    if (!modifiable(c)) {
      box.appendChild(el('p', 'muted small', 'Les lots et les produits scellés ne se modifient pas depuis cette page : demandez à Claude.'));
      return box;
    }
    if (!ACTIF) {
      box.appendChild(el('p', 'muted small', 'Pas encore activé : il manque l’adresse du dépôt du site dans config.js (« depot »).'));
      return box;
    }
    var pub = valeurs(c), w = attente(c);
    var base = w ? w.v : pub;                       /* ce qui est (ou sera) en ligne */
    var cur = brouillons[c.ref] || JSON.parse(JSON.stringify(base));
    var id = 'm' + String(c.ref).toLowerCase().replace(/[^a-z0-9]/g, '') + '-';
    var slab = !brute(c);
    box.insertAdjacentHTML('beforeend',
      '<div class="field"><label for="' + id + 'nom">Nom de la carte</label><input class="input" id="' + id + 'nom" autocomplete="off" maxlength="80"></div>' +
      (slab
        ? '<div class="field"><label for="' + id + 'cert">N° de certificat</label><input class="input" id="' + id + 'cert" inputmode="numeric" autocomplete="off" maxlength="12"><p class="muted small" data-grade></p></div>'
        : '<div class="field"><label for="' + id + 'etat">État</label><select class="select" id="' + id + 'etat"></select></div>') +
      '<div class="field"><label for="' + id + 'pk">Pokémon sur la carte</label><div class="chips modif__pks" data-pks></div>' +
      '<div class="modif__add"><input class="input" id="' + id + 'pk" list="' + id + 'pkl" autocomplete="off" enterkeyhint="done" maxlength="40" placeholder="Ajouter un Pokémon"><button type="button" class="btn btn--ghost" data-pk-add>Ajouter</button></div>' +
      '<datalist id="' + id + 'pkl"></datalist><p class="muted small">' + MAXPK + ' personnages au plus. Touchez un nom pour le retirer. La carte apparaît dans la page et le filtre de chaque Pokémon.</p></div>' +
      '<details class="ajout-more"><summary>Version anglaise du site</summary><div class="field"><label for="' + id + 'nomen">Nom anglais de la carte</label><input class="input" id="' + id + 'nomen" autocomplete="off" maxlength="80"></div>' +
      '<div class="field"><label for="' + id + 'pken">Pokémon en anglais, dans le même ordre</label><input class="input" id="' + id + 'pken" autocomplete="off" maxlength="170"></div>' +
      '<p class="muted small">Séparez par une virgule. Les noms anglais déjà connus sont remplis tout seuls.</p></details>' +
      '<p class="ajout-err" data-err role="alert"></p>' +
      '<div class="actions"><button type="button" class="btn" data-go>Enregistrer</button><button type="button" class="linkbtn" data-reset>Annuler mes changements</button></div>' +
      '<p class="ajout-msg" data-msg aria-live="polite"></p>' +
      '<p class="muted small">La référence et l’adresse de la fiche ne changent pas : étiquettes et QR codes restent valables.</p>');
    function $(s) { return box.querySelector(s); }
    var nom = $('#' + id + 'nom'), nomen = $('#' + id + 'nomen'), pkIn = $('#' + id + 'pk'), pken = $('#' + id + 'pken');
    var etat = $('#' + id + 'etat'), cert = $('#' + id + 'cert'), pks = $('[data-pks]'), go = $('[data-go]');
    if (etat) ETATS.forEach(function (x) { var o = el('option', null, x); o.value = x; etat.appendChild(o); });
    if (slab) $('[data-grade]').textContent = 'Carte gradée ' + c.etat.libelle + ' : la note ne se change pas ici.';
    Object.keys(PK_EN).sort(function (a, b) { return norm(a) < norm(b) ? -1 : 1; }).forEach(function (p) { var o = d.createElement('option'); o.value = p; $('#' + id + 'pkl').appendChild(o); });

    function setErr(t) { $('[data-err]').textContent = t || ''; }
    function setMsg(t, cls) { var m = $('[data-msg]'); m.textContent = t || ''; m.className = 'ajout-msg' + (cls ? ' ' + cls : ''); }
    function drawPks() {
      pks.textContent = '';
      cur.pokemons.forEach(function (p, i) {
        var b = el('button', 'chip', p + ' ×');
        b.type = 'button';
        b.setAttribute('aria-label', 'Retirer ' + p);
        b.addEventListener('click', function () { cur.pokemons.splice(i, 1); cur.pokemons_en.splice(i, 1); pken.value = cur.pokemons_en.join(', '); drawPks(); garder(); });
        pks.appendChild(b);
      });
    }
    function remplir() {
      nom.value = cur.nom_fr; nomen.value = cur.nom_en; pken.value = cur.pokemons_en.join(', ');
      if (etat) etat.value = cur.etat;
      if (cert) cert.value = cur.cert || '';
      drawPks();
    }
    function garder() { lireChamps(); brouillons[c.ref] = cur; delete flash[c.ref]; setErr(''); }
    function lireChamps() {
      cur.nom_fr = clean(nom.value);
      cur.nom_en = clean(nomen.value);
      if (etat) cur.etat = etat.value;
      if (cert) cur.cert = String(cert.value).replace(/\D/g, '').slice(0, 12);
      var en = clean(pken.value, 170).split(/\s*,\s*/).map(function (p) { return clean(p, 40); }).filter(Boolean);
      if (en.length === cur.pokemons.length) cur.pokemons_en = en;
    }
    function ajouterPk() {
      var raw = clean(pkIn.value, 40);
      if (!raw) return;
      var hit = Object.keys(PK_EN).filter(function (k) { return norm(k) === norm(raw); })[0];
      var p = hit || raw.charAt(0).toUpperCase() + raw.slice(1);
      lireChamps();
      if (cur.pokemons.some(function (x) { return norm(x) === norm(p); })) { setErr(p + ' est déjà sur la fiche.'); return; }
      if (cur.pokemons.length >= MAXPK) { setErr(MAXPK + ' Pokémon au plus par fiche.'); return; }
      cur.pokemons.push(p);
      cur.pokemons_en.push(PK_EN[p] || p);
      pkIn.value = '';
      pken.value = cur.pokemons_en.join(', ');
      drawPks();
      garder();
      if (!PK_EN[p]) setMsg('« ' + p + ' » est nouveau sur le site : son nom anglais se règle dans « Version anglaise du site » (sinon le nom français est repris).', 'is-warn');
    }
    $('[data-pk-add]').addEventListener('click', ajouterPk);
    pkIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); ajouterPk(); } });
    pkIn.addEventListener('change', function () { if (PK_EN[clean(pkIn.value, 40)]) ajouterPk(); });
    [nom, nomen, pken, etat, cert].forEach(function (f) { if (f) f.addEventListener('input', garder); });
    /* nom français changé : le nom anglais suit s'il était identique, sinon la version anglaise s'ouvre pour le vérifier */
    var enTouche = false;
    nomen.addEventListener('input', function () { enTouche = true; });
    nom.addEventListener('input', function () {
      if (enTouche) return;
      if (base.nom_en === base.nom_fr) { nomen.value = nom.value; cur.nom_en = clean(nom.value); brouillons[c.ref] = cur; }
      else if (cur.nom_en === base.nom_en) $('details').open = true;
    });
    $('[data-reset]').addEventListener('click', function () {
      delete brouillons[c.ref];
      cur = JSON.parse(JSON.stringify(base));
      remplir(); setErr(''); setMsg('');
    });

    var busy = false;
    go.addEventListener('click', function () {
      if (busy) return;
      if (clean(pkIn.value, 40)) ajouterPk();
      lireChamps();
      setErr('');
      if (!cur.nom_fr) { setErr('Indiquez le nom de la carte.'); return; }
      if (!cur.nom_en) cur.nom_en = cur.nom_fr;
      if (pareil(cur, base)) { setMsg('Rien n’a changé sur cette fiche.'); return; }
      if (!token()) { setErr('Enregistrez d’abord votre clé GitHub en haut de la page.'); return; }
      busy = true; go.disabled = true;
      setMsg('Envoi…');
      var v = JSON.parse(JSON.stringify(cur));
      lire().then(function (r) {
        var m = { nom_fr: v.nom_fr, nom_en: v.nom_en, pokemons: v.pokemons, pokemons_en: v.pokemons_en, le: new Date().toISOString().slice(0, 10) };
        if (slab) m.cert = v.cert || null; else m.etat = v.etat;
        r.data.modifs[c.ref] = m;
        return ecrire(r, 'Modification de la fiche ' + c.ref + ' : ' + v.nom_fr);
      }).then(function () {
        busy = false; go.disabled = false;
        noter(c.ref, v);
        delete brouillons[c.ref];
        base = v;
        flash[c.ref] = { t: 'Enregistré à ' + heure(Date.now()) + '. Le site se met à jour : la fiche sera modifiée dans 2 à 3 minutes.', c: 'is-ok' };
        setMsg(flash[c.ref].t, 'is-ok');
        suivre(c, v, onChange);
      }).catch(function (err) {
        busy = false; go.disabled = false;
        setMsg('');
        setErr(failMsg(err));
      });
    });
    remplir();
    if (flash[c.ref]) setMsg(flash[c.ref].t, flash[c.ref].c);
    else if (w) setMsg(etiquette(c) + '.', 'is-ok');
    return box;
  }

  /* suivi de la mise en ligne : la fiche publiée finit par porter les nouvelles valeurs */
  function suivre(c, v, onChange) {
    var t0 = Date.now(), run = suivi[c.ref] = {};
    (function tick() {
      if (suivi[c.ref] !== run) return;
      fetch('data/stock.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (s) {
        var n = (s.cartes || []).filter(function (x) { return x.ref === c.ref; })[0];
        if (n && pareil(valeurs(n), v)) {
          Object.keys(n).forEach(function (k) { c[k] = n[k]; });
          apprendre([n]);
          flash[c.ref] = { t: '✓ En ligne : la fiche est à jour.', c: 'is-ok' };
          delete suivi[c.ref];
          attente(c);
          if (onChange) onChange();
          return;
        }
        if (Date.now() - t0 < 8 * 60 * 1000) setTimeout(tick, 15000);
        else { flash[c.ref] = { t: 'La mise à jour prend plus longtemps que prévu. Si la fiche n’a pas changé dans 10 minutes, envoyez une capture à Claude.', c: 'is-warn' }; if (onChange) onChange(); }
      }).catch(function () { if (Date.now() - t0 < 8 * 60 * 1000) setTimeout(tick, 15000); });
    })();
  }

  window.PR_MODIF = { panel: panel, apprendre: apprendre, etiquette: etiquette, modifiable: modifiable };
})();
