/* Poké-Raichu · langue des pages privées (Pilotage, Gestion) : français ou allemand.
   Les pages sont écrites en français. En allemand, chaque texte affiché (nœuds texte, placeholder, aria-label,
   title, alt) est remplacé par sa traduction, prise dans window.PR_DE (assets/js/langue-de.js) :
   - les nombres, montants, pourcentages et dates deviennent {0}, {1}… pour retrouver le modèle, puis sont remis
     au format allemand (1.926,50 €, 22.11.2026, 6. Juli) ;
   - dans la traduction, [Karte|Karten] choisit le singulier ou le pluriel selon le nombre qui précède ;
   - un texte composé « A · B · C » se traduit morceau par morceau (· — – : ; , → et parenthèses) ;
   - ce qui n'est pas au dictionnaire (noms de cartes, boutiques, notes) reste tel quel ;
   - [translate="no"] protège un bloc (contenu d'annonce, titres eBay…).
   Un MutationObserver traduit ce que l'application ajoute ensuite (vues, feuilles, infobulles, toasts).
   Bouton FR | DE dans la barre du haut : mémorisé sur l'appareil (localStorage pr.langue), recharge la page. */
(function () {
  'use strict';
  var w = window, d = document, CLE = 'pr.langue';
  var langue = 'fr';
  try { langue = w.localStorage.getItem(CLE) === 'de' ? 'de' : 'fr'; } catch (e) {}
  w.PR_LANGUE = langue;

  /* ---------------------------------------------------------------- jetons (nombres, dates, mois) */
  var MOIS_C = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  var MOIS_L = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var DE_C = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'];
  var DE_L = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  var MOIS_ALT = MOIS_L.concat(MOIS_C).filter(function (x, i, a) { return a.indexOf(x) === i; })
    .sort(function (a, b) { return b.length - a.length; }).map(esc).join('|');
  var SP = '[ \\u00a0\\u202f]';
  var RE_TOK = new RegExp([
    '(?<![\\d/])\\d{1,2}/\\d{1,2}/\\d{4} à \\d{1,2}h\\d{2}(?!\\d)',          /* 22/11/2026 à 08h40 */
    '(?<![\\d/])\\d{1,2}/\\d{1,2}/\\d{4}(?![\\d/])',                       /* 22/11/2026 */
    '(?<![\\d/])\\d{1,2}/\\d{1,2}/\\d{2}(?![\\d/])',                       /* 22/11/26 */
    '(?<![\\d/])\\d{1,2}/\\d{1,2}(?![\\d/])',                               /* 22/11 */
    '(?<!\\d)\\d{1,2}h\\d{2}(?!\\d)',                                       /* 08h40 */
    '(?<![\\d,])\\d{1,2}(?:er)?' + SP + '(?:' + MOIS_ALT + ')(?:' + SP + '\\d{4})?(?![\\wÀ-ÿ])', /* 6 juil., 6 juillet 2026 */
    '(?<![\\wÀ-ÿ])(?:' + MOIS_ALT + ')' + SP + '\\d{2,4}(?!\\d)',          /* juil. 26, juillet 2026 */
    '(?<![\\wÀ-ÿ\\d])[+−-]?\\d+(?:[\\u00a0\\u202f]\\d{3})*(?:,\\d+)?(?:' + SP + '?(?:k€|M€|€|%|¥))?(?![\\d])'
  ].join('|'), 'g');
  var RE_MOIS_J = new RegExp('^(\\d{1,2})(?:er)?' + SP + '(' + MOIS_ALT + ')(?:' + SP + '(\\d{4}))?$');
  var RE_MOIS_A = new RegExp('^(' + MOIS_ALT + ')' + SP + '(\\d{2,4})$');
  /* « août » est à la fois court et long : avec une année, le mois s'écrit en entier (August 2026), sinon abrégé (10. Aug.) */
  function moisDe(m, long) {
    var i;
    if (long) { i = MOIS_L.indexOf(m); if (i !== -1) return DE_L[i]; }
    i = MOIS_C.indexOf(m); if (i !== -1) return DE_C[i];
    i = MOIS_L.indexOf(m); return i !== -1 ? DE_L[i] : m;
  }
  function jetonDe(t) {
    var m;
    if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) à (\d{1,2})h(\d{2})$/.exec(t))) return m[1] + '.' + m[2] + '.' + m[3] + ' um ' + m[4] + ':' + m[5];
    if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(t))) return m[1] + '.' + m[2] + '.' + m[3];
    if ((m = /^(\d{1,2})\/(\d{1,2})$/.exec(t))) return m[1] + '.' + m[2] + '.';
    if ((m = /^(\d{1,2})h(\d{2})$/.exec(t))) return m[1] + ':' + m[2];
    if ((m = RE_MOIS_J.exec(t))) return m[1] + '. ' + moisDe(m[2], !!m[3]) + (m[3] ? ' ' + m[3] : '');
    if ((m = RE_MOIS_A.exec(t))) return moisDe(m[1], m[2].length === 4) + ' ' + m[2];
    return t.replace(/(\d)[  ](?=\d{3}(?!\d))/g, '$1.');
  }
  function valeur(t) {
    var s = String(t || '').replace(/[   ]/g, '').replace('−', '-').replace(',', '.').replace(/[^\d.+-]/g, '');
    var v = parseFloat(s);
    return isNaN(v) ? null : v;
  }
  /* modèle d'un texte : { cle: 'Valeur {0} en stock', jetons: ['145'] } */
  function modele(s) {
    var jetons = [];
    var cle = String(s).replace(RE_TOK, function (t) { jetons.push(t); return '{' + (jetons.length - 1) + '}'; });
    return { cle: norm(cle), jetons: jetons };
  }
  function norm(s) { return s.replace(/[\s  ]+/g, ' ').trim(); }

  /* ---------------------------------------------------------------- dictionnaire
     PR_DE : { 'modèle français': 'modèle allemand' } ; PR_DE_RE : [[motif, remplacement]] pour les textes qui
     contiennent une donnée (nom de carte, référence) ; PR_DE_CTX : [[sélecteur, { texte: traduction }]] quand un
     même mot se traduit autrement à un endroit (« Annuler » d'un toast = Rückgängig). */
  var DICO = null, MOTIFS = null;
  function motifs() {
    if (MOTIFS) return MOTIFS;
    MOTIFS = (w.PR_DE_RE || []).map(function (m) { return [new RegExp(m[0]), m[1]]; });
    return MOTIFS;
  }
  function parMotif(corps) {
    var M = motifs();
    for (var i = 0; i < M.length; i++) {
      var m = M[i][0].exec(corps);
      if (!m) continue;
      return M[i][1].replace(/\$(\d)/g, function (t, k) {
        var g = m[+k] || '';
        var mo = modele(g);
        if (mo.jetons.length && /^[{}\d\s()+−\-–—·:;,.\/×%€¥→|]*$/.test(mo.cle)) return remplir(mo.cle, mo.jetons);
        var tg = g.length < corps.length ? traduire(g) : null;
        return tg != null ? tg : g;
      });
    }
    return null;
  }
  function dico() {
    if (DICO) return DICO;
    DICO = {};
    var src = w.PR_DE || {};
    Object.keys(src).forEach(function (k) { DICO[norm(k)] = src[k]; });
    return DICO;
  }
  function remplir(modeleDe, jetons) {
    var out = modeleDe.replace(/\[([^|\]]*)\|([^\]]*)\]/g, function (tout, un, plus, pos) {
      var avant = modeleDe.slice(0, pos), m = avant.match(/\{(\d+)\}(?![\s\S]*\{\d+\})/), k = m ? +m[1] : 0;
      var v = valeur(jetons[k]);
      return v != null && Math.abs(v) === 1 ? un : plus;
    });
    return out.replace(/\{(\d+)\}/g, function (t, i) { return jetons[+i] != null ? jetonDe(jetons[+i]) : ''; });
  }
  var SEPS = [' · ', ' — ', ' – ', ' → ', ' : ', ' ; ', ', ', ' / '];
  var SEP_DE = { ' : ': ': ', ' ; ': '; ' };
  var CACHE = Object.create(null);
  /* traduit un texte ; null si rien n'est à traduire */
  function traduire(s) {
    if (s == null) return null;
    var str = String(s);
    if (str in CACHE) return CACHE[str];
    var r = traduireBrut(str, 0);
    CACHE[str] = r;
    return r;
  }
  /* découpe en phrases, sans couper après une abréviation (réf., art., ex.) */
  function phrases(t) {
    var out = [], deb = 0, re = /[.!?]\s+(?=[A-ZÀ-Ý«])/g, m;
    while ((m = re.exec(t))) {
      var bout = t.slice(deb, m.index + 1);
      if (/(?:^|[\s(])(?:[Rr]éf|[Aa]rt|ex|env|cf|vol|p)\.$/.test(bout)) continue;
      out.push(bout);
      deb = m.index + m[0].length;
    }
    out.push(t.slice(deb));
    return out;
  }
  function traduireBrut(str, prof) {
    var m0 = /^(\s*(?:[·—–→]\s+)?)([\s\S]*?)(\s*)$/.exec(str), avant = m0[1], corps = m0[2], apres = m0[3];
    if (!corps) return null;
    var D = dico(), mo = modele(corps);
    if (Object.prototype.hasOwnProperty.call(D, mo.cle)) return avant + remplir(D[mo.cle], mo.jetons) + apres;
    var pm = parMotif(corps);
    if (pm != null) return avant + pm + apres;
    /* que des nombres, dates et signes : seulement le format */
    if (mo.jetons.length && /^[{}\d\s()+−\-–—·:;,.\/×%€¥→|]*$/.test(mo.cle)) return avant + remplir(mo.cle, mo.jetons) + apres;
    if (prof > 6) return null;
    /* plusieurs phrases : une par une */
    var phr = phrases(corps);
    if (phr.length > 1) {
      var unP = false;
      var trP = phr.map(function (p) { var t = traduireBrut(p, prof + 1); if (t != null) unP = true; return t != null ? t : p; });
      if (unP) return avant + trP.join(' ') + apres;
    }
    for (var i = 0; i < SEPS.length; i++) {
      var sep = SEPS[i];
      if (corps.indexOf(sep) === -1) continue;
      var parts = corps.split(sep), une = false;
      var tr = parts.map(function (p) { var t = traduireBrut(p, prof + 1); if (t != null) une = true; return t != null ? t : p; });
      if (une) return avant + tr.join(SEP_DE[sep] || sep) + apres;
    }
    var mp = /^([\s\S]*\S)\s\(([^()]+)\)([.,;:!?]?)$/.exec(corps);
    if (mp) {
      var a = traduireBrut(mp[1], prof + 1), b = traduireBrut(mp[2], prof + 1);
      if (a != null || b != null) return avant + (a != null ? a : mp[1]) + ' (' + (b != null ? b : mp[2]) + ')' + mp[3] + apres;
    }
    var mq = /^«\s?([\s\S]+?)\s?»$/.exec(corps);
    if (mq) { var c = traduireBrut(mq[1], prof + 1); if (c != null) return avant + '„' + c + '“' + apres; }
    return null;
  }

  /* outils pour les tests et la collecte des textes (banc local) */
  w.PR_TRAD = { modele: modele, traduire: traduire, langue: langue, jetonDe: jetonDe };

  /* ---------------------------------------------------------------- bouton FR | DE */
  function bouton() {
    if (d.querySelector('.langue')) return;
    /* Pilotage : barre du haut ; Gestion : en-tête de la page (l'en-tête du site a déjà son FR | EN public) */
    var hote = d.querySelector('.pl-top') || d.querySelector('#gestion .page-head') || d.querySelector('.site-header .header-inner');
    if (!hote) return;
    var g = d.createElement('div');
    g.className = 'langue';
    g.setAttribute('role', 'group');
    g.setAttribute('aria-label', 'Langue · Sprache');
    g.setAttribute('translate', 'no');
    [['fr', 'FR', 'Français'], ['de', 'DE', 'Deutsch']].forEach(function (x) {
      var b = d.createElement('button');
      b.type = 'button';
      b.textContent = x[1];
      b.lang = x[0];
      b.title = x[2];
      b.setAttribute('aria-pressed', String(x[0] === langue));
      b.addEventListener('click', function () {
        if (x[0] === langue) return;
        try { w.localStorage.setItem(CLE, x[0]); } catch (e) {}
        w.location.reload();
      });
      g.appendChild(b);
    });
    if (hote.classList.contains('page-head')) hote.insertBefore(g, hote.firstChild); else hote.appendChild(g);
  }

  /* ---------------------------------------------------------------- traduction du document */
  var ATTRS = ['placeholder', 'aria-label', 'title', 'alt', 'aria-description', 'data-label'];
  var vuTexte = new WeakMap(), vuAttr = new WeakMap();
  function protege(el) {
    for (var e = el; e && e.nodeType === 1; e = e.parentNode) {
      var t = e.nodeName;
      if (t === 'SCRIPT' || t === 'STYLE' || t === 'TEXTAREA' || t === 'NOSCRIPT' || t === 'CODE' || t === 'PRE') return true;
      if (e.getAttribute('translate') === 'no' || e.isContentEditable) return true;
    }
    return false;
  }
  function contexte(n, t) {
    var C = w.PR_DE_CTX || [], p = n.parentNode, k = norm(t);
    for (var i = 0; i < C.length; i++) if (p && p.closest && p.closest(C[i][0]) && Object.prototype.hasOwnProperty.call(C[i][1], k)) return C[i][1][k];
    return null;
  }
  function texte(n) {
    var t = n.data;
    if (!t || vuTexte.get(n) === t || !/[A-Za-zÀ-ÿ\d]/.test(t)) return;
    if (n.parentNode && protege(n.parentNode)) { vuTexte.set(n, t); return; }
    var r = contexte(n, t);
    if (r == null) r = traduire(t);
    if (r != null && r !== t) n.data = r;
    vuTexte.set(n, n.data);
  }
  function attribut(el, a) {
    var v = el.getAttribute(a);
    if (!v) return;
    var deja = vuAttr.get(el);
    if (deja && deja[a] === v) return;
    if (protege(el)) return;
    var r = traduire(v);
    if (r != null && r !== v) el.setAttribute(a, r);
    if (!deja) { deja = {}; vuAttr.set(el, deja); }
    deja[a] = el.getAttribute(a);
  }
  function parcourir(n) {
    if (n.nodeType === 3) { texte(n); return; }
    if (n.nodeType !== 1) return;
    if (protege(n)) return;
    for (var i = 0; i < ATTRS.length; i++) if (n.hasAttribute(ATTRS[i])) attribut(n, ATTRS[i]);
    if (n.nodeName === 'INPUT' && /^(button|submit|reset)$/i.test(n.type) && n.value) {
      var r = traduire(n.value); if (r != null) n.value = r;
    }
    var walker = d.createTreeWalker(n, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: function (x) { return x.nodeType === 1 && protege(x) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; }
    });
    var x;
    while ((x = walker.nextNode())) {
      if (x.nodeType === 3) texte(x);
      else for (var j = 0; j < ATTRS.length; j++) if (x.hasAttribute(ATTRS[j])) attribut(x, ATTRS[j]);
    }
  }
  function titre() { var r = traduire(d.title); if (r != null && r !== d.title) d.title = r; }
  function demarrer() {
    bouton();
    if (langue !== 'de') return;
    d.documentElement.lang = 'de';
    titre();
    parcourir(d.body);
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'childList') {
          for (var j = 0; j < m.addedNodes.length; j++) parcourir(m.addedNodes[j]);
          if (m.target && m.target.nodeName === 'TITLE') titre();
        } else if (m.type === 'characterData') {
          if (m.target.parentNode && m.target.parentNode.nodeName === 'TITLE') titre(); else texte(m.target);
        } else if (m.type === 'attributes') attribut(m.target, m.attributeName);
      }
    }).observe(d.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    /* boîtes de dialogue natives (rares) */
    ['alert', 'confirm', 'prompt'].forEach(function (f) {
      var o = w[f];
      if (typeof o !== 'function') return;
      w[f] = function (msg) { var a = Array.prototype.slice.call(arguments); var r = traduire(msg); if (r != null) a[0] = r; return o.apply(w, a); };
    });
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
