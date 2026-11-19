/* Poké-Raichu · pilotage : simulateur SASU (TVA, compte de résultat, IS, salaire ou dividendes, ratios).
   Règles 2026, vérifiées le 19/11/2026 (sources dans A-LIRE-POUR-CLAUDE.md) et toutes modifiables par l'appelant :
   - TVA : franchise en base sous 85 000 € de CA (tolérance 93 500 €), mention « TVA non applicable, art. 293 B du CGI » ;
     au réel, régime de la marge (art. 297 A du CGI) pour les cartes achetées à des particuliers : TVA = marge × 20/120,
     opération par opération, sans déduire de TVA sur l'achat ; cartes importées ou achetées à un pro : TVA sur le prix
     total, TVA d'import (20 %) ou d'achat déductible. En franchise, la TVA d'import reste due et devient un coût.
   - IS : 15 % jusqu'à 42 500 € de bénéfice (CA < 10 M€, capital entièrement libéré et détenu à 75 % au moins par
     des personnes physiques), 25 % au-delà.
   - Dividendes : prélèvement forfaitaire unique de 31,4 % (12,8 % d'impôt + 18,6 % de prélèvements sociaux), ou barème
     de l'impôt après abattement de 40 % + 18,6 %. Réserve légale : 5 % du bénéfice jusqu'à 10 % du capital.
   - Président de SASU (assimilé salarié) : cotisations d'environ 80 % du salaire net (patronales + salariales).
   Ce n'est pas un conseil fiscal : un expert-comptable valide avant de décider. */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.PRFiscal = fabrique();
})(this, function () {
  'use strict';

  function z(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }
  function nb(v) { return typeof v === 'number' && isFinite(v) ? v : null; }

  var REGLES = {
    annee: 2026, verifie_le: '2026-11-19',
    franchise: 85000, franchise_majore: 93500, tva: 0.20,
    is_reduit: 0.15, is_plafond: 42500, is_normal: 0.25,
    pfu: 0.314, ps: 0.186, abattement_div: 0.40,
    charges_president: 0.80, abattement_salaire: 0.10,
    reserve: 0.05, reserve_plafond: 0.10
  };

  /* provenance d'une carte pour la TVA : importée (Japon), particulier (régime de la marge) ou professionnel */
  function provenance(c) {
    if (c.provenance === 'import' || c.provenance === 'particulier' || c.provenance === 'pro') return c.provenance;
    var m = (c.achat || {}).mode;
    return m === 'ticket' || m === 'yen' || m === 'lot' ? 'import' : 'particulier';
  }

  /* TVA qu'aurait eue ton activité réelle au régime réel, article par article */
  function tvaReelle(R) {
    var t = { collectee_marge: 0, collectee_normale: 0, marges_negatives: 0, deductible_achats: 0, ventes_marge: 0, ventes_normales: 0,
      achats_import: 0, achats_particulier: 0, achats_pro: 0, n: { import: 0, particulier: 0, pro: 0 } };
    R.cartes.forEach(function (r) {
      if (!r.compte || r.hors) return;
      var p = provenance(r.c), pa = z(r.cout);
      t.n[p]++;
      if (p === 'import') { t.achats_import += pa; t.deductible_achats += pa * REGLES.tva; }
      else if (p === 'pro') { t.achats_pro += pa; t.deductible_achats += pa * REGLES.tva / (1 + REGLES.tva); }
      else t.achats_particulier += pa;
      if (!r.vente) return;
      var pv = r.vente.encaisse;
      if (p === 'particulier') {
        var m = pv - pa;
        t.ventes_marge += pv;
        if (m > 0) t.collectee_marge += m * REGLES.tva / (1 + REGLES.tva); else t.marges_negatives += -m;
      } else { t.ventes_normales += pv; t.collectee_normale += pv * REGLES.tva / (1 + REGLES.tva); }
    });
    t.collectee = t.collectee_marge + t.collectee_normale;
    t.part_import = t.achats_import + t.achats_pro + t.achats_particulier ? (t.achats_import + t.achats_pro) / (t.achats_import + t.achats_pro + t.achats_particulier) : 0;
    return t;
  }

  /* hypothèses d'une année complète, d'après tes chiffres réels (X = PRCouts.couts(…) depuis le début) */
  function hypotheses(R, X, doc) {
    var c = X.cascade, duree = X.seuil.duree || 365, f = 365 / Math.max(30, duree);
    var P = doc.params || {};
    /* charges fixes annuelles hors voyages : récurrentes à leur rythme, ponctuelles au rythme de la période */
    var fixes = 0, tvaCh = 0;
    (doc.charges || []).forEach(function (ch) {
      if (ch.cible === 'voyage' || ch.cat === 'temps') return;
      var ttc = ch.devise === 'JPY' ? (R.params.taux ? z(ch.montant) / R.params.taux : 0) : z(ch.montant);
      var tva = ch.devise === 'JPY' ? 0 : z(ch.tva);
      var an = ch.recurrence === 'mois' ? 12 : ch.recurrence === 'an' ? 1 : f;
      if (ch.cible === 'carte' && !ch.recurrence) an = f;
      fixes += ttc * an; tvaCh += tva * an;
    });
    var vs = X.voyages.filter(function (v) { return v.frais > 0; });
    var fraisVoyage = vs.length ? vs.reduce(function (a, v) { return a + v.frais; }, 0) / vs.length : 0;
    var t = tvaReelle(R);
    var ca = c.ca * f;
    return {
      ca: Math.round(ca), taux_cout: c.ca ? c.cout_achat / c.ca : 0.5, frais_vente: c.ca ? c.frais_vente / c.ca : 0,
      part_import: Math.round(t.part_import * 100) / 100,
      voyages: vs.length ? Math.max(1, vs.length) : 2, frais_voyage: Math.round(fraisVoyage),
      charges_fixes: Math.round(fixes), tva_charges: Math.round(tvaCh),
      salaire_net: 0, distribution: 1, tmi: nb(P.tmi) != null ? P.tmi : 0.11,
      taux_charges: nb(P.charges_president) != null ? P.charges_president : REGLES.charges_president,
      capital: nb(P.capital_sasu) != null ? P.capital_sasu : 1000, cfe: 0, is_reduit: true,
      base_jours: duree, facteur: f
    };
  }

  function impotSocietes(b, H) {
    if (b <= 0) return 0;
    if (H.is_reduit === false) return b * REGLES.is_normal;
    return REGLES.is_reduit * Math.min(b, REGLES.is_plafond) + REGLES.is_normal * Math.max(0, b - REGLES.is_plafond);
  }

  /* une année de SASU, pour un régime de TVA donné */
  function simuler(H, regime) {
    var T = REGLES.tva, E = Math.max(0, z(H.ca)), A = E * z(H.taux_cout), p = Math.min(1, Math.max(0, z(H.part_import)));
    var Ei = E * p, Em = E - Ei, Ai = A * p, Am = A - Ai;
    var fraisVente = E * z(H.frais_vente), voyages = z(H.voyages) * z(H.frais_voyage), fixes = z(H.charges_fixes), tvaCh = Math.min(z(H.tva_charges), fixes);
    var tvaImport = Ai * T, tva = { regime: regime };
    var caHT, achats, externes;
    if (regime === 'reel') {
      tva.collectee_normale = Ei * T / (1 + T);
      tva.collectee_marge = Math.max(0, Em - Am) * T / (1 + T);
      tva.collectee = tva.collectee_normale + tva.collectee_marge;
      tva.deductible_import = tvaImport; tva.deductible_charges = tvaCh;
      tva.deductible = tvaImport + tvaCh;
      tva.a_payer = tva.collectee - tva.deductible;
      /* ce que la TVA te coûte vraiment : la TVA payée en amont est récupérée, il reste celle facturée aux clients */
      tva.cout = tva.collectee;
      caHT = E - tva.collectee; achats = A; externes = fraisVente + voyages + fixes - tvaCh;
    } else {
      tva.collectee = 0; tva.deductible = 0; tva.a_payer = 0; tva.import_non_recuperable = tvaImport; tva.charges_non_recuperable = tvaCh;
      tva.cout = tvaImport + tvaCh;
      caHT = E; achats = A + tvaImport; externes = fraisVente + voyages + fixes;
    }
    var salaire = Math.max(0, z(H.salaire_net)), personnel = salaire * (1 + z(H.taux_charges));
    var mc = caHT - achats, va = mc - externes, impots = z(H.cfe), ebe = va - impots - personnel;
    var rcai = ebe, is = impotSocietes(rcai, H), rn = rcai - is;
    var reserve = rn > 0 ? Math.min(rn * REGLES.reserve, z(H.capital) * REGLES.reserve_plafond) : 0;
    var distribuable = Math.max(0, rn - reserve), div = distribuable * Math.min(1, Math.max(0, H.distribution == null ? 1 : H.distribution));
    var pfu = div * REGLES.pfu, bareme = div * (1 - REGLES.abattement_div) * z(H.tmi) + div * REGLES.ps;
    var impotDiv = Math.min(pfu, bareme);
    var irSalaire = salaire * (1 - REGLES.abattement_salaire) * z(H.tmi);
    var poche = salaire - irSalaire + div - impotDiv;
    var avantRemu = ebe + personnel;
    return {
      regime: regime, tva: tva,
      sig: { ca: caHT, encaisse: E, achats: achats, marge_commerciale: mc, externes: externes, valeur_ajoutee: va, impots: impots,
        personnel: personnel, ebe: ebe, resultat_exploitation: ebe, rcai: rcai, is: is, resultat_net: rn, caf: rn },
      detail: { frais_vente: fraisVente, voyages: voyages, fixes: fixes, tva_charges: tvaCh, tva_import: tvaImport, ventes_import: Ei, ventes_marge: Em, achats_import: Ai, achats_marge: Am },
      remuneration: { salaire: salaire, cout_salaire: personnel, cotisations: personnel - salaire, ir_salaire: irSalaire,
        reserve: reserve, distribuable: distribuable, dividendes: div, pfu: pfu, bareme: bareme, impot_dividendes: impotDiv,
        option: bareme < pfu ? 'barème' : 'PFU', en_reserve: rn - div, poche: poche,
        avant_remuneration: avantRemu, prelevements: avantRemu > 0 ? 1 - poche / avantRemu : null },
      franchise_possible: caHT <= REGLES.franchise, franchise_tolerance: caHT <= REGLES.franchise_majore
    };
  }

  /* salaire qui laisse le plus d'argent dans ta poche (le reste du bénéfice étant distribué) */
  function optimiser(H, regime) {
    var base = simuler(Object.assign({}, H, { salaire_net: 0 }), regime);
    var max = Math.max(0, base.sig.ebe / (1 + z(H.taux_charges)));
    var pas = [], meilleur = null;
    for (var i = 0; i <= 40; i++) {
      var s = max * i / 40, x = simuler(Object.assign({}, H, { salaire_net: s }), regime);
      var pt = { salaire: s, poche: x.remuneration.poche, cotisations: x.remuneration.cotisations };
      pas.push(pt);
      if (!meilleur || pt.poche > meilleur.poche + 0.005) meilleur = pt;
    }
    return { pas: pas, meilleur: meilleur, max: max };
  }

  /* ratios de gestion sur l'activité réelle (X = PRCouts depuis le début) */
  function ratios(R, X) {
    var c = X.cascade, d = X.seuil.duree || null, an = d ? 365 / d : null;
    var stockCout = R.stock ? z(R.stock.cout_reel) + z(R.stock.cout_estime) : 0;
    var camv = c.cout_achat;
    var investi = z(R.k.investi);
    return {
      taux_marge: camv ? c.marge_commerciale / camv : null,
      taux_marque: c.ca ? c.marge_commerciale / c.ca : null,
      coefficient: camv ? c.ca / camv : null,
      rotation: stockCout && an ? camv * an / stockCout : null,
      duree_stockage: camv && d ? stockCout / camv * d : null,
      bfr: stockCout, bfr_jours: c.ca && d ? stockCout / c.ca * d : null,
      poids_fixes: c.ca ? X.seuil.cf / c.ca : null,
      rentabilite_commerciale: c.ca ? c.resultat / c.ca : null,
      roi: investi ? c.resultat / investi : null,
      duree: d
    };
  }

  return { REGLES: REGLES, provenance: provenance, tvaReelle: tvaReelle, hypotheses: hypotheses, simuler: simuler, optimiser: optimiser,
    ratios: ratios, impotSocietes: impotSocietes };
});
