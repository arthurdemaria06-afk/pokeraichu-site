// Vérifie le moteur d'analyse sur un modèle exporté (modele.json dans le dossier courant, jamais dans le dépôt).
// Usage : PR_SITE=/chemin/du/site node test_analyse.js
const path = require('path');
const SITE = process.env.PR_SITE || path.join(__dirname, '..', '..');
const C = require(path.join(SITE, 'assets/js/pilotage-calcul.js'));
const A = require(path.join(SITE, 'assets/js/pilotage-analyse.js'));
const assert = require('assert');
const doc = require(path.resolve('modele.json'));
const R = C.calcul(doc);
const f = v => v == null ? '—' : (Math.abs(v) < 5 ? (v * 100).toFixed(0) + '%' : v.toFixed(0));
for (const d of A.DIMENSIONS) {
  const X = A.segments(R, d.id, '2026-11-19');
  const s = k => X.lignes.reduce((a, l) => a + l[k], 0);
  for (const k of ['n', 'nv', 'cout', 'cout_vendu', 'ca', 'benef', 'cout_stock', 'latent']) if (d.id !== 'canal') assert(Math.abs(s(k) - X.total[k]) < 1e-6, d.id + ' ' + k);
  console.log('\n## ' + d.nom, '| rentab moy', f(X.rentab_moy), '| écoul moy', f(X.ecoul_moy), '| réalisation', f(X.realisation));
  for (const l of X.lignes) console.log('  ' + l.cle.padEnd(34).slice(0, 34), 'n', String(l.n).padStart(4), 'v', String(l.nv).padStart(2), 'coût', f(l.cout).padStart(6), 'écoul', f(l.ecoul).padStart(4), 'réal', f(l.rentab_real).padStart(5), 'att', f(l.rentab_att).padStart(5), 'retenue', f(l.rentab).padStart(5), 'stock', f(l.cout_stock).padStart(6), 'estimé', f(l.part_estimee).padStart(4), l.reco);
}
const X = A.segments(R, 'rarete', '2026-11-19');
const rep = A.repartition(X, 3000);
console.log('\nRépartition 3000 € par rareté :', rep.lignes.map(l => l.s.cle + ' ' + l.montant.toFixed(0) + ' € (' + l.role + ', bénéf ' + l.benef.toFixed(0) + ', ≈' + (l.cartes || 0).toFixed(0) + ' cartes)').join(' | '), '| placé', rep.place.toFixed(0), 'bénéf', rep.benef.toFixed(0));
assert(Math.abs(rep.place - 3000) < 1 || rep.non_place > 0);
assert(rep.lignes.every(l => l.montant <= 3000 * 0.4 + 0.01));
console.log('Simulation gradation :', A.simulerGradation({ achat: 60, frais: 30, prix_brute: 70, prix_psa10: 250, prix_psa9: 110, p10: 45, p9: 35, delai_mois: 3 }));
