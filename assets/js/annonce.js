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

  /* titre : l'essentiel d'abord, puis chaque précision tant qu'elle tient dans la limite de la plateforme */
  function titre(c, max) {
    var lang = (LANG[c.langue] || [])[1];
    var slab = c.type === 'slab', scelle = c.type === 'scelle';
    var base = (scelle ? 'Pokémon ' : 'Carte Pokémon ') + c.titre;
    var extra = [];
    if (slab) extra.push(c.etat.libelle);
    if (c.edition) extra.push(c.edition);
    if (c.rarete) extra.push(c.rarete);
    if (lang) extra.push(lang);
    if (c.extension && c.extension.nom && c.titre.indexOf(c.extension.nom) === -1) extra.push(c.extension.nom);
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

  function description(c, site) {
    var L = [], lang = (LANG[c.langue] || [])[0];
    var slab = c.type === 'slab', scelle = c.type === 'scelle';
    L.push(c.titre + (slab ? ' · ' + c.etat.libelle : ''));
    L.push('');
    if (c.variante) L.push('• ' + c.variante);
    if (c.edition) L.push('• ' + c.edition);
    if (c.rarete) L.push('• Rareté : ' + c.rarete);
    if (c.extension && c.extension.nom) L.push('• Extension : ' + c.extension.nom + (c.extension.code ? ' (' + c.extension.code + ')' : ''));
    if (lang) L.push('• Langue : ' + lang);
    if (c.nom_en && c.nom_en !== c.nom_fr && !scelle) L.push('• Nom anglais : ' + c.nom_en);
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
  /* cadre Poké-Raichu des photos d'annonce (demande d'Arthur, 22/11/2026) : un bandeau ajouté SOUS la photo (rien ne
     cache la carte), le logo dans le coin, « site web : pokeraichu.com ». Les photos du site ne changent pas.
     eBay interdit d'ajouter texte, logo ou filigrane aux photos (règlement « Picture policy ») : décoché par défaut sur
     l'onglet eBay, coché ailleurs ; le choix est gardé par plateforme sur ce téléphone (pr.annonce.cadre). */
  var LOGO = null, POLICE = '-apple-system, system-ui, "Helvetica Neue", Arial, sans-serif';
  function logoPhoto() {
    if (!LOGO) LOGO = new Promise(function (res) {
      var i = new Image();
      i.onload = function () { res(i); };
      i.onerror = function () { res(null); };
      i.src = 'assets/img/logo-photo.png?v=1';
    });
    return LOGO;
  }
  function cadreSur(site) { var c = getJSON('pr.annonce.cadre', {}); return Object.prototype.hasOwnProperty.call(c, site) ? !!c[site] : site !== 'ebay'; }
  function cadreRegler(site, v) { var c = getJSON('pr.annonce.cadre', {}); c[site] = !!v; put('pr.annonce.cadre', JSON.stringify(c)); }
  function espace(x, t, X, Y, pas) { for (var i = 0; i < t.length; i++) { x.fillText(t[i], X, Y); X += x.measureText(t[i]).width + pas; } return X; }
  function largeurEspacee(x, t, pas) { var w = 0; for (var i = 0; i < t.length; i++) w += x.measureText(t[i]).width + (i ? pas : 0); return w; }
  /* photo (et bandeau) sur un canvas ; largeur : pour les vignettes, sinon taille réelle */
  function composer(img, lg, cadre, largeur) {
    var k = largeur ? Math.min(1, largeur / img.naturalWidth) : 1;
    var w = Math.round(img.naturalWidth * k), hp = Math.round(img.naturalHeight * k), bande = cadre ? Math.round(w * 0.13) : 0;
    var cv = el('canvas');
    cv.width = w; cv.height = hp + bande;
    var x = cv.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height);
    x.drawImage(img, 0, 0, w, hp);
    if (!bande) return cv;
    var y0 = hp, filet = Math.max(2, Math.round(bande * 0.045));
    x.fillStyle = '#FBF3E4'; x.fillRect(0, y0, w, bande);
    x.fillStyle = '#E5802B'; x.fillRect(0, y0, w, filet);
    var m = Math.round(bande * 0.15), lh = bande - filet - 2 * m, lw = 0;
    if (lg) { lw = lh * lg.naturalWidth / lg.naturalHeight; x.drawImage(lg, Math.round(m * 1.1), Math.round(y0 + filet + m), Math.round(lw), Math.round(lh)); }
    var f1 = Math.max(8, Math.round(bande * 0.165)), f2 = Math.max(12, Math.round(bande * 0.34)), pas = f1 * 0.16;
    x.font = '700 ' + f1 + 'px ' + POLICE;
    var w1 = largeurEspacee(x, 'SITE WEB', pas);
    x.font = '700 ' + f2 + 'px ' + POLICE;
    var w2 = x.measureText('pokeraichu.com').width;
    var bloc = Math.max(w1, w2), gauche = Math.round(m * 1.1 + lw + m * 1.2);
    var tx = Math.max(gauche, Math.round((w - bloc) / 2)), ty = y0 + filet + (bande - filet) / 2;
    x.textBaseline = 'alphabetic';
    x.fillStyle = '#B85414'; x.font = '700 ' + f1 + 'px ' + POLICE;
    espace(x, 'SITE WEB', tx, Math.round(ty - f2 * 0.42), pas);
    x.fillStyle = '#3B2414'; x.font = '700 ' + f2 + 'px ' + POLICE;
    x.fillText('pokeraichu.com', tx, Math.round(ty + f2 * 0.62));
    return cv;
  }
  function enJpeg(img, name, cadre) {
    return (cadre ? logoPhoto() : Promise.resolve(null)).then(function (lg) {
      return new Promise(function (res, rej) {
        composer(img, lg, cadre).toBlob(function (b) { if (b) res(new File([b], name, { type: 'image/jpeg' })); else rej(new Error('photo')); }, 'image/jpeg', 0.92);
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
    ck.appendChild(d.createTextNode(' Cadre Poké-Raichu : logo et « site web : pokeraichu.com » sous la photo'));
    var regle = el('p', 'muted small annonce__regle', 'eBay interdit d’ajouter texte, logo ou filigrane aux photos (règlement « Picture policy ») : risque de retrait de l’annonce. Laisse décoché pour eBay.');
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
    function vignettes() {
      urls.forEach(function (u) { URL.revokeObjectURL(u); });
      urls = [];
      strip.textContent = '';
      var cadre = cb.checked;
      (cadre ? logoPhoto() : Promise.resolve(null)).then(function (lg) {
        imgs.forEach(function (im, i) {
          var a = el('a');
          a.target = '_blank'; a.rel = 'noopener';
          var t = el('img');
          t.alt = 'Photo ' + (i + 1); t.width = 60; t.height = cadre ? 94 : 84;
          if (cadre) {
            composer(im, lg, true, 360).toBlob(function (b) {
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
      var site = plateforme();
      cb.checked = cadreSur(site);
      regle.hidden = site !== 'ebay';
      if (imgs.length) vignettes();
    }
    cb.addEventListener('change', function () { cadreRegler(plateforme(), cb.checked); vignettes(); });
    trouverPhotos(c).then(function (found) {
      imgs = found;
      if (!imgs.length) { msg.textContent = 'Aucune photo trouvée pour cette carte.'; ck.hidden = true; regle.hidden = true; return; }
      vignettes();
      btn.hidden = false;
      msg.textContent = imgs.length + ' photo' + (imgs.length > 1 ? 's' : '') + '. Sur iPhone : « Enregistrer les photos », puis « Enregistrer l’image ». Elles arrivent dans votre pellicule.';
      btn.addEventListener('click', function () {
        btn.disabled = true;
        var cadre = cb.checked;
        Promise.all(imgs.map(function (im, i) { return enJpeg(im, 'poke-raichu-' + c.ref + '-' + (i + 1) + '.jpg', cadre); })).then(function (files) {
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

  window.PR_ANNONCE = { panel: panel, ou: ou, titre: titre, titreEbay: titreEbay, description: description, prixPour: prixPour, composer: composer, logoPhoto: logoPhoto };
})();
