/* Poké-Raichu · calculateur « importer soi-même ou acheter ici »
   Règles appliquées (novembre 2026) : TVA 20 % dès le premier euro ; droit de douane forfaitaire de 3 € par catégorie
   d'article pour un colis de 150 € au plus (1er juillet 2026), sinon 2,7 % (cartes à jouer, 0 % avec preuve d'origine
   japonaise) ; frais de traitement de l'Union de 2 € (1er novembre 2026) ; frais La Poste de 2 € en payant en ligne. */
(function () {
  'use strict';
  var d = document;
  var f = d.querySelector('[data-calc]');
  if (!f) return;
  var EN = d.documentElement.lang === 'en';
  function tr(fr, en) { return EN ? en : fr; }
  var JPY = parseFloat(f.getAttribute('data-jpy')) || 176;
  var SEUIL = parseFloat(f.getAttribute('data-seuil')) || 0;
  var FR = {};
  try { FR = JSON.parse(f.getAttribute('data-fr') || '{}'); } catch (e) {}
  var out = d.querySelector('[data-calc-out]'), lines = d.querySelector('[data-calc-lines]');
  var totEl = d.querySelector('[data-calc-total]'), hereBox = d.querySelector('[data-calc-here-box]'), hereEl = d.querySelector('[data-calc-here]');
  var verdict = d.querySelector('[data-calc-verdict]');
  function num(id) { var v = d.getElementById(id).value.replace(/[^\d]/g, ''); return v ? parseInt(v, 10) : 0; }
  function eur(p) {
    try { return new Intl.NumberFormat(EN ? 'en-IE' : 'fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(p); }
    catch (e) { return p.toFixed(2) + ' €'; }
  }
  var tracked = false;
  function row(k, v) {
    var w = d.createElement('div'), dt = d.createElement('dt'), dd = d.createElement('dd');
    dt.textContent = k; dd.textContent = v; w.appendChild(dt); w.appendChild(dd); lines.appendChild(w);
  }
  function calc() {
    var prix = num('k-prix') / JPY, port = num('k-port') / JPY, serv = num('k-service') / JPY;
    if (!prix) { out.hidden = true; return; }
    var origine = d.getElementById('k-origine').value === 'oui';
    var express = d.getElementById('k-transp').value === 'express';
    var petit = prix <= 150;
    var droit = petit ? 3 : (origine ? 0 : (prix + port) * 0.027);
    var redevance = 2;
    var tva = (prix + port + droit) * 0.2;
    var transp = express ? 0 : 2;
    var total = prix + port + serv + droit + redevance + tva + transp;
    lines.textContent = '';
    row(tr('Prix de la carte', 'Card price'), eur(prix));
    if (port) row(tr('Envoi depuis le Japon', 'Shipping from Japan'), eur(port));
    if (serv) row(tr('Frais de l’intermédiaire', 'Proxy fees'), eur(serv));
    row(petit ? tr('Droit de douane forfaitaire (colis de 150 € au plus)', 'Flat customs duty (parcel of €150 or less)')
      : tr('Droit de douane', 'Customs duty') + (origine ? ' (0 %)' : ' (2,7 %)'.replace(',', EN ? '.' : ',')), eur(droit));
    row(tr('Frais de traitement de l’Union', 'EU handling fee'), eur(redevance));
    row(tr('TVA à l’import (20 %)', 'Import VAT (20%)'), eur(tva));
    row(express ? tr('Frais du transporteur express', 'Express carrier fees') : tr('Frais La Poste (paiement en ligne)', 'La Poste fee (paid online)'),
      express ? tr('variables, à ajouter', 'variable, to add') : eur(transp));
    totEl.textContent = eur(total) + (express ? ' +' : '');
    var opt = d.getElementById('k-carte');
    var o = opt.options[opt.selectedIndex];
    verdict.hidden = true;
    hereBox.hidden = true;
    if (o && o.value) {
      var p = parseFloat(o.getAttribute('data-prix'));
      var k = o.getAttribute('data-kind') || 'carte';
      var ship = SEUIL && p >= SEUIL ? 0 : (FR[k] || 0);
      var here = p + ship;
      hereEl.textContent = eur(here) + (ship ? '' : tr(' (envoi offert)', ' (free shipping)'));
      hereBox.hidden = false;
      var diff = total - here;
      verdict.textContent = diff > 0.5 ? tr('Acheter ici revient ' + eur(diff) + ' moins cher, sans attente ni démarche de douane.', 'Buying here costs ' + eur(diff) + ' less, with no wait and no customs formalities.')
        : diff < -0.5 ? tr('L’import revient ' + eur(-diff) + ' moins cher. Comptez 1 à 3 semaines de délai, le risque de casse en transit et l’absence de recours en France.',
          'Importing costs ' + eur(-diff) + ' less. Allow 1 to 3 weeks, the risk of damage in transit and no recourse in Europe.')
          : tr('Les deux reviennent au même prix : ici, la carte est déjà en France.', 'Both cost the same: here, the card is already in Europe.');
      verdict.hidden = false;
    }
    out.hidden = false;
    if (!tracked && window.PR_CONFIG) { tracked = true; }
  }
  ['k-prix', 'k-port', 'k-service'].forEach(function (id) { d.getElementById(id).addEventListener('input', calc); });
  ['k-transp', 'k-origine', 'k-carte'].forEach(function (id) { d.getElementById(id).addEventListener('change', calc); });
  f.addEventListener('submit', function (e) { e.preventDefault(); calc(); });
})();
