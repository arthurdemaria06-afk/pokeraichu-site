/* Poké-Raichu · service worker
   Pages : réseau d'abord (toujours à jour), copie de secours hors ligne.
   Styles, scripts, polices et photos versionnés : cache d'abord (ils ne changent jamais à adresse égale).
   Hors ligne : pages déjà vues, liens courts /r/ et /s/ résolus avec le stock gardé, sinon page « Hors ligne ». */
'use strict';
var VERSION = '71b8ec2b01';
var CACHE = 'pr-' + VERSION;
var SALON = 'pr-salon';
var PRECACHE = ["/", "/index.html", "/catalogue.html", "/selection.html", "/hors-ligne.html", "/en/index.html", "/en/offline.html", "/en/selection.html", "/config.js", "/data/stock.json", "/assets/css/site.css?v=080ec330", "/assets/js/site.js?v=d9c45a4f", "/assets/js/hasard.js?v=4a27143b", "/assets/fonts/libre-caslon-display-400.woff2", "/assets/fonts/libre-caslon-text-400.woff2", "/assets/fonts/libre-caslon-text-700.woff2", "/assets/img/logo.svg?v=5dfcbaeb", "/assets/img/marque.svg?v=f3e27339", "/favicon.svg?v=f3e27339"];
var MAX_PAGES = 160;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(PRECACHE.map(function (u) { return c.add(new Request(u, { cache: 'reload' })).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE && k !== SALON && /^pr-/.test(k); }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function trim(cache) {
  cache.keys().then(function (keys) {
    var pages = keys.filter(function (r) { return /\.html$|\/$/.test(new URL(r.url).pathname); });
    if (pages.length > MAX_PAGES) pages.slice(0, pages.length - MAX_PAGES).forEach(function (r) { cache.delete(r); });
  });
}

function fromCache(req, opts) {
  return caches.match(req, opts).then(function (r) { return r || caches.match(req, { ignoreSearch: true }); });
}

function offlinePage(url) {
  var en = /^\/en\//.test(url.pathname);
  return caches.match(en ? '/en/offline.html' : '/hors-ligne.html');
}

/* Lien court hors ligne : /r/102, /en/r/102, /s/102 -> fiche, d'après le stock gardé */
function shortLink(url) {
  var m = url.pathname.match(/^\/(en\/)?([rs])\/([A-Za-z0-9]+)\/?$/);
  if (!m) return Promise.resolve(null);
  return caches.match('/data/stock.json', { ignoreSearch: true }).then(function (r) { return r ? r.json() : null; }).then(function (data) {
    if (!data) return null;
    var ref = m[3].toUpperCase(), c = null;
    (data.cartes || []).forEach(function (x) { if (String(x.ref).toUpperCase() === ref) c = x; });
    if (!c) return null;
    var dest = m[1] ? '/en/cards/' + c.en.slug + '.html' : '/cartes/' + c.slug + '.html' + (m[2] === 's' ? '?stand=1' : '');
    return Response.redirect(dest, 302);
  }).catch(function () { return null; });
}

/* Pages : le réseau d'abord, et chaque page reçue est mise en cache avec son heure. Une page en cache depuis moins de
   FRESH (vue à l'instant, ou préchargée quand le doigt se pose sur un lien) est servie sans attendre le réseau :
   la navigation est immédiate. Les pages ne changent qu'à une publication, qui remplace ce fichier et vide le cache. */
var FRESH = 10 * 60 * 1000;
function isPage(url) { return /\.html$|\/$/.test(url.pathname) && !/^\/(envoi|gestion|salon)/.test(url.pathname); }

function netPage(req, url) {
  return fetch(req).then(function (res) {
    if (res.ok && res.type === 'basic' && !res.redirected && !/^\/(envoi|gestion|salon)/.test(url.pathname)) {
      var copy = res.clone(), h = new Headers(res.headers);
      h.set('x-pr-at', String(Date.now()));
      h.delete('content-length'); h.delete('content-encoding');
      copy.blob().then(function (b) {
        var kept = new Response(b, { status: 200, statusText: res.statusText, headers: h });
        return caches.open(CACHE).then(function (c) { return c.put(req, kept).then(function () { trim(c); }); });
      }).catch(function () {});
    }
    return res;
  });
}

function freshCopy(req, url) {
  if (!isPage(url)) return Promise.resolve(null);
  return caches.open(CACHE).then(function (c) { return c.match(req, { ignoreSearch: true, ignoreVary: true }); }).then(function (hit) {
    var at = hit ? +hit.headers.get('x-pr-at') : 0;
    return at && Date.now() - at < FRESH ? hit : null;
  }).catch(function () { return null; });
}

/* Préchargement à l'intention : la page demande de préparer un lien que le visiteur s'apprête à ouvrir */
self.addEventListener('message', function (e) {
  var d = e.data || {};
  if (d.type !== 'pre' || typeof d.url !== 'string') return;
  var url;
  try { url = new URL(d.url, self.location.origin); } catch (err) { return; }
  if (url.origin !== self.location.origin || !isPage(url)) return;
  var req = new Request(url.pathname + url.search, { credentials: 'same-origin' });
  e.waitUntil(freshCopy(req, url).then(function (hit) { return hit || netPage(req, url); }).catch(function () {}));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/sw.js') return;
  /* videos : lecture directe par le navigateur (requetes partielles), jamais copiees dans le cache */
  if (/^\/assets\/videos\//.test(url.pathname) || req.headers.has('range')) return;
  var versioned = /^\/assets\/(css|js|fonts|photos|partage|img)\//.test(url.pathname) && (url.search.indexOf('v=') !== -1 || /^\/assets\/(fonts|photos|partage)\//.test(url.pathname));
  if (versioned) {
    e.respondWith(caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
        return res;
      });
    }));
    return;
  }
  if (req.mode === 'navigate' || /\.html$|\/$/.test(url.pathname) || /^\/(en\/)?[rs]\//.test(url.pathname)) {
    var viaNet = function () {
      return netPage(req, url).catch(function () {
        return shortLink(url).then(function (r) {
          return r || fromCache(req).then(function (hit) { return hit || offlinePage(url); });
        });
      });
    };
    /* page vue ou préchargée il y a moins de 10 minutes : rendue tout de suite, puis rafraîchie en arrière-plan */
    e.respondWith(freshCopy(req, url).then(function (hit) {
      if (!hit) return viaNet();
      e.waitUntil(netPage(req, url).catch(function () {}));
      return hit;
    }));
    return;
  }
  /* config.js, stock, statuts : réseau d'abord, copie de secours */
  e.respondWith(fetch(req).then(function (res) {
    if (res.ok && res.type === 'basic') { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return fromCache(req).then(function (hit) { return hit || new Response('', { status: 504, statusText: 'Hors ligne' }); });
  }));
});

/* Mode salon : la page demande de garder tout le stock pour un usage sans réseau */
self.addEventListener('message', function (e) {
  var d = e.data || {};
  if (d.type !== 'salon-precache' || !Array.isArray(d.urls)) return;
  e.waitUntil(caches.open(SALON).then(function (c) {
    var done = 0;
    return Promise.all(d.urls.map(function (u) {
      return c.add(new Request(u, { cache: 'reload' })).then(function () { done++; }).catch(function () {});
    })).then(function () {
      if (e.source) e.source.postMessage({ type: 'salon-precache-done', done: done, total: d.urls.length });
    });
  }));
});
