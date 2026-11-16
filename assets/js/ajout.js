/* Poké-Raichu · /gestion.html : ajouter une carte au stock depuis le téléphone.
   La carte (photo recadrée + infos) est enregistrée dans le dépôt GitHub du site (_ajouts/), en un seul envoi ;
   Cloudflare reconstruit alors le site et crée ses vraies pages FR et EN (_outils/construire.py), en 2 à 3 minutes.
   Clé : la même que pour les prix (stockée sur ce téléphone), avec l'accès « Contents: Read and write » au dépôt. */
(function () {
  'use strict';
  var d = document;
  var root = d.querySelector('[data-ajout]');
  if (!root) return;
  var C = window.PR_CONFIG || {};
  var REPO = String(C.depot || '').trim();
  var BRANCH = String(C.depot_branche || 'main').trim();
  var API = 'https://api.github.com/repos/' + REPO;
  var FILE = '_ajouts/cartes.json';
  var LANGS = [['JP', 'Japonaise'], ['FR', 'Française'], ['KR', 'Coréenne'], ['EN', 'Anglaise'], ['CN', 'Chinoise']];
  var RARS = ['SAR', 'SR', 'CHR', 'AR', 'FUR', 'Réédition 30 ans', 'Promo', 'RRR', 'RR', 'R', 'Holo', 'Full art', 'Chromatique', 'Commune'];
  var ETATS = ['Near Mint', 'Excellent', 'Très bon état', 'Bon état', 'Abîmée'];
  var GRADERS = ['PSA', 'PCA', 'CGC', 'BGS', 'SGC', 'CCC'];
  var MAXPH = 3;

  function $(s, r) { return (r || root).querySelector(s); }
  function el(tag, cls, text) { var e = d.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function token() { return get('pr.gestion.jeton') || ''; }
  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
  function clean(s, n) { return String(s || '').replace(/[\u0000-\u001f<>"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n || 80); }
  function eur(p) { return (Math.round(p * 100) / 100).toString().replace('.', ',') + ' €'; }

  var body = $('[data-ajout-body]');
  if (!/^[\w.-]+\/[\w.-]+$/.test(REPO)) {
    body.appendChild(el('p', 'muted', 'Pas encore activé : il manque l’adresse du dépôt du site dans config.js (« depot »).'));
    return;
  }

  /* --------------------------------------------------------------- GitHub */
  function gh(method, path, data) {
    return fetch(API + path, {
      method: method, cache: 'no-store',
      headers: { 'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json' },
      body: data ? JSON.stringify(data) : undefined
    }).then(function (r) {
      if (r.status === 404 && method === 'GET' && path.indexOf('/contents/') === 0) return null;
      if (!r.ok) { var e = new Error('GitHub ' + r.status); e.status = r.status; throw e; }
      return r.status === 204 ? null : r.json();
    });
  }
  function b64utf8(s) { return btoa(unescape(encodeURIComponent(s))); }
  function unb64utf8(s) { return decodeURIComponent(escape(atob(String(s).replace(/\s/g, '')))); }
  function readAjouts() {
    return gh('GET', '/contents/' + FILE + '?ref=' + encodeURIComponent(BRANCH)).then(function (f) {
      if (!f) return { cartes: [] };
      try { var o = JSON.parse(unb64utf8(f.content)); return o && Array.isArray(o.cartes) ? o : { cartes: [] }; } catch (e) { return { cartes: [] }; }
    });
  }
  /* un seul commit : photos + liste, ou suppression */
  function commit(message, files) {
    var head;
    return gh('GET', '/git/ref/heads/' + encodeURIComponent(BRANCH)).then(function (ref) {
      head = ref.object.sha;
      return gh('GET', '/git/commits/' + head);
    }).then(function (cm) {
      var tree = [];
      return files.reduce(function (p, f) {
        return p.then(function () {
          if (f.remove) { tree.push({ path: f.path, mode: '100644', type: 'blob', sha: null }); return; }
          return gh('POST', '/git/blobs', { content: f.b64, encoding: 'base64' }).then(function (b) {
            tree.push({ path: f.path, mode: '100644', type: 'blob', sha: b.sha });
          });
        });
      }, Promise.resolve()).then(function () {
        return gh('POST', '/git/trees', { base_tree: cm.tree.sha, tree: tree });
      });
    }).then(function (t) {
      return gh('POST', '/git/commits', { message: message, tree: t.sha, parents: [head] });
    }).then(function (c) {
      return gh('PATCH', '/git/refs/heads/' + encodeURIComponent(BRANCH), { sha: c.sha });
    });
  }
  function failMsg(e) {
    if (!token()) return 'Enregistrez d’abord votre clé GitHub en haut de la page.';
    if (e && e.status === 401) return 'Clé refusée par GitHub : elle a peut-être expiré. Créez-en une nouvelle et collez-la en haut de la page.';
    if (e && (e.status === 403 || e.status === 404)) return 'Votre clé n’a pas accès au dépôt « ' + REPO + ' ». Sur GitHub, modifiez la clé : Repository access → ce dépôt, et Contents → Read and write.';
    if (e && (e.status === 409 || e.status === 422)) return 'GitHub était occupé. Réessayez dans quelques secondes.';
    return 'Envoi impossible pour le moment (réseau ?). Rien n’a été modifié, réessayez.';
  }

  /* --------------------------------------------------------------- stock actuel */
  var STOCK = null, PK_EN = {}, EXTS = [];
  fetch('data/stock.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (s) {
    STOCK = s;
    (s.cartes || []).forEach(function (c) {
      (c.pokemons || []).forEach(function (p, i) { var e = c.en && c.en.pokemons ? c.en.pokemons[i] : null; if (e && !PK_EN[p]) PK_EN[p] = e; });
    });
    var seen = {};
    ((s.taxonomies && s.taxonomies.extensions) || []).concat((s.cartes || []).map(function (c) { return c.extension; })).forEach(function (x) {
      if (!x || !x.code || !x.nom) return;
      var k = x.code + ' · ' + x.nom;
      if (!seen[k]) { seen[k] = 1; EXTS.push({ code: x.code, nom: x.nom, label: k }); }
    });
    fillLists();
  }).catch(function () {});

  function nextRef(aj) {
    var m = 0;
    function take(r) { if (/^\d{1,5}$/.test(String(r))) m = Math.max(m, +r); }
    if (STOCK) {
      (STOCK.cartes || []).forEach(function (c) { take(c.ref); });
      (STOCK.vendus || []).forEach(function (c) { take(c && c.ref); });
      (STOCK.parties || []).forEach(function (c) { take(c && c.ref); });
    }
    (aj.cartes || []).forEach(function (c) { take(c.ref); });
    var n = String(m + 1);
    while (n.length < 3) n = '0' + n;
    return n;
  }

  /* --------------------------------------------------------------- formulaire */
  var form = el('form', 'ajout-form');
  form.noValidate = true;
  form.innerHTML =
    '<fieldset class="ajout-photos"><legend>Photos</legend><p class="muted small">La première photo sert de vignette. Cadrez la carte dans le rectangle.</p><div class="ajout-slots" data-slots></div></fieldset>' +
    '<div class="field"><label for="a-nom">Nom de la carte</label><input class="input" id="a-nom" name="nom" autocomplete="off" placeholder="Dracaufeu-ex" maxlength="80"></div>' +
    '<div class="field"><label for="a-num">Numéro</label><input class="input" id="a-num" name="num" autocomplete="off" placeholder="201/165" maxlength="20"></div>' +
    '<div class="field"><label for="a-ext">Extension</label><input class="input" id="a-ext" name="ext" list="a-ext-list" autocomplete="off" placeholder="SV2a · Pokémon Card 151"><datalist id="a-ext-list"></datalist>' +
    '<div class="ajout-ext-new" data-ext-new hidden><div class="field"><label for="a-ext-code">Code de l’extension</label><input class="input" id="a-ext-code" maxlength="20" placeholder="SV2a"></div>' +
    '<div class="field"><label for="a-ext-nom">Nom de l’extension</label><input class="input" id="a-ext-nom" maxlength="60" placeholder="Pokémon Card 151"></div></div></div>' +
    '<div class="field"><label for="a-lang">Langue</label><select class="select" id="a-lang"></select></div>' +
    '<div class="field"><label for="a-rar">Rareté</label><select class="select" id="a-rar"><option value="">Aucune ou inconnue</option></select></div>' +
    '<div class="field"><label for="a-pk">Pokémon</label><input class="input" id="a-pk" list="a-pk-list" autocomplete="off" placeholder="Dracaufeu"><datalist id="a-pk-list"></datalist><p class="muted small">Plusieurs : séparez par une virgule.</p></div>' +
    '<fieldset class="field"><legend>État</legend><div class="chips"><button type="button" class="chip" data-etat="brute" aria-pressed="true">Non gradée</button><button type="button" class="chip" data-etat="gradee" aria-pressed="false">Gradée</button></div>' +
    '<div data-brute><label class="sr-only" for="a-etat">État de la carte</label><select class="select" id="a-etat"></select></div>' +
    '<div class="ajout-grade" data-gradee hidden><div class="field"><label for="a-soc">Société</label><select class="select" id="a-soc"></select></div>' +
    '<div class="field"><label for="a-note">Note</label><input class="input" id="a-note" inputmode="decimal" placeholder="10" maxlength="4"></div>' +
    '<div class="field"><label for="a-cert">N° de certificat (facultatif)</label><input class="input" id="a-cert" inputmode="numeric" maxlength="12"></div></div></fieldset>' +
    '<div class="ajout-row"><div class="field"><label for="a-qty">Quantité</label><input class="input" id="a-qty" type="number" min="1" max="99" value="1" inputmode="numeric"></div>' +
    '<div class="field"><label for="a-prix">Prix</label><div class="prix-box"><input id="a-prix" inputmode="decimal" placeholder="95" maxlength="9"><span class="prix-box__eur">€</span></div></div></div>' +
    '<details class="ajout-more"><summary>Version anglaise du site (facultatif)</summary><div class="field"><label for="a-nom-en">Nom anglais de la carte</label><input class="input" id="a-nom-en" maxlength="80" placeholder="Charizard ex"></div>' +
    '<p class="muted small">Laissé vide : le nom français est repris.</p></details>' +
    '<p class="ajout-err" data-err role="alert"></p>' +
    '<div class="ajout-recap" data-recap hidden></div>' +
    '<div class="actions"><button type="submit" class="btn" data-go>Vérifier</button><button type="button" class="linkbtn" data-back hidden>Modifier</button></div>' +
    '<p class="ajout-msg" data-msg aria-live="polite"></p>';
  body.appendChild(form);
  var listBox = el('div', 'ajout-list');
  body.appendChild(listBox);

  LANGS.forEach(function (l) { var o = el('option', null, l[1]); o.value = l[0]; $('#a-lang', form).appendChild(o); });
  RARS.forEach(function (r) { var o = el('option', null, r); o.value = r; $('#a-rar', form).appendChild(o); });
  ETATS.forEach(function (r) { var o = el('option', null, r); o.value = r; $('#a-etat', form).appendChild(o); });
  GRADERS.forEach(function (r) { var o = el('option', null, r); o.value = r; $('#a-soc', form).appendChild(o); });

  function fillLists() {
    var dl = $('#a-ext-list', form);
    EXTS.forEach(function (x) { var o = d.createElement('option'); o.value = x.label; dl.appendChild(o); });
    var pl = $('#a-pk-list', form);
    Object.keys(PK_EN).sort(function (a, b) { return norm(a) < norm(b) ? -1 : 1; }).forEach(function (p) { var o = d.createElement('option'); o.value = p; pl.appendChild(o); });
  }
  function extFromInput() {
    var v = clean($('#a-ext', form).value, 90);
    var hit = EXTS.filter(function (x) { return norm(x.label) === norm(v); })[0];
    var box = $('[data-ext-new]', form);
    if (hit) { box.hidden = true; return { code: hit.code, nom: hit.nom }; }
    box.hidden = !v;
    if (v && !$('#a-ext-code', form).value && !$('#a-ext-nom', form).value) {
      var parts = v.split(/\s*[·|-]\s*/);
      if (parts.length > 1) { $('#a-ext-code', form).value = parts[0]; $('#a-ext-nom', form).value = parts.slice(1).join(' '); }
      else $('#a-ext-nom', form).value = v;
    }
    return { code: clean($('#a-ext-code', form).value, 20), nom: clean($('#a-ext-nom', form).value, 60) };
  }
  $('#a-ext', form).addEventListener('change', extFromInput);
  $('#a-ext', form).addEventListener('blur', extFromInput);

  var etatType = 'brute';
  Array.prototype.forEach.call(form.querySelectorAll('[data-etat]'), function (b) {
    b.addEventListener('click', function () {
      etatType = b.getAttribute('data-etat');
      Array.prototype.forEach.call(form.querySelectorAll('[data-etat]'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      $('[data-brute]', form).hidden = etatType !== 'brute';
      $('[data-gradee]', form).hidden = etatType === 'brute';
    });
  });

  /* --------------------------------------------------------------- photos + recadrage 5:7 */
  var OUT_W = 1143, OUT_H = 1600;
  var slots = [];
  function addSlot() {
    var i = slots.length;
    var s = { img: null, rot: 0, z: 1, x: 0, y: 0, el: el('div', 'ajout-slot') };
    s.el.innerHTML = '<div class="crop" data-crop hidden><div class="crop__frame" data-frame><img alt="" data-im draggable="false"></div>' +
      '<p class="crop__hint muted small">Faites glisser la photo et zoomez pour que la carte remplisse le cadre.</p><div class="crop__tools"><label class="sr-only" for="a-zoom-' + i + '">Zoom</label><input type="range" id="a-zoom-' + i + '" min="1" max="4" step="0.01" value="1" data-zoom>' +
      '<button type="button" class="linkbtn" data-rot>Pivoter</button><button type="button" class="linkbtn" data-del>Retirer</button></div></div>' +
      '<label class="btn btn--ghost ajout-pick"><input type="file" accept="image/*" data-file hidden><span>' + (i === 0 ? 'Ajouter la photo' : 'Ajouter une autre photo (dos, détail)') + '</span></label>';
    $('[data-slots]', form).appendChild(s.el);
    slots.push(s);
    var frame = $('[data-frame]', s.el), im = $('[data-im]', s.el), zoom = $('[data-zoom]', s.el);
    function base() { // echelle qui couvre le cadre
      var w = s.rot % 180 ? s.img.height : s.img.width, h = s.rot % 180 ? s.img.width : s.img.height;
      return Math.max(frame.clientWidth / w, frame.clientHeight / h);
    }
    function clamp() {
      var sc = base() * s.z;
      var w = (s.rot % 180 ? s.img.height : s.img.width) * sc, h = (s.rot % 180 ? s.img.width : s.img.height) * sc;
      var mx = Math.max(0, (w - frame.clientWidth) / 2), my = Math.max(0, (h - frame.clientHeight) / 2);
      s.x = Math.max(-mx, Math.min(mx, s.x)); s.y = Math.max(-my, Math.min(my, s.y));
    }
    function draw() {
      if (!s.img) return;
      clamp();
      var sc = base() * s.z;
      im.style.width = s.img.width * sc + 'px';
      im.style.height = s.img.height * sc + 'px';
      im.style.transform = 'translate(-50%,-50%) translate(' + s.x + 'px,' + s.y + 'px) rotate(' + s.rot + 'deg)';
    }
    s.draw = draw;
    $('[data-file]', s.el).addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      var url = URL.createObjectURL(f);
      var img = new Image();
      img.onload = function () {
        s.img = img; s.rot = 0; s.z = 1; s.x = 0; s.y = 0; zoom.value = 1;
        im.src = url;
        $('[data-crop]', s.el).hidden = false;
        $('.ajout-pick span', s.el).textContent = 'Changer de photo';
        requestAnimationFrame(draw);
        if (slots.length < MAXPH && slots[slots.length - 1].img) addSlot();
        invalidate();
      };
      img.onerror = function () { showErr('Cette photo ne peut pas être lue. Essayez une capture d’écran ou une autre photo.'); };
      img.src = url;
    });
    zoom.addEventListener('input', function () { s.z = +zoom.value; draw(); invalidate(); });
    $('[data-rot]', s.el).addEventListener('click', function () { s.rot = (s.rot + 90) % 360; s.x = s.y = 0; draw(); invalidate(); });
    $('[data-del]', s.el).addEventListener('click', function () {
      s.img = null; im.removeAttribute('src'); $('[data-crop]', s.el).hidden = true; $('[data-file]', s.el).value = '';
      $('.ajout-pick span', s.el).textContent = i === 0 ? 'Ajouter la photo' : 'Ajouter une autre photo (dos, détail)';
      invalidate();
    });
    var drag = null;
    frame.addEventListener('pointerdown', function (e) { if (!s.img) return; drag = { x: e.clientX, y: e.clientY, sx: s.x, sy: s.y }; frame.setPointerCapture(e.pointerId); });
    frame.addEventListener('pointermove', function (e) { if (!drag) return; s.x = drag.sx + e.clientX - drag.x; s.y = drag.sy + e.clientY - drag.y; draw(); });
    frame.addEventListener('pointerup', function () { drag = null; invalidate(); });
    frame.addEventListener('pointercancel', function () { drag = null; });
    window.addEventListener('resize', draw);
  }
  addSlot();

  function render(s) { // recadrage final 1143 x 1600
    return new Promise(function (ok, ko) {
      var frame = $('[data-frame]', s.el);
      var fw = frame.clientWidth, k = OUT_W / fw;
      var cv = d.createElement('canvas'); cv.width = OUT_W; cv.height = OUT_H;
      var g = cv.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, OUT_W, OUT_H);
      var w = s.rot % 180 ? s.img.height : s.img.width, h = s.rot % 180 ? s.img.width : s.img.height;
      var sc = Math.max(frame.clientWidth / w, frame.clientHeight / h) * s.z * k;
      g.translate(OUT_W / 2 + s.x * k, OUT_H / 2 + s.y * k);
      g.rotate(s.rot * Math.PI / 180);
      g.imageSmoothingQuality = 'high';
      g.drawImage(s.img, -s.img.width * sc / 2, -s.img.height * sc / 2, s.img.width * sc, s.img.height * sc);
      cv.toBlob(function (b) {
        if (!b) return ko(new Error('photo'));
        var fr = new FileReader();
        fr.onload = function () { ok(String(fr.result).split(',')[1]); };
        fr.onerror = ko;
        fr.readAsDataURL(b);
      }, 'image/jpeg', 0.9);
    });
  }

  /* --------------------------------------------------------------- verification, envoi */
  var ready = null;
  function showErr(t) { $('[data-err]', form).textContent = t || ''; }
  function invalidate() {
    if (!ready) return;
    ready = null;
    $('[data-recap]', form).hidden = true;
    $('[data-go]', form).textContent = 'Vérifier';
    $('[data-back]', form).hidden = true;
  }
  form.addEventListener('input', invalidate);
  $('[data-back]', form).addEventListener('click', function () { invalidate(); $('#a-nom', form).focus(); });

  function collect() {
    var nom = clean($('#a-nom', form).value), num = clean($('#a-num', form).value, 20);
    var ext = extFromInput();
    var prix = parseFloat(String($('#a-prix', form).value).replace(/\s/g, '').replace(',', '.'));
    var q = parseInt($('#a-qty', form).value, 10) || 1;
    var photos = slots.filter(function (s) { return s.img; });
    if (!photos.length) return 'Ajoutez au moins une photo de la carte.';
    if (!nom) return 'Indiquez le nom de la carte.';
    if (!num) return 'Indiquez le numéro de la carte (ex. 201/165).';
    if (!ext.code || !ext.nom) return 'Choisissez l’extension dans la liste, ou remplissez son code et son nom.';
    if (!(prix > 0 && prix < 100000)) return 'Indiquez un prix valable.';
    if (q < 1 || q > 99) return 'Quantité entre 1 et 99.';
    var etat;
    if (etatType === 'brute') etat = { type: 'brute', libelle: $('#a-etat', form).value };
    else {
      var note = String($('#a-note', form).value).replace(',', '.').trim();
      if (!/^\d{1,2}(\.\d)?$/.test(note)) return 'Indiquez la note de gradation (ex. 10 ou 9.5).';
      etat = { type: $('#a-soc', form).value, note: note, cert: String($('#a-cert', form).value).replace(/\D/g, '').slice(0, 12) || null };
    }
    var pks = clean($('#a-pk', form).value, 160).split(/\s*,\s*/).map(function (p) { return clean(p, 40); }).filter(Boolean).slice(0, 4);
    pks = pks.map(function (p) { var hit = Object.keys(PK_EN).filter(function (k) { return norm(k) === norm(p); })[0]; return hit || p; });
    return {
      nom_fr: nom, nom_en: clean($('#a-nom-en', form).value) || nom, numero: num, prix_eur: Math.round(prix * 100) / 100, quantite: q,
      langue: $('#a-lang', form).value, extension: ext, etat: etat, rarete: $('#a-rar', form).value || null,
      pokemons: pks, pokemons_en: pks.map(function (p) { return PK_EN[p] || p; }), _photos: photos
    };
  }
  function recap(x) {
    var lab = x.etat.type === 'brute' ? x.etat.libelle : x.etat.type + ' ' + x.etat.note;
    var langue = LANGS.filter(function (l) { return l[0] === x.langue; })[0][1];
    var box = $('[data-recap]', form);
    box.innerHTML = '';
    box.appendChild(el('p', 'ajout-recap__t', 'Vérifiez avant d’ajouter'));
    var dl = el('dl', 'specs');
    [['Carte', x.nom_fr + ' ' + x.numero], ['Extension', x.extension.code + ' · ' + x.extension.nom], ['Langue', langue], ['Rareté', x.rarete || '—'],
      ['Pokémon', x.pokemons.join(', ') || '—'], ['État', lab + (x.etat.cert ? ' · certificat ' + x.etat.cert : '')],
      ['Quantité', String(x.quantite)], ['Prix', eur(x.prix_eur)], ['Photos', String(x._photos.length)]].forEach(function (r) {
      dl.appendChild(el('dt', null, r[0])); dl.appendChild(el('dd', null, r[1]));
    });
    box.appendChild(dl);
    box.hidden = false;
  }
  var busy = false;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    showErr('');
    var x = collect();
    if (typeof x === 'string') { showErr(x); return; }
    if (!token()) { showErr('Enregistrez d’abord votre clé GitHub en haut de la page.'); return; }
    if (!ready) {
      ready = x; recap(x);
      $('[data-go]', form).textContent = 'Ajouter au site';
      $('[data-back]', form).hidden = false;
      $('[data-recap]', form).scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    send(ready);
  });
  function setMsg(t, cls) { var m = $('[data-msg]', form); m.textContent = t; m.className = 'ajout-msg' + (cls ? ' ' + cls : ''); }
  function send(x) {
    busy = true;
    var go = $('[data-go]', form);
    go.disabled = true;
    setMsg('Préparation des photos…');
    var b64s = [];
    x._photos.reduce(function (p, s) { return p.then(function () { return render(s).then(function (b) { b64s.push(b); }); }); }, Promise.resolve())
      .then(function () { setMsg('Envoi sur GitHub…'); return readAjouts(); })
      .then(function (aj) {
        var ref = nextRef(aj);
        var entry = { ref: ref, ajoute_le: new Date().toISOString().slice(0, 10), nom_fr: x.nom_fr, nom_en: x.nom_en, numero: x.numero, prix_eur: x.prix_eur,
          quantite: x.quantite, langue: x.langue, extension: x.extension, etat: x.etat, rarete: x.rarete, pokemons: x.pokemons, pokemons_en: x.pokemons_en,
          photos: b64s.length };
        aj.cartes.push(entry);
        var files = b64s.map(function (b, i) { return { path: '_ajouts/photos/' + ref + '-' + (i + 1) + '.jpg', b64: b }; });
        files.push({ path: FILE, b64: b64utf8(JSON.stringify(aj, null, 1) + '\n') });
        return commit('Ajout de la carte ' + ref + ' : ' + x.nom_fr + ' ' + x.numero, files).then(function () { return entry; });
      })
      .then(function (entry) {
        busy = false; go.disabled = false;
        resetForm();
        setMsg('Carte ajoutée (réf. ' + entry.ref + '). Le site se met à jour : la fiche sera en ligne dans 2 à 3 minutes.', 'is-ok');
        watch(entry.ref);
        showList();
      })
      .catch(function (err) {
        busy = false; go.disabled = false;
        setMsg('');
        showErr(failMsg(err));
      });
  }
  function resetForm() {
    ready = null;
    form.reset();
    $('[data-recap]', form).hidden = true;
    $('[data-back]', form).hidden = true;
    $('[data-go]', form).textContent = 'Vérifier';
    $('[data-ext-new]', form).hidden = true;
    slots.forEach(function (s) { s.el.remove(); });
    slots = [];
    addSlot();
    etatType = 'brute';
    Array.prototype.forEach.call(form.querySelectorAll('[data-etat]'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-etat') === 'brute')); });
    $('[data-brute]', form).hidden = false;
    $('[data-gradee]', form).hidden = true;
  }
  /* suivi de la mise en ligne */
  function watch(ref) {
    var t0 = Date.now();
    (function tick() {
      fetch('data/stock.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (s) {
        var c = (s.cartes || []).filter(function (x) { return x.ref === ref; })[0];
        if (c) {
          var m = $('[data-msg]', form);
          m.textContent = 'En ligne : ';
          var a = el('a', null, c.titre + ' →');
          a.href = 'cartes/' + c.slug + '.html';
          m.appendChild(a);
          m.className = 'ajout-msg is-ok';
          STOCK = s;
          return;
        }
        if (Date.now() - t0 < 8 * 60 * 1000) setTimeout(tick, 15000);
        else setMsg('La mise à jour prend plus longtemps que prévu. Vérifiez sur Cloudflare (Workers et Pages, onglet Deployments) si besoin.', 'is-warn');
      }).catch(function () { if (Date.now() - t0 < 8 * 60 * 1000) setTimeout(tick, 15000); });
    })();
  }

  /* --------------------------------------------------------------- cartes ajoutées (retrait possible) */
  function showList() {
    if (!token()) { listBox.innerHTML = ''; return; }
    readAjouts().then(function (aj) {
      listBox.innerHTML = '';
      if (!aj.cartes.length) return;
      listBox.appendChild(el('h3', 'ajout-list__h', 'Cartes ajoutées depuis cette page'));
      var ul = el('ul', 'ajout-list__ul');
      aj.cartes.slice().reverse().forEach(function (c) {
        var li = el('li');
        li.appendChild(el('span', null, c.ref + ' · ' + c.nom_fr + ' ' + c.numero + ' · ' + eur(c.prix_eur)));
        var b = el('button', 'linkbtn', 'Retirer du site');
        b.type = 'button';
        var armed = false;
        b.addEventListener('click', function () {
          if (!armed) { armed = true; b.textContent = 'Confirmer le retrait'; b.classList.add('is-warn'); return; }
          b.disabled = true; b.textContent = 'Retrait…';
          readAjouts().then(function (cur) {
            var n = 0;
            cur.cartes = cur.cartes.filter(function (x) { if (x.ref === c.ref) { n = x.photos || 0; return false; } return true; });
            var files = [];
            for (var i = 1; i <= n; i++) files.push({ path: '_ajouts/photos/' + c.ref + '-' + i + '.jpg', remove: true });
            files.push({ path: FILE, b64: b64utf8(JSON.stringify(cur, null, 1) + '\n') });
            return commit('Retrait de la carte ' + c.ref, files);
          }).then(function () {
            li.textContent = c.ref + ' · ' + c.nom_fr + ' ' + c.numero + ' : retirée, le site se met à jour (2 à 3 minutes).';
          }).catch(function (err) { b.disabled = false; armed = false; b.textContent = 'Retirer du site'; showErr(failMsg(err)); });
        });
        li.appendChild(b);
        ul.appendChild(li);
      });
      listBox.appendChild(ul);
    }).catch(function () {});
  }
  root.addEventListener('toggle', function () { if (root.open) showList(); });
})();
