/* Poké-Raichu · /tirage.html : décompte des participations d'un jeu concours et tirage au sort.
   Les fichiers exportés (CSV, Excel .xlsx, JSON ou texte collé) sont lus sur l'appareil : rien n'est envoyé.
   Tirage pondéré par le nombre de participations, avec le générateur aléatoire du navigateur (crypto). */
(function () {
  'use strict';
  var d = document;
  var root = d.getElementById('tirage');
  if (!root) return;
  function $(s) { return root.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(root.querySelectorAll(s)); }
  function el(tag, cls, text) { var e = d.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
  function norm(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[_\-’']/g, ' ').replace(/\s+/g, ' ').trim(); }
  function handle(s) { return String(s == null ? '' : s).trim().replace(/^@+/, '').replace(/\s+/g, '').toLowerCase(); }
  function fmtInt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function pct(a, b) { var p = b ? a * 100 / b : 0; return (p >= 10 ? Math.round(p) : (Math.round(p * 10) / 10)).toString().replace('.', ',') + ' %'; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function stamp(t) { var x = new Date(t); return pad(x.getDate()) + '/' + pad(x.getMonth() + 1) + '/' + x.getFullYear() + ' à ' + pad(x.getHours()) + ':' + pad(x.getMinutes()) + ':' + pad(x.getSeconds()); }
  var NETS = { instagram: 'Instagram', tiktok: 'TikTok', liste: 'Liste' };

  /* ------------------------------------------------------------------ lecture des fichiers */
  function decode(buf) {
    var b = new Uint8Array(buf);
    if (b[0] === 0xFF && b[1] === 0xFE) return new TextDecoder('utf-16le').decode(b);
    if (b[0] === 0xFE && b[1] === 0xFF) return new TextDecoder('utf-16be').decode(b);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(b).replace(/^﻿/, ''); } catch (e) { return new TextDecoder('windows-1252').decode(b); }
  }
  function parseCSV(text) {
    var first = text.split(/\r?\n/, 1)[0] || '';
    var cand = [',', ';', '\t'], best = ',', bestN = -1;
    cand.forEach(function (c) { var n = first.split(c).length; if (n > bestN) { bestN = n; best = c; } });
    var rows = [], row = [], f = '', q = false, i = 0, n = text.length;
    for (; i < n; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += ch;
      } else if (ch === '"') q = true;
      else if (ch === best) { row.push(f); f = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
      else f += ch;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
  }
  /* .xlsx = archive zip : lecture du répertoire central puis décompression avec DecompressionStream */
  function unzip(buf) {
    var v = new DataView(buf), u8 = new Uint8Array(buf), eocd = -1;
    for (var i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) { if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
    if (eocd < 0) return Promise.reject(new Error('zip'));
    var count = v.getUint16(eocd + 10, true), off = v.getUint32(eocd + 16, true), files = {};
    for (var k = 0; k < count; k++) {
      if (v.getUint32(off, true) !== 0x02014b50) break;
      var method = v.getUint16(off + 10, true), csize = v.getUint32(off + 20, true);
      var nlen = v.getUint16(off + 28, true), elen = v.getUint16(off + 30, true), clen = v.getUint16(off + 32, true), loc = v.getUint32(off + 42, true);
      var name = new TextDecoder().decode(u8.subarray(off + 46, off + 46 + nlen));
      files[name] = { method: method, csize: csize, loc: loc };
      off += 46 + nlen + elen + clen;
    }
    function read(name) {
      var f = files[name];
      if (!f) return Promise.resolve(null);
      var start = f.loc + 30 + v.getUint16(f.loc + 26, true) + v.getUint16(f.loc + 28, true);
      var data = u8.subarray(start, start + f.csize);
      if (f.method === 0) return Promise.resolve(new TextDecoder().decode(data));
      if (typeof DecompressionStream === 'undefined') return Promise.reject(new Error('inflate'));
      var stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Response(stream).arrayBuffer().then(function (b) { return new TextDecoder().decode(b); });
    }
    return Promise.resolve({ read: read, names: Object.keys(files) });
  }
  function xml(s) { return new DOMParser().parseFromString(s, 'application/xml'); }
  function tags(node, name) { return Array.prototype.slice.call(node.getElementsByTagNameNS('*', name)); }
  function colIndex(ref) { var m = /^([A-Z]+)/.exec(ref || ''), n = 0; if (!m) return -1; for (var i = 0; i < m[1].length; i++) n = n * 26 + m[1].charCodeAt(i) - 64; return n - 1; }
  function parseXLSX(buf) {
    var z;
    return unzip(buf).then(function (zip) {
      z = zip;
      return Promise.all([z.read('xl/sharedStrings.xml'), z.read('xl/workbook.xml'), z.read('xl/_rels/workbook.xml.rels')]);
    }).then(function (r) {
      var shared = r[0] ? tags(xml(r[0]), 'si').map(function (si) { return tags(si, 't').map(function (t) { return t.textContent; }).join(''); }) : [];
      var target = 'xl/worksheets/sheet1.xml';
      if (r[1] && r[2]) {
        var sh = tags(xml(r[1]), 'sheet')[0];
        var rid = sh && (sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
        tags(xml(r[2]), 'Relationship').forEach(function (rel) {
          if (rel.getAttribute('Id') === rid) { var t = rel.getAttribute('Target').replace(/^\//, ''); target = t.indexOf('xl/') === 0 ? t : 'xl/' + t; }
        });
      }
      return z.read(target).then(function (sheet) {
        if (!sheet) throw new Error('sheet');
        return tags(xml(sheet), 'row').map(function (row) {
          var out = [];
          tags(row, 'c').forEach(function (c, i) {
            var idx = colIndex(c.getAttribute('r')); if (idx < 0) idx = i;
            var t = c.getAttribute('t'), vEl = tags(c, 'v')[0], val = '';
            if (t === 's') val = shared[+(vEl && vEl.textContent)] || '';
            else if (t === 'inlineStr') val = tags(c, 't').map(function (x) { return x.textContent; }).join('');
            else if (vEl) val = t === 'str' || t === 'b' || t === 'e' ? vEl.textContent : (vEl.textContent === '' ? '' : Number(vEl.textContent));
            out[idx] = val;
          });
          for (var k = 0; k < out.length; k++) if (out[k] === undefined) out[k] = '';
          return out;
        });
      });
    });
  }
  function parseJSON(text) {
    var o = JSON.parse(text);
    var arr = Array.isArray(o) ? o : (o.comments || o.data || o.items || []);
    if (!Array.isArray(arr) || !arr.length) return [];
    var keys = [];
    arr.forEach(function (x) { if (x && typeof x === 'object') Object.keys(x).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); }); });
    return [keys].concat(arr.map(function (x) { return keys.map(function (k) { var v = x[k]; return v && typeof v === 'object' ? (v.username || v.unique_id || v.name || '') : (v == null ? '' : v); }); }));
  }

  /* ------------------------------------------------------------------ colonnes */
  function pick(headers, tests) {
    var best = -1, bestS = 0;
    headers.forEach(function (h, i) { var s = tests(norm(h)); if (s > bestS) { bestS = s; best = i; } });
    return best;
  }
  function userScore(h) {
    if (/link|url|lien|photo|picture|avatar|image|verified|count|nombre/.test(h)) return 0;
    if (h === 'username' || h === 'user name' || h === 'nom d utilisateur' || h === 'pseudo' || h === 'unique id' || h === 'uniqueid') return 10;
    if (/username|nom d utilisateur|pseudo|unique ?id|handle|login/.test(h)) return 8;
    if (/display name|nom affiche/.test(h)) return 2;
    if (/\bid\b/.test(h)) return 0;
    if (/author|auteur|utilisateur|\buser\b|compte|account|profil/.test(h)) return 6;
    if (h === 'name' || h === 'nom') return 3;
    return 0;
  }
  function textScore(h) {
    if (/\bid\b|link|url|lien|date|time|count|nombre|likes|parent|reply|replies|reponse|post|video|caption/.test(h)) return 0;
    if (h === 'comment' || h === 'commentaire' || h === 'comment text' || h === 'texte du commentaire') return 10;
    if (/comment|commentaire/.test(h)) return 8;
    if (/\btext\b|texte|content|contenu|message/.test(h)) return 6;
    return 0;
  }
  function dateScore(h) {
    if (/post|video|publication du|caption|count/.test(h)) return 0;
    if (/comment date|date of comment|date du commentaire|commented at|create time|created at/.test(h)) return 10;
    if (/date|time|created|timestamp|heure/.test(h)) return 5;
    return 0;
  }
  function parentScore(h) {
    if (/count|nombre|replies|reponses/.test(h)) return 0;
    if (/parent/.test(h)) return 10;
    if (/is reply|est une reponse|reply to|en reponse|reponse a/.test(h)) return 8;
    return 0;
  }
  function toDate(v) {
    if (v === '' || v == null) return null;
    if (typeof v === 'number' && v > 20000 && v < 90000) return Math.round((v - 25569) * 86400000 + new Date((v - 25569) * 86400000).getTimezoneOffset() * 60000);
    if (typeof v === 'number' && v > 1e9) return v < 1e11 ? v * 1000 : v;
    var s = String(v).trim();
    if (/^\d{9,13}$/.test(s)) { var n = +s; return n < 1e11 ? n * 1000 : n; }
    var m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})(?:[ T,]+(\d{1,2})[:h](\d{2})(?::(\d{2}))?)?/.exec(s);
    if (m) { var y = +m[3]; if (y < 100) y += 2000; return new Date(y, +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime(); }
    var t = Date.parse(s.replace(' ', 'T'));
    if (isNaN(t)) t = Date.parse(s);
    return isNaN(t) ? null : t;
  }
  function isReply(v, own) {
    var s = String(v == null ? '' : v).trim().toLowerCase();
    if (!s || s === '0' || s === 'false' || s === 'non' || s === 'no' || s === '-' || s === 'null') return false;
    if (own && s === String(own).trim().toLowerCase()) return false;
    return true;
  }
  function records(table) {
    var h = -1, cols = null;
    for (var i = 0; i < Math.min(table.length, 12); i++) {
      var u = pick(table[i], userScore);
      if (u >= 0) { h = i; cols = { user: u, text: pick(table[i], textScore), date: pick(table[i], dateScore), parent: pick(table[i], parentScore),
        id: table[i].map(norm).findIndex(function (x) { return x === 'comment id' || x === 'id du commentaire' || x === 'id'; }) }; break; }
    }
    if (!cols) { // pas d'en-tête reconnu : 1re colonne = pseudo, 2e = commentaire
      cols = { user: 0, text: table[0] && table[0].length > 1 ? 1 : -1, date: -1, parent: -1, id: -1 };
      h = -1;
    }
    var out = [];
    for (var r = h + 1; r < table.length; r++) {
      var row = table[r], user = handle(row[cols.user]);
      if (!user || user.length > 40) continue;
      out.push({ user: user, text: cols.text >= 0 ? String(row[cols.text] == null ? '' : row[cols.text]) : '',
        date: cols.date >= 0 ? toDate(row[cols.date]) : null,
        reply: cols.parent >= 0 ? isReply(row[cols.parent], cols.id >= 0 ? row[cols.id] : null) : false });
    }
    return { rows: out, hasDate: cols.date >= 0 && out.some(function (x) { return x.date; }), hasReply: cols.parent >= 0 };
  }
  function parsePasted(text) {
    var out = [], skipped = 0;
    text.split(/\r?\n/).forEach(function (line) {
      line = line.trim();
      if (!line) return;
      var m = /^@?([A-Za-z0-9._]{2,30})\s*[:：\-–—]\s*(.*)$/.exec(line) || /^@?([A-Za-z0-9._]{2,30})$/.exec(line) || /^@?([A-Za-z0-9._]{2,30})\s+(.+)$/.exec(line);
      if (m) out.push({ user: handle(m[1]), text: m[2] || '', date: null, reply: false });
      else skipped++;
    });
    return { rows: out, hasDate: false, hasReply: false, skipped: skipped };
  }

  /* ------------------------------------------------------------------ sources */
  var SOURCES = [];
  var errBox = $('[data-err]');
  function err(t) { errBox.textContent = t || ''; }
  function guessNet(name, table) {
    var n = norm(name);
    if (/tiktok|tik tok/.test(n)) return 'tiktok';
    if (/insta|ig\b/.test(n)) return 'instagram';
    var head = (table && table[0] || []).map(norm).join(' ');
    if (/display name|unique id|digg/.test(head)) return 'tiktok';
    return 'instagram';
  }
  $('[data-files]').addEventListener('change', function (e) {
    var files = Array.prototype.slice.call(e.target.files || []);
    e.target.value = '';
    err('');
    files.reduce(function (p, f) {
      return p.then(function () {
        return f.arrayBuffer().then(function (buf) {
          var low = f.name.toLowerCase(), u8 = new Uint8Array(buf);
          var isZip = u8[0] === 0x50 && u8[1] === 0x4B;
          if (isZip) return parseXLSX(buf);
          var text = decode(buf);
          if (/\.json$/.test(low) || /^\s*[\[{]/.test(text)) return parseJSON(text);
          return parseCSV(text);
        }).then(function (table) {
          var rec = records(table);
          if (!rec.rows.length) { err('Aucun commentaire trouvé dans « ' + f.name + ' ». Vérifiez que la colonne des pseudos est bien incluse dans l’export.'); return; }
          SOURCES.push({ name: f.name, net: guessNet(f.name, table), rows: rec.rows, hasDate: rec.hasDate, hasReply: rec.hasReply });
        }).catch(function () {
          err('Impossible de lire « ' + f.name + ' ». Exportez-le plutôt en CSV, ou ouvrez-le et copiez les colonnes dans « Coller la liste ».');
        });
      });
    }, Promise.resolve()).then(refresh);
  });
  $('[data-paste]').addEventListener('click', function () {
    var ta = $('#tg-text');
    var rec = parsePasted(ta.value);
    if (!rec.rows.length) { err('Aucune ligne reconnue. Écrivez un pseudo par ligne, ou « pseudo : commentaire ».'); return; }
    err(rec.skipped ? rec.skipped + ' ligne(s) ignorée(s) : elles ne commencent pas par un pseudo.' : '');
    SOURCES.push({ name: 'Liste collée (' + rec.rows.length + ' lignes)', net: 'liste', rows: rec.rows, hasDate: false, hasReply: false });
    ta.value = '';
    refresh();
  });
  function renderSources() {
    var ul = $('[data-sources]');
    ul.innerHTML = '';
    SOURCES.forEach(function (s, i) {
      var li = el('li');
      li.appendChild(el('span', 'tg-src__name', s.name));
      var net = el('button', 'tg-net', NETS[s.net]);
      net.type = 'button'; net.setAttribute('data-net', s.net); net.title = 'Changer de réseau';
      net.addEventListener('click', function () { var order = ['instagram', 'tiktok', 'liste']; s.net = order[(order.indexOf(s.net) + 1) % 3]; refresh(); });
      li.appendChild(net);
      var nRep = s.rows.filter(function (r) { return r.reply; }).length;
      var info = fmtInt(s.rows.length) + ' commentaire' + (s.rows.length > 1 ? 's' : '') + (nRep ? ' dont ' + fmtInt(nRep) + ' réponse' + (nRep > 1 ? 's' : '') : '');
      li.appendChild(el('span', 'tg-src__n', info));
      var rm = el('button', 'linkbtn', 'Retirer');
      rm.type = 'button';
      rm.addEventListener('click', function () { SOURCES.splice(i, 1); refresh(); });
      li.appendChild(rm);
      ul.appendChild(li);
    });
  }

  /* ------------------------------------------------------------------ règles */
  var RULES = { mode: 'comment', min: 0, max: null, end: null, excl: '', replies: true };
  try { var saved = JSON.parse(store('pr.tirage.regles') || 'null'); if (saved) { RULES.mode = saved.mode || 'comment'; RULES.min = saved.min || 0; RULES.max = saved.max || null; RULES.excl = saved.excl || ''; } } catch (e) {}
  var HELP = {
    comment: 'Chaque commentaire qui respecte les règles compte pour une participation.',
    tag: 'Chaque ami différent identifié avec @ compte pour une participation. Le même ami identifié deux fois ne compte qu’une fois.',
    one: 'Chaque personne a une seule participation, quel que soit son nombre de commentaires.'
  };
  function syncRules() {
    $$('[data-mode]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === RULES.mode)); });
    $('[data-mode-help]').textContent = HELP[RULES.mode];
    $('#tg-min').value = RULES.min || 0;
    $('#tg-max').value = RULES.max || '';
    $('#tg-excl').value = RULES.excl || '';
  }
  syncRules();
  $$('[data-mode]').forEach(function (b) { b.addEventListener('click', function () { RULES.mode = b.getAttribute('data-mode'); syncRules(); refresh(); }); });
  function readInputs() {
    RULES.min = Math.max(0, parseInt($('#tg-min').value, 10) || 0);
    var mx = parseInt($('#tg-max').value, 10); RULES.max = mx > 0 ? mx : null;
    var ev = $('#tg-end').value; RULES.end = ev ? new Date(ev).getTime() : null;
    RULES.excl = $('#tg-excl').value;
    RULES.replies = $('#tg-replies').checked;
    store('pr.tirage.regles', JSON.stringify({ mode: RULES.mode, min: RULES.min, max: RULES.max, excl: RULES.excl }));
  }
  ['#tg-min', '#tg-max', '#tg-end', '#tg-excl', '#tg-replies'].forEach(function (s) { $(s).addEventListener('input', refresh); $(s).addEventListener('change', refresh); });

  /* ------------------------------------------------------------------ décompte */
  var TALLY = [], TOTAL = 0, WON = {}, showAll = false;
  var MENTION = /@([A-Za-z0-9._]{1,30})/g;
  function compute() {
    var excl = {};
    RULES.excl.split(/[\s,;]+/).map(handle).filter(Boolean).forEach(function (h) { excl[h] = 1; });
    var map = {};
    SOURCES.forEach(function (s) {
      s.rows.forEach(function (r) {
        if (excl[r.user]) return;
        if (RULES.replies && r.reply) return;
        if (RULES.end && r.date && r.date > RULES.end) return;
        var seen = {}, list = [], m;
        MENTION.lastIndex = 0;
        while ((m = MENTION.exec(r.text))) {
          var t = m[1].replace(/\.+$/, '').toLowerCase();
          if (t && t !== r.user && !excl[t] && !seen[t]) { seen[t] = 1; list.push(t); }
        }
        if (list.length < RULES.min) return;
        var key = s.net + ':' + r.user;
        var p = map[key] || (map[key] = { key: key, user: r.user, net: s.net, n: 0, tags: {}, c: 0 });
        p.c++;
        if (RULES.mode === 'comment') p.n++;
        else if (RULES.mode === 'one') p.n = 1;
        else list.forEach(function (t) { p.tags[t] = 1; });
      });
    });
    TALLY = Object.keys(map).map(function (k) {
      var p = map[k];
      if (RULES.mode === 'tag') p.n = Object.keys(p.tags).length;
      if (RULES.max) p.n = Math.min(p.n, RULES.max);
      return p;
    }).filter(function (p) { return p.n > 0; }).sort(function (a, b) { return b.n - a.n || (a.user < b.user ? -1 : 1); });
    TOTAL = TALLY.reduce(function (a, p) { return a + p.n; }, 0);
  }
  function renderTally() {
    var total = $('[data-total]');
    total.innerHTML = '';
    if (!TALLY.length) { total.textContent = 'Personne ne remplit les règles pour l’instant.'; }
    else {
      total.appendChild(el('strong', null, fmtInt(TALLY.length)));
      total.appendChild(d.createTextNode(' participant' + (TALLY.length > 1 ? 's' : '') + ' · '));
      total.appendChild(el('strong', null, fmtInt(TOTAL)));
      total.appendChild(d.createTextNode(' participation' + (TOTAL > 1 ? 's' : '')));
    }
    var q = handle($('#tg-q').value);
    var list = q ? TALLY.filter(function (p) { return p.user.indexOf(q) >= 0; }) : TALLY;
    var lim = showAll || q ? list.length : Math.min(list.length, 30);
    var max = TALLY.length ? TALLY[0].n : 1;
    var tb = $('[data-rows]');
    tb.innerHTML = '';
    list.slice(0, lim).forEach(function (p) {
      var tr = el('tr');
      if (WON[p.key]) tr.className = 'is-win';
      var who = el('td', null, '@' + p.user);
      who.appendChild(el('span', 'tg-net-s', NETS[p.net] + (p.c > 1 ? ' · ' + p.c + ' commentaires' : '')));
      tr.appendChild(who);
      var n = el('td', 'num', fmtInt(p.n));
      var bar = el('span', 'tg-bar'), fill = el('i');
      fill.style.width = Math.max(4, Math.round(p.n * 100 / max)) + '%';
      bar.appendChild(fill); n.appendChild(bar);
      tr.appendChild(n);
      tr.appendChild(el('td', 'num', pct(p.n, TOTAL)));
      tb.appendChild(tr);
    });
    var more = $('[data-more]');
    more.hidden = showAll || q || list.length <= 30;
    more.textContent = 'Voir tout le monde (' + fmtInt(list.length) + ')';
  }
  $('[data-more]').addEventListener('click', function () { showAll = true; renderTally(); });
  $('#tg-q').addEventListener('input', renderTally);
  function refresh() {
    readInputs();
    renderSources();
    var any = SOURCES.length > 0;
    $('[data-rules]').hidden = !any;
    $('[data-people]').hidden = !any;
    $('[data-draw]').hidden = !any;
    root.querySelector('[data-need-date]').hidden = !SOURCES.some(function (s) { return s.hasDate; });
    root.querySelector('[data-need-reply]').hidden = !SOURCES.some(function (s) { return s.hasReply; });
    compute();
    // un gagnant qui ne remplit plus les règles n'est plus marqué
    Object.keys(WON).forEach(function (k) { if (!TALLY.some(function (p) { return p.key === k; })) delete WON[k]; });
    renderTally();
    updateGo();
  }

  /* ------------------------------------------------------------------ export du décompte */
  $('[data-csv]').addEventListener('click', function () {
    var lines = [['Pseudo', 'Réseau', 'Participations', 'Chances', 'Gagnant'].join(';')];
    TALLY.forEach(function (p) { lines.push(['@' + p.user, NETS[p.net], p.n, pct(p.n, TOTAL).replace(' ', ' '), WON[p.key] ? WON[p.key] : ''].join(';')); });
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = d.createElement('a');
    var t = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = 'decompte-tirage-' + t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate()) + '.csv';
    d.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  });

  /* ------------------------------------------------------------------ tirage */
  var stage = $('[data-stage]'), card = $('[data-card]'), ticker = $('[data-ticker]'), win = $('[data-win]');
  var spinning = false, angle = 0;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function randInt(n) {
    var lim = Math.floor(4294967296 / n) * n, a = new Uint32Array(1);
    do { crypto.getRandomValues(a); } while (a[0] >= lim);
    return a[0] % n;
  }
  function eligible() { return TALLY.filter(function (p) { return !WON[p.key]; }); }
  function weighted(list) {
    var tot = list.reduce(function (a, p) { return a + p.n; }, 0), r = randInt(tot);
    for (var i = 0; i < list.length; i++) { if (r < list[i].n) return list[i]; r -= list[i].n; }
    return list[list.length - 1];
  }
  function updateGo() {
    var n = Object.keys(WON).length, left = eligible().length;
    $$('[data-go]').forEach(function (b) {
      b.disabled = spinning || !left;
      b.textContent = !left ? 'Plus personne à tirer' : (n ? 'Tirer un suppléant' : 'Lancer le tirage');
    });
  }
  function ease(t) { return 1 - Math.pow(1 - t, 3); }
  function go() {
    if (spinning) return;
    var list = eligible();
    if (!list.length) return;
    var winner = weighted(list); // choisi avant l'animation : l'animation ne fait que le révéler
    var rank = Object.keys(WON).length;
    spinning = true;
    updateGo();
    win.innerHTML = '';
    stage.classList.remove('is-done');
    ticker.classList.add('is-spinning');
    var D = reduce ? 1200 : 6200, turns = reduce ? 0 : 7, start = performance.now(), base = angle % 360, nextTick = 0, last = null;
    (function frame(now) {
      var t = Math.min(1, (now - start) / D), e = ease(t);
      angle = base + (turns * 360 - base) * e;
      var lift = 1 + Math.sin(Math.PI * t) * 0.07;
      card.style.transform = 'rotateY(' + angle + 'deg) scale(' + lift + ')';
      if (now >= nextTick && t < 0.97) {
        var p; do { p = weighted(TALLY); } while (TALLY.length > 1 && p === last);
        last = p;
        ticker.textContent = '@' + p.user;
        nextTick = now + 45 + 420 * Math.pow(t, 2.2);
      }
      if (t < 1) return requestAnimationFrame(frame);
      angle = 0;
      card.style.transform = 'rotateY(0deg)';
      reveal(winner, rank);
    })(start);
  }
  function reveal(p, rank) {
    spinning = false;
    WON[p.key] = rank ? 'Suppléant ' + rank : 'Gagnant';
    ticker.classList.remove('is-spinning');
    ticker.textContent = '@' + p.user;
    stage.classList.add('is-done');
    win.innerHTML = '';
    win.appendChild(el('p', 'tg-win__label', rank ? 'Suppléant n° ' + rank : 'Le gagnant est'));
    win.appendChild(el('p', 'tg-win__name', '@' + p.user));
    win.appendChild(el('p', 'tg-win__meta', NETS[p.net] + ' · ' + fmtInt(p.n) + ' participation' + (p.n > 1 ? 's' : '') + ' sur ' + fmtInt(TOTAL) + ' · ' + pct(p.n, TOTAL) + ' de chances'));
    var li = el('li');
    li.appendChild(el('strong', null, (rank ? 'Suppléant ' + rank : 'Gagnant') + ' : @' + p.user));
    li.appendChild(d.createTextNode(' (' + NETS[p.net] + ', ' + fmtInt(p.n) + ' participation' + (p.n > 1 ? 's' : '') + ') · tiré le ' + stamp(Date.now()) + ' parmi ' + fmtInt(TALLY.length) + ' participants et ' + fmtInt(TOTAL) + ' participations'));
    $('[data-log]').appendChild(li);
    renderTally();
    updateGo();
    if (!reduce) confetti();
  }
  $$('[data-go]').forEach(function (b) { b.addEventListener('click', go); });

  /* confettis aux couleurs du site */
  var cv = $('[data-confetti]');
  function confetti() {
    var r = stage.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = r.width * dpr; cv.height = r.height * dpr;
    var g = cv.getContext('2d'), cols = ['#B85414', '#E5802B', '#F4C430', '#8F6F2A', '#9A4410', '#3B2414'];
    var ps = [], N = 150, t0 = performance.now(), cx = r.width / 2, cy = r.height * 0.38;
    for (var i = 0; i < N; i++) {
      var a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 7;
      ps.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 4, s: 5 + Math.random() * 7, r: Math.random() * 6, vr: (Math.random() - .5) * .4, c: cols[i % cols.length], bolt: i % 7 === 0 });
    }
    (function frame(now) {
      var t = (now - t0) / 1000;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, r.width, r.height);
      g.globalAlpha = t > 2.4 ? Math.max(0, 1 - (t - 2.4) / 0.9) : 1;
      ps.forEach(function (p) {
        p.vy += 0.22; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c;
        if (p.bolt) { var k = p.s / 10; g.beginPath(); g.moveTo(1.6 * k, -10 * k); g.lineTo(-5.4 * k, 1.4 * k); g.lineTo(-.4 * k, 1.4 * k); g.lineTo(-2.1 * k, 10 * k); g.lineTo(5.4 * k, -2.2 * k); g.lineTo(.4 * k, -2.2 * k); g.closePath(); g.fill(); }
        else g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        g.restore();
      });
      if (t < 3.3) requestAnimationFrame(frame); else g.clearRect(0, 0, r.width, r.height);
    })(t0);
  }

  /* mode film */
  function film(on) {
    stage.classList.toggle('is-film', on);
    d.body.classList.toggle('tg-film', on);
    if (on) { var b = el('button', 'btn tg-film-go', 'Lancer le tirage'); b.type = 'button'; b.setAttribute('data-go', ''); b.addEventListener('click', go); stage.appendChild(b); updateGo(); }
    else { var x = stage.querySelector('.tg-film-go'); if (x) x.remove(); }
  }
  $('[data-film]').addEventListener('click', function () { film(true); });
  $('[data-film-close]').addEventListener('click', function () { film(false); });
  d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && stage.classList.contains('is-film')) film(false); });

  /* photo sur la carte (gardée sur cet appareil) */
  var front = $('[data-front]'), frontImg = $('[data-front-img]'), logo = frontImg.getAttribute('src');
  function setPhoto(src) {
    frontImg.src = src || logo;
    front.classList.toggle('is-photo', !!src);
    $('[data-photo-reset]').hidden = !src;
  }
  var savedPhoto = store('pr.tirage.photo');
  if (savedPhoto) setPhoto(savedPhoto);
  $('[data-photo]').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    var img = new Image(), url = URL.createObjectURL(f);
    img.onload = function () {
      var W = 500, H = 700, c = d.createElement('canvas');
      c.width = W; c.height = H;
      var s = Math.max(W / img.width, H / img.height), w = img.width * s, h = img.height * s;
      c.getContext('2d').drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      var data = c.toDataURL('image/jpeg', 0.86);
      URL.revokeObjectURL(url);
      setPhoto(data);
      store('pr.tirage.photo', data);
    };
    img.src = url;
  });
  $('[data-photo-reset]').addEventListener('click', function () { setPhoto(null); store('pr.tirage.photo', null); });

  refresh();
})();
