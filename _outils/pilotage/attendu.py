"""Sortie du moteur Python de référence (attendu.json), comparée au moteur JS par test_calcul.js."""
import json
from moteur import calcul
m = json.load(open('modele.json')); R = calcul(m)
json.dump({'cartes': R['cartes'], 'synthese': R['synthese'], 'ventes': R['ventes'],
           'tickets': {k: {'detaxe': v['detaxe'], 'paye_yen': v['paye_yen'], 'paye_eur': v['paye_eur']} for k, v in R['tickets'].items()},
           'lots': {k: {'paye_eur': v['paye_eur'], 'prix_total': v['prix_total']} for k, v in R['lots'].items()}}, open('attendu.json', 'w'))
