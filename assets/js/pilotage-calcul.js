/* Poké-Raichu · pilotage : moteur de calcul.
   Mêmes règles que l'Excel POKE-RAICHU (vérifiées cellule par cellule à l'import du 19/11/2026) :
   - payé d'une carte : ticket (¥ × payé du ticket ÷ total du ticket ÷ taux), ¥ sans ticket (¥ ÷ taux),
     lot (payé du lot réparti au prorata du prix marché), ou montant en € ;
   - payé estimé (cartes sans prix d'achat) : prix ÷ ((1 + TVA import) + rentabilité retenue), après frais de vente ;
   - marge nette = prix marché × (1 − frais de vente) − payé × (1 + TVA import) ;
   - ventes : encaissé − frais de vente − coût (réel + estimé) − frais d'envoi.
   Dates de vente (règle d'Arthur, 22/11/2026) : les ventes actives commencent le 22/11/2026 (params.debut_ventes).
   - carte encore à vendre : son chrono de vente part du début des ventes (ou de son achat, s'il est plus tard) ;
   - carte vendue sans date : vendue une semaine après l'achat (params.delai_vente_passee, 7 j), au plus tard au
     début des ventes ; sans date d'achat, la fin du voyage rattaché sert d'achat ; sans rien, délai d'une semaine
     compté dans les délais mais la vente reste « sans date » dans le temps ;
   - une vraie date saisie l'emporte toujours (c.vente_date n'est jamais modifié : r.date_vente est la date retenue).
   Frais de vente par canal (22/11/2026) : params.frais_canal = { canal: part du prix } remplace frais_vente pour les
   cartes vendues sur ce canal (Vinted : 0 par défaut, l'acheteur paie la protection) ; null = taux général. Le stock et
   le scellé gardent le taux général (canal inconnu). Seul écart voulu avec les règles de l'Excel.
   Aucune donnée ici : le document vient de /api/pilotage. Utilisable aussi dans Node (tests). */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.PRCalcul = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function nb(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function z(v) { return nb(v) || 0; }
  function somme(liste, f) { var s = 0; for (var i = 0; i < liste.length; i++) s += z(f(liste[i])); return s; }
  var DEBUT_VENTES = '2026-11-22', DELAI_VENTE_PASSEE = 7, FRAIS_CANAL_DEFAUT = { 'Vinted': 0 };
  function dateOk(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; }
  function jour(v) { return Math.floor(Date.parse(v + 'T00:00:00Z') / 864e5); }
  function iso(j) { return new Date(j * 864e5).toISOString().slice(0, 10); }

  function calcul(doc) {
    var P = doc.params || {};
    var taux = nb(P.taux_jpy) || 0, fv = z(P.frais_vente), tva = z(P.tva_import), rent = z(P.rentabilite_estimee),
      envoi = z(P.frais_envoi), gardees = P.gardees_dans_totaux !== false;
    var debutV = dateOk(P.debut_ventes) || DEBUT_VENTES, jDebut = jour(debutV),
      delaiV = nb(P.delai_vente_passee) != null && P.delai_vente_passee >= 0 ? Math.round(P.delai_vente_passee) : DELAI_VENTE_PASSEE;
    var finVoyage = {};
    (doc.voyages || []).forEach(function (V) { if (V && V.id) finVoyage[V.id] = dateOk(V.fin) || dateOk(V.debut); });
    var fraisCanal = {};
    Object.keys(FRAIS_CANAL_DEFAUT).forEach(function (k) { fraisCanal[k] = FRAIS_CANAL_DEFAUT[k]; });
    if (P.frais_canal && typeof P.frais_canal === 'object') Object.keys(P.frais_canal).forEach(function (k) {
      var v = P.frais_canal[k];
      if (v === null) delete fraisCanal[k]; else if (nb(v) != null && v >= 0 && v < 1) fraisCanal[k] = v;
    });
    function fvDe(canal) { return canal && Object.prototype.hasOwnProperty.call(fraisCanal, canal) ? fraisCanal[canal] : fv; }
    function estime(base, f) { var t = f == null ? fv : f; return base == null ? null : base * (1 - t) / ((1 + tva) + rent); }

    /* groupes : ceux du document, puis ceux qu'une carte utiliserait sans qu'ils soient déclarés */
    var groupes = [], gid = {};
    (doc.groupes || []).forEach(function (g) { gid[g.id] = g; groupes.push(g); });
    (doc.cartes || []).forEach(function (c) {
      if (c.groupe && !gid[c.groupe]) { gid[c.groupe] = { id: c.groupe, nom: c.groupe, ordre: 50 + groupes.length }; groupes.push(gid[c.groupe]); }
    });

    /* tickets */
    var tickets = {}, listeTickets = [];
    (doc.tickets || []).forEach(function (t) {
      var tot = z(t.total_yen);
      var det = t.detaxe_auto ? Math.floor(tot * 10 / 110) : z(t.detaxe_yen);
      var x = { id: t.id, t: t, detaxe: det, paye_yen: tot - det, paye_eur: taux ? (tot - det) / taux : null,
        ratio: tot ? (tot - det) / tot : null, nb: 0, somme_yen: 0, cartes: [] };
      tickets[t.id] = x; listeTickets.push(x);
    });
    /* lots (achats groupés) */
    var lots = {}, listeLots = [];
    (doc.lots || []).forEach(function (l) {
      var x = { id: l.id, l: l, paye_eur: nb(l.paye_yen) != null && taux ? l.paye_yen / taux : null, prix_total: null, cartes: [] };
      lots[l.id] = x; listeLots.push(x);
    });
    (doc.cartes || []).forEach(function (c) {
      var a = c.achat || {};
      if (a.mode === 'lot' && lots[a.lot]) {
        var L = lots[a.lot]; L.cartes.push(c);
        if (nb(c.prix) != null) L.prix_total = (L.prix_total || 0) + c.prix;
      }
      if (c.ticket && tickets[c.ticket]) { var T = tickets[c.ticket]; T.nb++; T.somme_yen += z(c.yen); T.cartes.push(c); }
    });
    listeTickets.forEach(function (x) { x.ecart_yen = x.somme_yen - z(x.t.total_yen); x.ok = x.ecart_yen === 0; });

    /* cartes */
    var parRef = {};
    var cartes = (doc.cartes || []).map(function (c, i) {
      var a = c.achat || {}, paye = null;
      if (a.mode === 'ticket') { var T = tickets[a.ticket]; paye = T && T.ratio != null && taux ? z(c.yen) * T.ratio / taux : null; }
      else if (a.mode === 'yen') paye = taux ? z(c.yen) / taux : null;
      else if (a.mode === 'lot') {
        var L = lots[a.lot];
        paye = (nb(c.prix) == null || !L || !L.prix_total || L.paye_eur == null) ? null : L.paye_eur * c.prix / L.prix_total;
      } else if (a.mode === 'eur') paye = nb(a.eur);
      var prix = nb(c.prix);
      var enc = c.vendu ? (nb(c.prix_vendu) != null ? c.prix_vendu : prix) : null;
      var fvC = c.vendu ? fvDe(c.canal) : fv;
      var est = paye == null ? estime(c.vendu ? enc : prix, fvC) : null;
      var marge = prix != null && paye != null ? prix * (1 - fv) - paye * (1 + tva) : null;
      var g = gid[c.groupe];
      var hors = !!(g && g.hors_totaux);
      var compte = gardees || !c.gardee;
      /* dates : achat réel, repère (achat ou fin du voyage), vente retenue, début du chrono de vente, délai */
      var idT = (a.mode === 'ticket' && a.ticket) || c.ticket, TT = idT ? tickets[idT] : null;
      var achat = dateOk(c.date_achat) || (TT && dateOk(TT.t.date)) || null;
      var ancre = achat || finVoyage[c.voyage] || (a.mode === 'lot' && lots[a.lot] && finVoyage[lots[a.lot].l.voyage]) || (TT && finVoyage[TT.t.voyage]) || null;
      var dv = null, dvEst = false, mev = null, delai = null, delaiEst = false;
      if (c.vendu) {
        var reelle = dateOk(c.vente_date);
        if (reelle) {
          dv = reelle;
          mev = dv >= debutV ? (achat && achat > debutV ? achat : debutV) : ancre;
          if (mev) { delai = Math.max(0, jour(dv) - jour(mev)); delaiEst = dv < debutV && !achat; }
          else { delai = delaiV; delaiEst = true; }
        } else if (ancre) {
          var j0 = jour(ancre), j1 = j0 + delaiV;
          if (j0 <= jDebut && j1 > jDebut) j1 = jDebut;
          dv = iso(j1); dvEst = true; mev = ancre; delai = j1 - j0; delaiEst = true;
        } else { delai = delaiV; delaiEst = true; }
      } else mev = achat && achat > debutV ? achat : debutV;
      var r = {
        c: c, i: i, ref: c.ref, paye: paye, estime: est, cout: paye != null ? paye : est, source: paye != null ? 'réel' : (est != null ? 'estimé' : null),
        marge: marge, gain: marge != null && paye ? marge / paye : null,
        encaisse: enc, benef: c.vendu ? z(enc) * (1 - fvC) - (z(paye) + z(est)) * (1 + tva) : null, fv: fvC,
        compte: compte, hors: hors, stock: !c.vendu && !hors && compte,
        date_achat: achat, date_vente: dv, vente_estimee: dvEst, mise_en_vente: mev, delai_vente: delai, delai_estime: delaiEst
      };
      if (c.vendu && !hors) {
        var frais = z(enc) * fvC, cout = (z(paye) + z(est)) * (1 + tva);
        r.vente = { encaisse: z(enc), frais: frais, cout: cout, envoi: envoi, net: z(enc) - frais - cout - envoi, hors_taux: !!c.hors_taux };
        r.vente.rentab = cout && !c.hors_taux ? r.vente.net / cout : null;   /* « hors_taux » : reste dans le bénéfice et le CA, sort des taux */
      }
      r.latent = r.stock && prix != null ? prix * (1 - fv) - z(r.cout) * (1 + tva) : null;
      parRef[c.ref] = r;
      return r;
    });

    /* produits vendus en quantité (card sets, ex, boosters) */
    var produits = (doc.produits || []).map(function (p) {
      var q = z(p.quantite), prixU, paye, pu, valeur;
      if (p.composants) {
        var cs = cartes.filter(function (r) { return r.c.groupe === p.composants; });
        var px = cs.filter(function (r) { return nb(r.c.prix) != null; });
        valeur = px.length ? somme(px, function (r) { return r.c.prix; }) : null;
        paye = somme(cs, function (r) { return r.paye; });
        prixU = valeur; pu = paye;
      } else {
        prixU = nb(p.prix_u); valeur = q * z(prixU);
        if (nb(p.paye_total) != null) { paye = p.paye_total; pu = q ? paye / q : null; } else { pu = nb(p.paye_u); paye = q * z(pu); }
      }
      var fixe = nb(p.frais_u) != null;
      var connu = p.composants ? true : (nb(p.paye_u) != null || nb(p.paye_total) != null);
      var marge;
      if (fixe) marge = q * (z(prixU) - p.frais_u) - paye;
      else if (p.composants) marge = valeur != null ? valeur * (1 - fv) - paye * (1 + tva) : null;
      else marge = connu ? valeur * (1 - fv) - paye * (1 + tva) : null;
      /* ventes au nombre */
      var n = z(p.vendus);
      var enc = n * (nb(p.prix_reel_moyen) != null ? p.prix_reel_moyen : z(prixU));
      var frais = fixe ? n * p.frais_u : enc * fv;
      var coutV = n * z(pu) * (fixe ? 1 : (1 + tva));
      var env = (nb(p.envois) != null ? p.envois : n) * envoi;
      /* stock restant */
      var reste = Math.max(0, q - n);
      var stockValeur = reste * z(prixU);
      var stockReel = connu ? reste * z(pu) : 0;
      var stockEst = connu ? 0 : reste * z(estime(z(prixU)));
      var latent = fixe ? reste * (z(prixU) - p.frais_u - z(pu)) : reste * z(prixU) * (1 - fv) - (stockReel + stockEst) * (1 + tva);
      return {
        p: p, id: p.id, nb: q, paye: paye, valeur: valeur, marge: marge, gain: marge != null && paye ? marge / paye : null,
        prix_u: prixU, paye_unitaire: pu, connu: connu,
        vente: { vendus: n, stock: q - n, encaisse: enc, frais: frais, cout: coutV, envoi: env, net: enc - frais - coutV - env },
        reste: reste, stock_valeur: stockValeur, stock_valeur_nette: fixe ? reste * (z(prixU) - p.frais_u) : stockValeur * (1 - fv),
        stock_reel: stockReel, stock_estime: stockEst, latent: latent
      };
    });

    /* synthèse par groupe (comme l'onglet Synthèse) */
    var lignes = [];
    groupes.forEach(function (g) {
      if (g.hors_totaux) return;
      var rs = cartes.filter(function (r) { return r.c.groupe === g.id && r.compte; });
      var den = somme(rs.filter(function (r) { return nb(r.c.prix) != null; }), function (r) { return r.paye; });
      var m = somme(rs, function (r) { return r.marge; });
      lignes.push({ cle: g.id, libelle: g.nom || g.id, ordre: nb(g.ordre) != null ? g.ordre : 50, type: 'groupe',
        nb: rs.length, paye: somme(rs, function (r) { return r.paye; }), valeur: somme(rs, function (r) { return r.c.prix; }),
        marge: m, gain: den ? m / den : null });
    });
    produits.forEach(function (x) {
      lignes.push({ cle: x.id, libelle: x.p.libelle || x.p.nom, ordre: nb(x.p.ordre) != null ? x.p.ordre : 60, type: 'produit',
        nb: x.nb, paye: x.paye, valeur: x.valeur, marge: x.marge, gain: x.gain });
    });
    lignes.sort(function (a, b) { return a.ordre - b.ordre; });
    var synthTotal = { cle: 'TOTAL', libelle: 'Total', nb: somme(lignes, function (l) { return l.nb; }), paye: somme(lignes, function (l) { return l.paye; }),
      valeur: somme(lignes, function (l) { return l.valeur; }), marge: somme(lignes, function (l) { return l.marge; }) };
    synthTotal.gain = synthTotal.paye ? synthTotal.marge / synthTotal.paye : null;

    /* par catégorie, dans chaque groupe */
    var categories = [];
    groupes.forEach(function (g) {
      if (g.hors_totaux) return;
      var rs = cartes.filter(function (r) { return r.c.groupe === g.id && r.compte; });
      var cats = {}, ordreCats = [];
      rs.forEach(function (r) { var k = r.c.cat || '—'; if (!cats[k]) { cats[k] = []; ordreCats.push(k); } cats[k].push(r); });
      if (!ordreCats.length) return;
      categories.push({ groupe: g, lignes: ordreCats.map(function (k) {
        var l = cats[k], den = somme(l.filter(function (r) { return nb(r.c.prix) != null; }), function (r) { return r.paye; });
        var m = somme(l, function (r) { return r.marge; });
        return { cat: k, nb: l.length, paye: somme(l, function (r) { return r.paye; }), valeur: somme(l, function (r) { return r.c.prix; }), marge: m, gain: den ? m / den : null };
      }) });
    });

    /* ventes par groupe (comme l'onglet Ventes) */
    var ventes = [];
    groupes.forEach(function (g) {
      if (g.hors_totaux) return;
      var rs = cartes.filter(function (r) { return r.c.groupe === g.id; });
      var vd = rs.filter(function (r) { return r.c.vendu; }), vdT = vd.filter(function (r) { return !r.c.hors_taux; });
      var enc = somme(vd, function (r) { return r.encaisse; });
      var cout = (somme(vd, function (r) { return r.paye; }) + somme(vd, function (r) { return r.estime; })) * (1 + tva);
      var fr = somme(vd, function (r) { return z(r.encaisse) * r.fv; });
      var env = vd.length * envoi, b = enc - fr - cout - env;
      var encT = somme(vdT, function (r) { return r.encaisse; }), frT = somme(vdT, function (r) { return z(r.encaisse) * r.fv; }),
          coutT = (somme(vdT, function (r) { return r.paye; }) + somme(vdT, function (r) { return r.estime; })) * (1 + tva), bT = encT - frT - coutT - vdT.length * envoi;
      ventes.push({ cle: g.id, libelle: g.nom || g.id, ordre: nb(g.ordre) != null ? g.ordre : 50, vendus: vd.length, stock: rs.length - vd.length,
        encaisse: enc, frais: fr, cout: cout, envoi: env, net: b, rentab: coutT ? bT / coutT : null, enc_t: encT, cout_t: coutT, net_t: bT, hors_taux: vd.length - vdT.length,
        estime: somme(vd, function (r) { return r.estime; }) * (1 + tva) });
    });
    produits.forEach(function (x) {
      var v = x.vente;
      ventes.push({ cle: x.id, libelle: x.p.libelle || x.p.nom, ordre: nb(x.p.ordre) != null ? x.p.ordre : 60, vendus: v.vendus, stock: v.stock,
        encaisse: v.encaisse, frais: v.frais, cout: v.cout, envoi: v.envoi, net: v.net, rentab: v.cout ? v.net / v.cout : null, enc_t: v.encaisse, cout_t: v.cout, net_t: v.net, hors_taux: 0, estime: 0, produit: true });
    });
    ventes.sort(function (a, b) { return a.ordre - b.ordre; });
    var vt = { cle: 'TOTAL', libelle: 'Total' };
    ['vendus', 'stock', 'encaisse', 'frais', 'cout', 'envoi', 'net', 'estime', 'enc_t', 'cout_t', 'net_t', 'hors_taux'].forEach(function (k) { vt[k] = somme(ventes, function (l) { return l[k]; }); });
    vt.rentab = vt.cout_t ? vt.net_t / vt.cout_t : null;

    /* stock restant */
    var enStock = cartes.filter(function (r) { return r.stock; });
    var valorisees = enStock.filter(function (r) { return nb(r.c.prix) != null; });
    var sansPrix = enStock.filter(function (r) { return nb(r.c.prix) == null; });
    var stockParGroupe = [];
    groupes.forEach(function (g) {
      if (g.hors_totaux) return;
      var rs = enStock.filter(function (r) { return r.c.groupe === g.id; });
      if (rs.length) stockParGroupe.push({ cle: g.id, libelle: g.nom || g.id, nb: rs.length, valeur: somme(rs, function (r) { return r.c.prix; }),
        cout: somme(rs, function (r) { return r.cout; }), latent: somme(rs, function (r) { return r.latent; }) });
    });
    produits.forEach(function (x) {
      if (x.reste > 0) stockParGroupe.push({ cle: x.id, libelle: x.p.libelle || x.p.nom, nb: x.reste, valeur: x.stock_valeur,
        cout: x.stock_reel + x.stock_estime, latent: x.latent, produit: true });
    });
    var stock = {
      cartes: enStock.length,
      unites: produits.reduce(function (s, x) { return s + x.reste; }, 0),
      valeur: somme(valorisees, function (r) { return r.c.prix; }) + somme(produits, function (x) { return x.stock_valeur; }),
      valeur_nette: somme(valorisees, function (r) { return r.c.prix * (1 - fv); }) + somme(produits, function (x) { return x.stock_valeur_nette; }),
      cout_reel: somme(enStock, function (r) { return r.paye; }) + somme(produits, function (x) { return x.stock_reel; }),
      cout_estime: somme(valorisees, function (r) { return r.estime; }) + somme(produits, function (x) { return x.stock_estime; }),
      latent: somme(valorisees, function (r) { return r.latent; }) + somme(produits, function (x) { return x.latent; }),
      sans_prix: sansPrix.length,
      cout_sans_prix: somme(sansPrix, function (r) { return r.paye; }),
      sans_paye: valorisees.filter(function (r) { return r.paye == null; }).length,
      par_groupe: stockParGroupe
    };
    stock.nb = stock.cartes + stock.unites;

    /* indicateurs */
    var recupere = vt.encaisse - vt.frais - vt.envoi;
    var k = {
      benef: vt.net, encaisse: vt.encaisse, vendus: vt.vendus, cout_ventes: vt.cout, envois: vt.envoi, frais_vente: vt.frais,
      rentab: vt.rentab, taux_marque: vt.enc_t ? vt.net_t / vt.enc_t : null, hors_taux: vt.hors_taux, prix_moyen: vt.vendus ? vt.encaisse / vt.vendus : null,
      cout_estime_ventes: vt.estime,
      investi: synthTotal.paye, valeur_collection: synthTotal.valeur,
      recupere: recupere, reste: synthTotal.paye - recupere, pct_recupere: synthTotal.paye ? recupere / synthTotal.paye : null,
      resultat_projete: vt.net + stock.latent,
      ecoulement: (vt.vendus + stock.nb) ? vt.vendus / (vt.vendus + stock.nb) : null
    };

    /* contrôles (sans le site) */
    var ctl = {
      sans_prix: sansPrix,
      sans_paye: valorisees.filter(function (r) { return r.paye == null; }),
      a_perte: valorisees.filter(function (r) { return r.latent != null && r.latent < 0; }),
      ventes_a_perte: cartes.filter(function (r) { return r.vente && r.vente.net < 0; }),
      tickets_ecart: listeTickets.filter(function (x) { return !x.ok && x.nb > 0; }),
      tickets_vides: listeTickets.filter(function (x) { return x.nb === 0; })
    };

    return {
      params: { taux: taux, fv: fv, tva: tva, rent: rent, envoi: envoi, gardees: gardees, debut_ventes: debutV, delai_vente_passee: delaiV, frais_canal: fraisCanal },
      dates_ventes: {
        debut: debutV, delai: delaiV,
        estimees: cartes.filter(function (r) { return r.vente && r.vente_estimee; }).length,
        sans_date: cartes.filter(function (r) { return r.vente && !r.date_vente; }).length,
        delais_estimes: cartes.filter(function (r) { return r.vente && r.delai_estime; }).length
      },
      groupes: groupes, cartes: cartes, parRef: parRef, tickets: listeTickets, ticketsParId: tickets, lots: listeLots, lotsParId: lots,
      produits: produits, synthese: lignes, synthTotal: synthTotal, categories: categories, ventes: ventes, ventesTotal: vt,
      stock: stock, k: k, controles: ctl
    };
  }

  return { calcul: calcul, nb: nb, DEBUT_VENTES: DEBUT_VENTES, DELAI_VENTE_PASSEE: DELAI_VENTE_PASSEE, FRAIS_CANAL_DEFAUT: FRAIS_CANAL_DEFAUT };
});
