// Vérifie le simulateur SASU (cas d'école chiffrés à la main) puis l'applique à modele.json du dossier courant.
// Usage : PR_SITE=/chemin/du/site node test_fiscal.js
const path = require('path'), assert = require('assert');
const SITE = process.env.PR_SITE || path.join(__dirname, '..', '..');
const C = require(path.join(SITE, 'assets/js/pilotage-calcul.js'));
const K = require(path.join(SITE, 'assets/js/pilotage-couts.js'));
const F = require(path.join(SITE, 'assets/js/pilotage-fiscal.js'));
const doc = JSON.parse(JSON.stringify(require(path.resolve('modele.json'))));
const R = C.calcul(doc), X = K.couts(R, doc, { aujourdhui: '2026-11-19' });
const e = v => v == null ? '—' : (Math.round(v * 100) / 100).toFixed(2);
// IS
assert.strictEqual(F.impotSocietes(50000, {}), 42500 * 0.15 + 7500 * 0.25);
assert.strictEqual(F.impotSocietes(-10, {}), 0);
// coût de la TVA : au réel, la TVA facturée ; en franchise, la TVA d'import et des charges
// cas d'école : 100 000 € de ventes, coût 50 %, tout importé, aucune charge
const H0 = { ca: 100000, taux_cout: 0.5, part_import: 1, frais_vente: 0, voyages: 0, frais_voyage: 0, charges_fixes: 0, tva_charges: 0, salaire_net: 0, distribution: 1, tmi: 0.11, taux_charges: 0.8, capital: 1000, cfe: 0 };
const re = F.simuler(H0, 'reel'), fr = F.simuler(H0, 'franchise');
// réel : TVA collectée = 100000/6 ; import 20 % × 50000 = 10000 ; à payer 6666,67 ; CA HT 83333,33 ; marge 33333,33
assert(Math.abs(re.tva.collectee - 100000 / 6) < 0.01);
assert(Math.abs(re.tva.a_payer - (100000 / 6 - 10000)) < 0.01);
assert(Math.abs(re.sig.marge_commerciale - (100000 - 100000 / 6 - 50000)) < 0.01);
// franchise : achats 50000 + 10000 de TVA import ; marge 40000 ; franchise impossible (CA > 93 500)
assert(Math.abs(fr.sig.marge_commerciale - 40000) < 0.01);
assert.strictEqual(fr.franchise_tolerance, false);
// IS sur 33333,33 au réel : 15 %
assert(Math.abs(re.sig.is - re.sig.rcai * 0.15) < 0.01);
// réserve légale plafonnée à 10 % du capital = 100 €
assert(Math.abs(re.remuneration.reserve - 100) < 0.01);
// dividendes : PFU 31,4 % vs barème (0,6 × 11 % + 18,6 % = 25,2 %) → barème retenu
assert.strictEqual(re.remuneration.option, 'barème');
// régime de la marge : tout acheté à des particuliers → TVA = (E − A)/6
const m = F.simuler(Object.assign({}, H0, { part_import: 0, ca: 60000 }), 'reel');
assert(Math.abs(m.tva.collectee - 30000 / 6) < 0.01 && m.tva.deductible === 0);
// optimum : à TMI 11 %, dividendes plus avantageux qu'un salaire
const o = F.optimiser(Object.assign({}, H0, { ca: 60000 }), 'reel');
console.log('optimum', e(o.meilleur.salaire), e(o.meilleur.poche), 'max', e(o.max));
// hypothèses d'après les vraies données
const H = F.hypotheses(R, X, doc);
console.log('hypothèses', H);
const t = F.tvaReelle(R);
console.log('TVA réelle', Object.fromEntries(Object.entries(t).map(([k, v]) => [k, typeof v === 'number' ? e(v) : v])));
for (const r of ['franchise', 'reel']) {
  const x = F.simuler(H, r);
  console.log(r, 'TVA', e(x.tva.cout), 'RN', e(x.sig.resultat_net), 'poche', e(x.remuneration.poche), 'franchise ok', x.franchise_possible);
}
console.log('ratios', Object.fromEntries(Object.entries(F.ratios(R, X)).map(([k, v]) => [k, e(v)])));
console.log('OK');
{
  const H1 = { ca: 9000, taux_cout: 0.5, part_import: 0.7, frais_vente: 0, voyages: 1, frais_voyage: 1000, charges_fixes: 600, tva_charges: 100, salaire_net: 0, distribution: 1, tmi: 0.11, taux_charges: 0.8, capital: 1000, cfe: 0 };
  const a = F.simuler(H1, 'reel'), b = F.simuler(H1, 'franchise');
  // écart de résultat avant impôt = écart de coût de TVA
  assert(Math.abs((b.sig.rcai - a.sig.rcai) - (a.tva.cout - b.tva.cout)) < 0.01, 'cohérence TVA / résultat');
  console.log('cohérence TVA / résultat : OK', e(a.tva.cout), e(b.tva.cout));
}
