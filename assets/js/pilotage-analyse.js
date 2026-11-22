/* Poké-Raichu · pilotage : analyse financière des ventes et du stock (onglet « Analyse »).
   Découpe le portefeuille par bloc, extension, rareté, gradation, type, langue, gamme de prix, groupe ou canal, et mesure
   pour chaque segment : capital investi, écoulement, rentabilité réalisée, rentabilité attendue du stock, délai de vente.
   Méthode (à lire avant de modifier) :
   - coût d'une carte = payé réel, ou payé estimé si le prix d'achat manque (part estimée affichée) ;
   - rentabilité réalisée = bénéfice net des ventes (après frais d'envoi et de vente) ÷ coût des articles vendus ;
   - rentabilité attendue du stock = (prix marché × taux de réalisation × (1 − frais de vente) − coût × (1 + TVA import)
     − frais d'envoi) ÷ coût, le taux de réalisation (prix de vente obtenu ÷ prix marché) venant des ventes passées
     du segment s'il y en a au moins 3, sinon de tout le portefeuille ;
   - rentabilité retenue = moyenne pondérée par la crédibilité : (n ventes × réalisée + 5 × attendue) ÷ (n ventes + 5) ;
   - écoulement = coût des articles vendus ÷ coût total investi dans le segment (en valeur, pas en nombre) ;
   - recommandation : comparaison de la rentabilité retenue et de l'écoulement aux moyennes du portefeuille ;
     « À tester » sous 3 ventes et 5 articles ou 20 € investis, « Coût à compléter » si plus de la moitié du coût est estimé
     (on ne décide pas sur des coûts supposés), jamais de recommandation pour « Non renseigné », « Sans prix »… ;
   - répartition d'un budget : poids = rentabilité retenue × écoulement (5 % minimum), 40 % maximum par segment,
     10 % réservés aux 2 meilleurs segments à tester (2 articles au moins). Indicatif : l'historique de ventes est court. */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.PRAnalyse = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function nb(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function z(v) { return nb(v) || 0; }
  var K_CREDIBILITE = 5, PLAFOND = 0.4, PART_TEST = 0.1, MIN_ECOUL = 0.05;
  /* segments qui ne désignent rien d'achetable : jamais recommandés */
  var INCONNU = /^(Non renseigné|Sans prix|Autre$|Autre ou non|Sans groupe)/;

  /* ---------------------------------------------------------------- classements */
  function codeSet(c) { var m = /^([A-Za-z0-9]+(?:-[A-Za-z0-9]+)?)\s*·/.exec(c.set || ''); return m ? m[1] : ''; }
  var BLOCS = [
    [/^(M\d|M-P|MF|MEE|MBD|MBG|MC|MP\d|ME\d|30C)/, 'Méga Évolution (2025-2026)'],
    [/^(SV|DRI|CLL|SVM)/i, 'Écarlate et Violet (2023-2025)'],
    [/^(s\d|S\d|SPZ|S-P)/, 'Épée et Bouclier (2019-2023)'],
    [/^(sm|SM)/, 'Soleil et Lune (2016-2019)'],
    [/^(XY|CP)/, 'XY (2013-2016)'],
    [/^(BW|DP|Pt|L\d|HGSS)/, 'Noir et Blanc · DP (2006-2013)'],
    [/^PCG/, 'ex · PCG (2003-2006)'],
    [/^(e\d|VS|neo\d|Gym|PMCG\d)/i, 'Vintage (1996-2002)']
  ];
  function bloc(c) {
    if (c.bloc) return c.bloc;
    var code = codeSet(c);
    for (var i = 0; i < BLOCS.length; i++) if (BLOCS[i][0].test(code)) return BLOCS[i][1];
    return 'Autre ou non renseigné';
  }
  function extension(c) { var s = String(c.set || '').replace(/\s*\((version|VF)[^)]*\)\s*$/i, ''); return s || 'Non renseignée'; }
  function rarete(c) {
    var r = String(c.rarete || '').trim(), u = r.toUpperCase();
    if (!r) return 'Non renseignée';
    if (/PIKACHU 30TH/i.test(r)) return 'Pikachu 30th';
    if (/復刻|REPRINT/i.test(r)) return 'Reprint 30th';
    if (/PROMO|^P\b|GOLDEN BOX/i.test(r)) return 'Promo';
    if (/\bSAR\b|SPÉCIALE RARE/i.test(r)) return 'SAR';
    if (/\bCSR\b/.test(u)) return 'CSR';
    if (/\bCHR\b/.test(u)) return 'CHR';
    if (/\bAR\b|ILLUSTRATION RARE/i.test(r)) return 'AR';
    if (/\b(UR|HR|FUR|SSR|BWR)\b|GOLD|ULTRA RARE \(UR/i.test(u)) return 'UR · HR · gold';
    if (/\bSR\b|ULTRA RARE/i.test(r)) return 'SR';
    if (/\b(RRR|RR|R|S|K)\b|HOLO|^RARE/i.test(r)) return 'Rare · holo';
    if (/^(C|U)$|COMMUNE/i.test(r)) return 'Commune · peu commune';
    if (/FULL ART/i.test(r)) return 'Full art (sans rareté)';
    return 'Autre';
  }
  function gradation(c) {
    var e = String(c.etat || '') + ' ' + String(c.cat || '');
    if (/PSA\s*10/i.test(e)) return 'PSA 10';
    if (/PSA|PCA|BGS|CGC|CCC/i.test(e)) return 'Autre gradée (PCA, PSA 9…)';
    if (/ABÎM|ABIM|キズ|PLAY|JOUÉE|DÉFAUT|※/i.test(e)) return 'Brute abîmée ou jouée';
    return 'Brute';
  }
  var GAMMES = [[10, 'Moins de 10 €'], [25, '10 à 25 €'], [50, '25 à 50 €'], [100, '50 à 100 €'], [250, '100 à 250 €'], [Infinity, '250 € et plus']];
  function gamme(c) {
    var p = nb(c.prix);
    if (p == null) return 'Sans prix marché';
    for (var i = 0; i < GAMMES.length; i++) if (p < GAMMES[i][0]) return GAMMES[i][1];
    return GAMMES[GAMMES.length - 1][1];
  }
  var DIMENSIONS = [
    { id: 'bloc', nom: 'Bloc', f: bloc },
    { id: 'extension', nom: 'Extension', f: extension },
    { id: 'rarete', nom: 'Rareté', f: rarete },
    { id: 'gradation', nom: 'PSA ou brute', f: gradation },
    { id: 'type', nom: 'Type de produit', f: null },
    { id: 'langue', nom: 'Langue', f: function (c) { return c.langue || 'Non renseignée'; } },
    { id: 'gamme', nom: 'Gamme de prix', f: gamme },
    { id: 'groupe', nom: 'Groupe', f: function (c) { return c.groupe || 'Sans groupe'; } },
    { id: 'canal', nom: 'Canal de vente', f: function (c) { return c.vendu ? (c.canal || 'Non renseigné') : null; } }
  ];
  function dimension(id) { return DIMENSIONS.filter(function (d) { return d.id === id; })[0] || DIMENSIONS[0]; }

  function jours(a, b) {
    var x = Date.parse(a), y = Date.parse(b);
    return isFinite(x) && isFinite(y) ? Math.round((y - x) / 86400000) : null;
  }

  /* ---------------------------------------------------------------- éléments mesurés (une carte ou un produit) */
  /* date d'achat : celle de la carte, sinon celle de son ticket japonais */
  function dateAchat(r, R) {
    var c = r.c, a = c.achat || {}, id = (a.mode === 'ticket' && a.ticket) || c.ticket, t = id && R.ticketsParId ? R.ticketsParId[id] : null;
    return c.date_achat || (t && t.t && t.t.date) || null;
  }
  function elementCarte(r, P, aujourdhui, R) {
    var c = r.c, vendu = !!c.vendu, cout = z(r.cout), prix = nb(c.prix), da = dateAchat(r, R);
    var e = { n: 1, nv: vendu ? 1 : 0, cout: cout, estime: r.source === 'estimé' ? cout : 0, inconnu: r.cout == null,
      cout_vendu: vendu ? cout : 0, ca: vendu ? z(r.encaisse) : 0, benef: vendu && r.vente ? r.vente.net : 0,
      cout_stock: vendu ? 0 : cout, valeur_stock: !vendu && prix != null ? prix : 0, cout_stock_val: !vendu && prix != null ? cout : 0,
      n_stock_val: !vendu && prix != null ? 1 : 0, latent: !vendu ? z(r.latent) : 0,
      marche_vendu: vendu && prix != null ? prix : 0, enc_vendu_prix: vendu && prix != null ? z(r.encaisse) : 0, nv_prix: vendu && prix != null ? 1 : 0,
      delais: [], ages: [], n_delais_est: 0 };
    /* délai et âge : règle des dates de vente du moteur (r.delai_vente, r.mise_en_vente), sinon achat → vente */
    if (vendu) {
      var dj = r.delai_vente !== undefined ? r.delai_vente : (da && c.vente_date ? jours(da, c.vente_date) : null);
      if (dj != null && dj >= 0) { e.delais.push(dj); if (r.delai_estime) e.n_delais_est = 1; }
    } else {
      var mv = r.mise_en_vente !== undefined ? r.mise_en_vente : da;
      if (mv) { var ag = jours(mv, aujourdhui); if (ag != null && ag >= 0) e.ages.push(ag); }
    }
    return e;
  }
  function elementProduit(x, P) {
    var v = x.vente, estimeTout = x.connu ? 0 : x.nb * z(x.prix_u) * (1 - P.fv) / ((1 + P.tva) + P.rent);
    var coutTotal = x.connu ? z(x.paye) : estimeTout;
    return { n: x.nb, nv: v.vendus, cout: coutTotal, estime: x.connu ? 0 : coutTotal, inconnu: false,
      cout_vendu: v.cout, ca: v.encaisse, benef: v.net, cout_stock: x.stock_reel + x.stock_estime, valeur_stock: x.stock_valeur,
      cout_stock_val: x.stock_reel + x.stock_estime, n_stock_val: x.reste, latent: x.latent,
      marche_vendu: v.vendus * z(x.prix_u), enc_vendu_prix: v.encaisse, nv_prix: v.vendus, delais: [], ages: [], produit: true };
  }
  function typeCarte(r) { return gradation(r.c) === 'PSA 10' || /gradée/.test(gradation(r.c)) ? 'Cartes gradées' : 'Cartes brutes'; }

  /* ---------------------------------------------------------------- segments */
  function vide() {
    return { n: 0, nv: 0, cout: 0, estime: 0, inconnus: 0, cout_vendu: 0, ca: 0, benef: 0, cout_stock: 0, valeur_stock: 0, cout_stock_val: 0,
      n_stock_val: 0, latent: 0, marche_vendu: 0, enc_vendu_prix: 0, nv_prix: 0, delais: [], ages: [], n_delais_est: 0, produit: false };
  }
  function ajouter(s, e) {
    ['n', 'nv', 'cout', 'estime', 'cout_vendu', 'ca', 'benef', 'cout_stock', 'valeur_stock', 'cout_stock_val', 'n_stock_val', 'latent', 'marche_vendu', 'enc_vendu_prix', 'nv_prix']
      .forEach(function (k) { s[k] += e[k]; });
    if (e.inconnu) s.inconnus++;
    s.delais = s.delais.concat(e.delais); s.ages = s.ages.concat(e.ages); s.n_delais_est += e.n_delais_est || 0;
    if (e.produit) s.produit = true;
  }
  function moyenne(l) { return l.length ? l.reduce(function (a, b) { return a + b; }, 0) / l.length : null; }
  function mediane(l) { if (!l.length) return null; var t = l.slice().sort(function (a, b) { return a - b; }), m = t.length >> 1; return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2; }

  function segments(R, dimId, aujourdhui) {
    var P = R.params, dim = dimension(dimId), groupes = {}, ordre = [], tot = vide();
    aujourdhui = aujourdhui || new Date().toISOString().slice(0, 10);
    function dans(cle, e) {
      if (cle == null) return;
      if (!groupes[cle]) { groupes[cle] = vide(); groupes[cle].cle = cle; ordre.push(cle); }
      ajouter(groupes[cle], e);
    }
    R.cartes.forEach(function (r) {
      if (r.hors || !r.compte) return;
      var e = elementCarte(r, P, aujourdhui, R);
      ajouter(tot, e);
      dans(dim.id === 'type' ? typeCarte(r) : dim.f(r.c), e);
    });
    if (dim.id === 'type') R.produits.forEach(function (x) {
      var e = elementProduit(x, P);
      ajouter(tot, e);
      dans(x.p.libelle || x.p.nom, e);
    });
    /* taux de réalisation du prix marché du portefeuille */
    var realPf = tot.marche_vendu ? tot.enc_vendu_prix / tot.marche_vendu : 1;
    function mesurer(s) {
      s.ecoul_n = s.n ? s.nv / s.n : null;
      s.ecoul = s.cout ? s.cout_vendu / s.cout : (s.n ? s.nv / s.n : null);
      s.rentab_real = s.cout_vendu ? s.benef / s.cout_vendu : null;
      s.realisation = s.marche_vendu ? s.enc_vendu_prix / s.marche_vendu : null;
      var d = s.nv_prix >= 3 && s.realisation != null ? s.realisation : realPf;
      s.realisation_retenue = d;
      /* stock valorisé vendu au taux de réalisation retenu, frais d'envoi déduits */
      var attendu = s.produit ? s.latent : (s.valeur_stock * d * (1 - P.fv) - s.cout_stock_val * (1 + P.tva) - s.n_stock_val * P.envoi);
      s.benef_attendu = s.cout_stock_val ? attendu : null;
      s.rentab_att = s.cout_stock_val ? attendu / s.cout_stock_val : null;
      if (s.rentab_real != null && s.rentab_att != null) s.rentab = (s.nv * s.rentab_real + K_CREDIBILITE * s.rentab_att) / (s.nv + K_CREDIBILITE);
      else s.rentab = s.rentab_real != null ? s.rentab_real : s.rentab_att;
      s.rendement = s.cout ? (s.benef + s.latent) / s.cout : null;
      s.part_estimee = s.cout ? s.estime / s.cout : null;
      s.delai_moyen = moyenne(s.delais); s.delai_median = mediane(s.delais); s.n_delais = s.delais.length;
      s.age_moyen = moyenne(s.ages);
      s.cout_moyen = s.n ? s.cout / s.n : null;
      s.fiabilite = (s.nv < 3 && s.n < 5) ? 'faible' : s.nv < 5 ? 'moyenne' : 'bonne';
      return s;
    }
    var lignes = ordre.map(function (k) { return mesurer(groupes[k]); });
    mesurer(tot);
    var stockTotal = lignes.reduce(function (a, s) { return a + s.cout_stock; }, 0);
    lignes.forEach(function (s) { s.part_capital = stockTotal ? s.cout_stock / stockTotal : null; s.part_investi = tot.cout ? s.cout / tot.cout : null; });
    /* moyennes du portefeuille (pondérées par le capital) et recommandations */
    var pond = lignes.filter(function (s) { return s.rentab != null && s.cout > 0; });
    var Rbar = pond.length ? pond.reduce(function (a, s) { return a + s.rentab * s.cout; }, 0) / pond.reduce(function (a, s) { return a + s.cout; }, 0) : null;
    var Ebar = tot.ecoul;
    lignes.forEach(function (s) {
      if (s.rentab == null) s.reco = 'Sans données';
      else if (INCONNU.test(s.cle)) s.reco = 'Données à compléter';
      else if (s.part_estimee > 0.5) s.reco = 'Coût à compléter';
      else if ((s.nv < 3 && s.n < 5) || s.cout < 20) s.reco = 'À tester';
      else if (s.rentab >= Rbar && s.ecoul >= Ebar) s.reco = 'Renforcer';
      else if (s.rentab >= Rbar) s.reco = 'Sélectif';
      else if (s.ecoul >= Ebar) s.reco = 'Rotation';
      else s.reco = 'Alléger';
    });
    lignes.sort(function (a, b) { return b.cout - a.cout; });
    return { dim: dim, lignes: lignes, total: tot, rentab_moy: Rbar, ecoul_moy: Ebar, realisation: realPf };
  }

  /* ---------------------------------------------------------------- répartition d'un budget d'achat */
  function repartition(A, budget) {
    var candidats = A.lignes.filter(function (s) { return /Renforcer|Sélectif|Rotation/.test(s.reco) && s.rentab > 0; });
    var tests = A.lignes.filter(function (s) { return s.reco === 'À tester' && s.rentab > 0 && s.n >= 2; }).sort(function (a, b) { return b.rentab - a.rentab; }).slice(0, 2);
    var partTest = tests.length ? PART_TEST : 0, principal = budget * (1 - partTest);
    var w = candidats.map(function (s) { return s.rentab * Math.max(s.ecoul || 0, MIN_ECOUL); });
    var alloc = candidats.map(function () { return 0; });
    /* plafond par segment, l'excédent est redistribué aux autres */
    var restant = principal, libres = candidats.map(function (_, i) { return i; });
    for (var tour = 0; tour < 10 && libres.length && restant > 0.005; tour++) {
      var sw = libres.reduce(function (a, i) { return a + w[i]; }, 0);
      if (!sw) break;
      var depasse = [], donne = 0;
      libres.forEach(function (i) {
        var part = restant * w[i] / sw, max = budget * PLAFOND - alloc[i];
        if (part >= max) { alloc[i] += max; donne += max; depasse.push(i); } else { alloc[i] += part; donne += part; }
      });
      restant -= donne;
      libres = libres.filter(function (i) { return depasse.indexOf(i) === -1; });
      if (!depasse.length) break;
    }
    var lignes = candidats.map(function (s, i) { return { s: s, montant: alloc[i], role: s.reco }; });
    tests.forEach(function (s) { lignes.push({ s: s, montant: budget * partTest / tests.length, role: 'À tester' }); });
    lignes = lignes.filter(function (l) { return l.montant > 0.5; }).sort(function (a, b) { return b.montant - a.montant; });
    lignes.forEach(function (l) { l.benef = l.montant * l.s.rentab; l.cartes = l.s.cout_moyen ? l.montant / l.s.cout_moyen : null; });
    var place = lignes.reduce(function (a, l) { return a + l.montant; }, 0);
    return { lignes: lignes, place: place, non_place: budget - place, benef: lignes.reduce(function (a, l) { return a + l.benef; }, 0) };
  }

  /* ---------------------------------------------------------------- grader une carte brute ou acheter gradée ? */
  /* frais de vente (fv, part du prix) et frais d'envoi déduits des deux côtés : on compare des encaissements nets */
  function simulerGradation(x) {
    var achat = z(x.achat), cout = z(x.frais), p10 = z(x.p10) / 100, p9 = z(x.p9) / 100, fv = z(x.fv), envoi = z(x.envoi);
    var vBrute = z(x.prix_brute), v10 = z(x.prix_psa10), v9 = nb(x.prix_psa9) != null ? x.prix_psa9 : vBrute;
    if (p10 + p9 > 1) p9 = Math.max(0, 1 - p10);
    var reste = Math.max(0, 1 - p10 - p9);
    function net(v) { return v * (1 - fv) - envoi; }
    var esperance = p10 * v10 + p9 * v9 + reste * vBrute;
    var gainGrader = p10 * net(v10) + p9 * net(v9) + reste * net(vBrute) - achat - cout, gainBrute = net(vBrute) - achat;
    var delai = z(x.delai_mois);
    var p10Equilibre = v10 > vBrute && fv < 1 ? (cout / (1 - fv) - p9 * (v9 - vBrute)) / (v10 - vBrute) : null;
    return {
      esperance: esperance, gain_grader: gainGrader, gain_brute: gainBrute, surplus: gainGrader - gainBrute,
      rentab_grader: achat + cout ? gainGrader / (achat + cout) : null,
      rentab_annuelle: achat + cout && delai ? Math.pow(Math.max(0, 1 + gainGrader / (achat + cout)), 12 / delai) - 1 : null,
      p10_equilibre: p10Equilibre != null ? Math.max(0, Math.min(1, p10Equilibre)) : null,
      conseil: gainGrader - gainBrute > 0 ? 'grader' : 'brute'
    };
  }

  return { DIMENSIONS: DIMENSIONS, dimension: dimension, bloc: bloc, extension: extension, rarete: rarete, gradation: gradation, gamme: gamme,
    segments: segments, repartition: repartition, simulerGradation: simulerGradation, K_CREDIBILITE: K_CREDIBILITE };
});
