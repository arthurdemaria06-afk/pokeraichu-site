/* Poké-Raichu · page de gestion : annonces prêtes à copier pour eBay, Vinted et Leboncoin.
   Rien n'est envoyé aux plateformes : le texte se copie, les photos s'enregistrent, l'annonce se poste à la main. */
(function () {
  'use strict';
  var d = document;
  function el(tag, cls, text) { var e = d.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = text; return e; }
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function getJSON(k, dflt) { try { return JSON.parse(get(k) || 'null') || dflt; } catch (e) { return dflt; } }

  var SITES = [
    { id: 'ebay', nom: 'eBay', max: 80, aide: 'Dans eBay : état « Gradée » pour un slab, « Non gradée » sinon.' },
    { id: 'vinted', nom: 'Vinted', max: 60, aide: 'Dans Vinted : marque « Pokémon », puis choisissez la catégorie et l’état.' },
    { id: 'leboncoin', nom: 'Leboncoin', max: 50, aide: 'Dans Leboncoin : catégorie « Collection ».' }
  ];
  var LANG = { JP: ['japonaise', 'Japonaise'], KR: ['coréenne', 'Coréenne'], FR: ['française', 'Française'], EN: ['anglaise', 'Anglaise'] };

  /* réglages gardés sur ce téléphone : écart de prix par plateforme (en %) et annonces déjà postées */
  function ecarts() { return getJSON('pr.annonce.ecarts', {}); }
  function postees() { return getJSON('pr.annonce.postees', {}); }
  function prixPour(site, prix) {
    var p = +ecarts()[site] || 0;
    if (!p) return prix;
    return Math.max(1, Math.round(prix * (1 + p / 100)));
  }
  function num(n) { return Math.round(n) === n ? String(n) : n.toFixed(2).replace('.', ','); }

  /* nom français de l'extension quand il existe (Zénith Suprême plutôt que VSTAR Universe) : Vinted et Leboncoin
     restent 100 % en français, l'anglais est réservé à eBay (demande d'Arthur, 22/11/2026) */
  function extFr(c) { var e = c.extension || {}; return e.nom_fr || e.nom || ''; }
  /* titre : l'essentiel d'abord, puis chaque précision tant qu'elle tient dans la limite de la plateforme */
  function titre(c, max) {
    var lang = (LANG[c.langue] || [])[1];
    var slab = c.type === 'slab', scelle = c.type === 'scelle';
    var base = (scelle ? 'Pokémon ' : 'Carte Pokémon ') + c.titre;
    var extra = [], ext = extFr(c);
    if (slab) extra.push(c.etat.libelle);
    if (c.edition) extra.push(c.edition);
    if (c.rarete) extra.push(c.rarete);
    if (lang) extra.push(lang);
    if (ext && c.titre.indexOf(ext) === -1) extra.push(ext);
    if (c.extension && c.extension.code) extra.push(c.extension.code);
    if (scelle) extra.push('Scellé');
    else if (!slab && /near mint/i.test(c.etat.libelle)) extra.push('NM');
    var t = base;
    if (t.length > max) t = 'Pokémon ' + c.titre;
    if (t.length > max) t = c.titre;
    if (t.length > max) return t.slice(0, max - 1).trim() + '…';
    extra.forEach(function (x) { if ((t + ' ' + x).length <= max) t += ' ' + x; });
    return t;
  }

  /* eBay : titre en français ET en anglais, pour être trouvé en France comme à l'étranger (demande d'Arthur, 22/11/2026).
     Chaque morceau a une priorité : d'abord ce qui identifie la carte (nom français, nom anglais, numéro, note PSA, langue
     en anglais), puis le reste (code et nom de l'extension, rareté, « Pokémon », langue en français, état) tant que ça
     tient dans les 80 caractères. Le titre se lit ensuite dans l'ordre naturel. Vinted et Leboncoin gardent titre(). */
  var LANG_EN = { JP: 'Japanese', KR: 'Korean', FR: 'French', EN: 'English', CN: 'Chinese' };
  var LANG_FR = { JP: 'Japonaise', KR: 'Coréenne', FR: 'VF', EN: 'Anglaise', CN: 'Chinoise' };
  var RARETES = /^(AR|SAR|SR|CHR|CSR|UR|HR|SSR|RRR|RR|FUR|BWR|ACE|Promo|Holo)$/;
  var VIEUX_CODES = /^(PMCG\d|PCG\d|neo\d|e\d|Gym|VS|CLL)$/i;
  function cle(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
  /* nom anglais d'une extension tel qu'on le cherche : « Crossing the Ruins... (Neo Discovery) » → « Neo Discovery »,
     « Golden Sky, Silvery Ocean (2005) » → « Golden Sky, Silvery Ocean » */
  function setAnglais(e) {
    if (!e || !e.nom) return '';
    var m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(e.nom);
    if (!m) return e.nom;
    return /^\d{4}$|Pokémon Card e/i.test(m[2]) ? m[1] : m[2];
  }
  function titreEbay(c, max) {
    var en = c.en || {}, slab = c.type === 'slab', scelle = c.type === 'scelle', P = [];
    function morceau(pos, prio, textes) {
      textes = (Array.isArray(textes) ? textes : [textes]).map(function (t) { return String(t || '').replace(/\s*·\s*/g, ' ').replace(/\s+/g, ' ').trim(); }).filter(Boolean);
      if (textes.length) P.push({ pos: pos, prio: prio, textes: textes });
    }
    var fr = c.nom_fr || (c.numero ? c.titre.replace(' ' + c.numero, '') : c.titre);
    if (scelle) fr = c.titre;
    var ang = c.nom_en || en.nom || '';
    if (scelle) ang = [ang.replace(/^Sealed\s+/i, ''), ang.replace(/^Sealed\s+/i, '').split(/\s*·\s*/)[0]];
    else if (cle(ang) === cle(fr)) ang = '';
    else if (/ bundle$/i.test(ang)) ang = [ang, ang.replace(/ bundle$/i, '').replace(/ and /g, ' & ')];
    var e = c.extension || {}, code = e.code && !VIEUX_CODES.test(e.code) ? e.code : '';
    var setEn = setAnglais(e), setFr = e.nom_fr && cle(e.nom_fr) !== cle(setEn) ? e.nom_fr : '';
    var rar = RARETES.test(c.rarete || '') ? c.rarete : (/^Shiny$/.test(en.rarete || '') ? 'Shiny' : '');
    morceau(0, 7, 'Pokémon');
    morceau(1, 1, fr);
    morceau(2, 2, ang);
    morceau(3, 3, c.numero);
    if (slab) morceau(4, 1.5, c.etat && c.etat.libelle);
    morceau(5, 4, en.edition || c.edition);
    morceau(6, 5, code);
    morceau(7, c.numero ? 6 : 4, setEn);
    morceau(8, 6, rar);
    morceau(9, 9, setFr);
    morceau(10, c.langue === 'FR' ? 5 : 3, LANG_EN[c.langue]);
    morceau(11, c.langue === 'FR' ? 4 : 8, LANG_FR[c.langue]);
    if (scelle) { morceau(12, 4, 'Sealed'); morceau(13, 8, 'Scellé'); }
    else if (!slab && c.etat && /near mint/i.test(c.etat.libelle)) morceau(12, 8, 'NM');
    var pris = [];
    function texte(l) {
      return l.slice().sort(function (a, b) { return a.m.pos - b.m.pos; }).reduce(function (s, x) {
        return s ? s + (x.m.pos === 2 && l.some(function (y) { return y.m.pos === 1; }) ? ' / ' : ' ') + x.t : x.t;
      }, '');
    }
    P.slice().sort(function (a, b) { return a.prio - b.prio || a.pos - b.pos; }).forEach(function (m) {
      var deja = cle(texte(pris));
      for (var i = 0; i < m.textes.length; i++) {
        var t = m.textes[i];
        if (m.pos > 2 && deja.indexOf(cle(t)) !== -1) return;
        var essai = pris.concat([{ m: m, t: t }]);
        if (texte(essai).length <= max) { pris = essai; return; }
      }
    });
    var out = texte(pris);
    if (!out) out = fr.length > max ? fr.slice(0, max - 1).trim() + '…' : fr;
    return out;
  }

  /* eBay : la même annonce en anglais sous le texte français, pour les acheteurs étrangers */
  function anglais(c) {
    var en = c.en || {}, e = c.extension || {}, slab = c.type === 'slab', scelle = c.type === 'scelle', L = [];
    var nom = en.titre || ((c.nom_en || en.nom || c.titre) + (c.numero ? ' ' + c.numero : ''));
    L.push('— English —');
    L.push(nom.replace(/\s*·\s*/g, ' · ') + (slab ? ' · ' + c.etat.libelle : '') + (LANG_EN[c.langue] ? ' · ' + LANG_EN[c.langue] : ''));
    if (en.variante && !scelle) L.push('• ' + en.variante);
    if (en.edition || c.edition) L.push('• ' + (en.edition || c.edition));
    if (en.rarete) L.push('• Rarity: ' + en.rarete);
    if (e.nom) L.push('• Set: ' + e.nom + (e.code ? ' (' + e.code + ')' : ''));
    if (slab) L.push('• Graded ' + c.etat.libelle + (c.etat.cert ? ', certificate #' + c.etat.cert : ''));
    else if (scelle) L.push('• Condition: ' + (en.etat || 'new, sealed').toLowerCase());
    else L.push('• Condition: ' + (en.etat || c.etat.libelle) + ' (see photos)');
    L.push(scelle ? 'Authentic product.' : 'Authentic card.' + (c.quantite === 1 ? ' The photos show the exact card you will receive.' : ''));
    if (slab) L.push('Tracked shipping, slab protected in a rigid parcel.');
    else if (scelle) L.push('Tracked shipping, protected parcel.');
    else L.push('Tracked shipping: card in a sleeve and toploader, in a rigid envelope.');
    return L;
  }

  function description(c, site) {
    var L = [], lang = (LANG[c.langue] || [])[0];
    var slab = c.type === 'slab', scelle = c.type === 'scelle', e = c.extension || {}, ext = extFr(c);
    L.push(c.titre + (slab ? ' · ' + c.etat.libelle : ''));
    L.push('');
    if (c.variante) L.push('• ' + c.variante);
    if (c.edition) L.push('• ' + c.edition);
    if (c.rarete) L.push('• Rareté : ' + c.rarete);
    if (ext) L.push('• Extension : ' + ext + (e.code ? ' (' + e.code + ')' : ''));
    if (lang) L.push('• Langue : ' + lang);
    if (slab) {
      L.push('• Carte gradée ' + c.etat.libelle + (c.etat.cert ? ', certificat n° ' + c.etat.cert : ''));
    } else if (scelle) {
      L.push('• État : ' + c.etat.libelle.toLowerCase());
    } else {
      L.push('• État : ' + c.etat.libelle + ' (voir photos)');
    }
    L.push('');
    L.push(scelle ? 'Produit authentique.' : 'Carte authentique.');
    if (c.quantite === 1 && !scelle) L.push('Les photos sont celles de la carte que vous recevrez.');
    if (slab) L.push('Envoi suivi, slab protégé dans un colis rigide.');
    else if (scelle) L.push('Envoi suivi, colis protégé.');
    else L.push('Envoi suivi : carte sous pochette, dans un toploader, en enveloppe rigide.');
    if (site === 'leboncoin') L.push('Remise en main propre possible à Mandelieu-la-Napoule, sur rendez-vous.');
    L.push('');
    if (site === 'ebay') { L = L.concat(anglais(c)); L.push(''); }
    L.push('Poké-Raichu · réf. ' + c.ref);
    return L.join('\n');
  }

  function copier(text, btn) {
    function ok() {
      var old = btn.getAttribute('data-l') || btn.textContent;
      btn.setAttribute('data-l', old);
      btn.textContent = 'Copié ✓';
      btn.classList.add('is-ok');
      setTimeout(function () { btn.textContent = old; btn.classList.remove('is-ok'); }, 1600);
    }
    function vieux() {
      var ta = el('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.className = 'sr-only';
      d.body.appendChild(ta); ta.select();
      try { d.execCommand('copy'); ok(); } catch (e) { btn.textContent = 'Copie impossible'; }
      ta.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, vieux);
    else vieux();
  }

  /* photos de la fiche : slug-1, slug-2… en grand format ; converties en JPEG, accepté partout */
  function trouverPhotos(c) {
    var out = [];
    function essai(i) {
      return new Promise(function (res) {
        if (i > 8) return res(out);
        var img = new Image();
        img.onload = function () { out.push(img); res(essai(i + 1)); };
        img.onerror = function () { res(out); };
        img.src = 'assets/photos/' + c.slug + '-' + i + '-1600.webp';
      });
    }
    return essai(1);
  }
  /* tampon Poké-Raichu des photos Leboncoin (demande d'Arthur, 22/11/2026). L'ancien bandeau sous la photo ne se voyait
     qu'en plein écran : la vignette, carrée, le coupait. Désormais la photo devient carrée : carte décalée à gauche, fond
     prolongé à partir des bords de la photo, et un sceau rond (logo, POKÉ-RAICHU, ruban « pokeraichu.com ») dans l'espace
     libre à droite, placé pour rester visible même si une vignette recadre en 4:3. Rien ne cache la carte.
     eBay (règlement « Picture policy ») et Vinted refusent logo et texte sur les photos : photos d'origine. */
  var LOGO = null, POLICE = '-apple-system, system-ui, "Helvetica Neue", Arial, sans-serif', SERIF = '"Libre Caslon Text", Georgia, serif';
  var CREME = '#FBF3E4', SHU = '#B85414', SUMI = '#1E1B18', JAUNE = '#F4C430';
  function logoPhoto() {
    if (!LOGO) LOGO = Promise.all([
      new Promise(function (res) {
        var i = new Image();
        i.onload = function () { res(i); };
        i.onerror = function () { res(null); };
        i.src = 'assets/img/logo-photo.png?v=1';
      }),
      d.fonts && d.fonts.load ? d.fonts.load('700 40px "Libre Caslon Text"').catch(function () {}) : null
    ]).then(function (r) { return r[0]; });
    return LOGO;
  }
  function tamponSur() { return get('pr.annonce.tampon') !== '0'; }
  function tamponRegler(v) { put('pr.annonce.tampon', v ? '1' : '0'); }
  function largeurEspacee(x, t, pas) { var w = 0; for (var i = 0; i < t.length; i++) w += x.measureText(t[i]).width + (i ? pas : 0); return w; }
  /* texte sur l'arc du haut du sceau, lettre par lettre */
  function arcTexte(x, t, rayon, taille, couleur) {
    x.save();
    x.font = '700 ' + taille.toFixed(1) + 'px ' + SERIF;
    x.fillStyle = couleur; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    var pas = taille * 0.16, tot = largeurEspacee(x, t, pas) / rayon, a = -Math.PI / 2 - tot / 2;
    for (var i = 0; i < t.length; i++) {
      var w = x.measureText(t[i]).width;
      a += w / 2 / rayon;
      x.save(); x.rotate(a + Math.PI / 2); x.fillText(t[i], 0, -rayon); x.restore();
      a += (w / 2 + pas) / rayon;
    }
    x.restore();
    return tot;
  }
  /* éclair du site (même tracé que l'icône i-bolt, 12 × 20) */
  function eclair(x, cx, cy, h, angle) {
    var k = h / 20;
    x.save(); x.translate(cx, cy); x.rotate(angle); x.scale(k, k); x.translate(-6, -10);
    x.beginPath(); x.moveTo(7.6, 0); x.lineTo(0.6, 11.4); x.lineTo(5.6, 11.4); x.lineTo(3.9, 20); x.lineTo(11.4, 7.8); x.lineTo(6.4, 7.8); x.closePath();
    x.fillStyle = JAUNE; x.fill();
    x.restore();
  }
  function sceau(x, cx, cy, R, lg) {
    x.save();
    x.translate(cx, cy);
    x.rotate(-6 * Math.PI / 180);
    x.shadowColor = 'rgba(30,27,24,.32)'; x.shadowBlur = R * 0.16; x.shadowOffsetY = R * 0.05;
    x.beginPath(); x.arc(0, 0, R, 0, 2 * Math.PI); x.fillStyle = SHU; x.fill();
    x.shadowColor = 'rgba(0,0,0,0)'; x.shadowBlur = 0; x.shadowOffsetY = 0;
    x.lineWidth = R * 0.022; x.strokeStyle = CREME;
    x.beginPath(); x.arc(0, 0, R * 0.925, 0, 2 * Math.PI); x.stroke();
    x.beginPath(); x.arc(0, 0, R * 0.68, 0, 2 * Math.PI); x.fillStyle = CREME; x.fill();
    var ang = arcTexte(x, 'POKÉ-RAICHU', R * 0.742, R * 0.168, CREME), b = ang / 2 + 0.24;
    eclair(x, Math.cos(-Math.PI / 2 - b) * R * 0.80, Math.sin(-Math.PI / 2 - b) * R * 0.80, R * 0.15, -b);
    eclair(x, Math.cos(-Math.PI / 2 + b) * R * 0.80, Math.sin(-Math.PI / 2 + b) * R * 0.80, R * 0.15, b);
    if (lg) { var lh = R * 0.98, lw = lh * lg.naturalWidth / lg.naturalHeight; x.drawImage(lg, -lw / 2, -R * 0.60, lw, lh); }
    /* ruban « pokeraichu.com », bouts en V */
    var hw = R * 1.1, y0 = R * 0.36, h = R * 0.36, v = h * 0.42;
    x.beginPath();
    x.moveTo(-hw, y0); x.lineTo(hw, y0); x.lineTo(hw - v, y0 + h / 2); x.lineTo(hw, y0 + h);
    x.lineTo(-hw, y0 + h); x.lineTo(-hw + v, y0 + h / 2); x.closePath();
    x.fillStyle = SUMI; x.fill();
    x.lineWidth = R * 0.018; x.strokeStyle = CREME;
    x.beginPath(); x.moveTo(-hw + v * 0.9, y0 + h * 0.13); x.lineTo(hw - v * 0.9, y0 + h * 0.13); x.moveTo(-hw + v * 0.9, y0 + h * 0.87); x.lineTo(hw - v * 0.9, y0 + h * 0.87); x.stroke();
    var t = 'pokeraichu.com', f = R * 0.24;
    x.font = '700 ' + f.toFixed(1) + 'px ' + POLICE;
    var tw = x.measureText(t).width, place = (hw - v) * 2 * 0.9;
    if (tw > place) { f *= place / tw; x.font = '700 ' + f.toFixed(1) + 'px ' + POLICE; }
    x.fillStyle = CREME; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(t, 0, y0 + h / 2 + f * 0.04);
    x.restore();
  }
  /* couleur du fond, ligne par ligne, prise sur les bords gauche et droit de la photo (lissée) */
  function bords(img) {
    var H = Math.min(400, img.naturalHeight), cv = el('canvas');
    cv.width = 16; cv.height = H;
    var x = cv.getContext('2d'), sw = Math.max(4, Math.round(img.naturalWidth * 0.02));
    x.drawImage(img, 0, 0, sw, img.naturalHeight, 0, 0, 8, H);
    x.drawImage(img, img.naturalWidth - sw, 0, sw, img.naturalHeight, 8, 0, 8, H);
    var px;
    try { px = x.getImageData(0, 0, 16, H).data; } catch (e) { return null; }
    var lum = [], q;
    for (q = 0; q < px.length; q += 4) lum.push(0.3 * px[q] + 0.59 * px[q + 1] + 0.11 * px[q + 2]);
    var lm = lum.reduce(function (a, b) { return a + b; }, 0) / lum.length;
    var sd = Math.sqrt(lum.reduce(function (a, b) { return a + (b - lm) * (b - lm); }, 0) / lum.length);
    function colonne(c0) {
      var brut = [], i, j, k;
      for (j = 0; j < H; j++) {
        var s = [0, 0, 0];
        for (i = c0; i < c0 + 8; i++) for (k = 0; k < 3; k++) s[k] += px[(j * 16 + i) * 4 + k];
        brut.push(s.map(function (v) { return v / 8; }));
      }
      var r = Math.max(2, Math.round(H / 40)), out = el('canvas');
      out.width = 1; out.height = H;
      var o = out.getContext('2d'), im = o.createImageData(1, H);
      for (j = 0; j < H; j++) {
        var m = [0, 0, 0], n = 0;
        for (i = Math.max(0, j - r); i <= Math.min(H - 1, j + r); i++) { for (k = 0; k < 3; k++) m[k] += brut[i][k]; n++; }
        for (k = 0; k < 3; k++) im.data[j * 4 + k] = Math.round(m[k] / n);
        im.data[j * 4 + 3] = 255;
      }
      o.putImageData(im, 0, 0);
      return { cv: out, moy: brut.reduce(function (a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }, [0, 0, 0]).map(function (v) { return Math.round(v / H); }) };
    }
    return { g: colonne(0), d: colonne(8), sd: sd };
  }
  /* fond flou tiré de la photo elle-même (photo serrée : la carte touche les bords, rien à prolonger proprement) */
  function flou(img) {
    var t = el('canvas'), m = el('canvas');
    t.width = 10; t.height = 10; m.width = 40; m.height = 40;
    t.getContext('2d').drawImage(img, 0, 0, 10, 10);
    var mx = m.getContext('2d');
    mx.imageSmoothingEnabled = true; mx.imageSmoothingQuality = 'high';
    mx.drawImage(t, 0, 0, 40, 40);
    return m;
  }
  /* photo telle quelle, ou carrée avec le tampon (Leboncoin) ; largeur : pour les vignettes, sinon taille réelle */
  function composer(img, lg, tampon, largeur) {
    var iw = img.naturalWidth, ih = img.naturalHeight, cv = el('canvas'), x;
    if (!tampon) {
      var k0 = largeur ? Math.min(1, largeur / iw) : 1;
      cv.width = Math.round(iw * k0); cv.height = Math.round(ih * k0);
      x = cv.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height);
      x.drawImage(img, 0, 0, cv.width, cv.height);
      return cv;
    }
    var S = Math.round(Math.min(largeur || 2000, Math.max(ih, iw / 0.72)));
    cv.width = S; cv.height = S;
    x = cv.getContext('2d');
    var B = bords(img), serre = !B || B.sd > 18, h0 = serre ? 0.95 : 1;
    var k = Math.min(S * h0 / ih, S * 0.72 * h0 / iw), pw = Math.round(iw * k), ph = Math.round(ih * k);
    var px0 = Math.max(0, Math.round(S * (serre ? 0.37 : 0.385) - pw / 2)), py0 = Math.round((S - ph) / 2);
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    if (serre) {
      /* fond flou, voilé de papier, et la photo posée dessus avec une ombre douce */
      x.drawImage(flou(img), 0, 0, S, S);
      x.fillStyle = 'rgba(243,238,227,0.5)'; x.fillRect(0, 0, S, S);
      x.shadowColor = 'rgba(30,27,24,.28)'; x.shadowBlur = S * 0.02; x.shadowOffsetY = S * 0.006;
      x.drawImage(img, px0, py0, pw, ph);
      x.shadowColor = 'rgba(0,0,0,0)'; x.shadowBlur = 0; x.shadowOffsetY = 0;
    } else {
      /* fond uni : on prolonge les bords de la photo, ligne par ligne, sans raccord visible */
      var m = B.g.moy.map(function (v, i) { return Math.round((v + B.d.moy[i]) / 2); });
      x.fillStyle = 'rgb(' + m.join(',') + ')'; x.fillRect(0, 0, S, S);
      x.drawImage(B.g.cv, 0, 0, 1, B.g.cv.height, 0, py0, px0 + 2, ph);
      x.drawImage(B.d.cv, 0, 0, 1, B.d.cv.height, px0 + pw - 2, py0, S - px0 - pw + 2, ph);
      x.drawImage(img, px0, py0, pw, ph);
    }
    var R = S * 0.13;
    sceau(x, Math.min(S * 0.845, S - R * 1.12 - S * 0.012), S * 0.68, R, lg);
    return cv;
  }
  function enJpeg(img, name, tampon) {
    return (tampon ? logoPhoto() : Promise.resolve(null)).then(function (lg) {
      return new Promise(function (res, rej) {
        composer(img, lg, tampon).toBlob(function (b) { if (b) res(new File([b], name, { type: 'image/jpeg' })); else rej(new Error('photo')); }, 'image/jpeg', 0.92);
      });
    });
  }
  function blocPhotos(c, plateforme) {
    var box = el('div', 'annonce__photos');
    box.appendChild(el('p', 'annonce__label', 'Photos'));
    var ck = el('label', 'check annonce__cadre');
    var cb = el('input');
    cb.type = 'checkbox';
    ck.appendChild(cb);
    ck.appendChild(d.createTextNode(' Tampon Poké-Raichu sur la photo : logo et pokeraichu.com, visibles dès la vignette'));
    var regle = el('p', 'muted small annonce__regle', 'Photos d’origine : eBay et Vinted refusent logo et texte sur les photos.');
    box.appendChild(ck);
    box.appendChild(regle);
    var strip = el('div', 'annonce__strip');
    box.appendChild(strip);
    var msg = el('p', 'muted small', 'Recherche des photos…');
    msg.setAttribute('aria-live', 'polite');
    var btn = el('button', 'btn btn--ghost annonce__save', 'Enregistrer les photos');
    btn.type = 'button';
    btn.hidden = true;
    box.appendChild(btn);
    box.appendChild(msg);
    var imgs = [], urls = [];
    function avecTampon() { return plateforme() === 'leboncoin' && cb.checked; }
    function vignettes() {
      urls.forEach(function (u) { URL.revokeObjectURL(u); });
      urls = [];
      strip.textContent = '';
      var tampon = avecTampon();
      (tampon ? logoPhoto() : Promise.resolve(null)).then(function (lg) {
        imgs.forEach(function (im, i) {
          var a = el('a');
          a.target = '_blank'; a.rel = 'noopener';
          var t = el('img');
          t.alt = 'Photo ' + (i + 1); t.width = tampon ? 84 : 60; t.height = 84;
          if (tampon) {
            t.className = 'is-carre';
            composer(im, lg, true, 420).toBlob(function (b) {
              if (!b) return;
              var u = URL.createObjectURL(b);
              urls.push(u);
              t.src = u; a.href = u;
            }, 'image/jpeg', 0.85);
          } else { t.src = im.src; a.href = im.src; }
          a.appendChild(t); strip.appendChild(a);
        });
      });
    }
    function maj() {
      var lbc = plateforme() === 'leboncoin';
      ck.hidden = !lbc || trouve && !imgs.length;
      cb.checked = lbc && tamponSur();
      regle.hidden = lbc || trouve && !imgs.length;
      if (imgs.length) vignettes();
    }
    var trouve = false;
    cb.addEventListener('change', function () { tamponRegler(cb.checked); vignettes(); });
    trouverPhotos(c).then(function (found) {
      imgs = found; trouve = true;
      if (!imgs.length) { msg.textContent = 'Aucune photo trouvée pour cette carte.'; ck.hidden = true; regle.hidden = true; return; }
      vignettes();
      btn.hidden = false;
      msg.textContent = imgs.length + ' photo' + (imgs.length > 1 ? 's' : '') + '. Sur iPhone : « Enregistrer les photos », puis « Enregistrer l’image ». Elles arrivent dans votre pellicule.';
      btn.addEventListener('click', function () {
        btn.disabled = true;
        var tampon = avecTampon();
        Promise.all(imgs.map(function (im, i) { return enJpeg(im, 'poke-raichu-' + c.ref + '-' + (i + 1) + '.jpg', tampon); })).then(function (files) {
          btn.disabled = false;
          if (navigator.canShare && navigator.canShare({ files: files })) {
            return navigator.share({ files: files }).catch(function () {});
          }
          /* ordinateur : téléchargement direct */
          files.forEach(function (f) {
            var a = el('a');
            a.href = URL.createObjectURL(f); a.download = f.name;
            d.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
          });
        }).catch(function () { btn.disabled = false; msg.textContent = 'Photos indisponibles : touchez une vignette, puis gardez le doigt dessus pour l’enregistrer.'; });
      });
    });
    maj();
    box.majPlateforme = maj;
    return box;
  }

  function champ(labelTxt, value, multi, extra) {
    var w = el('div', 'annonce__champ');
    var head = el('div', 'annonce__head');
    head.appendChild(el('span', 'annonce__label', labelTxt));
    if (extra) head.appendChild(el('span', 'annonce__n', extra));
    var b = el('button', 'annonce__copy', 'Copier');
    b.type = 'button';
    head.appendChild(b);
    w.appendChild(head);
    var out = el(multi ? 'pre' : 'p', 'annonce__val', value);
    out.setAttribute('translate', 'no'); /* texte de l'annonce : jamais traduit (assets/js/langue.js) */
    w.appendChild(out);
    b.addEventListener('click', function () { copier(value, b); });
    return w;
  }

  /* panneau d'une carte ; prix = prix actuel (prix en direct compris), null si « sur demande » */
  function panel(c, prix, onChange) {
    var box = el('div', 'annonce');
    var cur = get('pr.annonce.site') || 'ebay';
    if (!SITES.some(function (s) { return s.id === cur; })) cur = 'ebay';
    var tabs = el('div', 'seg annonce__tabs');
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', 'Plateforme');
    var body = el('div', 'annonce__body');
    function draw() {
      var s = SITES.filter(function (x) { return x.id === cur; })[0];
      Array.prototype.forEach.call(tabs.children, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === cur)); });
      body.textContent = '';
      var t = s.id === 'ebay' ? titreEbay(c, s.max) : titre(c, s.max);
      body.appendChild(champ(s.id === 'ebay' ? 'Titre (français + anglais)' : 'Titre', t, false, t.length + ' / ' + s.max));
      if (prix === null || prix === undefined) {
        body.appendChild(el('p', 'muted small', 'Prix sur demande : à fixer vous-même dans l’annonce.'));
      } else {
        var p = prixPour(s.id, prix), e = +ecarts()[s.id] || 0;
        var pc = champ('Prix', num(p), false, e ? (e > 0 ? '+' : '') + e + ' % par rapport au site (' + num(prix) + ' €)' : 'même prix que le site');
        var adj = el('button', 'linkbtn annonce__adj', 'Changer l’écart de prix pour ' + s.nom);
        adj.type = 'button';
        adj.addEventListener('click', function () {
          var form = el('div', 'annonce__ecart');
          var lab = el('label', '', 'Écart en % sur ' + s.nom + ' (ex. 10, ou -5)');
          var inp = el('input', 'input');
          inp.type = 'text'; inp.inputMode = 'text'; inp.value = e ? String(e) : ''; inp.placeholder = '0';
          inp.id = 'an-ecart'; lab.setAttribute('for', 'an-ecart');
          var okb = el('button', 'btn btn--ghost', 'Valider');
          okb.type = 'button';
          okb.addEventListener('click', function () {
            var v = parseFloat(String(inp.value).replace(',', '.').replace(/\s|%/g, ''));
            var all = ecarts();
            if (!isFinite(v) || v === 0) delete all[s.id]; else all[s.id] = Math.max(-90, Math.min(200, Math.round(v * 10) / 10));
            put('pr.annonce.ecarts', JSON.stringify(all));
            draw();
          });
          form.appendChild(lab); form.appendChild(inp); form.appendChild(okb);
          form.appendChild(el('p', 'muted small', 'Valable pour toutes les cartes, sur ce téléphone. Le prix est arrondi à l’euro.'));
          adj.replaceWith(form);
          inp.focus();
        });
        pc.appendChild(adj);
        body.appendChild(pc);
      }
      body.appendChild(champ('Description', description(c, s.id), true));
      body.appendChild(el('p', 'muted small', s.aide));
      var ck = el('label', 'check annonce__done');
      var cb = el('input');
      cb.type = 'checkbox';
      cb.checked = !!(postees()[c.ref] || {})[s.id];
      cb.addEventListener('change', function () {
        var all = postees(), mine = all[c.ref] || {};
        if (cb.checked) mine[s.id] = 1; else delete mine[s.id];
        if (Object.keys(mine).length) all[c.ref] = mine; else delete all[c.ref];
        put('pr.annonce.postees', JSON.stringify(all));
        if (onChange) onChange();
      });
      ck.appendChild(cb);
      ck.appendChild(d.createTextNode(' Annonce postée sur ' + s.nom));
      body.appendChild(ck);
    }
    SITES.forEach(function (s) {
      var b = el('button', '', s.nom);
      b.type = 'button';
      b.setAttribute('data-v', s.id);
      b.addEventListener('click', function () { cur = s.id; put('pr.annonce.site', cur); draw(); if (photos && photos.majPlateforme) photos.majPlateforme(); });
      tabs.appendChild(b);
    });
    box.appendChild(tabs);
    box.appendChild(body);
    var photos = blocPhotos(c, function () { return cur; });
    box.appendChild(photos);
    draw();
    return box;
  }

  /* « eBay, Vinted » : plateformes où la carte est déjà postée */
  function ou(ref) {
    var m = postees()[ref] || {};
    return SITES.filter(function (s) { return m[s.id]; }).map(function (s) { return s.nom; });
  }

  window.PR_ANNONCE = { panel: panel, ou: ou, titre: titre, titreEbay: titreEbay, description: description, prixPour: prixPour, composer: composer, logoPhoto: logoPhoto, copier: copier };
})();
