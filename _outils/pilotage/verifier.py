import json, openpyxl, math
from moteur import calcul
m = json.load(open('modele.json')); R = calcul(m)
LIG = json.load(open('lignes.json'))
wv = openpyxl.load_workbook(__import__('sys').argv[1] if len(__import__('sys').argv) > 1 else 'POKE-RAICHU.xlsx', data_only=True)
A = wv['Toutes les cartes']
def eq(a, b, tol=1e-6):
    if a in (None, '') and b in (None, ''): return True
    if a in (None, '') or b in (None, ''): return False
    return abs(float(a) - float(b)) <= tol * max(1, abs(float(b)))
bad = 0
for c, o in zip(m['cartes'], R['cartes']):
    r = LIG[c['ref']]
    for col, k in [(19, 'paye'), (20, 'estime'), (7, 'marge'), (22, 'gain'), (29, 'encaisse'), (27, 'benef')]:
        x = A.cell(r, col).value
        if not eq(o[k], x):
            bad += 1
            if bad < 20: print('ÉCART carte', c['ref'], k, o[k], 'excel', x)
print('cartes : écarts', bad)
T = wv['Tickets']
tb = 0
for i, t in enumerate(m['tickets']):
    r = 7 + i; x = R['tickets'][t['id']]
    nb = sum(1 for c in m['cartes'] if c['ticket'] == t['id'])
    somme = sum((c['yen'] or 0) for c in m['cartes'] if c['ticket'] == t['id'])
    ctrl = 'OK' if somme == t['total_yen'] else 'Écart'
    for got, col in [(x['detaxe'], 5), (x['paye_yen'], 6), (x['paye_eur'], 7), (nb, 8)]:
        if not eq(got, T.cell(r, col).value): tb += 1; print('ÉCART ticket', t['id'], col, got, T.cell(r, col).value)
    if ctrl != T.cell(r, 9).value: tb += 1; print('ÉCART contrôle', t['id'], ctrl, T.cell(r, 9).value)
print('tickets : écarts', tb)
# totaux tickets
G41 = sum(v['paye_eur'] for v in R['tickets'].values())
hors = ('Lots PSA 10', 'Coffret Premium Deck')
sans = [(c, o) for c, o in zip(m['cartes'], R['cartes']) if c['ticket'] == 'Sans ticket' and c['groupe'] not in hors]
G42 = sum(o['paye'] or 0 for c, o in sans) + (R['produits'].get('coffret') or {}).get('paye', 0)  # coffret retiré le 19/11 : écart attendu en G42
G44 = sum(o['paye'] or 0 for c, o in zip(m['cartes'], R['cartes']) if c['groupe'] not in hors)
for got, cell in [(G41, 'G41'), (G42, 'G42'), (G41 + G42, 'G43'), (G44, 'G44'), (len(sans) + 1, 'H42')]:
    print(cell, round(got, 6), T[cell].value, 'OK' if eq(got, T[cell].value) else 'ÉCART')
L = wv['Lots PSA 10']
for i, l in enumerate(m['lots']):
    r = 5 + 5 * i; x = R['lots'][l['id']]
    print(l['id'], 'prix', x['prix_total'], L.cell(r, 3).value, 'payé', round(x['paye_eur'], 4), round(L.cell(r, 4).value, 4))
syn = wv['Synthèse']
for i, x in enumerate(R['synthese']):
    r = 12 + i if i < 10 else 22
    vals = [syn.cell(r, c).value for c in range(2, 7)]
    ok = all(eq(a, b) for a, b in zip([x['nb'], x['paye'], x['valeur'], x['marge'], x['gain']], vals))
    if not ok: print('ÉCART synthèse', x['cle'], [x['nb'], x['paye'], x['valeur'], x['marge'], x['gain']], vals)
print('synthèse vérifiée')
ven = wv['Ventes']
rowsV = [15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26]
for x, r in zip(R['ventes'], rowsV):
    vals = [ven.cell(r, c).value for c in (2, 3, 4, 5, 6, 7, 8, 9)]
    got = [x['vendus'], x['stock'], x['encaisse'], x['frais'], x['paye'], x['envoi'], x['benef'], x['rentab']]
    ok = all(eq(a, b) or (r in (22, 23, 24, 25) and i == 0) for i, (a, b) in enumerate(zip(got, vals)))
    if not ok: print('ÉCART ventes', x['cle'], got, vals)
print('ventes vérifiées')
