/* Poké-Raichu · pilotage (page privée /pilotage.html) : le contrôle de gestion de la boutique.
   - Données : un seul document JSON (cartes, tickets, lots, produits, paramètres, journal), lu et écrit sur /api/pilotage,
     réservé au vendeur (même clé GitHub que /gestion.html, déjà enregistrée sur le téléphone : pr.gestion.jeton).
     Rien de tout ça n'est dans le dépôt GitHub public.
   - Calculs : assets/js/pilotage-calcul.js (mêmes règles que l'Excel POKE-RAICHU).
   - Le site (data/stock.json, statuts du Gist) sert aux photos, aux liens et aux contrôles ; une vente enregistrée ici
     peut passer la carte en « Vendue » sur le site (même Gist que la page de gestion).
   - Premier import : lien #import=<id>.<clé> (fichier pilotage/import-<id>.bin chiffré en AES-GCM, la clé n'existe que
     dans le lien) ou sauvegarde .json. Export : Excel (.xlsx, assets/js/pilotage-xlsx.js) et sauvegarde .json.
   - Chaque enregistrement crée une version (60 gardées) : Réglages → Historique des versions pour revenir en arrière. */
(function () {
  'use strict';
  var d = document, w = window, C = w.PR_CONFIG || {}, K = w.PRCalcul;
  var CLE_JETON = 'pr.gestion.jeton', CLE_ATTENTE = 'pr.pilotage.attente', CLE_CANAL = 'pr.pilotage.canal';
  var CANAUX = ['WhatsApp', 'Instagram', 'eBay', 'Vinted', 'Leboncoin', 'Whatnot', 'Cardmarket', 'Salon', 'Dépôt-vente', 'Autre'];
  var MODES = [['', 'Pas de prix d’achat (coût estimé)'], ['ticket', 'Ticket japonais (¥, détaxe du ticket)'], ['yen', 'Prix en ¥ sans ticket'],
    ['eur', 'Montant payé en €'], ['lot', 'Part d’un lot (au prorata du prix marché)']];
  var LANGUES = [['JP', 'JP'], ['FR', 'FR'], ['KR', 'KR'], ['EN', 'EN'], ['CN', 'CN']];
  var TRIS = [['valeur', 'Prix ↓'], ['marge', 'Plus-value ↓'], ['gain', 'Rentabilité ↓'], ['cout', 'Coût ↓'], ['ref', 'N°'], ['nom', 'Nom A → Z'], ['vente', 'Dernières ventes']];
  var S = {
    doc: null, rev: 0, maj: null, R: null, vue: 'bord', arg: '', site: null, statuts: null,
    f: { q: '', statut: 'stock', groupe: '', cat: '', langue: '', tri: 'valeur', manque: false },
    sale: false, note: '', envoi: null, relancer: false, essais: 0, minuteur: null, tt: null, majListe: null
  };

  /* ---------------------------------------------------------------- outils */
  function q(s, r) { return (r || d).querySelector(s); }
  function ajouter(e, kids) {
    if (kids == null) return;
    (Array.isArray(kids) ? kids : [kids]).forEach(function (k) {
      if (k == null || k === false) return;
      e.appendChild(typeof k === 'string' || typeof k === 'number' ? d.createTextNode(String(k)) : k);
    });
  }
  function h(tag, a, kids) {
    var e = d.createElement(tag);
    if (a) Object.keys(a).forEach(function (k) {
      var v = a[k];
      if (v == null || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    ajouter(e, kids);
    return e;
  }
  function lire(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function ecrire(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function effacer(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function jeton() { return (lire(CLE_JETON) || '').trim(); }
  function norm(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function pl(n) { return n > 1 ? 's' : ''; }
  function z(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }
  function vide(v) { return v === null || v === undefined || (typeof v === 'number' && !isFinite(v)); }
  function uniques(l) { var o = {}; l.forEach(function (x) { if (x) o[x] = 1; }); return Object.keys(o).sort(function (a, b) { return a.localeCompare(b, 'fr'); }); }
  function cmpRef(a, b) {
    var na = /^\d+$/.test(a), nb = /^\d+$/.test(b);
    if (na && nb) return +a - +b;
    if (na) return -1;
    if (nb) return 1;
    return String(a).localeCompare(String(b), 'fr', { numeric: true });
  }
  function trouverCarte(doc, ref) { for (var i = 0; i < doc.cartes.length; i++) if (doc.cartes[i].ref === ref) return doc.cartes[i]; return null; }
  function nomGroupe(id) { var g = S.R && S.R.groupes.filter(function (x) { return x.id === id; })[0]; return g ? (g.nom || g.id) : (id || ''); }

  /* ---------------------------------------------------------------- formats (français) */
  var NF0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  var NF1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
  var NF2 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function moins(s) { return s.replace(/^-/, '−'); }
  function eur(v, dec) {
    if (vide(v)) return '—';
    var s = dec === 2 ? NF2.format(v) : dec === 0 ? NF0.format(v)
      : (Math.abs(v) >= 100 || Math.round(v * 100) % 100 === 0 ? NF0.format(Math.round(v)) : NF2.format(v));
    return moins(s) + ' €';
  }
  function eurS(v, dec) { return vide(v) ? '—' : (v >= 0.005 ? '+' : '') + eur(v, dec); }
  function pct(v) {
    if (vide(v)) return '—';
    var p = v * 100;
    return moins(Math.abs(p) < 10 && Math.round(p) !== p ? NF1.format(p) : NF0.format(p)) + ' %';
  }
  function yen(v) { return vide(v) ? '—' : NF0.format(v) + ' ¥'; }
  function nbr(v) { return vide(v) ? '—' : moins(NF0.format(v)); }
  function dateFR(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }
  function heure(iso) { var t = new Date(iso); return isNaN(t) ? '' : String(t.getHours()).padStart(2, '0') + 'h' + String(t.getMinutes()).padStart(2, '0'); }
  function quand(iso) { var t = new Date(iso); return isNaN(t) ? '' : dateFR(t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0')) + ' à ' + heure(iso); }
  function aujourdhui() { var t = new Date(); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); }
  function sens(v) { return vide(v) || Math.abs(v) < 0.005 ? '' : v > 0 ? 'pl-pos' : 'pl-neg'; }
  function fleche(v) { return vide(v) || Math.abs(v) < 0.005 ? '' : v > 0 ? '▲ ' : '▼ '; }
  function lireNombre(s) {
    s = String(s == null ? '' : s).replace(/[\s  €¥%]/g, '').replace(',', '.');
    if (s === '') return { ok: true, v: null };
    if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return { ok: false };
    var v = parseFloat(s);
    return isFinite(v) ? { ok: true, v: v } : { ok: false };
  }
  function texteNombre(v) { return vide(v) ? '' : String(Math.round(v * 100) / 100).replace('.', ','); }

  /* ---------------------------------------------------------------- serveur */
  function api(method, chemin, corps) {
    var en = { 'x-gestion': jeton() };
    if (corps) en['content-type'] = 'application/json';
    return fetch('/api/pilotage' + (chemin || ''), { method: method, cache: 'no-store', credentials: 'same-origin', headers: en, body: corps ? JSON.stringify(corps) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { s: r.status, j: j || {} }; }); });
  }
  function docValide(doc) { return !!doc && typeof doc === 'object' && doc.schema === 1 && Array.isArray(doc.cartes) && !!doc.params; }
  function installer(doc) {
    ['groupes', 'cartes', 'tickets', 'tickets_ecartes', 'lots', 'produits', 'journal'].forEach(function (k) { if (!Array.isArray(doc[k])) doc[k] = []; });
    doc.meta = doc.meta || {};
    S.doc = doc;
    calculer();
  }
  function calculer() { S.R = K.calcul(S.doc); }

  /* ---------------------------------------------------------------- enregistrement (une version par envoi) */
  function sync(etat, texte) {
    var p = q('[data-pl-sync]');
    if (!p) return;
    p.setAttribute('data-etat', etat);
    p.textContent = texte || ({ ok: 'Enregistré' + (S.maj ? ' · ' + heure(S.maj) : ''), attente: 'Modifié…', envoi: 'Enregistrement…', erreur: 'Pas de réseau · nouvel essai' })[etat] || '';
  }
  function memoAttente() { ecrire(CLE_ATTENTE, JSON.stringify({ base: S.rev, le: new Date().toISOString(), note: S.note, data: S.doc })); }
  function planifier(note) {
    S.sale = true;
    if (note) S.note = S.note ? S.note.slice(0, 120) + ' · ' + note : note;
    sync('attente');
    memoAttente();
    clearTimeout(S.minuteur);
    S.minuteur = setTimeout(enregistrer, 700);
  }
  function enregistrer() {
    clearTimeout(S.minuteur);
    if (S.envoi) { S.relancer = true; return; }
    if (!S.sale) return;
    S.sale = false;
    var note = S.note || 'Modification';
    S.note = '';
    sync('envoi');
    S.envoi = api('PUT', '', { base: S.rev, data: S.doc, note: note }).then(function (x) {
      S.envoi = null;
      if (x.s === 200) {
        S.rev = x.j.rev; S.maj = x.j.maj; S.essais = 0;
        if (S.sale) memoAttente(); else effacer(CLE_ATTENTE);
        sync('ok');
      } else if (x.s === 409) { conflit(); return; }
      else { S.sale = true; S.note = note + (S.note ? ' · ' + S.note : ''); if (x.s === 401) sync('erreur', 'Clé refusée'); else reessayer(); }
      if (S.relancer) { S.relancer = false; if (S.sale) enregistrer(); }
    }, function () {
      S.envoi = null; S.sale = true; S.note = note + (S.note ? ' · ' + S.note : '');
      reessayer();
    });
  }
  function reessayer() { S.essais++; sync('erreur'); clearTimeout(S.minuteur); S.minuteur = setTimeout(enregistrer, Math.min(60000, 4000 * S.essais)); }
  function conflit() {
    S.sale = false; S.note = '';
    effacer(CLE_ATTENTE);
    api('GET').then(function (x) {
      if (x.s !== 200 || !x.j.data) return;
      S.rev = x.j.rev; S.maj = x.j.maj;
      installer(x.j.data);
      rendre(true);
      sync('ok');
      alerte('Données modifiées ailleurs', 'Tes données ont changé sur un autre appareil ou un autre onglet. J’ai chargé la dernière version : refais ta dernière modification.');
    });
  }
  function reprendreAttente() {
    var t = lire(CLE_ATTENTE), a;
    if (!t) return;
    try { a = JSON.parse(t); } catch (e) { effacer(CLE_ATTENTE); return; }
    if (!a || !docValide(a.data)) { effacer(CLE_ATTENTE); return; }
    if (a.base !== S.rev) {
      confirmer('Modifications non enregistrées', 'Des modifications faites le ' + quand(a.le) + ' n’ont pas été enregistrées, mais tes données ont changé depuis. Elles ne peuvent pas être reprises.', 'Les jeter', function () { effacer(CLE_ATTENTE); }, true);
      return;
    }
    confirmer('Modifications non enregistrées', 'Des modifications faites le ' + quand(a.le) + ' (' + (a.note || 'sans titre') + ') n’ont pas été enregistrées, sans doute faute de réseau.', 'Les enregistrer', function () {
      installer(a.data); rendre(true); planifier(a.note || 'Modifications reprises');
    }, false, function () { effacer(CLE_ATTENTE); });
  }

  /* une modification = document changé, recalcul, affichage, enregistrement, et « Annuler » pendant 7 secondes */
  function modifier(note, fn, opts) {
    var avant = JSON.stringify(S.doc);
    try { fn(S.doc); } catch (e) { S.doc = JSON.parse(avant); calculer(); alerte('Modification impossible', String(e.message || e)); return false; }
    var j = S.doc.journal || (S.doc.journal = []);
    j.unshift({ le: new Date().toISOString(), quoi: note });
    if (j.length > 300) j.length = 300;
    calculer();
    planifier(note);
    if (!opts || !opts.sansRendu) rendre(true);
    toast(note, function () {
      S.doc = JSON.parse(avant); calculer(); planifier('Annulation : ' + note); rendre(true); toast('Modification annulée');
      if (opts && opts.annuler) opts.annuler();
    });
    return true;
  }

  /* ---------------------------------------------------------------- le site : fiches publiques et statuts en direct (Gist) */
  var RAW = String(C.statuts_url || '').trim();
  var GM = RAW.match(/^https:\/\/gist\.githubusercontent\.com\/[\w-]+\/([0-9a-f]+)\/raw\/(?:[0-9a-f]+\/)?([\w.-]+)$/i);
  var GIST = GM ? GM[1] : '', GFILE = GM ? GM[2] : 'statuts.json';
  function refsListe(a) { return Array.isArray(a) ? a.map(String) : []; }
  function parseStatut(t) { try { var o = typeof t === 'string' ? JSON.parse(t || '{}') : t; return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; } }
  var CV = refsListe(C.vendues);
  function semer(s) {
    s.vendues = refsListe(s.vendues); s.reservees = refsListe(s.reservees);
    if (!CV.length || Date.parse(s.maj) > Date.parse(C.vendues_le)) return s;
    CV.forEach(function (r) { if (s.vendues.indexOf(r) === -1) s.vendues.push(r); });
    s.reservees = s.reservees.filter(function (r) { return CV.indexOf(r) === -1; });
    return s;
  }
  function gist(method, body) {
    return fetch('https://api.github.com/gists/' + GIST, {
      method: method, cache: 'no-store',
      headers: { 'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + jeton(), 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) { if (!r.ok) throw new Error('GitHub ' + r.status); return r.json(); });
  }
  function lireStatuts() {
    if (!GIST) return Promise.resolve(semer({ reservees: [], vendues: [], prix: {} }));
    return gist('GET').then(function (g) { var f = g.files && g.files[GFILE]; return semer(parseStatut(f ? f.content : '{}')); }, function () {
      /* clé sans accès aux Gists : lecture du lien public */
      return fetch(RAW + '?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : '{}'; }).then(function (t) { return semer(parseStatut(t)); });
    });
  }
  function prixPropres(p) {
    var o = {};
    if (p && typeof p === 'object' && !Array.isArray(p)) Object.keys(p).forEach(function (k) {
      var v = +p[k], r = String(k).trim().toUpperCase();
      if (/^[A-Z0-9]{1,12}$/.test(r) && isFinite(v) && v > 0 && v < 1e6) o[r] = Math.round(v * 100) / 100;
    });
    return o;
  }
  /* passe une fiche du site en « vendue » ou « disponible » (même format que /gestion.html) */
  function statutSite(ref, etat) {
    if (!GIST) return Promise.reject(new Error('statuts_url manquant dans config.js'));
    return lireStatuts().then(function (s) {
      s.vendues = s.vendues.filter(function (r) { return r !== ref; });
      s.reservees = s.reservees.filter(function (r) { return r !== ref; });
      if (etat === 'vendue') s.vendues.push(ref);
      s.maj = new Date().toISOString();
      var files = {};
      files[GFILE] = { content: JSON.stringify({ maj: s.maj, reservees: s.reservees, vendues: s.vendues, prix: prixPropres(s.prix) }, null, 1) };
      return gist('PATCH', { files: files }).then(function () { S.statuts = s; return s; });
    });
  }
  function chargerSite() {
    var a = fetch('data/stock.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    var b = lireStatuts().catch(function () { return null; });
    return Promise.all([a, b]).then(function (x) {
      var m = {};
      if (x[0] && Array.isArray(x[0].cartes)) x[0].cartes.forEach(function (c) { m[c.ref] = c; });
      S.site = x[0] ? m : null;
      S.statuts = x[1];
      if (S.doc) rendre(true);
    });
  }
  function rafraichirSite() { lireStatuts().then(function (s) { S.statuts = s; rendre(true); }, function () {}); }
  function siteRefDe(c) {
    if (!S.site) return null;
    if (S.site[c.ref]) return c.ref;
    var a = (c.alias_site || []).filter(function (r) { return S.site[r]; });
    return a[0] || null;
  }
  function siteCarte(c) { var r = siteRefDe(c); return r ? S.site[r] : null; }
  function prixSite(ref) {
    var p = S.statuts && S.statuts.prix ? +S.statuts.prix[ref] : NaN;
    if (isFinite(p) && p > 0) return p;
    var sc = S.site && S.site[ref];
    return sc && typeof sc.prix_eur === 'number' ? sc.prix_eur : null;
  }
  function etatSite(ref) {
    if (!S.statuts || !ref) return null;
    if (S.statuts.vendues.indexOf(ref) !== -1) return 'vendue';
    if (S.statuts.reservees.indexOf(ref) !== -1) return 'réservée';
    return 'en vente';
  }

  /* contrôles qui croisent la compta et le site */
  function controlesSite() {
    if (!S.site || !S.statuts || !S.R) return null;
    var vend = {}, res = {};
    S.statuts.vendues.forEach(function (r) { vend[r] = 1; });
    S.statuts.reservees.forEach(function (r) { res[r] = 1; });
    var parSite = {}, parLot = {}, produits = {};
    S.R.cartes.forEach(function (r) {
      [r.c.ref].concat(r.c.alias_site || []).forEach(function (x) { (parSite[x] = parSite[x] || []).push(r); });
      (r.c.lots_site || []).forEach(function (x) { (parLot[x] = parLot[x] || []).push(r); });
    });
    S.R.produits.forEach(function (x) { (x.p.refs_site || []).forEach(function (rf) { produits[rf] = x; }); });
    var out = { a_saisir: [], encore: [], absentes: [], prix: [], reservees: [] };
    Object.keys(S.site).sort(cmpRef).forEach(function (rf) {
      var sc = S.site[rf], vendue = !!vend[rf];
      if (res[rf]) out.reservees.push({ rf: rf, sc: sc });
      if (parSite[rf]) {
        parSite[rf].forEach(function (r) {
          if (r.hors) return;
          if (vendue && !r.c.vendu) out.a_saisir.push({ rf: rf, sc: sc, r: r });
          if (!vendue && r.c.vendu) out.encore.push({ rf: rf, sc: sc, r: r });
          var p = prixSite(rf);
          if (!vendue && !r.c.vendu && !vide(r.c.prix) && !vide(p) && Math.abs(p - r.c.prix) >= 0.5) out.prix.push({ rf: rf, sc: sc, r: r, p: p });
        });
      } else if (parLot[rf]) {
        var reste = parLot[rf].filter(function (r) { return !r.c.vendu; });
        if (vendue && reste.length) out.a_saisir.push({ rf: rf, sc: sc, lot: reste });
        if (!vendue && !reste.length) out.encore.push({ rf: rf, sc: sc, lot: parLot[rf] });
      } else if (!produits[rf]) out.absentes.push({ rf: rf, sc: sc });
    });
    return out;
  }
  function nbAlertes() { var c = controlesSite(); return c ? c.a_saisir.length + c.encore.length : 0; }

  /* ---------------------------------------------------------------- éléments d'interface */
  function principal() { var m = q('[data-pl-main]'); m.textContent = ''; return m; }
  function chargement(t) { var m = principal(); masquerOnglets(); m.appendChild(h('p', { class: 'pl-attente', text: t })); }
  function masquerOnglets() { var n = q('[data-pl-tabs]'); if (n) n.hidden = true; }
  function bouton(texte, fn, cls) { return h('button', { type: 'button', class: 'btn' + (cls ? ' ' + cls : ''), onclick: fn, text: texte }); }
  function lienBtn(texte, fn, cls) { return h('button', { type: 'button', class: 'linkbtn' + (cls ? ' ' + cls : ''), onclick: fn, text: texte }); }
  function entete(titre, sous, actions) {
    return h('div', { class: 'pl-head' }, [h('div', null, [h('h1', { text: titre }), sous ? h('p', { text: sous }) : null]), actions ? h('div', null, actions) : null]);
  }
  function section(titre, kids, note) {
    return h('section', { class: 'pl-sec' }, [h('h2', { text: titre }), note ? h('p', { class: 'pl-note', text: note }) : null].concat(kids));
  }
  function tuile(label, valeur, sous, cls) {
    return h('div', { class: 'pl-kpi' }, [h('p', { class: 'pl-label', text: label }), h('p', { class: 'pl-kpi__v' + (cls ? ' ' + cls : ''), text: valeur }), sous ? h('p', { class: 'pl-kpi__s', text: sous }) : null]);
  }
  function badge(texte, type) { return h('span', { class: 'pl-badge' + (type ? ' pl-badge--' + type : ''), text: texte }); }
  /* barres horizontales classées : une seule couleur, valeur écrite au bout de chaque barre */
  function barres(items, nom) {
    var max = 0;
    items.forEach(function (x) { max = Math.max(max, Math.abs(x.v)); });
    return h('ul', { class: 'pl-bars', 'aria-label': nom }, items.map(function (x) {
      var s = h('span');
      s.style.width = (max ? Math.abs(x.v) / max * 100 : 0) + '%';
      return h('li', { class: 'pl-bar' }, [
        h('span', { class: 'pl-bar__l' }, [x.l, x.s ? h('small', { text: x.s }) : null]),
        h('span', { class: 'pl-bar__t' + (x.v < 0 ? ' pl-bar__t--neg' : ''), 'aria-hidden': 'true' }, s),
        h('span', { class: 'pl-bar__v', text: x.txt })
      ]);
    }));
  }
  function tableau(cols, lignes, total, legende) {
    var t = h('table', { class: 'pl-table' });
    if (legende) t.appendChild(h('caption', { class: 'sr-only', text: legende }));
    t.appendChild(h('thead', null, h('tr', null, cols.map(function (c) { return h('th', { scope: 'col', text: c.t }); }))));
    t.appendChild(h('tbody', null, lignes.map(function (l) {
      return h('tr', null, cols.map(function (c, i) { return h(i ? 'td' : 'th', i ? (c.cls ? { class: c.cls(l) } : null) : { scope: 'row' }, c.f(l)); }));
    })));
    if (total) t.appendChild(h('tfoot', null, h('tr', null, cols.map(function (c) { return h('td', null, c.f(total)); }))));
    return h('div', { class: 'pl-scroll' }, t);
  }
  function details(titre, n, contenu, ouvert) {
    var dt = h('details', { class: 'pl-det' }, [h('summary', null, [h('span', null, [titre, n != null ? ' ' : null, n != null ? h('span', { class: 'pl-badge' + (n ? '' : ' pl-badge--ok'), text: n ? String(n) : '✓ 0' }) : null])]), h('div', { class: 'pl-det__b' }, contenu)]);
    if (ouvert) dt.open = true;
    return dt;
  }
  /* photo d'une carte, dans cet ordre :
     1) sa fiche sur le site (photo réelle de la carte) ;
     2) la fiche du site d'un autre exemplaire identique (même nom exact) ;
     3) l'image officielle de la carte (base Limitless TCG, d'après le code du set et le numéro) ;
     sinon (ou si l'image ne charge pas) : le n° de la carte. */
  var CDN = 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/';
  function identite(nom) { return norm(nom).replace(/[^a-z0-9/]+/g, ' ').trim(); }
  function indexPhotos() {
    if (!S.site) return null;
    if (S.idxPhotos && S.idxPhotos.site === S.site) return S.idxPhotos.m;
    var m = {};
    Object.keys(S.site).sort(cmpRef).forEach(function (r) { var sc = S.site[r]; if (sc.photo_t || sc.photo) { var k = identite(sc.titre); if (!m[k]) m[k] = sc; } });
    S.idxPhotos = { site: S.site, m: m };
    return m;
  }
  function imageOfficielle(c, grande) {
    var m = /^([A-Za-z0-9]+(?:-[A-Za-z0-9]+)?)\s*·/.exec(c.set || ''), n = /(\d{1,3})\s*\/\s*[A-Za-z0-9-]+/.exec(c.nom || '');
    if (!m || !n) return null;
    var code = m[1], num = +n[1], t = grande ? 'LG' : 'SM';
    if (/^(Gym|neo\d|PMCG\d|PCG\d|VS|e\d)$/i.test(code)) return null;
    if (/^s\d/.test(code)) code = 'S' + code.slice(1);
    else if (/^sm\d/.test(code)) code = 'SM' + code.slice(2);
    if (c.langue === 'FR' || c.langue === 'EN') {
      if (!/^[A-Z]{2,4}$/.test(code)) return null;
      return CDN + 'tpci/' + code + '/' + code + '_' + String(num).padStart(3, '0') + '_R_EN_' + t + '.png';
    }
    return CDN + 'tpc/' + code + '/' + code + '_' + num + '_R_JP_' + t + '.png';
  }
  function photoCarte(c, grande) {
    var sc = siteCarte(c);
    if (sc && (sc.photo_t || sc.photo)) return { src: grande ? (sc.photo_xs || sc.photo) : (sc.photo_t || sc.photo), type: 'site' };
    var ix = indexPhotos(), o = ix && ix[identite(c.nom)];
    if (o) return { src: grande ? (o.photo_xs || o.photo) : (o.photo_t || o.photo), type: 'identique', ref: o.ref };
    var off = imageOfficielle(c, grande);
    return off ? { src: off, type: 'officielle' } : null;
  }
  function imageCarte(c, grande, attrs) {
    var ph = photoCarte(c, grande);
    if (!ph) return null;
    var img = h('img', Object.assign({ src: ph.src, alt: '', decoding: 'async' }, attrs || {}));
    if (ph.type === 'officielle') img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', function () {
      var b = h('b', { text: c.ref });
      if (img.parentNode) img.parentNode.replaceChild(b, img);
    });
    return { el: img, type: ph.type, ref: ph.ref };
  }
  function vignette(c) {
    var im = imageCarte(c, false, { loading: 'lazy', width: '44', height: '61' });
    return h('span', { class: 'pl-row__img' }, im ? im.el : h('b', { text: c.ref }));
  }
  function ligneCarte(r, opts) {
    var c = r.c, nums = [], meta = [c.ref, c.groupe, c.cat, c.langue];
    if (c.vendu) {
      meta.push(c.vente_date ? 'vendue le ' + dateFR(c.vente_date) : 'vendue', c.canal);
      nums.push(h('span', { class: 'pl-row__prix', text: eur(r.encaisse) }));
      if (r.vente) nums.push(h('span', { class: 'pl-row__m ' + sens(r.vente.net), text: fleche(r.vente.net) + eurS(r.vente.net) }));
      else nums.push(badge('Vendue', 'vendu'));
    } else {
      nums.push(h('span', { class: 'pl-row__prix', text: vide(c.prix) ? 'Prix ?' : eur(c.prix) }));
      if (!vide(r.latent)) nums.push(h('span', { class: 'pl-row__m ' + sens(r.latent), text: fleche(r.latent) + eurS(r.latent) + (r.gain != null ? ' · ' + pct(r.gain) : '') }));
      if (r.source === 'estimé') meta.push('coût estimé');
      if (c.gardee) meta.push('gardée');
    }
    if (opts && opts.extra) meta.push(opts.extra);
    return h('li', null, h('a', { class: 'pl-row', href: '#carte/' + encodeURIComponent(c.ref) }, [
      vignette(c),
      h('span', { class: 'pl-row__main' }, [h('span', { class: 'pl-row__nom', text: c.nom || c.ref }), h('span', { class: 'pl-row__meta', text: meta.filter(Boolean).join(' · ') })]),
      h('span', { class: 'pl-row__nums' }, nums)
    ]));
  }
  function toast(texte, annuler) {
    var t = q('[data-pl-toast]');
    if (!t) return;
    t.textContent = '';
    t.appendChild(h('span', { text: texte }));
    if (annuler) t.appendChild(h('button', { type: 'button', class: 'pl-toast__b', text: 'Annuler', onclick: function () { t.hidden = true; annuler(); } }));
    t.hidden = false;
    clearTimeout(S.tt);
    S.tt = setTimeout(function () { t.hidden = true; }, annuler ? 7000 : 3500);
  }

  /* feuille (boîte de dialogue en bas de l'écran sur téléphone) */
  function feuille(titre, corps, actions) {
    var dlg = q('[data-pl-sheet]');
    if (dlg.open) dlg.close();
    dlg.textContent = '';
    var f = h('form', { class: 'pl-sheet__f', novalidate: true });
    f.appendChild(h('header', { class: 'pl-sheet__h' }, [h('h2', { id: 'pl-sheet-t', text: titre }), h('button', { type: 'button', class: 'pl-x', 'aria-label': 'Fermer', onclick: fermer, text: '×' })]));
    var b = h('div', { class: 'pl-sheet__b' }, corps);
    f.appendChild(b);
    if (actions) f.appendChild(h('footer', { class: 'pl-sheet__a' }, actions));
    dlg.appendChild(f);
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    b.scrollTop = 0;
    return { dlg: dlg, form: f, corps: b };
  }
  function fermer() { var dlg = q('[data-pl-sheet]'); if (!dlg) return; if (typeof dlg.close === 'function') { if (dlg.open) dlg.close(); } else dlg.removeAttribute('open'); }
  function alerte(titre, texte) { feuille(titre, [h('p', { text: texte })], [bouton('OK', fermer)]); }
  function confirmer(titre, texte, ok, fn, danger, nonFn) {
    var fs = feuille(titre, [h('p', { text: texte })], [bouton(nonFn ? 'Les jeter' : 'Annuler', function () { fermer(); if (nonFn) nonFn(); }, 'btn--ghost'), h('button', { type: 'submit', class: 'btn', text: ok })]);
    fs.form.addEventListener('submit', function (e) { e.preventDefault(); fermer(); fn(); });
    if (danger) fs.form.querySelector('[type="submit"]').classList.add('btn--ghost');
  }

  /* formulaires : champs texte, nombre (virgule acceptée), date, liste, case à cocher, champs conditionnels */
  function formulaire(defs, init) {
    var champs = {}, blocs = {}, el = h('div', { class: 'pl-form' });
    defs.forEach(function (df) {
      var v = init ? init[df.k] : null, id = 'pl-f-' + df.k, input, bloc;
      if (df.type === 'check') {
        input = h('input', { type: 'checkbox', id: id, name: df.k });
        input.checked = !!v;
        bloc = h('label', { class: 'pl-check' }, [input, ' ' + df.label]);
      } else {
        if (df.type === 'select') {
          input = h('select', { class: 'select', id: id, name: df.k }, df.options.map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
          var sv = v == null ? '' : String(v);
          input.value = sv;
          if (input.value !== sv) { input.appendChild(h('option', { value: sv, text: sv })); input.value = sv; }
        } else if (df.type === 'textarea') {
          input = h('textarea', { class: 'input pl-ta', id: id, name: df.k, rows: '3' });
          input.value = v || '';
        } else {
          input = h('input', { class: 'input', id: id, name: df.k, type: df.type === 'date' ? 'date' : 'text', inputmode: df.type === 'num' ? 'decimal' : null,
            autocomplete: 'off', list: df.list || null, placeholder: df.ph || null, autocapitalize: df.type === 'num' ? 'off' : null });
          input.value = v == null ? '' : (df.type === 'num' ? texteNombre(v) : String(v));
        }
        bloc = h('div', { class: 'field' + (df.demi ? ' pl-demi' : '') }, [h('label', { for: id, text: df.label }), input,
          df.aide ? h('p', { class: 'pl-aide', text: df.aide }) : null, h('p', { class: 'field-err', 'data-err': df.k, hidden: true })]);
      }
      champs[df.k] = input; blocs[df.k] = bloc;
      el.appendChild(bloc);
    });
    function conditions() {
      defs.forEach(function (df) { if (df.si) blocs[df.k].hidden = df.si[1].indexOf(champs[df.si[0]].value) === -1; });
    }
    defs.forEach(function (df) { if (df.si) champs[df.si[0]].addEventListener('change', conditions); });
    conditions();
    function erreur(k, msg) {
      var p = el.querySelector('[data-err="' + k + '"]');
      if (p) { p.textContent = msg; p.hidden = false; }
      if (champs[k]) { champs[k].setAttribute('aria-invalid', 'true'); champs[k].focus(); }
      return false;
    }
    return {
      el: el, champs: champs, erreur: erreur,
      lire: function () {
        var out = {}, premiere = null;
        Array.prototype.forEach.call(el.querySelectorAll('.field-err'), function (p) { p.hidden = true; });
        defs.forEach(function (df) {
          var i = champs[df.k];
          i.removeAttribute('aria-invalid');
          if (blocs[df.k].hidden) { out[df.k] = null; return; }
          if (df.type === 'check') { out[df.k] = i.checked; return; }
          if (df.type === 'num') {
            var n = lireNombre(i.value);
            if (!n.ok) { if (!premiere) premiere = [df.k, 'Nombre illisible : écris par exemple 12,50.']; out[df.k] = null; return; }
            out[df.k] = n.v;
          } else { var s = i.value.trim(); out[df.k] = s === '' ? null : s; }
          if (df.req && (out[df.k] == null) && !premiere) premiere = [df.k, 'À remplir.'];
        });
        if (premiere) { erreur(premiere[0], premiere[1]); return null; }
        return out;
      }
    };
  }

  /* ---------------------------------------------------------------- navigation */
  var VUES = {};
  var ONGLET = { bord: 'bord', stock: 'stock', carte: 'stock', ventes: 'ventes', analyse: 'analyse' };
  var SECONDAIRE = { achats: 'achats', ticket: 'achats', lots: 'lots', scelle: 'scelle', controles: 'controles', reglages: 'reglages' };
  function retour(defaut, texte) {
    return h('a', { class: 'pl-back', href: defaut, text: '‹ ' + texte, onclick: function (e) { if (S.precedent) { e.preventDefault(); history.back(); } } });
  }
  function route() {
    S.precedent = S.courant != null && S.courant !== location.hash ? S.courant : null;
    S.courant = location.hash;
    var hs = decodeURIComponent(location.hash.replace(/^#/, ''));
    var i = hs.indexOf('/'), vue = i === -1 ? hs : hs.slice(0, i), arg = i === -1 ? '' : hs.slice(i + 1);
    if (!VUES[vue]) vue = 'bord';
    S.vue = vue; S.arg = arg;
    rendre(false);
  }
  function rendre(garder) {
    if (!S.doc || !S.R) return;
    var m = q('[data-pl-main]'), y = w.scrollY, a = d.activeElement;
    var fk = a && a.getAttribute ? a.getAttribute('data-focus') : null, s0 = null, s1 = null;
    if (fk) { try { s0 = a.selectionStart; s1 = a.selectionEnd; } catch (e) {} }
    m.textContent = '';
    S.majListe = null;
    VUES[S.vue](m, S.arg);
    var tabs = q('[data-pl-tabs]');
    tabs.hidden = false;
    var actif = ONGLET[S.vue] || 'plus';
    var second = SECONDAIRE[S.vue];
    Array.prototype.forEach.call(tabs.querySelectorAll('a'), function (x) {
      var v = x.getAttribute('data-vue'), sec = x.hasAttribute('data-sec');
      if ((!sec && v === actif && !(second && d.documentElement.clientWidth >= 1000)) || (sec && v === second)) x.setAttribute('aria-current', 'page'); else x.removeAttribute('aria-current');
    });
    var n = nbAlertes(), b = q('[data-pl-alertes]');
    if (b) { b.hidden = !n; b.textContent = n ? String(n) : ''; }
    if (fk) {
      var e = m.querySelector('[data-focus="' + fk + '"]');
      if (e) { try { e.focus({ preventScroll: true }); if (s0 != null) e.setSelectionRange(s0, s1); } catch (err) {} }
    }
    w.scrollTo(0, garder ? y : 0);
  }
  function majTexte() { return S.maj ? 'Données du ' + quand(S.maj) + ' · version ' + S.rev : ''; }

  /* ---------------------------------------------------------------- tableau de bord */
  VUES.bord = function (m) {
    var R = S.R, k = R.k, st = R.stock;
    m.appendChild(entete('Tableau de bord', majTexte()));
    m.appendChild(h('section', { class: 'pl-hero' }, [
      h('p', { class: 'pl-label', text: 'Bénéfice net réalisé' }),
      h('p', { class: 'pl-hero__v', text: eurS(k.benef) }),
      h('p', { class: 'pl-hero__s', text: nbr(k.vendus) + ' vente' + pl(k.vendus) + ' · ' + eur(k.encaisse) + ' encaissés · rentabilité ' + pct(k.rentab) })
    ]));
    m.appendChild(section('Ventes', [h('div', { class: 'pl-kpis' }, [
      tuile('Encaissé', eur(k.encaisse), nbr(k.vendus) + ' article' + pl(k.vendus) + ' vendu' + pl(k.vendus)),
      tuile('Rentabilité', pct(k.rentab), 'bénéfice ÷ coût d’achat'),
      tuile('Taux de marque', pct(k.taux_marque), 'bénéfice ÷ prix de vente'),
      tuile('Prix moyen', eur(k.prix_moyen), 'par article vendu')
    ])]));
    var p = k.pct_recupere == null ? 0 : Math.max(0, Math.min(1, k.pct_recupere));
    var jauge = h('div', { class: 'pl-meter', role: 'img', 'aria-label': pct(k.pct_recupere) + ' de l’investissement récupéré' }, h('span'));
    jauge.firstChild.style.width = (p * 100) + '%';
    m.appendChild(section('Ton argent', [h('div', { class: 'pl-box' }, [
      h('p', { class: 'pl-big', text: k.reste > 0 ? pct(k.pct_recupere) + ' de ton investissement est déjà revenu' : 'Ton investissement est remboursé' }),
      jauge,
      h('dl', { class: 'pl-dl' }, [
        h('dt', { text: 'Investi (prix d’achat réels)' }), h('dd', { text: eur(k.investi) }),
        h('dt', { text: 'Revenu (encaissé − frais)' }), h('dd', { text: eur(k.recupere) }),
        h('dt', { text: k.reste > 0 ? 'Reste à récupérer' : 'Gagné en plus' }), h('dd', { text: eur(Math.abs(k.reste)) })
      ]),
      h('p', { class: 'pl-note', text: 'Si tout le stock part au prix marché, le résultat final serait d’environ ' + eurS(k.resultat_projete) + ' (bénéfice déjà réalisé + plus-value du stock).' })
    ])]));
    m.appendChild(section('Stock', [h('div', { class: 'pl-kpis' }, [
      tuile('Valeur marché', eur(st.valeur), st.sans_prix ? st.sans_prix + ' carte' + pl(st.sans_prix) + ' sans prix non comptée' + pl(st.sans_prix) : 'au prix marché actuel'),
      tuile('Coût du stock', eur(st.cout_reel + st.cout_estime), 'dont ' + eur(st.cout_estime) + ' estimés'),
      tuile('Plus-value latente', eurS(st.latent), 'si tout se vend au prix marché', sens(st.latent)),
      tuile('En stock', nbr(st.cartes) + ' cartes', st.unites ? '+ ' + nbr(st.unites) + ' unités (boosters, ex, card sets, coffret)' : null)
    ])]));
    var pg = st.par_groupe.filter(function (g) { return g.valeur > 0; }).sort(function (a, b) { return b.valeur - a.valeur; });
    if (pg.length) m.appendChild(section('Valeur du stock par groupe', [barres(pg.map(function (g) {
      return { l: g.libelle, s: nbr(g.nb) + (g.produit ? ' unité' : ' carte') + pl(g.nb), v: g.valeur, txt: eur(g.valeur) };
    }), 'Valeur du stock par groupe')], 'Prix marché des cartes et produits encore en stock.'));
    var vg = R.ventes.filter(function (v) { return v.vendus > 0; }).sort(function (a, b) { return b.net - a.net; });
    if (vg.length) m.appendChild(section('Bénéfice réalisé par groupe', [barres(vg.map(function (v) {
      return { l: v.libelle, s: nbr(v.vendus) + ' vendu' + pl(v.vendus) + ' · ' + eur(v.encaisse) + ' encaissés', v: v.net, txt: eurS(v.net) };
    }), 'Bénéfice réalisé par groupe')]));
    var al = alertes();
    m.appendChild(section('À surveiller', [al.length ? h('ul', { class: 'pl-alertes' }, al.map(function (a) {
      return h('li', null, h('a', { class: 'pl-alerte', href: '#controles' }, [h('span', { class: 'pl-alerte__n', text: nbr(a[0]) }), h('span', { text: a[1] })]));
    })) : h('p', { class: 'pl-box', text: 'Rien à signaler.' })], S.site ? null : 'Les contrôles avec le site s’afficheront dès que ses données seront chargées.'));
    m.appendChild(section('Synthèse comme dans l’Excel', [syntheseTable(), details('Par catégorie', null, [categoriesTable()])]));
  };
  function alertes() {
    var c = S.R.controles, cs = controlesSite(), out = [];
    if (cs) {
      if (cs.a_saisir.length) out.push([cs.a_saisir.length, 'vente' + pl(cs.a_saisir.length) + ' faite' + pl(cs.a_saisir.length) + ' sur le site, pas encore saisie' + pl(cs.a_saisir.length) + ' ici']);
      if (cs.encore.length) out.push([cs.encore.length, 'carte' + pl(cs.encore.length) + ' vendue' + pl(cs.encore.length) + ' ici mais encore en vente sur le site']);
      if (cs.prix.length) out.push([cs.prix.length, 'prix du site différent' + pl(cs.prix.length) + ' du prix marché']);
      if (cs.absentes.length) out.push([cs.absentes.length, 'fiche' + pl(cs.absentes.length) + ' du site absente' + pl(cs.absentes.length) + ' de la compta']);
    }
    if (c.tickets_ecart.length) out.push([c.tickets_ecart.length, 'ticket' + pl(c.tickets_ecart.length) + ' dont les cartes ne font pas le total']);
    if (c.sans_prix.length) out.push([c.sans_prix.length, 'carte' + pl(c.sans_prix.length) + ' en stock sans prix marché']);
    if (c.sans_paye.length) out.push([c.sans_paye.length, 'carte' + pl(c.sans_paye.length) + ' sans prix d’achat (coût estimé)']);
    if (c.a_perte.length) out.push([c.a_perte.length, 'carte' + pl(c.a_perte.length) + ' en stock sous son coût']);
    return out;
  }
  function syntheseTable() {
    var R = S.R;
    return tableau([
      { t: 'Groupe', f: function (l) { return l.libelle; } },
      { t: 'Nb', f: function (l) { return nbr(l.nb); } },
      { t: 'Payé', f: function (l) { return eur(l.paye, 2); } },
      { t: 'Valeur marché', f: function (l) { return eur(l.valeur, 2); } },
      { t: 'Marge nette', f: function (l) { return eur(l.marge, 2); }, cls: function (l) { return sens(l.marge); } },
      { t: 'Gain', f: function (l) { return pct(l.gain); } }
    ], R.synthese, R.synthTotal, 'Synthèse par groupe');
  }
  function categoriesTable() {
    var t = h('table', { class: 'pl-table' }, [h('caption', { class: 'sr-only', text: 'Synthèse par catégorie' }),
      h('thead', null, h('tr', null, ['Catégorie', 'Nb', 'Payé', 'Valeur', 'Marge', 'Gain'].map(function (x) { return h('th', { scope: 'col', text: x }); })))]);
    var tb = h('tbody');
    S.R.categories.forEach(function (g) {
      tb.appendChild(h('tr', { class: 'pl-tot' }, [h('td', { colspan: '6', text: g.groupe.nom || g.groupe.id })]));
      g.lignes.forEach(function (l) {
        tb.appendChild(h('tr', null, [h('th', { scope: 'row', text: l.cat }), h('td', { text: nbr(l.nb) }), h('td', { text: eur(l.paye, 2) }), h('td', { text: eur(l.valeur, 2) }), h('td', { class: sens(l.marge), text: eur(l.marge, 2) }), h('td', { text: pct(l.gain) })]));
      });
    });
    t.appendChild(tb);
    return h('div', { class: 'pl-scroll' }, t);
  }

  /* ---------------------------------------------------------------- stock */
  function cartesFiltrees() {
    var f = S.f, mots = norm(f.q).trim().split(/\s+/).filter(Boolean);
    return S.R.cartes.filter(function (r) {
      var c = r.c;
      if (f.statut === 'stock' && !r.stock) return false;
      if (f.statut === 'vendues' && !c.vendu) return false;
      if (f.groupe && c.groupe !== f.groupe) return false;
      if (f.cat && (c.cat || '') !== f.cat) return false;
      if (f.langue && c.langue !== f.langue) return false;
      if (f.manque && !(vide(c.prix) || r.paye == null)) return false;
      if (mots.length) {
        var t = r._q || (r._q = norm([c.ref, c.nom, c.nom_en, c.set, c.nom_ticket, c.groupe, c.cat, c.etat, c.langue, c.boutique, c.ticket, c.remarque, c.canal].join(' ')));
        for (var i = 0; i < mots.length; i++) if (t.indexOf(mots[i]) === -1) return false;
      }
      return true;
    });
  }
  function trier(l, tri) {
    var cle = {
      valeur: function (r) { return r.c.vendu ? r.encaisse : r.c.prix; },
      marge: function (r) { return r.c.vendu ? (r.vente ? r.vente.net : null) : r.latent; },
      gain: function (r) { return r.c.vendu ? (r.vente ? r.vente.rentab : null) : r.gain; },
      cout: function (r) { return r.cout; }
    }[tri];
    if (cle) return l.sort(function (a, b) {
      var x = cle(a), y = cle(b);
      if (vide(x) && vide(y)) return cmpRef(a.ref, b.ref);
      if (vide(x)) return 1;
      if (vide(y)) return -1;
      return y - x || cmpRef(a.ref, b.ref);
    });
    if (tri === 'nom') return l.sort(function (a, b) { return (a.c.nom || '').localeCompare(b.c.nom || '', 'fr'); });
    if (tri === 'vente') return l.sort(function (a, b) { return (b.c.vente_date || '').localeCompare(a.c.vente_date || '') || b.i - a.i; });
    return l.sort(function (a, b) { return cmpRef(a.ref, b.ref); });
  }
  VUES.stock = function (m) {
    var R = S.R, f = S.f, limite = 120;
    m.appendChild(entete('Stock', nbr(R.stock.cartes) + ' cartes en stock · ' + eur(R.stock.valeur) + ' au prix marché',
      [h('button', { type: 'button', class: 'btn pl-btn-s', onclick: function () { feuilleCarte(null); }, text: '+ Ajouter' })]));
    var champ = h('input', { class: 'input', type: 'search', placeholder: 'Nom, n°, set, nom japonais…', 'aria-label': 'Chercher une carte',
      autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'search', 'data-focus': 'q' });
    champ.value = f.q;
    champ.addEventListener('input', function () { f.q = champ.value; limite = 120; maj(); });
    m.appendChild(h('div', { class: 'pl-search' }, champ));
    var chips = h('div', { class: 'pl-chips', role: 'group', 'aria-label': 'Afficher' });
    [['stock', 'En stock'], ['vendues', 'Vendues'], ['toutes', 'Toutes']].forEach(function (x) {
      chips.appendChild(h('button', { type: 'button', class: 'chip', 'aria-pressed': String(f.statut === x[0]), onclick: function () { f.statut = x[0]; if (x[0] === 'vendues') f.tri = 'vente'; else if (f.tri === 'vente') f.tri = 'valeur'; rendre(true); }, text: x[1] }));
    });
    chips.appendChild(h('button', { type: 'button', class: 'chip chip--raichu', 'aria-pressed': String(f.manque), onclick: function () { f.manque = !f.manque; rendre(true); }, text: 'À compléter' }));
    m.appendChild(chips);
    function sel(k, label, options) {
      var s = h('select', { class: 'select', 'aria-label': label, 'data-focus': 'f-' + k }, options.map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
      s.value = f[k];
      s.addEventListener('change', function () { f[k] = s.value; limite = 120; maj(); });
      return s;
    }
    var groupes = [['', 'Tous les groupes']].concat(R.groupes.map(function (g) { return [g.id, g.nom || g.id]; }));
    var cats = [['', 'Toutes catégories']].concat(uniques(R.cartes.map(function (r) { return r.c.cat; })).map(function (c) { return [c, c]; }));
    var langues = [['', 'Toutes langues']].concat(uniques(R.cartes.map(function (r) { return r.c.langue; })).map(function (l) { return [l, l]; }));
    m.appendChild(h('div', { class: 'pl-filtres' }, [sel('groupe', 'Groupe', groupes), sel('cat', 'Catégorie', cats), sel('langue', 'Langue', langues), sel('tri', 'Trier', TRIS)]));
    var resume = h('p', { class: 'pl-resume', 'aria-live': 'polite' });
    var liste = h('ul', { class: 'pl-rows' });
    var plus = h('button', { type: 'button', class: 'btn btn--ghost pl-plus', text: 'Afficher la suite' });
    plus.addEventListener('click', function () { limite += 300; maj(); });
    m.appendChild(resume); m.appendChild(liste); m.appendChild(plus);
    function maj() {
      var l = trier(cartesFiltrees(), f.tri), val = 0, cout = 0, lat = 0, enc = 0, net = 0;
      l.forEach(function (r) { if (r.c.vendu) { enc += z(r.encaisse); net += r.vente ? r.vente.net : 0; } else { val += z(r.c.prix); cout += z(r.cout); lat += z(r.latent); } });
      var t = nbr(l.length) + ' carte' + pl(l.length);
      if (f.statut === 'vendues') t += ' · ' + eur(enc) + ' encaissés · bénéfice ' + eurS(net);
      else t += ' · valeur ' + eur(val) + ' · coût ' + eur(cout) + ' · plus-value ' + eurS(lat);
      resume.textContent = t;
      liste.textContent = '';
      liste.hidden = !l.length;
      l.slice(0, limite).forEach(function (r) { liste.appendChild(ligneCarte(r)); });
      plus.hidden = l.length <= limite;
    }
    S.majListe = maj;
    maj();
  };

  /* ---------------------------------------------------------------- fiche d'une carte */
  function decrireAchat(r) {
    var c = r.c, a = c.achat || {}, P = S.R.params;
    if (a.mode === 'ticket') {
      var T = S.R.ticketsParId[a.ticket];
      if (!T) return ['Ticket ' + (a.ticket || '?') + ' introuvable : coût non calculé.'];
      return [h('span', null, ['Ticket ', h('a', { href: '#ticket/' + encodeURIComponent(T.id), text: T.id }), ' · ' + (T.t.boutique || 'boutique non indiquée') + (T.t.date ? ' · ' + dateFR(T.t.date) : '')]),
        yen(c.yen) + (T.ratio != null && T.ratio < 1 ? ' − détaxe ' + pct(1 - T.ratio) : '') + ' ÷ ' + nbr(P.taux) + ' ¥ par € = ' + eur(r.paye, 2)];
    }
    if (a.mode === 'yen') return ['Prix en yens, sans ticket : ' + yen(c.yen) + ' ÷ ' + nbr(P.taux) + ' ¥ par € = ' + eur(r.paye, 2)];
    if (a.mode === 'lot') {
      var L = S.R.lotsParId[a.lot];
      return [h('span', null, [h('a', { href: '#lots', text: a.lot || 'Lot' }), L ? ' · payé ' + yen(L.l.paye_yen) + ' = ' + eur(L.paye_eur, 2) + ', réparti au prorata du prix marché : ' + eur(c.prix) + ' sur ' + eur(L.prix_total) + ' → ' + eur(r.paye, 2) : ' introuvable'])];
    }
    if (a.mode === 'eur') return ['Payé ' + eur(a.eur, 2) + (a.formule ? ' (calcul de l’Excel : ' + a.formule.replace(/^=/, '') + ')' : '')];
    return ['Pas de prix d’achat : coût estimé = ' + (c.vendu ? 'prix de vente' : 'prix marché') + ' ÷ ' + NF2.format(1 + P.tva + P.rent) + ' = ' + eur(r.estime, 2) + ' (rentabilité retenue de ' + pct(P.rent) + ', réglable dans Réglages).'];
  }
  VUES.carte = function (m, ref) {
    var r = S.R.parRef[ref], P = S.R.params;
    m.appendChild(retour('#stock', 'Retour'));
    if (!r) { m.appendChild(h('p', { class: 'pl-box', text: 'Carte introuvable : ' + ref })); return; }
    var c = r.c, sc = siteCarte(c), sref = siteRefDe(c), es = etatSite(sref);
    var im = imageCarte(c, true);
    var legende = im ? ({ site: 'Photo du site', identique: 'Photo d’un exemplaire identique (N° ' + im.ref + ')', officielle: 'Image officielle de la carte' })[im.type] : null;
    var fc = h('figcaption', { text: legende });
    if (im) im.el.addEventListener('error', function () { fc.textContent = 'Pas encore de photo'; });
    m.appendChild(h('div', { class: 'pl-fiche' }, [
      im ? h('figure', { class: 'pl-fiche__fig' }, [h('div', { class: 'pl-fiche__img' }, im.el), fc]) : null,
      h('div', null, [h('h1', { text: c.nom || c.ref }),
        h('p', { class: 'pl-fiche__ref', text: ['N° ' + c.ref, nomGroupe(c.groupe), c.cat, c.langue, c.etat].filter(Boolean).join(' · ') }),
        h('div', { class: 'pl-badges' }, [
          c.vendu ? badge('Vendue' + (c.vente_date ? ' le ' + dateFR(c.vente_date) : ''), 'vendu') : r.hors ? badge('Hors totaux (dans le coffret)') : badge('En stock', 'ok'),
          c.gardee ? badge('Gardée', 'garde') : null,
          r.source === 'estimé' ? badge('Coût estimé', 'estime') : null,
          es ? badge(es === 'vendue' ? 'Vendue sur le site' : es === 'réservée' ? 'Réservée sur le site' : 'En vente sur le site' + (prixSite(sref) ? ' · ' + eur(prixSite(sref)) : ''), es === 'en vente' ? 'ok' : 'vendu') : null
        ])])
    ]));
    if (c.vendu && r.vente) {
      m.appendChild(section('Vente', [h('div', { class: 'pl-kpis' }, [
        tuile('Prix de vente', eur(r.vente.encaisse, 2), [dateFR(c.vente_date), c.canal].filter(Boolean).join(' · ') || null),
        tuile(r.source === 'estimé' ? 'Coût estimé' : 'Coût d’achat', eur(r.vente.cout, 2), 'frais d’envoi ' + eur(r.vente.envoi, 2)),
        tuile('Bénéfice net', eurS(r.vente.net, 2), null, sens(r.vente.net)),
        tuile('Rentabilité', pct(r.vente.rentab))
      ]), c.vente_note ? h('p', { class: 'pl-note', text: c.vente_note }) : null]));
    } else {
      m.appendChild(section('Chiffres', [h('div', { class: 'pl-kpis' }, [
        tuile('Prix marché', eur(c.prix, 2)),
        tuile(r.source === 'estimé' ? 'Coût estimé' : 'Coût d’achat', eur(r.cout, 2)),
        tuile('Plus-value', eurS(r.latent, 2), 'si vendue au prix marché', sens(r.latent)),
        tuile('Rentabilité', pct(r.gain), r.source === 'estimé' ? 'pas de prix d’achat réel' : null)
      ])]));
    }
    m.appendChild(section('Achat', [h('div', { class: 'pl-box' }, decrireAchat(r).map(function (x) { return h('p', { class: 'pl-calc' }, x); }))]));
    var infos = [['Nom anglais', c.nom_en], ['Set', c.set], ['Rareté', c.rarete], ['État', c.etat], ['Nom sur le ticket', c.nom_ticket], ['Prix sur le ticket', c.yen != null ? yen(c.yen) : null],
      ['Boutique', c.boutique], ['Date d’achat', dateFR(c.date_achat)], ['Ticket', c.ticket], ['Vérification', c.verif], ['Remarque', c.remarque],
      ['Lots du site', (c.lots_site || []).join(', ')], ['Autre n° sur le site', (c.alias_site || []).join(', ')]].filter(function (x) { return x[1]; });
    var liens = [];
    if (sc) liens.push(h('a', { href: 'cartes/' + sc.slug + '.html', target: '_blank', rel: 'noopener', text: 'Fiche sur le site ↗' }));
    if (c.ebay) liens.push(h('a', { href: 'https://www.ebay.fr/sch/i.html?_nkw=' + encodeURIComponent(c.ebay).replace(/%20/g, '+') + '&LH_Sold=1&LH_Complete=1', target: '_blank', rel: 'noopener', text: 'Ventes réussies eBay ↗' }));
    m.appendChild(section('Informations', [h('div', { class: 'pl-box' }, [h('dl', { class: 'pl-dl pl-dl--infos' }, [].concat.apply([], infos.map(function (x) { return [h('dt', { text: x[0] }), h('dd', { text: x[1] })]; }))),
      liens.length ? h('p', { class: 'pl-liens' }, liens) : null])]));
    var act = [];
    if (!r.hors) act.push(c.vendu ? bouton('Annuler la vente', function () { feuilleAnnulerVente(c.ref); }, 'btn--ghost') : bouton('Enregistrer la vente', function () { feuilleVente(c.ref); }));
    act.push(bouton('Modifier', function () { feuilleCarte(c.ref); }, 'btn--ghost'));
    m.appendChild(h('div', { class: 'pl-actions' }, act));
    m.appendChild(h('p', { class: 'pl-note' }, [
      lienBtn(c.gardee ? 'Ne plus la garder' : 'Je la garde (pour moi)', function () {
        modifier((c.gardee ? 'Plus gardée · ' : 'Gardée · ') + c.nom, function (doc) { var x = trouverCarte(doc, c.ref); x.gardee = !x.gardee; });
      }), ' · ',
      lienBtn('Supprimer de la compta', function () {
        confirmer('Supprimer la carte ?', 'La carte N° ' + c.ref + ' (' + c.nom + ') sera retirée de la compta. Tu pourras annuler juste après, et l’historique garde les anciennes versions.', 'Supprimer', function () {
          location.hash = '#stock';
          modifier('Carte supprimée · N° ' + c.ref + ' ' + c.nom, function (doc) { doc.cartes = doc.cartes.filter(function (x) { return x.ref !== c.ref; }); });
        });
      }, 'pl-danger')
    ]));
  };

  /* ---------------------------------------------------------------- vendre / annuler une vente */
  function feuilleVente(ref, opts) {
    var r = S.R.parRef[ref];
    if (!r) return;
    var c = r.c, P = S.R.params, sref = siteRefDe(c), es = etatSite(sref);
    var form = formulaire([
      { k: 'prix', label: 'Prix de vente (€)', type: 'num', demi: true, req: true },
      { k: 'date', label: 'Date', type: 'date', demi: true },
      { k: 'canal', label: 'Vendue où ?', type: 'select', options: [['', '—']].concat(CANAUX.map(function (x) { return [x, x]; })) },
      { k: 'note', label: 'Note (facultatif)', type: 'text', ph: 'Acheteur, remise, lot…' }
    ], { prix: opts && opts.prix != null ? opts.prix : c.prix, date: aujourdhui(), canal: lire(CLE_CANAL) || '' });
    var apercu = h('p', { class: 'pl-apercu', 'aria-live': 'polite' });
    var caseSite = null;
    if (sref && GIST && es !== 'vendue') { caseSite = h('input', { type: 'checkbox' }); caseSite.checked = true; }
    function calc() {
      var v = lireNombre(form.champs.prix.value).v;
      if (vide(v)) { apercu.textContent = 'Indique le prix de vente.'; return; }
      var cout = (r.paye != null ? r.paye : v * (1 - P.fv) / ((1 + P.tva) + P.rent)) * (1 + P.tva);
      var net = v * (1 - P.fv) - cout - P.envoi;
      apercu.textContent = 'Bénéfice net ' + eurS(net, 2) + (cout ? ' · rentabilité ' + pct(net / cout) : '') + (r.paye == null ? ' (coût estimé)' : '') + ' · frais d’envoi de ' + eur(P.envoi, 2) + ' déduits';
    }
    form.champs.prix.addEventListener('input', calc);
    calc();
    var fs = feuille('Enregistrer la vente', [h('p', { class: 'pl-note', text: c.nom + ' · N° ' + c.ref + (vide(c.prix) ? '' : ' · prix marché ' + eur(c.prix, 2)) }), form.el, apercu,
      caseSite ? h('label', { class: 'pl-check' }, [caseSite, ' Passer aussi la carte en « Vendue » sur pokeraichu.com']) : null],
      [bouton('Annuler', fermer, 'btn--ghost'), h('button', { type: 'submit', class: 'btn', text: 'Enregistrer' })]);
    fs.form.addEventListener('submit', function (e) {
      e.preventDefault();
      var x = form.lire();
      if (!x) return;
      if (x.prix < 0) { form.erreur('prix', 'Le prix ne peut pas être négatif.'); return; }
      ecrire(CLE_CANAL, x.canal || '');
      var site = caseSite && caseSite.checked;
      fermer();
      modifier('Vente · ' + c.nom + ' (N° ' + c.ref + ') · ' + eur(x.prix, 2), function (doc) {
        var cc = trouverCarte(doc, ref);
        cc.vendu = true; cc.prix_vendu = x.prix; cc.vente_date = x.date || aujourdhui(); cc.canal = x.canal || null;
        if (x.note) cc.vente_note = x.note; else delete cc.vente_note;
      }, { annuler: site ? function () { statutSite(sref, 'disponible').then(function () { rendre(true); }, function () {}); } : null });
      if (site) statutSite(sref, 'vendue').then(function () { rendre(true); }, function (err) {
        alerte('Site pas mis à jour', 'La vente est enregistrée ici, mais la carte n’a pas pu passer en « Vendue » sur le site (' + err.message + '). Fais-le depuis la page Gestion.');
      });
    });
  }
  function feuilleAnnulerVente(ref) {
    var r = S.R.parRef[ref];
    if (!r) return;
    var c = r.c, sref = siteRefDe(c), caseSite = null;
    if (sref && GIST && etatSite(sref) === 'vendue') { caseSite = h('input', { type: 'checkbox' }); caseSite.checked = true; }
    var fs = feuille('Annuler la vente', [h('p', { text: '« ' + c.nom + ' » redevient en stock et sa vente (' + eur(r.encaisse, 2) + ') sort des totaux.' }),
      caseSite ? h('label', { class: 'pl-check' }, [caseSite, ' Remettre aussi la carte « Disponible » sur le site']) : null],
      [bouton('Garder la vente', fermer, 'btn--ghost'), h('button', { type: 'submit', class: 'btn', text: 'Annuler la vente' })]);
    fs.form.addEventListener('submit', function (e) {
      e.preventDefault();
      var site = caseSite && caseSite.checked;
      fermer();
      modifier('Vente annulée · ' + c.nom + ' (N° ' + c.ref + ')', function (doc) {
        var cc = trouverCarte(doc, ref);
        cc.vendu = false; cc.prix_vendu = null; cc.vente_date = null; cc.canal = null; delete cc.vente_note;
      }, { annuler: site ? function () { statutSite(sref, 'vendue').then(function () { rendre(true); }, function () {}); } : null });
      if (site) statutSite(sref, 'disponible').then(function () { rendre(true); }, function (err) {
        alerte('Site pas mis à jour', 'La vente est annulée ici, mais la carte n’a pas pu redevenir disponible sur le site (' + err.message + ').');
      });
    });
  }

  /* ---------------------------------------------------------------- ajouter ou modifier une carte */
  function prochainNumero() {
    var max = 0;
    S.doc.cartes.forEach(function (c) { if (/^\d+$/.test(c.ref)) max = Math.max(max, +c.ref); });
    if (S.site) Object.keys(S.site).forEach(function (r) { if (/^\d+$/.test(r)) max = Math.max(max, +r); });
    return String(max + 1).padStart(3, '0');
  }
  function feuilleCarte(ref, depart) {
    var c = ref ? trouverCarte(S.doc, ref) : null;
    var nouveau = !c;
    var a = (c && c.achat) || {};
    var init = c ? {
      ref: c.ref, langue: c.langue || 'JP', nom: c.nom, groupe: c.groupe, cat: c.cat, prix: c.prix, etat: c.etat, mode: a.mode || '', yen: c.yen,
      ticket: a.ticket || c.ticket, eur: a.eur, lot: a.lot, boutique: c.boutique, date_achat: c.date_achat, nom_en: c.nom_en, rarete: c.rarete, set: c.set,
      nom_ticket: c.nom_ticket, ebay: c.ebay, verif: c.verif, remarque: c.remarque, gardee: c.gardee
    } : Object.assign({ ref: prochainNumero(), langue: 'JP', groupe: 'Cartes', mode: '' }, depart || {});
    var tickets = [['', '—']].concat(S.doc.tickets.map(function (t) { return [t.id, t.id + ' · ' + (t.boutique || '') + (t.date ? ' · ' + dateFR(t.date) : '')]; }));
    var lots = [['', '—']].concat(S.doc.lots.map(function (l) { return [l.id, l.id]; }));
    var groupes = S.R.groupes.map(function (g) { return [g.id, g.nom || g.id]; });
    var defs = [
      { k: 'ref', label: 'N°', type: 'text', demi: true, req: true, aide: nouveau ? 'Le même numéro que sur le site.' : null },
      { k: 'langue', label: 'Langue', type: 'select', demi: true, options: LANGUES },
      { k: 'nom', label: 'Nom', type: 'text', req: true, ph: 'Raichu 074/071' },
      { k: 'groupe', label: 'Groupe', type: 'select', demi: true, options: groupes },
      { k: 'cat', label: 'Catégorie', type: 'text', demi: true, list: 'pl-cats', ph: 'SAR, AR, PSA 10…' },
      { k: 'prix', label: 'Prix marché (€)', type: 'num', demi: true },
      { k: 'etat', label: 'État', type: 'text', demi: true, ph: 'Near Mint, PSA 10…' },
      { k: 'mode', label: 'Prix d’achat', type: 'select', options: MODES },
      { k: 'yen', label: 'Prix en ¥', type: 'num', demi: true, si: ['mode', ['ticket', 'yen']] },
      { k: 'ticket', label: 'Ticket', type: 'select', demi: true, options: tickets, si: ['mode', ['ticket']] },
      { k: 'eur', label: 'Payé (€)', type: 'num', demi: true, si: ['mode', ['eur']] },
      { k: 'lot', label: 'Lot', type: 'select', demi: true, options: lots, si: ['mode', ['lot']] },
      { k: 'boutique', label: 'Boutique', type: 'text', demi: true },
      { k: 'date_achat', label: 'Date d’achat', type: 'date', demi: true },
      { k: 'nom_en', label: 'Nom anglais', type: 'text', demi: true },
      { k: 'rarete', label: 'Rareté', type: 'text', demi: true },
      { k: 'set', label: 'Set', type: 'text' },
      { k: 'nom_ticket', label: 'Nom sur le ticket (japonais)', type: 'text' },
      { k: 'ebay', label: 'Recherche eBay (ventes réussies)', type: 'text', ph: '"PSA 10" Raichu (074,074/071) -Pikachu' },
      { k: 'verif', label: 'Vérification', type: 'text' },
      { k: 'remarque', label: 'Remarque', type: 'textarea' },
      { k: 'gardee', label: 'Je la garde pour moi (retirée des totaux si « Sans » est choisi dans Réglages)', type: 'check' }
    ];
    var form = formulaire(defs, init);
    var dl = h('datalist', { id: 'pl-cats' }, uniques(S.doc.cartes.map(function (x) { return x.cat; })).map(function (x) { return h('option', { value: x }); }));
    var fs = feuille(nouveau ? 'Ajouter une carte' : 'Modifier la carte', [form.el, dl], [bouton('Annuler', fermer, 'btn--ghost'), h('button', { type: 'submit', class: 'btn', text: 'Enregistrer' })]);
    fs.form.addEventListener('submit', function (e) {
      e.preventDefault();
      var x = form.lire();
      if (!x) return;
      x.ref = String(x.ref).trim();
      if (!/^[A-Za-z0-9-]{1,12}$/.test(x.ref)) { form.erreur('ref', 'Lettres et chiffres seulement (12 au plus).'); return; }
      if ((nouveau || x.ref !== c.ref) && trouverCarte(S.doc, x.ref)) { form.erreur('ref', 'Ce numéro est déjà utilisé.'); return; }
      if (x.mode === 'ticket' && !x.ticket) { form.erreur('ticket', 'Choisis le ticket.'); return; }
      if ((x.mode === 'ticket' || x.mode === 'yen') && vide(x.yen)) { form.erreur('yen', 'Indique le prix en yens.'); return; }
      if (x.mode === 'eur' && vide(x.eur)) { form.erreur('eur', 'Indique le montant payé.'); return; }
      if (x.mode === 'lot' && !x.lot) { form.erreur('lot', 'Choisis le lot.'); return; }
      var ancien = c ? c.ref : null;
      fermer();
      var ok = modifier((nouveau ? 'Carte ajoutée · ' : 'Fiche modifiée · ') + x.nom + ' (N° ' + x.ref + ')', function (doc) {
        var cc = nouveau ? { vendu: false, prix_vendu: null, vente_date: null, canal: null, alias_site: [], lots_site: [] } : trouverCarte(doc, ancien);
        ['ref', 'langue', 'nom', 'groupe', 'cat', 'prix', 'etat', 'boutique', 'date_achat', 'nom_en', 'rarete', 'set', 'nom_ticket', 'ebay', 'verif', 'remarque'].forEach(function (k) { cc[k] = x[k]; });
        cc.gardee = !!x.gardee;
        if (x.mode === 'ticket' || x.mode === 'yen') cc.yen = x.yen;
        else if (nouveau) cc.yen = null;
        if (!x.mode) cc.achat = null;
        else if (x.mode === 'ticket') cc.achat = { mode: 'ticket', ticket: x.ticket };
        else if (x.mode === 'yen') cc.achat = { mode: 'yen' };
        else if (x.mode === 'eur') cc.achat = { mode: 'eur', eur: x.eur };
        else if (x.mode === 'lot') cc.achat = { mode: 'lot', lot: x.lot };
        if (x.mode === 'ticket') cc.ticket = x.ticket;
        else if (/^T\d+$/.test(cc.ticket || '')) cc.ticket = 'Sans ticket';
        if (nouveau) doc.cartes.push(cc);
      });
      if (ok && (nouveau || ancien !== x.ref)) location.hash = '#carte/' + encodeURIComponent(x.ref);
    });
  }

  /* ---------------------------------------------------------------- ventes */
  VUES.ventes = function (m) {
    var R = S.R, k = R.k, vt = R.ventesTotal;
    m.appendChild(entete('Ventes', nbr(k.vendus) + ' article' + pl(k.vendus) + ' vendu' + pl(k.vendus), [h('button', { type: 'button', class: 'btn pl-btn-s', onclick: feuilleChoixVente, text: '+ Vente' })]));
    m.appendChild(h('div', { class: 'pl-kpis' }, [
      tuile('Encaissé', eur(vt.encaisse, 2), 'prix moyen ' + eur(k.prix_moyen)),
      tuile('Coût d’achat', eur(vt.cout, 2), vt.estime ? 'dont ' + eur(vt.estime, 2) + ' estimés' : 'prix réels'),
      tuile('Frais', eur(vt.envoi + vt.frais, 2), 'envoi ' + eur(vt.envoi, 2) + (vt.frais ? ' · vente ' + eur(vt.frais, 2) : '')),
      tuile('Bénéfice net', eurS(vt.net, 2), 'rentabilité ' + pct(vt.rentab) + ' · marque ' + pct(k.taux_marque), sens(vt.net))
    ]));
    m.appendChild(section('Par groupe', [tableau([
      { t: 'Groupe', f: function (l) { return l.libelle; } },
      { t: 'Vendus', f: function (l) { return nbr(l.vendus); } },
      { t: 'En stock', f: function (l) { return nbr(l.stock); } },
      { t: 'Encaissé', f: function (l) { return eur(l.encaisse, 2); } },
      { t: 'Coût', f: function (l) { return eur(l.cout, 2); } },
      { t: 'Envoi', f: function (l) { return eur(l.envoi, 2); } },
      { t: 'Bénéfice', f: function (l) { return eur(l.net, 2); }, cls: function (l) { return sens(l.net); } },
      { t: 'Rentab.', f: function (l) { return pct(l.rentab); } }
    ], R.ventes, vt, 'Ventes par groupe')]));
    var vendues = R.cartes.filter(function (r) { return r.vente; }).sort(function (a, b) {
      return (b.c.vente_date || '').localeCompare(a.c.vente_date || '') || b.i - a.i;
    });
    var prod = R.produits.filter(function (x) { return x.vente.vendus > 0; });
    m.appendChild(section('Détail', [
      vendues.length ? h('ul', { class: 'pl-rows' }, vendues.map(function (r) { return ligneCarte(r, { extra: r.source === 'estimé' ? 'coût estimé' : null }); })) : h('p', { class: 'pl-box', text: 'Aucune vente pour l’instant.' }),
      prod.length ? h('ul', { class: 'pl-rows' }, prod.map(function (x) {
        return h('li', null, h('a', { class: 'pl-row pl-row--sans', href: '#scelle' }, [
          h('span', { class: 'pl-row__main' }, [h('span', { class: 'pl-row__nom', text: x.p.nom }), h('span', { class: 'pl-row__meta', text: nbr(x.vente.vendus) + ' vendu' + pl(x.vente.vendus) + ' au nombre' })]),
          h('span', { class: 'pl-row__nums' }, [h('span', { class: 'pl-row__prix', text: eur(x.vente.encaisse) }), h('span', { class: 'pl-row__m ' + sens(x.vente.net), text: fleche(x.vente.net) + eurS(x.vente.net) })])
        ]));
      })) : null
    ], 'Les ventes enregistrées ici ont une date ; celles venues de l’Excel suivent son ordre.'));
  };
  function feuilleChoixVente() {
    var champ = h('input', { class: 'input', type: 'search', placeholder: 'Chercher la carte vendue…', 'aria-label': 'Chercher la carte vendue', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    var liste = h('ul', { class: 'pl-choix' });
    function maj() {
      var mots = norm(champ.value).trim().split(/\s+/).filter(Boolean);
      var l = S.R.cartes.filter(function (r) {
        if (!r.stock) return false;
        if (!mots.length) return true;
        var t = norm([r.c.ref, r.c.nom, r.c.nom_en, r.c.set].join(' '));
        return mots.every(function (x) { return t.indexOf(x) !== -1; });
      }).sort(function (a, b) { return z(b.c.prix) - z(a.c.prix); }).slice(0, 40);
      liste.textContent = '';
      l.forEach(function (r) {
        liste.appendChild(h('li', null, h('button', { type: 'button', class: 'pl-choix__b', onclick: function () { feuilleVente(r.c.ref); } }, [
          vignette(r.c), h('span', null, [r.c.nom, h('small', { text: 'N° ' + r.c.ref + ' · ' + r.c.groupe })]), h('span', { text: eur(r.c.prix) })])));
      });
      S.R.produits.forEach(function (x) {
        if (x.reste > 0 && (!mots.length || mots.every(function (m) { return norm(x.p.nom).indexOf(m) !== -1; }))) {
          liste.appendChild(h('li', null, h('button', { type: 'button', onclick: function () { feuilleVenteProduit(x.id); } }, [
            h('span', null, [x.p.nom, h('small', { text: nbr(x.reste) + ' en stock · vente au nombre' })]), h('span', { text: eur(x.prix_u) })])));
        }
      });
    }
    champ.addEventListener('input', maj);
    maj();
    feuille('Quelle carte as-tu vendue ?', [h('div', { class: 'pl-search' }, champ), liste]);
    setTimeout(function () { champ.focus(); }, 50);
  }

  /* ---------------------------------------------------------------- achats et tickets */
  VUES.achats = function (m) {
    var R = S.R, P = R.params, tot = { yen: 0, det: 0, eur: 0 }, modes = { ticket: 0, yen: 0, eur: 0, lot: 0 }, produits = 0;
    m.appendChild(h('a', { class: 'pl-back', href: '#plus', text: '‹ Plus' }));
    R.tickets.forEach(function (x) { tot.yen += z(x.t.total_yen); tot.det += x.detaxe; tot.eur += z(x.paye_eur); });
    R.cartes.forEach(function (r) { var md = (r.c.achat || {}).mode; if (!r.hors && r.compte && md && r.paye != null) modes[md] += r.paye; });
    R.produits.forEach(function (x) { produits += z(x.paye); });
    m.appendChild(entete('Achats', R.tickets.length + ' tickets · 1 € = ' + nbr(P.taux) + ' ¥', [h('button', { type: 'button', class: 'btn pl-btn-s', onclick: function () { feuilleTicket(null); }, text: '+ Ticket' })]));
    m.appendChild(h('div', { class: 'pl-kpis' }, [
      tuile('Investi au total', eur(R.k.investi, 2), 'prix d’achat réels'),
      tuile('Tickets japonais', eur(tot.eur, 2), yen(tot.yen) + ' · détaxe ' + yen(tot.det)),
      tuile('Lots PSA 10', eur(modes.lot, 2), R.lots.length + ' lots'),
      tuile('Cartes sans ticket', eur(modes.yen + modes.eur, 2), 'prix en ¥ ou en €, hors lots')
    ]));
    var ratt = modes.ticket, nonRatt = tot.eur - ratt;
    m.appendChild(section('D’où vient l’investissement', [barres([
      { l: 'Cartes achetées sur ticket', v: modes.ticket, txt: eur(modes.ticket) },
      { l: 'Lots PSA 10', v: modes.lot, txt: eur(modes.lot) },
      { l: 'Produits (card sets, boosters, coffret)', v: produits, txt: eur(produits) },
      { l: 'Cartes sans ticket (¥ ou €)', v: modes.yen + modes.eur, txt: eur(modes.yen + modes.eur) }
    ].filter(function (x) { return x.v > 0; }).sort(function (a, b) { return b.v - a.v; }), 'Répartition de l’investissement'),
    h('p', { class: 'pl-note', text: 'Sur ' + eur(tot.eur, 2) + ' payés aux boutiques japonaises, ' + eur(ratt, 2) + ' sont rattachés à des cartes. ' +
      (Math.abs(nonRatt) >= 0.5 ? 'Les ' + eur(nonRatt, 2) + ' restants viennent des tickets sans carte ou en écart (voir Contrôles).' : 'Tout est rattaché.') })]));
    var parBoutique = {};
    R.tickets.forEach(function (x) { var b = (x.t.boutique || 'Non indiquée').replace(/\s*\(.*\)$/, ''); parBoutique[b] = (parBoutique[b] || 0) + z(x.paye_eur); });
    var pb = Object.keys(parBoutique).map(function (b) { return { l: b, v: parBoutique[b], txt: eur(parBoutique[b]) }; }).sort(function (a, b) { return b.v - a.v; });
    if (pb.length > 10) {
      var autres = pb.slice(9), s9 = autres.reduce(function (s, x) { return s + x.v; }, 0);
      pb = pb.slice(0, 9).concat([{ l: 'Autres boutiques', s: autres.length + ' boutiques', v: s9, txt: eur(s9) }]);
    }
    if (pb.length) m.appendChild(section('Dépenses par boutique', [barres(pb, 'Dépenses par boutique')], 'Montants payés après détaxe, au taux de ' + nbr(P.taux) + ' ¥ par €.'));
    m.appendChild(section('Tickets', [h('ul', { class: 'pl-rows' }, R.tickets.slice().reverse().map(function (x) {
      var etat = x.nb === 0 ? badge('Sans carte', 'estime') : x.ok ? badge('OK', 'ok') : badge('Écart ' + (x.ecart_yen > 0 ? '+' : '−') + yen(Math.abs(x.ecart_yen)), 'ecart');
      return h('li', null, h('a', { class: 'pl-row pl-row--sans', href: '#ticket/' + encodeURIComponent(x.id) }, [
        h('span', { class: 'pl-row__main' }, [h('span', { class: 'pl-row__nom', text: x.id + ' · ' + (x.t.boutique || 'Boutique non indiquée') }),
          h('span', { class: 'pl-row__meta', text: [x.t.date ? dateFR(x.t.date) : null, yen(x.t.total_yen), x.nb + ' carte' + pl(x.nb)].filter(Boolean).join(' · ') })]),
        h('span', { class: 'pl-row__nums' }, [h('span', { class: 'pl-row__prix', text: eur(x.paye_eur, 2) }), etat])
      ]));
    }))]));
    if (S.doc.tickets_ecartes.length) m.appendChild(section('Tickets écartés', [h('ul', { class: 'pl-rows' }, S.doc.tickets_ecartes.map(function (t) {
      return h('li', null, h('div', { class: 'pl-row pl-row--sans' }, [h('span', { class: 'pl-row__main' }, [h('span', { class: 'pl-row__nom', text: t.libelle }), h('span', { class: 'pl-row__meta', text: [dateFR(t.date), t.note].filter(Boolean).join(' · ') })]), h('span', { class: 'pl-row__nums' }, h('span', { class: 'pl-row__prix', text: yen(t.total_yen) }))]));
    }))], 'Dépenses du voyage qui ne sont pas des cartes : non comptées.'));
  };
  VUES.ticket = function (m, id) {
    var x = S.R.ticketsParId[id];
    m.appendChild(retour('#achats', 'Retour'));
    if (!x) { m.appendChild(h('p', { class: 'pl-box', text: 'Ticket introuvable : ' + id })); return; }
    var t = x.t;
    m.appendChild(entete(t.id + ' · ' + (t.boutique || 'Boutique non indiquée'), dateFR(t.date) || 'Date non indiquée'));
    m.appendChild(h('div', { class: 'pl-kpis' }, [
      tuile('Total du ticket', yen(t.total_yen)),
      tuile('Détaxe', yen(x.detaxe), t.detaxe_auto ? '10 % supposés (formulaire joint)' : x.detaxe ? 'montant du ticket' : 'aucune'),
      tuile('Payé', eur(x.paye_eur, 2), yen(x.paye_yen)),
      tuile('Contrôle', x.nb === 0 ? 'Sans carte' : x.ok ? 'OK' : 'Écart', x.nb ? 'cartes : ' + yen(x.somme_yen) + ' pour ' + yen(t.total_yen) : null, x.nb && !x.ok ? 'pl-neg' : x.ok ? 'pl-pos' : '')
    ]));
    if (t.note) m.appendChild(h('p', { class: 'pl-note', text: t.note }));
    var rs = S.R.cartes.filter(function (r) { return r.c.ticket === t.id; });
    m.appendChild(section('Cartes du ticket', [rs.length ? h('ul', { class: 'pl-rows' }, rs.map(function (r) { return ligneCarte(r, { extra: yen(r.c.yen) }); })) : h('p', { class: 'pl-box', text: 'Aucune carte rattachée à ce ticket.' })]));
    m.appendChild(h('div', { class: 'pl-actions' }, [bouton('Modifier le ticket', function () { feuilleTicket(t.id); }, 'btn--ghost')]));
    if (!rs.length) m.appendChild(h('p', { class: 'pl-note' }, lienBtn('Supprimer ce ticket', function () {
      confirmer('Supprimer le ticket ?', 'Le ticket ' + t.id + ' sera retiré des achats.', 'Supprimer', function () {
        location.hash = '#achats';
        modifier('Ticket supprimé · ' + t.id, function (doc) { doc.tickets = doc.tickets.filter(function (y) { return y.id !== t.id; }); });
      });
    }, 'pl-danger')));
  };
  function feuilleTicket(id) {
    var t = id ? S.doc.tickets.filter(function (x) { return x.id === id; })[0] : null;
    var num = 0;
    S.doc.tickets.forEach(function (x) { var mm = /^T(\d+)$/.exec(x.id); if (mm) num = Math.max(num, +mm[1]); });
    var init = t ? { id: t.id, boutique: t.boutique, date: t.date, total: t.total_yen, detaxe: t.detaxe_auto ? 'auto' : (t.detaxe_yen ? 'montant' : 'aucune'), montant: t.detaxe_yen, note: t.note }
      : { id: 'T' + String(num + 1).padStart(2, '0'), detaxe: 'aucune' };
    var form = formulaire([
      { k: 'id', label: 'Numéro', type: 'text', demi: true, req: true },
      { k: 'date', label: 'Date', type: 'date', demi: true },
      { k: 'boutique', label: 'Boutique', type: 'text' },
      { k: 'total', label: 'Total du ticket (¥)', type: 'num', req: true },
      { k: 'detaxe', label: 'Détaxe', type: 'select', options: [['aucune', 'Aucune (payé TTC)'], ['montant', 'Montant écrit sur le ticket'], ['auto', '10 % supposés (formulaire de détaxe joint)']] },
      { k: 'montant', label: 'Montant de la détaxe (¥)', type: 'num', si: ['detaxe', ['montant']] },
      { k: 'note', label: 'Note', type: 'textarea' }
    ], init);
    var fs = feuille(t ? 'Modifier le ticket' : 'Nouveau ticket', [form.el], [bouton('Annuler', fermer, 'btn--ghost'), h('button', { type: 'submit', class: 'btn', text: 'Enregistrer' })]);
    fs.form.addEventListener('submit', function (e) {
      e.preventDefault();
      var x = form.lire();
      if (!x) return;
      if (!/^[A-Za-z0-9-]{1,12}$/.test(x.id)) { form.erreur('id', 'Lettres et chiffres seulement.'); return; }
      if ((!t || x.id !== t.id) && S.doc.tickets.some(function (y) { return y.id === x.id; })) { form.erreur('id', 'Ce numéro existe déjà.'); return; }
      if (x.detaxe === 'montant' && vide(x.montant)) { form.erreur('montant', 'Indique le montant de la détaxe.'); return; }
      var ancien = t ? t.id : null;
      fermer();
      modifier((t ? 'Ticket modifié · ' : 'Ticket ajouté · ') + x.id, function (doc) {
        var tt = t ? doc.tickets.filter(function (y) { return y.id === ancien; })[0] : {};
        tt.id = x.id; tt.boutique = x.boutique; tt.date = x.date; tt.total_yen = x.total; tt.note = x.note;
        tt.detaxe_auto = x.detaxe === 'auto'; tt.detaxe_yen = x.detaxe === 'montant' ? x.montant : (x.detaxe === 'aucune' ? 0 : null);
        if (!t) doc.tickets.push(tt);
        else if (ancien !== x.id) doc.cartes.forEach(function (c) {
          if (c.ticket === ancien) c.ticket = x.id;
          if (c.achat && c.achat.mode === 'ticket' && c.achat.ticket === ancien) c.achat.ticket = x.id;
        });
      });
      location.hash = '#ticket/' + encodeURIComponent(x.id);
    });
  }

  /* ---------------------------------------------------------------- lots PSA 10 */
  VUES.lots = function (m) {
    var R = S.R, P = R.params;
    m.appendChild(h('a', { class: 'pl-back', href: '#plus', text: '‹ Plus' }));
    m.appendChild(entete('Lots', R.lots.length + ' lots achetés en une fois', [h('button', { type: 'button', class: 'btn pl-btn-s', onclick: function () { feuilleLot(null); }, text: '+ Lot' })]));
    R.lots.forEach(function (L) {
      var rs = L.cartes.map(function (c) { return R.parRef[c.ref]; }).filter(Boolean);
      var tousPrix = rs.length && rs.every(function (r) { return !vide(r.c.prix); });
      var marge = tousPrix && L.paye_eur != null ? L.prix_total * (1 - P.fv) - L.paye_eur * (1 + P.tva) : null;
      var vendues = rs.filter(function (r) { return r.c.vendu; });
      var benef = vendues.reduce(function (s, r) { return s + z(r.benef); }, 0);
      m.appendChild(section(L.id, [
        h('div', { class: 'pl-kpis' }, [
          tuile('Payé', eur(L.paye_eur, 2), yen(L.l.paye_yen)),
          tuile('Valeur marché', eur(L.prix_total, 2), rs.length + ' cartes'),
          tuile('Marge nette', eurS(marge, 2), 'gain ' + pct(marge != null && L.paye_eur ? marge / L.paye_eur : null), sens(marge)),
          tuile('Vendues', vendues.length + ' / ' + rs.length, vendues.length ? 'bénéfice ' + eurS(benef, 2) : null)
        ]),
        h('ul', { class: 'pl-rows' }, rs.map(function (r) { return ligneCarte(r, { extra: 'payé réparti ' + eur(r.paye, 2) }); })),
        h('p', { class: 'pl-note' }, [L.l.note ? L.l.note + ' · ' : null, lienBtn('Modifier le lot', function () { feuilleLot(L.id); })])
      ]));
    });
  };
  function feuilleLot(id) {
    var l = id ? S.doc.lots.filter(function (x) { return x.id === id; })[0] : null;
    var form = formulaire([
      { k: 'id', label: 'Nom du lot', type: 'text', req: true },
      { k: 'paye_yen', label: 'Payé pour tout le lot (¥)', type: 'num', aide: 'Converti au taux des réglages, puis réparti entre les cartes du lot au prorata de leur prix marché.' },
      { k: 'note', label: 'Note', type: 'textarea' }
    ], l ? { id: l.id, paye_yen: l.paye_yen, note: l.note } : { id: 'Lot ' + (S.doc.lots.length + 1) });
    var fs = feuille(l ? 'Modifier le lot' : 'Nouveau lot', [form.el, l ? null : h('p', { class: 'pl-note', text: 'Ensuite, dans chaque carte du lot : Prix d’achat → « Part d’un lot ».' })],
      [bouton('Annuler', fermer, 'btn--ghost'), h('button', { type: 'submit', class: 'btn', text: 'Enregistrer' })]);
    fs.form.addEventListener('submit', function (e) {
      e.preventDefault();
      var x = form.lire();
      if (!x) return;
      if ((!l || x.id !== l.id) && S.doc.lots.some(function (y) { return y.id === x.id; })) { form.erreur('id', 'Ce nom existe déjà.'); return; }
      var ancien = l ? l.id : null;
      fermer();
      modifier((l ? 'Lot modifié · ' : 'Lot ajouté · ') + x.id, function (doc) {
        var ll = l ? doc.lots.filter(function (y) { return y.id === ancien; })[0] : {};
        ll.id = x.id; ll.paye_yen = x.paye_yen; ll.note = x.note;
        if (!l) doc.lots.push(ll);
        else if (ancien !== x.id) doc.cartes.forEach(function (c) { if (c.achat && c.achat.mode === 'lot' && c.achat.lot === ancien) c.achat.lot = x.id; });
      });
    });
  }

  /* ---------------------------------------------------------------- scellé et produits vendus au nombre */
  VUES.scelle = function (m) {
    var R = S.R;
    m.appendChild(h('a', { class: 'pl-back', href: '#plus', text: '‹ Plus' }));
    m.appendChild(entete('Scellé et quantités', 'Card sets, ex, coffret et boosters, vendus au nombre'));
    R.produits.forEach(function (x) {
      var p = x.p, v = x.vente;
      var kids = [
        h('div', { class: 'pl-kpis' }, [
          tuile('En stock', nbr(x.reste) + ' / ' + nbr(x.nb), v.vendus ? nbr(v.vendus) + ' vendu' + pl(v.vendus) : 'aucune vente'),
          tuile('Prix unitaire', eur(x.prix_u, 2), p.composants ? 'somme des cartes du coffret' : null),
          tuile('Payé', x.connu ? eur(x.paye, 2) : '—', x.connu ? (x.paye_unitaire != null ? eur(x.paye_unitaire, 2) + ' l’unité' : null) : 'pas de prix d’achat'),
          tuile('Marge nette', eurS(x.marge, 2), x.gain != null ? 'gain ' + pct(x.gain) : null, sens(x.marge))
        ])
      ];
      if (v.vendus) kids.push(h('p', { class: 'pl-note', text: 'Ventes : ' + eur(v.encaisse, 2) + ' encaissés, bénéfice ' + eurS(v.net, 2) + '.' }));
      if (p.composants) {
        var rs = R.cartes.filter(function (r) { return r.c.groupe === p.composants; });
        kids.push(h('ul', { class: 'pl-rows' }, rs.map(function (r) { return ligneCarte(r); })));
      }
      (p.notes || []).forEach(function (n) { kids.push(h('p', { class: 'pl-note', text: n })); });
      var act = [];
      if (x.reste > 0) act.push(bouton('Vendre', function () { feuilleVenteProduit(x.id); }));
      act.push(bouton('Modifier', function () { feuilleProduit(x.id); }, 'btn--ghost'));
      kids.push(h('div', { class: 'pl-actions' }, act));
      m.appendChild(section(p.nom, kids));
    });
  };
  function produit(doc, id) { return doc.produits.filter(function (p) { return p.id === id; })[0]; }
  function feuilleVenteProduit(id) {
    var x = S.R.produits.filter(function (y) { return y.id === id; })[0];
    if (!x) return;
    var p = x.p;
    var form = formulaire([
      { k: 'n', label: 'Nombre vendu', type: 'num', demi: true, req: true },
      { k: 'prix', label: 'Prix unitaire (€)', type: 'num', demi: true, req: true },
      { k: 'envois', label: 'Nombre d’envois', type: 'num', demi: true, aide: 'Une pochette par envoi.' },
      { k: 'date', label: 'Date', type: 'date', demi: true },
      { k: 'canal', label: 'Vendu où ?', type: 'select', options: [['', '—']].concat(CANAUX.map(function (c) { return [c, c]; })) }
    ], { n: 1, prix: x.prix_u, envois: 1, date: aujourdhui(), canal: lire(CLE_CANAL) || '' });
    var fs = feuille('Vendre · ' + p.nom, [h('p', { class: 'pl-note', text: nbr(x.reste) + ' en stock' }), form.el], [bouton('Annuler', fermer, 'btn--ghost'), h('button', { type: 'submit', class: 'btn', text: 'Enregistrer' })]);
    fs.form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = form.lire();
      if (!v) return;
      if (!(v.n > 0) || Math.round(v.n) !== v.n) { form.erreur('n', 'Un nombre entier, au moins 1.'); return; }
      if (v.n > x.reste) { form.erreur('n', 'Il n’en reste que ' + nbr(x.reste) + '.'); return; }
      ecrire(CLE_CANAL, v.canal || '');
      fermer();
      modifier('Vente · ' + nbr(v.n) + ' × ' + p.nom + ' · ' + eur(v.prix, 2), function (doc) {
        var pp = produit(doc, id), ancienN = z(pp.vendus);
        var moyen = pp.prix_reel_moyen != null ? pp.prix_reel_moyen : z(x.prix_u);
        pp.vendus = ancienN + v.n;
        pp.prix_reel_moyen = (ancienN * moyen + v.n * v.prix) / pp.vendus;
        pp.envois = (pp.envois != null ? pp.envois : ancienN) + (v.envois != null ? v.envois : v.n);
        (pp.historique = pp.historique || []).push({ date: v.date || aujourdhui(), n: v.n, prix: v.prix, envois: v.envois != null ? v.envois : v.n, canal: v.canal || null });
      });
    });
  }
  function feuilleProduit(id) {
    var p = produit(S.doc, id);
    if (!p) return;
    var defs = [{ k: 'nom', label: 'Nom', type: 'text', req: true }];
    if (!p.composants) {
      defs.push({ k: 'quantite', label: 'Quantité achetée', type: 'num', demi: true }, { k: 'prix_u', label: 'Prix marché unitaire (€)', type: 'num', demi: true });
      if (p.paye_total != null || p.frais_u != null) defs.push({ k: 'paye_total', label: 'Payé en tout (€)', type: 'num', demi: true }, { k: 'frais_u', label: 'Frais par unité vendue (€)', type: 'num', demi: true });
      else defs.push({ k: 'paye_u', label: 'Payé par unité (€)', type: 'num', demi: true, aide: 'Vide si tu ne l’as pas payé (tiré de boosters).' });
    }
    defs.push({ k: 'vendus', label: 'Vendus en tout', type: 'num', demi: true }, { k: 'prix_reel_moyen', label: 'Prix de vente moyen (€)', type: 'num', demi: true, aide: 'Vide = prix marché.' },
      { k: 'envois', label: 'Envois en tout', type: 'num', demi: true, aide: 'Vide = un envoi par unité vendue.' });
    var form = formulaire(defs, p);
    var fs = feuille('Modifier · ' + p.nom, [form.el], [bouton('Annuler', fermer, 'btn--ghost'), h('button', { type: 'submit', class: 'btn', text: 'Enregistrer' })]);
    fs.form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = form.lire();
      if (!v) return;
      fermer();
      modifier('Produit modifié · ' + v.nom, function (doc) {
        var pp = produit(doc, id);
        defs.forEach(function (df) { pp[df.k] = v[df.k]; });
        if (pp.vendus == null) pp.vendus = 0;
      });
    });
  }

  /* ---------------------------------------------------------------- contrôles */
  VUES.controles = function (m) {
    var R = S.R, c = R.controles, cs = controlesSite();
    m.appendChild(h('a', { class: 'pl-back', href: '#plus', text: '‹ Plus' }));
    m.appendChild(entete('Contrôles', 'Ce qui ne colle pas entre la compta, les tickets et le site'));
    if (!cs) m.appendChild(h('p', { class: 'pl-box', text: S.site === null && S.statuts === null ? 'Chargement des données du site…' : 'Les données du site n’ont pas pu être chargées : les contrôles avec le site sont indisponibles.' }));
    else {
      m.appendChild(details('Ventes du site à saisir ici', cs.a_saisir.length, [h('ul', { class: 'pl-rows' }, cs.a_saisir.map(function (x) {
        if (x.r) return ligneAction(x.r, 'Vendue sur le site (' + x.rf + ')', 'Saisir', function () { feuilleVente(x.r.c.ref, { prix: prixSite(x.rf) }); });
        return h('li', null, h('div', { class: 'pl-row pl-row--sans' }, [h('span', { class: 'pl-row__main' }, [h('span', { class: 'pl-row__nom', text: x.sc.titre + ' (' + x.rf + ')' }),
          h('span', { class: 'pl-row__meta', text: 'Lot vendu sur le site : saisis la vente de ' + x.lot.map(function (r) { return r.c.nom + ' (N° ' + r.c.ref + ')'; }).join(', ') })])]));
      }))], cs.a_saisir.length > 0));
      m.appendChild(details('Vendues ici, encore en vente sur le site', cs.encore.length, [h('ul', { class: 'pl-rows' }, cs.encore.map(function (x) {
        var nom = x.r ? x.r.c.nom : x.sc.titre;
        return ligneAction(x.r || null, 'Fiche ' + x.rf + ' encore disponible', 'Passer en Vendue', function (e) {
          e.target.disabled = true;
          statutSite(x.rf, 'vendue').then(function () { toast('« ' + nom + ' » est maintenant Vendue sur le site'); rendre(true); }, function (err) { e.target.disabled = false; alerte('Site pas mis à jour', err.message); });
        }, nom);
      }))], cs.encore.length > 0));
      m.appendChild(details('Prix du site différent du prix marché', cs.prix.length, [h('ul', { class: 'pl-rows' }, cs.prix.map(function (x) {
        return ligneAction(x.r, 'Site ' + eur(x.p, 2) + ' · compta ' + eur(x.r.c.prix, 2), 'Prendre ' + eur(x.p), function () {
          modifier('Prix marché aligné sur le site · ' + x.r.c.nom + ' · ' + eur(x.p, 2), function (doc) { trouverCarte(doc, x.r.c.ref).prix = x.p; });
        });
      }))], false));
      m.appendChild(details('Fiches du site absentes de la compta', cs.absentes.length, [h('ul', { class: 'pl-rows' }, cs.absentes.map(function (x) {
        return ligneAction(null, x.rf + ' · ' + (x.sc.prix_eur ? eur(x.sc.prix_eur) : 'prix sur demande'), 'Ajouter', function () { feuilleCarte(null, depuisSite(x.rf, x.sc)); }, x.sc.titre);
      }))], false));
      if (cs.reservees.length) m.appendChild(details('Réservées sur le site', cs.reservees.length, [h('ul', { class: 'pl-rows' }, cs.reservees.map(function (x) {
        var r = S.R.parRef[x.rf];
        return r ? ligneCarte(r) : ligneAction(null, x.rf, null, null, x.sc.titre);
      }))], false));
    }
    m.appendChild(details('Tickets dont les cartes ne font pas le total', c.tickets_ecart.length, [h('ul', { class: 'pl-rows' }, c.tickets_ecart.map(function (x) {
      return h('li', null, h('a', { class: 'pl-row pl-row--sans', href: '#ticket/' + encodeURIComponent(x.id) }, [h('span', { class: 'pl-row__main' }, [h('span', { class: 'pl-row__nom', text: x.id + ' · ' + (x.t.boutique || '') }),
        h('span', { class: 'pl-row__meta', text: 'Cartes ' + yen(x.somme_yen) + ' pour un ticket de ' + yen(x.t.total_yen) })]), h('span', { class: 'pl-row__nums' }, badge((x.ecart_yen > 0 ? '+' : '−') + yen(Math.abs(x.ecart_yen)), 'ecart'))]));
    }))], false));
    m.appendChild(details('Tickets sans carte rattachée', c.tickets_vides.length, [h('ul', { class: 'pl-rows' }, c.tickets_vides.map(function (x) {
      return h('li', null, h('a', { class: 'pl-row pl-row--sans', href: '#ticket/' + encodeURIComponent(x.id) }, [h('span', { class: 'pl-row__main' }, [h('span', { class: 'pl-row__nom', text: x.id + ' · ' + (x.t.boutique || '') }),
        h('span', { class: 'pl-row__meta', text: x.t.note || '' })]), h('span', { class: 'pl-row__nums' }, h('span', { class: 'pl-row__prix', text: yen(x.t.total_yen) }))]));
    }))], false));
    m.appendChild(details('Cartes en stock sans prix marché', c.sans_prix.length, [h('ul', { class: 'pl-rows' }, c.sans_prix.map(function (r) { return ligneCarte(r); }))], false));
    m.appendChild(details('Cartes sans prix d’achat (coût estimé)', c.sans_paye.length, [h('p', { class: 'pl-note', text: 'Leur coût est estimé avec la rentabilité retenue (' + pct(R.params.rent) + ') : renseigne le vrai prix quand tu l’as.' }),
      h('ul', { class: 'pl-rows' }, c.sans_paye.slice().sort(function (a, b) { return z(b.c.prix) - z(a.c.prix); }).map(function (r) { return ligneCarte(r); }))], false));
    m.appendChild(details('Cartes en stock sous leur coût', c.a_perte.length, [h('ul', { class: 'pl-rows' }, c.a_perte.map(function (r) { return ligneCarte(r); }))], false));
    m.appendChild(details('Ventes à perte', c.ventes_a_perte.length, [h('ul', { class: 'pl-rows' }, c.ventes_a_perte.map(function (r) { return ligneCarte(r); }))], false));
  };
  function ligneAction(r, texte, label, fn, titre) {
    var main = [h('span', { class: 'pl-row__nom', text: titre || (r ? r.c.nom : '') }), h('span', { class: 'pl-row__meta', text: texte })];
    var kids = [];
    if (r) kids.push(vignette(r.c));
    kids.push(h('span', { class: 'pl-row__main' }, r ? [h('a', { href: '#carte/' + encodeURIComponent(r.c.ref), class: 'pl-row__nom', text: titre || r.c.nom }), main[1]] : main));
    kids.push(h('span', { class: 'pl-row__nums' }, label ? h('button', { type: 'button', class: 'btn btn--ghost pl-btn-s', onclick: fn, text: label }) : null));
    return h('li', null, h('div', { class: 'pl-row pl-row--action' + (r ? '' : ' pl-row--sans') }, kids));
  }
  function depuisSite(rf, sc) {
    var cat = sc.type === 'slab' && sc.etat && sc.etat.type === 'PSA' ? 'PSA ' + sc.etat.note : ({ sar: 'SAR', sr: 'SR / CHR', ar: 'AR', promo: 'Promo', vintage: 'Vintage' })[sc.categorie] || 'Autres';
    return {
      ref: rf, nom: sc.titre, nom_en: sc.nom_en, langue: sc.langue || 'JP', prix: prixSite(rf), cat: cat,
      set: sc.extension ? [sc.extension.code, sc.extension.nom].filter(Boolean).join(' · ') : null, rarete: sc.rarete, etat: sc.etat ? sc.etat.libelle : null,
      groupe: 'Cartes', mode: '', remarque: 'Ajoutée depuis la fiche du site le ' + dateFR(aujourdhui()) + '.'
    };
  }

  /* ---------------------------------------------------------------- analyse financière (moteur : assets/js/pilotage-analyse.js) */
  var AVIS = {
    'Renforcer': ['ok', 'Rentable et se vend vite : à acheter en priorité.'],
    'Sélectif': ['estime', 'Rentable mais lent : seulement les meilleures pièces.'],
    'Rotation': ['', 'Se vend vite mais rapporte moins : bon pour la trésorerie.'],
    'Alléger': ['ecart', 'Rapporte moins et part lentement : à réduire.'],
    'À tester': ['garde', 'Trop peu de données : petit budget pour tester.'],
    'Coût à compléter': ['estime', 'Plus de la moitié du coût est estimé : renseigne les vrais prix d’achat.'],
    'Données à compléter': ['', 'Information non renseignée sur les cartes.'],
    'Sans données': ['', 'Ni vente ni prix marché pour juger.']
  };
  function avis(reco) { var a = AVIS[reco] || ['', '']; return h('span', { class: 'pl-badge' + (a[0] ? ' pl-badge--' + a[0] : ''), title: a[1], text: reco }); }
  function nomCourt(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function sv(tag, a, kids) {
    var e = d.createElementNS('http://www.w3.org/2000/svg', tag);
    if (a) Object.keys(a).forEach(function (k) { if (a[k] != null) e.setAttribute(k, a[k]); });
    if (kids != null) ajouter(e, kids);
    return e;
  }
  /* matrice rentabilité × écoulement : un point par segment, aire ∝ capital encore en stock */
  function matrice(A, largeur) {
    var pts = A.lignes.filter(function (s) { return s.rentab != null && s.ecoul != null && s.cout >= 20 && !/compléter|Sans données/.test(s.reco); })
      .sort(function (a, b) { return b.cout - a.cout; }).slice(0, 12);
    if (pts.length < 2) return null;
    var W = Math.round(Math.max(300, Math.min(largeur, 760))), H = Math.round(W * (W < 500 ? 0.9 : 0.62));
    var g = { l: 44, r: 12, t: 26, b: 42 };
    var xMax = Math.max(0.2, Math.max.apply(null, pts.map(function (s) { return s.ecoul; })) * 1.12);
    var yMin = Math.min(0, Math.min.apply(null, pts.map(function (s) { return s.rentab; })) * 1.15);
    var yMax = Math.max(0.3, Math.max.apply(null, pts.map(function (s) { return s.rentab; })) * 1.12);
    function X(v) { return g.l + (W - g.l - g.r) * v / xMax; }
    function Y(v) { return g.t + (H - g.t - g.b) * (1 - (v - yMin) / (yMax - yMin)); }
    function pas(e) { var b = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10]; for (var i = 0; i < b.length; i++) if (e / b[i] <= 5) return b[i]; return 20; }
    var capMax = Math.max.apply(null, pts.map(function (s) { return s.cout_stock; })) || 1;
    var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, class: 'pl-matrice', role: 'img',
      'aria-label': 'Rentabilité retenue (vertical) selon l’écoulement (horizontal) de chaque segment. Valeurs dans le tableau qui suit.' });
    var px = pas(xMax), py = pas(yMax - yMin), v;
    for (v = 0; v <= xMax + 1e-9; v += px) {
      svg.appendChild(sv('line', { x1: X(v), x2: X(v), y1: g.t, y2: H - g.b, class: 'pl-m-grille' }));
      svg.appendChild(sv('text', { x: X(v), y: H - g.b + 15, 'text-anchor': 'middle', class: 'pl-m-tick' }, pct(v)));
    }
    for (v = Math.ceil(yMin / py - 1e-9) * py; v <= yMax + 1e-9; v += py) {
      svg.appendChild(sv('line', { x1: g.l, x2: W - g.r, y1: Y(v), y2: Y(v), class: 'pl-m-grille' + (Math.abs(v) < 1e-9 ? ' pl-m-zero' : '') }));
      svg.appendChild(sv('text', { x: g.l - 6, y: Y(v) + 4, 'text-anchor': 'end', class: 'pl-m-tick' }, pct(Math.abs(v) < 1e-9 ? 0 : v)));
    }
    if (A.ecoul_moy != null && A.ecoul_moy <= xMax) svg.appendChild(sv('line', { x1: X(A.ecoul_moy), x2: X(A.ecoul_moy), y1: g.t, y2: H - g.b, class: 'pl-m-moy' }));
    if (A.rentab_moy != null && A.rentab_moy >= yMin && A.rentab_moy <= yMax) svg.appendChild(sv('line', { x1: g.l, x2: W - g.r, y1: Y(A.rentab_moy), y2: Y(A.rentab_moy), class: 'pl-m-moy' }));
    [['Sélectif', g.l + 6, g.t + 13, 'start'], ['Renforcer', W - g.r - 6, g.t + 13, 'end'], ['Alléger', g.l + 6, H - g.b - 7, 'start'], ['Rotation', W - g.r - 6, H - g.b - 7, 'end']]
      .forEach(function (q4) { svg.appendChild(sv('text', { x: q4[1], y: q4[2], 'text-anchor': q4[3], class: 'pl-m-quad' }, q4[0])); });
    svg.appendChild(sv('text', { x: 4, y: 12, class: 'pl-m-axe' }, '↑ Rentabilité'));
    svg.appendChild(sv('text', { x: W - g.r, y: H - 6, 'text-anchor': 'end', class: 'pl-m-axe' }, 'Écoulement (part du capital déjà vendue) →'));
    var places = [];
    pts.slice().sort(function (a, b) { return b.cout_stock - a.cout_stock; }).forEach(function (s) {
      var cx = X(s.ecoul), cy = Y(s.rentab), r = 4 + 16 * Math.sqrt(Math.max(0, s.cout_stock) / capMax);
      var c = sv('circle', { cx: cx, cy: cy, r: r, class: 'pl-m-pt' });
      c.appendChild(sv('title', null, s.cle + ' : rentabilité ' + pct(s.rentab) + ', écoulement ' + pct(s.ecoul) + ', ' + eur(s.cout_stock) + ' en stock'));
      svg.appendChild(c);
      places.push({ cx: cx, cy: cy, r: r, s: s });
    });
    /* étiquettes : à droite du point (à gauche s'il est près du bord), décalées si elles se chevauchent */
    var poses = [];
    places.forEach(function (p) {
      var lab = nomCourt(p.s.cle, W < 500 ? 16 : 24), lg = lab.length * 6.1;
      var gauche = p.cx + p.r + 4 + lg > W - g.r, tx = gauche ? p.cx - p.r - 4 : p.cx + p.r + 4, ty = p.cy + 4;
      function boite() { return gauche ? [tx - lg, ty - 10, tx, ty + 2] : [tx, ty - 10, tx + lg, ty + 2]; }
      function chevauche(b) { return poses.some(function (o) { return b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]; }); }
      for (var k = 0, dy = [0, 12, -12, 24, -24, 36]; k < dy.length; k++) { ty = p.cy + 4 + dy[k]; if (!chevauche(boite())) break; }
      ty = Math.max(g.t + 10, Math.min(H - g.b - 2, ty));
      poses.push(boite());
      svg.appendChild(sv('text', { x: tx, y: ty, 'text-anchor': gauche ? 'end' : 'start', class: 'pl-m-lab' }, lab));
    });
    return svg;
  }
  VUES.analyse = function (m) {
    var R = S.R, An = w.PRAnalyse;
    m.appendChild(entete('Analyse', 'Ce qui se vend, ce qui rapporte, où placer tes capitaux'));
    if (!An) { m.appendChild(h('p', { class: 'pl-box', text: 'Le module d’analyse ne s’est pas chargé : recharge la page.' })); return; }
    var fa = S.fa || (S.fa = { dim: 'rarete', budget: +(lire('pr.pilotage.budget') || 0) || 2000, dimBudget: 'rarete', tout: false });
    var A = An.segments(R, fa.dim), Pf = fa.dim === 'type' ? A : An.segments(R, 'type'), T = Pf.total;
    /* qualité des données (portefeuille complet : cartes et scellé) */
    var aDater = R.cartes.filter(function (r) { return r.c.vendu && !r.hors && (!r.c.vente_date || !dateAchatCarte(r)); }).length;
    var mesures = T.n_delais;
    var nbCartes = R.cartes.filter(function (r) { return r.compte && !r.hors; }).length;
    var base = 'Base : ' + nbr(T.nv) + ' vente' + pl(T.nv) + ' pour ' + nbr(nbCartes) + ' cartes et ' + nbr(T.n - nbCartes) + ' articles scellés ; ' + pct(T.part_estimee) + ' du coût total est estimé (cartes sans prix d’achat). ';
    base += mesures ? 'Délai de vente mesuré sur ' + mesures + ' vente' + pl(mesures) + '.' : 'Aucune vente n’a encore ses deux dates (achat et vente) : le délai de vente apparaîtra dès que tu les renseignes.';
    m.appendChild(h('div', { class: 'pl-apercu' }, [base, aDater ? h('span', null, [' ', lienBtn('Dater mes ventes (' + aDater + ')', feuilleDatesVentes)]) : null]));
    m.appendChild(h('div', { class: 'pl-kpis pl-sec' }, [
      tuile('Rentabilité réalisée', pct(T.rentab_real), 'bénéfice net ÷ coût des ventes', T.rentab_real < 0 ? 'pl-neg' : ''),
      tuile('Rentabilité attendue', pct(T.rentab_att), 'stock revendu au prix habituel'),
      tuile('Écoulement', pct(T.ecoul), 'part du capital déjà vendue'),
      tuile(mesures ? 'Délai médian' : 'Prix obtenu', mesures ? NF0.format(T.delai_median) + ' jours' : pct(Pf.realisation), mesures ? 'entre achat et vente' : 'prix de vente ÷ prix marché')
    ]));
    var chips = h('div', { class: 'pl-chips pl-chips--dims', role: 'group', 'aria-label': 'Découper par' });
    An.DIMENSIONS.forEach(function (dm) {
      chips.appendChild(h('button', { type: 'button', class: 'chip', 'data-focus': 'dim-' + dm.id, 'aria-pressed': String(fa.dim === dm.id), text: dm.nom,
        onclick: function () { if (fa.dim !== dm.id) { fa.dim = dm.id; fa.tout = false; rendre(true); } } }));
    });
    m.appendChild(chips);
    var actif = chips.querySelector('[aria-pressed="true"]');
    if (actif) chips.scrollLeft = Math.max(0, actif.offsetLeft - chips.offsetLeft - 16);
    var mat = matrice(A, Math.min(m.clientWidth || 360, 792) - 34);
    m.appendChild(section('Rentabilité × écoulement', [mat ? h('div', { class: 'pl-box pl-matrice-box' }, mat) : h('p', { class: 'pl-box', text: 'Pas assez de segments mesurables pour ce découpage : choisis-en un autre.' })],
      'Un point par segment ; plus il est gros, plus il garde de capital en stock. Les pointillés sont tes moyennes : en haut à droite, ce qui rapporte et part vite.'));
    var lignes = A.lignes, limite = fa.tout || lignes.length <= 14 ? lignes.length : 12;
    var tot = Object.assign({}, A.total, { cle: fa.dim === 'type' ? 'Ensemble' : 'Toutes les cartes', reco: null });
    m.appendChild(section('Détail par ' + A.dim.nom.toLowerCase(), [tableau([
      { t: A.dim.nom, f: function (s) { return h('span', null, [s.cle, s.part_estimee > 0.5 ? h('small', { class: 'pl-t-note', text: 'coût estimé à ' + pct(s.part_estimee) }) : null]); } },
      { t: 'Avis', f: function (s) { return s.reco ? avis(s.reco) : ''; } },
      { t: 'Rentab. retenue', f: function (s) { return pct(s.rentab); } },
      { t: 'Écoulement', f: function (s) { return pct(s.ecoul); } },
      { t: 'Vendus', f: function (s) { return nbr(s.nv) + ' / ' + nbr(s.n); } },
      { t: 'Investi', f: function (s) { return eur(s.cout); } },
      { t: 'En stock', f: function (s) { return eur(s.cout_stock); } },
      { t: 'Réalisée', f: function (s) { return pct(s.rentab_real); }, cls: function (s) { return s.rentab_real < 0 ? 'pl-neg' : ''; } },
      { t: 'Attendue', f: function (s) { return pct(s.rentab_att); } },
      { t: 'Délai médian', f: function (s) { return s.n_delais ? NF0.format(s.delai_median) + ' j' : '—'; } }
    ], lignes.slice(0, limite), tot, 'Analyse par ' + A.dim.nom)].concat(lignes.length > limite
      ? [h('button', { type: 'button', class: 'btn btn--ghost pl-plus', text: 'Afficher les ' + (lignes.length - limite) + ' suivantes', onclick: function () { fa.tout = true; rendre(true); } })] : []),
      (fa.dim === 'type' ? '' : 'Cartes seulement : le scellé n’a ni rareté ni extension (il est dans « Type de produit »). ') + 'Rentabilité = bénéfice net ÷ coût d’achat. Réalisée : sur ce qui est vendu. Attendue : sur le stock, revendu au prix que tu obtiens d’habitude par rapport au prix marché. Retenue : les deux mêlées, d’autant plus vers la réalisée qu’il y a de ventes.'));
    var cap = lignes.filter(function (s) { return s.cout_stock > 0.5; }).sort(function (a, b) { return b.cout_stock - a.cout_stock; }).slice(0, 10);
    if (cap.length) m.appendChild(section('Où dort ton capital', [barres(cap.map(function (s) {
      return { l: s.cle, s: nbr(s.n - s.nv) + ' en stock · ' + pct(s.part_capital) + ' du stock', v: s.cout_stock, txt: eur(s.cout_stock) };
    }), 'Capital immobilisé par segment')], 'Coût d’achat du stock encore à vendre.'));
    m.appendChild(blocBudget());
    /* PSA ou brute */
    var G = fa.dim === 'gradation' ? A : An.segments(R, 'gradation');
    var psa = G.lignes.filter(function (s) { return s.cle === 'PSA 10'; })[0], brute = G.lignes.filter(function (s) { return s.cle === 'Brute'; })[0];
    var comp = psa && brute ? tableau([
      { t: '', f: function (l) { return l[0]; } },
      { t: 'PSA 10', f: function (l) { return l[1](psa); } },
      { t: 'Brutes', f: function (l) { return l[1](brute); } }
    ], [
      ['Coût moyen par carte', function (s) { return eur(s.cout_moyen); }],
      ['Vendues', function (s) { return nbr(s.nv) + ' / ' + nbr(s.n); }],
      ['Écoulement', function (s) { return pct(s.ecoul); }],
      ['Rentabilité réalisée', function (s) { return pct(s.rentab_real); }],
      ['Rentabilité attendue', function (s) { return pct(s.rentab_att); }],
      ['Rentabilité retenue', function (s) { return pct(s.rentab); }],
      ['Capital en stock', function (s) { return eur(s.cout_stock); }]
    ], null, 'PSA 10 et cartes brutes') : null;
    m.appendChild(section('PSA ou brute', [comp, simulateurGradation()], comp ? 'Tes PSA 10 face à tes cartes brutes, puis le calcul pour une carte précise.' : null));
  };
  function dateAchatCarte(r) {
    var a = r.c.achat || {}, id = (a.mode === 'ticket' && a.ticket) || r.c.ticket, t = id ? S.R.ticketsParId[id] : null;
    return r.c.date_achat || (t && t.t && t.t.date) || null;
  }
  /* prochain voyage : répartition d'un budget (mise à jour sur place, sans redessiner la page) */
  function blocBudget() {
    var An = w.PRAnalyse, fa = S.fa;
    var champ = h('input', { class: 'input', id: 'pl-budget', type: 'text', inputmode: 'decimal', autocomplete: 'off' });
    champ.value = texteNombre(fa.budget);
    var sel = h('select', { class: 'select', id: 'pl-budget-dim' }, An.DIMENSIONS.filter(function (x) { return x.id !== 'canal' && x.id !== 'groupe'; })
      .map(function (x) { return h('option', { value: x.id, text: x.nom }); }));
    sel.value = fa.dimBudget;
    var zone = h('div', { class: 'pl-budget', 'aria-live': 'polite' }), minuteur = null;
    function dessiner() {
      zone.textContent = '';
      var Ab = An.segments(S.R, fa.dimBudget), rep = An.repartition(Ab, fa.budget);
      if (!rep.lignes.length) { zone.appendChild(h('p', { class: 'pl-note', text: 'Aucun segment assez solide pour ce découpage : essaie « Rareté » ou « Bloc ».' })); return; }
      zone.appendChild(h('div', { class: 'pl-kpis' }, [
        tuile('Bénéfice attendu', '≈ ' + eurS(rep.benef), 'une fois tout revendu'),
        tuile('Rentabilité', rep.place ? pct(rep.benef / rep.place) : '—', 'sur ' + eur(rep.place) + ' placés')
      ]));
      if (rep.non_place > 0.5) zone.appendChild(h('p', { class: 'pl-note', text: eur(rep.non_place) + ' non placés : les autres segments ne méritent pas davantage, et aucun ne prend plus de 40 % du budget.' }));
      zone.appendChild(tableau([
        { t: Ab.dim.nom, f: function (l) { return l.s.cle; } },
        { t: 'Budget', f: function (l) { return eur(l.montant); } },
        { t: 'Part', f: function (l) { return pct(l.montant / fa.budget); } },
        { t: 'Bénéfice att.', f: function (l) { return eurS(l.benef); } },
        { t: '≈ Articles', f: function (l) { return l.cartes ? NF0.format(l.cartes) : '—'; } },
        { t: 'Rôle', f: function (l) { return avis(l.role); } }
      ], rep.lignes, null, 'Répartition du budget'));
    }
    champ.addEventListener('input', function () {
      clearTimeout(minuteur);
      minuteur = setTimeout(function () { var v = lireNombre(champ.value).v; if (v != null && v > 0) { fa.budget = v; ecrire('pr.pilotage.budget', String(v)); dessiner(); } }, 350);
    });
    sel.addEventListener('change', function () { fa.dimBudget = sel.value; dessiner(); });
    dessiner();
    return section('Prochain voyage : où placer ton budget', [
      h('div', { class: 'pl-box' }, h('div', { class: 'pl-form' }, [
        h('div', { class: 'field pl-demi' }, [h('label', { for: 'pl-budget', text: 'Budget d’achat (€)' }), champ]),
        h('div', { class: 'field pl-demi' }, [h('label', { for: 'pl-budget-dim', text: 'Répartir par' }), sel])
      ])), zone
    ], 'Chaque segment reçoit une part proportionnelle à rentabilité × écoulement (la logique marge × rotation d’un ROI), plafonnée à 40 % du budget ; 10 % vont tester les 2 meilleurs segments encore trop peu connus. Bénéfice attendu : si ces achats se revendent aux marges observées sur ce segment. Aide à la décision, à relire avec ton œil sur le marché.');
  }
  function simulateurGradation() {
    var An = w.PRAnalyse, P = S.R.params;
    var sim = S.sim || (S.sim = { g_achat: null, g_prix_brute: null, g_prix_psa10: null, g_prix_psa9: null, g_p10: 40, g_p9: 40, g_frais: null, g_delai_mois: 3 });
    var defs = [
      { k: 'g_achat', label: 'Achat brute (€)', type: 'num', demi: true },
      { k: 'g_prix_brute', label: 'Revente brute (€)', type: 'num', demi: true },
      { k: 'g_prix_psa10', label: 'Revente PSA 10 (€)', type: 'num', demi: true },
      { k: 'g_prix_psa9', label: 'Revente PSA 9 (€)', type: 'num', demi: true },
      { k: 'g_p10', label: 'Chance de 10 (%)', type: 'num', demi: true },
      { k: 'g_p9', label: 'Chance de 9 (%)', type: 'num', demi: true },
      { k: 'g_frais', label: 'Gradation (€)', type: 'num', demi: true },
      { k: 'g_delai_mois', label: 'Délai (mois)', type: 'num', demi: true }
    ];
    var form = formulaire(defs, sim), sortie = h('div', { class: 'pl-apercu pl-sec', 'aria-live': 'polite' });
    function calc() {
      defs.forEach(function (df) { sim[df.k] = lireNombre(form.champs[df.k].value).v; });
      if (vide(sim.g_prix_brute) || vide(sim.g_prix_psa10) || vide(sim.g_frais)) { sortie.textContent = 'Renseigne au moins la revente brute, la revente en PSA 10 et le coût de la gradation.'; return; }
      var x = An.simulerGradation({ achat: sim.g_achat, frais: sim.g_frais, prix_brute: sim.g_prix_brute, prix_psa10: sim.g_prix_psa10, prix_psa9: sim.g_prix_psa9,
        p10: sim.g_p10, p9: sim.g_p9, delai_mois: sim.g_delai_mois, fv: P.fv, envoi: P.envoi });
      sortie.textContent = '';
      ajouter(sortie, [
        h('strong', { text: x.conseil === 'grader' ? 'Grader rapporte plus : ' + eurS(x.surplus) + ' par carte en moyenne.' : 'Mieux vaut revendre brute : grader te coûterait ' + eur(-x.surplus) + ' par carte en moyenne.' }),
        h('br'), 'Revente moyenne attendue après gradation : ' + eur(x.esperance) + '. Bénéfice moyen : ' + eurS(x.gain_grader) + ' en gradant, ' + eurS(x.gain_brute) + ' en brute.',
        x.p10_equilibre != null ? h('span', null, [h('br'), 'Grader devient rentable à partir de ' + pct(x.p10_equilibre) + ' de chances d’avoir 10.']) : null,
        x.surplus > 0 && sim.g_delai_mois > 0 ? h('span', null, [h('br'), 'Contrepartie : ' + eur(z(sim.g_achat) + z(sim.g_frais)) + ' bloqués ' + NF0.format(sim.g_delai_mois) + ' mois de plus, soit ' + eurS(x.surplus / sim.g_delai_mois) + ' gagnés par mois d’attente.']) : null
      ]);
    }
    Object.keys(form.champs).forEach(function (k) { form.champs[k].addEventListener('input', calc); });
    calc();
    return h('div', { class: 'pl-box pl-sec pl-sim' }, [h('p', { class: 'pl-label', text: 'Simulateur : faire grader une carte brute ?' }), form.el, sortie,
      h('p', { class: 'pl-note', text: 'Gradation = tarif PSA, envois aller-retour, assurance, TVA et frais au retour, par carte. Le reste des chances (ni 10 ni 9) se revend au prix brut. Frais de vente et d’envoi de tes réglages déduits.' })]);
  }
  function feuilleDatesVentes() {
    var rs = S.R.cartes.filter(function (r) { return r.c.vendu && !r.hors && (!r.c.vente_date || !dateAchatCarte(r)); });
    var champs = {};
    var liste = h('ul', { class: 'pl-dates' }, rs.map(function (r) {
      var c = r.c, ach = dateAchatCarte(r), iv = null, ia = null;
      if (!c.vente_date) iv = h('input', { class: 'input', type: 'date', 'aria-label': 'Date de vente : ' + (c.nom || c.ref) });
      if (!ach) ia = h('input', { class: 'input', type: 'date', 'aria-label': 'Date d’achat : ' + (c.nom || c.ref) });
      champs[c.ref] = { v: iv, a: ia };
      return h('li', null, [vignette(c), h('div', { class: 'pl-dates__m' }, [
        h('p', { class: 'pl-dates__n', text: c.nom || c.ref }), h('p', { class: 'pl-row__meta', text: 'N° ' + c.ref + ' · ' + eur(r.encaisse) + (ach ? ' · achetée le ' + dateFR(ach) : '') + (c.vente_date ? ' · vendue le ' + dateFR(c.vente_date) : '') }),
        h('div', { class: 'pl-dates__c' }, [ia ? h('label', null, [h('span', { text: 'Achat' }), ia]) : null, iv ? h('label', null, [h('span', { text: 'Vente' }), iv]) : null])
      ])]);
    }));
    var tout = h('input', { class: 'input', type: 'date', id: 'pl-dates-tout' });
    tout.addEventListener('change', function () { Object.keys(champs).forEach(function (k) { var iv = champs[k].v; if (iv && !iv.value) iv.value = tout.value; }); });
    var fs = feuille('Dater mes ventes', [h('p', { class: 'pl-note', text: 'Ces dates mesurent la vitesse de vente. Laisse vide ce que tu ne sais pas.' }),
      h('div', { class: 'field' }, [h('label', { for: 'pl-dates-tout', text: 'Mettre cette date de vente aux cases vides' }), tout]), liste],
      [bouton('Annuler', fermer, 'btn--ghost'), h('button', { type: 'submit', class: 'btn', text: 'Enregistrer' })]);
    fs.form.addEventListener('submit', function (e) {
      e.preventDefault();
      var maj = {}, n = 0;
      Object.keys(champs).forEach(function (k) {
        var x = champs[k], o = {};
        if (x.v && x.v.value) o.vente_date = x.v.value;
        if (x.a && x.a.value) o.date_achat = x.a.value;
        if (o.vente_date || o.date_achat) { maj[k] = o; n++; }
      });
      fermer();
      if (!n) return;
      modifier('Dates ajoutées sur ' + n + ' vente' + pl(n), function (doc) { doc.cartes.forEach(function (c) { var o = maj[c.ref]; if (o) Object.keys(o).forEach(function (f) { c[f] = o[f]; }); }); });
    });
  }

  /* ---------------------------------------------------------------- menu « Plus » */
  VUES.plus = function (m) {
    var R = S.R, n = nbAlertes(), al = alertes().length;
    m.appendChild(entete('Plus', majTexte()));
    function item(href, titre, sous) { return h('li', null, h('a', { href: href }, h('span', null, [titre, sous ? h('small', { text: sous }) : null]))); }
    m.appendChild(h('ul', { class: 'pl-menu' }, [
      item('#achats', 'Achats et tickets', R.tickets.length + ' tickets · ' + eur(R.k.investi) + ' investis au total'),
      item('#controles', 'Contrôles', al ? al + ' point' + pl(al) + ' à vérifier' + (n ? ' · ' + n + ' à faire avec le site' : '') : 'Tout est en ordre'),
      item('#lots', 'Lots PSA 10', R.lots.length + ' lots · ' + R.lots.reduce(function (s, L) { return s + L.cartes.length; }, 0) + ' cartes'),
      item('#scelle', 'Scellé et quantités', R.produits.map(function (x) { return x.p.id === 'cardsets' ? 'card sets' : x.p.id; }).join(', ')),
      item('#reglages', 'Réglages, export et historique', 'Taux du yen, frais, Excel, sauvegardes'),
      item('gestion.html', 'Page Gestion', 'Statuts et prix du site, ajout de cartes'),
      item('index.html', 'Retour au site', 'pokeraichu.com')
    ]));
  };

  /* ---------------------------------------------------------------- réglages, export, historique */
  VUES.reglages = function (m) {
    var P = S.doc.params, notes = (S.doc.meta && S.doc.meta.notes_params) || {};
    m.appendChild(h('a', { class: 'pl-back', href: '#plus', text: '‹ Plus' }));
    m.appendChild(entete('Réglages', majTexte()));
    var form = formulaire([
      { k: 'taux_jpy', label: '1 € = combien de yens', type: 'num', demi: true, aide: 'Sert à convertir tous les tickets et lots.' },
      { k: 'frais_envoi', label: 'Frais d’envoi par envoi (€)', type: 'num', demi: true, aide: 'La pochette à bulles ; le port est payé par le client.' },
      { k: 'frais_vente', label: 'Frais de vente (%)', type: 'num', demi: true, aide: notes.frais_vente || 'Commission du canal de vente.' },
      { k: 'tva_import', label: 'TVA à l’import (%)', type: 'num', demi: true, aide: 'Hypothèse : 0 % (pas de TVA payée à l’import).' },
      { k: 'rentabilite_estimee', label: 'Rentabilité retenue sans prix d’achat (%)', type: 'num', aide: 'Coût estimé = prix ÷ (1 + ce taux), pour les cartes sans prix payé.' },
      { k: 'gardees', label: 'Cartes que tu gardes', type: 'select', options: [['avec', 'Comptées dans les totaux'], ['sans', 'Retirées des totaux']] }
    ], { taux_jpy: P.taux_jpy, frais_envoi: P.frais_envoi, frais_vente: z(P.frais_vente) * 100, tva_import: z(P.tva_import) * 100, rentabilite_estimee: z(P.rentabilite_estimee) * 100, gardees: P.gardees_dans_totaux === false ? 'sans' : 'avec' });
    var f = h('form', { class: 'pl-box', novalidate: true }, [form.el, h('div', { class: 'pl-actions' }, h('button', { type: 'submit', class: 'btn', text: 'Enregistrer les réglages' }))]);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var x = form.lire();
      if (!x) return;
      if (!(x.taux_jpy > 0)) { form.erreur('taux_jpy', 'Le taux doit être positif.'); return; }
      modifier('Réglages · 1 € = ' + nbr(x.taux_jpy) + ' ¥, envoi ' + eur(x.frais_envoi, 2), function (doc) {
        doc.params.taux_jpy = x.taux_jpy; doc.params.frais_envoi = z(x.frais_envoi);
        doc.params.frais_vente = z(x.frais_vente) / 100; doc.params.tva_import = z(x.tva_import) / 100;
        doc.params.rentabilite_estimee = z(x.rentabilite_estimee) / 100; doc.params.gardees_dans_totaux = x.gardees !== 'sans';
      });
    });
    m.appendChild(section('Paramètres de calcul', [f]));
    var fichier = h('input', { type: 'file', accept: 'application/json,.json', class: 'pl-file', 'aria-label': 'Choisir une sauvegarde .json' });
    fichier.addEventListener('change', function () { if (fichier.files && fichier.files[0]) importerFichier(fichier.files[0]); });
    m.appendChild(section('Tes données', [h('ul', { class: 'pl-menu' }, [
      h('li', null, h('button', { type: 'button', onclick: exporterExcel }, h('span', null, ['Télécharger en Excel', h('small', { text: 'Toutes les feuilles : synthèse, cartes, ventes, tickets, lots, produits' })]))),
      h('li', null, h('button', { type: 'button', onclick: exporterJSON }, h('span', null, ['Télécharger une sauvegarde', h('small', { text: 'Fichier .json, réimportable ici' })]))),
      h('li', null, h('button', { type: 'button', onclick: feuilleHistorique }, h('span', null, ['Historique des versions', h('small', { text: 'Revenir à une version précédente (60 gardées)' })])))
    ]), details('Importer une sauvegarde (.json)', null, [h('div', { class: 'pl-box' }, [h('p', { class: 'pl-note', text: 'Remplace toutes les données actuelles. La version actuelle reste dans l’historique.' }), fichier])])]));
    var j = (S.doc.journal || []).slice(0, 40);
    m.appendChild(section('Journal', [j.length ? h('ul', { class: 'pl-rows' }, j.map(function (x) {
      return h('li', null, h('div', { class: 'pl-row pl-row--sans' }, [h('span', { class: 'pl-row__main' }, [h('span', { class: 'pl-row__nom', text: x.quoi }), h('span', { class: 'pl-row__meta', text: quand(x.le) })])]));
    })) : h('p', { class: 'pl-box', text: 'Les modifications faites ici apparaîtront dans ce journal.' })]));
    m.appendChild(h('p', { class: 'pl-note', text: 'Données privées : elles sont rangées dans ta base Cloudflare et ne s’ouvrent qu’avec ta clé de gestion. Rien n’est publié sur le site ni sur GitHub.' }));
  };
  function feuilleHistorique() {
    var liste = h('ul', { class: 'pl-choix' }, h('li', null, h('p', { class: 'pl-note', text: 'Chargement…' })));
    feuille('Historique des versions', [liste]);
    api('GET', '/historique').then(function (x) {
      liste.textContent = '';
      if (x.s !== 200) { liste.appendChild(h('li', null, h('p', { text: 'Historique indisponible.' }))); return; }
      x.j.versions.forEach(function (v) {
        var actuelle = v.rev === S.rev;
        liste.appendChild(h('li', null, h('button', { type: 'button', disabled: actuelle || null, onclick: function () { restaurer(v); } }, [
          h('span', null, ['Version ' + v.rev + (actuelle ? ' (actuelle)' : ''), h('small', { text: quand(v.maj) + ' · ' + (v.note || '') })]),
          h('span', { text: actuelle ? '' : 'Restaurer' })])));
      });
    }, function () { liste.textContent = ''; liste.appendChild(h('li', null, h('p', { text: 'Pas de réseau.' }))); });
  }
  function restaurer(v) {
    confirmer('Restaurer la version ' + v.rev + ' ?', 'Les données redeviennent celles du ' + quand(v.maj) + '. La version actuelle reste dans l’historique.', 'Restaurer', function () {
      api('GET', '/version?rev=' + v.rev).then(function (x) {
        if (x.s !== 200 || !docValide(x.j.data)) { alerte('Restauration impossible', 'Version introuvable.'); return; }
        var avant = JSON.stringify(S.doc);
        installer(x.j.data);
        var j = S.doc.journal || (S.doc.journal = []);
        j.unshift({ le: new Date().toISOString(), quoi: 'Restauration de la version ' + v.rev });
        calculer();
        planifier('Restauration de la version ' + v.rev + ' du ' + quand(v.maj));
        rendre(false);
        toast('Version ' + v.rev + ' restaurée', function () { installer(JSON.parse(avant)); planifier('Annulation de la restauration'); rendre(true); });
      });
    });
  }
  function telecharger(blob, nom) {
    var u = URL.createObjectURL(blob), a = h('a', { href: u, download: nom });
    d.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 5000);
  }
  function exporterJSON() {
    telecharger(new Blob([JSON.stringify(S.doc)], { type: 'application/json' }), 'pokeraichu-pilotage-' + aujourdhui() + '.json');
  }
  function importerFichier(f) {
    var lu = new FileReader();
    lu.onload = function () {
      var doc;
      try { doc = JSON.parse(lu.result); } catch (e) { alerte('Fichier illisible', 'Ce fichier n’est pas une sauvegarde du pilotage.'); return; }
      if (!docValide(doc)) { alerte('Fichier illisible', 'Ce fichier n’est pas une sauvegarde du pilotage.'); return; }
      ecranApercu(doc, 'Import d’une sauvegarde (' + f.name + ')');
    };
    lu.readAsText(f);
  }
  function exporterExcel() {
    var s = q('script[data-xlsx]'), src = s ? s.getAttribute('data-xlsx') : 'assets/js/pilotage-xlsx.js';
    (w.PRXlsx ? Promise.resolve() : new Promise(function (ok, ko) { var e = d.createElement('script'); e.src = src; e.onload = ok; e.onerror = ko; d.head.appendChild(e); }))
      .then(function () { telecharger(new Blob(w.PRXlsx.morceaux(feuillesExport()), { type: w.PRXlsx.TYPE }), 'POKE-RAICHU-pilotage-' + aujourdhui() + '.xlsx'); })
      .catch(function () { alerte('Export impossible', 'Vérifie ta connexion puis réessaie.'); });
  }
  function feuillesExport() {
    var R = S.R, k = R.k, st = R.stock, P = R.params, vt = R.ventesTotal;
    var synth = { nom: 'Synthèse', filtre: false, colonnes: [{ titre: 'Indicateur', largeur: 48 }, { titre: 'Montant (€)', format: 'euro', largeur: 16 }, { titre: 'Taux', format: 'pct', largeur: 10 }, { titre: 'Nombre', largeur: 10 }], gras: [0], lignes: [
      ['Bénéfice net réalisé', k.benef], ['Encaissé', k.encaisse, null, k.vendus], ['Coût d’achat des articles vendus (réel + estimé)', k.cout_ventes],
      ['dont coût estimé (cartes sans prix d’achat)', k.cout_estime_ventes], ['Frais d’envoi', k.envois], ['Frais de vente', k.frais_vente],
      ['Rentabilité (bénéfice ÷ coût d’achat)', null, k.rentab], ['Taux de marque (bénéfice ÷ prix de vente)', null, k.taux_marque], ['Prix moyen de vente', k.prix_moyen],
      ['Investi (prix d’achat réels)', k.investi], ['Revenu (encaissé − frais)', k.recupere], ['Reste à récupérer', k.reste], ['Investissement récupéré', null, k.pct_recupere],
      ['Valeur marché du stock', st.valeur, null, st.cartes], ['Coût du stock (prix réels)', st.cout_reel], ['Coût du stock (estimé)', st.cout_estime],
      ['Plus-value latente du stock', st.latent], ['Résultat projeté (réalisé + plus-value du stock)', k.resultat_projete], ['Cartes en stock sans prix marché', null, null, st.sans_prix],
      ['Valeur marché de toute la collection (Synthèse de l’Excel)', R.synthTotal.valeur, null, R.synthTotal.nb], ['Marge nette de toute la collection', R.synthTotal.marge, R.synthTotal.gain]
    ] };
    var groupes = { nom: 'Synthèse par groupe', colonnes: [{ titre: 'Groupe', largeur: 40 }, { titre: 'Nb', largeur: 8 }, { titre: 'Payé (€)', format: 'euro' }, { titre: 'Valeur marché (€)', format: 'euro', largeur: 18 }, { titre: 'Marge nette (€)', format: 'euro', largeur: 16 }, { titre: 'Gain (%)', format: 'pct', largeur: 10 }],
      lignes: R.synthese.concat([R.synthTotal]).map(function (l) { return [l.libelle, l.nb, l.paye, l.valeur, l.marge, l.gain]; }), gras: [R.synthese.length] };
    var cartes = { nom: 'Cartes', colonnes: [
      { titre: 'N°', largeur: 8 }, { titre: 'Pokémon', largeur: 40 }, { titre: 'Groupe', largeur: 14 }, { titre: 'Catégorie', largeur: 14 }, { titre: 'Langue', largeur: 8 },
      { titre: 'Prix marché (€)', format: 'euro' }, { titre: 'Marge nette (€)', format: 'euro' }, { titre: 'Payé (€)', format: 'euro' }, { titre: 'Payé estimé (€)', format: 'euro' }, { titre: 'Gain (%)', format: 'pct', largeur: 10 },
      { titre: 'Nom anglais', largeur: 28 }, { titre: 'Set', largeur: 30 }, { titre: 'Rareté', largeur: 10 }, { titre: 'État', largeur: 18 }, { titre: 'Nom sur le ticket', largeur: 26 },
      { titre: 'Prix ticket (¥)', format: 'yen' }, { titre: 'Boutique', largeur: 24 }, { titre: 'Date d’achat', format: 'date', largeur: 12 }, { titre: 'Ticket', largeur: 10 }, { titre: 'Mode d’achat', largeur: 12 }, { titre: 'Lot', largeur: 8 },
      { titre: 'Vérification', largeur: 24 }, { titre: 'Remarque', largeur: 50 }, { titre: 'Gardée', largeur: 8 }, { titre: 'Vendu', largeur: 8 }, { titre: 'Prix vendu (€)', format: 'euro' },
      { titre: 'Date de vente', format: 'date', largeur: 12 }, { titre: 'Canal', largeur: 12 }, { titre: 'Bénéfice vente (€)', format: 'euro' }, { titre: 'Encaissé (€)', format: 'euro' }],
      lignes: R.cartes.map(function (r) {
        var c = r.c, a = c.achat || {};
        return [c.ref, c.nom, c.groupe, c.cat, c.langue, c.prix, r.marge, r.paye, r.estime, r.gain, c.nom_en, c.set, c.rarete, c.etat, c.nom_ticket, c.yen, c.boutique, c.date_achat, c.ticket,
          a.mode || '', a.lot || '', c.verif, c.remarque, c.gardee ? 'Oui' : 'Non', c.vendu ? 'Oui' : 'Non', c.vendu ? r.encaisse : null, c.vente_date, c.canal, r.benef, r.encaisse];
      }) };
    var ventes = { nom: 'Ventes', colonnes: [{ titre: 'N°', largeur: 8 }, { titre: 'Article', largeur: 40 }, { titre: 'Groupe', largeur: 14 }, { titre: 'Date', format: 'date', largeur: 12 }, { titre: 'Canal', largeur: 12 },
      { titre: 'Prix vendu (€)', format: 'euro' }, { titre: 'Frais de vente (€)', format: 'euro' }, { titre: 'Coût (€)', format: 'euro' }, { titre: 'Frais d’envoi (€)', format: 'euro' }, { titre: 'Bénéfice net (€)', format: 'euro' }, { titre: 'Rentabilité', format: 'pct', largeur: 11 }, { titre: 'Coût', largeur: 9 }],
      lignes: R.cartes.filter(function (r) { return r.vente; }).map(function (r) {
        return [r.c.ref, r.c.nom, r.c.groupe, r.c.vente_date, r.c.canal, r.vente.encaisse, r.vente.frais, r.vente.cout, r.vente.envoi, r.vente.net, r.vente.rentab, r.source];
      }).concat(R.produits.filter(function (x) { return x.vente.vendus > 0; }).map(function (x) {
        return ['', x.p.nom + ' (× ' + x.vente.vendus + ')', 'Produits', null, null, x.vente.encaisse, x.vente.frais, x.vente.cout, x.vente.envoi, x.vente.net, x.vente.cout ? x.vente.net / x.vente.cout : null, 'réel'];
      })).concat([['', 'Total', '', null, null, vt.encaisse, vt.frais, vt.cout, vt.envoi, vt.net, vt.rentab, '']]) };
    ventes.gras = [ventes.lignes.length - 1];
    var tickets = { nom: 'Tickets', colonnes: [{ titre: 'Ticket', largeur: 8 }, { titre: 'Boutique', largeur: 30 }, { titre: 'Date', format: 'date', largeur: 12 }, { titre: 'Total (¥)', format: 'yen' }, { titre: 'Détaxe (¥)', format: 'yen' },
      { titre: 'Payé (¥)', format: 'yen' }, { titre: 'Payé (€)', format: 'euro' }, { titre: 'Nb cartes', largeur: 10 }, { titre: 'Cartes (¥)', format: 'yen' }, { titre: 'Contrôle', largeur: 10 }, { titre: 'Note', largeur: 60 }],
      lignes: R.tickets.map(function (x) { return [x.id, x.t.boutique, x.t.date, x.t.total_yen, x.detaxe, x.paye_yen, x.paye_eur, x.nb, x.somme_yen, x.nb ? (x.ok ? 'OK' : 'Écart') : 'Sans carte', x.t.note]; }) };
    var lots = { nom: 'Lots', colonnes: [{ titre: 'Lot', largeur: 10 }, { titre: 'Payé (¥)', format: 'yen' }, { titre: 'Payé (€)', format: 'euro' }, { titre: 'Valeur marché (€)', format: 'euro' }, { titre: 'Cartes', largeur: 70 }],
      lignes: R.lots.map(function (L) { return [L.id, L.l.paye_yen, L.paye_eur, L.prix_total, L.cartes.map(function (c) { return c.nom + (c.vendu ? ' (vendue)' : ''); }).join(' · ')]; }) };
    var produits = { nom: 'Produits', colonnes: [{ titre: 'Produit', largeur: 46 }, { titre: 'Quantité', largeur: 10 }, { titre: 'Vendus', largeur: 10 }, { titre: 'En stock', largeur: 10 }, { titre: 'Prix unitaire (€)', format: 'euro' },
      { titre: 'Payé (€)', format: 'euro' }, { titre: 'Valeur marché (€)', format: 'euro' }, { titre: 'Marge nette (€)', format: 'euro' }, { titre: 'Encaissé (€)', format: 'euro' }, { titre: 'Bénéfice ventes (€)', format: 'euro' }],
      lignes: R.produits.map(function (x) { return [x.p.nom, x.nb, x.vente.vendus, x.reste, x.prix_u, x.connu ? x.paye : null, x.valeur, x.marge, x.vente.encaisse, x.vente.net]; }) };
    var params = { nom: 'Paramètres', filtre: false, colonnes: [{ titre: 'Paramètre', largeur: 44 }, { titre: 'Valeur', largeur: 14 }], lignes: [
      ['1 € = (yens)', P.taux], ['Frais de vente (fraction)', P.fv], ['TVA à l’import (fraction)', P.tva], ['Rentabilité retenue sans prix d’achat (fraction)', P.rent],
      ['Frais d’envoi par envoi (€)', P.envoi], ['Cartes gardées dans les totaux', P.gardees ? 'Oui' : 'Non'], ['Version des données', S.rev], ['Exporté le', quand(new Date().toISOString())]] };
    var journal = { nom: 'Journal', colonnes: [{ titre: 'Date', largeur: 20 }, { titre: 'Action', largeur: 90 }], lignes: (S.doc.journal || []).map(function (x) { return [quand(x.le), x.quoi]; }) };
    return [synth, groupes, cartes, ventes, tickets, lots, produits, params, journal];
  }

  /* ---------------------------------------------------------------- écrans d'entrée : clé, import, erreurs */
  function ecranCle(refusee) {
    var m = principal();
    masquerOnglets();
    sync('', '');
    var champ = h('input', { class: 'input', id: 'pl-cle', type: 'password', autocomplete: 'off', spellcheck: 'false' });
    var f = h('form', { class: 'pl-det__b pl-box', novalidate: true }, [h('div', { class: 'field' }, [h('label', { for: 'pl-cle', text: 'Clé GitHub' }), champ]), h('div', { class: 'pl-actions' }, h('button', { type: 'submit', class: 'btn', text: 'Enregistrer sur cet appareil' }))]);
    f.addEventListener('submit', function (e) { e.preventDefault(); var v = champ.value.trim(); if (v) { ecrire(CLE_JETON, v); demarrer(); } });
    m.appendChild(h('div', { class: 'pl-ecran' }, [
      h('h1', { text: 'Pilotage' }),
      h('p', { text: refusee ? 'La clé enregistrée sur cet appareil a été refusée. Vérifie-la dans la page Gestion, puis reviens ici.'
        : 'Cette page privée s’ouvre avec ta clé de gestion, la même que pour la page Gestion. Ouvre la page Gestion sur cet appareil et enregistre ta clé, puis reviens ici.' }),
      h('div', { class: 'pl-actions' }, h('a', { class: 'btn', href: 'gestion.html', text: 'Ouvrir la page Gestion' })),
      h('details', { class: 'pl-det' }, [h('summary', { text: 'Ou coller la clé ici' }), f])
    ]));
  }
  function ecranMessage(titre, texte, reessai) {
    var m = principal();
    masquerOnglets();
    m.appendChild(h('div', { class: 'pl-ecran' }, [h('h1', { text: titre }), h('p', { text: texte }),
      reessai ? h('div', { class: 'pl-actions' }, h('a', { class: 'btn', href: 'pilotage.html', text: 'Réessayer' })) : null]));
  }
  function ecranImport() {
    var m = principal();
    masquerOnglets();
    var fichier = h('input', { type: 'file', accept: 'application/json,.json', class: 'pl-file', 'aria-label': 'Choisir une sauvegarde .json' });
    fichier.addEventListener('change', function () { if (fichier.files && fichier.files[0]) importerFichier(fichier.files[0]); });
    m.appendChild(h('div', { class: 'pl-ecran' }, [
      h('h1', { text: 'Bienvenue dans ton pilotage' }),
      h('p', { text: 'Il est encore vide. Touche le lien d’import que Claude t’a envoyé : ton Excel arrive ici en une fois.' }),
      details('Ou importer une sauvegarde (.json)', null, [h('div', { class: 'pl-box' }, fichier)])
    ]));
  }
  function ecranApercu(doc, note) {
    var R = K.calcul(doc), m = principal();
    masquerOnglets();
    var go = bouton('Importer', function () { go.disabled = true; importerDoc(doc, note); });
    m.appendChild(h('div', { class: 'pl-ecran' }, [
      h('h1', { text: 'Importer tes données' }),
      h('p', { text: nbr(doc.cartes.length) + ' cartes, ' + doc.tickets.length + ' tickets, ' + doc.lots.length + ' lots et ' + doc.produits.length + ' produits' + (doc.meta && doc.meta.source ? ', venus de ' + doc.meta.source : '') + '.' }),
      h('div', { class: 'pl-kpis' }, [
        tuile('Bénéfice réalisé', eurS(R.k.benef), nbr(R.k.vendus) + ' ventes · ' + eur(R.k.encaisse) + ' encaissés'),
        tuile('Payé (synthèse)', eur(R.synthTotal.paye)),
        tuile('Valeur marché', eur(R.synthTotal.valeur), 'toute la collection'),
        tuile('Marge nette', eur(R.synthTotal.marge), 'gain ' + pct(R.synthTotal.gain))
      ]),
      h('p', { class: 'pl-note', text: 'Ce sont les chiffres de ton Excel (onglets Synthèse et Ventes) : vérifie-les avant d’importer.' }),
      S.rev ? h('p', { class: 'pl-apercu', text: 'Tes données actuelles seront remplacées. Elles restent dans l’historique des versions (Réglages).' }) : null,
      h('div', { class: 'pl-actions' }, [go, h('a', { class: 'btn btn--ghost', href: 'pilotage.html', text: 'Annuler' })])
    ]));
  }
  function importerDoc(doc, note) {
    doc.journal = Array.isArray(doc.journal) ? doc.journal : [];
    doc.journal.unshift({ le: new Date().toISOString(), quoi: note });
    chargement('Import en cours…');
    api('PUT', '', { base: S.rev, data: doc, note: note }).then(function (x) {
      if (x.s !== 200) throw new Error(x.s === 409 ? 'les données ont changé entre-temps : recharge la page' : (x.j.erreur || 'erreur ' + x.s));
      S.rev = x.j.rev; S.maj = x.j.maj;
      installer(doc);
      effacer(CLE_ATTENTE);
      history.replaceState(null, '', location.pathname + '#bord');
      route();
      sync('ok');
      chargerSite();
      toast('Import terminé : ' + nbr(doc.cartes.length) + ' cartes');
    }).catch(function (e) { ecranMessage('Import impossible', String(e.message || e), true); });
  }
  function octets(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var b = atob(s), u = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return u;
  }
  function importerLien(id, cle) {
    chargement('Ouverture du lien d’import…');
    if (!w.crypto || !w.crypto.subtle || !w.TextDecoder) { ecranMessage('Import impossible', 'Ce navigateur ne sait pas ouvrir le lien. Ouvre-le dans Safari.'); return; }
    fetch('pilotage/import-' + id + '.bin', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status === 404 ? 'ce lien a expiré' : 'erreur ' + r.status); return r.arrayBuffer(); })
      .then(function (buf) {
        return crypto.subtle.importKey('raw', octets(cle), { name: 'AES-GCM' }, false, ['decrypt']).then(function (k) {
          return crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(buf, 0, 12) }, k, new Uint8Array(buf, 12));
        });
      })
      .then(function (pt) {
        var doc = JSON.parse(new TextDecoder().decode(pt));
        if (!docValide(doc)) throw new Error('données illisibles');
        ecranApercu(doc, 'Import de l’Excel (' + ((doc.meta && doc.meta.source) || 'lien') + ')');
      })
      .catch(function (e) { ecranMessage('Import impossible', 'Le lien n’a pas pu être ouvert (' + (e && e.message ? e.message : 'clé incorrecte') + '). Demande un nouveau lien à Claude.', true); });
  }

  /* ---------------------------------------------------------------- démarrage */
  function demarrer() {
    if (!K) { ecranMessage('Chargement incomplet', 'Recharge la page.', true); return; }
    if (!jeton()) { ecranCle(false); return; }
    chargement('Chargement de tes données…');
    api('GET').then(function (x) {
      if (x.s === 401) { ecranCle(true); return; }
      if (x.s === 503) { ecranMessage('Base indisponible', 'La base de données Cloudflare ne répond pas. Réessaie dans un moment.', true); return; }
      if (x.s !== 200) { ecranMessage('Chargement impossible', 'Le serveur a répondu « ' + (x.j.erreur || 'erreur ' + x.s) + ' ».', true); return; }
      S.rev = x.j.rev || 0; S.maj = x.j.maj;
      var imp = /^#import=([a-f0-9]{8,40})\.([A-Za-z0-9_-]{43})$/.exec(location.hash);
      if (imp) { importerLien(imp[1], imp[2]); return; }
      if (!x.j.data) { ecranImport(); return; }
      installer(x.j.data);
      sync('ok');
      route();
      reprendreAttente();
      chargerSite();
    }, function () { ecranMessage('Pas de réseau', 'Impossible de joindre pokeraichu.com. Vérifie ta connexion puis réessaie.', true); });
  }
  w.addEventListener('hashchange', function () {
    if (/^#import=/.test(location.hash)) { demarrer(); return; }
    if (S.doc) { fermer(); route(); }
  });
  w.addEventListener('beforeunload', function (e) { if (S.sale || S.envoi) { e.preventDefault(); e.returnValue = ''; } });
  d.addEventListener('visibilitychange', function () { if (d.visibilityState === 'hidden' && S.sale) enregistrer(); });
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
