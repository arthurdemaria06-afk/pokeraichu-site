// Vérifie le moteur des coûts (charges, voyages, cascade, seuil) sur modele.json du dossier courant (jamais dans le dépôt).
// Les charges et le voyage ci-dessous sont inventés pour le test. Usage : PR_SITE=/chemin/du/site node test_couts.js
const path = require('path'), assert = require('assert');
const SITE = process.env.PR_SITE || path.join(__dirname, '..', '..');
const C = require(path.join(SITE, 'assets/js/pilotage-calcul.js'));
const K = require(path.join(SITE, 'assets/js/pilotage-couts.js'));
const doc = JSON.parse(JSON.stringify(require(path.resolve('modele.json'))));
const AUJ = '2026-11-19';
let R = C.calcul(doc);
let X = K.couts(R, doc, { aujourdhui: AUJ });
const e = v => v == null ? '—' : (Math.round(v * 100) / 100).toFixed(2);
console.log('sans charges : résultat', e(X.cascade.resultat), 'k.benef', e(R.k.benef), 'CA', e(X.cascade.ca), 'encaissé', e(R.k.encaisse));
assert(Math.abs(X.cascade.resultat - R.k.benef) < 0.01, 'résultat = bénéfice Excel sans charges');
assert(Math.abs(X.cascade.ca - R.k.encaisse) < 0.01);
// voyage + charges d'exemple (inventées pour le test)
const prop = K.proposition(doc, R);
console.log('proposition', prop);
doc.voyages = [{ id: 'V1', nom: 'Japon test', debut: prop.debut, fin: prop.fin }];
doc.params.taux_horaire = 15; doc.params.minutes_par_vente = 20;
doc.charges = [
  { id: 'a', date: '2026-10-05', libelle: 'Avion', montant: 900, cat: 'voyage', cible: 'voyage', voyage: 'V1' },
  { id: 'b', date: '2026-10-06', libelle: 'Hôtel', montant: 105000, devise: 'JPY', cat: 'voyage', cible: 'voyage', voyage: 'V1' },
  { id: 'c', date: '2026-09-01', libelle: 'Shopify', montant: 39, tva: 6.5, cat: 'abonnement', cible: 'general', recurrence: 'mois' },
  { id: 'd', date: '2026-11-02', libelle: 'PSA', montant: 25, cat: 'gradation', cible: 'carte', ref: '102' },
  { id: 'f', date: '2026-11-03', libelle: 'Commission', montant: 3, cat: 'commission', cible: 'carte', ref: '113' },
  { id: 'g', date: '2026-11-04', libelle: 'Toploaders', montant: 12, cat: 'fournitures', cible: 'general' },
  { id: 'h', date: '2026-10-10', libelle: 'Chasse aux cartes', heures: 30, cat: 'temps', cible: 'voyage', voyage: 'V1' }
];
R = C.calcul(doc);
X = K.couts(R, doc, { aujourdhui: AUJ });
const v = X.voyages[0];
const occ = X.occurrences;
console.log('échéances', occ.length, occ.filter(o => o.c.id === 'c').map(o => o.date).join(' '));
assert.strictEqual(occ.filter(o => o.c.id === 'c').length, 3, 'Shopify : sept, oct, nov');
const qp = Object.values(X.articles).reduce((a, x) => a + x.qp_voyage, 0);
console.log('voyage : articles', v.articles.length, 'achats', e(v.achats), 'frais', e(v.frais), 'taux', e(v.taux_frais), 'Σ quote-parts', e(qp));
assert(Math.abs(v.frais - (900 + 105000 / doc.params.taux_jpy)) < 0.01, 'frais du voyage (temps exclu)');
assert(Math.abs(qp - v.frais) < 0.01, 'quote-parts = frais');
const c = X.cascade;
console.log('cascade', Object.fromEntries(Object.entries(c).map(([k, x]) => [k, e(x)])));
const s = X.seuil;
console.log('seuil', Object.fromEntries(Object.entries(s).map(([k, x]) => [k, typeof x === 'number' ? e(x) : x])));
console.log('cachés', Object.fromEntries(Object.entries(X.caches).map(([k, x]) => [k, typeof x === 'number' ? e(x) : x])));
console.log('totaux', Object.fromEntries(Object.entries(X.totaux).map(([k, x]) => [k, e(x)])));
console.log('voyage ROI', ['n_vendus', 'n_stock', 'ca', 'benef', 'latent', 'cout_total', 'roi_realise', 'roi_potentiel', 'recupere', 'marge_avant_frais', 'seuil_achat', 'frais_par_jour', 'duree'].map(k => k + ' ' + e(v[k])).join(' | '));
// contrôles de cohérence
const struct = 39 * 3 + 12;
assert(Math.abs(c.structure - struct) < 0.01, 'structure = 3 × 39 + 12');
const sold = Object.values(X.articles).filter(a => a.type === 'carte' && a.vendu);
const qpSold = sold.reduce((a, x) => a + x.qp_voyage, 0);
assert(Math.abs(c.frais_achat - qpSold) < 0.01, 'frais d\'achat absorbés = quote-parts des vendues (gradation sur 102 non vendue)');
assert(Math.abs(c.resultat - (R.k.benef - qpSold - 3 - struct)) < 0.01, 'résultat = bénéfice − quote-parts vendues − commission − structure');
// rapprochement coûts complets / coûts variables
const voyPeriode = v.frais;
assert(Math.abs(s.ecart - (voyPeriode - qpSold)) < 0.01, 'écart = frais de voyage de la période − frais déstockés');
// temps : 30 h saisies + 22 ventes × 20 min
assert(Math.abs(X.caches.heures - (30 + 22 * 20 / 60)) < 0.01);
// période 2026 et période vide
const P26 = K.couts(R, doc, { aujourdhui: AUJ, periode: { debut: '2026-01-01', fin: '2026-12-31' } });
console.log('2026 : non datées', P26.non_datees, 'CA', e(P26.cascade.ca), 'structure', e(P26.cascade.structure));
const P25 = K.couts(R, doc, { aujourdhui: AUJ, periode: { debut: '2025-01-01', fin: '2025-12-31' } });
console.log('2025 : CA', e(P25.cascade.ca), 'charges', e(P25.totaux.charges), 'SR', P25.seuil.sr);
console.log('années', K.annees(doc, R));
// clé « nombre »
doc.params.cle_voyage = 'nombre';
const N = K.couts(C.calcul(doc), doc, { aujourdhui: AUJ });
const qpN = Object.values(N.articles).reduce((a, x) => a + x.qp_voyage, 0);
assert(Math.abs(qpN - N.voyages[0].frais) < 0.01, 'clé nombre : quote-parts = frais');
console.log('OK');
