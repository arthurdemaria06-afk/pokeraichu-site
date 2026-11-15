(function () {
  'use strict';
  var d = document;
  var ME = d.currentScript;
  var C = window.PR_CONFIG || {};
  var SITE = 'Poké-Raichu';
  var NS = 'http://www.w3.org/2000/svg';
  var EN = d.documentElement.lang === 'en';
  d.documentElement.classList.add('js');
  function tr(fr, en) { return EN ? en : fr; }
  var NB = EN ? ' ' : ' ';
  var LANGS = EN ? { JP: 'Japanese', FR: 'French', KR: 'Korean' } : { JP: 'Japonais', FR: 'Français', KR: 'Coréen' };
  var CARDS_DIR = EN ? 'cards/' : 'cartes/';
  function cTitre(c) { return EN && c.en ? c.en.titre : c.titre; }
  function cEtat(c) { return EN && c.en ? c.en.etat : c.etat.libelle; }
  function cSlug(c) { return EN && c.en ? c.en.slug : c.slug; }
  var ebay = String(C.ebay || '').trim();
  if (!/^https:\/\/([a-z0-9-]+\.)*ebay\.[a-z.]+\//i.test(ebay)) ebay = '';
  var wa = String(C.whatsapp || '').replace(/\D/g, '').replace(/^00/, '');
  var ig = String(C.instagram || '').trim().replace(/^@/, '').replace(/[^\w.]/g, '');
  var mail = String(C.email || '').trim();
  if (!/^\S+@\S+\.\S+$/.test(mail)) mail = '';
  var channel = String(C.chaine_whatsapp || '').trim();
  if (!/^https:\/\/(www\.)?whatsapp\.com\/channel\/[\w-]+/.test(channel)) channel = '';

  function all(sel, root) { return Array.prototype.slice.call((root || d).querySelectorAll(sel)); }
  function put(k, v, ses) { try { (ses ? sessionStorage : localStorage).setItem(k, v); } catch (e) {} }
  function get(k, ses) { try { return (ses ? sessionStorage : localStorage).getItem(k); } catch (e) { return null; } }
  function del(k, ses) { try { (ses ? sessionStorage : localStorage).removeItem(k); } catch (e) {} }
  function getJSON(k, ses, dflt) { try { return JSON.parse(get(k, ses) || 'null') || dflt; } catch (e) { return dflt; } }
  /* Historique (cartes vues, derniere visite, recherches) : desactivable depuis la page Confidentialite */
  function memOK() { return get('pr.memoire') !== 'non'; }
  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function el(tag, cls, text) {
    var e = d.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function phone(n) {
    if (/^33\d{9}$/.test(n)) return '+33 ' + n.slice(2, 3) + ' ' + n.slice(3).replace(/(\d{2})(?=\d)/g, '$1 ');
    return '+' + n;
  }
  function eur(p) {
    var whole = Math.abs(p - Math.round(p)) < 1e-9;
    try {
      return new Intl.NumberFormat(EN ? 'en-IE' : 'fr-FR', { style: 'currency', currency: 'EUR',
        minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(p);
    } catch (e) {
      var n = whole ? String(Math.round(p)) : p.toFixed(2);
      return EN ? '€' + n : n.replace('.', ',') + ' €';
    }
  }
  function round2(x) { return Math.round(x * 100) / 100; }
  var RM = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Coups de foudre : etat selon l'heure exacte (en cours, a venir, aucun). La generation pose l'etat du jour sur <html>,
     on le corrige ici (vente terminee sans nouvelle publication, debut dans la journee...). */
  var FLS = null;
  (function () {
    var m = /^(\d+)-(\d+)$/.exec(d.documentElement.getAttribute('data-fl') || '');
    if (m) FLS = { s: +m[1], e: +m[2] };
  })();
  function flashState() {
    if (!FLS) return 'none';
    var now = Date.now();
    return now < FLS.s ? 'soon' : now <= FLS.e ? 'on' : 'none';
  }
  function flashOn() { return flashState() === 'on'; }
  function setFlashClass() {
    var st = flashState(), h = d.documentElement;
    h.classList.toggle('is-flash', st === 'on');
    h.classList.toggle('is-flash-soon', st === 'soon');
    return st;
  }
  setFlashClass();

  /* Mesure d'audience Umami, sans cookie ni stockage : desactivee par Global Privacy Control, Do Not Track,
     le reglage de la page Confidentialite et, pour le vendeur, l'option « ne pas compter mes visites » */
  var UM = String((C.mesure_audience || {}).umami || '').trim();
  var trackOK = /^[0-9a-f-]{36}$/i.test(UM) && get('pr.mesure') !== 'non' && get('pr.moi') !== 'oui' &&
    !navigator.globalPrivacyControl && navigator.doNotTrack !== '1' &&
    (location.protocol === 'https:' || /^(127\.0\.0\.1|localhost)$/.test(location.hostname)) &&
    !/\/(gestion|salon)\.html$|\/envoi\//.test(location.pathname);
  function track(name, data) {
    if (!trackOK) return;
    var payload = { hostname: location.hostname, language: navigator.language || '', referrer: name ? '' : d.referrer,
      screen: (screen.width || 0) + 'x' + (screen.height || 0), title: d.title, url: location.pathname + location.search, website: UM };
    if (name) { payload.name = name; if (data) payload.data = data; }
    try {
      fetch('https://cloud.umami.is/api/send', { method: 'POST', body: JSON.stringify({ type: 'event', payload: payload }),
        headers: { 'Content-Type': 'application/json' }, keepalive: true, credentials: 'omit', mode: 'cors' }).catch(function () {});
    } catch (e) {}
  }
  track();

  /* 0. Langue choisie, memorisee : au premier passage d'une visite, on rouvre le site dans cette langue */
  var LKEY = 'pokeraichu.lang', LSEEN = 'pokeraichu.lang.vu';
  all('[data-lang-link]').forEach(function (a) {
    a.addEventListener('click', function () { put(LKEY, a.getAttribute('hreflang')); put(LSEEN, '1', true); });
  });
  (function () {
    var want = get(LKEY), seen = get(LSEEN, true);
    put(LSEEN, '1', true);
    if (!want || seen || want === d.documentElement.lang) return;
    var alt = d.querySelector('[data-lang-link][hreflang="' + want + '"]');
    if (!alt || alt.getAttribute('aria-current')) return;
    var qs = '';
    if (d.getElementById('catalogue')) { var p0 = new URLSearchParams(location.search); p0.delete('pk'); qs = p0.toString(); }
    location.replace(alt.getAttribute('href').split('?')[0] + (qs ? '?' + qs : '') + location.hash);
  })();

  /* 1. Contact : WhatsApp, sinon Instagram, sinon e-mail, sinon page Contact */
  function contactLink(msg, ref) {
    if (wa) return { href: 'https://wa.me/' + wa + '?text=' + encodeURIComponent(msg), ext: true };
    if (ig) return { href: 'https://ig.me/m/' + ig, ext: true };
    if (mail) return { href: 'mailto:' + mail + '?subject=' + encodeURIComponent(SITE + (ref ? tr(' · réf. ', ' · ref. ') + ref : '')) +
      '&body=' + encodeURIComponent(msg), ext: false };
    return null;
  }
  function setContact(a, msg, ref) {
    var l = contactLink(msg, ref);
    if (!l) return;
    a.href = l.href;
    if (l.ext) { a.target = '_blank'; a.rel = 'noopener'; } else { a.removeAttribute('target'); }
  }
  all('[data-contact]').forEach(function (a) {
    setContact(a, a.getAttribute('data-msg') || tr('Bonjour, je vous écris depuis ' + SITE + '.', 'Hello, I am writing from ' + SITE + '.'), a.getAttribute('data-ref'));
  });

  /* Coups de foudre : message au prix flash pendant la vente, compte a rebours, bascule a l'heure exacte */
  var flashTimer;
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtLeft(ms, long) {
    var m = Math.max(0, Math.ceil(ms / 60000)), dd = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mi = m % 60;
    if (EN) return dd ? dd + 'd ' + p2(h) + 'h' + (long ? ' ' + p2(mi) + 'm' : '') : h ? h + 'h ' + p2(mi) + 'm' : mi + 'm';
    return dd ? dd + NB + 'j ' + p2(h) + NB + 'h' + (long ? ' ' + p2(mi) + NB + 'min' : '') : h ? h + NB + 'h ' + p2(mi) : mi + NB + 'min';
  }
  function tickFlash() {
    clearTimeout(flashTimer);
    var st = flashState();
    all('[data-fl-count]').forEach(function (e) {
      var long = e.hasAttribute('data-fl-long'), left;
      if (st === 'on') {
        left = fmtLeft(FLS.e - Date.now(), long);
        e.textContent = long ? tr('Fin dans ', 'Ends in ') + left : tr('plus que ', '') + left + (EN ? ' left' : '');
      } else if (st === 'soon') {
        left = fmtLeft(FLS.s - Date.now(), long);
        e.textContent = long ? tr('Début dans ', 'Starts in ') + left : tr('début dans ', 'starts in ') + left;
      } else e.textContent = '';
    });
    if (st !== 'none') flashTimer = setTimeout(tickFlash, 30000);
  }
  function applyFlash() {
    var st = setFlashClass();
    all('[data-msg-flash]').forEach(function (a) {
      if (a.getAttribute('data-status-done')) return;
      if (!a.hasAttribute('data-msg-base')) a.setAttribute('data-msg-base', a.getAttribute('data-msg') || '');
      a.setAttribute('data-msg', st === 'on' ? a.getAttribute('data-msg-flash') : a.getAttribute('data-msg-base'));
      setContact(a, a.getAttribute('data-msg'), a.getAttribute('data-ref'));
    });
    tickFlash();
    if (FLS && st !== 'none') {
      var wait = (st === 'soon' ? FLS.s : FLS.e + 1000) - Date.now();
      if (wait > 0 && wait < 20 * 864e5) setTimeout(function () { applyFlash(); d.dispatchEvent(new Event('pr:flash')); }, wait + 50);
    }
  }
  applyFlash();

  /* Recherche de l'en-tete : suggestions pendant la frappe (index charge au premier clic dans le champ),
     fleches pour parcourir, Entree pour ouvrir la carte choisie ou le catalogue filtre */
  var hsForm = d.querySelector('[data-hsearch]');
  if (hsForm) initHeaderSearch(hsForm);

  function initHeaderSearch(form) {
    var input = form.querySelector('#hs-q'), pop = form.querySelector('[data-hs-pop]'), list = form.querySelector('#hs-list');
    var foot = form.querySelector('[data-hs-foot]'), status = form.querySelector('[data-hs-status]');
    var root = new URL(form.getAttribute('data-root'), location.href);
    var idx = null, loading = null, active = -1, opts = [], timer, note = null;
    var catQ = d.getElementById('catalogue') ? d.getElementById('f-q') : null;
    function load() {
      if (!loading) {
        loading = fetch(form.getAttribute('data-index'), { credentials: 'same-origin' }).then(function (r) {
          if (!r.ok) throw new Error(r.status);
          return r.json();
        }).then(function (j) { return liveSoon().then(function () { return j; }); }).then(function (j) {
          var v = {};
          idx = j.cartes.map(function (r) {
            var o = { u: r[0], n: r[1], x: r[2], p: r[3], s: r[4] + ' ' + synonymsOf(r[4]), i: r[5], k: r[6], f: r[7] };
            o.nn = norm(o.n);
            var lr = /(?:^|\s)ref ([a-z0-9]{1,12})(?:\s|$)/.exec(r[4] || ''), lpx = lr ? livePx(lr[1]) : null;
            if (lpx !== null && o.p && !/^(sur demande|on request)$/i.test(o.p)) o.p = eur(lpx);
            o.s.split(/\s+/).forEach(function (w) { if (w.length > 2) v[w] = 1; });
            return o;
          });
          idx.vocab = Object.keys(v);
          return idx;
        }).catch(function () { loading = null; return null; });
      }
      return loading;
    }
    function search(q) {
      var toks = normQuery(q).split(/\s+/).filter(Boolean);
      if (!toks.length) return null;
      var plan = toks.map(function (t) {
        if (idx.some(function (o) { return o.s.indexOf(t) !== -1; })) return { t: t, alts: null };
        var tol = tolerance(t), alts = [];
        if (tol) idx.vocab.forEach(function (w) { if (dist(t, w, tol) <= tol) alts.push(w); });
        return { t: t, alts: alts };
      });
      var res = [];
      idx.forEach(function (o) {
        var sc = 0;
        var ok = plan.every(function (p) {
          if (!p.alts) {
            var at = o.s.indexOf(p.t);
            if (at === -1) return false;
            sc += (o.nn.indexOf(p.t) !== -1 ? 3 : 1) + (o.nn.indexOf(p.t) === 0 ? 2 : 0);
            return true;
          }
          var hit = p.alts.some(function (w) { return (' ' + o.s + ' ').indexOf(' ' + w) !== -1; });
          if (hit) sc += 1;
          return hit;
        });
        if (ok) res.push({ o: o, sc: sc });
      });
      res.sort(function (a, b) { return b.sc - a.sc || a.o.k - b.o.k; });
      return { res: res, toks: toks, fuzzy: plan.filter(function (p) { return p.alts && p.alts.length; }) };
    }
    function closestWord(t) {
      var best = null, bd = 4;
      idx.vocab.forEach(function (w) { var dd = dist(t, w, 3); if (dd < bd) { bd = dd; best = w; } });
      return best;
    }
    function catUrl(q) { return form.action.split('?')[0] + '?q=' + encodeURIComponent(q.trim()); }
    function open() { pop.hidden = false; input.setAttribute('aria-expanded', 'true'); }
    function close() {
      pop.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      active = -1;
    }
    function setActive(i) {
      active = i;
      opts.forEach(function (o, k) { o.parentNode.classList.toggle('is-active', k === i); o.setAttribute('aria-selected', String(k === i)); });
      if (i >= 0 && opts[i]) {
        input.setAttribute('aria-activedescendant', opts[i].id);
        if (opts[i].scrollIntoView) opts[i].scrollIntoView({ block: 'nearest' });
      } else input.removeAttribute('aria-activedescendant');
    }
    function render(r, q) {
      list.textContent = ''; foot.textContent = ''; opts = [];
      if (note) { note.remove(); note = null; }
      setActive(-1);
      if (!r) { close(); status.textContent = ''; return; }
      var n = r.res.length, on = flashOn();
      var fz = r.fuzzy.filter(function (p) { return p.alts.indexOf(p.t) === -1; });
      if (n && fz.length) {
        note = el('p', 'hs-note', tr('Résultats approchés pour ', 'Approximate results for ') + fz.map(function (p) { return '« ' + p.t + ' »'; }).join(', '));
        pop.insertBefore(note, list);
      }
      r.res.slice(0, 6).forEach(function (x, i) {
        var o = x.o, li = el('li', 'hs-opt' + (o.i ? ' hs-opt--img' : ''));
        li.setAttribute('role', 'none');
        var a = el('a');
        a.id = 'hs-o-' + i;
        a.setAttribute('role', 'option');
        a.setAttribute('aria-selected', 'false');
        a.href = new URL(o.u, root).href;
        a.tabIndex = -1;
        if (o.i) {
          var im = el('img', 'hs-opt__img');
          im.src = new URL(o.i, root).href; im.alt = ''; im.width = 36; im.height = 50; im.loading = 'lazy'; im.decoding = 'async';
          a.appendChild(im);
        }
        a.appendChild(el('span', 'hs-opt__name', o.n));
        var pr = el('span', 'hs-opt__price');
        if (o.f && on) { pr.appendChild(el('span', 'price--flash', o.f)); pr.appendChild(el('s', '', o.p)); }
        else pr.appendChild(el('span', /^(sur demande|on request)$/i.test(o.p) ? 'price--ask' : '', o.p));
        a.appendChild(pr);
        a.appendChild(el('span', 'hs-opt__sub', o.x));
        li.appendChild(a);
        a.addEventListener('click', function () { track('recherche_entete', { q: q.slice(0, 40), choix: o.n.slice(0, 60) }); });
        list.appendChild(li);
        opts.push(a);
      });
      if (n) {
        var more = el('a', '', n > 6 ? tr('Voir les ' + n + ' résultats dans le catalogue', 'See all ' + n + ' results in the catalogue')
          : tr('Ouvrir dans le catalogue', 'Open in the catalogue'));
        more.href = catUrl(q);
        foot.appendChild(more);
      } else {
        var fixed = r.toks.map(function (t) { return idx.some(function (o) { return o.s.indexOf(t) !== -1; }) ? t : (closestWord(t) || t); }).join(' ');
        foot.appendChild(el('span', '', tr('Aucune carte trouvée.', 'No card found.')));
        if (fixed !== r.toks.join(' ')) {
          var b = el('button', 'linkbtn', tr('Vouliez-vous dire « ' + fixed + ' » ?', 'Did you mean “' + fixed + '”?'));
          b.type = 'button';
          b.addEventListener('mousedown', function (e) { e.preventDefault(); });
          b.addEventListener('click', function () { input.value = fixed; run(); input.focus(); });
          foot.appendChild(b);
        }
        var ask = el('a', '', tr('On la cherche pour vous au Japon', 'We’ll look for it in Japan'));
        ask.href = form.getAttribute('data-search-page') + '?q=' + encodeURIComponent(q.trim());
        foot.appendChild(ask);
      }
      status.textContent = n ? tr(n + (n > 1 ? ' cartes trouvées' : ' carte trouvée') + ', flèches haut et bas pour parcourir.',
        n + (n > 1 ? ' cards found' : ' card found') + ', use the up and down arrows.') : tr('Aucune carte trouvée.', 'No card found.');
      open();
    }
    function run() {
      var q = input.value;
      if (!q.trim()) { render(null); return; }
      load().then(function (ix) { if (ix && input.value === q) render(search(q), q); });
    }
    input.addEventListener('focus', function () { load(); if (input.value.trim() && pop.hidden) run(); });
    input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(run, 90); });
    input.addEventListener('blur', function () { setTimeout(close, 120); });
    pop.addEventListener('mousedown', function (e) { e.preventDefault(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (pop.hidden) { run(); return; }
        if (!opts.length) return;
        setActive(e.key === 'ArrowDown' ? (active + 1) % opts.length : (active <= 0 ? opts.length - 1 : active - 1));
      } else if (e.key === 'Enter' && active >= 0 && opts[active]) {
        e.preventDefault();
        opts[active].click();
      } else if (e.key === 'Escape') {
        if (!pop.hidden) { e.preventDefault(); close(); }
        else if (input.value) { e.preventDefault(); input.value = ''; render(null); }
      }
    });
    form.addEventListener('submit', function (e) {
      var q = input.value.trim();
      if (!q) { e.preventDefault(); input.focus(); return; }
      track('recherche_entete', { q: q.slice(0, 40) });
      if (catQ) {
        /* deja sur le catalogue : on filtre sur place */
        e.preventDefault();
        catQ.value = q;
        catQ.dispatchEvent(new Event('input', { bubbles: true }));
        close();
        input.blur();
        var grid = d.querySelector('[data-grid]');
        if (grid) grid.scrollIntoView({ block: 'start', behavior: RM ? 'auto' : 'smooth' });
      }
    });
  }

  /* Statuts : reservees (config.js « reservees » + statuts en direct) et vendues en direct (Gist) */
  var RES = (Array.isArray(C.reservees) ? C.reservees : []).map(function (r) { return String(r).trim().toUpperCase(); });
  var SOLD = [];
  function isRes(ref) { return RES.indexOf(String(ref || '').toUpperCase()) !== -1; }
  function isSold(ref) { return SOLD.indexOf(String(ref || '').toUpperCase()) !== -1; }
  /* Lot : vendu ou reserve des qu'une de ses cartes l'est ; une carte suit le statut des lots qui la contiennent */
  function linked(node) {
    return ((node.getAttribute('data-parts') || '') + ' ' + (node.getAttribute('data-in-lots') || '')).split(/\s+/).filter(Boolean);
  }
  function soldNode(node, ref) { return isSold(ref) || linked(node).some(isSold); }
  function resNode(node, ref) { return !soldNode(node, ref) && (isRes(ref) || linked(node).some(isRes)); }
  var lot = d.querySelector('[data-lot-ref]');
  function sticker(art, text) {
    var sk = art.querySelector('[data-sticker]');
    if (!sk) { sk = el('span', 'sticker'); sk.setAttribute('data-sticker', ''); art.appendChild(sk); }
    sk.textContent = text;
    sk.hidden = false;
  }
  function applyStatuses() {
    if (!RES.length && !SOLD.length && !d.querySelector('.tile.is-reserved, .tile.is-sold, .pocket.is-reserved, .pocket.is-sold')) return applyLot();
    all('.tile[data-ref], .pocket[data-ref]').forEach(function (t) {
      var ref = t.getAttribute('data-ref'), sold = soldNode(t, ref), res = resNode(t, ref);
      if (res !== t.classList.contains('is-reserved')) t.classList.toggle('is-reserved', res);
      if (sold !== t.classList.contains('is-sold')) t.classList.toggle('is-sold', sold);
      var art = t.querySelector('.art');
      if (art && (res || sold)) sticker(art, sold ? tr('Vendue', 'Sold') : tr('Réservée', 'Reserved'));
      var st = t.querySelector('[data-status-text]');
      if (st && (res || sold)) st.textContent = sold ? tr('Vendue', 'Sold') : tr('Réservée', 'Reserved');
      var pk = t.querySelector('[data-pick]');
      if (pk && sold) pk.hidden = true;
    });
    applyLot();
  }
  function applyLot() {
    if (!lot || lot.hasAttribute('data-gone')) return;
    var ref = lot.getAttribute('data-lot-ref'), sold = soldNode(lot, ref), res = resNode(lot, ref);
    if (!res && !sold) return;
    lot.classList.add(sold ? 'is-sold' : 'is-reserved');
    var ls = lot.querySelector('[data-sticker]');
    if (ls) { ls.textContent = sold ? tr('Vendue', 'Sold') : tr('Réservée', 'Reserved'); ls.hidden = false; }
    var lst = lot.querySelector('[data-status-text]');
    if (lst) lst.textContent = sold ? tr('Vendue', 'Sold') : tr('Réservée', 'Reserved');
    all('[data-msg-reserved]').forEach(function (a) {
      if (a.getAttribute('data-status-done')) return;
      a.setAttribute('data-status-done', '1');
      a.setAttribute('data-msg', a.getAttribute('data-msg-reserved'));
      a.textContent = a.getAttribute('data-label-reserved');
      setContact(a, a.getAttribute('data-msg'), a.getAttribute('data-ref'));
    });
    all('[data-alert-reserved]').forEach(function (b) { b.hidden = false; });
    if (sold) all('[data-pick-main]').forEach(function (b) { b.hidden = true; });
  }
  applyStatuses();
  var LIVE = String(C.statuts_url || '').trim();
  if (!/^https:\/\/gist\.githubusercontent\.com\/[\w-]+\/[0-9a-f]+\/raw\/(?:[0-9a-f]+\/)?[\w.-]+$/i.test(LIVE)) LIVE = '';
  var liveReady = LIVE ? fetch(LIVE + '?t=' + Math.floor(Date.now() / 60000), { cache: 'no-store', credentials: 'omit' })
    .then(function (r) { return r.ok ? r.json() : null; }).then(function (s) {
      if (!s || typeof s !== 'object') return;
      (Array.isArray(s.reservees) ? s.reservees : []).forEach(function (r) { r = String(r).trim().toUpperCase(); if (RES.indexOf(r) === -1) RES.push(r); });
      SOLD = (Array.isArray(s.vendues) ? s.vendues : []).map(function (r) { return String(r).trim().toUpperCase(); });
      applyStatuses();
      setLivePrices(s.prix);
      applyLivePrices();
    }).catch(function () {}) : Promise.resolve();

  /* Prix en direct : champ « prix » du meme Gist ({ "095": 250 }), modifiable depuis /gestion.html sans republier.
     Vignettes, fiche, barre de reservation, messages, donnees Google de la fiche, lots, fourchettes, catalogue,
     recherche, selection et etiquettes suivent. Les cartes d'un coup de foudre annonce gardent leurs prix publies
     tant que la vente est a venir ou en cours (prix de reference). Les apercus de liens gardent le prix publie. */
  var LPX = {}, LPX_N = 0, FLREFS = {};
  ((C.coups_de_foudre && C.coups_de_foudre.cartes) || []).forEach(function (x) { if (x && x.ref) FLREFS[String(x.ref).trim().toUpperCase()] = 1; });
  function setLivePrices(o) {
    LPX = {}; LPX_N = 0;
    if (!o || typeof o !== 'object' || Array.isArray(o)) return;
    Object.keys(o).forEach(function (k) {
      var r = String(k).trim().toUpperCase(), v = +o[k];
      if (/^[A-Z0-9]{1,12}$/.test(r) && isFinite(v) && v > 0 && v < 1e6) { LPX[r] = round2(v); LPX_N++; }
    });
  }
  function livePx(ref) {
    var r = String(ref || '').trim().toUpperCase();
    if (!Object.prototype.hasOwnProperty.call(LPX, r) || (FLREFS[r] && flashState() !== 'none')) return null;
    return LPX[r];
  }
  function liveSoon() { return Promise.race([liveReady, new Promise(function (ok) { setTimeout(ok, 2500); })]); }
  function msgPrice(m, p) { return String(m).replace(/^((?:Prix|Price)\s?:\s?).+$/m, function (x, lead) { return lead + eur(p); }); }
  function setText(e, t) { if (e && e.textContent !== t) e.textContent = t; }
  function applyLivePrices() {
    if (!LPX_N) return;
    var moved = false;
    /* vignettes (data-price : tri et filtres du catalogue) et pochettes du classeur */
    all('.tile[data-ref], .pocket[data-ref]').forEach(function (t) {
      var p = livePx(t.getAttribute('data-ref'));
      if (p === null || t.getAttribute('data-price') === '') return;
      if (t.hasAttribute('data-price') && t.getAttribute('data-price') !== String(p)) { t.setAttribute('data-price', String(p)); moved = true; }
      setText(t.querySelector('.price:not(.price--flash):not(.price--ask)'), eur(p));
    });
    /* fiche : prix, livres et dollars, barre de reservation, messages, donnees Google */
    var pref = lot && !lot.hasAttribute('data-gone') ? lot.getAttribute('data-lot-ref') : null, lp = pref ? livePx(pref) : null;
    if (lp !== null) {
      var pp = lot.querySelector('.product__price:not(.price--ask):not(.price--flash)');
      if (pp) {
        setText(pp, eur(lp));
        var fxe = pp.parentNode.querySelector('.fx');
        if (fxe && typeof fx === 'function') setText(fxe, fx(lp));
      }
      all('[data-buybar] .price').forEach(function (e) { setText(e, eur(lp)); });
      all('[data-contact][data-ref], [data-copy-msg]').forEach(function (a) {
        var r = a.getAttribute('data-ref');
        if (r && r.toUpperCase() !== pref.toUpperCase()) return;
        ['data-msg', 'data-msg-base', 'data-copy-msg'].forEach(function (at) {
          var v = a.getAttribute(at);
          if (v) { var nv = msgPrice(v, lp); if (nv !== v) a.setAttribute(at, nv); }
        });
        if (a.hasAttribute('data-contact')) setContact(a, a.getAttribute('data-msg'), r);
      });
      all('script[type="application/ld+json"]').forEach(function (sc) {
        try {
          var j = JSON.parse(sc.textContent), hit = false;
          (Array.isArray(j) ? j : [j]).forEach(function (o) {
            if (o && o['@type'] === 'Product' && o.offers && !Array.isArray(o.offers) && o.offers.price !== undefined) { o.offers.price = lp.toFixed(2); hit = true; }
          });
          if (hit) sc.textContent = JSON.stringify(j);
        } catch (e) {}
      });
    }
    /* lot : prix des cartes aussi vendues separement */
    if (lot && lot.getAttribute('data-parts')) {
      var parts = lot.getAttribute('data-parts').split(/\s+/).filter(Boolean);
      all('.callout p', lot).forEach(function (pe) {
        var links = all('a[href]', pe);
        if (links.length !== parts.length) return;
        links.forEach(function (a, k) {
          var p = livePx(parts[k]), tn = a.nextSibling;
          if (p === null || !tn || tn.nodeType !== 3 || !/^\s*\([^)]*€[^)]*\)/.test(tn.nodeValue)) return;
          tn.nodeValue = tn.nodeValue.replace(/\([^)]*\)/, '(' + eur(p) + ')');
        });
      });
    }
    /* fourchette « Prix » des pages Pokemon, extensions et collections, si toutes les fiches sont dans la grille */
    if (moved) all('dl.facts').forEach(function (dl) {
      var dd = null, n = 0;
      all('div', dl).forEach(function (row) {
        var k = row.querySelector('dt'), v = row.querySelector('dd');
        if (!k || !v) return;
        k = k.textContent.trim().toLowerCase();
        if (k === 'prix' || k === 'prices' || k === 'price') dd = v;
        if (k === 'fiches' || k === 'listings') n = parseInt(v.textContent, 10) || 0;
      });
      var grid = d.querySelector('main .grid');
      if (!dd || !n || !grid) return;
      var ps = all('.tile[data-price]', grid).map(function (t) { return t.getAttribute('data-price'); });
      if (ps.length !== n) return;
      ps = ps.filter(function (x) { return x !== ''; }).map(parseFloat).filter(function (x) { return isFinite(x); });
      if (!ps.length) return;
      var lo = Math.min.apply(null, ps), hi = Math.max.apply(null, ps);
      setText(dd, lo === hi ? eur(lo) : eur(lo) + tr(' à ', ' to ') + eur(hi));
    });
    /* calculateur « importer soi-meme ou acheter ici » */
    all('option[data-prix]').forEach(function (o) { var p = livePx(o.value); if (p !== null) o.setAttribute('data-prix', String(p)); });
    if (moved) d.dispatchEvent(new Event('pr:prices'));
  }
  function livePatchStock(data) {
    if (data && data.cartes && LPX_N) data.cartes.forEach(function (c) {
      var p = livePx(c.ref);
      if (p !== null && c.prix_eur !== null && c.prix_eur !== undefined) c.prix_eur = p;
    });
    return data;
  }

  /* Parcours : fiches voisines, retour a la liste filtree, cartes vues recemment */
  d.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a.tile__link') : null;
    var g = a && a.closest('.grid');
    if (!g) return;
    var list = all('.tile', g).filter(function (t) { return !t.hidden; }).map(function (t) {
      var l = t.querySelector('a.tile__link'); return l ? l.href.split('#')[0] : '';
    }).filter(Boolean);
    put('pr.nav', JSON.stringify({ list: list }), true);
    if (d.getElementById('catalogue')) { put('pr.cat.url', location.href, true); put('pr.cat.y', String(Math.round(window.scrollY || 0)), true); }
  });
  var lastCat = get('pr.cat.url', true);
  if (lastCat) all('[data-cat-link]').forEach(function (a) {
    try { if (new URL(lastCat).pathname === new URL(a.href).pathname) a.href = lastCat; } catch (x) {}
  });
  var pager = d.querySelector('[data-pager]');
  if (pager) {
    var nav = getJSON('pr.nav', true, {});
    var here = location.href.split('#')[0].split('?')[0];
    var plist = (nav.list || []).map(function (h) { return h.split('?')[0]; });
    var at = plist.indexOf(here);
    if (at !== -1 && plist.length > 1) {
      var mk = function (i, label, rel) { var a = el('a', 'pager__a', label); a.href = plist[i]; a.rel = rel; return a; };
      if (at > 0) pager.appendChild(mk(at - 1, tr('← Précédente', '← Previous'), 'prev'));
      pager.appendChild(el('span', 'pager__n', (at + 1) + ' / ' + plist.length));
      if (at < plist.length - 1) pager.appendChild(mk(at + 1, tr('Suivante →', 'Next →'), 'next'));
      pager.hidden = false;
    }
  }
  if (lot && memOK()) {
    var r0 = lot.getAttribute('data-lot-ref');
    put('pr.vus', JSON.stringify([r0].concat(getJSON('pr.vus', false, []).filter(function (r) { return r !== r0; })).slice(0, 12)));
  }

  /* Bouton WhatsApp flottant : sur mobile, il apparait des qu'on fait defiler la page (il ne masque pas le haut) */
  var fl = d.querySelector('.wa-float');
  if (fl && window.matchMedia) {
    var mqf = window.matchMedia('(max-width: 859px)');
    var flTick = 0;
    var flSync = function () { flTick = 0; fl.classList.toggle('is-off', mqf.matches && (window.scrollY || 0) <= 320); };
    window.addEventListener('scroll', function () { if (!flTick) flTick = requestAnimationFrame(flSync); }, { passive: true });
    if (mqf.addEventListener) mqf.addEventListener('change', flSync);
    flSync();
  }

  /* Photos de la fiche : vignettes, defilement au doigt, zoom plein ecran */
  all('[data-gallery]').forEach(function (g) {
    var track = g.querySelector('[data-track]');
    var thumbs = all('[data-goto]', g);
    var shots = all('[data-zoom]', g);
    var cur = 0;
    function go(i) {
      i = Math.max(0, Math.min(shots.length - 1, i));
      track.scrollTo({ left: i * track.clientWidth, behavior: RM ? 'auto' : 'smooth' });
    }
    thumbs.forEach(function (b) { b.addEventListener('click', function () { go(+b.getAttribute('data-goto')); }); });
    var tick = 0;
    track.addEventListener('scroll', function () {
      if (tick) return;
      tick = requestAnimationFrame(function () {
        tick = 0;
        cur = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
        thumbs.forEach(function (b, k) { if (k === cur) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
      });
    }, { passive: true });
    track.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(cur + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(cur - 1); }
    });
    if (typeof HTMLDialogElement !== 'function') return;
    var dlg = el('dialog', 'zoom');
    dlg.setAttribute('aria-label', tr('Photos en grand', 'Enlarged photos'));
    var close = el('button', 'zoom__close', tr('Fermer', 'Close'));
    close.type = 'button';
    var strip = el('div', 'zoom__track');
    shots.forEach(function (a) {
      var im = el('img');
      var src = a.querySelector('img:not(.lqip)');
      im.alt = src ? src.alt : '';
      if (src) { im.setAttribute('width', src.getAttribute('width')); im.setAttribute('height', src.getAttribute('height')); }
      im.decoding = 'async';
      im.setAttribute('data-src', a.getAttribute('href'));
      strip.appendChild(im);
    });
    dlg.appendChild(close);
    dlg.appendChild(strip);
    d.body.appendChild(dlg);
    close.addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg || e.target === strip) dlg.close(); });
    dlg.addEventListener('close', function () { var a = shots[cur]; if (a) a.focus({ preventScroll: true }); });
    shots.forEach(function (a, k) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        all('img', strip).forEach(function (im) { if (!im.getAttribute('src')) im.src = im.getAttribute('data-src'); });
        cur = k;
        dlg.showModal();
        strip.scrollLeft = k * strip.clientWidth;
        close.focus();
      });
    });
  });

  function helpText(ref) {
    var after = ref ? tr(' Le paiement se fait ensuite sur eBay.', ' Payment then takes place on eBay.') : '';
    if (wa) return tr('Ouvre WhatsApp avec un message prêt à envoyer', 'Opens WhatsApp with a ready-to-send message') +
      (ref ? tr(', référence ' + ref + ' incluse.', ', reference ' + ref + ' included.') : '.') + after;
    if (ig) return tr('Ouvre Instagram en message privé.', 'Opens Instagram direct messages.') +
      (ref ? tr(' Indiquez la référence ' + ref + '.', ' Mention reference ' + ref + '.') : '') + after;
    if (mail) return tr('Ouvre votre messagerie', 'Opens your e-mail') + (ref ? tr(' avec la référence ' + ref + '.', ' with reference ' + ref + '.') : '.') + after;
    return '';
  }
  all('[data-cta-help]').forEach(function (p) {
    var t = helpText(p.getAttribute('data-ref'));
    if (t) { p.textContent = t; p.hidden = false; }
  });
  all('[data-ebay]').forEach(function (box) {
    if (!ebay) { box.hidden = true; return; }
    var a = box.querySelector('a');
    if (a) { a.href = ebay; a.target = '_blank'; a.rel = 'noopener'; }
    box.hidden = false;
  });
  /* Evaluations eBay reelles (config.js) et lien d'evaluation (page de certificat d'envoi) */
  var EV = C.ebay_evaluations || {};
  var evN = parseInt(EV.nombre, 10) || 0, evP = parseFloat(EV.pourcentage) || 0;
  all('[data-ebay-eval]').forEach(function (li) {
    if (!evN || !evP) return;
    var s = li.querySelector('span');
    var txt = tr('eBay : ' + String(evP).replace('.', ',') + NB + '% d’évaluations positives (' + evN + ')', 'eBay: ' + evP + '% positive feedback (' + evN + ')');
    if (ebay) { var a = el('a', '', txt); a.href = ebay; a.target = '_blank'; a.rel = 'noopener'; s.appendChild(a); } else s.textContent = txt;
    li.hidden = false;
  });
  all('[data-ebay-feedback]').forEach(function (a) {
    if (!ebay) return;
    a.href = ebay; a.target = '_blank'; a.rel = 'noopener'; a.hidden = false;
  });
  /* Chaine WhatsApp « Arrivages » */
  all('[data-channel-wa]').forEach(function (li) {
    if (!channel) return;
    var a = li.querySelector('a'); a.href = channel; a.target = '_blank'; a.rel = 'noopener'; li.hidden = false;
  });
  all('[data-channel-cta]').forEach(function (box) {
    if (!channel) return;
    var a = box.matches('a') ? box : box.querySelector('[data-channel-link]');
    if (a) { a.href = channel; a.target = '_blank'; a.rel = 'noopener'; a.addEventListener('click', function () { track('chaine-whatsapp'); }); }
    box.hidden = false;
  });
  /* Changement de langue : on garde les filtres du catalogue */
  if (d.getElementById('catalogue')) {
    var keepQs = function () {
      all('[data-lang-link]').forEach(function (a) {
        if (a.getAttribute('aria-current')) return;
        var p = new URLSearchParams(location.search);
        p.delete('pk');
        var qs = p.toString();
        a.href = a.getAttribute('href').split('?')[0] + (qs ? '?' + qs : '');
      });
    };
    keepQs();
    window.addEventListener('popstate', keepQs);
    d.addEventListener('change', keepQs);
    d.addEventListener('input', function () { setTimeout(keepQs, 200); });
    d.addEventListener('click', function () { setTimeout(keepQs, 0); });
  }

  /* 2. Coordonnees (pied de page, Contact, mentions legales) */
  var ch = {
    whatsapp: wa ? { href: 'https://wa.me/' + wa, text: phone(wa) } : null,
    instagram: ig ? { href: 'https://www.instagram.com/' + ig + '/', text: '@' + ig } : null,
    email: mail ? { href: 'mailto:' + mail, text: mail } : null
  };
  all('[data-channel]').forEach(function (box) {
    var c = ch[box.getAttribute('data-channel')];
    if (!c) { box.hidden = true; return; }
    var a = box.querySelector('a');
    if (a) {
      a.href = c.href;
      if (!/^mailto:/.test(c.href)) { a.target = '_blank'; a.rel = 'noopener'; }
    }
    all('[data-channel-text]', box).forEach(function (t) { t.textContent = c.text; });
    box.hidden = false;
  });
  all('[data-no-channel]').forEach(function (box) { box.hidden = !!(wa || ig || mail); });
  var L = C.legal || {};
  all('[data-legal]').forEach(function (e) {
    var v = String(L[e.getAttribute('data-legal')] || '').trim();
    if (v) {
      e.textContent = v; e.classList.remove('todo');
      /* une mention renseignée dans config.js fait apparaître sa ligne et retire la mention de repli */
      var box = e.closest('.legal-empty');
      if (box) {
        box.classList.remove('legal-empty');
        var dt = box.previousElementSibling;
        if (box.tagName === 'DD' && dt && dt.classList.contains('legal-empty')) dt.classList.remove('legal-empty');
      }
      all('[data-legal-fallback="' + e.getAttribute('data-legal') + '"]').forEach(function (f) { f.hidden = true; });
    }
  });

  /* 3. Petits plus : sceau, lien court, partage, copie du message, barre de reservation */
  all('[data-zap]').forEach(function (e) {
    e.addEventListener('click', function () { e.classList.remove('zap'); void e.offsetWidth; e.classList.add('zap'); });
  });
  all('[data-shortlink]').forEach(function (e) {
    try { e.textContent = new URL(e.getAttribute('data-shortlink'), d.baseURI).href.replace(/^https?:\/\//, ''); } catch (x) {}
  });
  all('[data-share]').forEach(function (b) {
    var canShare = typeof navigator.share === 'function';
    var canCopy = !!(navigator.clipboard && window.isSecureContext);
    if (!canShare && !canCopy) return;
    b.hidden = false;
    b.addEventListener('click', function () {
      var url = location.href.split('#')[0];
      track('partage', { ref: lot ? lot.getAttribute('data-lot-ref') : '' });
      if (canShare) { navigator.share({ title: b.getAttribute('data-title') || d.title, url: url }).catch(function () {}); return; }
      navigator.clipboard.writeText(url).then(function () {
        b.textContent = tr('Lien copié', 'Link copied');
        setTimeout(function () { b.textContent = tr('Partager', 'Share'); }, 2000);
      });
    });
  });
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (ok, ko) {
      var ta = el('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.className = 'sr-only';
      d.body.appendChild(ta); ta.select();
      try { d.execCommand('copy') ? ok() : ko(); } catch (e) { ko(e); }
      ta.remove();
    });
  }
  function copyBtn(b, text) {
    var lbl = b.textContent;
    copyText(text).then(function () {
      b.textContent = tr('Message copié', 'Message copied');
      track('copier-message', { ref: lot ? lot.getAttribute('data-lot-ref') : '' });
      setTimeout(function () { b.textContent = lbl; }, 2200);
    }).catch(function () {});
  }
  all('[data-copy-msg]').forEach(function (b) {
    b.addEventListener('click', function () {
      var a = d.querySelector('[data-main-cta] a[data-contact]');
      copyBtn(b, (a && a.getAttribute('data-msg')) || b.getAttribute('data-copy-msg'));
    });
  });
  var mainCta = d.querySelector('[data-main-cta]');
  var bar = d.querySelector('[data-buybar]');
  if (mainCta && bar && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      es.forEach(function (e) { bar.classList.toggle('is-hidden', e.isIntersecting); });
    }).observe(mainCta);
  }

  /* Boutique (config.js) : adresse, horaires, donnees pour Google */
  var B = C.boutique || {};
  var bAdr = String(B.adresse || '').trim();
  if (bAdr) {
    var bFull = bAdr + ', ' + [String(B.code_postal || '').trim(), String(B.ville || '').trim() || 'Mandelieu-la-Napoule'].filter(Boolean).join(' ');
    var bHor = String(B.horaires || '').trim();
    all('[data-boutique]').forEach(function (b) { b.hidden = false; });
    all('[data-boutique-adresse]').forEach(function (e) {
      e.textContent = bFull + ' · ';
      var m = el('a', '', tr('Itinéraire', 'Directions'));
      m.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(SITE + ' ' + bFull);
      m.target = '_blank'; m.rel = 'noopener';
      e.appendChild(m);
    });
    all('[data-boutique-horaires]').forEach(function (e) { e.textContent = bHor; e.hidden = !bHor; });
    all('[data-boutique-where]').forEach(function (e) { e.textContent = bFull + (bHor ? ' · ' + bHor : ''); });
    if (d.querySelector('[data-boutique], [data-boutique-where]')) {
      var store = { '@context': 'https://schema.org', '@type': 'Store', name: SITE, url: location.origin + '/',
        image: location.origin + '/assets/img/og-image.png',
        address: { '@type': 'PostalAddress', streetAddress: bAdr, postalCode: String(B.code_postal || '').trim() || undefined,
          addressLocality: String(B.ville || '').trim() || 'Mandelieu-la-Napoule', addressCountry: 'FR' } };
      if (wa) store.telephone = '+' + wa;
      if (String(B.horaires_google || '').trim()) store.openingHours = String(B.horaires_google).trim();
      var sc = d.createElement('script');
      sc.type = 'application/ld+json';
      sc.textContent = JSON.stringify(store);
      d.head.appendChild(sc);
    }
  }

  /* QR codes : la bibliotheque n'est chargee qu'au besoin (etiquettes, ordinateur, transfert de selection) */
  var qrPromise = null;
  function loadQR() {
    if (window.qrcode) return Promise.resolve();
    if (qrPromise) return qrPromise;
    qrPromise = new Promise(function (ok, ko) {
      var s = d.createElement('script');
      s.src = (ME && ME.getAttribute('data-qr')) || (ME ? ME.getAttribute('src').replace(/site\.js(\?.*)?$/, 'qrcode.js') : 'assets/js/qrcode.js');
      s.onload = function () { ok(); };
      s.onerror = ko;
      d.head.appendChild(s);
    });
    return qrPromise;
  }
  function qrSvg(text, cls, ec) {
    var qr = window.qrcode(0, ec || 'M');
    qr.addData(text);
    qr.make();
    var n = qr.getModuleCount(), q = 2, size = n + q * 2, path = '';
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (qr.isDark(r, c)) path += 'M' + (c + q) + ' ' + (r + q) + 'h1v1h-1z';
      }
    }
    var svg = d.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
    svg.setAttribute('class', cls || 'label__qr');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', tr('QR code vers ', 'QR code to ') + text);
    svg.setAttribute('shape-rendering', 'crispEdges');
    var bg = d.createElementNS(NS, 'rect');
    bg.setAttribute('width', size);
    bg.setAttribute('height', size);
    bg.setAttribute('fill', '#fff');
    var p = d.createElementNS(NS, 'path');
    p.setAttribute('d', path);
    p.setAttribute('fill', '#1E1B18');
    svg.appendChild(bg);
    svg.appendChild(p);
    return svg;
  }
  function boltSvg() {
    var s = d.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 12 20');
    s.setAttribute('aria-hidden', 'true');
    var p = d.createElementNS(NS, 'path');
    p.setAttribute('d', 'M7.6 0 .6 11.4h5L3.9 20l7.5-12.2H6.4L7.6 0z');
    s.appendChild(p);
    return s;
  }

  /* Fenetre generique (dialog natif) : titre, contenu, bouton Fermer */
  function sheet(title, build) {
    var dlg = el('dialog', 'dlg');
    var h = el('h2', 'dlg__t', title);
    h.id = 'sheet-t-' + Date.now();
    dlg.setAttribute('aria-labelledby', h.id);
    var x = el('button', 'dlg__x', tr('Fermer', 'Close'));
    x.type = 'button';
    x.addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('close', function () { setTimeout(function () { dlg.remove(); }, 50); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    dlg.appendChild(x);
    dlg.appendChild(h);
    build(dlg);
    d.body.appendChild(dlg);
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    return dlg;
  }

  /* 4. Filet de securite WhatsApp : QR code sur ordinateur, copie du message, rappel au retour sur l'onglet */
  function isDesktop() {
    return !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
      !window.matchMedia('(any-pointer: coarse)').matches);
  }
  function waMsg(href) {
    try { return new URL(href).searchParams.get('text') || ''; } catch (e) { return ''; }
  }
  function waEvent(a) {
    if (a.hasAttribute('data-sel-send')) return 'whatsapp-selection';
    if (a.closest('#recherche-form') || a.hasAttribute('data-search-wa')) return 'whatsapp-recherche';
    if (a.classList.contains('wa-float')) return 'whatsapp-contact';
    var m = a.getAttribute('data-msg') || '';
    if (/prévenir|let me know/.test(m)) return 'whatsapp-prevenir';
    if (/quel est le prix|what is the price/.test(m)) return 'whatsapp-prix';
    if (a.getAttribute('data-ref')) return 'whatsapp-reserver';
    return 'whatsapp-contact';
  }
  function waPending(href, ref, ev) { put('pr.wa', JSON.stringify({ t: Date.now(), href: href, ref: ref || '', ev: ev }), true); }
  function phoneUrl(a) {
    if (a.hasAttribute('data-sel-send')) return selTransferUrl(true);
    var ref = a.getAttribute('data-ref');
    if (ref && lot && lot.getAttribute('data-lot-ref') === ref) return location.href.split('#')[0].split('?')[0] + '#reserver';
    return a.href;
  }
  function waSheet(a) {
    var href = a.href, msg = waMsg(href), url = phoneUrl(a);
    sheet(tr('Continuer sur votre téléphone', 'Continue on your phone'), function (dlg) {
      var grid = el('div', 'wa-sheet');
      var fig = el('figure', 'wa-sheet__qr');
      var info = el('div', 'wa-sheet__info');
      info.appendChild(el('p', '', url === href ? tr('Scannez ce code avec l’appareil photo du téléphone : WhatsApp s’ouvre avec le message prêt à envoyer.',
        'Scan this code with your phone camera: WhatsApp opens with the message ready to send.') :
        tr('Scannez ce code avec l’appareil photo du téléphone : la page s’ouvre sur le téléphone, avec le bouton WhatsApp.',
          'Scan this code with your phone camera: the page opens on your phone, with the WhatsApp button.')));
      var go = el('a', 'btn', tr('Ouvrir WhatsApp sur cet ordinateur', 'Open WhatsApp on this computer'));
      go.href = href; go.target = '_blank'; go.rel = 'noopener'; go.setAttribute('data-wa-direct', '');
      go.addEventListener('click', function () { setTimeout(function () { dlg.close(); }, 100); });
      var cp = el('button', 'btn btn--ghost', tr('Copier le message', 'Copy the message'));
      cp.type = 'button';
      cp.addEventListener('click', function () { copyBtn(cp, msg); });
      var acts = el('div', 'actions');
      acts.appendChild(go);
      if (msg) acts.appendChild(cp);
      info.appendChild(acts);
      if (msg) {
        var det = el('details', 'wa-sheet__msg');
        det.appendChild(el('summary', '', tr('Voir le message', 'See the message')));
        det.appendChild(el('pre', '', msg));
        info.appendChild(det);
      }
      if (wa) info.appendChild(el('p', 'muted small', 'WhatsApp · ' + phone(wa)));
      grid.appendChild(fig);
      grid.appendChild(info);
      dlg.appendChild(grid);
      loadQR().then(function () { fig.appendChild(qrSvg(url, 'wa-sheet__svg', 'L')); }).catch(function () { fig.hidden = true; });
      track('qr-ordinateur', { cible: waEvent(a) });
    });
  }
  /* 4 bis. Reservation envoyee sur WhatsApp (selection, bouton Reserver) : la carte foudroyee de la maison se recharge
     en moins d'une seconde, l'eclair part, puis WhatsApp s'ouvre (telephone) ou le QR code s'affiche (ordinateur).
     Le vrai clic est rejoue avant 1 s pour que le navigateur le compte toujours comme un geste de l'utilisateur.
     Un toucher passe l'animation, Echap l'annule. Rien de tout ca si l'appareil demande moins de mouvement. */
  var charging = null;
  function chargeable(a) {
    if (a.hasAttribute('data-sel-send')) return true;
    return !!a.closest('[data-main-cta], [data-buybar]') && waEvent(a) === 'whatsapp-reserver';
  }
  function svgEl(tag, attrs, parent) {
    var n = d.createElementNS(NS, tag);
    Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(n);
    return n;
  }
  function boltSvg(cls, box, path) {
    var s = svgEl('svg', { viewBox: box || '0 0 12 20', 'class': cls, focusable: 'false', 'aria-hidden': 'true' });
    svgEl('path', { d: path || 'M7.6 0 .6 11.4h5L3.9 20l7.5-12.2H6.4L7.6 0z' }, s);
    return s;
  }
  function charge(a) {
    var desk = isDesktop(), ZAP = 600, FIRE = desk ? 1050 : 800, t0 = 0, done = false, raf = 0, tZap, tFire, tSpark;
    var box = el('div', 'charge');
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    var inner = el('div', 'charge__box');
    var orb = el('div', 'charge__orb');
    var ring = svgEl('svg', { viewBox: '0 0 120 120', 'class': 'charge__ring', 'aria-hidden': 'true', focusable: 'false' });
    svgEl('circle', { cx: 60, cy: 60, r: 56, 'class': 'charge__track' }, ring);
    var fill = svgEl('circle', { cx: 60, cy: 60, r: 56, pathLength: 100, 'class': 'charge__fill' }, ring);
    var wave = el('span', 'charge__wave');
    var card = el('div', 'charge__card');
    var src = (d.querySelector('.site-header .seal') || {}).src || '';
    var dim = el('img', 'charge__seal charge__seal--dim'), lit = el('img', 'charge__seal charge__seal--lit');
    [dim, lit].forEach(function (i) { i.alt = ''; i.src = src; i.width = 100; i.height = 119; i.decoding = 'sync'; });
    var level = el('span', 'charge__level');
    var strike = boltSvg('charge__strike', '0 0 44 150', 'M30 0 9 66h13L4 150 40 56H27L36 0z');
    card.appendChild(dim); card.appendChild(lit); card.appendChild(level);
    orb.appendChild(ring); orb.appendChild(wave); orb.appendChild(card); orb.appendChild(strike);
    var txt = el('p', 'charge__t');
    var lab = el('span', '', tr('On recharge l’éclair…', 'Charging the bolt…'));
    var pct = el('span', 'charge__pct', '0' + tr(' %', '%'));
    pct.setAttribute('aria-hidden', 'true');
    txt.appendChild(lab); txt.appendChild(pct);
    inner.appendChild(orb); inner.appendChild(txt);
    box.appendChild(inner);
    d.body.appendChild(box);
    charging = box;
    function ease(p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }
    function frame(now) {
      if (!t0) t0 = now;
      var p = Math.min(1, (now - t0) / ZAP), e = ease(p), j = 2.6 * e;
      fill.style.strokeDashoffset = String(100 - e * 100);
      lit.style.clipPath = 'inset(' + (100 - e * 100).toFixed(2) + '% 0 0 0)';
      level.style.top = (100 - e * 100).toFixed(2) + '%';
      pct.textContent = Math.round(e * 100) + tr(' %', '%');
      orb.style.transform = p < 1 ? 'translate(' + ((Math.random() - 0.5) * j).toFixed(2) + 'px,' + ((Math.random() - 0.5) * j).toFixed(2) + 'px)' : '';
      if (p < 1 && !done) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    function spark(out) {
      if (!orb.animate) return;
      var s = boltSvg('charge__spark'), ang = Math.random() * Math.PI * 2, r0 = out ? 46 : 96 + Math.random() * 46, r1 = out ? 120 + Math.random() * 40 : 34;
      var rot = ang * 180 / Math.PI + (out ? 90 : -90);
      orb.appendChild(s);
      var k = s.animate([
        { opacity: 0, transform: 'translate(' + (Math.cos(ang) * r0).toFixed(1) + 'px,' + (Math.sin(ang) * r0).toFixed(1) + 'px) rotate(' + rot.toFixed(0) + 'deg) scale(' + (out ? 1.1 : 0.7) + ')' },
        { opacity: 1, offset: 0.25 },
        { opacity: 0, transform: 'translate(' + (Math.cos(ang) * r1).toFixed(1) + 'px,' + (Math.sin(ang) * r1).toFixed(1) + 'px) rotate(' + rot.toFixed(0) + 'deg) scale(' + (out ? 0.6 : 0.35) + ')' }
      ], { duration: out ? 520 : 380 + Math.random() * 160, easing: out ? 'cubic-bezier(.1,.7,.3,1)' : 'cubic-bezier(.6,0,.9,.6)', fill: 'both' });
      k.onfinish = function () { s.remove(); };
    }
    tSpark = setInterval(function () { spark(false); }, 70);
    function zap() {
      clearInterval(tSpark);
      if (!box.isConnected) return;
      box.classList.add('is-zap');
      for (var i = 0; i < 9; i++) spark(true);
      lab.textContent = desk ? tr('Éclair chargé !', 'Bolt charged!') : tr('Éclair chargé ! On ouvre WhatsApp…', 'Bolt charged! Opening WhatsApp…');
    }
    function close(now) {
      clearTimeout(tZap); clearTimeout(tFire); clearInterval(tSpark); cancelAnimationFrame(raf);
      d.removeEventListener('keydown', key, true);
      d.removeEventListener('visibilitychange', hid);
      window.removeEventListener('pagehide', hid);
      if (charging === box) charging = null;
      if (now === true) { box.remove(); return; }
      box.classList.add('is-out');
      setTimeout(function () { box.remove(); }, 320);
    }
    function go() {
      if (done) return;
      done = true;
      if (!box.classList.contains('is-zap')) zap();
      clearTimeout(tFire);
      a.__charged = true;
      try { a.click(); } finally { a.__charged = false; }
      setTimeout(close, desk ? 260 : 700);
      if (!desk) setTimeout(function () { if (!d.hidden) checkPending(true); }, 1400);
    }
    function key(e) { if (e.key === 'Escape') { e.preventDefault(); done = true; close(); } }
    function hid(e) { if (e.type === 'pagehide' || d.hidden) close(true); }
    box.addEventListener('click', go);
    d.addEventListener('keydown', key, true);
    d.addEventListener('visibilitychange', hid);
    window.addEventListener('pagehide', hid);
    tZap = setTimeout(zap, ZAP);
    tFire = setTimeout(go, FIRE);
  }
  window.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href^="https://wa.me/"]') : null;
    if (!a || a.__charged || RM || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !chargeable(a)) return;
    e.preventDefault();
    e.stopPropagation();
    if (!charging) charge(a);
  }, true);
  d.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href^="https://wa.me/"]') : null;
    if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var ev = waEvent(a);
    waPending(a.href, a.getAttribute('data-ref'), ev);
    if (!a.hasAttribute('data-wa-direct')) track(ev, { ref: a.getAttribute('data-ref') || '' });
    if (a.hasAttribute('data-wa-direct') || !isDesktop()) return;
    e.preventDefault();
    waSheet(a);
  }, true);
  var waCheckEl = null;
  function checkPending(now) {
    var p = getJSON('pr.wa', true, null);
    if (!p || !p.t) return;
    var age = Date.now() - p.t;
    if (age > 30 * 60 * 1000) { del('pr.wa', true); return; }
    if ((age < 2500 && now !== true) || waCheckEl) return;
    del('pr.wa', true);
    var box = el('div', 'wa-check');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', tr('Message WhatsApp', 'WhatsApp message'));
    box.appendChild(el('p', 'wa-check__t', tr('Votre message WhatsApp est-il parti ?', 'Did your WhatsApp message go through?')));
    var acts = el('div', 'wa-check__a');
    var yes = el('button', 'btn', tr('Oui, envoyé', 'Yes, sent'));
    yes.type = 'button';
    var again = el('a', 'btn btn--ghost', tr('Réessayer', 'Try again'));
    again.href = p.href; again.target = '_blank'; again.rel = 'noopener'; again.setAttribute('data-wa-direct', '');
    var cp = el('button', 'linkbtn', tr('Copier le message', 'Copy the message'));
    cp.type = 'button';
    var msg = waMsg(p.href);
    cp.addEventListener('click', function () { copyBtn(cp, msg); });
    function bye() { box.remove(); waCheckEl = null; }
    yes.addEventListener('click', function () {
      track('whatsapp-confirme', { ref: p.ref || '' });
      box.textContent = '';
      box.appendChild(el('p', 'wa-check__t', tr('Merci ! Réponse rapide, en général dans l’heure.', 'Thank you! We usually reply within the hour.')));
      if (channel) {
        var ca = el('a', 'linkbtn', tr('Suivre aussi les arrivages sur WhatsApp', 'Also follow new arrivals on WhatsApp'));
        ca.href = channel; ca.target = '_blank'; ca.rel = 'noopener';
        box.appendChild(ca);
      }
      setTimeout(bye, 6000);
    });
    again.addEventListener('click', bye);
    var x = el('button', 'wa-check__x', '×');
    x.type = 'button';
    x.setAttribute('aria-label', tr('Fermer', 'Close'));
    x.addEventListener('click', bye);
    acts.appendChild(yes); acts.appendChild(again); if (msg) acts.appendChild(cp);
    box.appendChild(acts);
    box.appendChild(x);
    d.body.appendChild(box);
    waCheckEl = box;
    track('whatsapp-retour', { ref: p.ref || '' });
  }
  d.addEventListener('visibilitychange', function () { if (d.visibilityState === 'visible') setTimeout(checkPending, 350); });
  window.addEventListener('pageshow', function (e) { if (e.persisted) setTimeout(checkPending, 350); });
  setTimeout(checkPending, 800);
  /* Fiche ouverte depuis le QR code de l'ordinateur : le bouton WhatsApp est mis en avant */
  if (location.hash === '#reserver' && mainCta) {
    mainCta.classList.add('is-focus');
    var tip = el('p', 'cta-tip', tr('Touchez le bouton ci-dessous : WhatsApp s’ouvre avec le message prêt.', 'Tap the button below: WhatsApp opens with the message ready.'));
    mainCta.parentNode.insertBefore(tip, mainCta);
    setTimeout(function () { mainCta.scrollIntoView({ block: 'center', behavior: RM ? 'auto' : 'smooth' }); }, 300);
  }

  /* 5. Formulaires par e-mail (Netlify Forms) : verification, envoi sans quitter la page, pot de miel */
  function emailOk(v) { return /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/.test(v); }
  function fieldErr(input, bad) {
    var err = input.getAttribute('aria-describedby') ? d.getElementById(input.getAttribute('aria-describedby')) : null;
    if (bad) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    if (err) err.hidden = !bad;
    return bad;
  }
  function postForm(fields) {
    var body = new URLSearchParams();
    Object.keys(fields).forEach(function (k) { body.append(k, fields[k] == null ? '' : String(fields[k])); });
    return fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r; });
  }
  function formFields(f) {
    var out = {};
    all('input, select, textarea', f).forEach(function (i) { if (i.name) out[i.name] = i.value.trim(); });
    return out;
  }
  function sentFeedback(f, ok) {
    var okEl = f.querySelector('[data-form-ok]'), koEl = f.querySelector('[data-form-err]');
    if (okEl) okEl.hidden = !ok;
    if (koEl) koEl.hidden = ok;
  }
  all('form[data-netlify-form]').forEach(function (f) {
    if (new URLSearchParams(location.search).get('envoye') === '1' && location.hash && (f.getAttribute('action') || '').split('#')[1] === location.hash.slice(1)) {
      sentFeedback(f, true);
    }
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var bad = false, first = null;
      all('input[required], textarea[required]', f).forEach(function (i) {
        var v = i.value.trim(), b = !v || (i.type === 'email' && !emailOk(v)) || (i.maxLength > 0 && v.length > i.maxLength);
        if (fieldErr(i, b)) { bad = true; first = first || i; }
      });
      var refI = f.querySelector('[name="reference"]');
      if (refI && fieldErr(refI, !!refI.value.trim() && !/^[A-Za-z0-9]{1,12}$/.test(refI.value.trim()))) { bad = true; first = first || refI; }
      if (bad) { first.focus(); return; }
      var fields = formFields(f);
      if (fields['bot-field']) return;
      var btn = f.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      postForm(fields).then(function () {
        sentFeedback(f, true);
        track('formulaire', { nom: fields['form-name'] || '' });
        all('input:not([type="hidden"]), textarea', f).forEach(function (i) { if (i.name !== 'bot-field') i.value = ''; });
      }).catch(function () { sentFeedback(f, false); }).then(function () { if (btn) btn.disabled = false; });
    });
  });

  /* Alertes « Me prevenir » : chaine WhatsApp, e-mail, ou recherche enregistree */
  function openAlert(opts) {
    track('prevenir-ouverture', { ref: opts.ref || '' });
    sheet(tr('Être prévenu', 'Get notified'), function (dlg) {
      var intro = opts.name ? tr('Dès qu’un exemplaire de « ' + opts.name + ' » ou une carte proche arrive :', 'As soon as a copy of “' + opts.name + '” or a similar card arrives:')
        : tr('Dès qu’une carte correspondant à « ' + (opts.q || '') + ' » arrive :', 'As soon as a card matching “' + (opts.q || '') + '” arrives:');
      dlg.appendChild(el('p', '', intro));
      var acts = el('div', 'alert-ways');
      if (channel) {
        var ca = el('a', 'btn', tr('Suivre la chaîne WhatsApp « Arrivages »', 'Follow the WhatsApp “New arrivals” channel'));
        ca.href = channel; ca.target = '_blank'; ca.rel = 'noopener';
        ca.addEventListener('click', function () { track('chaine-whatsapp', { depuis: 'alerte' }); });
        acts.appendChild(ca);
      }
      var waMsgTxt = opts.name ? tr('Bonjour, pouvez-vous me prévenir si un exemplaire de ' + opts.name + (opts.ref ? ' (réf. ' + opts.ref + ')' : '') + ' arrive ?',
        'Hello, could you let me know if a copy of ' + opts.name + (opts.ref ? ' (ref. ' + opts.ref + ')' : '') + ' comes in?')
        : tr('Bonjour, pouvez-vous me prévenir si une carte « ' + opts.q + ' » arrive ?', 'Hello, could you let me know if a “' + opts.q + '” card comes in?');
      var wl = contactLink(waMsgTxt, opts.ref);
      if (wl && wa) {
        var wb = el('a', channel ? 'btn btn--ghost' : 'btn', tr('Me prévenir sur WhatsApp', 'Notify me on WhatsApp'));
        wb.href = wl.href; wb.target = '_blank'; wb.rel = 'noopener'; wb.setAttribute('data-msg', waMsgTxt);
        acts.appendChild(wb);
      }
      dlg.appendChild(acts);
      var f = el('form', 'alert-form');
      f.noValidate = true;
      var lab = el('label', '', tr('Ou par e-mail', 'Or by e-mail'));
      lab.setAttribute('for', 'al-mail');
      var inp = el('input', 'input');
      inp.type = 'email'; inp.id = 'al-mail'; inp.name = 'email'; inp.required = true; inp.maxLength = 120; inp.autocomplete = 'email';
      inp.setAttribute('aria-describedby', 'al-mail-err');
      var err = el('p', 'field-err', tr('Indiquez une adresse e-mail valide.', 'Enter a valid e-mail address.'));
      err.id = 'al-mail-err'; err.hidden = true;
      var hp = el('p', 'hp'); hp.setAttribute('aria-hidden', 'true');
      var hpi = el('input'); hpi.name = 'bot-field'; hpi.tabIndex = -1; hpi.autocomplete = 'off'; hp.appendChild(hpi);
      var send = el('button', 'btn btn--ghost', tr('Me prévenir par e-mail', 'Notify me by e-mail'));
      send.type = 'submit';
      var ok = el('p', 'form-ok', tr('C’est noté : nous vous écrivons dès qu’elle arrive.', 'Noted: we will e-mail you as soon as it arrives.'));
      ok.hidden = true; ok.setAttribute('role', 'status');
      var ko = el('p', 'field-err', tr('L’envoi n’a pas abouti. Réessayez dans un instant.', 'Sending failed. Please try again in a moment.'));
      ko.hidden = true; ko.setAttribute('role', 'alert');
      [lab, inp, err, hp, send, ok, ko].forEach(function (x) { f.appendChild(x); });
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        if (fieldErr(inp, !emailOk(inp.value.trim()))) { inp.focus(); return; }
        if (hpi.value) return;
        send.disabled = true;
        postForm({ 'form-name': 'alerte', email: inp.value.trim(), recherche: opts.q || opts.name || '',
          carte: opts.ref ? (opts.name || '') + ' · ' + tr('réf. ', 'ref. ') + opts.ref : '', langue: tr('français', 'English'), 'bot-field': '' })
          .then(function () { ok.hidden = false; ko.hidden = true; inp.value = ''; track('formulaire', { nom: 'alerte' }); })
          .catch(function () { ko.hidden = false; }).then(function () { send.disabled = false; });
      });
      dlg.appendChild(f);
      if (opts.q && d.getElementById('catalogue') && memOK()) {
        var sv = el('button', 'linkbtn', tr('Enregistrer cette recherche sur cet appareil', 'Save this search on this device'));
        sv.type = 'button';
        sv.addEventListener('click', function () { if (window.__prSaveSearch) window.__prSaveSearch(); sv.textContent = tr('Recherche enregistrée', 'Search saved'); sv.disabled = true; });
        dlg.appendChild(sv);
      }
    });
  }
  d.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-alert-open]') : null;
    if (!b) return;
    var q = b.getAttribute('data-alert-q') || '';
    if (b.getAttribute('data-alert-from') === 'catalogue') { var fq = d.getElementById('f-q'); q = (fq && fq.value.trim()) || q; }
    openAlert({ ref: b.getAttribute('data-alert-ref') || '', name: b.getAttribute('data-alert-name') || '', q: q });
  });

  /* Recherche au Japon : la demande part en message pret a envoyer, ou par e-mail */
  var rf = d.getElementById('recherche-form');
  if (rf) {
    var carte = d.getElementById('r-carte'), cErr = d.getElementById('r-carte-err');
    var rq = new URLSearchParams(location.search).get('q');
    if (rq && !carte.value) carte.value = rq.slice(0, 120);
    var optText = function (id) { var s2 = d.getElementById(id); return s2.options[s2.selectedIndex].value; };
    var needCard = function () {
      var v = carte.value.trim();
      if (!v) { cErr.hidden = false; carte.setAttribute('aria-invalid', 'true'); carte.focus(); return null; }
      cErr.hidden = true; carte.removeAttribute('aria-invalid');
      return v;
    };
    if (new URLSearchParams(location.search).get('envoye') === '1') { var box0 = rf.querySelector('[data-ask-mail]'); if (box0) { box0.open = true; sentFeedback(box0, true); } }
    rf.addEventListener('submit', function (e) {
      var v = needCard();
      if (!v) { e.preventDefault(); return; }
      var budget = d.getElementById('r-budget').value.replace(/[^\d]/g, '');
      var det = d.getElementById('r-details').value.trim();
      var lines = [tr('• Carte', '• Card') + NB + ': ' + v, '• Version' + NB + ': ' + optText('r-version'),
        tr('• État', '• Condition') + NB + ': ' + optText('r-etat')];
      if (budget) lines.push(tr('• Budget maximum', '• Maximum budget') + NB + ': ' + eur(+budget));
      if (det) lines.push(tr('• Précisions', '• Details') + NB + ': ' + det);
      var msg = tr('Bonjour, je cherche une carte au Japon (demande envoyée depuis ' + SITE + ')',
        'Hello, I am looking for a card in Japan (request sent from ' + SITE + ')') + NB + ':\n' + lines.join('\n') +
        tr('\nMerci de me tenir au courant.', '\nPlease keep me posted.');
      var l = contactLink(msg, '');
      if (!l) return;
      e.preventDefault();
      var a = d.createElement('a');
      a.href = l.href;
      a.setAttribute('data-search-wa', '');
      if (l.ext) { a.target = '_blank'; a.rel = 'noopener'; }
      d.body.appendChild(a);
      a.click();
      a.remove();
    });
    var sm = rf.querySelector('[data-send-mail]');
    if (sm) sm.addEventListener('click', function () {
      var box = rf.querySelector('[data-ask-mail]');
      var v = needCard();
      if (!v) return;
      var em = d.getElementById('r-email');
      if (fieldErr(em, !emailOk(em.value.trim()))) { em.focus(); return; }
      var fields = formFields(rf);
      if (fields['bot-field']) return;
      sm.disabled = true;
      postForm(fields).then(function () { sentFeedback(box, true); track('formulaire', { nom: 'recherche' }); })
        .catch(function () { sentFeedback(box, false); }).then(function () { sm.disabled = false; });
    });
  }

  /* Impression (panneau de salon) */
  if (!d.getElementById('etiquettes')) {
    all('[data-print]').forEach(function (b) { b.addEventListener('click', function () { window.print(); }); });
  }

  /* 6. Ma selection (memorisee dans ce navigateur uniquement) */
  var KEY = 'pokeraichu.selection.v1';
  var memSel = {};
  function loadSel() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY) || '{}');
      if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    } catch (e) {}
    return memSel;
  }
  function saveSel(s) {
    memSel = s;
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
    refreshPicks();
  }
  function units(s) { return Object.keys(s).reduce(function (n, k) { return n + (+s[k] || 0); }, 0); }
  function refreshPicks() {
    var s = loadSel(), n = units(s);
    all('[data-sel-pill]').forEach(function (p) { p.hidden = n === 0; });
    all('[data-sel-count]').forEach(function (c) { c.textContent = n; });
    all('[data-pick]').forEach(function (b) {
      var on = !!s[b.getAttribute('data-pick')];
      if (b.hasAttribute('data-pick-main')) b.textContent = b.getAttribute(on ? 'data-label-remove' : 'data-label-add');
      else b.setAttribute('aria-pressed', String(on));
    });
  }
  var toastEl = null, toastTimer = null;
  function makeToast() {
    if (toastEl) return;
    toastEl = el('div', 'toast');
    toastEl.setAttribute('role', 'status');
    d.body.appendChild(toastEl);
  }
  if (d.querySelector('[data-pick]')) makeToast();
  function toast(msg, link, pic) {
    makeToast();
    toastEl.textContent = '';
    toastEl.classList.toggle('toast--pic', !!pic);
    if (pic) {
      var ti = el('img', 'toast__pic');
      ti.src = pic; ti.alt = ''; ti.width = 40; ti.height = 56; ti.decoding = 'async';
      toastEl.appendChild(ti);
    }
    toastEl.appendChild(el('span', '', msg));
    if (link) {
      var a = el('a', '', tr('Voir', 'View'));
      var pill = d.querySelector('[data-sel-pill]');
      a.href = pill ? pill.getAttribute('href') : 'selection.html';
      toastEl.appendChild(a);
    }
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 3500);
  }
  /* Remises par nombre de cartes et livraison (config.js) */
  var LIV = C.livraison || {};
  var ZONES = LIV.zones || {};
  var SEUIL = +LIV.offerte_des > 0 ? +LIV.offerte_des : 0;
  var REM = (Array.isArray(C.remises) ? C.remises : []).filter(function (r) { return r && +r.des > 0 && +r.pourcent > 0; })
    .sort(function (a, b) { return a.des - b.des; });
  function remiseFor(n) { var p = 0; REM.forEach(function (r) { if (n >= +r.des) p = +r.pourcent; }); return p; }
  function nextTier(n) { for (var i = 0; i < REM.length; i++) if (n < +REM[i].des) return REM[i]; return null; }
  function zoneRate(z, k) { var v = (ZONES[z] || {})[k]; return v === null || v === undefined || v === '' ? null : +v; }
  function shipCost(zone, items) {
    if (zone === 'main') return 0;
    if (!ZONES[zone]) return null;
    var nSc = 0, nSl = 0, nCa = 0;
    items.forEach(function (it) { if (it.type === 'scelle') nSc += it.q; else if (it.type === 'slab') nSl += it.q; else nCa += it.q; });
    if (nSc >= 2) return null;
    if (nSc === 1) return zoneRate(zone, 'scelle');
    if (nSl >= 4) return null;
    if (nSl >= 2) { var s2 = zoneRate(zone, 'slabs'); return s2 === null ? zoneRate(zone, 'slab') : s2; }
    if (nSl === 1) return zoneRate(zone, 'slab');
    if (nCa >= 6) { var c6 = zoneRate(zone, 'cartes'); return c6 === null ? zoneRate(zone, 'carte') : c6; }
    return nCa ? zoneRate(zone, 'carte') : 0;
  }
  d.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-pick]') : null;
    if (!b) return;
    var ref = b.getAttribute('data-pick'), s = loadSel();
    if (s[ref]) {
      delete s[ref];
      saveSel(s);
      toast(tr('Retirée de votre sélection.', 'Removed from your selection.'), false);
    } else {
      s[ref] = 1;
      saveSel(s);
      var n = units(s);
      var nt = nextTier(n), cur = remiseFor(n);
      var extra = (cur ? tr(' Remise −' + cur + NB + '% appliquée.', ' −' + cur + '% discount applied.') : '') +
        (nt ? tr(' Encore ' + (nt.des - n) + ' pour −' + nt.pourcent + NB + '%.', ' ' + (nt.des - n) + ' more for −' + nt.pourcent + '%.') : '');
      /* la photo de la carte ajoutée : celle de la vignette touchée, ou celle de la fiche */
      var host = b.closest('.tile, .pocket'), media = host ? null : d.querySelector('.product__media');
      var ph = host ? host.querySelector('.art--photo img:not(.lqip)') : media ? media.querySelector('.art--photo img:not(.lqip), .gallery__item img:not(.lqip)') : null;
      toast(tr('Ajoutée. ' + n + (n > 1 ? ' cartes' : ' carte') + ' dans votre sélection.', 'Added. ' + n + (n > 1 ? ' cards' : ' card') + ' in your selection.') + extra, true,
        ph ? (ph.currentSrc || ph.src) : null);
      track('ajout-selection', { ref: ref });
    }
  });
  window.addEventListener('storage', function (e) { if (e.key === KEY) refreshPicks(); });
  refreshPicks();

  function loadStock(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) { return liveSoon().then(function () { return livePatchStock(data); }); });
  }
  function cEd(c) { return c.edition ? (EN && c.en && c.en.edition ? c.en.edition : c.edition) : ''; }
  function cardLabel(c) { return cTitre(c) + (c.edition ? ' ' + cEd(c) : '') + (c.type === 'slab' ? ' ' + c.etat.libelle : ''); }

  /* Selection partagee entre appareils : selection.html#s=102.105x2 */
  function encodeSel(s) { return Object.keys(s).map(function (k) { return k + (+s[k] > 1 ? 'x' + s[k] : ''); }).join('.'); }
  function decodeSel(str) {
    var out = {};
    String(str || '').split('.').forEach(function (p) {
      var m = p.match(/^([A-Za-z0-9]{1,8})(?:x(\d{1,2}))?$/);
      if (m) out[m[1].toUpperCase() === m[1] ? m[1] : m[1]] = Math.max(1, +m[2] || 1);
    });
    return out;
  }
  function selTransferUrl(withWa) {
    var pill = d.querySelector('[data-sel-pill]');
    var base = new URL(pill ? pill.getAttribute('href') : 'selection.html', location.href).href.split('#')[0];
    return base + '#s=' + encodeSel(loadSel()) + (withWa ? '&wa=1' : '');
  }

  var selRoot = d.getElementById('selection');
  if (selRoot) initSelection(selRoot);

  function initSelection(root) {
    var list = root.querySelector('[data-sel-list]');
    var empty = root.querySelector('[data-sel-empty]');
    var summary = root.querySelector('[data-sel-summary]');
    var unitsEl = root.querySelector('[data-sel-units]');
    var sumEl = root.querySelector('[data-sel-sum]');
    var askEl = root.querySelector('[data-sel-ask]');
    var linesEl = root.querySelector('[data-sel-lines]');
    var nudge = root.querySelector('[data-sel-nudge]');
    var zoneSel = root.querySelector('[data-sel-zone]');
    var send = root.querySelector('[data-sel-send]');
    var gone = root.querySelector('[data-sel-gone]');
    var byRef = {}, ready = false, FLMAP = {};
    var zone = get('pr.zone') || (EN ? 'ue' : 'fr');
    if (zoneSel) {
      if (!all('option', zoneSel).some(function (o) { return o.value === zone; })) zone = zoneSel.options[0].value;
      zoneSel.value = zone;
      zoneSel.addEventListener('change', function () { zone = zoneSel.value; put('pr.zone', zone); render(); });
    }
    root.querySelector('[data-sel-clear]').addEventListener('click', function () { saveSel({}); render(); });
    window.addEventListener('storage', function (e) { if (e.key === KEY && ready) render(); });
    /* lien de transfert ouvert sur cet appareil */
    var hp = new URLSearchParams(location.hash.slice(1));
    var incoming = hp.get('s') ? decodeSel(hp.get('s')) : null;
    var wantWa = hp.get('wa') === '1';
    var tb = root.querySelector('[data-sel-transfer]');
    if (tb) tb.addEventListener('click', function () {
      var url = selTransferUrl(false);
      track('selection-transfert');
      sheet(tr('Continuer sur un autre appareil', 'Continue on another device'), function (dlg) {
        var grid = el('div', 'wa-sheet');
        var fig = el('figure', 'wa-sheet__qr');
        var info = el('div', 'wa-sheet__info');
        info.appendChild(el('p', '', tr('Scannez ce code avec l’autre appareil, ou envoyez-vous le lien : la même sélection s’y ouvre.', 'Scan this code with the other device, or send yourself the link: the same selection opens there.')));
        var acts = el('div', 'actions');
        var cp = el('button', 'btn', tr('Copier le lien', 'Copy the link'));
        cp.type = 'button';
        cp.addEventListener('click', function () { copyText(url).then(function () { cp.textContent = tr('Lien copié', 'Link copied'); }); });
        acts.appendChild(cp);
        if (typeof navigator.share === 'function') {
          var sh = el('button', 'btn btn--ghost', tr('Envoyer…', 'Send…'));
          sh.type = 'button';
          sh.addEventListener('click', function () { navigator.share({ title: tr('Ma sélection', 'My selection') + ' · ' + SITE, url: url }).catch(function () {}); });
          acts.appendChild(sh);
        }
        info.appendChild(acts);
        grid.appendChild(fig); grid.appendChild(info);
        dlg.appendChild(grid);
        loadQR().then(function () { fig.appendChild(qrSvg(url, 'wa-sheet__svg', 'M')); }).catch(function () { fig.hidden = true; });
      });
    });
    loadStock(root.getAttribute('data-stock')).then(function (data) {
      var bySlug = {}, alias = (data.meta && data.meta.alias_refs) || {};
      data.cartes.forEach(function (c) { byRef[c.ref] = c; bySlug[c.slug] = c; });
      FLMAP = (data.coups_de_foudre && data.coups_de_foudre.cartes) || {};
      d.addEventListener('pr:flash', function () { render(); });
      function fix(s) {
        Object.keys(s).forEach(function (k) {
          var moved = !byRef[k] && alias[k] && bySlug[alias[k]];
          if (moved) { s[moved.ref] = Math.max(+s[moved.ref] || 0, +s[k] || 1); delete s[k]; }
        });
        var removed = 0;
        Object.keys(s).forEach(function (k) {
          if (!byRef[k]) { delete s[k]; removed++; } else { s[k] = Math.max(1, Math.min(+s[k] || 1, byRef[k].quantite)); }
        });
        return removed;
      }
      var s = loadSel(), removed = fix(s);
      saveSel(s);
      if (removed) {
        gone.textContent = removed > 1 ? tr(removed + ' cartes ne sont plus disponibles et ont été retirées.', removed + ' cards are no longer available and were removed.')
          : tr('1 carte n’est plus disponible et a été retirée.', '1 card is no longer available and was removed.');
        gone.hidden = false;
      }
      if (incoming) {
        fix(incoming);
        var n = units(incoming);
        history.replaceState(null, '', location.pathname + location.search);
        if (n && !units(loadSel())) {
          saveSel(incoming);
          toast(tr('Sélection importée : ' + n + (n > 1 ? ' cartes.' : ' carte.'), 'Selection imported: ' + n + (n > 1 ? ' cards.' : ' card.')), false);
        } else if (n && encodeSel(incoming) !== encodeSel(loadSel())) {
          var box = root.querySelector('[data-sel-import]');
          box.querySelector('[data-sel-import-text]').textContent = tr('Une sélection de ' + n + (n > 1 ? ' cartes' : ' carte') + ' a été partagée avec ce lien.',
            'A selection of ' + n + (n > 1 ? ' cards' : ' card') + ' was shared with this link.');
          box.hidden = false;
          box.querySelector('[data-sel-import-replace]').addEventListener('click', function () { saveSel(incoming); box.hidden = true; render(); });
          box.querySelector('[data-sel-import-add]').addEventListener('click', function () {
            var cur = loadSel();
            Object.keys(incoming).forEach(function (k) { cur[k] = Math.min(byRef[k].quantite, Math.max(+cur[k] || 0, incoming[k])); });
            saveSel(cur); box.hidden = true; render();
          });
        }
      }
      ready = true;
      liveReady.then(function () { render(); });
      render();
      if (wantWa && send) setTimeout(function () { send.classList.add('is-focus'); send.scrollIntoView({ block: 'center', behavior: RM ? 'auto' : 'smooth' }); }, 400);
    }).catch(function () {
      empty.hidden = false;
      empty.querySelector('p').textContent = tr('Impossible de charger le stock. Réessayez dans un instant.', 'Could not load the stock. Please try again in a moment.');
    });

    function render(focusKey) {
      var s = loadSel();
      var refs = Object.keys(s).filter(function (k) { return byRef[k]; });
      list.textContent = '';
      empty.hidden = refs.length > 0;
      summary.hidden = refs.length === 0;
      var n = 0, total = 0, ask = 0, priced = 0, base = 0, nFlash = 0, lines = [], items = [], on = flashOn();
      refs.forEach(function (ref) {
        var c = byRef[ref], q = s[ref];
        /* coup de foudre en cours : prix flash, hors remises par quantite (non cumulable) */
        var fl = on && c.prix_eur !== null ? FLMAP[c.ref] : null;
        var unit = c.prix_eur === null ? null : fl ? fl.prix : c.prix_eur;
        var line = unit === null ? null : unit * q;
        n += q;
        items.push({ type: c.type, q: q });
        if (line === null) ask++;
        else { total += line; if (fl) nFlash += q; else { priced += q; base += line; } }
        list.appendChild(row(c, q, line, unit, fl));
        lines.push(tr('• Réf. ', '• Ref. ') + c.ref + ' · ' + cardLabel(c) + (q > 1 ? ' · ×' + q : '') + ' · ' +
          (unit === null ? tr('prix sur demande', 'price on request') : eur(unit) + (q > 1 ? tr(' pièce', ' each') : '')) +
          (fl ? tr(' (coup de foudre, au lieu de ' + eur(fl.prix_ref) + ')', ' (lightning deal, instead of ' + eur(fl.prix_ref) + ')') : '') +
          (isSold(c.ref) ? tr(' · vendue entre-temps', ' · sold in the meantime') : isRes(c.ref) ? tr(' · réservée en ce moment', ' · currently reserved') : ''));
      });
      var pctR = remiseFor(priced), remise = round2(base * pctR / 100), after = round2(total - remise);
      var freeFr = zone === 'fr' && SEUIL && (ask > 0 || after >= SEUIL);
      var ship = freeFr ? 0 : shipCost(zone, items);
      var zoneName = zoneSel ? zoneSel.options[zoneSel.selectedIndex].text : '';
      linesEl.textContent = '';
      function dl(k, v, cls) { var w = el('div', cls || ''); w.appendChild(el('dt', '', k)); w.appendChild(el('dd', '', v)); linesEl.appendChild(w); }
      dl(tr('Sous-total', 'Subtotal'), eur(total));
      if (pctR) dl(tr('Remise −' + pctR + NB + '% (' + priced + ' cartes)', 'Discount −' + pctR + '% (' + priced + ' cards)'), '−' + eur(remise), 'is-deal');
      dl(zone === 'main' ? tr('Remise en main propre', 'Collection in person') : tr('Envoi suivi', 'Tracked shipping'),
        ship === null ? tr('Sur devis', 'On quote') : ship === 0 ? tr('Offert', 'Free') : eur(ship), ship === 0 ? 'is-deal' : '');
      var grand = round2(after + (ship || 0));
      unitsEl.textContent = n;
      sumEl.textContent = eur(grand) + (ship === null ? ' + ' + tr('envoi', 'shipping') : '');
      askEl.hidden = !ask;
      askEl.textContent = ask ? tr('+ ' + ask + (ask > 1 ? ' pièces' : ' pièce') + ' au prix sur demande',
        '+ ' + ask + (ask > 1 ? ' items' : ' item') + ' with price on request') : '';
      var tips = [];
      var nt = nextTier(priced);
      if (nt && priced) tips.push(tr('Ajoutez ' + (nt.des - priced) + (nt.des - priced > 1 ? ' cartes' : ' carte') + ' pour −' + nt.pourcent + NB + '% sur toute la sélection.',
        'Add ' + (nt.des - priced) + (nt.des - priced > 1 ? ' cards' : ' card') + ' for −' + nt.pourcent + '% on the whole selection.'));
      if (nFlash && REM.length) tips.push(tr('Les coups de foudre ne se cumulent pas avec les remises par quantité : ' + nFlash + (nFlash > 1 ? ' cartes comptées' : ' carte comptée') + ' au prix flash.',
        'Lightning deals cannot be combined with quantity discounts: ' + nFlash + (nFlash > 1 ? ' cards' : ' card') + ' at the flash price.'));
      if (zone === 'fr' && SEUIL && !freeFr) tips.push(tr('Plus que ' + eur(round2(SEUIL - after)) + ' pour la livraison offerte en France métropolitaine.',
        eur(round2(SEUIL - after)) + ' more for free shipping within metropolitan France.'));
      nudge.textContent = tips.join(' ');
      nudge.hidden = !tips.length;
      var money = [tr('Sous-total', 'Subtotal') + NB + ': ' + eur(total)];
      if (pctR) money.push(tr('Remise', 'Discount') + ' −' + pctR + NB + '%' + NB + ': −' + eur(remise));
      money.push((zone === 'main' ? tr('Remise en main propre', 'Collection in person') : tr('Envoi', 'Shipping') + ' (' + zoneName + ')') + NB + ': ' +
        (ship === null ? tr('sur devis', 'on quote') : ship === 0 ? tr('offert', 'free') : eur(ship)));
      money.push(tr('Total estimé', 'Estimated total') + NB + ': ' + eur(grand) + (ask ? tr(' (+ ' + ask + ' sur demande)', ' (+ ' + ask + ' on request)') : ''));
      var msg = tr('Bonjour, je souhaite réserver cette sélection vue sur ' + SITE, 'Hello, I would like to reserve this selection from ' + SITE) +
        NB + ':\n' + lines.join('\n') + '\n' + money.join('\n') +
        tr('\nMerci de me confirmer la disponibilité et de m’envoyer le lien eBay.', '\nPlease confirm availability and send me the eBay link.') +
        tr('\nLangue du site' + NB + ': français', '\nSite language: English');
      setContact(send, msg, '');
      if (focusKey) {
        var f = list.querySelector('[data-k="' + focusKey + '"]');
        if (f && !f.disabled) f.focus();
        else { var first = list.querySelector('a') || empty.querySelector('a'); if (first) first.focus(); }
      }
    }
    function setQty(ref, q, key) {
      var s = loadSel();
      s[ref] = Math.max(1, Math.min(q, byRef[ref].quantite));
      saveSel(s);
      render(key);
    }
    var SITE_ROOT = new URL('..', new URL(root.getAttribute('data-stock'), location.href));
    function selPic(c) {
      var a = el('a', 'sel-pic');
      a.href = CARDS_DIR + cSlug(c) + '.html';
      a.tabIndex = -1;
      a.setAttribute('aria-hidden', 'true');
      if (c.photo_t) {
        var im = el('img');
        im.src = new URL(c.photo_t, SITE_ROOT).href;
        if (c.photo_xs) im.srcset = im.src + ' 171w, ' + new URL(c.photo_xs, SITE_ROOT).href + ' 400w';
        im.sizes = '(min-width: 640px) 84px, 64px';
        im.alt = ''; im.width = 171; im.height = 240; im.loading = 'lazy'; im.decoding = 'async';
        a.appendChild(im);
        return a;
      }
      a.classList.add('sel-pic--none', 'sel-pic--' + c.type);
      if ((c.pokemons || []).indexOf('Raichu') !== -1) a.classList.add('sel-pic--raichu');
      a.appendChild(el('span', 'sel-pic__top', c.type === 'slab' ? c.etat.libelle : c.type === 'scelle' ? tr('Scellé', 'Sealed') : (c.extension.code || '')));
      var b = d.createElementNS(NS, 'svg');
      b.setAttribute('viewBox', '0 0 12 20'); b.setAttribute('class', 'sel-pic__bolt'); b.setAttribute('focusable', 'false');
      var p = d.createElementNS(NS, 'path');
      p.setAttribute('d', 'M7.6 0 .6 11.4h5L3.9 20l7.5-12.2H6.4L7.6 0z');
      b.appendChild(p);
      a.appendChild(b);
      return a;
    }
    function row(c, q, line, unit, fl) {
      var li = el('li', 'sel-row sel-row--pic');
      li.appendChild(selPic(c));
      var name = el('a', 'sel-row__name', cardLabel(c));
      name.href = CARDS_DIR + cSlug(c) + '.html';
      var price = el('span', 'sel-row__price' + (line === null ? ' price--ask' : ''), line === null ? tr('Sur demande', 'On request') : eur(line));
      if (isSold(c.ref)) li.classList.add('is-reserved');
      else if (isRes(c.ref)) li.classList.add('is-reserved');
      var meta = el('span', 'sel-row__meta', [isSold(c.ref) ? tr('Vendue entre-temps', 'Sold in the meantime') : isRes(c.ref) ? tr('Réservée en ce moment', 'Currently reserved') : '',
        fl ? tr('Coup de foudre −' + fl.pct + NB + '% (au lieu de ' + eur(fl.prix_ref) + ')', 'Lightning deal −' + fl.pct + '% (instead of ' + eur(fl.prix_ref) + ')') : '',
        tr('Réf. ', 'Ref. ') + c.ref, c.extension.code, LANGS[c.langue], cEtat(c),
        q > 1 && unit !== null ? eur(unit) + tr(' pièce', ' each') : ''].filter(Boolean).join(' · '));
      var ctrl = el('div', 'sel-row__ctrl');
      if (c.quantite > 1) {
        var qty = el('div', 'qty');
        qty.setAttribute('role', 'group');
        qty.setAttribute('aria-label', tr('Quantité, ' + c.quantite + ' en stock', 'Quantity, ' + c.quantite + ' in stock'));
        var minus = el('button', '', '−');
        minus.type = 'button';
        minus.setAttribute('aria-label', tr('Un exemplaire de moins', 'One copy fewer'));
        minus.setAttribute('data-k', c.ref + '-moins');
        minus.disabled = q <= 1;
        var out = el('output', '', String(q));
        var plus = el('button', '', '+');
        plus.type = 'button';
        plus.setAttribute('aria-label', tr('Un exemplaire de plus', 'One more copy'));
        plus.setAttribute('data-k', c.ref + '-plus');
        plus.disabled = q >= c.quantite;
        minus.addEventListener('click', function () { setQty(c.ref, q - 1, c.ref + '-moins'); });
        plus.addEventListener('click', function () { setQty(c.ref, q + 1, c.ref + '-plus'); });
        qty.appendChild(minus); qty.appendChild(out); qty.appendChild(plus);
        ctrl.appendChild(qty);
      } else {
        ctrl.appendChild(el('span', 'muted', tr('Exemplaire unique', 'Single copy')));
      }
      var rm = el('button', 'linkbtn', tr('Retirer', 'Remove'));
      rm.type = 'button';
      rm.setAttribute('aria-label', tr('Retirer ', 'Remove ') + cardLabel(c));
      rm.addEventListener('click', function () {
        var s = loadSel();
        delete s[c.ref];
        saveSel(s);
        render('aucun');
      });
      ctrl.appendChild(rm);
      li.appendChild(name); li.appendChild(price); li.appendChild(meta); li.appendChild(ctrl);
      return li;
    }
  }

  /* 7. Etiquettes de stand (QR code vers /s/<ref> : la fiche s'ouvre avec le bandeau « au stand ») */
  var labRoot = d.getElementById('etiquettes');
  if (labRoot) initLabels(labRoot);

  function initLabels(root) {
    var coll = d.getElementById('l-coll'), perUnit = d.getElementById('l-unit'), showPrice = d.getElementById('l-prix');
    var out = root.querySelector('[data-sheets]'), info = root.querySelector('[data-label-count]');
    var printBtn = root.querySelector('[data-print]');
    var cards = [];
    var local = !/^https?:$/.test(location.protocol) || /^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(location.hostname);
    var base = local ? root.getAttribute('data-base') : new URL('./', location.href).href;
    all('[data-label-base]', root).forEach(function (e) { e.textContent = base.replace(/^https?:\/\//, '') + 's/…'; });
    root.querySelector('form').addEventListener('submit', function (e) { e.preventDefault(); });
    printBtn.disabled = true;
    printBtn.addEventListener('click', function () { window.print(); });
    [coll, perUnit, showPrice].forEach(function (c) { c.addEventListener('change', render); });
    loadStock(root.getAttribute('data-stock')).then(function (data) {
      cards = data.cartes.slice().sort(function (a, b) {
        var na = /^\d+$/.test(a.ref) ? +a.ref : 1e6, nb = /^\d+$/.test(b.ref) ? +b.ref : 1e6;
        return na - nb || a.ref.localeCompare(b.ref);
      });
      if (new URLSearchParams(location.search).get('cartes') === 'selection') coll.value = 'selection';
      return loadQR();
    }).then(render).catch(function () { info.textContent = 'Impossible de charger le stock.'; });

    function chosen() {
      var v = coll.value, s = loadSel();
      return cards.filter(function (c) {
        if (v === 'selection') return !!s[c.ref];
        return !v || (c.collections || []).indexOf(v) !== -1;
      }).map(function (c) { return [c, v === 'selection' ? Math.min(s[c.ref], c.quantite) : c.quantite]; });
    }
    function render() {
      if (!window.qrcode) return;
      var items = [];
      chosen().forEach(function (p) { var k = perUnit.checked ? p[1] : 1; for (var i = 0; i < k; i++) items.push(p[0]); });
      out.textContent = '';
      var sheetEl = null;
      items.forEach(function (c, i) {
        if (i % 21 === 0) { sheetEl = el('div', 'sheet'); out.appendChild(sheetEl); }
        sheetEl.appendChild(label(c));
      });
      var pages = Math.ceil(items.length / 21);
      info.textContent = items.length ? items.length + (items.length > 1 ? ' étiquettes' : ' étiquette') + ' · ' +
        pages + (pages > 1 ? ' planches A4' : ' planche A4') : 'Aucune carte pour ce choix.';
      printBtn.disabled = !items.length;
    }
    function label(c) {
      var url = new URL('s/' + c.ref.toLowerCase(), base).href;
      var box = el('div', 'label');
      box.appendChild(qrSvg(url, 'label__qr', 'M'));
      var t = el('div', 'label__txt');
      var brand = el('p', 'label__brand');
      brand.appendChild(d.createTextNode('POKÉ'));
      brand.appendChild(boltSvg());
      brand.appendChild(d.createTextNode('RAICHU'));
      t.appendChild(brand);
      t.appendChild(el('p', 'label__name', c.nom_fr));
      var num = c.type === 'scelle' ? '' : (c.numero ? c.numero + (c.sous_numero ? ' (' + c.sous_numero + ')' : '') : (c.variante || ''));
      var sub = [num, c.edition ? '1re éd.' : '', c.extension.code, c.langue].filter(Boolean).join(' · ');
      t.appendChild(el('p', 'label__num', sub));
      var state = c.etat.libelle + (c.etat.cert ? ' · n° ' + c.etat.cert : '');
      t.appendChild(el('p', 'label__state', state));
      if (showPrice.checked) {
        t.appendChild(el('p', 'label__price' + (c.prix_eur === null ? ' ask' : ''), c.prix_eur === null ? 'Prix sur demande' : eur(c.prix_eur)));
      }
      t.appendChild(el('p', 'label__ref', 'Réf. ' + c.ref + ' · scannez pour la fiche'));
      box.appendChild(t);
      return box;
    }
  }

  /* 8. Au stand (QR des etiquettes) et mode salon du vendeur sur les fiches */
  var salonOn = get('pr.salon') === '1';
  if (lot && !lot.hasAttribute('data-gone')) {
    var lref = lot.getAttribute('data-lot-ref');
    var standParam = new URLSearchParams(location.search).get('stand') === '1';
    if (salonOn) {
      var sb = el('div', 'salon-bar');
      sb.appendChild(el('span', 'salon-bar__t', 'Mode salon · réf. ' + lref));
      var add = el('button', 'btn', 'Ajouter à la vente');
      add.type = 'button';
      add.addEventListener('click', function () {
        var cart = getJSON('pr.salon.panier', false, []);
        var hit = cart.filter(function (x) { return x.ref === lref; })[0];
        var priceEl = d.querySelector('.product__price');
        var p = priceEl && !priceEl.classList.contains('price--ask') ? parseFloat(priceEl.textContent.replace(/[^\d,.]/g, '').replace(/\s/g, '').replace(',', '.')) : null;
        if (hit) hit.q = (hit.q || 1) + 1; else cart.push({ ref: lref, titre: d.querySelector('.product__title').childNodes[0].textContent.trim() + ' ' + (d.querySelector('.product__num') ? d.querySelector('.product__num').textContent : ''), prix: p, q: 1 });
        put('pr.salon.panier', JSON.stringify(cart));
        add.textContent = 'Ajoutée (' + cart.reduce(function (n, x) { return n + (x.q || 1); }, 0) + ')';
      });
      var goSalon = el('a', 'linkbtn', 'Caisse');
      goSalon.href = '/salon.html';
      sb.appendChild(add); sb.appendChild(goSalon);
      d.body.appendChild(sb);
      d.body.classList.add('has-salon-bar');
    } else if (standParam) {
      var stand = el('div', 'stand-banner');
      stand.setAttribute('role', 'note');
      stand.appendChild(el('p', 'stand-banner__t', tr('Vous êtes au stand Poké-Raichu.', 'You are at the Poké-Raichu stand.')));
      stand.appendChild(el('p', '', tr('Achetez-la directement au vendeur, paiement sur place. Pas sur place ? Réservez-la sur WhatsApp.', 'Buy it directly from the seller and pay on the spot. Not at the stand? Reserve it on WhatsApp.')));
      var show = el('button', 'btn', tr('Je la prends : montrer au vendeur', 'I’ll take it: show the seller'));
      show.type = 'button';
      show.addEventListener('click', function () {
        track('stand-achat', { ref: lref });
        sheet(tr('À montrer au vendeur', 'Show this to the seller'), function (dlg) {
          dlg.classList.add('dlg--show');
          dlg.appendChild(el('p', 'show__ref', tr('Réf. ', 'Ref. ') + lref));
          dlg.appendChild(el('p', 'show__name', d.querySelector('.product__title').textContent));
          var pr = d.querySelector('.product__price');
          if (pr) dlg.appendChild(el('p', 'show__price', pr.textContent));
          dlg.appendChild(el('p', 'muted small', tr('Achat sur un salon : pas de droit de rétractation.', 'Purchase at a fair: no right of withdrawal.')));
        });
      });
      stand.appendChild(show);
      var info0 = lot.querySelector('.product__info');
      if (info0) info0.insertBefore(stand, info0.firstChild);
      track('stand-scan', { ref: lref });
    }
  }

  /* 9. Prix indicatifs en livres et dollars (version anglaise) */
  var TX = C.taux_change || {};
  if (EN && +TX.GBP > 0 && +TX.USD > 0) {
    var fx = function (p) {
      var f = function (v, cur) { try { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(v); } catch (e) { return cur + ' ' + Math.round(v); } };
      return '≈ ' + f(p * TX.GBP, 'GBP') + ' · ' + f(p * TX.USD, 'USD');
    };
    var addFx = function (priceEl, p, cls) {
      if (!priceEl || !(p > 0) || priceEl.parentNode.querySelector('.fx')) return;
      var s = el('span', 'fx' + (cls ? ' ' + cls : ''), fx(p));
      s.title = 'Indicative, rate of ' + (TX.date || '') + '. You pay in euros on eBay.';
      priceEl.parentNode.insertBefore(s, priceEl.nextSibling);
    };
    var pp = d.querySelector('.product__price:not(.price--ask)');
    if (pp && lot && !lot.hasAttribute('data-gone')) {
      var tilePrice = parseFloat(pp.textContent.replace(/[^\d.]/g, ''));
      addFx(pp, tilePrice, 'fx--big');
    }
  }

  /* 10. Apercus flous : la photo apparait en fondu des qu'elle est chargee */
  all('.art--photo > img:not(.lqip)').forEach(function (im) {
    var on = function (ev) {
      im.classList.add('is-in');
      if (ev && ev.type === 'error') return;
      /* une fois la photo affichée, l'aperçu flou ne sert plus : on le retire (moins de calques à dessiner au défilement) */
      var q = im.parentNode && im.parentNode.querySelector('.lqip');
      if (q) setTimeout(function () { if (q.parentNode) q.parentNode.removeChild(q); }, 600);
    };
    if (im.complete && im.naturalWidth) on(); else { im.addEventListener('load', on); im.addEventListener('error', on); }
  });

  /* 11. Confidentialite : effacer les donnees, historique et mesure d'audience */
  all('[data-pref]').forEach(function (cb) {
    var k = cb.getAttribute('data-pref');
    if (k === 'memoire') cb.checked = get('pr.memoire') !== 'non';
    if (k === 'mesure') cb.checked = get('pr.mesure') !== 'non';
    if (k === 'moi') cb.checked = get('pr.moi') === 'oui';
    cb.addEventListener('change', function () {
      if (k === 'memoire') { put('pr.memoire', cb.checked ? 'oui' : 'non'); if (!cb.checked) { ['pr.vus', 'pr.visite', 'pr.recherches'].forEach(function (x) { del(x); }); } }
      if (k === 'mesure') put('pr.mesure', cb.checked ? 'oui' : 'non');
      if (k === 'moi') put('pr.moi', cb.checked ? 'oui' : 'non');
    });
  });
  all('[data-wipe]').forEach(function (b) {
    b.addEventListener('click', function () {
      try {
        Object.keys(localStorage).forEach(function (k) { if (/^(pr\.|pokeraichu\.)/.test(k)) localStorage.removeItem(k); });
        Object.keys(sessionStorage).forEach(function (k) { if (/^(pr\.|pokeraichu\.)/.test(k)) sessionStorage.removeItem(k); });
      } catch (e) {}
      if (window.caches && caches.keys) caches.keys().then(function (ks) { ks.forEach(function (k) { if (/^pr-/.test(k)) caches.delete(k); }); });
      all('[data-pref]').forEach(function (cb) { cb.checked = cb.getAttribute('data-pref') !== 'moi'; });
      refreshPicks();
      var ok = d.querySelector('[data-wipe-ok]'); if (ok) ok.hidden = false;
    });
  });

  /* 12. Hors ligne : les pages gardees sur cet appareil */
  var offList = d.querySelector('[data-offline-list]');
  if (offList && window.caches) {
    caches.keys().then(function (ks) {
      return Promise.all(ks.filter(function (k) { return /^pr-/.test(k); }).map(function (k) { return caches.open(k).then(function (c) { return c.keys(); }); }));
    }).then(function (lists) {
      var seen = {};
      [].concat.apply([], lists).forEach(function (r) {
        var u = new URL(r.url);
        if (!/\/(cartes|cards|collections|pokemon|extensions|sets)\/.+\.html$|\/(catalogue|index)\.html$/.test(u.pathname) || seen[u.pathname] || offList.children.length >= 30) return;
        if (EN !== /^\/en\//.test(u.pathname)) return;
        seen[u.pathname] = 1;
        var li = el('li'), a = el('a', 'recent__a', decodeURIComponent(u.pathname.split('/').pop().replace(/\.html$/, '').replace(/-/g, ' ')));
        a.href = u.pathname;
        li.appendChild(a); offList.appendChild(li);
      });
    }).catch(function () {});
  }
  all('[data-reload]').forEach(function (b) { b.addEventListener('click', function () { location.reload(); }); });

  /* 13. Raccourcis clavier : / chercher, fleches fiche precedente ou suivante, Echap effacer, ? aide */
  d.addEventListener('keydown', function (e) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    var tg = e.target, typing = tg && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName));
    if (d.querySelector('dialog[open]')) return;
    if (e.key === 'Escape' && tg && tg.id === 'f-q' && tg.value) {
      e.preventDefault(); tg.value = ''; tg.dispatchEvent(new Event('input', { bubbles: true })); return;
    }
    if (typing || (tg && tg.closest && tg.closest('[data-track]'))) return;
    if (e.key === '/') {
      var fq = d.getElementById('f-q') || d.getElementById('hs-q');
      e.preventDefault();
      if (fq) { fq.focus(); fq.select(); }
      else { var cat = d.querySelector('.site-nav a[href$="catalogue.html"]'); if (cat) location.href = cat.getAttribute('href') + '#chercher'; }
      return;
    }
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && pager && !pager.hidden) {
      var a = pager.querySelector(e.key === 'ArrowLeft' ? 'a[rel="prev"]' : 'a[rel="next"]');
      if (a) { e.preventDefault(); location.href = a.href; }
      return;
    }
    if (e.key === '?') {
      e.preventDefault();
      sheet(tr('Raccourcis clavier', 'Keyboard shortcuts'), function (dlg) {
        var dlx = el('dl', 'keys');
        [['/', tr('Chercher dans le catalogue', 'Search the catalogue')], ['← →', tr('Fiche précédente ou suivante', 'Previous or next listing')],
          [tr('Échap', 'Esc'), tr('Effacer la recherche, fermer', 'Clear the search, close')], ['?', tr('Cette aide', 'This help')]].forEach(function (k) {
          var w = el('div'); var dt = el('dt'); dt.appendChild(el('kbd', '', k[0])); w.appendChild(dt); w.appendChild(el('dd', '', k[1])); dlx.appendChild(w);
        });
        dlg.appendChild(dlx);
      });
    }
  });

  /* 14. Transitions entre la vignette et la fiche (Chrome, Edge, Safari recents ; coupees si mouvement reduit) */
  if (!RM) {
    var VT = 'carte';
    var cardMedia = function () { return d.querySelector('.product__media .gallery__item img:not(.lqip), .product__media .art'); };
    var tileFor = function (url) {
      var u = String(url || '').split('#')[0].split('?')[0];
      return all('a.tile__link').filter(function (a) { return a.href.split('#')[0].split('?')[0] === u; })[0];
    };
    window.addEventListener('pageswap', function (e) {
      if (!e.viewTransition || !e.activation || !e.activation.entry) return;
      var to = e.activation.entry.url, target = null;
      var a = tileFor(to);
      if (a) target = a.querySelector('.art');
      else if (lot) target = cardMedia();
      var vt = e.viewTransition;
      vt.ready.catch(function () {}); vt.finished.catch(function () {});
      if (vt.updateCallbackDone) vt.updateCallbackDone.catch(function () {});
      if (!target) return;
      target.style.viewTransitionName = VT;
      vt.finished.then(function () { target.style.viewTransitionName = ''; }, function () { target.style.viewTransitionName = ''; });
    });
    window.addEventListener('pagereveal', function (e) {
      if (!e.viewTransition) return;
      var from = window.navigation && navigation.activation && navigation.activation.from ? navigation.activation.from.url : '';
      var target = lot ? cardMedia() : null;
      if (!target && from) { var a = tileFor(from); target = a ? a.querySelector('.art') : null; }
      var vt = e.viewTransition;
      vt.ready.catch(function () {}); vt.finished.catch(function () {});
      if (vt.updateCallbackDone) vt.updateCallbackDone.catch(function () {});
      if (!target) return;
      target.style.viewTransitionName = VT;
      vt.ready.then(function () { target.style.viewTransitionName = ''; }, function () { target.style.viewTransitionName = ''; });
    });
  }

  /* 14 bis. Le coin Raichu : un clic sur le n° 026 fait retomber la foudre */
  var strike = d.querySelector('[data-strike]');
  if (strike) strike.addEventListener('click', function () {
    var hero = strike.closest('.rc-hero');
    if (hero) hero.classList.toggle('is-striking');
  });

  /* Petits eclairs partout, en permanence : une nuee orange pale au-dessus du fond des pages (calque a l'echelle du
     document, au-dessus du contenu mais jamais sur un texte, une image, un bouton, l'en-tete ni une zone sombre) et des
     eclairs dores dans les bandeaux sombres (coin Raichu, page Raichu, pied de page). Chaque eclair clignote, glisse un peu,
     s'eteint et revient aussitot ailleurs dans la partie visible. Tout passe par transform/opacity (aucun recalcul de mise
     en page). Arretes onglet cache, impression, pages outils et mouvement reduit. */
  var SKY_TAGS = /^(DIV|SECTION|MAIN|UL|OL|ARTICLE|ASIDE|NAV|FOOTER|HEADER|FORM|DL|FIGURE)$/;
  var SKY_NOT = '.site-header, .raichu-band, .site-footer, .rc-hero, .buybar, .toast, .wa-float, .wa-check, .salon-bar, dialog, ' +
    '.hsearch, .pop, .pop-veil, .charge, .product__media, .gallery, .zoom';
  function skyRGBA(c) {
    var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(c || '');
    return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : [0, 0, 0, c === 'transparent' ? 0 : 1];
  }
  /* verdict par element, garde en memoire (les styles ne bougent pas) : on ne relit pas getComputedStyle a chaque essai */
  var skyMemo = typeof WeakMap === 'function' ? new WeakMap() : null;
  function skyNode(n, page) {
    var m = skyMemo && skyMemo.get(n), k = page ? 'p' : 'b';
    if (m && k in m) return m[k];
    var ok = true;
    if (page && n.matches && n.matches(SKY_NOT)) ok = false;
    if (ok) {
      var cs = getComputedStyle(n);
      if (cs.backgroundImage !== 'none') ok = false;
      else {
        var c = skyRGBA(cs.backgroundColor);
        if (c[3] > 0 && (!page || (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255 < 0.55)) ok = false;
      }
    }
    if (skyMemo) { if (!m) { m = {}; skyMemo.set(n, m); } m[k] = ok; }
    return ok;
  }
  function skyText(e) {
    var m = skyMemo && skyMemo.get(e);
    if (m && 't' in m) return m.t;
    var t = false;
    for (var k = 0; k < e.childNodes.length; k++) if (e.childNodes[k].nodeType === 3 && /\S/.test(e.childNodes[k].data)) { t = true; break; }
    if (skyMemo) { if (!m) { m = {}; skyMemo.set(e, m); } m.t = t; }
    return t;
  }
  function skyFree(x, y, stop, page) {
    if (x < 1 || y < 1 || x > innerWidth - 1 || y > innerHeight - 1) return false;
    var e = d.elementFromPoint(x, y);
    if (e === d.documentElement) e = d.body;
    if (!e || (e !== stop && (!stop.contains(e) || !SKY_TAGS.test(e.tagName)))) return false;
    if (skyText(e)) return false;
    for (var n = e; n && n !== stop; n = n.parentElement) if (!skyNode(n, page)) return false;
    return true;
  }
  /* placements faits par petites touches pendant les temps morts du navigateur : jamais de tache longue */
  var skyQueue = [], skyBusy = false;
  var skyIdle = window.requestIdleCallback ? function (f) { requestIdleCallback(f, { timeout: 1500 }); } : function (f) {
    setTimeout(function () { var t0 = Date.now(); f({ timeRemaining: function () { return Math.max(0, 8 - (Date.now() - t0)); } }); }, 80);
  };
  function skyPump() {
    if (skyBusy || !skyQueue.length) return;
    skyBusy = true;
    skyIdle(function (dl) {
      skyBusy = false;
      while (skyQueue.length && dl.timeRemaining() > 4) {
        var job = skyQueue[0];
        if (job.step()) skyQueue.shift();
      }
      skyPump();
    });
  }
  function startSky(box, n, cls, pk, sz, page) {
    var seen = true, stop = page ? d.body : box.parentElement, BW = 16, BH = 16 * 20 / 12;
    function rnd(a, b) { return a + Math.random() * (b - a); }
    function bolt() {
      var s = d.createElementNS(NS, 'svg');
      s.setAttribute('viewBox', '0 0 12 20');
      s.setAttribute('class', 'sky__bolt ' + cls);
      s.setAttribute('focusable', 'false');
      var p = d.createElementNS(NS, 'path');
      p.setAttribute('d', 'M7.6 0 .6 11.4h5L3.9 20l7.5-12.2H6.4L7.6 0z');
      s.appendChild(p);
      box.appendChild(s);
      return s;
    }
    function later(s, a, b) { setTimeout(function () { want(s); }, rnd(a, b)); }
    /* un eclair demande une place : un essai a la fois dans la partie visible de sa zone (14 essais au plus) */
    function want(s) {
      if (!seen || d.hidden) { later(s, 1000, 1600); return; }
      var w = rnd(sz[0], sz[1]), k = w / BW, h = BH * k, tries = 0;
      skyQueue.push({ step: function () {
        var r = box.getBoundingClientRect(), vw = d.documentElement.clientWidth;
        var x0 = Math.max(r.left, 0) + 6, x1 = Math.min(r.right, vw) - 6 - w, y0 = Math.max(r.top, 0) + 6, y1 = Math.min(r.bottom, innerHeight) - 6 - h;
        if (x1 > x0 && y1 > y0) {
          var x = rnd(x0, x1), y = rnd(y0, y1);
          if (skyFree(x + w / 2, y + h / 2, stop, page) && skyFree(x + 1, y + 1, stop, page) && skyFree(x + w - 1, y + 1, stop, page) &&
              skyFree(x + 1, y + h - 1, stop, page) && skyFree(x + w - 1, y + h - 1, stop, page)) {
            play(s, x - r.left, y - r.top, w, h, k);
            return true;
          }
        }
        if (++tries >= (page ? 14 : 8)) { later(s, 400, 1100); return true; }
        return false;
      } });
      skyPump();
    }
    function play(s, ax, ay, w, h, k) {
      s.setAttribute('data-at', [ax, ay, w, h].map(function (v) { return v.toFixed(1); }).join(','));
      var X = ax + w / 2 - BW / 2, Y = ay + h / 2 - BH / 2, rot = rnd(-26, 26), peak = rnd(pk[0], pk[1]);
      var drift = page ? 6 : 12, dx = rnd(-drift, drift), dy = rnd(drift / 2, drift * 1.3), dr = rnd(-8, 8);
      function tf(ox, oy, rr, kk) {
        return 'translate(' + (X + ox).toFixed(1) + 'px,' + (Y + oy).toFixed(1) + 'px) rotate(' + rr.toFixed(1) + 'deg) scale(' + kk.toFixed(3) + ')';
      }
      if (s._a) s._a.cancel();  /* l'animation precedente (finie, figee) est retiree : une seule par eclair */
      var a = s._a = s.animate([
        { opacity: 0, transform: tf(0, 0, rot, k * 0.7) },
        { opacity: peak, offset: 0.08 },
        { opacity: peak * 0.25, offset: 0.14 },
        { opacity: peak * 0.95, offset: 0.22 },
        { opacity: peak * 0.6, offset: 0.72 },
        { opacity: 0, transform: tf(dx, dy, rot + dr, k) }
      ], { duration: rnd(2200, 3600), easing: 'ease-out', fill: 'both' });
      a.onfinish = function () { later(s, 200, 1400); };
    }
    for (var i = 0; i < n; i++) (function (s, j) { setTimeout(function () { want(s); }, j * rnd(60, 180)); })(bolt(), i);
    if (!page && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { seen = es[0].isIntersecting; }).observe(box);
    }
  }
  if (!RM && d.documentElement.animate && !/(salon|gestion|etiquettes|panneau-salon)\.html$|\/envoi\//.test(location.pathname)) (function () {
   function go() {
    var small = innerWidth < 600;
    all('.raichu-band, .site-footer').forEach(function (band) {
      var sk = el('div', 'sky');
      sk.setAttribute('aria-hidden', 'true');
      sk.setAttribute('data-sky', '');
      band.insertBefore(sk, band.firstChild);
    });
    all('[data-sky]').forEach(function (b) {
      var hero = b.classList.contains('rc-sky');
      startSky(b, hero ? (small ? 6 : 10) : (small ? 4 : 7), 'sky__bolt--gold', [0.45, 0.85], [9, 20], false);
    });
    var layer = el('div', 'sky-page');
    layer.setAttribute('aria-hidden', 'true');
    layer.setAttribute('data-sky', 'page');
    d.body.appendChild(layer);
    var fitSky = function () { layer.style.height = d.body.offsetHeight + 'px'; };
    fitSky();
    if ('ResizeObserver' in window) new ResizeObserver(fitSky).observe(d.body); else window.addEventListener('resize', fitSky);
    var area = d.documentElement.clientWidth * innerHeight;
    startSky(layer, Math.max(8, Math.min(20, Math.round(area / 40000))), 'sky__bolt--page', [0.3, 0.55], [8, 17], true);
   }
   /* apres le chargement, quand le navigateur souffle : la page s'affiche d'abord */
   function soon() { skyIdle(function () { go(); }); }
   if (d.readyState === 'complete') soon(); else window.addEventListener('load', soon);
  })();

  /* 14 ter. Cartes qui sortent du lot : apres 1,5 s sur une vignette (souris) ou un appui long (doigt), la carte grossit,
     passe au premier plan et s'incline en suivant le pointeur. Un clic dessus ouvre la fiche. Coupe si mouvement reduit. */
  if (!RM) (function () {
    var DWELL = 1500, HOLD = 450, SEL = '.tile__link .art, .pocket__link .art';
    var timer = 0, hoverArt = null, pop = null, veil = null, card = null, art = null, mode = '', box = null, raf = 0;
    var lastX = 0, lastY = 0, touch = null, suppress = false;
    function artOf(t) { var a = t && t.closest ? t.closest(SEL) : null; return a && a.closest('a[href]') ? a : null; }
    function tiltTo(x, y) {
      if (!pop) return;
      lastX = x; lastY = y;
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        if (!pop) return;
        var px = Math.min(1, Math.max(0, (lastX - box.left) / box.w)), py = Math.min(1, Math.max(0, (lastY - box.top) / box.h));
        card.style.transform = 'perspective(900px) rotateX(' + ((0.5 - py) * 18).toFixed(2) + 'deg) rotateY(' + ((px - 0.5) * 22).toFixed(2) + 'deg)';
        card.style.setProperty('--gx', (px * 100).toFixed(1) + '%');
        card.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
      });
    }
    function open(a, how) {
      var link = a.closest('a[href]'), r = a.getBoundingClientRect();
      if (!link || r.width < 40 || r.bottom < 0 || r.top > innerHeight) return;
      var vw = d.documentElement.clientWidth, vh = innerHeight, ratio = r.height / r.width, m = 14;
      var w, h, left, top;
      if (how === 'touch') {
        /* au doigt : la carte vient au centre de l'ecran, en grand */
        w = Math.min(vw * 0.8, 420, (vh - 140) / ratio);
        h = w * ratio;
        left = (vw - w) / 2;
        top = Math.max(m, (vh - h) / 2 - 24);
      } else {
        w = Math.min(Math.max(r.width * 1.8, 250), vw - 2 * m, (vh - 2 * m) / ratio);
        if (w < r.width * 1.15) w = Math.min(r.width * 1.15, vw - 8);
        h = w * ratio;
        left = Math.min(Math.max(r.left + r.width / 2 - w / 2, m), vw - w - m);
        top = Math.min(Math.max(r.top + r.height / 2 - h / 2, m), vh - h - m);
      }
      box = { left: left, top: top, w: w, h: h };
      art = a; mode = how;
      veil = el('div', 'pop-veil' + (how === 'touch' ? ' pop-veil--touch' : ''));
      veil.setAttribute('aria-hidden', 'true');
      pop = el('a', 'pop');
      pop.href = link.href;
      pop.tabIndex = -1;
      pop.setAttribute('aria-hidden', 'true');
      card = el('span', 'pop__card');
      var clone = a.cloneNode(true);
      clone.classList.remove('is-popped');
      clone.style.viewTransitionName = '';
      all('[id]', clone).forEach(function (x) { x.removeAttribute('id'); });
      all('[data-zap]', clone).forEach(function (x) { x.removeAttribute('data-zap'); });
      card.appendChild(clone);
      card.appendChild(el('span', 'pop__glare'));
      pop.appendChild(card);
      if (how === 'touch') pop.appendChild(el('span', 'pop__hint', tr('Glissez pour incliner · touchez pour ouvrir', 'Drag to tilt · tap to open')));
      pop.style.left = left + 'px'; pop.style.top = top + 'px'; pop.style.width = w + 'px';
      pop.style.transform = 'translate(' + (r.left - left) + 'px,' + (r.top - top) + 'px) scale(' + (r.width / w) + ')';
      d.body.appendChild(veil);
      d.body.appendChild(pop);
      a.classList.add('is-popped');
      pop.addEventListener('click', function () { var p0 = pop, v0 = veil; pop = veil = null; if (art) art.classList.remove('is-popped'); setTimeout(function () { p0.remove(); v0.remove(); }, 0); });
      pop.addEventListener('pointermove', function (e) { if (e.pointerType !== 'mouse') tiltTo(e.clientX, e.clientY); });
      /* toucher a cote ferme (au relachement du doigt : plus fiable qu'un clic juste apres un glissement) */
      veil.addEventListener('pointerup', function () { close(); });
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          if (!pop) return;
          pop.style.transform = 'none';
          veil.classList.add('is-on');
          tiltTo(lastX || (left + w / 2), lastY || (top + h / 3));
        });
      });
      track('carte-de-pres', { mode: how });
    }
    function close() {
      if (!pop) return;
      var p0 = pop, v0 = veil, a0 = art, c0 = card, b0 = box;
      pop = veil = card = null; mode = '';
      var r = a0.getBoundingClientRect();
      c0.style.transform = '';
      p0.style.transform = 'translate(' + (r.left - b0.left) + 'px,' + (r.top - b0.top) + 'px) scale(' + (r.width / b0.w) + ')';
      v0.classList.remove('is-on');
      setTimeout(function () { p0.remove(); v0.remove(); if (a0 !== art || !pop) a0.classList.remove('is-popped'); }, 340);
    }
    function inside(x, y, b, pad) { return x >= b.left - pad && x <= b.left + b.w + pad && y >= b.top - pad && y <= b.top + b.h + pad; }
    /* souris : 1,5 s immobile sur la meme carte */
    d.addEventListener('pointerover', function (e) {
      if (e.pointerType !== 'mouse' || pop) return;
      var a = artOf(e.target);
      if (a === hoverArt) return;
      clearTimeout(timer);
      hoverArt = a;
      if (a) timer = setTimeout(function () { if (hoverArt === a && !pop) open(a, 'mouse'); }, DWELL);
    });
    d.addEventListener('pointerout', function (e) {
      if (e.pointerType !== 'mouse') return;
      var a = artOf(e.target);
      if (a && a === hoverArt && !(e.relatedTarget && a.contains(e.relatedTarget))) { hoverArt = null; clearTimeout(timer); }
    });
    d.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      lastX = e.clientX; lastY = e.clientY;
      if (!pop || mode !== 'mouse') return;
      var ar = art.getBoundingClientRect();
      if (!inside(e.clientX, e.clientY, box, 6) && !inside(e.clientX, e.clientY, { left: ar.left, top: ar.top, w: ar.width, h: ar.height }, 0)) { close(); return; }
      tiltTo(e.clientX, e.clientY);
    }, { passive: true });
    /* doigt : appui long sans bouger, puis la carte reste ouverte (glisser pour incliner, toucher pour ouvrir, toucher a cote pour fermer) */
    d.addEventListener('touchstart', function (e) {
      if (pop || e.touches.length !== 1) { clearTimeout(timer); touch = null; return; }
      var a = artOf(e.target);
      if (!a) return;
      var t0 = e.touches[0];
      touch = { x: t0.clientX, y: t0.clientY, a: a };
      lastX = t0.clientX; lastY = t0.clientY;
      clearTimeout(timer);
      timer = setTimeout(function () { if (touch && touch.a === a && !pop) { open(a, 'touch'); suppress = true; } }, HOLD);
    }, { passive: true });
    d.addEventListener('touchmove', function (e) {
      if (!touch) return;
      var t0 = e.touches[0];
      if (!pop) {
        if (Math.abs(t0.clientX - touch.x) > 10 || Math.abs(t0.clientY - touch.y) > 10) { clearTimeout(timer); touch = null; }
        return;
      }
      tiltTo(t0.clientX, t0.clientY);
    }, { passive: true });
    function endTouch() { clearTimeout(timer); touch = null; if (suppress) setTimeout(function () { suppress = false; }, 500); }
    d.addEventListener('touchend', endTouch, { passive: true });
    d.addEventListener('touchcancel', endTouch, { passive: true });
    d.addEventListener('click', function (e) {
      /* le doigt qui vient d'ouvrir la carte ne doit pas aussi ouvrir la fiche */
      if (suppress && (artOf(e.target) || (pop && pop.contains(e.target)))) { e.preventDefault(); e.stopPropagation(); suppress = false; }
    }, true);
    d.addEventListener('contextmenu', function (e) { if (touch || pop) e.preventDefault(); }, true);
    window.addEventListener('scroll', function () { if (!touch) clearTimeout(timer); if (pop && mode === 'mouse') close(); }, { passive: true });
    window.addEventListener('resize', close);
    window.addEventListener('pagehide', close);
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && pop) { e.preventDefault(); close(); } });
  })();

  /* 15. Service worker : pages consultees disponibles hors ligne, liens courts resolus sans reseau */
  /* en local (tests), seulement si pr.sw vaut 1 : les tests qui interceptent les requetes restent fiables */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || get('pr.sw') === '1') && !/[?&]sw=0\b/.test(location.search)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }

  /* 16. Accueil : nouvelles cartes depuis la derniere visite */
  var VKEY = 'pr.visite';
  var visit = getJSON(VKEY, false, null);
  var since = d.querySelector('[data-since]');
  var lastLot = visit && +visit.lot ? +visit.lot : 0;
  function recordVisit(maxLot) {
    if (!memOK() || !(maxLot > 0)) return;
    if (!get('pr.visite.session', true)) {
      put('pr.visite.session', String(lastLot), true);
      put(VKEY, JSON.stringify({ lot: Math.max(maxLot, lastLot), t: Date.now() }));
    }
  }
  var sessionLot = get('pr.visite.session', true);
  if (sessionLot !== null) lastLot = +sessionLot || 0;
  var pageMaxLot = all('.tile[data-add]').reduce(function (m, t) { return Math.max(m, +t.getAttribute('data-add') || 0); }, 0);
  if (since && memOK()) {
    loadStock(since.getAttribute('data-stock')).then(function (data) {
      var maxLot = 0, fresh = 0;
      data.cartes.forEach(function (c) { maxLot = Math.max(maxLot, +c.ajout || 0); if (lastLot && (+c.ajout || 0) > lastLot) fresh++; });
      recordVisit(maxLot);
      if (fresh) {
        since.textContent = '';
        since.appendChild(boltSvg());
        since.appendChild(el('span', '', tr(fresh + (fresh > 1 ? ' nouvelles cartes' : ' nouvelle carte') + ' depuis votre dernière visite. ',
          fresh + (fresh > 1 ? ' new cards' : ' new card') + ' since your last visit. ')));
        var a = el('a', '', tr('Les voir', 'See them'));
        var cat = d.querySelector('.site-nav a[href$="catalogue.html"]');
        a.href = (cat ? cat.getAttribute('href') : 'catalogue.html') + '?nouveau=1';
        since.appendChild(a);
        since.hidden = false;
      }
    }).catch(function () {});
  } else if (pageMaxLot) {
    recordVisit(pageMaxLot);
  }

  /* 17. Page introuvable : les cartes les plus proches de l'adresse demandee */
  var nf = d.querySelector('[data-notfound]');
  if (nf) {
    var words = norm(decodeURIComponent(location.pathname.split('/').pop() || '').replace(/\.html$/, '')).split(/[^a-z0-9]+/).filter(function (w) { return w.length > 1; });
    if (words.length) loadStock(nf.getAttribute('data-stock')).then(function (data) {
      var scored = data.cartes.map(function (c) {
        var hay = norm([c.slug, c.en && c.en.slug, c.titre, c.nom_en, c.extension.code].join(' '));
        var sc = words.reduce(function (n, w) { return n + (hay.indexOf(w) !== -1 ? (w.length > 3 ? 2 : 1) : 0); }, 0);
        return [sc, c];
      }).filter(function (x) { return x[0] >= 2; }).sort(function (a, b) { return b[0] - a[0]; }).slice(0, 4);
      if (!scored.length) return;
      var ul = nf.querySelector('ul');
      scored.forEach(function (x) {
        var li = el('li'), a = el('a', 'recent__a', cardLabel(x[1]));
        a.href = '/' + (EN ? 'en/cards/' : 'cartes/') + cSlug(x[1]) + '.html';
        li.appendChild(a); ul.appendChild(li);
      });
      nf.hidden = false;
    }).catch(function () {});
  }

  /* 18. Catalogue : recherche tolerante, filtres, tri, nouveautes, recherches enregistrees */
  var root = d.getElementById('catalogue');
  if (root) initCatalogue(root);

  /* Recherche tolerante, partagee par le catalogue et la recherche de l'en-tete */
  function synonymsOf(s) {
    var SYN = { 'sar': 'special art rare', ' ar ': 'art rare', ' sr ': 'super rare', 'chr': 'character rare', ' ur ': 'ultra rare', 'fur': 'full art',
      ' jp ': 'japon japan jap', ' kr ': 'coree korea', ' fr ': 'vf france francaise', 'psa 10': 'psa10 gem mint', 'psa 9': 'psa9', 'pca 10': 'pca10', 'pca 9.5': 'pca9.5' };
    var padded = ' ' + (s || '') + ' ', out = [];
    Object.keys(SYN).forEach(function (k) { if (padded.indexOf(k) !== -1) out.push(SYN[k]); });
    return out.join(' ');
  }
  /* distance d'edition (Damerau-Levenshtein restreinte), bornee pour rester rapide */
  function dist(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev2 = null, prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      var best = i;
      for (j = 1; j <= b.length; j++) {
        var cost = a[i - 1] === b[j - 1] ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
        if (cur[j] < best) best = cur[j];
      }
      if (best > max) return max + 1;
      prev2 = prev; prev = cur;
    }
    return prev[b.length];
  }
  function tolerance(t) { return t.length >= 7 ? 2 : t.length >= 4 ? 1 : 0; }
  function normQuery(s) {
    return norm(s).replace(/\b(psa|pca|bgs|cgc)\s*(\d+(?:[.,]5)?)\b/g, function (m, g, n) { return g + ' ' + n.replace(',', '.'); })
      .replace(/[’'"]/g, ' ').trim();
  }

  function initCatalogue(root) {
    var grid = root.querySelector('[data-grid]');
    var form = root.querySelector('form');
    var q = d.getElementById('f-q');
    var KEYS = ['lang', 'ext', 'grade', 'pk', 'prix', 'tri'];
    var sel = { lang: d.getElementById('f-lang'), ext: d.getElementById('f-ext'), grade: d.getElementById('f-grade'),
      pk: d.getElementById('f-pk'), prix: d.getElementById('f-prix'), tri: d.getElementById('f-tri') };
    var chips = all('[data-chip-cat]', root);
    var pkChips = all('[data-chip-pk]', root);
    var dropChip = root.querySelector('[data-chip-drop]');
    var newChip = root.querySelector('[data-chip-new]');
    var count = root.querySelector('[data-count]');
    var empty = root.querySelector('[data-empty]');
    var reset = root.querySelector('[data-reset]');
    var saveBtn = root.querySelector('[data-save-search]');
    var fuzzyNote = root.querySelector('[data-fuzzy]');
    var suggest = root.querySelector('[data-suggest]');
    var more = root.querySelector('[data-more-filters]');
    var mfCount = root.querySelector('[data-mf-count]');
    var searchLink = root.querySelector('[data-search-link]');
    var mq = window.matchMedia ? window.matchMedia('(min-width: 900px)') : null;
    function syncMore() { if (more && mq && mq.matches) more.open = true; }
    syncMore();
    if (mq && mq.addEventListener) mq.addEventListener('change', syncMore);
    var items = all('.tile', grid).map(function (t) {
      var p = t.getAttribute('data-price'), fp = t.getAttribute('data-flash');
      if (fp && flashOn()) p = fp;
      return {
        el: t, ref: t.getAttribute('data-ref'), cat: t.getAttribute('data-cat'), lang: t.getAttribute('data-lang'), ext: t.getAttribute('data-ext'),
        grade: t.getAttribute('data-grade'), pk: t.getAttribute('data-pk'), price: p === '' ? null : parseFloat(p), sel: +t.getAttribute('data-sel'),
        rec: +t.getAttribute('data-rec'), name: t.getAttribute('data-name'), s: t.getAttribute('data-search'),
        qty: +t.getAttribute('data-qty'), add: +t.getAttribute('data-add') || 0, drop: !!t.getAttribute('data-drop'), flash: !!fp
      };
    });
    /* prix en direct arrives apres l'ouverture : tri et filtres de prix suivent */
    d.addEventListener('pr:prices', function () {
      items.forEach(function (o) {
        if (o.flash && flashOn()) return;
        var p = o.el.getAttribute('data-price');
        o.price = p === '' || p === null ? null : parseFloat(p);
      });
      lastSort = null;
      apply();
    });
    /* index enrichi (synonymes, vocabulaire des fautes de frappe) construit a la premiere recherche seulement */
    var vocab = null;
    function ensureIndex() {
      if (vocab) return;
      var v = {};
      items.forEach(function (o) {
        o.s = o.s + ' ' + synonymsOf(o.s);
        o.s.split(/\s+/).forEach(function (w) { if (w.length > 2) v[w] = 1; });
      });
      vocab = Object.keys(v);
    }
    function fresh() { return { q: '', cat: '', lang: '', ext: '', grade: '', pk: '', prix: '', tri: 'selection', baisse: '', nouveau: '' }; }
    var st = fresh();
    var lastSort = 'selection';
    function hasOption(s, v) { return all('option', s).some(function (o) { return o.value === v; }); }
    var params = new URLSearchParams(location.search);
    Object.keys(st).forEach(function (k) { var v = params.get(k); if (v !== null) st[k] = v; });
    KEYS.forEach(function (k) { if (!hasOption(sel[k], st[k])) st[k] = k === 'tri' ? 'selection' : ''; });
    if (st.cat && !chips.some(function (c) { return c.getAttribute('data-chip-cat') === st.cat; })) st.cat = '';
    /* coups de foudre en cours : les compteurs du filtre de prix suivent les prix flash */
    if (flashOn() && items.some(function (o) { return o.flash; })) {
      var keep = st.prix;
      all('option', sel.prix).forEach(function (op) {
        if (!op.value) return;
        st.prix = op.value;
        var n = items.filter(budgetOk).length;
        op.textContent = op.textContent.replace(/\(\d+\)\s*$/, '(' + n + ')');
      });
      st.prix = keep;
    }
    if (st.baisse && !dropChip) st.baisse = '';
    /* « Nouveau pour vous » : cartes arrivees depuis la visite precedente (numero de lot, aucune date) */
    var maxLot = items.reduce(function (m, o) { return Math.max(m, o.add); }, 0);
    var nNew = lastLot ? items.filter(function (o) { return o.add > lastLot; }).length : 0;
    recordVisit(maxLot);
    if (newChip && nNew && memOK()) {
      newChip.hidden = false;
      newChip.querySelector('[data-new-n]').textContent = '(' + nNew + ')';
      items.forEach(function (o) { if (o.add > lastLot) o.el.classList.add('is-new'); });
    } else st.nouveau = '';

    function plural(n, a, b) { return n + ' ' + ((EN ? n !== 1 : n > 1) ? b : a); }
    function budgetOk(o) {
      var p = o.price;
      switch (st.prix) {
        case 'max10': return p !== null && p <= 10;
        case '10-50': return p !== null && p > 10 && p <= 50;
        case '50-100': return p !== null && p > 50 && p <= 100;
        case '100plus': return p !== null && p > 100;
        case 'demande': return p === null;
        default: return true;
      }
    }
    function cmpPrice(a, b, dir) {
      var pa = a.price === null ? Infinity : a.price, pb = b.price === null ? Infinity : b.price;
      if (pa === pb) return a.sel - b.sel;
      return pa < pb ? -dir : dir;
    }
    function sortItems() {
      if (lastSort === st.tri) return;
      lastSort = st.tri;
      var arr = items.slice();
      arr.sort(function (a, b) {
        switch (st.tri) {
          case 'prix-asc': return cmpPrice(a, b, 1);
          case 'prix-desc': return cmpPrice(a, b, -1);
          case 'nom': return a.name.localeCompare(b.name, 'fr') || a.sel - b.sel;
          case 'recent': return b.add - a.add || b.rec - a.rec || a.sel - b.sel;
          default: return a.sel - b.sel;
        }
      });
      var frag = d.createDocumentFragment();
      arr.forEach(function (o) { frag.appendChild(o.el); });
      grid.appendChild(frag);
    }
    function expand(t) {
      if (items.some(function (o) { return o.s.indexOf(t) !== -1; })) return null;
      var tol = tolerance(t), out = [];
      if (!tol) return out;
      vocab.forEach(function (w) { if (dist(t, w, tol) <= tol) out.push(w); });
      return out;
    }
    function closest(t) {
      var best = null, bd = 4;
      vocab.forEach(function (w) { var dd = dist(t, w, 3); if (dd < bd) { bd = dd; best = w; } });
      return best;
    }
    var lastFuzzy = [];
    function apply() {
      var toks = normQuery(st.q).split(/\s+/).filter(Boolean);
      if (toks.length) ensureIndex();
      var plan = toks.map(function (t) { var ex = expand(t); return { t: t, alts: ex }; });
      lastFuzzy = plan.filter(function (p) { return p.alts && p.alts.length; });
      var n = 0, u = 0;
      items.forEach(function (o) {
        var ok = (!st.cat || o.cat === st.cat) && (!st.lang || o.lang === st.lang) && (!st.ext || o.ext === st.ext) &&
          (!st.grade || o.grade === st.grade) && (!st.pk || o.pk.indexOf('|' + st.pk + '|') !== -1) && budgetOk(o) &&
          (!st.baisse || o.drop) && (!st.nouveau || o.el.classList.contains('is-new')) &&
          plan.every(function (p) {
            if (!p.alts) return o.s.indexOf(p.t) !== -1;
            return p.alts.some(function (w) { return (' ' + o.s + ' ').indexOf(' ' + w) !== -1; });
          });
        o.el.hidden = !ok;
        if (ok) { n++; u += o.qty; }
      });
      sortItems();
      count.lastChild.textContent = plural(n, tr('fiche', 'listing'), tr('fiches', 'listings')) + ' · ' + plural(u, tr('article', 'item'), tr('articles', 'items'));
      empty.hidden = n !== 0;
      if (fuzzyNote) {
        var fz = lastFuzzy.filter(function (p) { return p.alts.indexOf(p.t) === -1; });
        fuzzyNote.hidden = !(n && fz.length);
        fuzzyNote.textContent = n && fz.length ? tr('Résultats approchés pour ', 'Approximate results for ') + fz.map(function (p) { return '« ' + p.t + ' »'; }).join(', ') +
          tr(' : ', ': ') + fz.map(function (p) { return p.alts.slice(0, 3).join(' / '); }).join(', ') : '';
      }
      if (suggest) {
        suggest.textContent = '';
        suggest.hidden = true;
        if (!n && toks.length) {
          var fixed = toks.map(function (t) { return items.some(function (o) { return o.s.indexOf(t) !== -1; }) ? t : (closest(t) || t); });
          var guess = fixed.join(' ');
          if (guess !== toks.join(' ')) {
            suggest.appendChild(d.createTextNode(tr('Vouliez-vous dire ', 'Did you mean ')));
            var b = el('button', 'linkbtn', guess);
            b.type = 'button';
            b.addEventListener('click', function () { st.q = guess; q.value = guess; apply(); });
            suggest.appendChild(b);
            suggest.appendChild(d.createTextNode(tr(' ?', '?')));
            suggest.hidden = false;
          }
        }
      }
      if (searchLink) searchLink.href = (EN ? 'find-a-card.html' : 'recherche.html') + (st.q.trim() ? '?q=' + encodeURIComponent(st.q.trim()) : '');
      chips.forEach(function (c) { c.setAttribute('aria-pressed', String(c.getAttribute('data-chip-cat') === st.cat)); });
      pkChips.forEach(function (c) { c.setAttribute('aria-pressed', String(c.getAttribute('data-chip-pk') === st.pk)); });
      if (dropChip) dropChip.setAttribute('aria-pressed', String(!!st.baisse));
      if (newChip) newChip.setAttribute('aria-pressed', String(!!st.nouveau));
      var dirty = st.q || st.cat || st.lang || st.ext || st.grade || st.pk || st.prix || st.tri !== 'selection' || st.baisse || st.nouveau;
      reset.hidden = !dirty;
      if (saveBtn) saveBtn.hidden = !(memOK() && (st.q || st.cat || st.lang || st.ext || st.grade || st.pk || st.prix || st.baisse)) || isSaved();
      var adv = (st.lang ? 1 : 0) + (st.ext ? 1 : 0) + (st.grade ? 1 : 0) + (st.pk ? 1 : 0) + (st.prix ? 1 : 0) + (st.tri !== 'selection' ? 1 : 0);
      if (mfCount) { mfCount.textContent = adv + tr(adv > 1 ? ' actifs' : ' actif', ' active'); mfCount.hidden = adv === 0; }
      var p = new URLSearchParams();
      Object.keys(st).forEach(function (k) { if (st[k] && !(k === 'tri' && st[k] === 'selection')) p.set(k, st[k]); });
      var qs = p.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
      if (st.q && st.q.length > 2) { clearTimeout(trackTimer); trackTimer = setTimeout(function () { track('recherche', { q: st.q.slice(0, 40), resultats: n }); }, 1500); }
    }
    var trackTimer;
    function syncControls() {
      q.value = st.q;
      KEYS.forEach(function (k) { sel[k].value = st[k]; });
    }
    var timer;
    q.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { st.q = q.value; apply(); }, 120);
    });
    KEYS.forEach(function (k) {
      sel[k].addEventListener('change', function () { st[k] = sel[k].value; apply(); });
    });
    chips.forEach(function (c) {
      c.addEventListener('click', function () { st.cat = c.getAttribute('data-chip-cat'); apply(); });
    });
    pkChips.forEach(function (c) {
      c.addEventListener('click', function () {
        var v = c.getAttribute('data-chip-pk');
        st.pk = st.pk === v ? '' : v;
        sel.pk.value = st.pk;
        apply();
      });
    });
    if (dropChip) dropChip.addEventListener('click', function () { st.baisse = st.baisse ? '' : '1'; apply(); });
    if (newChip) newChip.addEventListener('click', function () { st.nouveau = st.nouveau ? '' : '1'; apply(); });
    form.addEventListener('submit', function (e) { e.preventDefault(); clearTimeout(timer); st.q = q.value; apply(); q.blur(); });
    reset.addEventListener('click', function () { st = fresh(); syncControls(); apply(); q.focus(); });
    all('[data-reset-link]', root).forEach(function (b) { b.addEventListener('click', function () { reset.click(); }); });

    /* recherches enregistrees : on garde les references deja vues pour signaler les nouvelles */
    var SKEY = 'pr.recherches';
    function curQs() {
      var p = new URLSearchParams();
      ['q', 'cat', 'lang', 'ext', 'grade', 'pk', 'prix', 'baisse'].forEach(function (k) { if (st[k]) p.set(k, st[k]); });
      return p.toString();
    }
    function isSaved() { var qs = curQs(); return getJSON(SKEY, false, []).some(function (x) { return x.qs === qs; }); }
    function visibleRefs() { return items.filter(function (o) { return !o.el.hidden; }).map(function (o) { return o.ref; }); }
    function labelOf() {
      var parts = [];
      if (st.q) parts.push('« ' + st.q + ' »');
      if (st.pk) parts.push(st.pk);
      if (st.cat) { var ch0 = chips.filter(function (c) { return c.getAttribute('data-chip-cat') === st.cat; })[0]; if (ch0) parts.push(ch0.textContent.trim()); }
      ['lang', 'ext', 'grade', 'prix'].forEach(function (k) { if (st[k]) parts.push(sel[k].options[sel[k].selectedIndex].text.replace(/\s*\(\d+\)$/, '')); });
      if (st.baisse) parts.push(tr('baisse de prix', 'price drop'));
      return parts.join(' · ') || tr('Tout le catalogue', 'Whole catalogue');
    }
    window.__prSaveSearch = function () {
      if (!memOK()) return;
      var list = getJSON(SKEY, false, []).filter(function (x) { return x.qs !== curQs(); });
      list.unshift({ qs: curQs(), label: labelOf(), vus: visibleRefs() });
      put(SKEY, JSON.stringify(list.slice(0, 8)));
      renderSaved();
      apply();
      track('recherche-enregistree');
    };
    if (saveBtn) saveBtn.addEventListener('click', function () { window.__prSaveSearch(); toast(tr('Recherche enregistrée : les nouvelles cartes seront signalées ici.', 'Search saved: new matching cards will be flagged here.'), false); });
    var savedBox = root.querySelector('[data-saved]');
    function matchQs(qs) {
      var keep = st, keepSort = lastSort;
      st = fresh();
      new URLSearchParams(qs).forEach(function (v, k) { if (k in st) st[k] = v; });
      var toks = normQuery(st.q).split(/\s+/).filter(Boolean);
      if (toks.length) ensureIndex();
      toks = toks.map(function (t) { return { t: t, alts: expand(t) }; });
      var refs = items.filter(function (o) {
        return (!st.cat || o.cat === st.cat) && (!st.lang || o.lang === st.lang) && (!st.ext || o.ext === st.ext) &&
          (!st.grade || o.grade === st.grade) && (!st.pk || o.pk.indexOf('|' + st.pk + '|') !== -1) && budgetOk(o) && (!st.baisse || o.drop) &&
          toks.every(function (p) { return !p.alts ? o.s.indexOf(p.t) !== -1 : p.alts.some(function (w) { return (' ' + o.s + ' ').indexOf(' ' + w) !== -1; }); });
      }).map(function (o) { return o.ref; });
      st = keep; lastSort = keepSort;
      return refs;
    }
    function renderSaved() {
      if (!savedBox) return;
      var list = getJSON(SKEY, false, []), ul = savedBox.querySelector('[data-saved-list]');
      ul.textContent = '';
      list.forEach(function (x, i) {
        var now = matchQs(x.qs), nouv = now.filter(function (r) { return (x.vus || []).indexOf(r) === -1; }).length;
        var li = el('li', 'saved__i');
        var a = el('a', 'recent__a', x.label + (nouv ? ' · ' + nouv + tr(nouv > 1 ? ' nouvelles' : ' nouvelle', ' new') : ''));
        if (nouv) a.classList.add('has-new');
        a.href = location.pathname + '?' + x.qs;
        a.addEventListener('click', function (e) {
          e.preventDefault();
          var l2 = getJSON(SKEY, false, []); if (l2[i]) { l2[i].vus = now; put(SKEY, JSON.stringify(l2)); }
          st = fresh(); new URLSearchParams(x.qs).forEach(function (v, k) { if (k in st) st[k] = v; });
          syncControls(); apply(); renderSaved();
        });
        var rm = el('button', 'saved__x', '×');
        rm.type = 'button';
        rm.setAttribute('aria-label', tr('Supprimer la recherche ', 'Delete search ') + x.label);
        rm.addEventListener('click', function () { var l2 = getJSON(SKEY, false, []); l2.splice(i, 1); put(SKEY, JSON.stringify(l2)); renderSaved(); apply(); });
        li.appendChild(a); li.appendChild(rm); ul.appendChild(li);
      });
      savedBox.hidden = !list.length || !memOK();
    }
    syncControls();
    if (more && (st.lang || st.ext || st.grade || st.pk || st.prix || st.tri !== 'selection')) more.open = true;
    apply();
    renderSaved();
    liveReady.then(function () { applyStatuses(); });
    var recent = root.querySelector('[data-recent]');
    if (recent && memOK()) {
      var rl = recent.querySelector('[data-recent-list]');
      getJSON('pr.vus', false, []).forEach(function (ref) {
        var t = /^[A-Za-z0-9]+$/.test(ref) ? grid.querySelector('.tile[data-ref="' + ref + '"]') : null;
        var l = t && t.querySelector('a.tile__link');
        if (!l || rl.children.length >= 8) return;
        var nm = t.querySelector('.tile__name'), sb = t.querySelector('.tile__sub');
        var li = el('li'), a = el('a', 'recent__a', [nm && nm.textContent, sb && sb.textContent].filter(Boolean).join(' · '));
        a.href = l.href;
        li.appendChild(a);
        rl.appendChild(li);
      });
      recent.hidden = rl.children.length === 0;
    }
    if (location.hash === '#chercher') { q.focus(); }
    var navType = ((window.performance && performance.getEntriesByType && performance.getEntriesByType('navigation')[0]) || {}).type;
    if (navType === 'navigate' && get('pr.cat.url', true) === location.href && /\/(cartes|cards)\//.test(d.referrer)) {
      var y = +get('pr.cat.y', true) || 0;
      if (y > 0) window.scrollTo(0, y);
    }
  }
})();

