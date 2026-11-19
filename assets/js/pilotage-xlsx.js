/* Poké-Raichu · pilotage : export Excel (.xlsx) sans bibliothèque.
   Un classeur = des feuilles { nom, colonnes: [{ titre, largeur, format }], lignes: [[valeurs]], gras: [n° de lignes] }.
   Formats : 'texte', 'nombre', 'euro', 'pct' (fraction : 0,65 → 65 %), 'date' (AAAA-MM-JJ), 'yen'.
   Le fichier est un zip « stocké » (sans compression), lisible par Excel, Numbers, LibreOffice et Google Sheets.
   Chargé seulement quand on touche « Télécharger en Excel ». */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.PRXlsx = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(u8) { var c = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) c = TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function utf8(s) { return new TextEncoder().encode(s); }

  function zip(fichiers) {
    var parts = [], central = [], offset = 0;
    fichiers.forEach(function (f) {
      var nom = utf8(f.nom), data = utf8(f.texte), crc = crc32(data);
      var lh = new Uint8Array(30 + nom.length), v = new DataView(lh.buffer);
      v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true); v.setUint16(8, 0, true);
      v.setUint16(10, 0, true); v.setUint16(12, 0x21, true); v.setUint32(14, crc, true); v.setUint32(18, data.length, true);
      v.setUint32(22, data.length, true); v.setUint16(26, nom.length, true); v.setUint16(28, 0, true);
      lh.set(nom, 30);
      parts.push(lh, data);
      var ch = new Uint8Array(46 + nom.length), w = new DataView(ch.buffer);
      w.setUint32(0, 0x02014b50, true); w.setUint16(4, 20, true); w.setUint16(6, 20, true); w.setUint16(8, 0x0800, true);
      w.setUint16(10, 0, true); w.setUint16(12, 0, true); w.setUint16(14, 0x21, true); w.setUint32(16, crc, true);
      w.setUint32(20, data.length, true); w.setUint32(24, data.length, true); w.setUint16(28, nom.length, true);
      w.setUint32(42, offset, true);
      ch.set(nom, 46);
      central.push(ch);
      offset += lh.length + data.length;
    });
    var taille = central.reduce(function (s, c) { return s + c.length; }, 0);
    var fin = new Uint8Array(22), e = new DataView(fin.buffer);
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, fichiers.length, true); e.setUint16(10, fichiers.length, true);
    e.setUint32(12, taille, true); e.setUint32(16, offset, true);
    return parts.concat(central, [fin]);
  }

  function esc(s) {
    return String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function lettre(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function serie(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000 : null;
  }
  var STYLE = { texte: 0, entete: 1, euro: 2, pct: 3, date: 4, yen: 5, gras: 6, nombre: 0, euro_gras: 7 };

  function cellule(ref, v, format, gras) {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'boolean') v = v ? 'Oui' : 'Non';
    if (format === 'date') { var s = serie(v); if (s !== null) return '<c r="' + ref + '" s="4"><v>' + s + '</v></c>'; }
    if (typeof v === 'number' && isFinite(v)) {
      var st = format === 'euro' ? (gras ? 7 : 2) : format === 'pct' ? 3 : format === 'yen' ? 5 : (gras ? 6 : 0);
      return '<c r="' + ref + '"' + (st ? ' s="' + st + '"' : '') + '><v>' + v + '</v></c>';
    }
    return '<c r="' + ref + '" t="inlineStr"' + (gras ? ' s="6"' : '') + '><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
  }

  function feuille(f) {
    var cols = f.colonnes, gras = {};
    (f.gras || []).forEach(function (i) { gras[i] = true; });
    var x = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>',
      '<cols>'];
    cols.forEach(function (c, i) { x.push('<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (c.largeur || 14) + '" customWidth="1"/>'); });
    x.push('</cols><sheetData><row r="1">');
    cols.forEach(function (c, i) { x.push('<c r="' + lettre(i) + '1" t="inlineStr" s="1"><is><t xml:space="preserve">' + esc(c.titre) + '</t></is></c>'); });
    x.push('</row>');
    f.lignes.forEach(function (l, j) {
      var r = j + 2, cells = [];
      cols.forEach(function (c, i) { cells.push(cellule(lettre(i) + r, l[i], c.format, gras[j])); });
      x.push('<row r="' + r + '">' + cells.join('') + '</row>');
    });
    x.push('</sheetData>');
    if (f.filtre !== false && f.lignes.length) x.push('<autoFilter ref="A1:' + lettre(cols.length - 1) + (f.lignes.length + 1) + '"/>');
    x.push('</worksheet>');
    return x.join('');
  }

  var STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0.00\\ &quot;€&quot;"/><numFmt numFmtId="165" formatCode="0.0%"/><numFmt numFmtId="166" formatCode="dd/mm/yyyy"/></numFmts>' +
    '<fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF8E8D4"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="8">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  function nomFeuille(s, deja) {
    var n = String(s).replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31) || 'Feuille', base = n, i = 2;
    while (deja[n.toLowerCase()]) { n = base.slice(0, 28) + ' ' + i++; }
    deja[n.toLowerCase()] = true;
    return n;
  }

  /* renvoie les morceaux du fichier (Uint8Array) ; dans le navigateur : new Blob(morceaux, { type }) */
  function morceaux(feuilles) {
    var deja = {}, noms = feuilles.map(function (f) { return nomFeuille(f.nom, deja); });
    var fichiers = [
      { nom: '[Content_Types].xml', texte: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        feuilles.map(function (f, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') +
        '</Types>' },
      { nom: '_rels/.rels', texte: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { nom: 'xl/workbook.xml', texte: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<bookViews><workbookView/></bookViews><sheets>' +
        noms.map(function (n, i) { return '<sheet name="' + esc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') +
        '</sheets></workbook>' },
      { nom: 'xl/_rels/workbook.xml.rels', texte: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        feuilles.map(function (f, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
        '<Relationship Id="rId' + (feuilles.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { nom: 'xl/styles.xml', texte: STYLES }
    ];
    feuilles.forEach(function (f, i) { fichiers.push({ nom: 'xl/worksheets/sheet' + (i + 1) + '.xml', texte: feuille(f) }); });
    return zip(fichiers);
  }

  return { morceaux: morceaux, TYPE: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
});
