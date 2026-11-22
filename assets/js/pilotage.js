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
  var d = document, w = window, C = w.PR_CONFIG || {}, K = w.PRCalcul, G = w.PRGraph, PB = w.PRBord;
  var CLE_JETON = 'pr.gestion.jeton', CLE_ATTENTE = 'pr.pilotage.attente', CLE_CANAL = 'pr.pilotage.canal';
  var CANAUX = ['WhatsApp', 'Instagram', 'eBay', 'Vinted', 'Leboncoin', 'Whatnot', 'Cardmarket', 'Salon', 'Dépôt-vente', 'Autre'];
  var MODES = [['', 'Pas de prix d’achat (coût estimé)'], ['ticket', 'Ticket japonais (¥, détaxe du ticket)'], ['yen', 'Prix en ¥ sans ticket'],
    ['eur', 'Montant payé en €'], ['lot', 'Part d’un lot (au prorata du prix marché)']];
  var LANGUES = [['JP', 'JP'], ['FR', 'FR'], ['KR', 'KR'], ['EN', 'EN'], ['CN', 'CN']];
  var TRIS = [['valeur', 'Prix ↓'], ['marge', 'Plus-value ↓'], ['gain', 'Rentabilité ↓'], ['cout', 'Coût ↓'], ['ref', 'N°'], ['nom', 'Nom A → Z'], ['vente', 'Dernières ventes']];
  var S = {
    doc: null, rev: 0, maj: null, R: null, vue: 'bord', arg: '', site: null, statuts: null,
    f: { q: '', statut: 'stock', groupe: '', cat: '', langue: '', tri: 'valeur', manque: false },
    sale: false, note: '', envoi: null, relancer: false, essais: 0, minuteur: null, tt: null, majListe: null,
    fb: { periode: 'tout', groupe: '', langue: '', canal: '', gamme: '' }, tris: {}, vueT: {}
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
  /* date de vente retenue (moteur : vraie date, sinon règle « achat + 7 jours ») */
  function quandVendue(r) { return r && r.date_vente ? (r.vente_estimee ? 'vers le ' : 'le ') + dateFR(r.date_vente) : null; }
  function dateVenteCourte(r) { return r && r.date_vente ? (r.vente_estimee ? '≈ ' : '') + dateFR(r.date_vente) : '—'; }
  function sansDoublons(l) { var vu = {}; return l.filter(function (x) { if (!x) return false; var k = String(x).toLowerCase(); if (vu[k]) return false; vu[k] = 1; return true; }); }
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
  /* dans les tableaux, seul le négatif est coloré */
  function neg(v) { return !vide(v) && v < -0.005 ? 'pl-neg' : ''; }
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

  /* coffrets 30th Premium Deck ouverts et Pikachu-ex 132/M-P (nuit) FUR échangé contre des displays (20/11/2026).
     Appliqué une seule fois, à l'ouverture et à chaque import, tracé dans le journal et dans meta.retraits :
     - le produit « coffret » disparaît ; ses cartes (groupe « Coffret Premium Deck », hors totaux) passent dans le
       groupe « 30 ans » et sont comptées à l'unité (même coût, même valeur qu'avant) ;
     - 3 exemplaires de Mentali-ex 043, Noctali-ex 044 et Victini 041 : les 2 de plus sont ajoutés, prix payé à compléter ;
     - le Pikachu FUR (290) est retiré.
     La version déployée le 20/11 au matin retirait aussi les cartes du coffret : si elle est déjà passée sur les données,
     ces cartes sont reprises dans l'historique des versions (dernière version avant ce retrait). */
  var OUVERT = 'coffret-ouvert-2026-11-20', GR_COFFRET = 'Coffret Premium Deck', GR_30 = '30 ans';
  var EXEMPLAIRES = { P1: 3, P2: 3, P3: 3 };
  function faitsDe(doc) { return (doc.meta && Array.isArray(doc.meta.retraits)) ? doc.meta.retraits : []; }
  function aReprendre(doc) {
    return faitsDe(doc).indexOf(OUVERT) === -1 && faitsDe(doc).indexOf('retrait-2026-11-19') !== -1 &&
      !(doc.cartes || []).some(function (c) { return c.ref === 'P1'; });
  }
  function coffretOuvert(doc, repris) {
    doc.meta = doc.meta || {};
    if (!Array.isArray(doc.meta.retraits)) doc.meta.retraits = [];
    if (doc.meta.retraits.indexOf(OUVERT) !== -1) return '';
    var cartes = (doc.cartes || []).slice(), refs = {};
    cartes.forEach(function (c) { refs[c.ref] = 1; });
    (repris || []).forEach(function (c) { if (!refs[c.ref]) { cartes.push(c); refs[c.ref] = 1; } });
    var avant = cartes.length;
    cartes = cartes.filter(function (c) { return !(c.ref === '290' && /132\/M-P/.test(c.nom || '')); });
    var pika = cartes.length !== avant;
    doc.produits = (doc.produits || []).filter(function (p) { return p.id !== 'coffret'; });
    doc.groupes = (doc.groupes || []).filter(function (g) { return g.id !== GR_COFFRET; });
    var du = cartes.filter(function (c) { return c.groupe === GR_COFFRET; });
    if (du.length) {
      cartes = cartes.filter(function (c) { return c.groupe !== GR_COFFRET; });
      du.forEach(function (c) {
        c.groupe = GR_30;
        c.remarque = String(c.remarque || '').replace(/Carte du coffret scellé \(hors totaux[^)]*\)\.?\s*/, 'Carte d’un coffret 30th Premium Deck ouvert. ');
        /* le prix du coffret était réparti sur Mentali et Noctali : les autres cartes du coffret n'ont rien coûté en plus */
        if (!c.achat || !c.achat.mode) { c.achat = { mode: 'eur', eur: 0 }; c.remarque += ' Coût du coffret porté par Mentali et Noctali.'; }
      });
      var fin = -1;
      cartes.forEach(function (c, i) { if (c.groupe === GR_30) fin = i; });
      Array.prototype.splice.apply(cartes, [fin === -1 ? cartes.length : fin + 1, 0].concat(du));
    }
    /* exemplaires en plus, rangés juste après la carte d'origine */
    var ajoutes = 0;
    Object.keys(EXEMPLAIRES).forEach(function (ref) {
      var k = cartes.map(function (c) { return c.ref; }).indexOf(ref);
      if (k === -1) return;
      var c = cartes[k], copies = [];
      for (var i = 2; i <= EXEMPLAIRES[ref]; i++) {
        var r = ref + '-' + i;
        if (refs[r]) continue;
        refs[r] = 1;
        var n = { ref: r, groupe: c.groupe, vendu: false, prix_vendu: null, vente_date: null, canal: null, gardee: false,
          alias_site: (c.alias_site || []).slice(), lots_site: [],
          remarque: 'Ajoutée le 20/11 : ' + i + 'e exemplaire (coffrets ouverts, tu en as ' + EXEMPLAIRES[ref] + '). Prix payé à compléter.' };
        ['nom', 'nom_en', 'cat', 'langue', 'prix', 'set', 'rarete', 'etat', 'ebay'].forEach(function (f) { if (c[f] != null) n[f] = c[f]; });
        copies.push(n);
      }
      ajoutes += copies.length;
      Array.prototype.splice.apply(cartes, [k + 1, 0].concat(copies));
    });
    doc.cartes = cartes;
    doc.meta.retraits.push(OUVERT);
    var note = 'Coffrets 30th Premium Deck ouverts : cartes comptées à l’unité dans « 30 ans »' +
      (ajoutes ? ', 3 Mentali-ex 043, 3 Noctali-ex 044 et 3 Victini 041' : '') + (pika ? ' · Pikachu-ex 132/M-P (nuit) FUR échangé : retiré' : '');
    if (!Array.isArray(doc.journal)) doc.journal = [];
    doc.journal.unshift({ le: new Date().toISOString(), quoi: note });
    return note;
  }
  function ouvrirCoffret() {
    var doc = S.doc;
    if (faitsDe(doc).indexOf(OUVERT) !== -1) return;
    function fin(repris) {
      if (S.doc !== doc) return;
      var note = coffretOuvert(doc, repris);
      if (!note) return;
      calculer();
      planifier(note);
      rendre(true);
      toast(note);
    }
    if (!aReprendre(doc)) { fin(null); return; }
    api('GET', '/historique').then(function (x) {
      if (x.s !== 200 || !x.j || !Array.isArray(x.j.versions)) return null;
      var vs = x.j.versions;
      var retrait = vs.filter(function (v) { return /Retirés \(plus en stock\)/.test(v.note || ''); }).sort(function (a, b) { return a.rev - b.rev; })[0];
      var base = retrait && vs.filter(function (v) { return v.rev < retrait.rev; }).sort(function (a, b) { return b.rev - a.rev; })[0];
      if (!base) return null;
      return api('GET', '/version?rev=' + base.rev).then(function (y) {
        var repris = y.s === 200 && y.j && y.j.data ? (y.j.data.cartes || []).filter(function (c) { return c.groupe === GR_COFFRET; }) : [];
        if (repris.length) fin(repris);
      });
    }).catch(function () {});
  }

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
  /* tableau : colonnes { t: titre, f: contenu, cls, v: valeur pour trier, barre: mini-barre proportionnelle à v } ;
     opts.cle : tri au toucher des en-têtes (gardé pendant la session) */
  function tableau(cols, lignes, total, legende, opts) {
    opts = opts || {};
    var boite = h('div', { class: 'pl-scroll' }), cle = opts.cle;
    function construire() {
      var etat = cle ? S.tris[cle] : null, L = lignes.slice();
      if (etat && cols[etat.i] && cols[etat.i].v) {
        var fv = cols[etat.i].v, k = etat.sens === 'asc' ? 1 : -1;
        L.sort(function (a, b) {
          var x = fv(a), y = fv(b);
          if (vide(x) || x === '') return vide(y) || y === '' ? 0 : 1;
          if (vide(y) || y === '') return -1;
          return k * (typeof x === 'string' ? String(x).localeCompare(String(y), 'fr', { numeric: true }) : x - y);
        });
      }
      var max = {};
      cols.forEach(function (c, i) { if (c.barre && c.v) max[i] = Math.max.apply(null, L.map(function (l) { return Math.abs(z(c.v(l))); }).concat([0])); });
      var t = h('table', { class: 'pl-table' });
      if (legende) t.appendChild(h('caption', { class: 'sr-only', text: legende }));
      t.appendChild(h('thead', null, h('tr', null, cols.map(function (c, i) {
        if (!cle || !c.v) return h('th', { scope: 'col', text: c.t });
        var sensT = etat && etat.i === i ? etat.sens : null;
        return h('th', { scope: 'col', 'aria-sort': sensT === 'asc' ? 'ascending' : sensT === 'desc' ? 'descending' : null }, h('button', { type: 'button', class: 'pl-tri', 'data-sens': sensT, text: c.t,
          onclick: function () {
            var e = S.tris[cle];
            S.tris[cle] = !e || e.i !== i ? { i: i, sens: i === 0 ? 'asc' : 'desc' } : e.sens === (i === 0 ? 'asc' : 'desc') ? { i: i, sens: i === 0 ? 'desc' : 'asc' } : null;
            boite.replaceChild(construire(), boite.firstChild);
          } }));
      }))));
      t.appendChild(h('tbody', null, L.map(function (l) {
        return h('tr', opts.trCls ? { class: opts.trCls(l) || null } : null, cols.map(function (c, i) {
          var contenu = c.f(l);
          if (c.barre && c.v && max[i]) {
            var v = z(c.v(l)), b = h('i');
            b.style.width = (Math.abs(v) / max[i] * 100) + '%';
            contenu = h('div', { class: 'pl-td-b' }, [h('span', { class: 'pl-cb' + (v < 0 ? ' pl-cb--neg' : ''), 'aria-hidden': 'true' }, b), h('span', null, contenu)]);
          }
          return h(i ? 'td' : 'th', i ? (c.cls ? { class: c.cls(l) } : null) : { scope: 'row' }, contenu);
        }));
      })));
      if (total) t.appendChild(h('tfoot', null, h('tr', null, cols.map(function (c, i) { var x = c.f(total); return h('td', c.cls && i ? { class: c.cls(total) } : null, x); }))));
      return t;
    }
    boite.appendChild(construire());
    return boite;
  }
  /* petites icônes (traits) */
  var ICONES = {
    table: 'M3.5 5.5h13v9h-13zM3.5 9h13M3.5 12h13M8 5.5v9',
    info: 'M10 3.2a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6zM10 9v4.6M10 6.6v.2',
    fleche: 'M7.5 4.5l5 5.5-5 5.5'
  };
  function icone(nom) { return sv('svg', { viewBox: '0 0 20 20', 'aria-hidden': 'true', focusable: 'false' }, sv('path', { d: ICONES[nom] })); }
  /* carte d'un tableau de bord : titre, sous-titre, contenu ; bouton « Tableau » quand o.table fournit la vue en chiffres */
  function carte(o) {
    var corps = h('div', { class: 'pl-carte__b' }, o.corps);
    var actions = (o.actions || []).slice();
    if (o.table) {
      var vueT = null, cle = o.cle || o.titre;
      var btn = h('button', { type: 'button', class: 'pl-ibtn', 'aria-pressed': 'false', title: 'Voir les chiffres en tableau' }, [icone('table'), 'Tableau']);
      var basculer = function (on) {
        btn.setAttribute('aria-pressed', String(on));
        S.vueT[cle] = on;
        if (on && !vueT) { vueT = h('div', { class: 'pl-vue-t' }, o.table()); corps.appendChild(vueT); }
        Array.prototype.forEach.call(corps.children, function (k) { k.hidden = k === vueT ? !on : on; });
      };
      btn.addEventListener('click', function () { basculer(btn.getAttribute('aria-pressed') !== 'true'); });
      actions.push(btn);
      if (S.vueT[cle]) setTimeout(function () { basculer(true); }, 0);
    }
    return h('section', { class: 'pl-carte' + (o.span ? ' ' + o.span : '') }, [
      h('header', { class: 'pl-carte__h' }, [h('div', null, [h('h2', { text: o.titre }), o.sous ? h('p', { text: o.sous }) : null]), actions.length ? h('div', { class: 'pl-carte__a' }, actions) : null]),
      corps,
      o.pied ? h('div', { class: 'pl-carte__pied' }, o.pied) : null
    ]);
  }
  /* écart avec la période d'avant : en % (ou en points pour un taux) ; vert si ça monte et que monter est bien */
  function ecart(cur, prec, opts) {
    opts = opts || {};
    if (vide(cur) || vide(prec)) return null;
    var dv = opts.points ? (cur - prec) * 100 : (Math.abs(prec) < 0.005 ? null : (cur - prec) / Math.abs(prec) * 100);
    if (dv == null) return null;
    var txt = opts.points ? (Math.abs(dv) < 0.05 ? '=' : (dv > 0 ? '▲ ' : '▼ ') + NF1.format(Math.abs(dv)) + ' pt' + (Math.abs(dv) >= 2 ? 's' : ''))
      : (Math.abs(dv) < 0.5 ? '=' : (dv > 0 ? '▲ ' : '▼ ') + (Math.abs(dv) >= 1000 ? '×' + NF1.format(cur / prec) : NF0.format(Math.abs(dv)) + ' %'));
    return { txt: txt, sens: Math.abs(dv) < (opts.points ? 0.05 : 0.5) ? null : (dv > 0) === (opts.bas !== true) ? 'hausse' : 'baisse' };
  }
  /* tuile chiffrée : libellé, valeur, écart avec la période d'avant, tendance */
  function kpi(o) {
    var el = h('div', { class: 'pl-kpi' + (o.hero ? ' pl-kpi--hero' : ' pl-k') + (o.span ? ' ' + o.span : ''), role: 'group', 'aria-label': o.label }, [
      h('p', { class: 'pl-label', text: o.label }),
      h('p', { class: 'pl-kpi__v' + (o.cls ? ' ' + o.cls : ''), text: o.v }),
      o.delta || o.deltaL ? h('div', { class: 'pl-kpi__pied' }, [o.delta ? h('span', { class: 'pl-delta' + (o.delta.sens ? ' pl-delta--' + o.delta.sens : ''), text: o.delta.txt }) : null,
        o.deltaL ? h('span', { class: 'pl-delta-l', text: o.deltaL }) : null]) : null,
      o.sous ? h('p', { class: 'pl-kpi__s', text: o.sous }) : null
    ]);
    if (o.tend && G) el.appendChild(G.tendance(h('div'), o.tend, o.tendCls || 'g-s1', o.hero ? 70 : 30));
    if (o.leg) el.appendChild(h('p', { class: 'pl-kpi__leg', text: o.leg }));
    return el;
  }
  function vide2(texte, action) { return h('p', { class: 'pl-vide' }, [texte, action ? h('br') : null, action]); }
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
      meta.push(r.date_vente ? 'vendue ' + quandVendue(r) : 'vendue', c.canal);
      nums.push(h('span', { class: 'pl-row__prix', text: eur(r.encaisse) }));
      if (r.vente) nums.push(h('span', { class: 'pl-row__m ' + sens(r.vente.net), text: fleche(r.vente.net) + eurS(r.vente.net) }));
      else nums.push(badge('Vendue', 'vendu'));
    } else {
      nums.push(h('span', { class: 'pl-row__prix', text: vide(c.prix) ? 'Prix ?' : eur(c.prix) }));
      if (!vide(r.latent)) nums.push(h('span', { class: 'pl-row__m ' + sens(r.latent), text: fleche(r.latent) + eurS(r.latent) + (r.gain != null ? ' · ' + pct(r.gain) : '') }));
      if (c.gardee) meta.push('gardée');
    }
    if (opts && opts.extra) meta.push(opts.extra);
    return h('li', null, h('a', { class: 'pl-row', href: '#carte/' + encodeURIComponent(c.ref) }, [
      vignette(c),
      h('span', { class: 'pl-row__main' }, [h('span', { class: 'pl-row__nom', translate: 'no', text: c.nom || c.ref }), h('span', { class: 'pl-row__meta', text: sansDoublons(meta).join(' · ') })]),
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
  var ONGLET = { bord: 'bord', stock: 'stock', carte: 'stock', ventes: 'ventes', analyse: 'analyse', couts: 'analyse', voyages: 'analyse', voyage: 'analyse', fiscal: 'analyse' };
  var SECONDAIRE = { achats: 'achats', ticket: 'achats', lots: 'lots', scelle: 'scelle', controles: 'controles', reglages: 'reglages', charges: 'charges' };
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
    if (G) G.nettoyer();
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

  /* ---------------------------------------------------------------- tableau de bord (données : assets/js/pilotage-bord.js, graphiques : pilotage-graph.js)
     Une barre de filtres (période, groupe, langue, canal) et des sélections faites en touchant les graphiques (groupe, canal,
     langue, gamme de prix) : tout le tableau suit, comme dans Qlik. Les chiffres du stock sont ceux d'aujourd'hui (la période ne
     les change pas) ; « investissement récupéré », charges et synthèse sont depuis le début. */
  function faitsBord() { if (!S.FB || S.FB.R !== S.R) S.FB = { R: S.R, F: PB.faits(S.R) }; return S.FB.F; }
  function nomFiltre(F, k, v) { return k === 'groupe' ? (F.noms[v] || v) : v; }
  var LIB_FILTRE = { groupe: 'Groupe', langue: 'Langue', canal: 'Canal', gamme: 'Prix', cat: 'Catégorie' };
  function choisir(k, v) { S.fb[k] = S.fb[k] === v ? '' : v; rendre(true); }
  function barreFiltres(F, per, X) {
    var fb = S.fb;
    var seg = h('div', { class: 'pl-seg', role: 'group', 'aria-label': 'Période' }, PB.PERIODES.map(function (p) {
      return h('button', { type: 'button', 'aria-pressed': String(fb.periode === p[0]), 'data-focus': 'per-' + p[0], text: p[1], onclick: function () { fb.periode = p[0]; rendre(true); } });
    }));
    function sel(k, label, options) {
      var s = h('select', { class: 'select' + (fb[k] ? ' est-actif' : ''), 'aria-label': label, 'data-focus': 'fb-' + k }, options.map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
      s.value = fb[k];
      if (s.value !== fb[k]) { s.appendChild(h('option', { value: fb[k], text: nomFiltre(F, k, fb[k]) })); s.value = fb[k]; }
      s.addEventListener('change', function () { fb[k] = s.value; rendre(true); });
      return s;
    }
    var langues = uniques(F.ventes.concat(F.stock).map(function (x) { return x.langue; }));
    var canaux = uniques(F.ventes.map(function (x) { return x.canal; }));
    var chips = h('div', { class: 'pl-fbar__sel', 'aria-label': 'Sélections en cours' });
    var actifs = Object.keys(LIB_FILTRE).filter(function (k) { return fb[k]; });
    actifs.forEach(function (k) {
      chips.appendChild(h('span', { class: 'pl-selchip' }, [h('small', { text: LIB_FILTRE[k] }), nomFiltre(F, k, fb[k]),
        h('button', { type: 'button', 'aria-label': 'Retirer le filtre ' + LIB_FILTRE[k], text: '×', onclick: function () { fb[k] = ''; rendre(true); } })]));
    });
    if (actifs.length > 1) chips.appendChild(lienBtn('Tout effacer', function () { actifs.forEach(function (k) { fb[k] = ''; }); rendre(true); }));
    if (fb.canal) chips.appendChild(h('span', { class: 'pl-fbar__info', text: 'Le canal ne filtre que les ventes.' }));
    if (X.sans_date) chips.appendChild(h('span', { class: 'pl-fbar__info', text: nbr(X.sans_date) + ' vente' + pl(X.sans_date) + ' sans date ne compte' + (X.sans_date > 1 ? 'nt' : '') + ' que dans « Depuis le début ».' }));
    var barre = h('div', { class: 'pl-fbar', role: 'region', 'aria-label': 'Filtres du tableau de bord' }, [seg,
      sel('groupe', 'Groupe', [['', 'Tous les groupes']].concat(F.groupes.map(function (g) { return [g.cle, g.nom]; }))),
      sel('langue', 'Langue', [['', 'Toutes langues']].concat(langues.map(function (l) { return [l, l]; }))),
      sel('canal', 'Canal', [['', 'Tous les canaux']].concat(canaux.map(function (c) { return [c, c]; }))),
      chips]);
    if (w.IntersectionObserver) {
      var temoin = h('div', { 'aria-hidden': 'true' });
      new IntersectionObserver(function (e) { barre.classList.toggle('est-colle', !e[0].isIntersecting); }, { rootMargin: '-' + (d.querySelector('.pl-top') ? d.querySelector('.pl-top').offsetHeight + 1 : 55) + 'px 0px 0px 0px' }).observe(temoin);
      return [temoin, barre];
    }
    return [barre];
  }
  var NOM_PAS = { jour: 'par jour', semaine: 'par semaine', mois: 'par mois' };
  VUES.bord = function (m) {
    if (!G || !PB) { m.appendChild(entete('Tableau de bord', majTexte())); m.appendChild(h('p', { class: 'pl-box', text: 'Le tableau de bord ne s’est pas chargé entièrement : recharge la page.' })); return; }
    var R = S.R, fb = S.fb, F = faitsBord(), auj = aujourdhui();
    var per = PB.periode(fb.periode, auj, F), X = PB.filtrer(F, fb, per);
    var T = PB.totaux(X.ventes), TP = X.prec ? PB.totaux(X.prec) : null, ST = PB.totauxStock(X.stock);
    var pas = PB.pasDe(per), SER = PB.serie(X.ventes, per, pas), datees = SER.filter(function (s) { return !s.special; });
    var filtre = Object.keys(LIB_FILTRE).some(function (k) { return fb[k]; });
    m.appendChild(entete('Tableau de bord', majTexte()));
    barreFiltres(F, per, X).forEach(function (e) { m.appendChild(e); });
    var g = h('div', { class: 'pl-grille' });
    m.appendChild(g);
    var compar = TP ? 'vs ' + per.precNom : null;
    function tend(f) { return datees.length > 1 ? datees.map(f) : null; }
    var cumul = [], c0 = SER.length && SER[0].special ? SER[0].net : 0;
    datees.forEach(function (s) { c0 += s.net; cumul.push(c0); });
    /* ventes : héros + tuiles */
    g.appendChild(kpi({ hero: true, label: 'Bénéfice net' + (per.tout ? '' : ' · ' + per.nom.toLowerCase()), v: eurS(T.net, 0), cls: T.net < -0.5 ? 'pl-neg' : '',
      delta: TP ? ecart(T.net, TP.net) : null, deltaL: compar,
      sous: nbr(T.n) + ' article' + pl(T.n) + ' vendu' + pl(T.n) + ' · ' + eur(T.ca) + ' encaissés · rentabilité ' + pct(T.rentab),
      tend: cumul.length > 1 ? cumul : null, leg: cumul.length > 1 ? 'Bénéfice cumulé ' + NOM_PAS[pas] + (SER.length && SER[0].special ? ', ventes sans date comprises au départ' : '') : null }));
    g.appendChild(kpi({ span: 'pl-c4', label: 'Chiffre d’affaires', v: eur(T.ca, 0), delta: TP ? ecart(T.ca, TP.ca) : null, deltaL: compar, tend: tend(function (s) { return s.ca; }) }));
    g.appendChild(kpi({ span: 'pl-c4', label: 'Taux de marque', v: pct(T.marque), sous: 'bénéfice ÷ prix de vente · rentabilité ' + pct(T.rentab),
      delta: TP ? ecart(T.marque, TP.marque, { points: true }) : null, deltaL: compar, tend: tend(function (s) { return s.marque; }), tendCls: 'g-s2' }));
    g.appendChild(kpi({ span: 'pl-c4', label: 'Articles vendus', v: nbr(T.n), sous: T.realisation != null ? 'vendus à ' + pct(T.realisation) + ' du prix marché' : null,
      delta: TP ? ecart(T.n, TP.n) : null, deltaL: compar, tend: tend(function (s) { return s.n; }) }));
    g.appendChild(kpi({ span: 'pl-c4', label: 'Panier moyen', v: eur(T.panier), sous: 'par article vendu', delta: TP ? ecart(T.panier, TP.panier) : null, deltaL: compar,
      tend: tend(function (s) { return s.panier; }), tendCls: 'g-s2' }));
    /* chiffre d'affaires et bénéfice dans le temps */
    var aDater = R.cartes.filter(function (r) { return r.c.vendu && !r.hors && !r.date_vente; }).length;
    var lienDater = aDater ? lienBtn('Dater mes ventes (' + aDater + ')', feuilleDatesVentes) : null;
    var vides = !SER.some(function (s) { return s.lignes; });
    var hostCA = h('div');
    if (!vides) G.colonnes(hostCA, {
      cats: SER.map(function (s) { return { cle: s.cle, label: s.label, long: s.long, special: s.special }; }),
      series: [{ nom: 'Chiffre d’affaires', cls: 'g-s1', valeurs: SER.map(function (s) { return s.lignes ? s.ca : null; }) },
        { nom: 'Bénéfice net', cls: 'g-s2', type: 'ligne', valeurs: SER.map(function (s) { return s.lignes ? s.net : null; }) }],
      hauteur: 250, fmt: function (v) { return eur(v, 0); }, etiquettes: SER.length <= 8,
      detail: function (i) { var s = SER[i]; return s.lignes ? [{ v: nbr(s.n), l: 'article' + pl(s.n) + ' vendu' + pl(s.n), sous: true }, { v: pct(s.marque), l: 'taux de marque', sous: true }] : []; },
      aria: 'Chiffre d’affaires (barres) et bénéfice net (ligne) ' + NOM_PAS[pas] + ' ; chiffres dans la vue Tableau.'
    });
    g.appendChild(carte({ span: 'pl-c8', titre: 'Chiffre d’affaires et bénéfice', sous: per.nom + ' · ' + NOM_PAS[pas] + (SER.length && SER[0].special ? ' · en gris : ventes sans date' : ''),
      corps: vides ? [vide2('Aucune vente ' + (per.tout ? 'enregistrée' : 'datée sur cette période') + (filtre ? ' avec ces filtres' : '') + '.', lienDater)]
        : [G.legende([{ nom: 'Chiffre d’affaires', cls: 'g-s1' }, { nom: 'Bénéfice net', cls: 'g-s2', forme: 'ligne' }]), hostCA],
      table: vides ? null : function () {
        return tableau([
          { t: 'Période', f: function (s) { return s.long; } },
          { t: 'Articles', f: function (s) { return nbr(s.n); } },
          { t: 'Chiffre d’affaires', f: function (s) { return eur(s.ca, 2); } },
          { t: 'Bénéfice', f: function (s) { return eurS(s.net, 2); }, cls: function (s) { return s.net < -0.005 ? 'pl-neg' : ''; } },
          { t: 'Taux de marque', f: function (s) { return pct(s.marque); } }
        ], SER.filter(function (s) { return s.lignes; }).slice().reverse(), T, 'Ventes ' + NOM_PAS[pas]);
      },
      pied: lienDater && !vides ? [lienDater, ' pour les mettre dans le temps.'] : null }));
    /* investissement récupéré (depuis le début, avec les filtres groupe, langue, prix) */
    var fSansCanal = Object.assign({}, fb, { canal: '' }), tousSC = F.ventes.filter(function (v) { return PB.garder(v, fSansCanal, false); });
    var investi = X.achats.reduce(function (a, x) { return a + x.paye; }, 0), TI = PB.totaux(tousSC), recup = TI.recupere, pr = investi ? recup / investi : null;
    var cu = PB.cumul(tousSC, 'recupere'), hostI = h('div');
    if (cu.points.length > 1 && G) G.courbe(hostI, {
      x: cu.points.map(function (p) { return p.date; }), series: [{ nom: 'Récupéré (encaissé − frais)', cls: 'g-s1', valeurs: cu.points.map(function (p) { return p.v; }), pas: true, aire: true }],
      refs: investi > 0 ? [{ y: investi, label: 'Investi ' + eur(investi, 0) }] : [], hauteur: 150, fmt: function (v) { return eur(v, 0); }, finLabel: false,
      aria: 'Argent récupéré au fil des ventes, comparé à l’investissement.'
    });
    g.appendChild(carte({ span: 'pl-c4 pl-m12', titre: 'Investissement récupéré', sous: 'depuis le début' + (fb.canal ? ', tous canaux' : '') + ' · encaissé − frais ÷ prix d’achat réels',
      corps: [h('p', { class: 'pl-big', text: investi ? (recup < investi ? pct(pr) + ' déjà revenus' : 'Remboursé : ' + eurS(recup - investi, 0) + ' de plus') : 'Aucun prix d’achat réel' }),
        G.jauge(pr, { aria: pct(pr) + ' de l’investissement récupéré' }),
        h('dl', { class: 'pl-dl' }, [h('dt', { text: 'Investi' }), h('dd', { text: eur(investi, 0) }), h('dt', { text: 'Récupéré' }), h('dd', { text: eur(recup, 0) }),
          h('dt', { text: recup < investi ? 'Reste à récupérer' : 'Gagné en plus' }), h('dd', { text: eur(Math.abs(investi - recup), 0) })]),
        cu.points.length > 1 ? hostI : null],
      pied: filtre ? null : ['Si tout le stock part au prix marché : résultat final d’environ ' + eurS(R.k.resultat_projete, 0) + '.'] }));
    /* bénéfice par groupe, ventes par canal, par langue (sélection au toucher) */
    var parG = PB.parCle(X.ventes, 'groupe', PB.totaux).sort(function (a, b) { return b.net - a.net; });
    var hostG = h('div');
    if (parG.length) G.barres(hostG, { lignes: parG.map(function (x) { return { cle: x.cle, label: F.noms[x.cle] || x.cle, sous: nbr(x.n) + ' vendu' + pl(x.n) + ' · ' + eur(x.ca, 0), v: x.net, txt: eurS(x.net, 0) }; }),
      sel: fb.groupe || null, onSelect: function (k) { choisir('groupe', k); }, valeurNom: 'bénéfice net', aria: 'Bénéfice net par groupe',
      detail: function (l) { var x = parG.filter(function (y) { return y.cle === l.cle; })[0]; return [{ v: eur(x.ca, 0), l: 'chiffre d’affaires', sous: true }, { v: pct(x.marque), l: 'taux de marque', sous: true }]; } });
    g.appendChild(carte({ span: 'pl-c4', titre: 'Bénéfice par groupe', sous: 'touche un groupe pour filtrer tout le tableau', corps: [parG.length ? hostG : vide2('Aucune vente.')],
      table: parG.length ? function () { return tableauDim(parG, 'Groupe', function (x) { return F.noms[x.cle] || x.cle; }); } : null }));
    var parC = PB.parCle(X.ventes, 'canal', PB.totaux).sort(function (a, b) { return b.ca - a.ca; });
    var hostC = h('div');
    if (parC.length) G.barres(hostC, { lignes: parC.map(function (x) { return { cle: x.cle, label: x.cle, sous: nbr(x.n) + ' vente' + pl(x.n) + ' · bénéfice ' + eurS(x.net, 0), v: x.ca, txt: eur(x.ca, 0) }; }),
      sel: fb.canal || null, onSelect: function (k) { choisir('canal', k); }, valeurNom: 'chiffre d’affaires', aria: 'Chiffre d’affaires par canal' });
    g.appendChild(carte({ span: 'pl-c4', titre: 'Ventes par canal', sous: 'chiffre d’affaires', corps: [parC.length ? hostC : vide2('Aucune vente.')],
      table: parC.length ? function () { return tableauDim(parC, 'Canal', function (x) { return x.cle; }); } : null }));
    var parL = PB.parCle(X.ventes.filter(function (v) { return v.langue; }), 'langue', PB.totaux).sort(function (a, b) { return b.ca - a.ca; });
    var hostL = h('div');
    if (parL.length) G.barres(hostL, { lignes: parL.map(function (x) { return { cle: x.cle, label: x.cle, sous: nbr(x.n) + ' carte' + pl(x.n) + ' · bénéfice ' + eurS(x.net, 0), v: x.ca, txt: eur(x.ca, 0) }; }),
      sel: fb.langue || null, onSelect: function (k) { choisir('langue', k); }, valeurNom: 'chiffre d’affaires', aria: 'Chiffre d’affaires par langue' });
    g.appendChild(carte({ span: 'pl-c4 pl-m12', titre: 'Ventes par langue', sous: 'cartes seulement · chiffre d’affaires', corps: [parL.length ? hostL : vide2('Aucune carte vendue.')],
      table: parL.length ? function () { return tableauDim(parL, 'Langue', function (x) { return x.cle; }); } : null }));
    /* stock (aujourd'hui) */
    g.appendChild(h('div', { class: 'pl-titre-groupe' }, [h('h2', { text: 'Stock' }), h('p', { text: 'aujourd’hui, au prix marché' + (filtre ? ' · filtres appliqués' : '') })]));
    g.appendChild(kpi({ span: 'pl-c3', label: 'Valeur marché', v: eur(ST.valeur, 0), sous: ST.sans_prix ? ST.sans_prix + ' carte' + pl(ST.sans_prix) + ' sans prix non comptée' + pl(ST.sans_prix) : 'si tout se vend au prix marché' }));
    g.appendChild(kpi({ span: 'pl-c3', label: 'Coût du stock', v: eur(ST.cout, 0), sous: ST.estime > 0.5 ? 'dont ' + eur(ST.estime, 0) + ' estimés' : 'prix d’achat réels' }));
    g.appendChild(kpi({ span: 'pl-c3', label: 'Plus-value latente', v: eurS(ST.latent, 0), cls: ST.latent < -0.5 ? 'pl-neg' : '', sous: ST.gain != null ? 'soit ' + pct(ST.gain) + ' du coût, frais de vente déduits' : null }));
    g.appendChild(kpi({ span: 'pl-c3', label: 'En stock', v: nbr(ST.cartes) + ' carte' + pl(ST.cartes), sous: ST.unites ? '+ ' + nbr(ST.unites) + ' unités (boosters, ex, card sets)' : null }));
    var sG = PB.parCle(X.stock, 'groupe', PB.totauxStock).sort(function (a, b) { return b.valeur - a.valeur; });
    var hostSG = h('div');
    if (sG.length) G.barres(hostSG, { lignes: sG.map(function (x) { return { cle: x.cle, label: F.noms[x.cle] || x.cle, sous: nbr(x.n) + (x.cartes ? ' carte' + pl(x.n) : ' unité' + pl(x.n)) + ' · plus-value ' + eurS(x.latent, 0), v: x.valeur, txt: eur(x.valeur, 0), repere: x.cout }; }),
      sel: fb.groupe || null, onSelect: function (k) { choisir('groupe', k); }, valeurNom: 'valeur marché', repereNom: 'coût d’achat', aria: 'Valeur du stock par groupe, avec son coût' });
    g.appendChild(carte({ span: 'pl-c6', titre: 'Valeur du stock par groupe', sous: 'barre : prix marché · trait : ce qu’il t’a coûté',
      corps: sG.length ? [G.legende([{ nom: 'Valeur marché', cls: 'g-s1' }, { nom: 'Coût d’achat', cls: 'g-repere', forme: 'repere' }]), hostSG] : [vide2('Rien en stock.')],
      table: sG.length ? function () { return tableauStock(sG, 'Groupe', function (x) { return F.noms[x.cle] || x.cle; }); } : null }));
    var sP = PB.ORDRE_GAMMES.map(function (k) { var l = X.stock.filter(function (s) { return s.gamme === k; }); return Object.assign({ cle: k }, PB.totauxStock(l)); })
      .filter(function (x) { return x.n > 0 && x.cle !== 'Sans prix marché'; });
    var hostSP = h('div');
    if (sP.length) G.colonnes(hostSP, { cats: sP.map(function (x) { return { cle: x.cle, label: x.cle.replace(' et plus', ' +').replace('Moins de ', '< ').replace(/ €/g, '').replace(' à ', '–') + ' €', long: x.cle }; }),
      series: [{ nom: 'Valeur marché', cls: 'g-s1', valeurs: sP.map(function (x) { return x.valeur; }) }], hauteur: 220, fmt: function (v) { return eur(v, 0); },
      sel: fb.gamme || null, onSelect: function (k) { choisir('gamme', k); },
      detail: function (i) { var x = sP[i]; return [{ v: nbr(x.cartes), l: 'carte' + pl(x.cartes), sous: true }, { v: eur(x.cout, 0), l: 'coût d’achat', sous: true }, { v: eurS(x.latent, 0), l: 'plus-value', sous: true }]; },
      aria: 'Valeur du stock par gamme de prix' });
    g.appendChild(carte({ span: 'pl-c6', titre: 'Stock par gamme de prix', sous: 'où dort la valeur · touche une gamme pour filtrer', corps: [sP.length ? hostSP : vide2('Aucune carte avec un prix marché.')],
      table: sP.length ? function () { return tableauStock(sP, 'Gamme de prix', function (x) { return x.cle; }); } : null }));
    /* meilleures ventes, plus grosses pièces */
    var tv = X.ventes.filter(function (v) { return v.type === 'carte'; }).sort(function (a, b) { return b.net - a.net; }).slice(0, 8);
    g.appendChild(carte({ span: 'pl-c6 pl-m12', titre: 'Meilleures ventes', sous: 'bénéfice net, ' + per.nom.toLowerCase(), corps: [tv.length ? tableau([
      { t: 'Carte', f: function (v) { return celluleCarte(v.r, [v.date ? (v.date_estimee ? '≈ ' : '') + dateFR(v.date) : 'sans date', v.canal].join(' · ')); }, v: function (v) { return v.nom; } },
      { t: 'Vendue', f: function (v) { return eur(v.ca, 0); }, v: function (v) { return v.ca; } },
      { t: 'Bénéfice', f: function (v) { return eurS(v.net, 0); }, v: function (v) { return v.net; }, barre: true, cls: function (v) { return v.net < -0.005 ? 'pl-neg' : ''; } }
    ], tv, null, 'Meilleures ventes', { cle: 'bord-top-ventes' }) : vide2('Aucune carte vendue.')] }));
    var ts = X.stock.filter(function (s) { return s.type === 'carte' && s.valeur != null; }).sort(function (a, b) { return b.valeur - a.valeur; }).slice(0, 8);
    g.appendChild(carte({ span: 'pl-c6 pl-m12', titre: 'Plus grosses pièces en stock', sous: 'au prix marché', corps: [ts.length ? tableau([
      { t: 'Carte', f: function (s) { return celluleCarte(s.r, nomGroupe(s.r.c.groupe) + (s.estime ? ' · coût estimé' : '')); }, v: function (s) { return s.nom; } },
      { t: 'Prix', f: function (s) { return eur(s.valeur, 0); }, v: function (s) { return s.valeur; } },
      { t: 'Plus-value', f: function (s) { return eurS(s.latent, 0); }, v: function (s) { return s.latent; }, barre: true, cls: function (s) { return s.latent < -0.005 ? 'pl-neg' : ''; } }
    ], ts, null, 'Plus grosses pièces en stock', { cle: 'bord-top-stock' }) : vide2('Rien en stock.')] }));
    /* à surveiller, charges */
    var al = alertes();
    g.appendChild(carte({ span: 'pl-c5', titre: 'À surveiller', sous: S.site ? 'compta, tickets et site' : 'les contrôles avec le site arrivent dès que ses données sont chargées',
      corps: [al.length ? h('ul', { class: 'pl-alertes' }, al.map(function (a) {
        return h('li', null, h('a', { class: 'pl-alerte', href: '#controles' }, [h('span', { class: 'pl-alerte__n' + (a[2] ? ' pl-alerte__n--ko' : ''), text: nbr(a[0]) }), h('span', { text: a[1] })]));
      })) : vide2('Rien à signaler.')] }));
    if (w.PRCouts) {
      var XC = couts('tout'), nCh = (S.doc.charges || []).length;
      g.appendChild(carte({ span: 'pl-c7', titre: 'Après toutes tes charges', sous: 'depuis le début, sans filtre',
        corps: nCh ? [h('div', { class: 'pl-kpis pl-kpis--2' }, [
          tuile('Résultat analytique', eurS(XC.cascade.resultat, 0), 'ventes − achats − toutes les charges', XC.cascade.resultat < 0 ? 'pl-neg' : ''),
          tuile('Charges payées', eur(XC.totaux.charges, 0), nCh + ' charge' + pl(nCh) + (XC.totaux.stock_frais_voyage > 0.5 ? ' · ' + eur(XC.totaux.stock_frais_voyage, 0) + ' encore en stock' : '')),
          tuile('Coûts cachés', eur(XC.cascade.caches, 0), 'temps, capital, décote, dépréciation'),
          tuile('Point mort', XC.seuil.point_mort_date ? (XC.seuil.point_mort_jours <= XC.seuil.duree ? dateFR(XC.seuil.point_mort_date) : 'pas atteint') : '—', XC.seuil.sr != null ? 'seuil ' + eur(XC.seuil.sr, 0) + ' de CA' : null)
        ])] : [h('p', { class: 'pl-note', text: 'Le bénéfice ci-dessus ne compte que tes achats et tes ventes. Ajoute tes frais (voyage, abonnements, fournitures…) pour voir ton vrai résultat.' }),
          h('div', { class: 'pl-actions' }, [bouton('+ Ajouter une charge', function () { feuilleCharge(null); }), h('a', { class: 'btn btn--ghost', href: '#voyages', text: 'Mes voyages' })])],
        pied: nCh ? [h('a', { href: '#couts', text: 'Cascade des marges, seuil de rentabilité, coûts cachés ›' })] : null }));
    }
    g.appendChild(carte({ span: 'pl-c12', titre: 'Synthèse comme dans l’Excel', sous: 'par groupe, depuis le début, sans filtre', corps: [syntheseTable()],
      pied: [details('Par catégorie', null, [categoriesTable()])] }));
  };
  function celluleCarte(r, meta) {
    var c = r.c;
    return h('a', { class: 'pl-t-img', href: '#carte/' + encodeURIComponent(c.ref) }, [vignette(c), h('span', null, [h('span', { translate: 'no', text: c.nom || c.ref }), h('small', { text: meta })])]);
  }
  /* vue « Tableau » des graphiques par dimension (ventes) et par regroupement de stock */
  function tableauDim(l, nom, lib) {
    return tableau([
      { t: nom, f: lib, v: lib },
      { t: 'Articles', f: function (x) { return nbr(x.n); }, v: function (x) { return x.n; } },
      { t: 'Chiffre d’affaires', f: function (x) { return eur(x.ca, 2); }, v: function (x) { return x.ca; } },
      { t: 'Bénéfice', f: function (x) { return eurS(x.net, 2); }, v: function (x) { return x.net; }, cls: function (x) { return x.net < -0.005 ? 'pl-neg' : ''; } },
      { t: 'Taux de marque', f: function (x) { return pct(x.marque); }, v: function (x) { return x.marque; } },
      { t: 'Rentabilité', f: function (x) { return pct(x.rentab); }, v: function (x) { return x.rentab; } }
    ], l, null, nom, { cle: 'dim-' + nom });
  }
  function tableauStock(l, nom, lib) {
    return tableau([
      { t: nom, f: lib, v: lib },
      { t: 'Articles', f: function (x) { return nbr(x.n); }, v: function (x) { return x.n; } },
      { t: 'Valeur marché', f: function (x) { return eur(x.valeur, 2); }, v: function (x) { return x.valeur; } },
      { t: 'Coût', f: function (x) { return eur(x.cout, 2); }, v: function (x) { return x.cout; } },
      { t: 'Plus-value', f: function (x) { return eurS(x.latent, 2); }, v: function (x) { return x.latent; }, cls: function (x) { return x.latent < -0.005 ? 'pl-neg' : ''; } },
      { t: 'Gain', f: function (x) { return pct(x.gain); }, v: function (x) { return x.gain; } }
    ], l, null, nom, { cle: 'stock-' + nom });
  }
  function alertes() {
    var c = S.R.controles, cs = controlesSite(), out = [];
    if (cs) {
      if (cs.a_saisir.length) out.push([cs.a_saisir.length, 'vente' + pl(cs.a_saisir.length) + ' faite' + pl(cs.a_saisir.length) + ' sur le site, pas encore saisie' + pl(cs.a_saisir.length) + ' ici', true]);
      if (cs.encore.length) out.push([cs.encore.length, 'carte' + pl(cs.encore.length) + ' vendue' + pl(cs.encore.length) + ' ici mais encore en vente sur le site', true]);
      if (cs.prix.length) out.push([cs.prix.length, 'prix du site différent' + pl(cs.prix.length) + ' du prix marché']);
      if (cs.absentes.length) out.push([cs.absentes.length, 'fiche' + pl(cs.absentes.length) + ' du site absente' + pl(cs.absentes.length) + ' de la compta']);
    }
    if (c.tickets_ecart.length) out.push([c.tickets_ecart.length, 'ticket' + pl(c.tickets_ecart.length) + ' dont les cartes ne font pas le total']);
    if (c.sans_prix.length) out.push([c.sans_prix.length, 'carte' + pl(c.sans_prix.length) + ' en stock sans prix marché']);
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
      { t: 'Marge nette', f: function (l) { return eur(l.marge, 2); }, cls: function (l) { return neg(l.marge); } },
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
        tb.appendChild(h('tr', null, [h('th', { scope: 'row', text: l.cat }), h('td', { text: nbr(l.nb) }), h('td', { text: eur(l.paye, 2) }), h('td', { text: eur(l.valeur, 2) }), h('td', { class: neg(l.marge), text: eur(l.marge, 2) }), h('td', { text: pct(l.gain) })]));
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
      if (f.manque && (c.vendu || !vide(c.prix))) return false;
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
    if (tri === 'vente') return l.sort(function (a, b) { return (b.date_vente || '').localeCompare(a.date_vente || '') || b.i - a.i; });
    return l.sort(function (a, b) { return cmpRef(a.ref, b.ref); });
  }
  VUES.stock = function (m) {
    var R = S.R, f = S.f, limite = 120;
    /* le scellé (card sets, displays, boosters) est dans le stock comme les cartes : tuiles, liste et tableau
       (demande d'Arthur, 22/11/2026) ; il sort dès qu'un filtre de carte (groupe, catégorie, langue, À compléter) est mis */
    var nScel = R.produits.reduce(function (a, x) { return a + (x.reste > 0 ? x.reste : 0); }, 0);
    m.appendChild(entete('Stock', nbr(R.stock.cartes) + ' carte' + pl(R.stock.cartes) + (nScel ? ' et ' + nbr(nScel) + ' produit' + pl(nScel) + ' scellé' + pl(nScel) : '') + ' en stock',
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
    var vue = S.stockVue || 'liste';
    var segV = h('div', { class: 'pl-seg pl-seg--vue', role: 'group', 'aria-label': 'Présentation' }, [['liste', 'Liste'], ['tableau', 'Tableau']].map(function (x) {
      return h('button', { type: 'button', 'aria-pressed': String(vue === x[0]), text: x[1], onclick: function () { S.stockVue = x[0]; rendre(true); } });
    }));
    var aideM = h('p', { class: 'pl-apercu pl-stock-aide', hidden: true });
    var tuiles = h('div', { class: 'pl-kpis pl-kpis--stock', 'aria-live': 'polite' });
    var resume = h('p', { class: 'pl-resume' });
    var liste = h('div', { class: 'pl-stock-liste' });
    var plus = h('button', { type: 'button', class: 'btn btn--ghost pl-plus', text: 'Afficher la suite' });
    plus.addEventListener('click', function () { limite += 300; maj(); });
    m.appendChild(aideM); m.appendChild(tuiles); m.appendChild(h('div', { class: 'pl-stock-barre' }, [resume, segV])); m.appendChild(liste); m.appendChild(plus);
    var auj = PB ? PB.jour(aujourdhui()) : null;
    function age(r) { return r.mise_en_vente && auj != null ? Math.max(0, auj - PB.jour(r.mise_en_vente)) : null; }
    function produitsFiltres() {
      if (f.statut === 'vendues' || f.manque || f.groupe || f.cat || f.langue) return [];
      var mots = norm(f.q).trim().split(/\s+/).filter(Boolean);
      return R.produits.filter(function (x) {
        if (!(x.reste > 0)) return false;
        var t = norm([x.p.nom, x.p.libelle, 'scellé'].join(' '));
        for (var i = 0; i < mots.length; i++) if (t.indexOf(mots[i]) === -1) return false;
        return true;
      }).sort(function (a, b) { return z(b.stock_valeur) - z(a.stock_valeur); });
    }
    function maj() {
      var l = trier(cartesFiltrees(), f.tri), val = 0, cout = 0, coutV = 0, np = 0, lat = 0, enc = 0, net = 0, nv = 0, ns = 0, sa = 0, na = 0;
      l.forEach(function (r) { if (r.c.vendu) { nv++; enc += z(r.encaisse); net += r.vente ? r.vente.net : 0; } else { ns++; val += z(r.c.prix); cout += z(r.cout); lat += z(r.latent); if (!vide(r.c.prix)) { np++; coutV += z(r.cout); } var a0 = age(r); if (a0 != null) { sa += a0; na++; } } });
      var prods = produitsFiltres(), valS = 0, coutS = 0, latS = 0, nS = 0;
      prods.forEach(function (x) { valS += z(x.stock_valeur); coutS += z(x.stock_reel) + z(x.stock_estime); latS += z(x.latent); nS += x.reste; });
      aideM.hidden = !f.manque;
      if (f.manque) {
        aideM.textContent = l.length ? 'À compléter : ' + nbr(l.length) + ' carte' + pl(l.length) + ' sans prix de vente. Tant qu’elle' + (l.length > 1 ? 's n’en ont' : ' n’en a') + ' pas, ' + (l.length > 1 ? 'elles ne comptent' : 'elle ne compte') + ' pas dans la valeur du stock : ouvre la carte › Modifier › Prix marché.'
          : 'À compléter : toutes tes cartes ont un prix de vente.';
      }
      tuiles.textContent = '';
      var sansPx = np < ns ? nbr(ns - np) + ' sans prix' : '';
      if (f.statut !== 'vendues') ajouter(tuiles, [
        tuile('Valeur marché', np || nS ? eur(val + valS, 0) : '—', nS ? 'cartes ' + eur(val, 0) + ' · scellé ' + eur(valS, 0) + (sansPx ? ' · ' + sansPx : '') : nbr(ns) + ' en stock' + (sansPx ? ', ' + sansPx : '')),
        tuile('Coût', eur(cout + coutS, 0), nS ? 'cartes ' + eur(cout, 0) + ' · scellé ' + eur(coutS, 0) : 'prix d’achat (ou estimé)'),
        tuile('Plus-value', np || nS ? eurS(lat + latS, 0) : '—', np || nS ? (coutV + coutS ? pct((lat + latS) / (coutV + coutS)) + ' du coût, frais de vente déduits' : 'frais de vente déduits') : 'sans prix de vente', lat + latS < -0.5 ? 'pl-neg' : ''),
        f.statut === 'toutes' ? tuile('Vendues', nbr(nv), eur(enc, 0) + ' encaissés') : tuile('En vente depuis', na ? nbr(Math.round(sa / na)) + ' j' : '—', 'moyenne des cartes · chrono lancé le ' + dateFR(R.dates_ventes ? R.dates_ventes.debut : aujourdhui()))]);
      else ajouter(tuiles, [tuile('Vendues', nbr(nv)), tuile('Encaissé', eur(enc, 0)), tuile('Bénéfice', eurS(net, 0), enc ? pct(net / enc) + ' du prix de vente' : null, net < -0.5 ? 'pl-neg' : ''), tuile('Panier moyen', nv ? eur(enc / nv) : '—')]);
      resume.textContent = nbr(l.length) + ' carte' + pl(l.length) + (prods.length ? ' · ' + nbr(prods.length) + ' produit' + pl(prods.length) + ' scellé' + pl(prods.length) : '') + (l.length > limite ? ' · ' + nbr(limite) + ' affichées' : '');
      liste.textContent = '';
      liste.hidden = !l.length && !prods.length;
      var vis = l.slice(0, limite);
      if (prods.length) {
        liste.appendChild(h('p', { class: 'pl-stock-groupe' }, [h('span', { text: 'Scellé' }), h('span', { text: nbr(nS) + ' en stock · ' + eur(valS, 0) })]));
        if (vue === 'tableau') liste.appendChild(compact(tableau([
          { t: 'Produit', f: function (x) { return x.p.nom || x.p.libelle; }, v: function (x) { return x.p.nom || ''; } },
          { t: 'En stock', f: function (x) { return nbr(x.reste) + ' / ' + nbr(x.nb); }, v: function (x) { return x.reste; } },
          { t: 'Prix unitaire', f: function (x) { return eur(x.prix_u, 2); }, v: function (x) { return x.prix_u; } },
          { t: 'Valeur', f: function (x) { return eur(x.stock_valeur, 0); }, v: function (x) { return x.stock_valeur; } },
          { t: 'Coût', f: function (x) { return eur(z(x.stock_reel) + z(x.stock_estime), 0); }, v: function (x) { return z(x.stock_reel) + z(x.stock_estime); } },
          { t: 'Plus-value', f: function (x) { return eurS(x.latent, 0); }, v: function (x) { return x.latent; }, barre: true, cls: function (x) { return neg(x.latent); } }
        ], prods, null, 'Scellé', { cle: 'stock-scelle' })));
        else liste.appendChild(h('ul', { class: 'pl-rows' }, prods.map(ligneProduit)));
        if (l.length) liste.appendChild(h('p', { class: 'pl-stock-groupe' }, [h('span', { text: 'Cartes' }), h('span', { text: f.statut === 'vendues' ? '' : nbr(ns) + ' en stock · ' + eur(val, 0) })]));
      }
      if (!l.length) { /* rien d'autre à montrer */ }
      else if (vue === 'tableau') {
        var cols = [{ t: 'Carte', f: function (r) { return celluleCarte(r, sansDoublons(['N° ' + r.c.ref, nomGroupe(r.c.groupe), r.c.cat, r.c.langue]).join(' · ')); }, v: function (r) { return r.c.nom || r.ref; } }];
        if (f.statut === 'vendues') cols = cols.concat([
          { t: 'Vendue', f: function (r) { return dateVenteCourte(r); }, v: function (r) { return r.date_vente || ''; } },
          { t: 'Canal', f: function (r) { return r.c.canal || '—'; }, v: function (r) { return r.c.canal || ''; } },
          { t: 'Encaissé', f: function (r) { return eur(r.encaisse, 2); }, v: function (r) { return r.encaisse; } },
          { t: 'Bénéfice', f: function (r) { return r.vente ? eurS(r.vente.net, 2) : '—'; }, v: function (r) { return r.vente ? r.vente.net : null; }, barre: true, cls: function (r) { return r.vente ? neg(r.vente.net) : ''; } },
          { t: 'Rentab.', f: function (r) { return r.vente ? pct(r.vente.rentab) : '—'; }, v: function (r) { return r.vente ? r.vente.rentab : null; } }]);
        else cols = cols.concat([
          { t: 'Prix marché', f: function (r) { return r.c.vendu ? 'vendue' : eur(r.c.prix, 0); }, v: function (r) { return r.c.vendu ? null : r.c.prix; } },
          { t: 'Coût', f: function (r) { return eur(r.cout, 0); }, v: function (r) { return r.cout; } },
          { t: 'Plus-value', f: function (r) { return r.c.vendu ? (r.vente ? eurS(r.vente.net, 0) : '—') : eurS(r.latent, 0); }, v: function (r) { return r.c.vendu ? (r.vente ? r.vente.net : null) : r.latent; }, barre: true, cls: function (r) { return neg(r.c.vendu ? (r.vente ? r.vente.net : 0) : r.latent); } },
          { t: 'Rentab.', f: function (r) { return pct(r.c.vendu ? (r.vente ? r.vente.rentab : null) : r.gain); }, v: function (r) { return r.c.vendu ? (r.vente ? r.vente.rentab : null) : r.gain; } },
          { t: 'En vente depuis', f: function (r) { var a = age(r); return a == null ? '—' : nbr(a) + ' j'; }, v: function (r) { return age(r); } }]);
        liste.appendChild(tableau(cols, vis, null, 'Cartes', { cle: 'stock-' + f.statut }));
      } else {
        var ul = h('ul', { class: 'pl-rows' });
        vis.forEach(function (r) { ul.appendChild(ligneCarte(r)); });
        liste.appendChild(ul);
      }
      plus.hidden = l.length <= limite;
    }
    S.majListe = maj;
    maj();
  };
  /* un produit scellé dans la liste du stock : quantité restante, valeur, plus-value ; touche → Plus › Scellé */
  function ligneProduit(x) {
    var cs = z(x.stock_reel) + z(x.stock_estime), nums = [h('span', { class: 'pl-row__prix', text: eur(x.stock_valeur, 0) })];
    if (!vide(x.latent)) nums.push(h('span', { class: 'pl-row__m ' + sens(x.latent), text: fleche(x.latent) + eurS(x.latent, 0) + (cs ? ' · ' + pct(x.latent / cs) : '') }));
    var meta = ['Scellé', nbr(x.reste) + ' en stock sur ' + nbr(x.nb), eur(x.prix_u, 2) + ' l’unité'];
    return h('li', null, h('a', { class: 'pl-row', href: '#scelle' }, [
      h('span', { class: 'pl-row__img pl-row__img--scelle', 'aria-hidden': 'true' }, h('b', { text: '×' + nbr(x.reste) })),
      h('span', { class: 'pl-row__main' }, [h('span', { class: 'pl-row__nom', text: x.p.nom || x.p.libelle }), h('span', { class: 'pl-row__meta', text: meta.join(' · ') })]),
      h('span', { class: 'pl-row__nums' }, nums)
    ]));
  }

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
  /* lien de vente préremplie (donné par Claude quand Arthur annonce une vente) :
     pilotage.html#vendre/REF?prix=50&canal=Vinted&date=2026-11-22 → fiche de la carte + feuille de vente remplie, un bouton à toucher */
  VUES.vendre = function (m, arg) {
    var ref = String(arg || '').split('?')[0], qs = {};
    String(arg || '').split('?')[1] && String(arg).split('?')[1].split('&').forEach(function (kv) { var j = kv.indexOf('='); if (j > 0) qs[kv.slice(0, j)] = kv.slice(j + 1); });
    var r = S.R.parRef[ref];
    try { history.replaceState(null, '', '#carte/' + encodeURIComponent(ref)); } catch (e) {}
    S.vue = 'carte'; S.arg = ref;
    VUES.carte(m, ref);
    if (!r) return;
    if (r.c.vendu) { setTimeout(function () { toast('Déjà enregistrée : cette carte est vendue.'); }, 0); return; }
    var prix = lireNombre(qs.prix || '').v, canal = CANAUX.indexOf(qs.canal) !== -1 ? qs.canal : null, date = /^\d{4}-\d{2}-\d{2}$/.test(qs.date || '') ? qs.date : null;
    setTimeout(function () { feuilleVente(ref, { prix: vide(prix) ? null : prix, canal: canal, date: date }); }, 0);
  };
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
      h('div', null, [h('h1', { translate: 'no', text: c.nom || c.ref }),
        h('p', { class: 'pl-fiche__ref', text: ['N° ' + c.ref, nomGroupe(c.groupe), c.cat, c.langue, c.etat].filter(Boolean).join(' · ') }),
        h('div', { class: 'pl-badges' }, [
          c.vendu ? badge('Vendue' + (r.date_vente ? ' ' + quandVendue(r) : ''), 'vendu') : r.hors ? badge('Hors totaux') : badge('En stock', 'ok'),
          c.gardee ? badge('Gardée', 'garde') : null,
          es ? badge(es === 'vendue' ? 'Vendue sur le site' : es === 'réservée' ? 'Réservée sur le site' : 'En vente sur le site' + (prixSite(sref) ? ' · ' + eur(prixSite(sref)) : ''), es === 'en vente' ? 'ok' : 'vendu') : null
        ])])
    ]));
    if (c.vendu && r.vente) {
      m.appendChild(section('Vente', [h('div', { class: 'pl-kpis' }, [
        tuile('Prix de vente', eur(r.vente.encaisse, 2), [r.date_vente ? dateVenteCourte(r) + (r.vente_estimee ? ' (achat + ' + nbr(S.R.dates_ventes.delai) + ' j)' : '') : null, c.canal].filter(Boolean).join(' · ') || null),
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
    if (w.PRCouts && !r.hors) { var cc = blocCoutComplet(c.ref); if (cc) m.appendChild(cc); }
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
    ], { prix: opts && opts.prix != null ? opts.prix : c.prix, date: (opts && opts.date) || aujourdhui(), canal: opts && opts.canal != null ? opts.canal : (lire(CLE_CANAL) || '') });
    var apercu = h('p', { class: 'pl-apercu', 'aria-live': 'polite' });
    var caseSite = null;
    if (sref && GIST && es !== 'vendue') { caseSite = h('input', { type: 'checkbox' }); caseSite.checked = true; }
    function calc() {
      var v = lireNombre(form.champs.prix.value).v;
      if (vide(v)) { apercu.textContent = 'Indique le prix de vente.'; return; }
      var cn = form.champs.canal.value, FCv = P.frais_canal || {}, fvC = cn && Object.prototype.hasOwnProperty.call(FCv, cn) ? FCv[cn] : P.fv;
      var cout = (r.paye != null ? r.paye : v * (1 - fvC) / ((1 + P.tva) + P.rent)) * (1 + P.tva);
      var net = v * (1 - fvC) - cout - P.envoi;
      apercu.textContent = 'Bénéfice net ' + eurS(net, 2) + (cout ? ' · rentabilité ' + pct(net / cout) : '') + (r.paye == null ? ' (coût estimé)' : '') + ' · frais de vente ' + pct(fvC) + (cn ? ' (' + cn + ')' : '') + ' et envoi de ' + eur(P.envoi, 2) + ' déduits';
    }
    form.champs.prix.addEventListener('input', calc);
    form.champs.canal.addEventListener('change', calc);
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
      nom_ticket: c.nom_ticket, ebay: c.ebay, verif: c.verif, remarque: c.remarque, gardee: c.gardee, provenance: c.provenance || ''
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
      { k: 'provenance', label: 'Achetée à (TVA en SASU)', type: 'select', options: [['', 'Automatique : importée si ticket, yens ou lot'], ['import', 'Importée (Japon, hors UE)'], ['particulier', 'Un particulier (TVA sur la marge)'], ['pro', 'Un professionnel (facture avec TVA)']] },
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
        if (x.provenance) cc.provenance = x.provenance; else delete cc.provenance;
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
    var R = S.R, fb = S.fb;
    m.appendChild(entete('Ventes', 'Mêmes filtres que le tableau de bord', [h('button', { type: 'button', class: 'btn pl-btn-s', onclick: feuilleChoixVente, text: '+ Vente' })]));
    if (!G || !PB) { m.appendChild(h('p', { class: 'pl-box', text: 'La page ne s’est pas chargée entièrement : recharge-la.' })); return; }
    var F = faitsBord(), per = PB.periode(fb.periode, aujourdhui(), F), X = PB.filtrer(F, fb, per);
    var T = PB.totaux(X.ventes), TP = X.prec ? PB.totaux(X.prec) : null, pas = PB.pasDe(per), SER = PB.serie(X.ventes, per, pas);
    var datees = SER.filter(function (s2) { return !s2.special; }), compar = TP ? 'vs ' + per.precNom : null;
    function tend(f) { return datees.length > 1 ? datees.map(f) : null; }
    barreFiltres(F, per, X).forEach(function (e) { m.appendChild(e); });
    var g = h('div', { class: 'pl-grille' });
    m.appendChild(g);
    g.appendChild(kpi({ span: 'pl-c3', label: 'Encaissé', v: eur(T.ca, 0), sous: 'panier moyen ' + eur(T.panier), delta: TP ? ecart(T.ca, TP.ca) : null, deltaL: compar, tend: tend(function (x) { return x.ca; }) }));
    var estimes = X.ventes.filter(function (v) { return v.estime; }).reduce(function (a2, v) { return a2 + v.cout; }, 0);
    g.appendChild(kpi({ span: 'pl-c3', label: 'Coût d’achat', v: eur(T.cout, 0), sous: estimes > 0.5 ? 'dont ' + eur(estimes, 0) + ' estimés' : 'prix d’achat réels', tend: tend(function (x) { return x.cout; }), tendCls: 'g-s2' }));
    g.appendChild(kpi({ span: 'pl-c3', label: 'Frais', v: eur(T.envoi + T.frais, 0), sous: 'envoi ' + eur(T.envoi, 0) + ' · vente ' + eur(T.frais, 0), tend: tend(function (x) { return x.envoi + x.frais; }), tendCls: 'g-s2' }));
    g.appendChild(kpi({ span: 'pl-c3', label: 'Bénéfice net', v: eurS(T.net, 0), cls: T.net < -0.5 ? 'pl-neg' : '', sous: 'rentabilité ' + pct(T.rentab) + ' · marque ' + pct(T.marque),
      delta: TP ? ecart(T.net, TP.net) : null, deltaL: compar, tend: tend(function (x) { return x.net; }) }));
    /* rythme */
    var vides = !SER.some(function (s2) { return s2.lignes; }), hostR = h('div');
    if (!vides) G.colonnes(hostR, { cats: SER.map(function (s2) { return { cle: s2.cle, label: s2.label, long: s2.long, special: s2.special }; }),
      series: [{ nom: 'Articles vendus', cls: 'g-s1', valeurs: SER.map(function (s2) { return s2.lignes ? s2.n : null; }) }], hauteur: 230, fmt: function (v) { return nbr(v); }, fmtAxe: function (v) { return nbr(v); },
      etiquettes: SER.length <= 8, detail: function (i) { var s2 = SER[i]; return s2.lignes ? [{ v: eur(s2.ca, 0), l: 'encaissés', sous: true }, { v: eurS(s2.net, 0), l: 'de bénéfice', sous: true }] : []; },
      aria: 'Nombre d’articles vendus ' + NOM_PAS[pas] });
    g.appendChild(carte({ span: 'pl-c6', titre: 'Rythme des ventes', sous: 'articles vendus ' + NOM_PAS[pas] + ' · ' + per.nom.toLowerCase(), corps: [vides ? vide2('Aucune vente sur cette période.') : hostR],
      table: vides ? null : function () { return tableau([{ t: 'Période', f: function (x) { return x.long; } }, { t: 'Articles', f: function (x) { return nbr(x.n); } }, { t: 'Encaissé', f: function (x) { return eur(x.ca, 2); } }, { t: 'Bénéfice', f: function (x) { return eurS(x.net, 2); }, cls: function (x) { return neg(x.net); } }], SER.filter(function (x) { return x.lignes; }).slice().reverse(), null, 'Rythme des ventes'); } }));
    /* bénéfice par vente */
    var BINS = [['Perte', -Infinity, 0, 'g-neg'], ['0–5 €', 0, 5], ['5–10 €', 5, 10], ['10–25 €', 10, 25], ['25–50 €', 25, 50], ['50 € +', 50, Infinity]];
    var cv = X.ventes.filter(function (v) { return v.type === 'carte'; }), hostB = h('div');
    var nb = BINS.map(function (b0) { var l = cv.filter(function (v) { return v.net >= b0[1] && v.net < b0[2] && !(b0[1] === 0 && v.net < 0); }); return { b: b0, n: l.length, ca: l.reduce(function (a2, v) { return a2 + v.ca; }, 0), net: l.reduce(function (a2, v) { return a2 + v.net; }, 0) }; });
    if (cv.length) G.colonnes(hostB, { cats: nb.map(function (x) { return { cle: x.b[0], label: x.b[0], long: 'Bénéfice ' + (x.b[0] === 'Perte' ? 'négatif' : 'de ' + x.b[0]), cls: x.b[3] }; }),
      series: [{ nom: 'Ventes', cls: 'g-s1', valeurs: nb.map(function (x) { return x.n; }) }], hauteur: 220, fmt: function (v) { return nbr(v); }, fmtAxe: function (v) { return nbr(v); },
      detail: function (i) { return [{ v: eurS(nb[i].net, 0), l: 'de bénéfice au total', sous: true }]; }, aria: 'Nombre de ventes selon leur bénéfice' });
    g.appendChild(carte({ span: 'pl-c6', titre: 'Bénéfice par vente', sous: 'combien de cartes te rapportent peu, ou te coûtent', corps: [cv.length ? hostB : vide2('Aucune carte vendue.')],
      pied: cv.length ? [nbr(nb[0].n) + ' vente' + pl(nb[0].n) + ' à perte (' + eurS(nb[0].net, 0) + ') · ' + nbr(nb[1].n) + ' à moins de 5 € de bénéfice.'] : null }));
    /* prix obtenu / prix marché */
    var pv = X.ventes.filter(function (v) { return v.type === 'carte' && v.marche > 0 && v.ca > 0; }), hostP = h('div');
    if (pv.length >= 3) G.nuage(hostP, { points: pv.map(function (v) { return { cle: v.ref, label: v.nom, x: v.marche, y: v.ca, cls: v.ca < v.marche * 0.95 ? 'g-s2' : 'g-s1' }; }), log: true, diagonale: true, etiquettes: false, rayon: 4.5,
      fmtX: function (v) { return eur(v, 0); }, fmtY: function (v) { return eur(v, 0); }, xNom: 'Prix marché →', yNom: '↑ Prix de vente', xLib: 'prix marché', yLib: 'vendu',
      detail: function (p) { return [{ v: pct(p.y / p.x), l: 'du prix marché', sous: true }]; },
      onSelect: function (ref) { location.hash = '#carte/' + encodeURIComponent(ref); }, aria: 'Prix de vente face au prix marché, une carte par point' });
    g.appendChild(carte({ span: 'pl-c6', titre: 'Prix obtenu face au prix marché', sous: pv.length >= 3 ? 'une carte par point · sur la diagonale : vendue au prix marché · orange : plus de 5 % en dessous' : 'cartes avec un prix marché',
      corps: [pv.length >= 3 ? G.legende([{ nom: 'Au prix marché ou mieux', cls: 'g-s1' }, { nom: 'Plus de 5 % en dessous', cls: 'g-s2' }]) : null, pv.length >= 3 ? hostP : vide2('Pas assez de ventes avec un prix marché.')],
      pied: pv.length >= 3 ? ['En moyenne, tu vends à ' + pct(T.realisation) + ' du prix marché. Échelle logarithmique : chaque graduation multiplie le prix. Touche un point pour ouvrir la carte.'] : null }));
    /* par canal */
    var parC = PB.parCle(X.ventes, 'canal', PB.totaux).sort(function (a2, b2) { return b2.ca - a2.ca; });
    g.appendChild(carte({ span: 'pl-c6', titre: 'Par canal', sous: 'touche un en-tête pour trier', corps: [parC.length ? tableau([
      { t: 'Canal', f: function (x) { return x.cle; }, v: function (x) { return x.cle; } },
      { t: 'Ventes', f: function (x) { return nbr(x.n); }, v: function (x) { return x.n; } },
      { t: 'Encaissé', f: function (x) { return eur(x.ca, 0); }, v: function (x) { return x.ca; } },
      { t: 'Bénéfice', f: function (x) { return eurS(x.net, 0); }, v: function (x) { return x.net; }, cls: function (x) { return neg(x.net); } },
      { t: 'Marque', f: function (x) { return pct(x.marque); }, v: function (x) { return x.marque; } },
      { t: 'Panier', f: function (x) { return eur(x.panier, 0); }, v: function (x) { return x.panier; } }
    ], parC, null, 'Ventes par canal', { cle: 'ventes-canal', trCls: function (x) { return fb.canal === x.cle ? 'pl-tr-sel' : null; } }) : vide2('Aucune vente.')] }));
    /* par groupe */
    var stockG = {};
    X.stock.forEach(function (x) { stockG[x.groupe] = (stockG[x.groupe] || 0) + x.n; });
    var parG = PB.parCle(X.ventes, 'groupe', PB.totaux).sort(function (a2, b2) { return b2.net - a2.net; });
    var totG = Object.assign({ cle: 'Total' }, T);
    g.appendChild(carte({ span: 'pl-c12', titre: 'Par groupe', sous: per.nom + (Object.keys(LIB_FILTRE).some(function (k) { return fb[k]; }) ? ' · filtres appliqués' : ''), corps: [parG.length ? tableau([
      { t: 'Groupe', f: function (x) { return x.cle === 'Total' ? 'Total' : F.noms[x.cle] || x.cle; }, v: function (x) { return F.noms[x.cle] || x.cle; } },
      { t: 'Vendus', f: function (x) { return nbr(x.n); }, v: function (x) { return x.n; } },
      { t: 'En stock', f: function (x) { return x.cle === 'Total' ? nbr(Object.keys(stockG).reduce(function (a2, k) { return a2 + stockG[k]; }, 0)) : nbr(stockG[x.cle] || 0); }, v: function (x) { return stockG[x.cle] || 0; } },
      { t: 'Encaissé', f: function (x) { return eur(x.ca, 2); }, v: function (x) { return x.ca; }, barre: true },
      { t: 'Coût', f: function (x) { return eur(x.cout, 2); }, v: function (x) { return x.cout; } },
      { t: 'Frais', f: function (x) { return eur(x.envoi + x.frais, 2); }, v: function (x) { return x.envoi + x.frais; } },
      { t: 'Bénéfice', f: function (x) { return eurS(x.net, 2); }, v: function (x) { return x.net; }, cls: function (x) { return neg(x.net); } },
      { t: 'Rentab.', f: function (x) { return pct(x.rentab); }, v: function (x) { return x.rentab; } },
      { t: 'Marque', f: function (x) { return pct(x.marque); }, v: function (x) { return x.marque; } }
    ], parG, totG, 'Ventes par groupe', { cle: 'ventes-groupe' }) : vide2('Aucune vente.')] }));
    /* détail */
    var det = X.ventes.slice().sort(function (a2, b2) { return (b2.date || '').localeCompare(a2.date || '') || (b2.r && a2.r ? b2.r.i - a2.r.i : 0); });
    var limite = S.ventesTout ? det.length : 60;
    g.appendChild(carte({ span: 'pl-c12', titre: 'Détail des ventes · ' + nbr(det.length), sous: 'les ventes venues de l’Excel n’ont pas de date : elles sont à la fin', corps: [det.length ? tableau([
      { t: 'Article', f: function (v) { return v.r ? celluleCarte(v.r, [nomGroupe(v.r.c.groupe), v.r.c.langue].filter(Boolean).join(' · ')) : h('span', null, [v.nom, h('small', { class: 'pl-t-note', text: nbr(v.n) + ' vendu' + pl(v.n) + ' au nombre' })]); }, v: function (v) { return v.nom; } },
      { t: 'Date', f: function (v) { return v.date ? dateFR(v.date) : '—'; }, v: function (v) { return v.date || ''; } },
      { t: 'Canal', f: function (v) { return v.canal; }, v: function (v) { return v.canal; } },
      { t: 'Prix marché', f: function (v) { return v.marche ? eur(v.marche) : '—'; }, v: function (v) { return v.marche; } },
      { t: 'Vendu', f: function (v) { return eur(v.ca); }, v: function (v) { return v.ca; } },
      { t: 'Bénéfice', f: function (v) { return eurS(v.net); }, v: function (v) { return v.net; }, barre: true, cls: function (v) { return neg(v.net); } },
      { t: 'Rentab.', f: function (v) { return pct(v.cout ? v.net / v.cout : null); }, v: function (v) { return v.cout ? v.net / v.cout : null; } }
    ], det.slice(0, limite), null, 'Détail des ventes', { cle: 'ventes-detail' }) : vide2('Aucune vente sur cette période.')].concat(det.length > limite
      ? [h('button', { type: 'button', class: 'btn btn--ghost pl-plus', text: 'Afficher les ' + nbr(det.length - limite) + ' autres', onclick: function () { S.ventesTout = true; rendre(true); } })] : []) }));
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
    var g = h('div', { class: 'pl-grille' });
    m.appendChild(g);
    g.appendChild(kpi({ span: 'pl-c3', label: 'Investi au total', v: eur(R.k.investi, 0), sous: 'prix d’achat réels' }));
    g.appendChild(kpi({ span: 'pl-c3', label: 'Tickets japonais', v: eur(tot.eur, 0), sous: yen(tot.yen) + ' · détaxe ' + yen(tot.det) }));
    g.appendChild(kpi({ span: 'pl-c3', label: 'Lots PSA 10', v: eur(modes.lot, 0), sous: R.lots.length + ' lot' + pl(R.lots.length) }));
    g.appendChild(kpi({ span: 'pl-c3', label: 'Cartes sans ticket', v: eur(modes.yen + modes.eur, 0), sous: 'prix en ¥ ou en €, hors lots' }));
    /* d'où vient l'investissement */
    var ratt = modes.ticket, nonRatt = tot.eur - ratt;
    var origine = [['Cartes achetées sur ticket', modes.ticket, 'g-s1'], ['Lots PSA 10', modes.lot, 'g-s2'], ['Produits (card sets, ex, boosters)', produits, 'g-s3'], ['Cartes sans ticket (¥ ou €)', modes.yen + modes.eur, 'g-s4']].filter(function (x) { return x[1] > 0; });
    g.appendChild(carte({ span: 'pl-c5', titre: 'D’où vient l’investissement', sous: 'prix d’achat réels, ' + eur(R.k.investi, 0) + ' au total',
      corps: [G.parts(h('div'), { parts: origine.map(function (x) { return { label: x[0], v: x[1], txt: eur(x[1], 0), cls: x[2] }; }), haute: true, legende: false, aria: 'Répartition de l’investissement' }),
        h('dl', { class: 'pl-dl pl-dl--parts' }, [].concat.apply([], origine.map(function (x) { return [h('dt', null, [h('i', { class: 'g-cle ' + x[2], 'aria-hidden': 'true' }), x[0]]), h('dd', { text: eur(x[1], 0) }), h('dd', { text: pct(x[1] / (R.k.investi || 1)) })]; })))],
      pied: ['Sur ' + eur(tot.eur, 2) + ' payés aux boutiques japonaises, ' + eur(ratt, 2) + ' sont rattachés à des cartes. ' + (Math.abs(nonRatt) >= 0.5 ? 'Les ' + eur(nonRatt, 2) + ' restants viennent des tickets sans carte ou en écart (voir Contrôles).' : 'Tout est rattaché.')] }));
    /* dépenses par boutique */
    var parBoutique = {};
    R.tickets.forEach(function (x) { var b0 = (x.t.boutique || 'Non indiquée').replace(/\s*\(.*\)$/, ''); (parBoutique[b0] = parBoutique[b0] || { v: 0, n: 0 }); parBoutique[b0].v += z(x.paye_eur); parBoutique[b0].n++; });
    var pb = Object.keys(parBoutique).map(function (b0) { return { cle: b0, label: b0, sous: parBoutique[b0].n + ' ticket' + pl(parBoutique[b0].n), v: parBoutique[b0].v, txt: eur(parBoutique[b0].v, 0) }; }).sort(function (x, y) { return y.v - x.v; });
    if (pb.length > 10) { var autres = pb.slice(9), s9 = autres.reduce(function (a2, x) { return a2 + x.v; }, 0); pb = pb.slice(0, 9).concat([{ cle: 'autres', label: 'Autres boutiques', sous: autres.length + ' boutiques', v: s9, txt: eur(s9, 0) }]); }
    var hostB = h('div');
    if (pb.length) G.barres(hostB, { lignes: pb, valeurNom: 'payé après détaxe', aria: 'Dépenses par boutique' });
    g.appendChild(carte({ span: 'pl-c7', titre: 'Dépenses par boutique', sous: 'payé après détaxe, au taux de ' + nbr(P.taux) + ' ¥ par €', corps: [pb.length ? hostB : vide2('Aucun ticket.')] }));
    /* achats dans le temps */
    var datees = [];
    R.tickets.forEach(function (x) { if (x.t.date && x.paye_eur) datees.push({ date: x.t.date, v: x.paye_eur, t: 'ticket' }); });
    R.cartes.forEach(function (r) { var md = (r.c.achat || {}).mode; if ((md === 'yen' || md === 'eur') && r.c.date_achat && r.paye && r.compte && !r.hors) datees.push({ date: r.c.date_achat, v: r.paye, t: 'carte' }); });
    if (datees.length >= 2 && PB) {
      datees.sort(function (x, y) { return x.date.localeCompare(y.date); });
      var perA = { debut: datees[0].date, fin: datees[datees.length - 1].date, jours: PB.jour(datees[datees.length - 1].date) - PB.jour(datees[0].date) + 1 };
      var pasA = perA.jours <= 31 ? 'jour' : perA.jours <= 120 ? 'semaine' : 'mois';
      var BA = PB.bacs(perA, pasA).map(function (x) { var l = datees.filter(function (y) { return y.date >= x.debut && y.date <= x.fin; }); return Object.assign(x, { tk: l.filter(function (y) { return y.t === 'ticket'; }).reduce(function (a2, y) { return a2 + y.v; }, 0), ct: l.filter(function (y) { return y.t === 'carte'; }).reduce(function (a2, y) { return a2 + y.v; }, 0) }); });
      var hostA = h('div');
      G.colonnes(hostA, { cats: BA.map(function (x) { return { cle: x.cle, label: x.label, long: x.long }; }), series: [{ nom: 'Tickets japonais', cls: 'g-s1', valeurs: BA.map(function (x) { return x.tk || null; }) }, { nom: 'Cartes sans ticket', cls: 'g-s4', valeurs: BA.map(function (x) { return x.ct || null; }) }],
        hauteur: 220, fmt: function (v) { return eur(v, 0); }, etiquettes: false, aria: 'Achats ' + NOM_PAS[pasA] });
      g.appendChild(carte({ span: 'pl-c12', titre: 'Achats dans le temps', sous: NOM_PAS[pasA] + ' · tickets datés et cartes avec une date d’achat (les lots et le scellé n’ont pas de date)',
        corps: [G.legende([{ nom: 'Tickets japonais', cls: 'g-s1' }, { nom: 'Cartes sans ticket', cls: 'g-s4' }]), hostA],
        table: function () { return tableau([{ t: 'Période', f: function (x) { return x.long; } }, { t: 'Tickets', f: function (x) { return eur(x.tk, 2); } }, { t: 'Sans ticket', f: function (x) { return eur(x.ct, 2); } }], BA.filter(function (x) { return x.tk || x.ct; }).reverse(), null, 'Achats dans le temps'); } }));
    }
    /* tickets */
    g.appendChild(carte({ span: 'pl-c12', titre: 'Tickets · ' + R.tickets.length, sous: 'touche un ticket pour voir ses cartes', corps: [R.tickets.length ? tableau([
      { t: 'Ticket', f: function (x) { return h('a', { href: '#ticket/' + encodeURIComponent(x.id), text: x.id + ' · ' + (x.t.boutique || 'Boutique non indiquée') }); }, v: function (x) { return x.id; } },
      { t: 'Date', f: function (x) { return x.t.date ? dateFR(x.t.date) : '—'; }, v: function (x) { return x.t.date || ''; } },
      { t: 'Total', f: function (x) { return yen(x.t.total_yen); }, v: function (x) { return z(x.t.total_yen); } },
      { t: 'Payé', f: function (x) { return eur(x.paye_eur, 2); }, v: function (x) { return z(x.paye_eur); }, barre: true },
      { t: 'Cartes', f: function (x) { return nbr(x.nb); }, v: function (x) { return x.nb; } },
      { t: 'Contrôle', f: function (x) { return x.nb === 0 ? badge('Sans carte', 'estime') : x.ok ? badge('OK', 'ok') : badge('Écart ' + (x.ecart_yen > 0 ? '+' : '−') + yen(Math.abs(x.ecart_yen)), 'ecart'); }, v: function (x) { return x.nb === 0 ? 1 : x.ok ? 0 : 2; } }
    ], R.tickets.slice().reverse(), null, 'Tickets', { cle: 'tickets' }) : vide2('Aucun ticket.')] }));
    if (S.doc.tickets_ecartes.length) g.appendChild(carte({ span: 'pl-c12', titre: 'Tickets écartés', sous: 'dépenses du voyage qui ne sont pas des cartes : non comptées', corps: [h('ul', { class: 'pl-rows' }, S.doc.tickets_ecartes.map(function (t) {
      return h('li', null, h('div', { class: 'pl-row pl-row--sans' }, [h('span', { class: 'pl-row__main' }, [h('span', { class: 'pl-row__nom', text: t.libelle }), h('span', { class: 'pl-row__meta', text: [dateFR(t.date), t.note].filter(Boolean).join(' · ') })]), h('span', { class: 'pl-row__nums' }, h('span', { class: 'pl-row__prix', text: yen(t.total_yen) }))]));
    }))] }));
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
    m.appendChild(entete('Scellé et quantités', 'Card sets, ex et boosters, vendus au nombre'));
    R.produits.forEach(function (x) {
      var p = x.p, v = x.vente;
      var kids = [
        h('div', { class: 'pl-kpis' }, [
          tuile('En stock', nbr(x.reste) + ' / ' + nbr(x.nb), v.vendus ? nbr(v.vendus) + ' vendu' + pl(v.vendus) : 'aucune vente'),
          tuile('Prix unitaire', eur(x.prix_u, 2), p.composants ? 'somme des cartes qui le composent' : null),
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
  VUES.analyse = function (m) {
    var R = S.R, An = w.PRAnalyse;
    m.appendChild(entete('Analyse', 'Ce qui se vend, ce qui rapporte, où placer tes capitaux'));
    m.appendChild(sousOnglets('analyse'));
    if (!An || !G) { m.appendChild(h('p', { class: 'pl-box', text: 'Le module d’analyse ne s’est pas chargé : recharge la page.' })); return; }
    var fa = S.fa || (S.fa = { dim: 'rarete', budget: +(lire('pr.pilotage.budget') || 0) || 2000, dimBudget: 'rarete', tout: false, sel: null });
    var A = An.segments(R, fa.dim), Pf = fa.dim === 'type' ? A : An.segments(R, 'type'), T = Pf.total;
    if (fa.sel && !A.lignes.some(function (s) { return s.cle === fa.sel; })) fa.sel = null;
    /* qualité des données (portefeuille complet : cartes et scellé) */
    var aDater = R.cartes.filter(function (r) { return r.c.vendu && !r.hors && !r.date_vente; }).length;
    var mesures = T.n_delais;
    var nbCartes = R.cartes.filter(function (r) { return r.compte && !r.hors; }).length;
    var base = 'Base : ' + nbr(T.nv) + ' vente' + pl(T.nv) + ' pour ' + nbr(nbCartes) + ' cartes et ' + nbr(T.n - nbCartes) + ' articles scellés ; ' + pct(T.part_estimee) + ' du coût total est estimé (cartes sans prix d’achat). ';
    var DVt = R.dates_ventes || { debut: aujourdhui(), delai: 7 };
    base += mesures ? 'Délai de vente sur ' + mesures + ' vente' + pl(mesures) + (T.n_delais_est ? ', dont ' + T.n_delais_est + ' estimée' + pl(T.n_delais_est) + ' faute de date d’achat ou de vente (' + DVt.delai + ' jours par défaut)' : '') + ' ; le stock est en vente depuis le ' + dateFR(DVt.debut) + '.' : 'Aucune vente n’a encore de délai mesurable.';
    m.appendChild(h('p', { class: 'pl-note pl-base' }, [base, aDater ? h('span', null, [' ', lienBtn('Dater mes ventes (' + aDater + ')', feuilleDatesVentes)]) : null]));
    var g = h('div', { class: 'pl-grille' });
    m.appendChild(g);
    g.appendChild(kpi({ span: 'pl-c3', label: 'Rentabilité réalisée', v: pct(T.rentab_real), cls: T.rentab_real < 0 ? 'pl-neg' : '', sous: 'bénéfice net ÷ coût des ventes' }));
    g.appendChild(kpi({ span: 'pl-c3', label: 'Rentabilité attendue', v: pct(T.rentab_att), sous: 'stock revendu au prix que tu obtiens d’habitude' }));
    g.appendChild(kpi({ span: 'pl-c3', label: 'Écoulement', v: pct(T.ecoul), sous: 'part du capital déjà vendue' }));
    g.appendChild(kpi({ span: 'pl-c3', label: mesures ? 'Délai médian' : 'Prix obtenu', v: mesures ? NF0.format(T.delai_median) + ' jours' : pct(Pf.realisation), sous: mesures ? 'de la mise en vente à la vente' : 'prix de vente ÷ prix marché' }));
    /* découpage */
    var chips = h('div', { class: 'pl-seg pl-seg--dims', role: 'group', 'aria-label': 'Découper par' });
    An.DIMENSIONS.forEach(function (dm) {
      chips.appendChild(h('button', { type: 'button', 'data-focus': 'dim-' + dm.id, 'aria-pressed': String(fa.dim === dm.id), text: dm.nom,
        onclick: function () { if (fa.dim !== dm.id) { fa.dim = dm.id; fa.tout = false; fa.sel = null; rendre(true); } } }));
    });
    g.appendChild(h('div', { class: 'pl-titre-groupe pl-titre-groupe--seg' }, [h('h2', { text: 'Découper par' }), chips]));
    function choisirSeg(k) { fa.sel = fa.sel === k ? null : k; rendre(true); }
    /* matrice rentabilité × écoulement */
    var pts = A.lignes.filter(function (s) { return s.rentab != null && s.ecoul != null && s.cout >= 20 && !/compléter|Sans données/.test(s.reco); })
      .sort(function (a, b) { return b.cout - a.cout; }).slice(0, 14);
    var hostM = h('div');
    if (pts.length >= 2) G.nuage(hostM, {
      points: pts.map(function (s) { return { cle: s.cle, label: s.cle, x: s.ecoul, y: s.rentab, taille: s.cout_stock }; }),
      xNom: 'Écoulement →', yNom: '↑ Rentabilité retenue', xLib: 'écoulement', yLib: 'rentabilité retenue', moyX: A.ecoul_moy, moyY: A.rentab_moy,
      quadrants: ['Sélectif', 'Renforcer', 'Alléger', 'Rotation'], sel: fa.sel, onSelect: choisirSeg,
      detail: function (p) { var s = pts.filter(function (x) { return x.cle === p.cle; })[0]; return [{ v: eur(s.cout_stock, 0), l: 'encore en stock', sous: true }, { v: nbr(s.nv) + ' / ' + nbr(s.n), l: 'vendus', sous: true }, { v: s.reco, l: 'avis', sous: true }]; },
      aria: 'Rentabilité retenue selon l’écoulement de chaque segment ; chiffres dans la vue Tableau.'
    });
    g.appendChild(carte({ span: 'pl-c7', titre: 'Rentabilité × écoulement', sous: 'un point par ' + A.dim.nom.toLowerCase() + ' ; taille = capital encore en stock ; pointillés = tes moyennes',
      corps: [pts.length >= 2 ? hostM : vide2('Pas assez de segments mesurables pour ce découpage : choisis-en un autre.')],
      table: pts.length >= 2 ? function () { return tableauSegments(pts, A, fa); } : null,
      pied: ['En haut à droite : ce qui rapporte et part vite. Touche un point pour le retrouver dans le détail.'] }));
    var cap = A.lignes.filter(function (s) { return s.cout_stock > 0.5; }).sort(function (a, b) { return b.cout_stock - a.cout_stock; }).slice(0, 10);
    var hostK = h('div');
    if (cap.length) G.barres(hostK, { lignes: cap.map(function (s) { return { cle: s.cle, label: s.cle, sous: nbr(s.n - s.nv) + ' en stock · ' + pct(s.part_capital) + ' du stock', v: s.cout_stock, txt: eur(s.cout_stock, 0) }; }),
      sel: fa.sel, onSelect: choisirSeg, valeurNom: 'coût d’achat du stock', aria: 'Capital immobilisé par segment' });
    g.appendChild(carte({ span: 'pl-c5', titre: 'Où dort ton capital', sous: 'coût d’achat du stock encore à vendre', corps: [cap.length ? hostK : vide2('Plus rien en stock pour ce découpage.')] }));
    /* détail */
    var lignes = A.lignes, limite = fa.tout || lignes.length <= 14 ? lignes.length : 12;
    g.appendChild(carte({ span: 'pl-c12', titre: 'Détail par ' + A.dim.nom.toLowerCase(), sous: (fa.dim === 'type' ? '' : 'cartes seulement (le scellé est dans « Type de produit ») · ') + 'touche un en-tête pour trier',
      corps: [tableauSegments(lignes.slice(0, limite), A, fa, true)].concat(lignes.length > limite
        ? [h('button', { type: 'button', class: 'btn btn--ghost pl-plus', text: 'Afficher les ' + (lignes.length - limite) + ' suivantes', onclick: function () { fa.tout = true; rendre(true); } })] : []),
      pied: ['Rentabilité = bénéfice net ÷ coût d’achat. Réalisée : sur ce qui est vendu. Attendue : sur le stock, revendu au prix que tu obtiens d’habitude par rapport au prix marché. Retenue : les deux mêlées, d’autant plus vers la réalisée qu’il y a de ventes.'] }));
    g.appendChild(blocBudget());
    /* PSA ou brute */
    var Gd = fa.dim === 'gradation' ? A : An.segments(R, 'gradation');
    var psa = Gd.lignes.filter(function (s) { return s.cle === 'PSA 10'; })[0], brute = Gd.lignes.filter(function (s) { return s.cle === 'Brute'; })[0];
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
    if (comp) g.appendChild(carte({ span: 'pl-c5', titre: 'PSA 10 ou brutes', sous: 'tes PSA 10 face à tes cartes brutes', corps: [comp] }));
    g.appendChild(carte({ span: comp ? 'pl-c7' : 'pl-c12', titre: 'Faire grader une carte brute ?', sous: 'le calcul pour une carte précise', corps: [simulateurGradation()] }));
  };
  function tableauSegments(L, A, fa, avecTri) {
    var maxI = Math.max.apply(null, L.map(function (s) { return s.cout; }).concat([0]));
    return tableau([
      { t: A.dim.nom, f: function (s) { return h('span', null, [s.cle, s.part_estimee > 0.5 ? h('small', { class: 'pl-t-note', text: 'coût estimé à ' + pct(s.part_estimee) }) : null]); }, v: function (s) { return s.cle; } },
      { t: 'Avis', f: function (s) { return s.reco ? avis(s.reco) : ''; }, v: function (s) { return s.reco || ''; } },
      { t: 'Rentab. retenue', f: function (s) { return pct(s.rentab); }, v: function (s) { return s.rentab; }, cls: function (s) { return neg(s.rentab); } },
      { t: 'Écoulement', f: function (s) { return pct(s.ecoul); }, v: function (s) { return s.ecoul; } },
      { t: 'Vendus', f: function (s) { return nbr(s.nv) + ' / ' + nbr(s.n); }, v: function (s) { return s.nv; } },
      { t: 'Investi', f: function (s) { return eur(s.cout, 0); }, v: function (s) { return s.cout; }, barre: maxI > 0 },
      { t: 'En stock', f: function (s) { return eur(s.cout_stock, 0); }, v: function (s) { return s.cout_stock; } },
      { t: 'Réalisée', f: function (s) { return pct(s.rentab_real); }, v: function (s) { return s.rentab_real; }, cls: function (s) { return neg(s.rentab_real); } },
      { t: 'Attendue', f: function (s) { return pct(s.rentab_att); }, v: function (s) { return s.rentab_att; }, cls: function (s) { return neg(s.rentab_att); } },
      { t: 'Délai médian', f: function (s) { return s.n_delais ? NF0.format(s.delai_median) + ' j' : '—'; }, v: function (s) { return s.n_delais ? s.delai_median : null; } }
    ], L, avecTri ? Object.assign({}, A.total, { cle: fa.dim === 'type' ? 'Ensemble' : 'Toutes les cartes', reco: null }) : null, 'Analyse par ' + A.dim.nom,
      { cle: avecTri ? 'segments-' + fa.dim : null, trCls: function (s) { return fa.sel === s.cle ? 'pl-tr-sel' : null; } });
  }
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
    var COUL = ['g-s1', 'g-s2', 'g-s3', 'g-s4', 'g-s5', 'g-s6', 'g-s7', 'g-s8'];
    function dessiner() {
      zone.textContent = '';
      var Ab = An.segments(S.R, fa.dimBudget), rep = An.repartition(Ab, fa.budget);
      if (!rep.lignes.length) { zone.appendChild(vide2('Aucun segment assez solide pour ce découpage : essaie « Rareté » ou « Bloc ».')); return; }
      zone.appendChild(h('div', { class: 'pl-kpis pl-kpis--3' }, [
        tuile('Bénéfice attendu', '≈ ' + eurS(rep.benef, 0), 'une fois tout revendu'),
        tuile('Rentabilité', rep.place ? pct(rep.benef / rep.place) : '—', 'sur ' + eur(rep.place, 0) + ' placés'),
        tuile('Non placé', eur(Math.max(0, rep.non_place), 0), rep.non_place > 0.5 ? 'aucun segment ne mérite plus (40 % maximum chacun)' : 'tout le budget est placé')
      ]));
      var parts = rep.lignes.map(function (l, i) { return { label: l.s.cle, v: l.montant, txt: eur(l.montant, 0), cls: COUL[i % 8], court: rep.lignes.length <= 6 ? pct(l.montant / fa.budget) : null }; });
      if (rep.non_place > 0.5) parts.push({ label: 'Non placé', v: rep.non_place, txt: eur(rep.non_place, 0), cls: 'g-mute' });
      zone.appendChild(G.parts(h('div'), { parts: parts.slice(0, 8), haute: true, aria: 'Répartition du budget' }));
      zone.appendChild(tableau([
        { t: Ab.dim.nom, f: function (l) { return l.s.cle; }, v: function (l) { return l.s.cle; } },
        { t: 'Budget', f: function (l) { return eur(l.montant, 0); }, v: function (l) { return l.montant; }, barre: true },
        { t: 'Part', f: function (l) { return pct(l.montant / fa.budget); }, v: function (l) { return l.montant; } },
        { t: 'Bénéfice att.', f: function (l) { return eurS(l.benef, 0); }, v: function (l) { return l.benef; } },
        { t: '≈ Articles', f: function (l) { return l.cartes ? NF0.format(l.cartes) : '—'; }, v: function (l) { return l.cartes; } },
        { t: 'Rôle', f: function (l) { return avis(l.role); }, v: function (l) { return l.role; } }
      ], rep.lignes, null, 'Répartition du budget', { cle: 'budget' }));
    }
    champ.addEventListener('input', function () {
      clearTimeout(minuteur);
      minuteur = setTimeout(function () { var v = lireNombre(champ.value).v; if (v != null && v > 0) { fa.budget = v; ecrire('pr.pilotage.budget', String(v)); dessiner(); } }, 350);
    });
    sel.addEventListener('change', function () { fa.dimBudget = sel.value; dessiner(); });
    dessiner();
    return carte({ span: 'pl-c12', titre: 'Prochain voyage : où placer ton budget', sous: 'part proportionnelle à rentabilité × écoulement, 40 % maximum par segment, 10 % pour tester',
      corps: [h('div', { class: 'pl-form pl-form--ligne' }, [
        h('div', { class: 'field pl-demi' }, [h('label', { for: 'pl-budget', text: 'Budget d’achat (€)' }), champ]),
        h('div', { class: 'field pl-demi' }, [h('label', { for: 'pl-budget-dim', text: 'Répartir par' }), sel])
      ]), zone],
      pied: ['La logique marge × rotation d’un ROI ; 10 % vont tester les 2 meilleurs segments encore trop peu connus. Bénéfice attendu : si ces achats se revendent aux marges observées sur ce segment. Aide à la décision, à relire avec ton œil sur le marché.'] });
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
    return h('div', { class: 'pl-sim' }, [form.el, sortie,
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
        h('p', { class: 'pl-dates__n', text: c.nom || c.ref }), h('p', { class: 'pl-row__meta', text: 'N° ' + c.ref + ' · ' + eur(r.encaisse) + (ach ? ' · achetée le ' + dateFR(ach) : '') + (r.date_vente ? ' · vendue ' + quandVendue(r) : ' · sans date') }),
        h('div', { class: 'pl-dates__c' }, [ia ? h('label', null, [h('span', { text: 'Achat' }), ia]) : null, iv ? h('label', null, [h('span', { text: 'Vente' }), iv]) : null])
      ])]);
    }));
    var tout = h('input', { class: 'input', type: 'date', id: 'pl-dates-tout' });
    tout.addEventListener('change', function () { Object.keys(champs).forEach(function (k) { var iv = champs[k].v; if (iv && !iv.value) iv.value = tout.value; }); });
    var fs = feuille('Dater mes ventes', [h('p', { class: 'pl-note', text: 'Sans vraie date, une vente passée compte ' + S.R.dates_ventes.delai + ' jours après l’achat (« vers le »). Mets la vraie date si tu la connais, sinon laisse vide.' }),
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

  /* ---------------------------------------------------------------- charges, voyages, coûts complets (moteur : assets/js/pilotage-couts.js) */
  var KC = w.PRCouts;
  function periodeDe(k) {
    if (!k || k === 'tout') return null;
    if (/^\d{4}$/.test(k)) return { debut: k + '-01-01', fin: k + '-12-31', nom: k };
    if (k === '12m') return { debut: KC.plusJours(aujourdhui(), -364), fin: aujourdhui(), nom: '12 derniers mois' };
    return null;
  }
  function couts(k) {
    k = k || 'tout';
    if (S.cacheC && S.cacheC.R === S.R && S.cacheC.k === k) return S.cacheC.x;
    var x = KC.couts(S.R, S.doc, { aujourdhui: aujourdhui(), periode: periodeDe(k) });
    S.cacheC = { R: S.R, k: k, x: x };
    return x;
  }
  function sousOnglets(actif) {
    return h('nav', { class: 'pl-seg', 'aria-label': 'Rubriques de l’analyse' }, [['analyse', 'Segments'], ['couts', 'Coûts'], ['voyages', 'Voyages'], ['fiscal', 'SASU']].map(function (x) {
      return h('a', { href: '#' + x[0], 'aria-current': x[0] === actif ? 'page' : null, text: x[1] });
    }));
  }
  function voyageParId(id) { return (S.doc.voyages || []).filter(function (v) { return v.id === id; })[0] || null; }
  function produitDe(id) { return S.R.produits.filter(function (x) { return x.id === id; })[0] || null; }
  function libelleCible(c) {
    if (c.cible === 'voyage') { var V = voyageParId(c.voyage); return 'Voyage · ' + (V ? V.nom : 'supprimé'); }
    if (c.cible === 'carte') {
      var r = S.R.parRef[c.ref], x = r ? null : produitDe(c.ref);
      return r ? 'N° ' + c.ref + ' · ' + (r.c.nom || '') : x ? (x.p.libelle || x.p.nom) : 'N° ' + c.ref + ' (introuvable)';
    }
    return 'Toute l’activité';
  }
  function montantCharge(c) {
    if (KC.categorie(c.cat).heures) return nbr(c.heures) + ' h';
    if (c.devise === 'JPY') return eur(S.R.params.taux ? z(c.montant) / S.R.params.taux : null, 2);
    return eur(c.montant, 2);
  }
  var NATURES = { directe: ['Directe', 'ok'], indirecte: ['Structure', ''], cachee: ['Cachée', 'garde'] };
  function tagNature(cat) { var n = NATURES[cat.nature] || ['', '']; return badge(n[0], n[1]); }
  function nouvelId(p) { return p + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); }

  /* liste des charges */
  VUES.charges = function (m) {
    var fc = S.fch || (S.fch = { filtre: 'toutes' }), X = couts('tout');
    var ch = (S.doc.charges || []).slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    m.appendChild(h('a', { class: 'pl-back', href: '#plus', text: '‹ Plus' }));
    m.appendChild(entete('Charges', 'Voyages, abonnements, fournitures, temps passé',
      [h('button', { type: 'button', class: 'btn pl-btn-s', text: '+ Charge', onclick: function () { feuilleCharge(null); } })]));
    if (!ch.length) {
      m.appendChild(h('div', { class: 'pl-box' }, [h('p', { class: 'pl-big', text: 'Aucune charge pour l’instant' }),
        h('p', { class: 'pl-note', text: 'Exemples : billets d’avion et hôtel du voyage au Japon, abonnement Shopify, toploaders et sleeves, frais PSA, commission eBay, ton temps passé. Chaque charge est classée (directe, de structure ou cachée) et répartie là où elle doit aller : sur les cartes d’un voyage, sur une carte, ou sur toute l’activité.' }),
        h('div', { class: 'pl-actions' }, bouton('Ajouter ma première charge', function () { feuilleCharge(null); }))]));
      return;
    }
    var FILTRES = [['toutes', 'Toutes'], ['voyage', 'Voyages'], ['directe', 'Directes'], ['indirecte', 'Structure'], ['cachee', 'Temps'], ['rec', 'Récurrentes']];
    m.appendChild(h('div', { class: 'pl-chips', role: 'group', 'aria-label': 'Filtrer les charges' }, FILTRES.map(function (f) {
      return h('button', { type: 'button', class: 'chip', 'data-focus': 'fch-' + f[0], 'aria-pressed': String(fc.filtre === f[0]), text: f[1], onclick: function () { fc.filtre = f[0]; rendre(true); } });
    })));
    var liste = ch.filter(function (c) {
      var cat = KC.categorie(c.cat);
      if (fc.filtre === 'voyage') return c.cible === 'voyage';
      if (fc.filtre === 'rec') return !!c.recurrence;
      if (fc.filtre === 'toutes') return true;
      return cat.nature === fc.filtre;
    });
    var parCharge = {};
    X.occurrences.forEach(function (o) { var p = parCharge[o.c.id] || (parCharge[o.c.id] = { n: 0, cout: 0, tva: 0 }); p.n++; p.cout += o.cout; p.tva += o.tva; });
    var tot = 0, tva = 0;
    liste.forEach(function (c) { var p = parCharge[c.id]; if (p && KC.categorie(c.cat).nature !== 'cachee') { tot += p.cout; tva += p.tva; } });
    m.appendChild(h('p', { class: 'pl-resume', text: liste.length + ' charge' + pl(liste.length) + ' · ' + eur(tot, 2) + ' payés' + (tva ? ' dont ' + eur(tva, 2) + ' de TVA' : '') }));
    function ligne(c) {
      var cat = KC.categorie(c.cat), p = parCharge[c.id] || { n: 0, cout: 0 };
      var meta = [dateFR(c.date), cat.nom, libelleCible(c)];
      if (c.recurrence) meta.push((c.recurrence === 'mois' ? 'chaque mois' : 'chaque année') + (c.fin ? ' jusqu’au ' + dateFR(c.fin) : '') + ' · ' + p.n + ' échéance' + pl(p.n));
      var nums = [h('span', { class: 'pl-row__prix', text: montantCharge(c) + (c.recurrence ? (c.recurrence === 'mois' ? ' /mois' : ' /an') : '') }), tagNature(cat)];
      if (c.recurrence && p.n > 1) nums.splice(1, 0, h('span', { class: 'pl-row__m', text: eur(p.cout, 2) + ' au total' }));
      if (c.devise === 'JPY' && !cat.heures) meta.push(yen(c.montant));
      if (cat.heures) meta.push(S.R.params && S.doc.params.taux_horaire != null ? eur(p.cout, 2) + ' de temps' : 'taux horaire à régler');
      return h('li', null, h('button', { type: 'button', class: 'pl-row pl-row--sans pl-row--btn', onclick: function () { feuilleCharge(c.id); } }, [
        h('span', { class: 'pl-row__main' }, [h('span', { class: 'pl-row__nom', text: c.libelle || cat.nom }), h('span', { class: 'pl-row__meta', text: meta.join(' · ') })]),
        h('span', { class: 'pl-row__nums' }, nums)
      ]));
    }
    var rec = liste.filter(function (c) { return c.recurrence; }), pon = liste.filter(function (c) { return !c.recurrence; });
    if (rec.length && fc.filtre !== 'rec') m.appendChild(section('Récurrentes', [h('ul', { class: 'pl-rows' }, rec.map(ligne))]));
    if (fc.filtre === 'rec') { m.appendChild(h('ul', { class: 'pl-rows pl-sec' }, rec.map(ligne))); return; }
    var mois = {};
    pon.forEach(function (c) { var k = String(c.date).slice(0, 7); (mois[k] = mois[k] || []).push(c); });
    Object.keys(mois).sort().reverse().forEach(function (k) {
      var l = mois[k], t = 0;
      l.forEach(function (c) { var p = parCharge[c.id]; if (p && KC.categorie(c.cat).nature !== 'cachee') t += p.cout; });
      var d0 = new Date(k + '-15T12:00:00Z');
      var titre = isNaN(d0) ? k : d0.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      m.appendChild(section(titre.charAt(0).toUpperCase() + titre.slice(1) + ' · ' + eur(t, 2), [h('ul', { class: 'pl-rows' }, l.map(ligne))]));
    });
  };

  /* ajouter / modifier une charge */
  var CONSEILS = {
    voyage: 'Rattache-le au voyage : il sera réparti sur les cartes achetées pendant ce voyage et s’ajoutera à leur coût.',
    sejour: 'Rattache-le au voyage. Ce qui est personnel (souvenirs, sorties) n’a rien à faire ici.',
    transport: 'Port ou douane d’un achat : rattache-le à la carte, au voyage, ou laisse « toute l’activité ».',
    gradation: 'Rattache-la à la carte gradée : elle s’ajoute à son coût. Tarif PSA, envois, assurance et frais au retour compris.',
    commission: 'La commission de tes réglages ({fv}) est déjà déduite de chaque vente : n’ajoute ici que ce qui s’y ajoute.',
    envoi: 'Les {envoi} par envoi de tes réglages sont déjà comptés : n’ajoute ici que ce qui s’y ajoute (lot d’enveloppes, port non refacturé…).',
    fournitures: 'Répartie sur toute l’activité.',
    abonnement: 'Choisis « Chaque mois » ou « Chaque année » : les échéances s’ajoutent toutes seules jusqu’à aujourd’hui.',
    materiel: 'Au-delà de 500 € HT, un matériel s’amortit sur plusieurs années une fois en SASU.',
    temps: 'Temps non payé (chasse aux cartes, photos, annonces, lives) : valorisé à ton taux horaire des réglages, en coût caché.'
  };
  function feuilleCharge(id, preset) {
    var doc = S.doc, c0 = id ? (doc.charges || []).filter(function (c) { return c.id === id; })[0] : null;
    var init = c0 ? Object.assign({}, c0) : Object.assign({ date: aujourdhui(), devise: 'EUR', cat: 'fournitures', cible: 'general', recurrence: '' }, preset || {});
    if (!init.cible) init.cible = 'general';
    if (!init.recurrence) init.recurrence = '';
    var vs = (doc.voyages || []);
    if (init.cible === 'voyage' && !init.voyage && vs.length) init.voyage = vs[vs.length - 1].id;
    if (init.cible === 'voyage' && !vs.length) init.cible = 'general';
    var refs = S.R.cartes.map(function (r) { return r.ref; }).concat(S.R.produits.map(function (x) { return x.id; }));
    var dl = h('datalist', { id: 'pl-refs' }, refs.map(function (r) { return h('option', { value: r }); }));
    var defs = [
      { k: 'libelle', label: 'Libellé', type: 'text', req: true, ph: 'Billet d’avion, Shopify, toploaders…' },
      { k: 'cat', label: 'Catégorie', type: 'select', options: KC.CATEGORIES.map(function (x) { return [x.id, x.nom + (x.compte ? ' · ' + x.compte : '')]; }) },
      { k: 'montant', label: 'Montant TTC', type: 'num', demi: true, si: ['cat', KC.CATEGORIES.filter(function (x) { return !x.heures; }).map(function (x) { return x.id; })] },
      { k: 'devise', label: 'Devise', type: 'select', demi: true, options: [['EUR', '€'], ['JPY', '¥ (au taux des réglages)']], si: ['cat', KC.CATEGORIES.filter(function (x) { return !x.heures; }).map(function (x) { return x.id; })] },
      { k: 'heures', label: 'Heures', type: 'num', demi: true, si: ['cat', ['temps']] },
      { k: 'date', label: 'Date', type: 'date', demi: true, req: true },
      { k: 'tva', label: 'Dont TVA', type: 'num', demi: true, aide: 'Sur la facture (même devise).', si: ['cat', KC.CATEGORIES.filter(function (x) { return !x.heures; }).map(function (x) { return x.id; })] },
      { k: 'cible', label: 'Rattacher à', type: 'select', options: [['general', 'Toute l’activité']].concat(vs.length ? [['voyage', 'Un voyage']] : []).concat([['carte', 'Une carte ou un produit']]) },
      { k: 'voyage', label: 'Voyage', type: 'select', options: vs.map(function (v) { return [v.id, v.nom]; }), si: ['cible', ['voyage']] },
      { k: 'ref', label: 'N° de la carte ou produit', type: 'text', list: 'pl-refs', ph: 'ex. 102 ou boosters', si: ['cible', ['carte']] },
      { k: 'recurrence', label: 'Revient', type: 'select', demi: true, options: [['', 'Une seule fois'], ['mois', 'Chaque mois'], ['an', 'Chaque année']] },
      { k: 'fin', label: 'Jusqu’au (facultatif)', type: 'date', demi: true, si: ['recurrence', ['mois', 'an']] },
      { k: 'note', label: 'Note (facultatif)', type: 'textarea' }
    ];
    var form = formulaire(defs, init);
    var conseil = h('p', { class: 'pl-apercu', 'aria-live': 'polite' });
    function majConseil() {
      var cat = KC.categorie(form.champs.cat.value), t = CONSEILS[cat.id] || 'Répartie sur toute l’activité.';
      t = t.replace('{fv}', pct(S.R.params.fv)).replace('{envoi}', eur(S.R.params.envoi, 2));
      if (cat.heures && S.doc.params.taux_horaire == null) t += ' Ton taux horaire n’est pas encore réglé (Réglages).';
      conseil.textContent = (cat.compte ? 'Compte ' + cat.compte + ' · ' : '') + 'charge ' + ({ directe: 'directe', indirecte: 'de structure', cachee: 'cachée' })[cat.nature] + ', ' + cat.comportement + '. ' + t;
    }
    /* la catégorie choisit le rattachement habituel (voyage, carte ou toute l'activité) ; il reste modifiable ensuite */
    form.champs.cat.addEventListener('change', function () {
      var cat = KC.categorie(form.champs.cat.value), cible = form.champs.cible;
      var v = cat.cible && cible.querySelector('option[value="' + cat.cible + '"]') ? cat.cible : 'general';
      if (cible.value !== v) { cible.value = v; cible.dispatchEvent(new Event('change')); }
      majConseil();
    });
    majConseil();
    var actions = [bouton('Annuler', fermer, 'btn--ghost'), h('button', { type: 'submit', class: 'btn', text: c0 ? 'Enregistrer' : 'Ajouter' })];
    form.champs.cat.parentNode.insertAdjacentElement('afterend', conseil);
    var corps = [dl, form.el];
    if (c0) corps.push(h('p', { class: 'pl-note' }, lienBtn('Supprimer cette charge', function () {
      fermer();
      modifier('Charge supprimée · ' + (c0.libelle || ''), function (d0) { d0.charges = (d0.charges || []).filter(function (x) { return x.id !== c0.id; }); });
    }, 'pl-danger')));
    var fs = feuille(c0 ? 'Modifier la charge' : 'Nouvelle charge', corps, actions);
    fs.form.addEventListener('submit', function (e) {
      e.preventDefault();
      var x = form.lire();
      if (!x) return;
      var cat = KC.categorie(x.cat);
      if (cat.heures) { if (!(x.heures > 0)) { form.erreur('heures', 'Indique un nombre d’heures.'); return; } }
      else if (!(x.montant > 0)) { form.erreur('montant', 'Indique un montant positif.'); return; }
      if (!cat.heures && x.tva != null && (x.tva < 0 || x.tva > x.montant)) { form.erreur('tva', 'La TVA doit être comprise entre 0 et le montant.'); return; }
      if (x.cible === 'voyage' && !x.voyage) { form.erreur('voyage', 'Choisis le voyage.'); return; }
      if (x.cible === 'carte') {
        var rf = String(x.ref || '').trim();
        var trouve = S.R.parRef[rf] ? rf : (/^\d{1,2}$/.test(rf) && S.R.parRef[rf.padStart(3, '0')] ? rf.padStart(3, '0') : (produitDe(rf) ? rf : null));
        if (!trouve) { form.erreur('ref', 'Aucune carte ni produit avec ce numéro.'); return; }
        x.ref = trouve;
      }
      if (x.fin && x.fin < x.date) { form.erreur('fin', 'La fin doit venir après la date.'); return; }
      var ch = { id: c0 ? c0.id : nouvelId('C'), libelle: x.libelle, date: x.date, cat: cat.id, cible: x.cible || 'general' };
      if (cat.heures) ch.heures = x.heures; else { ch.montant = x.montant; ch.devise = x.devise === 'JPY' ? 'JPY' : 'EUR'; if (x.tva) ch.tva = x.tva; }
      if (ch.cible === 'voyage') ch.voyage = x.voyage;
      if (ch.cible === 'carte') ch.ref = x.ref;
      if (x.recurrence) { ch.recurrence = x.recurrence; if (x.fin) ch.fin = x.fin; }
      if (x.note) ch.note = x.note;
      fermer();
      modifier((c0 ? 'Charge modifiée · ' : 'Charge · ') + ch.libelle + ' · ' + montantCharge(ch), function (d0) {
        var l = d0.charges || (d0.charges = []), i = l.map(function (y) { return y.id; }).indexOf(ch.id);
        if (i === -1) l.push(ch); else l[i] = ch;
      });
    });
  }

  /* ---------------------------------------------------------------- coûts et rentabilité */
  VUES.couts = function (m) {
    var fc = S.fco || (S.fco = { periode: 'tout' });
    var ans = KC.annees(S.doc, S.R);
    if (fc.periode !== 'tout' && fc.periode !== '12m' && ans.indexOf(fc.periode) === -1) fc.periode = 'tout';
    var X = couts(fc.periode), c = X.cascade, sd = X.seuil, ca = c.ca, nCh = (S.doc.charges || []).length;
    m.appendChild(entete('Analyse', 'Coûts complets, seuil de rentabilité, coûts cachés'));
    m.appendChild(sousOnglets('couts'));
    var seg = h('div', { class: 'pl-seg pl-seg--per', role: 'group', 'aria-label': 'Période' });
    [['tout', 'Depuis le début'], ['12m', '12 derniers mois']].concat(ans.map(function (a) { return [a, a]; })).forEach(function (p) {
      seg.appendChild(h('button', { type: 'button', 'data-focus': 'per-' + p[0], 'aria-pressed': String(fc.periode === p[0]), text: p[1], onclick: function () { fc.periode = p[0]; rendre(true); } }));
    });
    m.appendChild(seg);
    var info = [];
    if (!nCh) info.push('Aucune charge saisie : le résultat ne compte que tes achats et tes ventes. ');
    if (X.non_datees) info.push(X.non_datees + ' vente' + pl(X.non_datees) + ' sans date ne compte' + (X.non_datees > 1 ? 'nt' : '') + ' que dans « Depuis le début ». ');
    if (info.length || !nCh) m.appendChild(h('p', { class: 'pl-note pl-base' }, info.concat([nCh ? null : lienBtn('Ajouter une charge', function () { feuilleCharge(null); })])));
    var g = h('div', { class: 'pl-grille' });
    m.appendChild(g);
    g.appendChild(kpi({ hero: true, label: 'Résultat analytique' + (X.periode ? ' · ' + X.periode.nom : ''), v: eurS(c.resultat, 0), cls: c.resultat < 0 ? 'pl-neg' : '',
      sous: 'après toutes les charges saisies' + (ca ? ' · ' + pct(c.resultat / ca) + ' du chiffre d’affaires' : ''),
      leg: 'Avec les coûts cachés (temps, capital, décote, dépréciation) : ' + eurS(c.resultat_economique, 0) + '.' }));
    g.appendChild(kpi({ span: 'pl-c4', label: 'Chiffre d’affaires', v: eur(ca, 0), sous: nbr(X.nb_ventes) + ' vente' + pl(X.nb_ventes) }));
    g.appendChild(kpi({ span: 'pl-c4', label: 'Marge commerciale', v: eur(c.marge_commerciale, 0), sous: ca ? 'taux de marque ' + pct(c.marge_commerciale / ca) : null }));
    g.appendChild(kpi({ span: 'pl-c4', label: 'Charges payées', v: eur(X.totaux.charges, 0), sous: X.totaux.tva ? 'dont ' + eur(X.totaux.tva, 0) + ' de TVA' : nCh + ' charge' + pl(nCh) }));
    g.appendChild(kpi({ span: 'pl-c4', label: 'Point mort', v: sd.point_mort_date ? (sd.point_mort_jours <= sd.duree ? dateFR(sd.point_mort_date) : 'pas atteint') : (sd.cf ? '—' : 'sans charge fixe'),
      sous: sd.point_mort_date ? (sd.point_mort_jours <= sd.duree ? 'charges fixes couvertes' : 'au rythme actuel : ' + dateFR(sd.point_mort_date)) : null }));
    /* cascade des marges */
    var L = [
      ['Chiffre d’affaires', c.ca, 'total'],
      ['Coût d’achat des articles vendus', -c.cout_achat],
      ['Marge commerciale', c.marge_commerciale, 'sous'],
      ['Frais d’achat des articles vendus', -c.frais_achat, null, 'voyages, gradation…'],
      c.frais_achat_non_affectes ? ['Frais d’achat non rattachés', -c.frais_achat_non_affectes] : null,
      ['Frais de vente', -c.frais_vente, null, 'commissions, envois'],
      ['Marge sur coûts directs', c.marge_directe, 'sous'],
      ['Charges de structure', -c.structure],
      ['Résultat analytique', c.resultat, 'total'],
      ['Coûts cachés (non payés)', -c.caches],
      ['Résultat économique', c.resultat_economique, 'total']
    ].filter(Boolean);
    var hostC = h('div');
    G.cascade(hostC, { etapes: L.map(function (l) { return { label: l[0], v: l[1], type: l[2] || 'delta', note: l[3] }; }), base: ca || null, fmt: function (v) { return eur(v, 0); }, aria: 'Cascade du chiffre d’affaires au résultat' });
    g.appendChild(carte({ span: 'pl-c7', titre: 'Cascade des marges', sous: 'du chiffre d’affaires au résultat · gris : les soldes, rouge : ce qui part', corps: [hostC],
      table: function () {
        var tb = h('table', { class: 'pl-table pl-cascade' }, [h('caption', { class: 'sr-only', text: 'Cascade des marges' }),
          h('thead', null, h('tr', null, [h('th', { scope: 'col', text: 'Du chiffre d’affaires au résultat' }), h('th', { scope: 'col', text: 'Montant' }), h('th', { scope: 'col', text: '% du CA' })])),
          h('tbody', null, L.map(function (l) {
            return h('tr', { class: l[2] ? 'pl-tot' + (l[2] === 'sous' ? ' pl-tot--sous' : '') : null }, [h('th', { scope: 'row', text: l[0] }),
              h('td', { class: l[2] && l[1] < -0.005 ? 'pl-neg' : null, text: eur(Math.abs(l[1]) < 0.005 ? 0 : l[1], 2) }), h('td', { text: ca ? pct(Math.abs(l[1]) < 0.005 ? 0 : l[1] / ca) : '—' })]);
          }))]);
        return h('div', { class: 'pl-scroll' }, tb);
      },
      pied: ['Méthode des coûts complets : les frais d’un voyage s’ajoutent au coût des cartes achetées pendant ce voyage et passent en charge au fil des ventes.' +
        (X.totaux.stock_frais_voyage > 0.5 ? ' ' + eur(X.totaux.stock_frais_voyage, 0) + ' de frais de voyage sont encore dans la valeur de ton stock.' : '')] }));
    /* directs, indirects, cachés */
    var DIC = [['Directs', X.totaux.directs, 'g-s1', 'achats, voyages, gradation, ventes'], ['Indirects', X.totaux.indirects, 'g-s2', 'structure : abonnements, fournitures…'], ['Cachés', X.totaux.caches, 'g-s3', 'temps, capital, décote, dépréciation']];
    var tDIC = DIC.reduce(function (a, x) { return a + Math.max(0, x[1]); }, 0);
    g.appendChild(carte({ span: 'pl-c5', titre: 'Directs, indirects, cachés', sous: 'ce que coûte l’activité, par nature',
      corps: [G.parts(h('div'), { parts: DIC.map(function (x) { return { label: x[0], v: x[1], txt: eur(x[1], 0), cls: x[2], legende: null }; }), haute: true, legende: false, aria: 'Coûts directs, indirects et cachés' }),
        h('dl', { class: 'pl-dl pl-dl--cles' }, [].concat.apply([], DIC.map(function (x) {
          return [h('dt', null, [h('i', { class: 'g-cle ' + x[2], 'aria-hidden': 'true' }), x[0], h('small', { text: x[3] })]), h('dd', null, [eur(x[1], 0), h('small', { text: (ca ? pct(x[1] / ca) + ' du CA' : '') + (tDIC ? ' · ' + pct(x[1] / tDIC) + ' du total' : '') })])];
        })))],
      pied: ['Directs : rattachés à un article, une vente ou un voyage. Indirects : la structure. Cachés : jamais payés, mais réels.'] }));
    /* seuil de rentabilité */
    var hostS = h('div'), courbeOk = sd.sr != null && sd.tmcv != null && sd.tmcv > 0;
    if (courbeOk) {
      var xmax = Math.max(ca, sd.sr) * 1.25 || 100, xs = [];
      for (var i = 0; i <= 40; i++) xs.push(xmax * i / 40);
      [sd.sr, ca].forEach(function (v) { if (v > 0 && xs.indexOf(v) === -1) xs.push(v); });
      xs.sort(function (a, b) { return a - b; });
      G.courbe(hostS, { type: 'num', x: xs, series: [{ nom: 'Chiffre d’affaires', cls: 'g-s1', valeurs: xs }, { nom: 'Coûts (fixes + variables)', cls: 'g-s2', valeurs: xs.map(function (x) { return sd.cf + x * (1 - sd.tmcv); }) }],
        points: [{ x: sd.sr, y: sd.sr, label: 'Seuil ' + eur(sd.sr, 0) }].concat(ca > 0 && Math.abs(ca - sd.sr) / xmax > 0.12 ? [{ x: ca, y: ca, label: 'Toi ' + eur(ca, 0) }] : []),
        hauteur: 240, fmt: function (v) { return eur(v, 0); }, fmtX: function (v) { return G.eurAxe(xmax)(v); }, fmtTitre: function (v) { return 'Avec ' + eur(v, 0) + ' de chiffre d’affaires'; }, finLabel: false,
        detail: function (i) { var r = xs[i] - (sd.cf + xs[i] * (1 - sd.tmcv)); return [{ v: eurS(r, 0), l: 'de résultat', sous: true }]; },
        aria: 'Chiffre d’affaires et coûts selon le niveau de ventes ; ils se croisent au seuil de rentabilité.' });
    }
    g.appendChild(carte({ span: 'pl-c7', titre: 'Seuil de rentabilité', sous: 'à partir de quel chiffre d’affaires tes charges fixes sont couvertes',
      corps: [h('p', { class: 'pl-big', text: sd.sr == null ? (sd.cf ? 'Ta marge sur coûts variables est nulle ou négative : pas de seuil possible.' : 'Aucune charge fixe sur la période : chaque vente est déjà du bénéfice.')
          : ca >= sd.sr ? 'Seuil dépassé de ' + eur(ca - sd.sr, 0) + ' : tes charges fixes sont couvertes' : 'Il manque ' + eur(sd.sr - ca, 0) + ' de chiffre d’affaires pour couvrir tes charges fixes' }),
        courbeOk ? G.legende([{ nom: 'Chiffre d’affaires', cls: 'g-s1', forme: 'ligne' }, { nom: 'Coûts fixes + variables', cls: 'g-s2', forme: 'ligne' }]) : null,
        courbeOk ? hostS : null,
        h('dl', { class: 'pl-dl' }, [
          h('dt', { text: 'Marge sur coûts variables' }), h('dd', { text: eur(sd.mcv, 0) + (sd.tmcv != null ? ' (' + pct(sd.tmcv) + ' du CA)' : '') }),
          h('dt', { text: 'Charges fixes de la période' }), h('dd', { text: eur(sd.cf, 0) }),
          h('dt', { text: 'Seuil de rentabilité' }), h('dd', { text: sd.sr != null ? eur(sd.sr, 0) + ' de CA' : '—' }),
          h('dt', { text: 'Marge de sécurité' }), h('dd', { text: sd.marge_securite != null ? eurS(sd.marge_securite, 0) + ' (' + pct(sd.indice_securite) + ' du CA)' : '—' }),
          h('dt', { text: 'Levier opérationnel' }), h('dd', { text: sd.levier != null ? dec1(sd.levier) + ' : +10 % de CA = +' + NF0.format(sd.levier * 10) + ' % de résultat' : '—' }),
          h('dt', { text: 'Résultat en coûts variables' }), h('dd', { text: eurS(sd.resultat, 0) })
        ]),
        Math.abs(sd.ecart) > 0.5 ? h('p', { class: 'pl-note', text: 'Écart de ' + eurS(sd.ecart, 0) + ' avec le résultat analytique : ici, les frais de voyage comptent en entier dans la période où tu les paies ; en coûts complets, ils suivent les cartes jusqu’à leur vente.' }) : null],
      pied: ['Coûts variables : achats des articles vendus, commissions, envois, gradation, fournitures. Charges fixes : voyages, abonnements, structure. Point mort au rythme de la période (' + nbr(sd.duree) + ' jours depuis le ' + dateFR(sd.debut) + ').'] }));
    /* charges par catégorie */
    var hostK = h('div');
    if (X.categories.length) G.barres(hostK, { lignes: X.categories.map(function (k) {
      return { cle: k.cat.id || k.cat.nom, label: k.cat.nom, sous: (k.cat.compte ? 'compte ' + k.cat.compte + ' · ' : '') + (NATURES[k.cat.nature] || [''])[0].toLowerCase() + ' · ' + k.n + ' ligne' + pl(k.n), v: k.montant, txt: eur(k.montant, 0) };
    }), valeurNom: 'payé', aria: 'Charges par catégorie' });
    g.appendChild(carte({ span: 'pl-c5', titre: 'Charges par catégorie', sous: 'payées sur la période', corps: [X.categories.length ? hostK : vide2('Aucune charge sur la période.', lienBtn('Ajouter une charge', function () { feuilleCharge(null); }))],
      pied: X.categories.length ? [h('a', { href: '#charges', text: 'Voir et modifier les charges ›' })] : null }));
    /* coûts cachés */
    var cc = X.caches, P = X.params;
    var lc = [
      ['Temps passé', cc.temps, cc.temps == null ? 'Règle ton taux horaire dans les réglages pour le chiffrer.' : dec1(cc.heures) + ' h × ' + eur(P.taux_horaire, 2) + ' (' + (P.minutes_vente != null ? NF0.format(P.minutes_vente) + ' min par vente' : 'temps par vente non réglé') + (cc.heures_saisies ? ', ' + dec1(cc.heures_saisies) + ' h saisies' : '') + ')'],
      ['Immobilisation du capital', cc.capital, pct(cc.taux_capital) + ' par an sur le coût complet, le temps que chaque carte reste en stock (ce que l’argent aurait rapporté placé sans risque).'],
      ['Décote consentie', cc.decote, 'Prix marché moins prix de vente, sur les ventes de la période.'],
      ['Dépréciation du stock', cc.depreciation, cc.n_depreciation ? cc.n_depreciation + ' carte' + pl(cc.n_depreciation) + ' dont le coût complet dépasse ce qu’elles rapporteraient vendues (prix marché × ' + pct(cc.realisation) + ', frais déduits).' : 'Aucune carte sous son coût complet.']
    ];
    var hostCC = h('div');
    G.barres(hostCC, { lignes: lc.map(function (l) { return { cle: l[0], label: l[0], v: z(l[1]), txt: l[1] == null ? '—' : eur(l[1], 0), cls: 'g-s2' }; }), valeurNom: 'coût caché', aria: 'Coûts cachés' });
    g.appendChild(carte({ span: 'pl-c12', titre: 'Coûts cachés · ' + eur(cc.total, 0), sous: 'ils ne sortent pas de ta poche mais réduisent ce que l’activité te rapporte vraiment', corps: [hostCC],
      table: function () {
        return tableau([
          { t: 'Coût caché', f: function (l) { return h('span', null, [l[0], h('small', { class: 'pl-t-note', text: l[2] })]); } },
          { t: 'Montant', f: function (l) { return l[1] == null ? '—' : eur(l[1], 2); } }
        ], lc, ['Total', cc.total], 'Coûts cachés');
      },
      pied: [h('a', { href: '#reglages', text: 'Régler le taux horaire, le temps par vente et le coût du capital ›' }), ' · Détail de chaque calcul dans la vue Tableau.'] }));
  };
  function dec1(v) { return vide(v) ? '—' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(v); }

  /* ---------------------------------------------------------------- voyages */
  function dateVoyage(V) {
    if (!V.debut) return 'sans dates';
    var d = new Date(V.debut + 'T12:00:00Z'), f = new Date((V.fin || V.debut) + 'T12:00:00Z'), M = G.MOIS;
    return d.getUTCFullYear() === f.getUTCFullYear() && d.getUTCMonth() === f.getUTCMonth()
      ? d.getUTCDate() + ' → ' + f.getUTCDate() + ' ' + M[f.getUTCMonth()] + ' ' + f.getUTCFullYear()
      : d.getUTCDate() + ' ' + M[d.getUTCMonth()] + ' → ' + f.getUTCDate() + ' ' + M[f.getUTCMonth()] + ' ' + f.getUTCFullYear();
  }
  function roiTxt(x) { return x != null ? (x > 0.0005 ? '+' : '') + pct(x) : '—'; }
  function carteVoyage(v, span) {
    var V = v.V, rp = v.roi_potentiel;
    return carte({ span: span, titre: V.nom, sous: [dateVoyage(V), v.duree ? v.duree + ' jour' + pl(v.duree) : null, nbr(v.articles.length) + ' article' + pl(v.articles.length)].filter(Boolean).join(' · '),
      actions: [h('a', { class: 'pl-ibtn', href: '#voyage/' + encodeURIComponent(V.id) }, ['Détail', h('span', { 'aria-hidden': 'true', text: '›' })])],
      corps: [h('div', { class: 'pl-voy' }, [
        h('div', null, [h('p', { class: 'pl-label', text: 'Retour potentiel' }), h('p', { class: 'pl-voy__v' + (rp < 0 ? ' pl-neg' : ''), text: roiTxt(rp) }), h('p', { class: 'pl-voy__s', text: 'déjà réalisé : ' + roiTxt(v.roi_realise) })]),
        h('div', null, [h('p', { class: 'pl-label', text: 'Coût récupéré' }), h('p', { class: 'pl-voy__v', text: v.recupere != null ? pct(v.recupere) : '—' }),
          G.jauge(v.recupere, { aria: (v.recupere != null ? pct(v.recupere) : 'Rien') + ' du coût complet récupéré' })])]),
        h('dl', { class: 'pl-dl' }, [
          h('dt', { text: 'Coût complet' }), h('dd', { text: eur(v.cout_total, 0) }),
          h('dt', { text: 'dont frais du voyage' }), h('dd', { text: eur(v.frais, 0) + (v.taux_frais != null ? ' · +' + pct(v.taux_frais) + ' sur les achats' : '') }),
          h('dt', { text: 'Encaissé' }), h('dd', { text: eur(v.ca, 0) + ' · ' + nbr(v.n_vendus) + ' vendu' + pl(v.n_vendus) }),
          h('dt', { text: 'Reste en stock' }), h('dd', { text: nbr(v.n_stock) + ' article' + pl(v.n_stock) + ' · ' + eur(v.valeur_stock, 0) })])] });
  }
  VUES.voyages = function (m) {
    var X = couts('tout'), vs = X.voyages.slice().reverse(), prop = KC.proposition(S.doc, S.R);
    m.appendChild(entete('Analyse', 'Ce que te coûte et te rapporte chaque voyage', [h('button', { type: 'button', class: 'btn pl-btn-s', text: '+ Voyage', onclick: function () { feuilleVoyage(null); } })]));
    m.appendChild(sousOnglets('voyages'));
    if (prop) m.appendChild(h('div', { class: 'pl-apercu pl-sec' }, ['Tes tickets japonais vont du ' + dateFR(prop.debut) + ' au ' + dateFR(prop.fin) + ' (' + prop.n + ' tickets datés) sans voyage. ',
      lienBtn('Créer ce voyage', function () { feuilleVoyage(null, { nom: 'Japon · ' + new Date(prop.debut + 'T12:00:00Z').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }), debut: prop.debut, fin: prop.fin }); })]));
    if (!vs.length) {
      m.appendChild(h('div', { class: 'pl-box pl-sec' }, [h('p', { class: 'pl-big', text: 'Aucun voyage pour l’instant' }),
        h('p', { class: 'pl-note', text: 'Un voyage regroupe ses frais (avion, hôtel, transports, repas) et les cartes achetées pendant ses dates. Tu sauras ce que chaque carte t’a vraiment coûté, le retour sur investissement du voyage, et le montant d’achats nécessaire pour amortir le prochain.' })]));
      return;
    }
    var T = vs.reduce(function (a, v) { a.cout += z(v.cout_total); a.frais += z(v.frais); a.achats += z(v.achats); a.ca += z(v.ca); a.benef += z(v.benef); a.latent += z(v.latent); a.stock += z(v.valeur_stock); a.ns += z(v.n_stock); return a; },
      { cout: 0, frais: 0, achats: 0, ca: 0, benef: 0, latent: 0, stock: 0, ns: 0 });
    var g = h('div', { class: 'pl-grille' });
    m.appendChild(g);
    var rpT = T.cout ? (T.benef + T.latent) / T.cout : null;
    g.appendChild(kpi({ hero: true, label: 'Retour potentiel · ' + (vs.length > 1 ? 'les ' + vs.length + ' voyages' : 'ton voyage'), v: roiTxt(rpT), cls: rpT < 0 ? 'pl-neg' : '',
      sous: 'si le stock des voyages part au prix marché · déjà réalisé : ' + roiTxt(T.cout ? T.benef / T.cout : null) + ' (' + eurS(T.benef, 0) + ')',
      leg: 'Retour = (bénéfice des ventes + plus-value du stock) ÷ coût complet (achats + frais du voyage).' }));
    g.appendChild(kpi({ span: 'pl-c4', label: 'Coût complet', v: eur(T.cout, 0), sous: 'achats + ' + eur(T.frais, 0) + ' de frais' }));
    g.appendChild(kpi({ span: 'pl-c4', label: 'Frais en plus des achats', v: T.achats ? '+' + pct(T.frais / T.achats) : '—', sous: eur(T.frais, 0) + ' pour ' + eur(T.achats, 0) + ' d’achats' }));
    g.appendChild(kpi({ span: 'pl-c4', label: 'Coût récupéré', v: T.cout ? pct(T.ca / T.cout) : '—', sous: eur(T.ca, 0) + ' encaissés' }));
    g.appendChild(kpi({ span: 'pl-c4', label: 'Reste en stock', v: eur(T.stock, 0), sous: nbr(T.ns) + ' article' + pl(T.ns) + ' au prix marché' }));
    vs.forEach(function (v) { g.appendChild(carteVoyage(v, vs.length === 1 ? 'pl-c12' : 'pl-c6')); });
    if (vs.length >= 2) {
      var hostR = h('div'), hostF = h('div');
      G.barres(hostR, { lignes: vs.map(function (v) { return { cle: v.V.id, label: v.V.nom, sous: dateVoyage(v.V), v: z(v.roi_potentiel), repere: v.roi_realise, txt: roiTxt(v.roi_potentiel) }; }),
        fmt: roiTxt, valeurNom: 'retour potentiel', repereNom: 'déjà réalisé', aria: 'Retour potentiel par voyage',
        onSelect: function (k) { location.hash = '#voyage/' + encodeURIComponent(k); } });
      G.barres(hostF, { lignes: vs.map(function (v) { return { cle: v.V.id, label: v.V.nom, sous: eur(v.frais, 0) + ' de frais', v: z(v.taux_frais), txt: v.taux_frais != null ? '+' + pct(v.taux_frais) : '—' }; }),
        signe: false, valeurNom: 'frais en plus des achats', aria: 'Frais en plus des achats, par voyage',
        detail: function (l) { var v = X.parVoyage[l.cle]; return v ? [{ v: eur(v.achats, 0), l: 'd’achats', sous: true }].concat(v.frais_par_jour ? [{ v: eur(v.frais_par_jour, 0), l: 'de frais par jour', sous: true }] : []) : []; } });
      g.appendChild(carte({ span: 'pl-c6', titre: 'Retour par voyage', sous: 'barre : potentiel · trait : déjà réalisé', corps: [hostR], cle: 'voyages-comparaison',
        table: function () {
          return tableau([
            { t: 'Voyage', f: function (v) { return h('a', { href: '#voyage/' + encodeURIComponent(v.V.id), text: v.V.nom }); }, v: function (v) { return v.V.debut || ''; } },
            { t: 'Achats', f: function (v) { return eur(v.achats, 0); }, v: function (v) { return v.achats; } },
            { t: 'Frais', f: function (v) { return eur(v.frais, 0); }, v: function (v) { return v.frais; } },
            { t: 'Coût complet', f: function (v) { return eur(v.cout_total, 0); }, v: function (v) { return v.cout_total; } },
            { t: 'Encaissé', f: function (v) { return eur(v.ca, 0); }, v: function (v) { return v.ca; } },
            { t: 'Résultat', f: function (v) { return eurS(v.benef, 0); }, v: function (v) { return v.benef; }, cls: function (v) { return neg(v.benef); } },
            { t: 'Retour potentiel', f: function (v) { return roiTxt(v.roi_potentiel); }, v: function (v) { return v.roi_potentiel; }, cls: function (v) { return neg(v.roi_potentiel); } }
          ], vs, null, 'Voyages', { cle: 'voyages' });
        } }));
      g.appendChild(carte({ span: 'pl-c6', titre: 'Frais en plus des achats', sous: 'ce que le voyage ajoute au prix de chaque carte', corps: [hostF] }));
    }
    m.appendChild(h('p', { class: 'pl-note pl-base', text: 'Une carte fait partie d’un voyage si son ticket ou sa date d’achat tombe dans ses dates, ou si tu l’y as rattachée (tickets et lots sans date, produits). Clé de répartition des frais : ' + (X.params.cle_voyage === 'nombre' ? 'le nombre d’articles' : 'le coût d’achat') + ' (Réglages).' }));
  };
  VUES.voyage = function (m, id) {
    var X = couts('tout'), v = X.parVoyage[id];
    m.appendChild(retour('#voyages', 'Voyages'));
    if (!v) { m.appendChild(h('p', { class: 'pl-box', text: 'Voyage introuvable.' })); return; }
    var V = v.V;
    m.appendChild(entete(V.nom, (V.debut ? dateFR(V.debut) + ' → ' + dateFR(V.fin) + ' · ' + v.duree + ' jour' + pl(v.duree) : 'sans dates'), [h('button', { type: 'button', class: 'btn btn--ghost pl-btn-s', text: 'Modifier', onclick: function () { feuilleVoyage(V.id); } })]));
    var g = h('div', { class: 'pl-grille' });
    m.appendChild(g);
    g.appendChild(kpi({ hero: true, label: 'Retour sur investissement potentiel', v: roiTxt(v.roi_potentiel), cls: v.roi_potentiel < 0 ? 'pl-neg' : '',
      sous: 'si le stock du voyage se vend au prix marché · déjà réalisé : ' + roiTxt(v.roi_realise) + ' (' + eurS(v.benef, 0) + ')' }));
    g.appendChild(kpi({ span: 'pl-c4', label: 'Coût complet', v: eur(v.cout_total, 0), sous: 'achats ' + eur(v.cout_achat, 0) + ' + frais ' + eur(v.frais, 0) }));
    g.appendChild(kpi({ span: 'pl-c4', label: 'Frais du voyage', v: eur(v.frais, 0), sous: v.taux_frais != null ? '+' + pct(v.taux_frais) + ' sur le prix des cartes' : 'aucun achat rattaché' }));
    g.appendChild(kpi({ span: 'pl-c4', label: 'Coût récupéré', v: v.recupere != null ? pct(v.recupere) : '—', sous: eur(v.ca, 0) + ' encaissés · ' + nbr(v.n_vendus) + ' vendu' + pl(v.n_vendus) }));
    g.appendChild(kpi({ span: 'pl-c4', label: 'Reste en stock', v: nbr(v.n_stock) + ' article' + pl(v.n_stock), sous: 'valeur marché ' + eur(v.valeur_stock, 0) }));
    /* frais : une barre par dépense */
    var parCh = {}, ordre = [];
    v.charges.forEach(function (o) { if (!parCh[o.c.id]) { parCh[o.c.id] = { c: o.c, v: 0 }; ordre.push(o.c.id); } parCh[o.c.id].v += z(o.cout); });
    var lignesF = ordre.map(function (k) { var x = parCh[k], cat = KC.categorie(x.c.cat); return { cle: k, label: x.c.libelle, sous: [dateFR(x.c.date), x.c.cat === 'voyage' ? null : cat.nom, x.c.devise === 'JPY' ? yen(x.c.montant) : null, cat.heures ? montantCharge(x.c) : null].filter(Boolean).join(' · '), v: x.v, txt: eur(x.v, 0) }; })
      .sort(function (x, y) { return y.v - x.v; });
    var hostF = h('div');
    if (lignesF.length) G.barres(hostF, { lignes: lignesF, valeurNom: 'coût', aria: 'Frais du voyage', onSelect: function (k) { feuilleCharge(k); } });
    g.appendChild(carte({ span: 'pl-c6', titre: 'Frais du voyage', sous: lignesF.length ? eur(v.frais, 0) + ' · touche une dépense pour la modifier' : null,
      actions: [h('button', { type: 'button', class: 'pl-ibtn', text: '+ Frais', onclick: function () { feuilleCharge(null, { cat: 'voyage', cible: 'voyage', voyage: V.id, date: V.debut || aujourdhui() }); } })],
      corps: [lignesF.length ? hostF : vide2('Aucun frais rattaché : ajoute l’avion, l’hôtel, les transports et les repas du voyage.'),
        lignesF.length ? h('dl', { class: 'pl-dl pl-dl--sep' }, [
          h('dt', { text: 'Par jour' }), h('dd', { text: v.frais_par_jour ? eur(v.frais_par_jour, 0) : '—' }),
          h('dt', { text: 'Par article acheté' }), h('dd', { text: v.articles.length ? eur(v.frais / v.articles.length, 2) : '—' }),
          h('dt', { text: 'En plus du prix des cartes' }), h('dd', { text: v.taux_frais != null ? '+' + pct(v.taux_frais) : '—' })]) : null] }));
    /* amortir les frais */
    var cartesV = v.articles.filter(function (a) { return a.type === 'carte'; }), prodV = v.articles.filter(function (a) { return a.type === 'produit'; });
    var nd = candidatsVoyage(V.id);
    var corpsA = [h('dl', { class: 'pl-dl' }, [
      h('dt', { text: 'Cartes' }), h('dd', { text: nbr(cartesV.length) + ' · ' + eur(somme(cartesV, function (a) { return a.achat; }), 0) }),
      h('dt', { text: 'Produits' }), h('dd', { text: prodV.length ? nbr(prodV.length) + ' · ' + eur(somme(prodV, function (a) { return a.achat; }), 0) : '—' }),
      h('dt', { text: 'Total des achats' }), h('dd', { text: eur(v.achats, 0) })])];
    if (v.seuil_achat != null && v.frais > 0) {
      var pS = v.achats / v.seuil_achat;
      corpsA.push(h('p', { class: 'pl-label pl-label--sep', text: 'Amortir ' + eur(v.frais, 0) + ' de frais' }),
        G.jauge(pS, { aria: pct(pS) + ' des achats nécessaires' }),
        h('p', { class: 'pl-note', text: 'Avec une marge de ' + pct(v.marge_avant_frais) + ' avant frais, il fallait au moins ' + eur(v.seuil_achat, 0) + ' d’achats ; tu en as fait ' + eur(v.achats, 0) + ' (' + pct(pS) + ').' + (v.frais_par_jour ? ' Frais par jour : ' + eur(v.frais_par_jour, 0) + '.' : '') }));
    }
    if (prodV.length) corpsA.push(h('p', { class: 'pl-note', text: 'Produits : ' + prodV.map(function (a) { return a.x.p.libelle || a.x.p.nom; }).join(', ') + '.' }));
    if (nd.total) corpsA.push(h('p', { class: 'pl-note' }, [nd.libre + ' achat' + pl(nd.libre) + ' sans date (tickets, lots, cartes payées en yens) ou produit' + pl(nd.libre) + ' pas encore rattaché' + pl(nd.libre) + ' à un voyage. ', lienBtn('Choisir ceux de ce voyage', function () { feuilleAchatsVoyage(V.id); })]));
    g.appendChild(carte({ span: 'pl-c6', titre: 'Achats rattachés', sous: 'un ticket ou une date d’achat dans les dates du voyage suffit', corps: corpsA }));
    var vendues = cartesV.filter(function (a) { return a.vendu; }).sort(function (a, b) { return b.resultat - a.resultat; });
    g.appendChild(carte({ span: 'pl-c12', titre: 'Ventes de ce voyage · ' + vendues.length, sous: 'résultat = encaissé − frais de vente − coût complet (achat + part des frais du voyage)', corps: [vendues.length ? tableau([
      { t: 'Carte', f: function (a) { return celluleCarte(a.r, sansDoublons(['N° ' + a.ref, a.r.date_vente ? 'vendue ' + quandVendue(a.r) : null, a.r.c.canal]).join(' · ')); }, v: function (a) { return a.r.c.nom || a.ref; } },
      { t: 'Encaissé', f: function (a) { return eur(a.ca, 2); }, v: function (a) { return a.ca; } },
      { t: 'Coût complet', f: function (a) { return eur(a.cout_complet, 2); }, v: function (a) { return a.cout_complet; } },
      { t: 'Résultat', f: function (a) { return eurS(a.resultat, 2); }, v: function (a) { return a.resultat; }, barre: true, cls: function (a) { return neg(a.resultat); } }
    ], vendues, null, 'Ventes du voyage', { cle: 'voyage-ventes' }) : vide2('Aucune carte de ce voyage vendue pour l’instant.')] }));
    m.appendChild(h('p', { class: 'pl-note pl-base' }, lienBtn('Supprimer ce voyage', function () {
      confirmer('Supprimer le voyage ?', 'Ses frais resteront dans tes charges, rattachés à toute l’activité, et ses achats ne seront plus rattachés à aucun voyage.', 'Supprimer', function () {
        location.hash = '#voyages';
        modifier('Voyage supprimé · ' + V.nom, function (d0) {
          d0.voyages = (d0.voyages || []).filter(function (x) { return x.id !== V.id; });
          (d0.charges || []).forEach(function (c) { if (c.voyage === V.id) { delete c.voyage; c.cible = 'general'; } });
          [].concat(d0.tickets || [], d0.lots || [], d0.cartes || [], d0.produits || []).forEach(function (o) { if (o.voyage === V.id) delete o.voyage; });
        });
      }, true);
    }, 'pl-danger')));
  };
  function chargesDe(occ) { var vu = {}, out = []; occ.forEach(function (o) { if (!vu[o.c.id]) { vu[o.c.id] = 1; out.push(o.c); } }); return out; }
  function somme(l, f) { return l.reduce(function (a, x) { return a + z(f(x)); }, 0); }
  /* achats qui ne se rattachent pas tout seuls par leur date */
  function candidatsVoyage(vid) {
    var doc = S.doc, R = S.R;
    var tickets = (doc.tickets || []).filter(function (t) { var x = R.ticketsParId[t.id]; return !t.date && x && x.nb > 0 && (!t.voyage || t.voyage === vid); });
    var lots = (doc.lots || []).filter(function (L) { return !L.voyage || L.voyage === vid; });
    var cartes = R.cartes.filter(function (r) { var c = r.c, a = c.achat || {}; return a.mode === 'yen' && !c.date_achat && (!c.voyage || c.voyage === vid); });
    var produits = R.produits.filter(function (x) { return !x.p.voyage || x.p.voyage === vid; });
    var libre = tickets.filter(function (t) { return !t.voyage; }).length + lots.filter(function (L) { return !L.voyage; }).length + cartes.filter(function (r) { return !r.c.voyage; }).length + produits.filter(function (x) { return !x.p.voyage; }).length;
    return { tickets: tickets, lots: lots, cartes: cartes, produits: produits, libre: libre, total: tickets.length + lots.length + cartes.length + produits.length };
  }
  function feuilleAchatsVoyage(vid) {
    var V = voyageParId(vid), nd = candidatsVoyage(vid), R = S.R, cases = [];
    function ligne(type, id, titre, sous, coche) {
      var i = h('input', { type: 'checkbox' });
      i.checked = coche;
      cases.push({ type: type, id: id, i: i });
      return h('li', null, h('label', { class: 'pl-check pl-check--l' }, [i, h('span', null, [titre, h('small', { text: sous })])]));
    }
    var blocs = [];
    if (nd.tickets.length) blocs.push(h('p', { class: 'pl-label', text: 'Tickets sans date' }), h('ul', { class: 'pl-choix' }, nd.tickets.map(function (t) {
      var x = R.ticketsParId[t.id];
      return ligne('ticket', t.id, t.id + ' · ' + (t.boutique || 'boutique non indiquée'), yen(t.total_yen) + ' · ' + x.nb + ' carte' + pl(x.nb) + ' · ' + eur(x.paye_eur), t.voyage === vid);
    })));
    if (nd.lots.length) blocs.push(h('p', { class: 'pl-label', text: 'Lots PSA 10' }), h('ul', { class: 'pl-choix' }, nd.lots.map(function (L) {
      var x = R.lotsParId[L.id];
      return ligne('lot', L.id, L.id, yen(L.paye_yen) + (x ? ' · ' + eur(x.paye_eur) + ' · ' + x.cartes.length + ' carte' + pl(x.cartes.length) : ''), L.voyage === vid);
    })));
    if (nd.cartes.length) blocs.push(h('p', { class: 'pl-label', text: 'Cartes payées en yens, sans date ni ticket' }), h('ul', { class: 'pl-choix' }, nd.cartes.map(function (r) {
      return ligne('carte', r.ref, r.c.nom, 'N° ' + r.ref + ' · ' + yen(r.c.yen) + (r.c.remarque ? ' · ' + r.c.remarque.slice(0, 80) : ''), r.c.voyage === vid);
    })));
    if (nd.produits.length) blocs.push(h('p', { class: 'pl-label', text: 'Produits (scellé)' }), h('ul', { class: 'pl-choix' }, nd.produits.map(function (x) {
      return ligne('produit', x.id, x.p.libelle || x.p.nom, nbr(x.nb) + ' unités · ' + (x.connu ? eur(x.paye) : 'prix d’achat inconnu'), x.p.voyage === vid);
    })));
    var fs = feuille('Achats de « ' + V.nom + ' »', [h('p', { class: 'pl-note', text: 'Coche ce que tu as acheté pendant ce voyage. Les achats datés s’y rattachent déjà tout seuls.' })].concat(blocs),
      [bouton('Annuler', fermer, 'btn--ghost'), h('button', { type: 'submit', class: 'btn', text: 'Enregistrer' })]);
    fs.form.addEventListener('submit', function (e) {
      e.preventDefault();
      fermer();
      var n = cases.filter(function (x) { return x.i.checked; }).length;
      modifier('Achats du voyage ' + V.nom + ' · ' + n + ' rattaché' + pl(n), function (d0) {
        cases.forEach(function (x) {
          var o = x.type === 'ticket' ? (d0.tickets || []).filter(function (t) { return t.id === x.id; })[0]
            : x.type === 'lot' ? (d0.lots || []).filter(function (L) { return L.id === x.id; })[0]
            : x.type === 'carte' ? trouverCarte(d0, x.id) : (d0.produits || []).filter(function (p) { return p.id === x.id; })[0];
          if (!o) return;
          if (x.i.checked) o.voyage = vid; else if (o.voyage === vid) delete o.voyage;
        });
      });
    });
  }
  function feuilleVoyage(id, preset) {
    var V0 = id ? voyageParId(id) : null, init = V0 ? Object.assign({}, V0) : Object.assign({ nom: '', debut: '', fin: '' }, preset || {});
    var form = formulaire([
      { k: 'nom', label: 'Nom du voyage', type: 'text', req: true, ph: 'Japon · octobre 2026' },
      { k: 'debut', label: 'Départ', type: 'date', demi: true, req: true },
      { k: 'fin', label: 'Retour', type: 'date', demi: true, req: true },
      { k: 'note', label: 'Note (facultatif)', type: 'textarea' }
    ], init);
    var fs = feuille(V0 ? 'Modifier le voyage' : 'Nouveau voyage', [form.el, h('p', { class: 'pl-note', text: 'Les tickets et achats datés entre le départ et le retour seront rattachés à ce voyage, et ses frais répartis sur eux.' })],
      [bouton('Annuler', fermer, 'btn--ghost'), h('button', { type: 'submit', class: 'btn', text: V0 ? 'Enregistrer' : 'Créer' })]);
    fs.form.addEventListener('submit', function (e) {
      e.preventDefault();
      var x = form.lire();
      if (!x) return;
      if (x.fin < x.debut) { form.erreur('fin', 'Le retour doit venir après le départ.'); return; }
      var autre = (S.doc.voyages || []).filter(function (v) { return v.id !== (V0 && V0.id) && v.debut && v.fin && !(x.fin < v.debut || x.debut > v.fin); })[0];
      if (autre) { form.erreur('debut', 'Ces dates chevauchent « ' + autre.nom + ' ».'); return; }
      var nid = V0 ? V0.id : nouvelId('V');
      fermer();
      modifier((V0 ? 'Voyage modifié · ' : 'Voyage · ') + x.nom, function (d0) {
        var l = d0.voyages || (d0.voyages = []), o = { id: nid, nom: x.nom, debut: x.debut, fin: x.fin };
        if (x.note) o.note = x.note;
        var i = l.map(function (y) { return y.id; }).indexOf(nid);
        if (i === -1) l.push(o); else l[i] = o;
      });
      if (!V0) location.hash = '#voyage/' + encodeURIComponent(nid);
    });
  }

  /* bloc « coût complet » de la fiche d'une carte */
  function blocCoutComplet(ref) {
    if (!(S.doc.voyages || []).length && !(S.doc.charges || []).length) return null;
    var a = couts('tout').articles['c:' + ref];
    if (!a) return null;
    var V = a.voyage ? voyageParId(a.voyage) : null;
    var dl = [
      ['Coût d’achat' + (S.R.params.tva ? ' (TVA import comprise)' : ''), eur(a.cout_achat, 2)],
      ['Frais du voyage' + (V ? ' « ' + V.nom + ' »' : ''), V ? eur(a.qp_voyage, 2) : 'aucun voyage'],
      ['Frais directs (gradation, port…)', eur(a.directs_achat, 2)],
      ['Coût complet', eur(a.cout_complet, 2)]
    ];
    if (a.vendu) dl.push(['Frais de vente', eur(a.frais_vente, 2)], ['Résultat complet de la vente', eurS(a.resultat, 2)]);
    else dl.push(['Marge complète au prix marché', a.latent != null ? eurS(a.latent, 2) : 'prix marché manquant']);
    return section('Coût complet', [h('div', { class: 'pl-box' }, [
      h('dl', { class: 'pl-dl' }, [].concat.apply([], dl.map(function (x) { return [h('dt', { text: x[0] }), h('dd', { text: x[1] })]; }))),
      h('p', { class: 'pl-note' }, lienBtn('+ Frais pour cette carte (gradation, port…)', function () { feuilleCharge(null, { cat: 'gradation', cible: 'carte', ref: ref }); }))
    ])]);
  }

  /* ---------------------------------------------------------------- SASU : TVA, compte de résultat, IS, rémunération, ratios (moteur : pilotage-fiscal.js) */
  var CLE_SASU = 'pr.pilotage.sasu';
  var SOURCES_SASU = [
    ['Impôt sur les sociétés (service-public)', 'https://entreprendre.service-public.gouv.fr/vosdroits/F23575'],
    ['Seuils de franchise de TVA 2026 (Légifiscal)', 'https://www.legifiscal.fr/actualites-fiscales/4436-nouveaux-seuils-micro-entreprises-annee-2026.html'],
    ['TVA sur la marge, art. 297 A du CGI (Légifiscal)', 'https://www.legifiscal.fr/tva/tva-francaise/regimes-specifiques/le-regime-de-la-tva-sur-la-marge.html'],
    ['CFE (service-public)', 'https://entreprendre.service-public.gouv.fr/vosdroits/F31913']
  ];
  function hypothesesSasu(X) {
    var F = w.PRFiscal, d = F.hypotheses(S.R, X, S.doc), sv = null;
    try { sv = JSON.parse(lire(CLE_SASU) || 'null'); } catch (e) { sv = null; }
    return { defaut: d, H: Object.assign({}, d, sv && typeof sv === 'object' ? sv : {}) };
  }
  function pct1(v) { return vide(v) ? '—' : NF1.format(v * 100) + ' %'; }
  function compact(t) { var x = t.querySelector('table'); if (x) x.classList.add('pl-table--compact'); return t; }
  VUES.fiscal = function (m) {
    var F = w.PRFiscal;
    m.appendChild(entete('Analyse', 'Ta future SASU : TVA, impôt, rémunération'));
    m.appendChild(sousOnglets('fiscal'));
    if (!F || !KC) { m.appendChild(h('p', { class: 'pl-box', text: 'Le simulateur ne s’est pas chargé : recharge la page.' })); return; }
    var X = couts('tout'), hs = hypothesesSasu(X), H = hs.H, D = hs.defaut, RG = F.REGLES;
    m.appendChild(h('p', { class: 'pl-note pl-base', text: 'Simulation d’une année complète de SASU avec les règles ' + RG.annee + ' (vérifiées le ' + dateFR(RG.verifie_le) +
      '). Les hypothèses partent de ton rythme réel et se modifient ci-dessous. Je ne suis ni expert-comptable ni avocat : fais valider par un professionnel avant de décider.' }));
    var defs = [
      { k: 'ca', label: 'Ventes sur 12 mois (€)', type: 'num', demi: true, aide: 'Ton rythme actuel : ' + eur(D.ca) + ' (sur ' + nbr(D.base_jours) + ' jours).' },
      { k: 'taux_cout', label: 'Coût d’achat (% du prix de vente)', type: 'num', demi: true, aide: 'Tes ventes : ' + pct(D.taux_cout) + '.' },
      { k: 'part_import', label: 'Achats importés du Japon (%)', type: 'num', demi: true, aide: 'Le reste vient de particuliers (TVA sur la marge). Toi : ' + pct(D.part_import) + '.' },
      { k: 'frais_vente', label: 'Commissions et envois (% des ventes)', type: 'num', demi: true },
      { k: 'voyages', label: 'Voyages par an', type: 'num', demi: true },
      { k: 'frais_voyage', label: 'Frais par voyage (€)', type: 'num', demi: true, aide: D.frais_voyage ? 'Moyenne de tes voyages : ' + eur(D.frais_voyage) + '.' : 'Avion, hôtel, transports, repas.' },
      { k: 'charges_fixes', label: 'Autres charges par an (€ TTC)', type: 'num', demi: true, aide: 'D’après tes charges : ' + eur(D.charges_fixes) + '.' },
      { k: 'tva_charges', label: 'Dont TVA récupérable (€)', type: 'num', demi: true },
      { k: 'salaire_net', label: 'Ton salaire net sur l’année (€)', type: 'num', demi: true },
      { k: 'distribution', label: 'Bénéfice versé en dividendes (%)', type: 'num', demi: true },
      { k: 'tmi', label: 'Ta tranche d’impôt (TMI)', type: 'select', demi: true, options: [['0', '0 %'], ['0.11', '11 %'], ['0.3', '30 %'], ['0.41', '41 %'], ['0.45', '45 %']] },
      { k: 'taux_charges', label: 'Cotisations du président (% du net)', type: 'num', demi: true, aide: 'Environ 80 % du salaire net.' },
      { k: 'capital', label: 'Capital de la SASU (€)', type: 'num', demi: true },
      { k: 'cfe', label: 'CFE (€ par an)', type: 'num', demi: true, aide: '0 l’année de création ; ensuite 243 à 579 € si le CA de N-2 est entre 5 000 et 10 000 € (selon la commune).' }
    ];
    var PCT = { taux_cout: 1, part_import: 1, frais_vente: 1, distribution: 1, taux_charges: 1 };
    var init = {};
    defs.forEach(function (df) { var v = H[df.k]; init[df.k] = df.k === 'tmi' ? String(v) : PCT[df.k] ? Math.round(z(v) * 1000) / 10 : (vide(v) ? null : Math.round(v)); });
    var form = formulaire(defs, init);
    var zone = h('div', { 'aria-live': 'polite' }), minuteur = null;
    function lireH() {
      var o = {};
      defs.forEach(function (df) {
        var el = form.champs[df.k];
        if (df.k === 'tmi') { o.tmi = parseFloat(el.value) || 0; return; }
        var v = lireNombre(el.value).v;
        o[df.k] = v == null ? D[df.k] : PCT[df.k] ? v / 100 : v;
      });
      return o;
    }
    function maj() {
      var o = lireH();
      ecrire(CLE_SASU, JSON.stringify(o));
      H = Object.assign({}, D, o);
      dessiner();
    }
    defs.forEach(function (df) { form.champs[df.k].addEventListener(df.type === 'select' ? 'change' : 'input', function () { clearTimeout(minuteur); minuteur = setTimeout(maj, 350); }); });
    var hyp = details('Modifier les hypothèses', null, [h('div', { class: 'pl-box' }, [form.el, h('div', { class: 'pl-actions' }, bouton('Reprendre mes chiffres réels', function () {
      try { localStorage.removeItem(CLE_SASU); } catch (e) {}
      rendre(true);
    }, 'btn--ghost'))])]);
    var resume = h('p', { class: 'pl-note', 'aria-live': 'polite' });
    m.appendChild(carte({ titre: 'Hypothèses de l’année', sous: 'ouvre pour modifier : la simulation se met à jour', corps: [resume, hyp] }));
    m.appendChild(zone);
    function dessiner() {
      zone.textContent = '';
      resume.textContent = 'Ventes de ' + eur(H.ca) + ' sur 12 mois, coût d’achat ' + pct(H.taux_cout) + ' du prix, ' + pct(H.part_import) + ' d’achats importés, ' + nbr(H.voyages) + ' voyage' + pl(H.voyages) + ' à ' + eur(H.frais_voyage) +
        ', salaire net ' + eur(H.salaire_net) + ', ' + pct(H.distribution) + ' du bénéfice en dividendes, TMI ' + pct(H.tmi) + '.';
      var fr = F.simuler(H, 'franchise'), re = F.simuler(H, 'reel');
      var franchiseOk = fr.franchise_possible, choixAuto = franchiseOk && fr.remuneration.poche + fr.sig.resultat_net - fr.remuneration.dividendes >= re.remuneration.poche + re.sig.resultat_net - re.remuneration.dividendes ? 'franchise' : 'reel';
      var fs = S.fsasu || (S.fsasu = { regime: null });
      var regime = fs.regime || choixAuto;
      if (regime === 'franchise' && !fr.franchise_tolerance) regime = 'reel';
      var x = regime === 'franchise' ? fr : re, sg = x.sig, rm = x.remuneration;
      var g = h('div', { class: 'pl-grille' });
      zone.appendChild(g);
      /* chiffres clés au régime retenu */
      g.appendChild(kpi({ hero: true, label: 'Te reste après impôts · ' + (regime === 'franchise' ? 'en franchise' : 'au réel'), v: eur(rm.poche, 0),
        sous: 'salaire ' + eur(rm.salaire, 0) + ' + dividendes ' + eur(rm.dividendes, 0) + ', impôts déduits', leg: rm.prelevements != null ? 'Prélèvements : ' + pct(rm.prelevements) + ' du bénéfice avant ta rémunération.' : null }));
      g.appendChild(kpi({ span: 'pl-c4', label: 'Résultat net de la SASU', v: eurS(sg.resultat_net, 0), cls: sg.resultat_net < 0 ? 'pl-neg' : '', sous: sg.ca ? pct(sg.resultat_net / sg.ca) + ' du chiffre d’affaires' : null }));
      g.appendChild(kpi({ span: 'pl-c4', label: 'Impôt sur les sociétés', v: eur(sg.is, 0), sous: sg.rcai > 0 ? 'taux effectif ' + pct(sg.is / sg.rcai) + ' sur ' + eurS(sg.rcai, 0) : 'pas de bénéfice imposable' }));
      g.appendChild(kpi({ span: 'pl-c4', label: 'TVA à ta charge', v: eur(x.tva.cout, 0), sous: 'à reverser ' + eur(x.tva.a_payer, 0) }));
      g.appendChild(kpi({ span: 'pl-c4', label: 'EBE', v: eurS(sg.ebe, 0), cls: sg.ebe < 0 ? 'pl-neg' : '', sous: sg.ca ? pct(sg.ebe / sg.ca) + ' du CA' : null }));
      /* TVA */
      var tr = F.tvaReelle(S.R);
      var lignesTva = [
        ['TVA facturée aux clients', function (y) { return eur(y.tva.collectee); }],
        ['TVA payée à l’import (20 %)', function (y) { return eur(y.detail.tva_import); }],
        ['TVA payée sur tes charges', function (y) { return eur(y.detail.tva_charges); }],
        ['TVA récupérée', function (y) { return eur(y.regime === 'reel' ? y.tva.deductible : 0); }],
        ['TVA à reverser', function (y) { return eur(y.tva.a_payer); }],
        ['TVA à ta charge', function (y) { return eur(y.tva.cout); }],
        ['Résultat net de la SASU', function (y) { return eurS(y.sig.resultat_net); }],
        ['Te reste après impôts', function (y) { return eur(y.remuneration.poche); }]
      ];
      var ecartTva = re.tva.cout - fr.tva.cout;
      var verdict = !fr.franchise_tolerance ? 'Avec ' + eur(fr.sig.ca) + ' de ventes, tu dépasses 93 500 € : la franchise est impossible, tu es au réel.'
        : (Math.abs(ecartTva) < 1 ? 'Les deux régimes se valent sur ces hypothèses.' : ecartTva > 0 ? 'La franchise te coûte ' + eur(ecartTva) + ' de TVA de moins par an que le réel.' : 'Le réel te coûte ' + eur(-ecartTva) + ' de TVA de moins par an que la franchise : la TVA d’import récupérée compte plus que celle que tu factures.')
          + (fr.franchise_possible ? '' : ' Attention : au-delà de 85 000 € de ventes, la franchise s’arrête l’année suivante.');
      var hostT = h('div');
      G.barres(hostT, { lignes: [['TVA à ta charge', function (y) { return y.tva.cout; }], ['Résultat net', function (y) { return y.sig.resultat_net; }], ['Te reste après impôts', function (y) { return y.remuneration.poche; }]]
        .reduce(function (acc, l) { return acc.concat([{ cle: l[0] + 'f', label: l[0], sous: 'en franchise', v: l[1](fr), txt: eur(l[1](fr), 0), cls: 'g-s1' }, { cle: l[0] + 'r', label: l[0], sous: 'au réel', v: l[1](re), txt: eur(l[1](re), 0), cls: 'g-s2' }]); }, []),
        signe: false, valeurNom: '', aria: 'Franchise et réel comparés' });
      g.appendChild(carte({ span: 'pl-c6', titre: 'TVA : franchise ou réel ?', sous: 'sur 12 mois', corps: [h('p', { class: 'pl-big', text: verdict }), G.legende([{ nom: 'En franchise', cls: 'g-s1' }, { nom: 'Au réel', cls: 'g-s2' }]), hostT],
        table: function () { return compact(tableau([{ t: 'Sur 12 mois', f: function (l) { return l[0]; } }, { t: 'Franchise', f: function (l) { return l[1](fr); } }, { t: 'Réel', f: function (l) { return l[1](re); } }], lignesTva, null, 'Franchise ou réel')); },
        pied: ['Franchise (CA sous ' + eur(RG.franchise, 0) + ', tolérance ' + eur(RG.franchise_majore, 0) + ') : pas de TVA sur tes ventes (« TVA non applicable, art. 293 B du CGI »), mais aucune TVA récupérée, y compris les 20 % payés à l’import de tes cartes japonaises. ' +
          'Réel : cartes de particuliers au régime de la marge (TVA = marge × 20/120), cartes importées ou achetées à un pro : TVA sur le prix, TVA d’achat récupérée. ' +
          'Sur tes ventes réelles, le réel aurait donné ' + eur(tr.collectee) + ' de TVA facturée (' + eur(tr.collectee_marge) + ' sur la marge, ' + eur(tr.collectee_normale) + ' sur le prix des cartes importées) pour ' + eur(tr.deductible_achats) + ' de TVA d’achat récupérable. Provenance : ' + tr.n.import + ' importées, ' + tr.n.particulier + ' de particuliers' + (tr.n.pro ? ', ' + tr.n.pro + ' de pros' : '') + '.'] }));
      /* compte de résultat */
      var chips = h('div', { class: 'pl-seg', role: 'group', 'aria-label': 'Régime de TVA retenu' }, [['franchise', 'En franchise'], ['reel', 'Au réel']].map(function (r) {
        return h('button', { type: 'button', 'aria-pressed': String(regime === r[0]), disabled: r[0] === 'franchise' && !fr.franchise_tolerance ? '' : null, text: r[1] + (r[0] === choixAuto ? ' · conseillé' : ''),
          onclick: function () { fs.regime = r[0]; dessiner(); } });
      }));
      var ca = sg.ca;
      var L = [
        ['Ventes de marchandises (HT)', sg.ca, 'total'],
        ['Coût d’achat des marchandises vendues', -sg.achats],
        ['Marge commerciale', sg.marge_commerciale, 'sous'],
        ['Charges externes', -sg.externes, null, 'voyages, commissions, envois, abonnements…'],
        ['Valeur ajoutée', sg.valeur_ajoutee, 'sous'],
        ['Impôts et taxes (CFE)', -sg.impots],
        ['Charges de personnel', -sg.personnel, null, 'salaire + cotisations'],
        ['Excédent brut d’exploitation', sg.ebe, 'sous'],
        ['Résultat d’exploitation', sg.resultat_exploitation, 'sous'],
        ['Impôt sur les sociétés', -sg.is],
        ['Résultat net', sg.resultat_net, 'total']
      ];
      var hostR = h('div');
      G.cascade(hostR, { etapes: L.map(function (l) { return { label: l[0], v: l[1], type: l[2] || 'delta', note: l[3] }; }), base: ca || null, fmt: function (v) { return eur(v, 0); }, aria: 'Compte de résultat prévisionnel' });
      g.appendChild(carte({ span: 'pl-c6', titre: 'Compte de résultat prévisionnel', sous: 'soldes intermédiaires de gestion · régime retenu :', actions: [], corps: [chips, hostR],
        table: function () {
          var tb = h('table', { class: 'pl-table pl-cascade' }, [h('caption', { class: 'sr-only', text: 'Compte de résultat prévisionnel' }),
            h('thead', null, h('tr', null, [h('th', { scope: 'col', text: 'Soldes intermédiaires de gestion' }), h('th', { scope: 'col', text: 'Montant' }), h('th', { scope: 'col', text: '% du CA' })])),
            h('tbody', null, L.map(function (l) {
              return h('tr', { class: l[2] ? 'pl-tot' + (l[2] === 'sous' ? ' pl-tot--sous' : '') : null }, [h('th', { scope: 'row', text: l[0] }),
                h('td', { class: l[2] && l[1] < -0.005 ? 'pl-neg' : null, text: eur(Math.abs(l[1]) < 0.005 ? 0 : l[1]) }), h('td', { text: ca ? pct(Math.abs(l[1]) < 0.005 ? 0 : l[1] / ca) : '—' })]);
            }))]);
          return h('div', { class: 'pl-scroll' }, tb);
        },
        pied: ['Comptabilité générale : les frais de voyage sont des charges de l’année (compte 6251), pas un coût des cartes comme dans l’onglet Coûts. Capacité d’autofinancement ≈ résultat net (' + eurS(sg.caf) + '), sans amortissement prévu. IS : ' + pct(RG.is_reduit) + ' jusqu’à ' + eur(RG.is_plafond) + ' de bénéfice, puis ' + pct(RG.is_normal) + ' (CA sous 10 M€, capital libéré, détenu à 75 % au moins par des personnes physiques).'] }));
      /* rémunération : salaire ou dividendes */
      var opt = F.optimiser(H, regime), hostP = h('div');
      if (opt.pas.length && opt.max > 0) G.courbe(hostP, { type: 'num', x: opt.pas.map(function (p) { return p.salaire; }), series: [{ nom: 'Te reste après impôts', cls: 'g-s1', valeurs: opt.pas.map(function (p) { return p.poche; }), aire: true }],
        points: [{ x: opt.meilleur.salaire, y: opt.meilleur.poche, label: 'Maximum : ' + eur(opt.meilleur.poche, 0) }], hauteur: 230, fmt: function (v) { return eur(v, 0); },
        fmtX: function (v) { return G.eurAxe(opt.max)(v); }, fmtTitre: function (v) { return 'Salaire net de ' + eur(v, 0) + ' sur l’année'; }, finLabel: false,
        aria: 'Ce qui te reste selon le salaire versé ; le maximum est indiqué.' });
      g.appendChild(carte({ span: 'pl-c7', titre: 'Te payer : salaire ou dividendes', sous: 'ce qui te reste selon le salaire versé dans l’année',
        corps: [h('div', { class: 'pl-kpis pl-kpis--3' }, [
          tuile('Salaire net', eur(rm.salaire, 0), 'coûte ' + eur(rm.cout_salaire, 0) + ' à la SASU'),
          tuile('Dividendes', eur(rm.dividendes, 0), rm.dividendes ? 'impôt ' + eur(rm.impot_dividendes, 0) + ' (' + rm.option + ')' : 'rien de distribué'),
          tuile('Te reste', eur(rm.poche, 0), 'après impôt sur le revenu')
        ]), opt.pas.length && opt.max > 0 ? hostP : null,
        h('p', { class: 'pl-apercu', text: opt.max > 0 ? (opt.meilleur.salaire < 1 ? 'Sur ces hypothèses, c’est sans salaire, tout en dividendes, qu’il te reste le plus : ' + eur(opt.meilleur.poche) + '.'
          : 'Le salaire qui te laisse le plus : ' + eur(opt.meilleur.salaire) + ' net, soit ' + eur(opt.meilleur.poche) + ' pour toi.') + ' Un salaire ouvre des droits (retraite, santé, indemnités) ; les dividendes n’en ouvrent aucun.' : 'Pas de bénéfice à partager sur ces hypothèses.' })],
        pied: ['Dividendes : prélèvement forfaitaire de ' + pct1(RG.pfu) + ' (12,8 % d’impôt + ' + pct1(RG.ps) + ' de prélèvements sociaux) ou barème après abattement de 40 % : le moins cher est retenu. Réserve légale de ' + eur(rm.reserve) + ' (5 % du bénéfice jusqu’à 10 % du capital). Impôt sur le salaire estimé à ta TMI après l’abattement de 10 %.'] }));
      /* ratios */
      var ra = F.ratios(S.R, X), lr = [
        ['Taux de marge', ra.taux_marge != null ? pct(ra.taux_marge) : '—', 'marge commerciale ÷ coût d’achat'],
        ['Taux de marque', ra.taux_marque != null ? pct(ra.taux_marque) : '—', 'marge commerciale ÷ prix de vente'],
        ['Coefficient multiplicateur', ra.coefficient != null ? dec1(ra.coefficient) : '—', 'prix de vente ÷ coût d’achat'],
        ['Rotation du stock', ra.rotation != null ? dec1(ra.rotation) + ' fois par an' : '—', 'coût des ventes annualisé ÷ stock au coût'],
        ['Durée de stockage', ra.duree_stockage != null ? NF0.format(ra.duree_stockage) + ' jours' : '—', 'au rythme actuel des ventes'],
        ['Besoin en fonds de roulement', eur(ra.bfr) + (ra.bfr_jours != null ? ' · ' + NF0.format(ra.bfr_jours) + ' jours de CA' : ''), 'ton stock au coût (ni crédit client ni fournisseur)'],
        ['Poids des charges fixes', ra.poids_fixes != null ? pct(ra.poids_fixes) : '—', 'charges fixes ÷ chiffre d’affaires'],
        ['Rentabilité commerciale', ra.rentabilite_commerciale != null ? pct(ra.rentabilite_commerciale) : '—', 'résultat analytique ÷ chiffre d’affaires'],
        ['Rentabilité de l’investissement', ra.roi != null ? pct(ra.roi) : '—', 'résultat analytique ÷ achats réels'],
        ['EBE ÷ CA (prévisionnel)', ca ? pct(sg.ebe / ca) : '—', 'au régime retenu ci-dessus']
      ];
      g.appendChild(carte({ span: 'pl-c5', titre: 'Ratios de gestion', sous: 'activité réelle depuis le début (' + nbr(ra.duree) + ' jours), sauf la dernière ligne', corps: [tableau([
        { t: 'Ratio', f: function (l) { return h('span', null, [l[0], h('small', { class: 'pl-t-note', text: l[2] })]); } },
        { t: 'Valeur', f: function (l) { return l[1]; } }
      ], lr, null, 'Ratios de gestion')] }));
      g.appendChild(carte({ span: 'pl-c12', titre: 'Sources', sous: 'taux de cotisations du président et option barème des dividendes : estimations à confirmer avec ton expert-comptable',
        corps: [h('ul', { class: 'pl-sources' }, SOURCES_SASU.map(function (s2) { return h('li', null, h('a', { href: s2[1], target: '_blank', rel: 'noopener', text: s2[0] + ' ↗' })); }))] }));
    }
    dessiner();
  };

  /* ---------------------------------------------------------------- menu « Plus » */
  VUES.plus = function (m) {
    var R = S.R, n = nbAlertes(), al = alertes().length;
    m.appendChild(entete('Plus', majTexte()));
    function item(href, titre, sous) { return h('li', null, h('a', { href: href }, h('span', null, [titre, sous ? h('small', { text: sous }) : null]))); }
    m.appendChild(h('ul', { class: 'pl-menu' }, [
      item('#achats', 'Achats et tickets', R.tickets.length + ' tickets · ' + eur(R.k.investi) + ' investis au total'),
      item('#charges', 'Charges', (S.doc.charges || []).length ? (S.doc.charges || []).length + ' charge' + pl((S.doc.charges || []).length) + ' · ' + eur(couts('tout').totaux.charges) + ' payés' : 'Voyages, abonnements, fournitures, temps passé'),
      item('#voyages', 'Voyages', (S.doc.voyages || []).length ? (S.doc.voyages || []).map(function (v) { return v.nom; }).join(', ') : 'Frais et retour sur investissement de chaque voyage'),
      item('#couts', 'Coûts et rentabilité', 'Cascade des marges, seuil de rentabilité, coûts cachés'),
      item('#fiscal', 'SASU : TVA, impôt, rémunération', 'Franchise ou réel, compte de résultat, salaire ou dividendes, ratios'),
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
      { k: 'frais_vente', label: 'Frais de vente (%)', type: 'num', demi: true, aide: notes.frais_vente || 'Commission du canal de vente, sauf taux propre au canal (plus bas).' },
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
    var FC = (S.R.params && S.R.params.frais_canal) || {}, tg = z(P.frais_vente) * 100;
    var formC = formulaire(CANAUX.map(function (cn) { return { k: 'c_' + cn, label: cn + ' (%)', type: 'num', demi: true, ph: nbr(tg) + ' (général)' }; }),
      CANAUX.reduce(function (o, cn) { if (Object.prototype.hasOwnProperty.call(FC, cn)) o['c_' + cn] = FC[cn] * 100; return o; }, {}));
    var fC = h('form', { class: 'pl-box', novalidate: true }, [formC.el, h('div', { class: 'pl-actions' }, h('button', { type: 'submit', class: 'btn', text: 'Enregistrer les frais par canal' }))]);
    fC.addEventListener('submit', function (e) {
      e.preventDefault();
      var x = formC.lire();
      if (!x) return;
      var t = {}, faux = null;
      CANAUX.forEach(function (cn) {
        var v = x['c_' + cn];
        if (v == null || v === '') { t[cn] = null; return; }
        if (!(v >= 0 && v < 100)) { faux = faux || cn; return; }
        t[cn] = Math.round(v * 100) / 10000;
      });
      if (faux) { formC.erreur('c_' + faux, 'Entre 0 et 99 %.'); return; }
      modifier('Frais de vente par canal · ' + CANAUX.filter(function (cn) { return t[cn] != null; }).map(function (cn) { return cn + ' ' + pct(t[cn]); }).join(', '), function (doc) {
        doc.params.frais_canal = t;
      });
    });
    m.appendChild(section('Frais de vente par canal', [fC], 'Remplace le taux général pour les cartes vendues sur ce canal. Vide : taux général (' + nbr(tg) + ' %). Vinted : 0 %, c’est l’acheteur qui paie la protection.'));
    var form2 = formulaire([
      { k: 'taux_horaire', label: 'Valeur d’une heure de ton temps (€)', type: 'num', demi: true, aide: 'Ce que tu gagnerais ailleurs dans l’heure. Vide : temps non chiffré.' },
      { k: 'minutes_par_vente', label: 'Minutes par vente', type: 'num', demi: true, aide: 'Photo, annonce, échanges, emballage, poste.' },
      { k: 'cout_capital', label: 'Coût du capital (% par an)', type: 'num', demi: true, aide: 'Par défaut 1,7 % : le Livret A depuis le 1er août 2026. Mets plus si tu vises mieux ailleurs.' },
      { k: 'cle_voyage', label: 'Répartir les frais de voyage', type: 'select', demi: true, options: [['valeur', 'Selon le prix d’achat'], ['nombre', 'Par article (part égale)']] },
      { k: 'tva_recuperable', label: 'TVA de tes charges', type: 'select', options: [['non', 'Pas récupérable (particulier ou franchise) : charges comptées TTC'], ['oui', 'Récupérable (SASU au réel) : charges comptées HT']] }
    ], { taux_horaire: P.taux_horaire, minutes_par_vente: P.minutes_par_vente, cout_capital: (P.cout_capital != null ? P.cout_capital : 0.017) * 100, cle_voyage: P.cle_voyage || 'valeur', tva_recuperable: P.tva_recuperable ? 'oui' : 'non' });
    var f2 = h('form', { class: 'pl-box', novalidate: true }, [form2.el, h('div', { class: 'pl-actions' }, h('button', { type: 'submit', class: 'btn', text: 'Enregistrer' }))]);
    f2.addEventListener('submit', function (e) {
      e.preventDefault();
      var x = form2.lire();
      if (!x) return;
      if (x.taux_horaire != null && x.taux_horaire < 0) { form2.erreur('taux_horaire', 'Le taux doit être positif.'); return; }
      if (x.cout_capital != null && (x.cout_capital < 0 || x.cout_capital > 100)) { form2.erreur('cout_capital', 'Entre 0 et 100 %.'); return; }
      modifier('Réglages des coûts · ' + (x.taux_horaire != null ? eur(x.taux_horaire, 2) + '/h, ' : '') + 'capital ' + pct(z(x.cout_capital) / 100), function (doc) {
        var p = doc.params;
        if (x.taux_horaire != null) p.taux_horaire = x.taux_horaire; else delete p.taux_horaire;
        if (x.minutes_par_vente != null) p.minutes_par_vente = x.minutes_par_vente; else delete p.minutes_par_vente;
        p.cout_capital = x.cout_capital != null ? x.cout_capital / 100 : 0.017;
        p.cle_voyage = x.cle_voyage === 'nombre' ? 'nombre' : 'valeur';
        if (x.tva_recuperable === 'oui') p.tva_recuperable = true; else delete p.tva_recuperable;
      });
    });
    m.appendChild(section('Coûts cachés et répartition', [f2], 'Servent à l’onglet Analyse › Coûts et au coût complet de chaque carte.'));
    var DVr = S.R.dates_ventes || { debut: aujourdhui(), delai: 7 };
    var form3 = formulaire([
      { k: 'debut_ventes', label: 'Début des ventes actives', type: 'date', demi: true, aide: 'Le chrono des cartes en stock part de cette date (ou de leur achat, s’il est plus tard).' },
      { k: 'delai_vente_passee', label: 'Vente passée sans date : jours après l’achat', type: 'num', demi: true, aide: 'La place dans le temps et compte ce délai dans les stats. Une vraie date saisie l’emporte.' }
    ], { debut_ventes: DVr.debut, delai_vente_passee: DVr.delai });
    var f3 = h('form', { class: 'pl-box', novalidate: true }, [form3.el, h('div', { class: 'pl-actions' }, [h('button', { type: 'submit', class: 'btn', text: 'Enregistrer' }),
      bouton('Corriger des dates une par une', feuilleDatesVentes, 'btn--ghost')])]);
    f3.addEventListener('submit', function (e) {
      e.preventDefault();
      var x = form3.lire();
      if (!x) return;
      if (!x.debut_ventes || !/^\d{4}-\d{2}-\d{2}$/.test(x.debut_ventes)) { form3.erreur('debut_ventes', 'Choisis une date.'); return; }
      if (x.delai_vente_passee == null || x.delai_vente_passee < 0 || x.delai_vente_passee > 365) { form3.erreur('delai_vente_passee', 'Entre 0 et 365 jours.'); return; }
      modifier('Dates de vente · début le ' + dateFR(x.debut_ventes) + ', ventes passées à ' + nbr(Math.round(x.delai_vente_passee)) + ' j', function (doc) {
        doc.params.debut_ventes = x.debut_ventes; doc.params.delai_vente_passee = Math.round(x.delai_vente_passee);
      });
    });
    m.appendChild(section('Dates de vente', [f3], DVr.estimees + ' vente' + pl(DVr.estimees) + ' passée' + pl(DVr.estimees) + ' datée' + pl(DVr.estimees) + ' par la règle' + (DVr.sans_date ? ', ' + DVr.sans_date + ' sans date d’achat ni voyage (comptée' + pl(DVr.sans_date) + ' à ' + DVr.delai + ' jours dans les délais, hors périodes)' : '') + '.'));
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
      { titre: 'Prix vendu (€)', format: 'euro' }, { titre: 'Frais de vente (€)', format: 'euro' }, { titre: 'Coût (€)', format: 'euro' }, { titre: 'Frais d’envoi (€)', format: 'euro' }, { titre: 'Bénéfice net (€)', format: 'euro' }, { titre: 'Rentabilité', format: 'pct', largeur: 11 }, { titre: 'Coût', largeur: 9 }, { titre: 'Origine de la date', largeur: 16 }],
      lignes: R.cartes.filter(function (r) { return r.vente; }).map(function (r) {
        return [r.c.ref, r.c.nom, r.c.groupe, r.date_vente, r.c.canal, r.vente.encaisse, r.vente.frais, r.vente.cout, r.vente.envoi, r.vente.net, r.vente.rentab, r.source, r.vente_estimee ? 'achat + ' + S.R.dates_ventes.delai + ' j' : r.date_vente ? 'réelle' : ''];
      }).concat(R.produits.filter(function (x) { return x.vente.vendus > 0; }).map(function (x) {
        return ['', x.p.nom + ' (× ' + x.vente.vendus + ')', 'Produits', null, null, x.vente.encaisse, x.vente.frais, x.vente.cout, x.vente.envoi, x.vente.net, x.vente.cout ? x.vente.net / x.vente.cout : null, 'réel', ''];
      })).concat([['', 'Total', '', null, null, vt.encaisse, vt.frais, vt.cout, vt.envoi, vt.net, vt.rentab, '', '']]) };
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
    var feuilles = [synth, groupes, cartes, ventes, tickets, lots, produits];
    if (w.PRCouts) {
      var X = couts('tout'), cs = X.cascade, sd = X.seuil, cc = X.caches, nocc = {};
      X.occurrences.forEach(function (o) { var t = nocc[o.c.id] || (nocc[o.c.id] = { n: 0, cout: 0, tva: 0 }); t.n++; t.cout += o.cout; t.tva += o.tva; });
      feuilles.push({ nom: 'Charges', colonnes: [{ titre: 'Date', format: 'date', largeur: 12 }, { titre: 'Libellé', largeur: 34 }, { titre: 'Catégorie', largeur: 30 }, { titre: 'Compte', largeur: 8 },
        { titre: 'Nature', largeur: 11 }, { titre: 'Comportement', largeur: 12 }, { titre: 'Rattachée à', largeur: 34 }, { titre: 'Montant', largeur: 12 }, { titre: 'Devise', largeur: 7 },
        { titre: 'Récurrence', largeur: 11 }, { titre: 'Échéances', largeur: 10 }, { titre: 'Total (€)', format: 'euro' }, { titre: 'dont TVA (€)', format: 'euro' }, { titre: 'Note', largeur: 40 }],
        lignes: (S.doc.charges || []).slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); }).map(function (c) {
          var cat = KC.categorie(c.cat), t = nocc[c.id] || { n: 0, cout: 0, tva: 0 };
          return [c.date, c.libelle, cat.nom, cat.compte, (NATURES[cat.nature] || [''])[0], cat.comportement, libelleCible(c), cat.heures ? c.heures + ' h' : c.montant, cat.heures ? '' : (c.devise === 'JPY' ? '¥' : '€'),
            c.recurrence ? (c.recurrence === 'mois' ? 'mensuelle' : 'annuelle') : '', t.n, t.cout, t.tva, c.note || ''];
        }) });
      feuilles.push({ nom: 'Voyages', colonnes: [{ titre: 'Voyage', largeur: 30 }, { titre: 'Départ', format: 'date', largeur: 12 }, { titre: 'Retour', format: 'date', largeur: 12 }, { titre: 'Jours', largeur: 8 },
        { titre: 'Articles', largeur: 9 }, { titre: 'Achats (€)', format: 'euro' }, { titre: 'Frais (€)', format: 'euro' }, { titre: 'Frais / achats', format: 'pct', largeur: 12 }, { titre: 'Coût complet (€)', format: 'euro', largeur: 16 },
        { titre: 'Encaissé (€)', format: 'euro' }, { titre: 'Résultat réalisé (€)', format: 'euro', largeur: 18 }, { titre: 'Plus-value du stock (€)', format: 'euro', largeur: 20 }, { titre: 'ROI réalisé', format: 'pct', largeur: 11 },
        { titre: 'ROI potentiel', format: 'pct', largeur: 12 }, { titre: 'Achats pour amortir les frais (€)', format: 'euro', largeur: 26 }],
        lignes: X.voyages.map(function (v) { return [v.V.nom, v.V.debut, v.V.fin, v.duree, v.articles.length, v.achats, v.frais, v.taux_frais, v.cout_total, v.ca, v.benef, v.latent, v.roi_realise, v.roi_potentiel, v.seuil_achat]; }) });
      feuilles.push({ nom: 'Coûts', filtre: false, colonnes: [{ titre: 'Depuis le début', largeur: 52 }, { titre: 'Montant (€)', format: 'euro', largeur: 16 }, { titre: '% du CA', format: 'pct', largeur: 10 }], gras: [0, 2, 6, 8, 10],
        lignes: [['Chiffre d’affaires', cs.ca], ['Coût d’achat des articles vendus', -cs.cout_achat], ['Marge commerciale', cs.marge_commerciale], ['Frais d’achat des articles vendus (voyages, gradation…)', -cs.frais_achat],
          ['Frais d’achat non rattachés à un article', -cs.frais_achat_non_affectes], ['Frais de vente (commissions, envois)', -cs.frais_vente], ['Marge sur coûts directs', cs.marge_directe], ['Charges de structure', -cs.structure],
          ['Résultat analytique', cs.resultat], ['Coûts cachés', -cs.caches], ['Résultat économique', cs.resultat_economique], ['', null],
          ['Temps passé', cc.temps], ['Immobilisation du capital', cc.capital], ['Décote consentie', cc.decote], ['Dépréciation du stock', cc.depreciation], ['', null],
          ['Marge sur coûts variables', sd.mcv], ['Charges fixes', sd.cf], ['Seuil de rentabilité (CA)', sd.sr], ['Marge de sécurité', sd.marge_securite], ['Point mort (date)', null]]
          .map(function (l) { return [l[0], l[1], cs.ca && l[1] != null && l[0] ? l[1] / cs.ca : null]; }) });
      var lpm = feuilles[feuilles.length - 1].lignes; lpm[lpm.length - 1][0] = 'Point mort : ' + (sd.point_mort_date ? dateFR(sd.point_mort_date) : '—');
    }
    return feuilles.concat([params, journal]);
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
    ['groupes', 'cartes', 'tickets', 'tickets_ecartes', 'lots', 'produits', 'journal'].forEach(function (k) { if (!Array.isArray(doc[k])) doc[k] = []; });
    if (!aReprendre(doc)) coffretOuvert(doc);
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
      var attente = !!lire(CLE_ATTENTE);
      route();
      if (attente) reprendreAttente(); else ouvrirCoffret();
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
