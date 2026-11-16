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
  function enJpeg(img, name) {
    return new Promise(function (res, rej) {
      var cv = el('canvas');
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      var x = cv.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height);
      x.drawImage(img, 0, 0);
      cv.toBlob(function (b) { if (b) res(new File([b], name, { type: 'image/jpeg' })); else rej(new Error('photo')); }, 'image/jpeg', 0.92);
    });
  }
  function blocPhotos(c) {
    var box = el('div', 'annonce__photos');
    box.appendChild(el('p', 'annonce__label', 'Photos'));
    var strip = el('div', 'annonce__strip');
    box.appendChild(strip);
    var msg = el('p', 'muted small', 'Recherche des photos…');
    msg.setAttribute('aria-live', 'polite');
    var btn = el('button', 'btn btn--ghost annonce__save', 'Enregistrer les photos');
    btn.type = 'button';
    btn.hidden = true;
    box.appendChild(btn);
    box.appendChild(msg);
    trouverPhotos(c).then(function (imgs) {
      if (!imgs.length) { msg.textContent = 'Aucune photo trouvée pour cette carte.'; return; }
      imgs.forEach(function (im, i) {
        var a = el('a');
        a.href = im.src; a.target = '_blank'; a.rel = 'noopener';
        var t = el('img');
        t.src = im.src; t.alt = 'Photo ' + (i + 1); t.loading = 'lazy'; t.width = 60; t.height = 84;
        a.appendChild(t); strip.appendChild(a);
      });
      btn.hidden = false;
      msg.textContent = imgs.length + ' photo' + (imgs.length > 1 ? 's' : '') + '. Sur iPhone : « Enregistrer les photos », puis « Enregistrer l’image ». Elles arrivent dans votre pellicule.';
      btn.addEventListener('click', function () {
        btn.disabled = true;
        Promise.all(imgs.map(function (im, i) { return enJpeg(im, 'poke-raichu-' + c.ref + '-' + (i + 1) + '.jpg'); })).then(function (files) {
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
      var t = titre(c, s.max);
      body.appendChild(champ('Titre', t, false, t.length + ' / ' + s.max));
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
      b.addEventListener('click', function () { cur = s.id; put('pr.annonce.site', cur); draw(); });
      tabs.appendChild(b);
    });
    box.appendChild(tabs);
    box.appendChild(body);
    box.appendChild(blocPhotos(c));
    draw();
    return box;
  }

  /* « eBay, Vinted » : plateformes où la carte est déjà postée */
  function ou(ref) {
    var m = postees()[ref] || {};
    return SITES.filter(function (s) { return m[s.id]; }).map(function (s) { return s.nom; });
  }

  window.PR_ANNONCE = { panel: panel, ou: ou, titre: titre, description: description, prixPour: prixPour };
})();
