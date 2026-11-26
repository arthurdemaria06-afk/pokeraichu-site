/* Poké-Raichu · pilotage : données du tableau de bord (filtres, périodes, séries dans le temps).
   Se branche sur le résultat de PRCalcul.calcul(doc) sans le modifier. Principe :
   - « faits » : une ligne par vente (carte vendue, ou vente de produits au nombre datée dans son historique), une ligne par
     article en stock, une ligne par achat (prix payé réel) ;
   - sans filtre et sur « Depuis le début », les sommes retombent exactement sur les chiffres du moteur (k.benef, k.encaisse,
     stock.valeur, k.investi…) : même périmètre (ventes des groupes comptés, produits au nombre compris) ;
   - ventes de produits : chaque ligne de leur historique est datée ; ce que l'historique ne couvre pas (ventes venues de
     l'Excel) devient une ligne « sans date » pour que les totaux restent justes ;
   - une période (30 j, 90 j, 12 mois) ne garde que les ventes datées dedans ; « Depuis le début » garde tout, et les ventes
     sans date ont leur propre colonne grise au début des graphiques.
   Utilisable dans Node (tests). Aucune donnée ici. */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.PRBord = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function nb(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function z(v) { return nb(v) || 0; }
  function assign(o) { for (var i = 1; i < arguments.length; i++) { var s = arguments[i]; if (s) for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) o[k] = s[k]; } return o; }
  function dateOk(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) && isFinite(Date.parse(s.slice(0, 10))) ? s.slice(0, 10) : null; }
  function jour(iso) { return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5; }
  function iso(j) { var t = new Date(j * 864e5); return t.getUTCFullYear() + '-' + String(t.getUTCMonth() + 1).padStart(2, '0') + '-' + String(t.getUTCDate()).padStart(2, '0'); }

  var GAMMES = [[10, 'Moins de 10 €'], [25, '10 à 25 €'], [50, '25 à 50 €'], [100, '50 à 100 €'], [250, '100 à 250 €'], [Infinity, '250 € et plus']];
  var ORDRE_GAMMES = GAMMES.map(function (g) { return g[1]; }).concat(['Sans prix marché']);
  function gamme(p) {
    p = nb(p);
    if (p == null) return 'Sans prix marché';
    for (var i = 0; i < GAMMES.length; i++) if (p < GAMMES[i][0]) return GAMMES[i][1];
    return GAMMES[GAMMES.length - 1][1];
  }

  /* ---------------------------------------------------------------- faits */
  function faits(R) {
    var P = R.params, ventes = [], stock = [], achats = [], groupes = [], noms = {};
    R.groupes.forEach(function (g) { if (!g.hors_totaux) { noms[g.id] = g.nom || g.id; groupes.push({ cle: g.id, nom: g.nom || g.id }); } });
    R.cartes.forEach(function (r) {
      var c = r.c, compte = !!c.groupe && noms[c.groupe] != null;
      var base = { r: r, ref: c.ref, nom: c.nom || c.ref, groupe: c.groupe || 'Sans groupe', cat: c.cat || 'Sans catégorie',
        langue: c.langue || 'Non renseignée', gamme: gamme(c.prix), prix: nb(c.prix) };
      if (r.vente && compte) ventes.push(assign({ type: 'carte', date: dateOk(r.date_vente !== undefined ? r.date_vente : c.vente_date), date_estimee: !!r.vente_estimee, canal: c.canal || 'Non renseigné', n: 1,
        ca: r.vente.encaisse, net: r.vente.net, cout: r.vente.cout, frais: r.vente.frais, envoi: r.vente.envoi, marche: nb(c.prix), estime: r.source === 'estimé', hors_taux: !!c.hors_taux }, base));
      if (r.stock) stock.push(assign({ type: 'carte', n: 1, valeur: nb(c.prix), cout: z(r.cout), latent: r.latent, sans_prix: nb(c.prix) == null, estime: r.source === 'estimé',
        date_achat: dateOk(c.date_achat) }, base));
      if (compte && r.compte) achats.push(assign({ type: 'carte', paye: z(r.paye) }, base));
    });
    R.produits.forEach(function (x) {
      var cle = 'p:' + x.id, nom = x.p.libelle || x.p.nom || x.id;
      groupes.push({ cle: cle, nom: nom, produit: true });
      noms[cle] = nom;
      var base = { r: null, ref: null, nom: nom, groupe: cle, cat: 'Scellé et quantités', langue: null, gamme: null, prix: null, produit: x };
      var v = x.vente;
      if (v.vendus > 0 || Math.abs(v.encaisse) > 0.005) {
        var fixe = nb(x.p.frais_u) != null, pu = z(x.paye_unitaire), acc = { n: 0, ca: 0, net: 0, cout: 0, frais: 0, envoi: 0 };
        (Array.isArray(x.p.historique) ? x.p.historique : []).forEach(function (hi) {
          if (!hi || !(nb(hi.n) > 0)) return;
          var ca = hi.n * z(nb(hi.prix) != null ? hi.prix : x.prix_u), frais = fixe ? hi.n * x.p.frais_u : ca * P.fv;
          var cout = hi.n * pu * (fixe ? 1 : (1 + P.tva)), envoi = (nb(hi.envois) != null ? hi.envois : hi.n) * P.envoi;
          var e = assign({ type: 'produit', date: dateOk(hi.date), canal: hi.canal || 'Non renseigné', n: hi.n, ca: ca, frais: frais, cout: cout, envoi: envoi,
            net: ca - frais - cout - envoi, marche: hi.n * z(x.prix_u), estime: false }, base);
          ventes.push(e);
          ['n', 'ca', 'net', 'cout', 'frais', 'envoi'].forEach(function (k) { acc[k] += e[k]; });
        });
        var reste = { n: v.vendus - acc.n, ca: v.encaisse - acc.ca, net: v.net - acc.net, cout: v.cout - acc.cout, frais: v.frais - acc.frais, envoi: v.envoi - acc.envoi };
        if (Math.abs(reste.n) > 1e-9 || Math.abs(reste.ca) > 0.004 || Math.abs(reste.net) > 0.004)
          ventes.push(assign({ type: 'produit', date: null, canal: 'Non renseigné', marche: reste.n * z(x.prix_u), estime: false }, reste, base));
      }
      if (x.reste > 0) stock.push(assign({ type: 'produit', n: x.reste, valeur: x.stock_valeur, cout: x.stock_reel + x.stock_estime, latent: x.latent,
        sans_prix: false, estime: !x.connu, date_achat: null }, base));
      achats.push(assign({ type: 'produit', paye: z(x.paye) }, base));
    });
    var dates = ventes.map(function (v) { return v.date; }).filter(Boolean).sort();
    return { ventes: ventes, stock: stock, achats: achats, groupes: groupes, noms: noms, premiere: dates[0] || null, derniere: dates[dates.length - 1] || null };
  }

  /* ---------------------------------------------------------------- périodes */
  var PERIODES = [['30j', '30 j', 30], ['90j', '90 j', 90], ['12m', '12 mois', 365], ['tout', 'Depuis le début', null]];
  function periode(cle, auj, F) {
    var a = jour(auj), def = PERIODES.filter(function (p) { return p[0] === cle; })[0] || PERIODES[3];
    if (def[2]) {
      var n = def[2], d0 = a - n + 1;
      return { cle: def[0], nom: def[0] === '12m' ? '12 derniers mois' : def[2] + ' derniers jours', court: def[1], debut: iso(d0), fin: auj, jours: n,
        prec: { debut: iso(d0 - n), fin: iso(d0 - 1) }, precNom: def[0] === '12m' ? 'les 12 mois d’avant' : 'les ' + n + ' jours d’avant' };
    }
    var deb = F && F.premiere ? F.premiere : auj;
    if (deb > auj) deb = auj;
    return { cle: 'tout', nom: 'Depuis le début', court: 'Tout', debut: deb, fin: auj, jours: a - jour(deb) + 1, prec: null, tout: true };
  }

  /* ---------------------------------------------------------------- filtres */
  function garder(x, f, stock) {
    if (f.groupe && x.groupe !== f.groupe) return false;
    if (f.langue && x.langue !== f.langue) return false;
    if (f.gamme && x.gamme !== f.gamme) return false;
    if (!stock && f.canal && x.canal !== f.canal) return false;
    if (f.cat && x.cat !== f.cat) return false;
    return true;
  }
  function dans(d, p) { return !!d && d >= p.debut && d <= p.fin; }
  function filtrer(F, f, per) {
    var tous = F.ventes.filter(function (v) { return garder(v, f, false); });
    var ventes = per.tout ? tous : tous.filter(function (v) { return dans(v.date, per); });
    return {
      tous: tous,
      ventes: ventes,
      prec: per.prec ? tous.filter(function (v) { return dans(v.date, per.prec); }) : null,
      sans_date: per.tout ? 0 : tous.filter(function (v) { return !v.date; }).reduce(function (a, v) { return a + v.n; }, 0),
      stock: F.stock.filter(function (s) { return garder(s, f, true); }),
      achats: F.achats.filter(function (s) { return garder(s, f, true); })
    };
  }

  /* ---------------------------------------------------------------- sommes */
  function totaux(l) {
    var t = { n: 0, ca: 0, net: 0, cout: 0, frais: 0, envoi: 0, marche: 0, ca_marche: 0, lignes: 0, ca_t: 0, net_t: 0, cout_t: 0, hors_taux: 0 };
    (l || []).forEach(function (v) {
      t.n += z(v.n); t.ca += z(v.ca); t.net += z(v.net); t.cout += z(v.cout); t.frais += z(v.frais); t.envoi += z(v.envoi); t.lignes++;
      if (v.hors_taux) t.hors_taux += z(v.n); else { t.ca_t += z(v.ca); t.net_t += z(v.net); t.cout_t += z(v.cout); }   /* hors taux : compté dans le CA et le bénéfice, pas dans les taux */
      if (nb(v.marche) != null && v.marche > 0) { t.marche += v.marche; t.ca_marche += z(v.ca); }
    });
    t.marque = t.ca_t ? t.net_t / t.ca_t : null;
    t.rentab = t.cout_t ? t.net_t / t.cout_t : null;
    t.panier = t.n ? t.ca / t.n : null;
    t.realisation = t.marche ? t.ca_marche / t.marche : null;
    t.recupere = t.ca - t.frais - t.envoi;
    return t;
  }
  function totauxStock(l) {
    var t = { n: 0, cartes: 0, unites: 0, valeur: 0, cout: 0, latent: 0, sans_prix: 0, estime: 0 };
    (l || []).forEach(function (s) {
      t.n += s.n; if (s.type === 'carte') t.cartes++; else t.unites += s.n;
      if (s.valeur != null) t.valeur += z(s.valeur);
      t.cout += z(s.cout); t.latent += z(s.latent);
      if (s.sans_prix) t.sans_prix++;
      if (s.estime) t.estime += z(s.cout);
    });
    t.gain = t.cout ? t.latent / t.cout : null;
    return t;
  }
  function parCle(l, cle, f) {
    var m = {}, ordre = [];
    l.forEach(function (x) {
      var k = typeof cle === 'function' ? cle(x) : x[cle];
      if (k == null) return;
      if (!m[k]) { m[k] = []; ordre.push(k); }
      m[k].push(x);
    });
    return ordre.map(function (k) { return assign({ cle: k, lignes: m[k] }, f(m[k])); });
  }

  /* ---------------------------------------------------------------- découpage dans le temps */
  function pasDe(per) { return per.jours <= 31 ? 'jour' : per.jours <= 200 ? 'semaine' : 'mois'; }
  var MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  var MOIS_L = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  function bacs(per, pas) {
    var out = [], a = jour(per.debut), b = jour(per.fin), j, t;
    if (pas === 'jour') {
      for (j = a; j <= b; j++) { t = new Date(j * 864e5); out.push({ cle: iso(j), debut: iso(j), fin: iso(j), label: t.getUTCDate() + '/' + (t.getUTCMonth() + 1), long: t.getUTCDate() + ' ' + MOIS_L[t.getUTCMonth()] + ' ' + t.getUTCFullYear() }); }
    } else if (pas === 'semaine') {
      j = a; while (new Date(j * 864e5).getUTCDay() !== 1) j--;
      for (; j <= b; j += 7) {
        t = new Date(j * 864e5); var u = new Date((j + 6) * 864e5);
        out.push({ cle: iso(j), debut: iso(Math.max(j, a)), fin: iso(Math.min(j + 6, b)), label: t.getUTCDate() + ' ' + MOIS[t.getUTCMonth()],
          long: 'Semaine du ' + t.getUTCDate() + (t.getUTCMonth() !== u.getUTCMonth() ? ' ' + MOIS_L[t.getUTCMonth()] : '') + ' au ' + u.getUTCDate() + ' ' + MOIS_L[u.getUTCMonth()] + ' ' + u.getUTCFullYear() });
      }
    } else {
      t = new Date(a * 864e5); var y = t.getUTCFullYear(), m = t.getUTCMonth(), premier = true;
      while (Date.UTC(y, m, 1) / 864e5 <= b) {
        var d0 = Date.UTC(y, m, 1) / 864e5, d1 = Date.UTC(y, m + 1, 1) / 864e5 - 1;
        out.push({ cle: iso(d0), debut: iso(Math.max(d0, a)), fin: iso(Math.min(d1, b)), label: MOIS[m] + (m === 0 || premier ? ' ' + String(y).slice(2) : ''), long: MOIS_L[m] + ' ' + y });
        premier = false; m++; if (m > 11) { m = 0; y++; }
      }
    }
    return out;
  }
  /* ventes rangées par période ; la colonne « sans date » (spéciale) en tête quand il y en a */
  function serie(ventes, per, pas) {
    var B = bacs(per, pas), idx = {};
    B.forEach(function (x, i) { x.v = []; idx[x.cle] = i; });
    var sansDate = [];
    ventes.forEach(function (v) {
      if (!v.date) { sansDate.push(v); return; }
      for (var i = B.length - 1; i >= 0; i--) if (v.date >= B[i].debut) { if (v.date <= B[i].fin) B[i].v.push(v); return; }
    });
    var out = B.map(function (x) { return assign({ cle: x.cle, label: x.label, long: x.long, debut: x.debut, fin: x.fin }, totaux(x.v)); });
    if (sansDate.length) out.unshift(assign({ cle: 'sans-date', label: 'Sans date', long: 'Ventes sans date (venues de l’Excel)', special: true }, totaux(sansDate)));
    return out;
  }
  /* cumul dans le temps (pour « investissement récupéré ») : un point par jour de vente, ventes sans date au départ */
  function cumul(ventes, champ) {
    var sd = 0, parJour = {};
    ventes.forEach(function (v) { var x = champ === 'recupere' ? z(v.ca) - z(v.frais) - z(v.envoi) : z(v[champ]); if (!v.date) sd += x; else parJour[v.date] = (parJour[v.date] || 0) + x; });
    var jours = Object.keys(parJour).sort(), c = sd, pts = [];
    jours.forEach(function (j) { c += parJour[j]; pts.push({ date: j, v: c }); });
    return { depart: sd, points: pts };
  }

  return { faits: faits, periode: periode, PERIODES: PERIODES, filtrer: filtrer, garder: garder, totaux: totaux, totauxStock: totauxStock, parCle: parCle,
    pasDe: pasDe, bacs: bacs, serie: serie, cumul: cumul, gamme: gamme, ORDRE_GAMMES: ORDRE_GAMMES, jour: jour, iso: iso };
});