/* Préchargement à l'intention, pour les navigateurs sans « Speculation Rules » (Safari, Firefox) : dès que le doigt se pose
   sur un lien du site (ou que la souris s'y arrête), le service worker va chercher la page ; elle s'ouvre alors sans attente.
   Rien si le visiteur économise ses données ou si la connexion est très lente. */
(function () {
  'use strict';
  try {
    if (HTMLScriptElement.supports && HTMLScriptElement.supports('speculationrules')) return;
    if (!('serviceWorker' in navigator)) return;
    var conn = navigator.connection || {};
    if (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '')) return;
    var done = {}, timer = 0;
    var pre = function (a) {
      if (!a || !a.href || a.origin !== location.origin || a.target === '_blank' || a.hasAttribute('download')) return;
      var p = a.pathname;
      if (done[p] || p === location.pathname || !/\.html$|\/$/.test(p) || /^\/(envoi|gestion|salon)/.test(p)) return;
      var sw = navigator.serviceWorker.controller;
      if (!sw) return;
      done[p] = 1;
      sw.postMessage({ type: 'pre', url: p + a.search });
    };
    var link = function (e) { return e.target && e.target.closest ? e.target.closest('a[href]') : null; };
    document.addEventListener('touchstart', function (e) { pre(link(e)); }, { passive: true, capture: true });
    document.addEventListener('mouseover', function (e) {
      var a = link(e);
      clearTimeout(timer);
      if (a) timer = setTimeout(function () { pre(a); }, 90);
    }, { passive: true });
  } catch (err) { /* jamais bloquant */ }
})();

/* Menu qui déborde (téléphone étroit, onglet Coups de foudre affiché) : bord droit estompé tant qu'il reste à faire défiler */
(function () {
  'use strict';
  var nav = document.querySelector('.site-nav');
  if (!nav) return;
  var sync = function () {
    var clipped = nav.scrollWidth - nav.clientWidth > 4;
    nav.classList.toggle('is-clipped', clipped);
    nav.classList.toggle('at-end', clipped && nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 4);
  };
  sync();
  nav.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync, { passive: true });
})();
