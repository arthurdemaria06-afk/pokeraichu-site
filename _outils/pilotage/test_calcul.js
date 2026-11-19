const assert = require('assert');
const SITE = process.env.PR_SITE || '/home/claude/pokeraichu-site';
const C = require(SITE + '/assets/js/pilotage-calcul.js');
const doc = require(process.cwd() + '/modele.json'), att = require(process.cwd() + '/attendu.json');
const R = C.calcul(doc);
const eq = (a, b, what) => {
  const vide = v => v === null || v === undefined;
  if (vide(a) && vide(b)) return;
  assert(!vide(a) && !vide(b), what + ' : ' + a + ' ≠ ' + b);
  assert(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), what + ' : ' + a + ' ≠ ' + b);
};
att.cartes.forEach((x, i) => {
  const r = R.cartes[i];
  assert.equal(r.ref, x.ref);
  for (const k of ['paye', 'estime', 'marge', 'gain', 'encaisse', 'benef']) eq(r[k], x[k], x.ref + ' ' + k);
});
const mapS = { cardsets: 'cardsets', coffret: 'coffret', ex: 'ex', boosters: 'boosters' };
att.synthese.forEach(x => {
  const l = x.cle === 'TOTAL' ? R.synthTotal : R.synthese.find(s => s.cle === x.cle);
  assert(l, 'ligne ' + x.cle);
  for (const k of ['nb', 'paye', 'valeur', 'marge', 'gain']) eq(l[k], x[k], 'synthèse ' + x.cle + ' ' + k);
});
assert.deepEqual(R.synthese.map(l => l.cle), att.synthese.filter(x => x.cle !== 'TOTAL').map(x => x.cle), 'ordre de la synthèse');
att.ventes.forEach(x => {
  const l = x.cle === 'TOTAL' ? R.ventesTotal : R.ventes.find(s => s.cle === x.cle);
  for (const [k, kp] of [['vendus', 'vendus'], ['stock', 'stock'], ['encaisse', 'encaisse'], ['frais', 'frais'], ['cout', 'paye'], ['envoi', 'envoi'], ['net', 'benef'], ['rentab', 'rentab'], ['estime', 'estime']]) eq(l[k], x[kp], 'ventes ' + x.cle + ' ' + k);
});
for (const [id, x] of Object.entries(att.tickets)) { const t = R.ticketsParId[id]; eq(t.detaxe, x.detaxe, id); eq(t.paye_yen, x.paye_yen, id); eq(t.paye_eur, x.paye_eur, id); }
for (const [id, x] of Object.entries(att.lots)) { const l = R.lotsParId[id]; eq(l.paye_eur, x.paye_eur, id); eq(l.prix_total, x.prix_total, id); }
const k = R.k, s = R.stock;
console.log('JS = Python = Excel sur', att.cartes.length, 'cartes, synthèse, ventes, tickets, lots.');
const f = v => v == null ? '—' : Math.round(v * 100) / 100;
console.log('KPI', { benef: f(k.benef), encaisse: f(k.encaisse), vendus: k.vendus, rentab: f(k.rentab), marque: f(k.taux_marque), prix_moyen: f(k.prix_moyen), investi: f(k.investi), recupere: f(k.recupere), reste: f(k.reste), pct: f(k.pct_recupere), projete: f(k.resultat_projete), ecoulement: f(k.ecoulement) });
console.log('STOCK', { nb: s.nb, cartes: s.cartes, unites: s.unites, valeur: f(s.valeur), nette: f(s.valeur_nette), reel: f(s.cout_reel), estime: f(s.cout_estime), latent: f(s.latent), sans_prix: s.sans_prix, cout_sans_prix: f(s.cout_sans_prix), sans_paye: s.sans_paye });
console.log('PAR GROUPE', s.par_groupe.map(g => g.cle + ':' + f(g.valeur)).join(' | '));
console.log('CONTRÔLES', Object.fromEntries(Object.entries(R.controles).map(([a, b]) => [a, b.length])));
