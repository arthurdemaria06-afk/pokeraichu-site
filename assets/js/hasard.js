/* Poké-Raichu · accueil : à chaque visite, 8 fiches tirées au hasard dans tout le stock.
   Le gabarit <template> qui précède ce script contient les vignettes candidates (avec photo, hors coin Raichu
   et dernières arrivées, déjà visibles plus bas). Sans JavaScript, la grille d'origine reste affichée. */
(function () {
  'use strict';
  var me = document.currentScript;
  var pool = me && me.previousElementSibling;
  if (!pool || pool.tagName !== 'TEMPLATE' || !pool.content) return;
  var grid = pool.previousElementSibling;
  while (grid && !(grid.tagName === 'UL' && /(^|\s)grid(\s|$)/.test(grid.className))) grid = grid.previousElementSibling;
  if (!grid) return;
  var n = parseInt(pool.getAttribute('data-n'), 10) || 8;
  var tiles = Array.prototype.slice.call(pool.content.children);
  if (tiles.length < n) return;
  function rand(max) {
    if (window.crypto && window.crypto.getRandomValues) {
      var a = new Uint32Array(1);
      window.crypto.getRandomValues(a);
      return a[0] % max;
    }
    return Math.floor(Math.random() * max);
  }
  for (var i = tiles.length - 1; i > 0; i--) {
    var j = rand(i + 1), tmp = tiles[i];
    tiles[i] = tiles[j];
    tiles[j] = tmp;
  }
  var frag = document.createDocumentFragment();
  for (var k = 0; k < n; k++) {
    var li = document.importNode(tiles[k], true);
    var imgs = li.querySelectorAll('img');
    for (var m = 0; m < imgs.length; m++) {
      var img = imgs[m];
      if (/(^|\s)lqip(\s|$)/.test(img.className)) continue;
      img.setAttribute('loading', k < 4 ? 'eager' : 'lazy');
      if (k === 0) img.setAttribute('fetchpriority', 'high');
      else img.removeAttribute('fetchpriority');
    }
    frag.appendChild(li);
  }
  while (grid.firstChild) grid.removeChild(grid.firstChild);
  grid.appendChild(frag);
  pool.parentNode.removeChild(pool);
})();
