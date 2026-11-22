/* Poké-Raichu · pilotage : graphiques (SVG et HTML faits main, sans bibliothèque, compatibles avec la CSP du site).
   Règles de dessin (à garder) :
   - une couleur = un rôle : classes g-s1… (séries, palette validée), g-pos / g-neg (signe d'un écart, bleu / rouge),
     g-mute (ce qui n'est pas sélectionné), g-total (totaux d'une cascade) ; les couleurs sont dans pilotage.css ;
   - barres de 24 px d'épaisseur au plus, bout arrondi de 4 px côté valeur, carré côté base ; lignes de 2 px ;
     grille en traits fins pleins ; un repère (objectif, seuil) en pointillé ;
   - infobulle au survol, au toucher et au clavier ; jamais la seule façon de lire un chiffre : chaque graphique a sa vue
     « Tableau » dans sa carte (pilotage.js) ;
   - aucun attribut style (CSP) : tailles et positions par CSSOM (el.style.x = …) ou par attributs SVG ;
   - les textes viennent des données : toujours textContent, jamais innerHTML.
   Le graphique se redessine à la largeur de son cadre (rotation de l'iPad, Split View) : ResizeObserver. */
(function (w) {
  'use strict';
  var d = document, NS = 'http://www.w3.org/2000/svg';

  /* ---------------------------------------------------------------- outils */
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
  function sv(tag, a, kids) {
    var e = d.createElementNS(NS, tag);
    if (a) Object.keys(a).forEach(function (k) {
      var v = a[k];
      if (v == null || v === false) return;
      if (k === 'text') e.textContent = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    });
    ajouter(e, kids);
    return e;
  }
  function ok(v) { return typeof v === 'number' && isFinite(v); }
  function r1(v) { return Math.round(v * 10) / 10; }
  var cv = null;
  function largeur(t, taille, gras) {
    if (!cv) cv = d.createElement('canvas').getContext('2d');
    cv.font = (gras ? '600 ' : '400 ') + (taille || 11) + 'px -apple-system, system-ui, "Segoe UI", Roboto, sans-serif';
    return cv.measureText(String(t)).width;
  }

  /* ---------------------------------------------------------------- formats */
  var NF0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  var NF1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
  function moins(s) { return String(s).replace(/^-/, '−'); }
  /* graduations en euros : en entier sous 10 000 €, en k€ au-delà (un seul style par axe) */
  function eurAxe(maxAbs) {
    return function (v) {
      if (Math.abs(v) < 1e-9) return '0';
      if (maxAbs >= 10000) return moins(Math.abs(maxAbs) >= 1e6 ? NF1.format(v / 1e6) + ' M€' : NF0.format(v / 1000) + ' k€');
      return moins(NF0.format(v)) + ' €';
    };
  }
  function pctAxe(v) { return Math.abs(v) < 1e-9 ? '0' : moins(NF0.format(v * 100)) + ' %'; }
  var MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  var MOIS_L = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  function jourDe(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 : null; }
  function isoDe(j) { var t = new Date(j * 864e5); return t.getUTCFullYear() + '-' + String(t.getUTCMonth() + 1).padStart(2, '0') + '-' + String(t.getUTCDate()).padStart(2, '0'); }
  function dateCourte(j) { var t = new Date(j * 864e5); return t.getUTCDate() + ' ' + MOIS[t.getUTCMonth()]; }
  function dateLongue(j) { var t = new Date(j * 864e5); return t.getUTCDate() + ' ' + MOIS_L[t.getUTCMonth()] + ' ' + t.getUTCFullYear(); }

  /* ---------------------------------------------------------------- échelles */
  function pasNet(brut) {
    if (!(brut > 0)) return 1;
    var p = Math.pow(10, Math.floor(Math.log(brut) / Math.LN10)), f = brut / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  function echelle(min, max, n) {
    if (!(ok(min) && ok(max))) { min = 0; max = 1; }
    if (min === max) { if (max === 0) max = 1; else if (max > 0) min = 0; else max = 0; }
    var pas = pasNet((max - min) / Math.max(1, n || 4));
    var a = Math.floor(min / pas + 1e-9) * pas, b = Math.ceil(max / pas - 1e-9) * pas, t = [];
    for (var v = a; v <= b + pas * 1e-6; v += pas) t.push(Math.abs(v) < pas * 1e-9 ? 0 : v);
    return { min: a, max: b, pas: pas, ticks: t };
  }
  function bornes(listes, avecZero) {
    var mn = avecZero ? 0 : Infinity, mx = avecZero ? 0 : -Infinity;
    listes.forEach(function (l) { l.forEach(function (v) { if (ok(v)) { if (v < mn) mn = v; if (v > mx) mx = v; } }); });
    if (mn === Infinity) { mn = 0; mx = 1; }
    return [mn, mx];
  }

  /* ---------------------------------------------------------------- infobulle (une par graphique) */
  function bulle(host) {
    var b = null;
    for (var i = 0; i < host.children.length; i++) if (host.children[i].classList.contains('g-bulle')) b = host.children[i];
    if (!b) { b = h('div', { class: 'g-bulle', role: 'status', 'aria-live': 'polite' }); b.hidden = true; host.appendChild(b); }
    return {
      montrer: function (x, y, titre, lignes) {
        b.textContent = '';
        if (titre) b.appendChild(h('p', { class: 'g-bulle__t', text: titre }));
        (lignes || []).forEach(function (l) {
          b.appendChild(h('p', { class: 'g-bulle__l' + (l.sous ? ' g-bulle__l--sous' : '') }, [
            l.cls ? h('i', { class: 'g-cle g-cle--' + (l.forme || 'barre') + ' ' + l.cls, 'aria-hidden': 'true' }) : null,
            h('b', { text: l.v }), l.l ? h('span', { text: l.l }) : null]));
        });
        b.hidden = false;
        var W = host.clientWidth, bw = b.offsetWidth, bh = b.offsetHeight;
        var gauche = x + 14;
        if (gauche + bw > W - 2) gauche = x - 14 - bw;
        if (gauche < 2) gauche = Math.max(2, Math.min(W - bw - 2, x - bw / 2));
        var haut = y - bh - 10;
        if (haut < -6) haut = y + 18;
        b.style.left = Math.round(gauche) + 'px';
        b.style.top = Math.round(haut) + 'px';
      },
      cacher: function () { b.hidden = true; }
    };
  }
  /* un toucher ailleurs ferme les infobulles ouvertes */
  d.addEventListener('pointerdown', function (e) {
    Array.prototype.forEach.call(d.querySelectorAll('.g-bulle:not([hidden])'), function (b) { if (!b.parentNode.contains(e.target)) b.hidden = true; });
  }, true);
  function pos(host, e) { var r = host.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  /* ---------------------------------------------------------------- dessin à la largeur du cadre */
  var montes = [];
  function monter(host, dessiner) {
    var dernier = -1;
    function go(W) {
      W = Math.floor(W);
      if (W < 60 || Math.abs(W - dernier) < 2) return;
      dernier = W;
      Array.prototype.slice.call(host.children).forEach(function (k) { if (!k.classList.contains('g-bulle')) host.removeChild(k); });
      dessiner(W);
    }
    if (w.ResizeObserver) {
      var ro = new ResizeObserver(function (en) { if (!host.isConnected) return; go(en[0].contentRect.width); });
      ro.observe(host);
      montes.push({ ro: ro, host: host });
    } else setTimeout(function () { go(host.clientWidth || 320); }, 0);
  }
  /* appelé à chaque rendu de page : libère les graphiques qui ne sont plus affichés */
  function nettoyer() {
    montes = montes.filter(function (m) { if (!m.host.isConnected) { m.ro.disconnect(); return false; } return true; });
  }
  function cadre(host, hauteur, cls) {
    host.classList.add('g-host');
    if (cls) host.classList.add(cls);
    if (hauteur) host.style.height = hauteur + 'px';
    return bulle(host);
  }

  /* chemin d'une barre verticale, bout arrondi côté valeur (haut si positive, bas si négative) */
  function colonne(x, y0, y1, l, r) {
    var haut = Math.min(y0, y1), bas = Math.max(y0, y1), hh = bas - haut;
    r = Math.max(0, Math.min(r, l / 2, hh));
    if (hh < 0.5) return 'M' + r1(x) + ',' + r1(haut) + 'h' + r1(l) + 'v0.5h' + r1(-l) + 'z';
    if (y1 <= y0) return 'M' + r1(x) + ',' + r1(bas) + 'V' + r1(haut + r) + 'Q' + r1(x) + ',' + r1(haut) + ' ' + r1(x + r) + ',' + r1(haut) +
      'H' + r1(x + l - r) + 'Q' + r1(x + l) + ',' + r1(haut) + ' ' + r1(x + l) + ',' + r1(haut + r) + 'V' + r1(bas) + 'Z';
    return 'M' + r1(x) + ',' + r1(haut) + 'V' + r1(bas - r) + 'Q' + r1(x) + ',' + r1(bas) + ' ' + r1(x + r) + ',' + r1(bas) +
      'H' + r1(x + l - r) + 'Q' + r1(x + l) + ',' + r1(bas) + ' ' + r1(x + l) + ',' + r1(bas - r) + 'V' + r1(haut) + 'Z';
  }

  /* navigation au clavier sur un graphique à positions (colonnes, courbe) */
  function clavier(svg, n, montrer, cacher, choisir) {
    var i = -1;
    svg.setAttribute('tabindex', '0');
    svg.addEventListener('focus', function () { i = i < 0 ? n - 1 : i; montrer(i); });
    svg.addEventListener('blur', cacher);
    svg.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); i = Math.max(0, Math.min(n - 1, (i < 0 ? n - 1 : i) + (e.key === 'ArrowLeft' ? -1 : 1))); montrer(i); }
      else if ((e.key === 'Enter' || e.key === ' ') && choisir && i >= 0) { e.preventDefault(); choisir(i); }
      else if (e.key === 'Escape') cacher();
    });
  }

  /* ---------------------------------------------------------------- colonnes (catégories ou périodes), avec ligne possible
     o = { cats: [{cle, label, long, special}], series: [{nom, cls, type: 'barre'|'ligne', valeurs: []}], hauteur, fmt, fmtAxe,
           sel, onSelect(cle), etiquettes: true|false, aria } */
  function colonnes(host, o) {
    var H = o.hauteur || 220, B = cadre(host, H);
    monter(host, function (W) {
      var cats = o.cats, n = cats.length;
      var barres = o.series.filter(function (s) { return s.type !== 'ligne'; }), lignes = o.series.filter(function (s) { return s.type === 'ligne'; });
      var bn = bornes(o.series.map(function (s) { return s.valeurs; }), true);
      var E = echelle(bn[0], bn[1], H < 190 ? 3 : 4);
      var fa = o.fmtAxe || eurAxe(Math.max(Math.abs(E.min), Math.abs(E.max)));
      var fmt = o.fmt || fa;
      var gl = Math.ceil(Math.max.apply(null, E.ticks.map(function (t) { return largeur(fa(t), 11); }))) + 10;
      var m = { l: gl, r: 4, t: 14, b: 24 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
      function Y(v) { return m.t + ph * (1 - (v - E.min) / (E.max - E.min)); }
      var band = pw / Math.max(1, n), k = Math.max(1, barres.length), gap = 2;
      var bw = Math.min(24, Math.max(2, (band * 0.68 - gap * (k - 1)) / k)), gw = bw * k + gap * (k - 1);
      var svg = sv('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, class: 'g-svg', role: 'img', 'aria-label': o.aria || '' });
      E.ticks.forEach(function (t) {
        svg.appendChild(sv('line', { x1: m.l, x2: W - m.r, y1: r1(Y(t)), y2: r1(Y(t)), class: t === 0 ? 'g-zero' : 'g-grille' }));
        svg.appendChild(sv('text', { x: m.l - 8, y: r1(Y(t) + 3.5), 'text-anchor': 'end', class: 'g-tick' }, fa(t)));
      });
      var survol = sv('rect', { x: 0, y: m.t, width: 0, height: ph, class: 'g-survol', rx: 4 });
      svg.appendChild(survol);
      var y0 = Y(Math.max(E.min, Math.min(0, E.max)));
      /* barres */
      cats.forEach(function (c, i) {
        var x0 = m.l + band * i + (band - gw) / 2;
        barres.forEach(function (s, j) {
          var v = s.valeurs[i];
          if (!ok(v)) return;
          var cls = 'g-col ' + (c.cls || s.cls || 'g-s1');
          if (c.special) cls += ' g-special';
          if (o.sel != null && o.sel !== c.cle) cls += ' g-mute';
          if (s.signe) cls += v < 0 ? ' g-neg' : ' g-pos';
          svg.appendChild(sv('path', { d: colonne(x0 + j * (bw + gap), y0, Y(v), bw, 4), class: cls }));
        });
      });
      /* lignes (une colonne « spéciale », hors du temps, n'est pas reliée aux autres : point isolé) */
      var points = [];
      lignes.forEach(function (s) {
        var pts = [];
        s.valeurs.forEach(function (v, i) { if (ok(v)) pts.push([m.l + band * (i + 0.5), Y(v), i, !!cats[i].special]); });
        points.push(pts);
        var suite = pts.filter(function (p) { return !p[3]; });
        if (suite.length > 1) svg.appendChild(sv('path', { d: 'M' + suite.map(function (p) { return r1(p[0]) + ',' + r1(p[1]); }).join('L'), class: 'g-ligne ' + (s.cls || 'g-s2') }));
        pts.forEach(function (p) { if (p[3] || n <= 40) svg.appendChild(sv('circle', { cx: r1(p[0]), cy: r1(p[1]), r: n > 20 && !p[3] ? 2.5 : 3.5, class: 'g-point ' + (s.cls || 'g-s2') })); });
      });
      /* étiquettes de valeur : peu, et seulement si elles tiennent */
      if (o.etiquettes !== false && barres.length === 1) {
        var s0 = barres[0], idx = [];
        if (n <= 8) idx = s0.valeurs.map(function (_, i) { return i; });
        else {
          var im = -1, iv = -Infinity;
          s0.valeurs.forEach(function (v, i) { if (ok(v) && v > iv) { iv = v; im = i; } });
          if (im >= 0) idx.push(im);
        }
        idx.forEach(function (i) {
          var v = s0.valeurs[i];
          if (!ok(v) || (o.sel != null && o.sel !== cats[i].cle)) return;
          var t = fmt(v), tw = largeur(t, 11, true);
          if (tw > band + 6) return;
          var y = v >= 0 ? Y(v) - 5 : Y(v) + 13;
          svg.appendChild(sv('text', { x: r1(m.l + band * (i + 0.5)), y: r1(Math.max(10, y)), 'text-anchor': 'middle', class: 'g-val' }, t));
        });
      }
      /* libellés des catégories, espacés pour ne pas se chevaucher (le dernier toujours écrit) */
      var lw = Math.max.apply(null, cats.map(function (c) { return largeur(c.label, 11); }).concat([8])) + 8;
      var pasL = Math.max(1, Math.ceil(lw / band)), pris = [];
      cats.forEach(function (c, i) { if (c.special) pris.push(i); });
      for (var i = n - 1; i >= 0; i -= pasL) {
        if (cats[i].special || pris.some(function (j) { return Math.abs(j - i) < pasL; })) continue;
        pris.push(i);
      }
      pris.forEach(function (i) {
        var lx = m.l + band * (i + 0.5), tw = largeur(cats[i].label, 11);
        var ancre = lx - tw / 2 < 0 ? 'start' : lx + tw / 2 > W ? 'end' : 'middle';
        svg.appendChild(sv('text', { x: r1(ancre === 'start' ? Math.max(0, m.l + band * i) : ancre === 'end' ? W - 1 : lx), y: H - 7, 'text-anchor': ancre, class: 'g-tick' + (cats[i].special ? ' g-tick--special' : '') }, cats[i].label));
      });
      /* survol, toucher, clavier */
      var marques = [];
      function montrer(i, x, y) {
        survol.setAttribute('x', r1(m.l + band * i + 1)); survol.setAttribute('width', r1(Math.max(2, band - 2)));
        marques.forEach(function (e) { e.remove(); }); marques = [];
        lignes.forEach(function (s, j) {
          var p = points[j].filter(function (q) { return q[2] === i; })[0];
          if (p) { var c = sv('circle', { cx: r1(p[0]), cy: r1(p[1]), r: 4.5, class: 'g-point g-point--actif ' + (s.cls || 'g-s2') }); svg.appendChild(c); marques.push(c); }
        });
        var rows = o.series.map(function (s) {
          var v = s.valeurs[i];
          return { v: ok(v) ? fmt(v) : '—', l: s.nom, cls: s.signe ? (v < 0 ? 'g-neg' : 'g-pos') : (s.cls || 'g-s1'), forme: s.type === 'ligne' ? 'ligne' : 'barre' };
        });
        if (o.detail) rows = rows.concat(o.detail(i) || []);
        B.montrer(x != null ? x : m.l + band * (i + 0.5), y != null ? y : m.t + 10, cats[i].long || cats[i].label, rows);
      }
      function cacher() { survol.setAttribute('width', 0); marques.forEach(function (e) { e.remove(); }); marques = []; B.cacher(); }
      function indice(e) { var p = pos(host, e); return { i: Math.max(0, Math.min(n - 1, Math.floor((p.x - m.l) / band))), p: p }; }
      var zone = sv('rect', { x: m.l, y: 0, width: pw, height: H, class: 'g-zone' });
      zone.addEventListener('pointermove', function (e) { var q = indice(e); montrer(q.i, q.p.x, q.p.y); });
      zone.addEventListener('pointerdown', function (e) { var q = indice(e); montrer(q.i, q.p.x, q.p.y); });
      zone.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') cacher(); });
      if (o.onSelect) {
        zone.classList.add('g-zone--clic');
        zone.addEventListener('click', function (e) { var q = indice(e); o.onSelect(cats[q.i].cle); });
      }
      svg.appendChild(zone);
      clavier(svg, n, function (i) { montrer(i); }, cacher, o.onSelect ? function (i) { o.onSelect(cats[i].cle); } : null);
      host.insertBefore(svg, host.firstChild);
    });
    return host;
  }

  /* ---------------------------------------------------------------- courbe dans le temps (ou sur un axe numérique)
     o = { x: [iso ou nombres], type: 'date'|'num', series: [{nom, cls, valeurs, aire, pas}], refs: [{y, label}],
           points: [{x, y, label}], hauteur, fmt, fmtAxe, fmtX, finLabel: true, zero: true, aria } */
  function courbe(host, o) {
    var H = o.hauteur || 220, B = cadre(host, H);
    var dates = o.type !== 'num';
    var xs = o.x.map(function (v) { return dates ? jourDe(v) : v; });
    monter(host, function (W) {
      var n = xs.length;
      var bn = bornes(o.series.map(function (s) { return s.valeurs; }).concat([(o.refs || []).map(function (r) { return r.y; })]), o.zero !== false);
      var E = echelle(bn[0], bn[1], H < 190 ? 3 : 4);
      var fa = o.fmtAxe || eurAxe(Math.max(Math.abs(E.min), Math.abs(E.max)));
      var fmt = o.fmt || fa;
      var fx = o.fmtX || (dates ? dateCourte : function (v) { return NF0.format(v); });
      var gl = Math.ceil(Math.max.apply(null, E.ticks.map(function (t) { return largeur(fa(t), 11); }))) + 10;
      var finW = 0;
      if (o.finLabel !== false) o.series.forEach(function (s) { var v = s.valeurs[n - 1]; if (ok(v)) finW = Math.max(finW, largeur(fmt(v), 11, true)); });
      var m = { l: gl, r: Math.max(8, Math.min(90, finW + 10)), t: 14, b: 24 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
      var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
      if (!(x1 > x0)) { x0 -= 1; x1 += 1; }
      function X(v) { return m.l + pw * (v - x0) / (x1 - x0); }
      function Y(v) { return m.t + ph * (1 - (v - E.min) / (E.max - E.min)); }
      var svg = sv('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, class: 'g-svg', role: 'img', 'aria-label': o.aria || '' });
      E.ticks.forEach(function (t) {
        svg.appendChild(sv('line', { x1: m.l, x2: W - m.r, y1: r1(Y(t)), y2: r1(Y(t)), class: t === 0 ? 'g-zero' : 'g-grille' }));
        svg.appendChild(sv('text', { x: m.l - 8, y: r1(Y(t) + 3.5), 'text-anchor': 'end', class: 'g-tick' }, fa(t)));
      });
      /* graduations du temps : jours, semaines, mois ou trimestres selon la durée */
      var tx = [];
      if (dates) {
        var span = x1 - x0, j;
        if (span <= 16) { for (j = Math.ceil(x0); j <= x1; j += span <= 8 ? 1 : 2) tx.push(j); }
        else if (span <= 70) { j = Math.ceil(x0); while (new Date(j * 864e5).getUTCDay() !== 1) j++; for (; j <= x1; j += span <= 35 ? 7 : 14) tx.push(j); }
        else {
          var t0 = new Date(x0 * 864e5), y = t0.getUTCFullYear(), mo = t0.getUTCMonth() + 1, saut = span > 500 ? 3 : span > 250 ? 2 : 1;
          for (var k = 0; k < 60; k++) {
            var mm = mo + k * saut, jj = Date.UTC(y + Math.floor((mm) / 12), mm % 12, 1) / 864e5;
            if (jj > x1) break;
            if (jj >= x0) tx.push(jj);
          }
        }
      } else tx = echelle(x0, x1, Math.max(2, Math.floor(pw / 90))).ticks.filter(function (v) { return v >= x0 && v <= x1; });
      var dernierX = -Infinity;
      tx.forEach(function (v, i) {
        var lab = dates && x1 - x0 > 70 ? (function () { var t = new Date(v * 864e5), mo = t.getUTCMonth(); return MOIS[mo] + (mo === 0 || i === 0 ? ' ' + String(t.getUTCFullYear()).slice(2) : ''); })() : fx(v);
        var xx = X(v), lw = largeur(lab, 11);
        if (xx - lw / 2 < dernierX + 8 || xx + lw / 2 > W) return;
        dernierX = xx + lw / 2;
        svg.appendChild(sv('line', { x1: r1(xx), x2: r1(xx), y1: H - m.b, y2: H - m.b + 4, class: 'g-axe' }));
        svg.appendChild(sv('text', { x: r1(xx), y: H - 7, 'text-anchor': 'middle', class: 'g-tick' }, lab));
      });
      /* repères (objectif, seuil) */
      (o.refs || []).forEach(function (r) {
        if (!ok(r.y)) return;
        var yy = r1(Y(r.y));
        svg.appendChild(sv('line', { x1: m.l, x2: W - m.r, y1: yy, y2: yy, class: 'g-ref' }));
        if (r.label) svg.appendChild(sv('text', { x: m.l + 4, y: yy - 5, class: 'g-ref__t' }, r.label));
      });
      /* séries */
      var chemins = o.series.map(function (s) {
        var pts = [];
        s.valeurs.forEach(function (v, i) { if (ok(v)) pts.push([X(xs[i]), Y(v), i]); });
        if (!pts.length) return pts;
        var dd = 'M' + r1(pts[0][0]) + ',' + r1(pts[0][1]);
        for (var i = 1; i < pts.length; i++) dd += s.pas ? 'H' + r1(pts[i][0]) + 'V' + r1(pts[i][1]) : 'L' + r1(pts[i][0]) + ',' + r1(pts[i][1]);
        if (s.aire) {
          var base = r1(Y(Math.max(E.min, Math.min(0, E.max))));
          svg.appendChild(sv('path', { d: dd + 'V' + base + 'H' + r1(pts[0][0]) + 'Z', class: 'g-aire ' + (s.cls || 'g-s1') }));
        }
        svg.appendChild(sv('path', { d: dd, class: 'g-ligne ' + (s.cls || 'g-s1') }));
        var fin = pts[pts.length - 1];
        svg.appendChild(sv('circle', { cx: r1(fin[0]), cy: r1(fin[1]), r: 4, class: 'g-point ' + (s.cls || 'g-s1') }));
        return pts;
      });
      /* valeur au bout de chaque ligne (si elles ne se chevauchent pas) */
      if (o.finLabel !== false) {
        var fins = [];
        o.series.forEach(function (s, j) { var p = chemins[j][chemins[j].length - 1]; if (p && p[2] === n - 1) fins.push({ y: p[1], x: p[0], t: fmt(s.valeurs[n - 1]) }); });
        fins.sort(function (a, b) { return a.y - b.y; });
        var libre = fins.every(function (f, i) { return !i || f.y - fins[i - 1].y >= 14; });
        if (libre) fins.forEach(function (f) { svg.appendChild(sv('text', { x: r1(f.x + 7), y: r1(f.y + 4), class: 'g-val' }, f.t)); });
      }
      /* points marqués (seuil atteint, optimum…) */
      (o.points || []).forEach(function (p) {
        var xx = X(dates ? jourDe(p.x) : p.x), yy = Y(p.y);
        svg.appendChild(sv('circle', { cx: r1(xx), cy: r1(yy), r: 5, class: 'g-point g-point--marque' }));
        if (p.label) {
          var tw = largeur(p.label, 11, true), droite = xx + 10 + tw < W - 2;
          svg.appendChild(sv('text', { x: r1(droite ? xx + 9 : xx - 9), y: r1(yy - 8), 'text-anchor': droite ? 'start' : 'end', class: 'g-val g-val--marque' }, p.label));
        }
      });
      /* réticule */
      var trait = sv('line', { x1: 0, x2: 0, y1: m.t, y2: H - m.b, class: 'g-reticule' });
      trait.setAttribute('visibility', 'hidden');
      svg.appendChild(trait);
      var marques = [];
      function montrer(i, px, py) {
        var xx = X(xs[i]);
        trait.setAttribute('x1', r1(xx)); trait.setAttribute('x2', r1(xx)); trait.setAttribute('visibility', 'visible');
        marques.forEach(function (e) { e.remove(); }); marques = [];
        var rows = [];
        o.series.forEach(function (s) {
          var v = s.valeurs[i];
          if (ok(v)) { var c = sv('circle', { cx: r1(xx), cy: r1(Y(v)), r: 4.5, class: 'g-point g-point--actif ' + (s.cls || 'g-s1') }); svg.appendChild(c); marques.push(c); }
          rows.push({ v: ok(v) ? fmt(v) : '—', l: s.nom, cls: s.cls || 'g-s1', forme: 'ligne' });
        });
        if (o.detail) rows = rows.concat(o.detail(i) || []);
        B.montrer(px != null ? px : xx, py != null ? py : m.t + 10, dates ? (o.fmtTitre || dateLongue)(xs[i]) : (o.fmtTitre || fx)(xs[i]), rows);
      }
      function cacher() { trait.setAttribute('visibility', 'hidden'); marques.forEach(function (e) { e.remove(); }); marques = []; B.cacher(); }
      function proche(e) {
        var p = pos(host, e), v = x0 + (p.x - m.l) / pw * (x1 - x0), best = 0, dist = Infinity;
        xs.forEach(function (x, i) { var dx = Math.abs(x - v); if (dx < dist) { dist = dx; best = i; } });
        return { i: best, p: p };
      }
      var zone = sv('rect', { x: m.l - 6, y: 0, width: pw + 12, height: H, class: 'g-zone' });
      zone.addEventListener('pointermove', function (e) { var q = proche(e); montrer(q.i, q.p.x, q.p.y); });
      zone.addEventListener('pointerdown', function (e) { var q = proche(e); montrer(q.i, q.p.x, q.p.y); });
      zone.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') cacher(); });
      svg.appendChild(zone);
      clavier(svg, n, function (i) { montrer(i); }, cacher, null);
      host.insertBefore(svg, host.firstChild);
    });
    return host;
  }

  /* ---------------------------------------------------------------- barres horizontales classées (HTML)
     o = { lignes: [{cle, label, sous, v, txt, repere, cls}], fmt, sel, onSelect(cle), repereNom, valeurNom, max, detail(l) }
     barres divergentes (bleu / rouge) dès qu'une valeur est négative ; repère = trait fin (ex. le coût sous la valeur). */
  function barres(host, o) {
    var B = cadre(host, null, 'g-barres-host');
    var L = o.lignes, neg = L.some(function (l) { return l.v < 0 || (l.repere != null && ok(l.repere) && l.repere < 0); }), signe = o.signe != null ? o.signe : L.some(function (l) { return l.v < 0; });
    var mx = o.max != null ? o.max : Math.max.apply(null, L.map(function (l) { return Math.max(l.v, l.repere || 0, 0); }).concat([0]));
    var mn = Math.min.apply(null, L.map(function (l) { return Math.min(l.v, l.repere != null && ok(l.repere) ? l.repere : 0, 0); }).concat([0]));
    var span = mx - mn || 1, z = -mn / span * 100;
    var ul = h('ul', { class: 'g-barres' + (o.sel != null ? ' g-barres--sel' : ''), 'aria-label': o.aria || null });
    L.forEach(function (l) {
      var cls = signe ? (l.v < 0 ? 'g-neg' : 'g-pos') : (l.cls || 'g-s1');
      var b = h('span', { class: 'g-barre__b ' + cls + (l.v < 0 ? ' g-barre__b--neg' : '') });
      var gauche = l.v < 0 ? z + l.v / span * 100 : z, larg = Math.abs(l.v) / span * 100;
      b.style.left = gauche + '%';
      b.style.width = Math.max(l.v ? 0.4 : 0, larg) + '%';
      var piste = h('span', { class: 'g-barre__t', 'aria-hidden': 'true' }, b);
      if (neg) { var zz = h('span', { class: 'g-barre__z' }); zz.style.left = z + '%'; piste.appendChild(zz); }
      if (l.repere != null && ok(l.repere)) { var rp = h('span', { class: 'g-barre__r' }); rp.style.left = (z + l.repere / span * 100) + '%'; piste.appendChild(rp); }
      var pressee = o.sel != null && o.sel === l.cle;
      var contenu = [h('span', { class: 'g-barre__l' }, [h('span', { class: 'g-barre__n', text: l.label }), l.sous ? h('small', { text: l.sous }) : null]), piste,
        h('span', { class: 'g-barre__v', text: l.txt != null ? l.txt : (o.fmt ? o.fmt(l.v) : String(l.v)) })];
      var el = o.onSelect ? h('button', { type: 'button', class: 'g-barre', 'aria-pressed': String(pressee) }, contenu) : h('div', { class: 'g-barre', tabindex: '0' }, contenu);
      if (o.sel != null && !pressee) el.classList.add('g-barre--mute');
      if (o.onSelect) el.addEventListener('click', function () { o.onSelect(l.cle); });
      function info(e) {
        var p = e && e.clientX != null ? pos(host, e) : { x: el.offsetLeft + el.offsetWidth * 0.6, y: el.offsetTop };
        var rows = [{ v: l.txt != null ? l.txt : (o.fmt ? o.fmt(l.v) : String(l.v)), l: o.valeurNom || '', cls: cls }];
        if (l.repere != null && ok(l.repere)) rows.push({ v: o.fmt ? o.fmt(l.repere) : String(l.repere), l: o.repereNom || 'Repère', cls: 'g-repere', forme: 'repere' });
        if (o.detail) rows = rows.concat(o.detail(l) || []);
        B.montrer(p.x, p.y, l.label + (l.sous ? ' · ' + l.sous : ''), rows);
      }
      el.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') info(e); });
      el.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') B.cacher(); });
      el.addEventListener('focus', function () { info(null); });
      el.addEventListener('blur', B.cacher);
      ul.appendChild(h('li', null, el));
    });
    host.insertBefore(ul, host.firstChild);
    return host;
  }

  /* ---------------------------------------------------------------- nuage de points (bulles)
     o = { points: [{cle, label, x, y, taille, cls}], xNom, yNom, fmtX, fmtY, moyX, moyY, quadrants: [hg, hd, bg, bd], sel, onSelect, detail(p) } */
  function nuage(host, o) {
    var B = cadre(host, null, 'g-nuage-host');
    monter(host, function (W) {
      var H = Math.round(Math.max(260, Math.min(480, W * (W < 520 ? 0.95 : 0.68))));
      host.style.height = H + 'px';
      var P = o.log ? o.points.filter(function (p) { return p.x > 0 && p.y > 0; }) : o.points, fx = o.fmtX || pctAxe, fy = o.fmtY || pctAxe;
      var EX, EY;
      if (o.log) {
        var lo = Math.min.apply(null, P.map(function (p) { return Math.min(p.x, p.y); })), hi = Math.max.apply(null, P.map(function (p) { return Math.max(p.x, p.y); }));
        var a0 = Math.pow(10, Math.floor(Math.log(lo) / Math.LN10)), b0 = Math.pow(10, Math.ceil(Math.log(hi) / Math.LN10)), tk = [];
        for (var dd = a0; dd <= b0 * 1.001; dd *= 10) [1, 2, 5].forEach(function (f) { var v = dd * f; if (v >= a0 && v <= b0 * 1.001) tk.push(v); });
        if (tk.length > 9) tk = tk.filter(function (v) { return Math.abs(Math.log(v) / Math.LN10 % 1) < 1e-9; });
        EX = EY = { min: a0, max: b0, ticks: tk };
      } else {
        var bx = bornes([P.map(function (p) { return p.x; }), [o.moyX]], true), by = bornes([P.map(function (p) { return p.y; }), [o.moyY]], true);
        EX = echelle(bx[0], bx[1] * 1.08, Math.max(3, Math.floor(W / 130))); EY = echelle(by[0] < 0 ? by[0] * 1.1 : 0, by[1] * 1.1, 4);
      }
      var gl = Math.ceil(Math.max.apply(null, EY.ticks.map(function (t) { return largeur(fy(t), 11); }))) + 10;
      var m = { l: gl, r: 12, t: 26, b: 40 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
      function ech(v, E) { return o.log ? (Math.log(v) - Math.log(E.min)) / (Math.log(E.max) - Math.log(E.min)) : (v - E.min) / (E.max - E.min); }
      function X(v) { return m.l + pw * ech(v, EX); }
      function Y(v) { return m.t + ph * (1 - ech(v, EY)); }
      var svg = sv('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, class: 'g-svg', role: 'img', 'aria-label': o.aria || '' });
      EY.ticks.forEach(function (t) {
        svg.appendChild(sv('line', { x1: m.l, x2: W - m.r, y1: r1(Y(t)), y2: r1(Y(t)), class: t === 0 ? 'g-zero' : 'g-grille' }));
        svg.appendChild(sv('text', { x: m.l - 8, y: r1(Y(t) + 3.5), 'text-anchor': 'end', class: 'g-tick' }, fy(t)));
      });
      EX.ticks.forEach(function (t) {
        svg.appendChild(sv('line', { x1: r1(X(t)), x2: r1(X(t)), y1: m.t, y2: H - m.b, class: 'g-grille' }));
        svg.appendChild(sv('text', { x: r1(X(t)), y: H - m.b + 15, 'text-anchor': 'middle', class: 'g-tick' }, fx(t)));
      });
      if (o.diagonale) { var da = Math.max(EX.min, EY.min), db = Math.min(EX.max, EY.max); svg.appendChild(sv('line', { x1: r1(X(da)), y1: r1(Y(da)), x2: r1(X(db)), y2: r1(Y(db)), class: 'g-ref' })); }
      if (ok(o.moyX)) svg.appendChild(sv('line', { x1: r1(X(o.moyX)), x2: r1(X(o.moyX)), y1: m.t, y2: H - m.b, class: 'g-ref' }));
      if (ok(o.moyY)) svg.appendChild(sv('line', { x1: m.l, x2: W - m.r, y1: r1(Y(o.moyY)), y2: r1(Y(o.moyY)), class: 'g-ref' }));
      if (o.quadrants) [[o.quadrants[0], m.l + 8, m.t + 14, 'start'], [o.quadrants[1], W - m.r - 6, m.t + 14, 'end'], [o.quadrants[2], m.l + 8, H - m.b - 8, 'start'], [o.quadrants[3], W - m.r - 6, H - m.b - 8, 'end']]
        .forEach(function (q) { if (q[0]) svg.appendChild(sv('text', { x: q[1], y: q[2], 'text-anchor': q[3], class: 'g-quad' }, q[0])); });
      if (o.yNom) svg.appendChild(sv('text', { x: 2, y: 12, class: 'g-axe-t' }, o.yNom));
      if (o.xNom) svg.appendChild(sv('text', { x: W - m.r, y: H - 6, 'text-anchor': 'end', class: 'g-axe-t' }, o.xNom));
      var tmax = Math.max.apply(null, P.map(function (p) { return p.taille || 0; })) || 1, rmax = Math.max(14, Math.min(26, W / 30));
      var places = P.slice().sort(function (a, b) { return (b.taille || 0) - (a.taille || 0); }).map(function (p) {
        return { p: p, cx: X(p.x), cy: Y(p.y), r: o.rayon || 4 + (rmax - 4) * Math.sqrt(Math.max(0, p.taille || 0) / tmax) };
      });
      places.forEach(function (q) {
        var muet = o.sel != null && o.sel !== q.p.cle;
        svg.appendChild(sv('circle', { cx: r1(q.cx), cy: r1(q.cy), r: r1(q.r), class: 'g-bulle-pt ' + (q.p.cls || 'g-s1') + (muet ? ' g-mute' : '') + (o.sel === q.p.cle ? ' g-bulle-pt--sel' : '') }));
      });
      /* étiquettes : à droite du point (à gauche près du bord), décalées si elles touchent une autre étiquette ou une bulle */
      var poses = [];
      if (o.etiquettes !== false) places.forEach(function (q) {
        var autres = places.filter(function (x) { return x !== q; }).map(function (x) { return [x.cx - x.r, x.cy - x.r, x.cx + x.r, x.cy + x.r]; });
        var lab = q.p.label.length > (W < 520 ? 18 : 28) ? q.p.label.slice(0, W < 520 ? 17 : 27) + '…' : q.p.label, lw = largeur(lab, 11, true);
        var gauche = q.cx + q.r + 4 + lw > W - m.r, tx = gauche ? q.cx - q.r - 4 : q.cx + q.r + 4, ty;
        function boite() { return gauche ? [tx - lw, ty - 10, tx, ty + 3] : [tx, ty - 10, tx + lw, ty + 3]; }
        function heurte(b) { return poses.concat(autres).some(function (o2) { return b[0] < o2[2] && b[2] > o2[0] && b[1] < o2[3] && b[3] > o2[1]; }); }
        var trouve = false;
        for (var essai = 0; essai < 2 && !trouve; essai++) {
          if (essai) { gauche = !gauche; tx = gauche ? q.cx - q.r - 4 : q.cx + q.r + 4; if (gauche ? tx - lw < m.l : tx + lw > W - m.r) break; }
          for (var k = 0, dy = [0, 13, -13, 26, -26]; k < dy.length; k++) { ty = q.cy + 4 + dy[k]; if (!heurte(boite())) { trouve = true; break; } }
        }
        if (!trouve) return;
        poses.push(boite());
        var muet = o.sel != null && o.sel !== q.p.cle;
        svg.appendChild(sv('text', { x: r1(tx), y: r1(ty), 'text-anchor': gauche ? 'end' : 'start', class: 'g-lab' + (muet ? ' g-lab--mute' : '') }, lab));
      });
      /* cibles de 24 px au moins, au-dessus de tout */
      places.slice().reverse().forEach(function (q) {
        var c = sv('circle', { cx: r1(q.cx), cy: r1(q.cy), r: r1(Math.max(12, q.r)), class: 'g-cible', tabindex: '0', role: 'button', 'aria-label': q.p.label + ' : ' + (o.yNom || 'y') + ' ' + fy(q.p.y) + ', ' + (o.xNom || 'x') + ' ' + fx(q.p.x) });
        function info() {
          var rows = [{ v: fy(q.p.y), l: o.yLib || o.yNom || '', cls: q.p.cls || 'g-s1' }, { v: fx(q.p.x), l: o.xLib || o.xNom || '', cls: q.p.cls || 'g-s1' }];
          if (o.detail) rows = rows.concat(o.detail(q.p) || []);
          B.montrer(q.cx, q.cy - q.r, q.p.label, rows);
        }
        c.addEventListener('pointerenter', info);
        c.addEventListener('pointerdown', info);
        c.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') B.cacher(); });
        c.addEventListener('focus', info);
        c.addEventListener('blur', B.cacher);
        if (o.onSelect) {
          c.classList.add('g-cible--clic');
          c.addEventListener('click', function () { o.onSelect(q.p.cle); });
          c.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); o.onSelect(q.p.cle); } });
        }
        svg.appendChild(c);
      });
      host.insertBefore(svg, host.firstChild);
    });
    return host;
  }

  /* ---------------------------------------------------------------- cascade (du chiffre d'affaires au résultat), horizontale
     o = { etapes: [{label, v, type: 'total'|'sous'|'delta', note}], fmt, base (pour le %) } */
  function cascade(host, o) {
    var B = cadre(host, null, 'g-casc-host'), fmt = o.fmt || eurAxe(1e9);
    var cum = 0, rang = [];
    o.etapes.forEach(function (e) {
      if (e.type === 'total' || e.type === 'sous') { rang.push({ e: e, a: 0, b: e.v }); cum = e.v; }
      else { rang.push({ e: e, a: cum, b: cum + e.v }); cum += e.v; }
    });
    var mn = Math.min(0, Math.min.apply(null, rang.map(function (x) { return Math.min(x.a, x.b); })));
    var mx = Math.max(0, Math.max.apply(null, rang.map(function (x) { return Math.max(x.a, x.b); })));
    var span = mx - mn || 1;
    var ol = h('ol', { class: 'g-casc', 'aria-label': o.aria || null });
    rang.forEach(function (x) {
      var e = x.e, tot = e.type === 'total' || e.type === 'sous';
      var cls = tot ? (e.v < 0 ? 'g-neg' : 'g-total') : (e.v < 0 ? 'g-neg' : 'g-pos');
      var lo = Math.min(x.a, x.b), hi = Math.max(x.a, x.b);
      var b = h('span', { class: 'g-casc__b ' + cls });
      b.style.left = ((lo - mn) / span * 100) + '%';
      b.style.width = Math.max(Math.abs(e.v) > 1e-9 ? 0.5 : 0, (hi - lo) / span * 100) + '%';
      var piste = h('span', { class: 'g-casc__t', 'aria-hidden': 'true' }, b);
      if (mn < 0) { var zz = h('span', { class: 'g-barre__z' }); zz.style.left = (-mn / span * 100) + '%'; piste.appendChild(zz); }
      var v = Math.abs(e.v) < 0.005 ? 0 : e.v;
      var li = h('li', { class: 'g-casc__l' + (tot ? ' g-casc__l--' + e.type : ''), tabindex: '0' }, [
        h('span', { class: 'g-casc__n' }, [e.label, e.note ? h('small', { text: e.note }) : null]),
        piste,
        h('span', { class: 'g-casc__v', text: (tot || v === 0 ? '' : v > 0 ? '+' : '') + fmt(v) }),
        o.base ? h('span', { class: 'g-casc__p', text: pctAxe(v / o.base).replace(/^0$/, '0 %') }) : null
      ]);
      function info(ev) {
        var p = ev && ev.clientX != null ? pos(host, ev) : { x: li.offsetLeft + li.offsetWidth * 0.5, y: li.offsetTop };
        var rows = [{ v: (tot || v === 0 ? '' : v > 0 ? '+' : '') + fmt(v), l: tot ? 'solde' : v < 0 ? 'en moins' : 'en plus', cls: cls }];
        if (!tot) rows.push({ v: fmt(x.b), l: 'après cette ligne', sous: true });
        if (o.base) rows.push({ v: pctAxe(v / o.base), l: 'du chiffre d’affaires', sous: true });
        B.montrer(p.x, p.y, e.label, rows);
      }
      li.addEventListener('pointermove', function (ev) { if (ev.pointerType === 'mouse') info(ev); });
      li.addEventListener('pointerleave', function (ev) { if (ev.pointerType === 'mouse') B.cacher(); });
      li.addEventListener('focus', function () { info(null); });
      li.addEventListener('blur', B.cacher);
      ol.appendChild(li);
    });
    host.insertBefore(ol, host.firstChild);
    return host;
  }

  /* ---------------------------------------------------------------- petites formes */
  /* courbe de tendance d'une tuile : pas d'axe, la dernière valeur en point */
  function tendance(host, valeurs, cls, haut) {
    var H = haut || 30;
    cadre(host, H, 'g-tend');
    var vs = valeurs.map(function (v) { return ok(v) ? v : null; });
    if (vs.filter(function (v) { return v != null; }).length < 2) return host;
    monter(host, function (W) {
      var bn = bornes([vs], false), mn = bn[0], mx = bn[1];
      if (mx === mn) { mx += 1; mn -= 1; }
      function X(i) { return 3 + (W - 6) * i / Math.max(1, vs.length - 1); }
      function Y(v) { return 4 + (H - 8) * (1 - (v - mn) / (mx - mn)); }
      var pts = [];
      vs.forEach(function (v, i) { if (v != null) pts.push([X(i), Y(v)]); });
      var svg = sv('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, class: 'g-svg', 'aria-hidden': 'true' });
      var dd = 'M' + pts.map(function (p) { return r1(p[0]) + ',' + r1(p[1]); }).join('L');
      svg.appendChild(sv('path', { d: dd + 'V' + H + 'H' + r1(pts[0][0]) + 'Z', class: 'g-aire ' + (cls || 'g-s1') }));
      svg.appendChild(sv('path', { d: dd, class: 'g-ligne g-ligne--fine ' + (cls || 'g-s1') }));
      var f = pts[pts.length - 1];
      svg.appendChild(sv('circle', { cx: r1(f[0]), cy: r1(f[1]), r: 2.75, class: 'g-point ' + (cls || 'g-s1') }));
      host.insertBefore(svg, host.firstChild);
    });
    return host;
  }
  /* jauge : la piste est un ton clair de la même couleur ; repère facultatif */
  function jauge(p, opts) {
    opts = opts || {};
    var v = Math.max(0, Math.min(1, ok(p) ? p : 0));
    var f = h('span', { class: 'g-jauge__f' + (opts.cls ? ' ' + opts.cls : '') });
    f.style.width = (v * 100) + '%';
    var j = h('div', { class: 'g-jauge', role: 'img', 'aria-label': opts.aria || null }, f);
    if (opts.repere != null && ok(opts.repere)) { var r = h('span', { class: 'g-jauge__r' }); r.style.left = (Math.max(0, Math.min(1, opts.repere)) * 100) + '%'; j.appendChild(r); }
    return j;
  }
  /* une barre découpée en parts (un tout en morceaux) : parts [{label, v, cls, txt}] ; haute = valeurs écrites dedans */
  function parts(host, o) {
    var B = cadre(host, null, 'g-parts-host');
    var tot = o.parts.reduce(function (a, x) { return a + Math.max(0, x.v); }, 0) || 1;
    var barre = h('div', { class: 'g-parts' + (o.haute ? ' g-parts--haute' : ''), role: 'img', 'aria-label': o.aria || null });
    o.parts.forEach(function (x) {
      if (!(x.v > 0)) return;
      var s = h('span', { class: 'g-parts__p ' + (x.cls || 'g-s1'), tabindex: '0' });
      s.style.flexGrow = String(x.v / tot);
      s.style.flexBasis = '0';
      if (o.haute) {
        var t = x.court || pctAxe(x.v / tot);
        s.appendChild(h('span', { class: 'g-parts__v', text: t }));
      }
      function info(e) { var p = e && e.clientX != null ? pos(host, e) : { x: s.offsetLeft + s.offsetWidth / 2, y: 0 }; B.montrer(p.x, p.y, x.label, [{ v: x.txt || String(x.v), l: pctAxe(x.v / tot), cls: x.cls || 'g-s1' }]); }
      s.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') info(e); });
      s.addEventListener('pointerdown', info);
      s.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') B.cacher(); });
      s.addEventListener('focus', function () { info(null); });
      s.addEventListener('blur', B.cacher);
      barre.appendChild(s);
    });
    host.insertBefore(barre, host.firstChild);
    if (o.legende !== false) host.insertBefore(legende(o.parts.filter(function (x) { return x.v > 0; }).map(function (x) { return { nom: x.label, cls: x.cls, sous: x.legende }; })), barre.nextSibling);
    /* masquer les valeurs qui ne tiennent pas dans leur part */
    if (o.haute) setTimeout(function () {
      Array.prototype.forEach.call(barre.querySelectorAll('.g-parts__v'), function (t) { if (t.scrollWidth > t.parentNode.clientWidth - 8) t.hidden = true; });
    }, 60);
    return host;
  }
  /* légende : un repère (carré, trait ou repère) + le nom */
  function legende(items) {
    return h('ul', { class: 'g-legende' }, items.map(function (x) {
      return h('li', null, [h('i', { class: 'g-cle g-cle--' + (x.forme || 'barre') + ' ' + (x.cls || 'g-s1'), 'aria-hidden': 'true' }), x.nom, x.sous ? h('small', { text: x.sous }) : null]);
    }));
  }

  w.PRGraph = {
    colonnes: colonnes, courbe: courbe, barres: barres, nuage: nuage, cascade: cascade, tendance: tendance, jauge: jauge, parts: parts,
    legende: legende, nettoyer: nettoyer, eurAxe: eurAxe, pctAxe: pctAxe, echelle: echelle, jourDe: jourDe, isoDe: isoDe,
    dateCourte: dateCourte, dateLongue: dateLongue, MOIS: MOIS, MOIS_L: MOIS_L
  };
})(window);
