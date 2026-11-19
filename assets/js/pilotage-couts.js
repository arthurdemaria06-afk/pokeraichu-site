/* Poké-Raichu · pilotage : charges, voyages, coûts complets, seuil de rentabilité et coûts cachés.
   Se branche sur le résultat de PRCalcul.calcul(doc) sans le modifier (les chiffres « Excel » restent identiques).

   Coûts complets (méthode des coûts complets) :
     coût complet d'un article = coût d'achat (TVA import des réglages comprise)
                                + quote-part des frais de son voyage (clé : coût d'achat, ou nombre d'articles)
                                + frais directs rattachés à l'article (gradation, transport…).
     Les frais de voyage restent dans la valeur du stock jusqu'à la vente (comme des frais accessoires d'achat).
   Coûts variables (seuil de rentabilité) : coûts des ventes et frais proportionnels = variables ;
     voyages, abonnements et structure = fixes, pris dans la période où ils sont payés.
   Coûts cachés (non décaissés) : temps passé, immobilisation du capital, décote consentie, dépréciation du stock. */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.PRCouts = fabrique();
})(this, function () {
  'use strict';

  function nb(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function z(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }
  function somme(l, f) { return l.reduce(function (a, x) { return a + z(f(x)); }, 0); }

  /* nature : directe (rattachable à un objet de coût), indirecte (structure), cachee (non décaissée)
     cote : achat (s'ajoute au coût des articles), vente (frais de distribution directs), structure
     comportement : variable ou fixe (pour le seuil de rentabilité) */
  var CATEGORIES = [
    { id: 'voyage', nom: 'Voyage : avion, train, hôtel', compte: '6251', cote: 'achat', nature: 'directe', comportement: 'fixe', cible: 'voyage' },
    { id: 'sejour', nom: 'Repas et frais sur place', compte: '6256', cote: 'achat', nature: 'directe', comportement: 'fixe', cible: 'voyage' },
    { id: 'transport', nom: 'Transport et douane des achats', compte: '6241', cote: 'achat', nature: 'directe', comportement: 'variable' },
    { id: 'gradation', nom: 'Gradation (PSA, PCA…)', compte: '611', cote: 'achat', nature: 'directe', comportement: 'variable', cible: 'carte' },
    { id: 'commission', nom: 'Commissions des plateformes', compte: '6222', cote: 'vente', nature: 'directe', comportement: 'variable' },
    { id: 'envoi', nom: 'Envois et emballages', compte: '6242', cote: 'vente', nature: 'directe', comportement: 'variable' },
    { id: 'fournitures', nom: 'Protections et fournitures', compte: '6064', cote: 'structure', nature: 'indirecte', comportement: 'variable' },
    { id: 'abonnement', nom: 'Abonnements et logiciels', compte: '651', cote: 'structure', nature: 'indirecte', comportement: 'fixe' },
    { id: 'telecom', nom: 'Téléphone, internet, site', compte: '626', cote: 'structure', nature: 'indirecte', comportement: 'fixe' },
    { id: 'publicite', nom: 'Publicité, salons, lives', compte: '623', cote: 'structure', nature: 'indirecte', comportement: 'fixe' },
    { id: 'banque', nom: 'Banque et frais de change', compte: '627', cote: 'structure', nature: 'indirecte', comportement: 'fixe' },
    { id: 'honoraires', nom: 'Comptable et juridique', compte: '6226', cote: 'structure', nature: 'indirecte', comportement: 'fixe' },
    { id: 'assurance', nom: 'Assurance', compte: '616', cote: 'structure', nature: 'indirecte', comportement: 'fixe' },
    { id: 'impots', nom: 'Impôts et taxes (CFE…)', compte: '635', cote: 'structure', nature: 'indirecte', comportement: 'fixe' },
    { id: 'materiel', nom: 'Petit matériel', compte: '6063', cote: 'structure', nature: 'indirecte', comportement: 'fixe' },
    { id: 'pertes', nom: 'Pertes, casse, litiges', compte: '658', cote: 'structure', nature: 'indirecte', comportement: 'variable' },
    { id: 'autre', nom: 'Autres charges', compte: '628', cote: 'structure', nature: 'indirecte', comportement: 'fixe' },
    { id: 'temps', nom: 'Temps passé (non payé)', compte: '', cote: 'structure', nature: 'cachee', comportement: 'fixe', heures: true }
  ];
  var CAT = {};
  CATEGORIES.forEach(function (c) { CAT[c.id] = c; });
  function categorie(id) { return CAT[id] || CAT.autre; }

  /* ---------------------------------------------------------------- dates (AAAA-MM-JJ) */
  function iso(d) { return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); }
  function versDate(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null; }
  function jours(a, b) { var x = versDate(a), y = versDate(b); return x && y ? Math.round((y - x) / 86400000) : null; }
  function ajouterMois(s, n) {
    var d = versDate(s); if (!d) return null;
    var j = d.getUTCDate(), r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
    var fin = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
    r.setUTCDate(Math.min(j, fin));
    return iso(r);
  }
  function plusJours(s, n) { var d = versDate(s); if (!d) return null; d.setUTCDate(d.getUTCDate() + Math.round(n)); return iso(d); }
  function dans(date, p) { return !p || (!!date && date >= p.debut && date <= p.fin); }
  function mediane(l) { if (!l.length) return null; var t = l.slice().sort(), m = t.length >> 1; return t.length % 2 ? t[m] : t[m - 1]; }

  /* ---------------------------------------------------------------- paramètres (avec valeurs par défaut) */
  function parametres(doc, R) {
    var p = doc.params || {};
    return {
      taux: z(p.taux_jpy), fv: R.params.fv, tva: R.params.tva, envoi: R.params.envoi,
      taux_horaire: nb(p.taux_horaire), minutes_vente: nb(p.minutes_par_vente),
      cout_capital: nb(p.cout_capital) != null ? p.cout_capital : 0.017,
      cle_voyage: p.cle_voyage === 'nombre' ? 'nombre' : 'valeur',
      assujetti: !!p.tva_recuperable
    };
  }

  /* ---------------------------------------------------------------- charges : une ligne par échéance */
  function occurrences(doc, P, auj) {
    var out = [];
    (doc.charges || []).forEach(function (c) {
      if (!c || !c.date) return;
      var cat = categorie(c.cat), jpy = c.devise === 'JPY';
      var ttc = cat.heures ? z(c.heures) * z(P.taux_horaire) : (jpy ? (P.taux ? z(c.montant) / P.taux : 0) : z(c.montant));
      var tva = cat.heures ? 0 : (jpy ? (P.taux ? z(c.tva) / P.taux : 0) : z(c.tva));
      var cout = P.assujetti ? ttc - tva : ttc;
      var dates = [c.date];
      if (c.recurrence === 'mois' || c.recurrence === 'an') {
        var pas = c.recurrence === 'mois' ? 1 : 12, limite = c.fin && c.fin < auj ? c.fin : auj;
        for (var k = 1; k < 600; k++) { var d = ajouterMois(c.date, pas * k); if (!d || d > limite) break; dates.push(d); }
      }
      dates.forEach(function (d, i) {
        if (d > auj && i > 0) return;
        out.push({ c: c, cat: cat, date: d, ttc: ttc, tva: tva, cout: cout, heures: cat.heures ? z(c.heures) : 0, cible: c.cible || 'general' });
      });
    });
    return out;
  }

  /* ---------------------------------------------------------------- voyages : quels achats en font partie */
  function dateAchat(r, R) {
    var c = r.c, a = c.achat || {}, id = (a.mode === 'ticket' && a.ticket) || c.ticket, t = id && R.ticketsParId[id];
    return c.date_achat || (t && t.t && t.t.date) || null;
  }
  function voyageDe(r, doc, R, voyages) {
    var c = r.c, a = c.achat || {};
    if (c.voyage) return c.voyage;
    if (a.mode === 'lot') { var L = (doc.lots || []).filter(function (l) { return l.id === a.lot; })[0]; if (L && L.voyage) return L.voyage; }
    var id = (a.mode === 'ticket' && a.ticket) || c.ticket, t = id && R.ticketsParId[id];
    if (t && t.t && t.t.voyage) return t.t.voyage;
    var d = dateAchat(r, R);
    if (!d) return null;
    for (var i = 0; i < voyages.length; i++) { var V = voyages[i]; if (V.debut && V.fin && d >= V.debut && d <= V.fin) return V.id; }
    return null;
  }

  /* ---------------------------------------------------------------- calcul principal */
  function couts(R, doc, opts) {
    opts = opts || {};
    var auj = opts.aujourdhui || new Date().toISOString().slice(0, 10);
    var periode = opts.periode && opts.periode.debut ? opts.periode : null;
    var P = parametres(doc, R);
    var occ = occurrences(doc, P, auj);
    var voyages = (doc.voyages || []).slice().sort(function (a, b) { return String(a.debut || '').localeCompare(String(b.debut || '')); });

    /* articles : cartes (hors totaux exclues) et produits */
    var cartes = R.cartes.filter(function (r) { return r.compte && !r.hors; });
    var art = {};
    cartes.forEach(function (r) {
      art['c:' + r.ref] = { type: 'carte', r: r, ref: r.ref, voyage: voyageDe(r, doc, R, voyages), achat: z(r.cout), unites: 1,
        directs_achat: 0, directs_vente: 0, qp_voyage: 0, date_achat: dateAchat(r, R) };
    });
    R.produits.forEach(function (x) {
      art['p:' + x.id] = { type: 'produit', x: x, ref: x.id, voyage: x.p.voyage || null, achat: x.connu ? z(x.paye) : z(x.stock_estime), unites: z(x.nb),
        directs_achat: 0, directs_vente: 0, qp_voyage: 0, date_achat: null };
    });

    /* frais directs rattachés à un article */
    var orphelins = [];
    occ.forEach(function (o) {
      if (o.cible !== 'carte' || o.cat.nature === 'cachee') return;
      var a = art['c:' + o.c.ref] || art['p:' + o.c.ref];
      if (!a) { orphelins.push(o); return; }
      if (o.cat.cote === 'vente') a.directs_vente += o.cout; else a.directs_achat += o.cout;
    });

    /* voyages : frais, achats, quote-part par article */
    var parVoyage = {};
    var listeV = voyages.map(function (V) {
      var arts = Object.keys(art).map(function (k) { return art[k]; }).filter(function (a) { return a.voyage === V.id; });
      var fr = occ.filter(function (o) { return o.cible === 'voyage' && o.c.voyage === V.id && o.cat.nature !== 'cachee'; });
      var frais = somme(fr, function (o) { return o.cout; });
      var achats = somme(arts, function (a) { return a.achat; });
      var unites = somme(arts, function (a) { return a.unites; });
      var taux = P.cle_voyage === 'nombre' ? (unites ? frais / unites : null) : (achats ? frais / achats : null);
      arts.forEach(function (a) { a.qp_voyage = taux == null ? 0 : (P.cle_voyage === 'nombre' ? taux * a.unites : taux * a.achat); });
      var v = { V: V, articles: arts, charges: fr, frais: frais, achats: achats, unites: unites, taux_frais: achats ? frais / achats : null,
        duree: V.debut && V.fin ? jours(V.debut, V.fin) + 1 : null, affecte: arts.length > 0 };
      parVoyage[V.id] = v;
      return v;
    });

    /* coût complet et résultat complet par article */
    var tvaI = 1 + P.tva;
    Object.keys(art).forEach(function (k) {
      var a = art[k];
      if (a.type === 'carte') {
        var r = a.r;
        a.cout_achat = a.achat * tvaI;
        a.frais_achat = a.qp_voyage + a.directs_achat;
        a.cout_complet = a.cout_achat + a.frais_achat;
        a.vendu = !!r.vente;
        if (r.vente) {
          a.ca = r.vente.encaisse; a.frais_vente = r.vente.frais + r.vente.envoi + a.directs_vente;
          a.resultat = a.ca - a.frais_vente - a.cout_complet;
          a.date_vente = r.c.vente_date || null;
        } else {
          var prix = nb(r.c.prix);
          a.valeur = prix; a.latent = prix != null ? prix * (1 - P.fv) - P.envoi - a.cout_complet : null;
        }
      } else {
        var x = a.x, n = z(x.vente.vendus), q = z(x.nb) || 1;
        var partV = Math.min(1, n / q), qpU = a.qp_voyage / q, daU = a.directs_achat / q;
        a.cout_achat = (x.connu ? z(x.paye) : a.achat) * (x.p.frais_u != null ? 1 : tvaI);
        a.frais_achat = a.qp_voyage + a.directs_achat;
        a.cout_complet = a.cout_achat + a.frais_achat;
        a.vendu = n > 0;
        a.vente = { n: n, ca: x.vente.encaisse, frais: x.vente.frais + x.vente.envoi + a.directs_vente, cout: x.vente.cout + (qpU + daU) * n };
        a.vente.resultat = a.vente.ca - a.vente.frais - a.vente.cout;
        a.latent = x.latent != null ? x.latent - (qpU + daU) * x.reste : null;
        a.part_vendue = partV;
      }
    });

    /* ---------------------------------------------------------------- compte de résultat analytique de la période */
    var lignesVentes = [], nonDatees = 0;
    Object.keys(art).forEach(function (k) {
      var a = art[k];
      if (a.type === 'carte') {
        if (!a.vendu) return;
        if (periode && !a.date_vente) { nonDatees++; return; }
        if (!dans(a.date_vente, periode)) return;
        lignesVentes.push({ a: a, n: 1, ca: a.ca, cout_achat: a.cout_achat, frais_achat: a.frais_achat, directs_achat: a.directs_achat,
          frais_vente: a.frais_vente, directs_vente: a.directs_vente, prix: nb(a.r.c.prix), date: a.date_vente });
      } else if (a.vente.n) {
        var x = a.x, hist = x.p.historique || [], n = a.vente.n;
        var nPer = periode ? somme(hist.filter(function (h) { return dans(h.date, periode); }), function (h) { return h.n; }) : n;
        if (periode) nonDatees += Math.max(0, n - somme(hist, function (h) { return h.n; })) > 0 ? 1 : 0;
        if (!nPer) return;
        var f = Math.min(1, nPer / n), q = z(x.nb) || 1;
        lignesVentes.push({ a: a, n: nPer, ca: a.vente.ca * f, cout_achat: x.vente.cout * f, frais_achat: (a.qp_voyage + a.directs_achat) / q * nPer,
          directs_achat: a.directs_achat / q * nPer, frais_vente: a.vente.frais * f, directs_vente: a.directs_vente * f, prix: nb(x.prix_u) != null ? x.prix_u * nPer : null });
      }
    });
    var occP = occ.filter(function (o) { return dans(o.date, periode); });
    var visibles = occP.filter(function (o) { return o.cat.nature !== 'cachee'; });
    /* frais de voyage d'un voyage sans achat rattaché : charge de la période */
    var voyNonAffectes = visibles.filter(function (o) { return o.cible === 'voyage' && !(parVoyage[o.c.voyage] && parVoyage[o.c.voyage].affecte); });
    var generalAchat = visibles.filter(function (o) { return o.cible === 'general' && o.cat.cote === 'achat'; });
    var generalVente = visibles.filter(function (o) { return o.cible === 'general' && o.cat.cote === 'vente'; });
    var structure = visibles.filter(function (o) { return o.cible === 'general' && o.cat.cote === 'structure'; });

    var ca = somme(lignesVentes, function (l) { return l.ca; });
    var coutAchatV = somme(lignesVentes, function (l) { return l.cout_achat; });
    var fraisAchatAbs = somme(lignesVentes, function (l) { return l.frais_achat; });
    var fraisAchatNA = somme(generalAchat, function (o) { return o.cout; }) + somme(voyNonAffectes, function (o) { return o.cout; }) + somme(orphelins.filter(function (o) { return dans(o.date, periode) && o.cat.cote === 'achat'; }), function (o) { return o.cout; });
    var fraisVente = somme(lignesVentes, function (l) { return l.frais_vente; }) + somme(generalVente, function (o) { return o.cout; }) + somme(orphelins.filter(function (o) { return dans(o.date, periode) && o.cat.cote === 'vente'; }), function (o) { return o.cout; });
    var chargesStructure = somme(structure, function (o) { return o.cout; });
    var margeCom = ca - coutAchatV;
    var margeDirecte = margeCom - fraisAchatAbs - fraisAchatNA - fraisVente;
    var resultat = margeDirecte - chargesStructure;

    /* ---------------------------------------------------------------- coûts cachés */
    var nbVentes = somme(lignesVentes, function (l) { return l.a.type === 'carte' ? 1 : l.n; });
    var heuresVentes = P.minutes_vente != null ? nbVentes * P.minutes_vente / 60 : 0;
    var heuresSaisies = somme(occP.filter(function (o) { return o.cat.heures; }), function (o) { return o.heures; });
    var temps = P.taux_horaire != null ? (heuresVentes + heuresSaisies) * P.taux_horaire : null;
    /* immobilisation : coût complet × taux annuel × jours de détention compris dans la période */
    var connues = Object.keys(art).map(function (k) { return art[k].date_achat; }).filter(Boolean);
    var dateType = mediane(connues);
    var debutP = periode ? periode.debut : null, finP = periode ? (periode.fin < auj ? periode.fin : auj) : auj;
    var capital = 0, capitalBase = 0;
    Object.keys(art).forEach(function (k) {
      var a = art[k];
      if (a.type !== 'carte') return;
      var d0 = a.date_achat || dateType;
      if (!d0) return;
      var d1 = a.vendu ? (a.date_vente || null) : auj;
      if (!d1) return;
      var deb = debutP && debutP > d0 ? debutP : d0, fin = finP < d1 ? finP : d1;
      var j = jours(deb, fin);
      if (j > 0) { capital += a.cout_complet * P.cout_capital * j / 365; if (!a.vendu) capitalBase += a.cout_complet; }
    });
    /* décote consentie : prix marché − prix de vente, sur les ventes de la période */
    var decote = somme(lignesVentes, function (l) { return l.prix != null && l.prix > l.ca ? l.prix - l.ca : 0; });
    /* dépréciation du stock à date : coût complet au-dessus de la valeur nette de réalisation */
    var marcheV = 0, encV = 0;
    cartes.forEach(function (r) { if (r.vente && nb(r.c.prix) != null) { marcheV += r.c.prix; encV += r.vente.encaisse; } });
    var realisation = marcheV ? Math.min(1, encV / marcheV) : 1;
    var deprec = 0, nDeprec = 0;
    Object.keys(art).forEach(function (k) {
      var a = art[k];
      if (a.type !== 'carte' || a.vendu || a.valeur == null) return;
      var vnr = a.valeur * realisation * (1 - P.fv) - P.envoi;
      if (a.cout_complet > vnr + 0.005) { deprec += a.cout_complet - vnr; nDeprec++; }
    });
    var caches = { temps: temps, heures: heuresVentes + heuresSaisies, heures_ventes: heuresVentes, heures_saisies: heuresSaisies,
      capital: capital, capital_base: capitalBase, taux_capital: P.cout_capital, decote: decote, depreciation: deprec, n_depreciation: nDeprec,
      realisation: realisation };
    caches.total = z(temps) + capital + decote + deprec;

    /* ---------------------------------------------------------------- coûts variables et seuil de rentabilité */
    var cv = coutAchatV + somme(lignesVentes, function (l) { return l.directs_achat; }) + fraisVente
      + somme(generalAchat.concat(structure).filter(function (o) { return o.cat.comportement === 'variable'; }), function (o) { return o.cout; })
      + somme(orphelins.filter(function (o) { return dans(o.date, periode) && o.cat.cote === 'achat'; }), function (o) { return o.cout; });
    var cf = somme(visibles.filter(function (o) { return o.cible === 'voyage'; }), function (o) { return o.cout; })
      + somme(generalAchat.concat(structure).filter(function (o) { return o.cat.comportement === 'fixe'; }), function (o) { return o.cout; });
    var mcv = ca - cv, tmcv = ca ? mcv / ca : null, resCV = mcv - cf;
    var debutAct = periode ? periode.debut : premiereDate(art, occ, R);
    var duree = debutAct ? Math.max(1, jours(debutAct, periode ? (periode.fin < auj ? periode.fin : auj) : auj) + 1) : null;
    var sr = tmcv && tmcv > 0 ? cf / tmcv : null;
    var pmJours = sr != null && ca > 0 && duree ? sr / ca * duree : null;
    var seuil = {
      cv: cv, cf: cf, mcv: mcv, tmcv: tmcv, resultat: resCV, sr: sr, duree: duree, debut: debutAct,
      point_mort_jours: pmJours, point_mort_date: pmJours != null && debutAct ? plusJours(debutAct, pmJours) : null,
      marge_securite: sr != null ? ca - sr : null, indice_securite: sr != null && ca ? (ca - sr) / ca : null,
      levier: resCV > 0 ? mcv / resCV : null, ecart: resultat - resCV
    };

    /* ---------------------------------------------------------------- répartition des charges de la période */
    var parCat = {};
    visibles.forEach(function (o) { var k = o.cat.id; (parCat[k] = parCat[k] || { cat: o.cat, montant: 0, tva: 0, n: 0 }); parCat[k].montant += o.cout; parCat[k].tva += o.tva; parCat[k].n++; });
    var categories = Object.keys(parCat).map(function (k) { return parCat[k]; }).sort(function (a, b) { return b.montant - a.montant; });
    var directs = coutAchatV + fraisAchatAbs + fraisAchatNA + fraisVente;

    /* ---------------------------------------------------------------- voyages : retour sur investissement (toute la vie du voyage) */
    listeV.forEach(function (v) {
      var vendus = v.articles.filter(function (a) { return a.vendu; });
      var benef = 0, caV = 0, latent = 0, coutStock = 0, valeurStock = 0, nVendus = 0, nStock = 0, coutTotal = 0, coutAchat = 0, achatMesure = 0, qpMesure = 0;
      v.articles.forEach(function (a) {
        coutTotal += a.cout_complet; coutAchat += a.cout_achat;
        if (a.type === 'carte') {
          if (a.vendu) { benef += a.resultat; caV += a.ca; nVendus++; achatMesure += a.cout_achat; qpMesure += a.qp_voyage; }
          else {
            nStock++; coutStock += a.cout_complet;
            if (a.valeur != null) { valeurStock += a.valeur; latent += z(a.latent); achatMesure += a.cout_achat; qpMesure += a.qp_voyage; }
          }
        } else {
          benef += a.vente.resultat; caV += a.vente.ca; nVendus += a.vente.n; nStock += z(a.x.reste);
          coutStock += a.cout_complet * (1 - a.part_vendue); valeurStock += z(a.x.stock_valeur); latent += z(a.latent);
          if (a.latent != null || a.vente.n) { achatMesure += a.cout_achat; qpMesure += a.qp_voyage; }
        }
      });
      if (!v.affecte) coutTotal = v.frais;
      /* marge par euro d'achat, avant frais de voyage (sur les articles dont on connaît la valeur) */
      var margeAvantFrais = achatMesure ? (benef + latent + qpMesure) / achatMesure : null;
      Object.assign(v, { vendus: vendus.length, n_vendus: nVendus, n_stock: nStock, ca: caV, benef: benef, latent: latent, cout_stock: coutStock,
        valeur_stock: valeurStock, cout_total: coutTotal, cout_achat: coutAchat,
        roi_realise: coutTotal ? benef / coutTotal : null, roi_potentiel: coutTotal ? (benef + latent) / coutTotal : null,
        recupere: coutTotal ? caV / coutTotal : null, marge_avant_frais: margeAvantFrais,
        seuil_achat: margeAvantFrais && margeAvantFrais > 0 ? v.frais / margeAvantFrais : null,
        frais_par_jour: v.duree ? v.frais / v.duree : null });
    });

    return {
      params: P, periode: periode, aujourdhui: auj, occurrences: occ, occ_periode: occP, articles: art, voyages: listeV, parVoyage: parVoyage,
      orphelins: orphelins, non_datees: nonDatees, nb_ventes: nbVentes,
      cascade: { ca: ca, cout_achat: coutAchatV, marge_commerciale: margeCom, frais_achat: fraisAchatAbs, frais_achat_non_affectes: fraisAchatNA,
        frais_vente: fraisVente, marge_directe: margeDirecte, structure: chargesStructure, resultat: resultat, caches: caches.total,
        resultat_economique: resultat - caches.total },
      caches: caches, seuil: seuil, categories: categories,
      totaux: { directs: directs, indirects: chargesStructure, caches: caches.total, tva: somme(visibles, function (o) { return o.tva; }),
        charges: somme(visibles, function (o) { return o.cout; }),
        stock_frais_voyage: somme(Object.keys(art).map(function (k) { return art[k]; }), function (a) {
          return a.type === 'carte' ? (a.vendu ? 0 : a.qp_voyage) : a.qp_voyage * (1 - z(a.part_vendue));
        }) }
    };
  }
  function premiereDate(art, occ, R) {
    var ds = [];
    Object.keys(art).forEach(function (k) { if (art[k].date_achat) ds.push(art[k].date_achat); if (art[k].date_vente) ds.push(art[k].date_vente); });
    occ.forEach(function (o) { ds.push(o.date); });
    ds.sort();
    return ds[0] || null;
  }

  /* années présentes dans les données (pour choisir une période) */
  function annees(doc, R) {
    var s = {};
    (doc.charges || []).forEach(function (c) { if (c.date) s[c.date.slice(0, 4)] = 1; });
    R.cartes.forEach(function (r) { if (r.c.vente_date) s[r.c.vente_date.slice(0, 4)] = 1; if (r.c.date_achat) s[r.c.date_achat.slice(0, 4)] = 1; });
    (doc.tickets || []).forEach(function (t) { if (t.date) s[t.date.slice(0, 4)] = 1; });
    return Object.keys(s).sort().reverse();
  }

  /* voyage proposé d'après les dates des tickets japonais pas encore rattachés */
  function proposition(doc, R) {
    var ids = {};
    (doc.voyages || []).forEach(function (V) { ids[V.id] = V; });
    var dates = (doc.tickets || []).filter(function (t) {
      if (!t.date || t.voyage) return false;
      return !(doc.voyages || []).some(function (V) { return V.debut && V.fin && t.date >= V.debut && t.date <= V.fin; });
    }).map(function (t) { return t.date; }).sort();
    if (!dates.length) return null;
    return { debut: dates[0], fin: dates[dates.length - 1], n: dates.length };
  }

  return { CATEGORIES: CATEGORIES, categorie: categorie, couts: couts, occurrences: occurrences, annees: annees, proposition: proposition,
    ajouterMois: ajouterMois, jours: jours, plusJours: plusJours, dateAchat: dateAchat };
});
