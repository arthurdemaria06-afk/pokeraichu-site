"""Excel POKE-RAICHU → modèle JSON de l'application de pilotage (schéma 1)."""
import openpyxl, json, re, sys, datetime

SRC = sys.argv[1] if len(sys.argv) > 1 else 'POKE-RAICHU.xlsx'
wf = openpyxl.load_workbook(SRC)
wv = openpyxl.load_workbook(SRC, data_only=True)

def num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None

def txt(v):
    if v is None: return None
    s = str(v).strip()
    return s or None

def ref_site(v):
    if isinstance(v, (int, float)): return '%03d' % int(v)
    return str(v).strip()

def date_iso(v):
    if isinstance(v, datetime.datetime): return v.date().isoformat()
    if isinstance(v, datetime.date): return v.isoformat()
    return None

def excel_string_after_last_substitute(f):
    """Requête eBay : chaîne littérale passée au SUBSTITUTE le plus profond."""
    if not isinstance(f, str) or 'HYPERLINK' not in f: return None
    i = f.rfind('SUBSTITUTE(')
    if i < 0: return None
    m = re.match(r'"((?:[^"]|"")*)"', f[i + len('SUBSTITUTE('):])
    return m.group(1).replace('""', '"') if m else None

# ------------------------------------------------------------------ paramètres
T = wf['Tickets']; V = wf['Ventes']; S = wf['Synthèse']
params = {
    'taux_jpy': num(T['B2'].value),
    'frais_vente': num(T['B3'].value) or 0,
    'tva_import': num(T['B4'].value) or 0,
    'rentabilite_estimee': num(T['B5'].value),
    'frais_envoi': num(V['B4'].value) or 0,
    'gardees_dans_totaux': (S['B9'].value or 'Avec') != 'Sans',
}
notes_params = {
    'taux_jpy': txt(T['C2'].value), 'frais_vente': txt(T['C3'].value), 'tva_import': txt(T['C4'].value),
    'rentabilite_estimee': txt(T['C5'].value), 'frais_envoi': txt(V['C4'].value),
}

# ------------------------------------------------------------------ tickets
tickets = []
r = 7
while T.cell(r, 1).value and re.fullmatch(r'T\d+', str(T.cell(r, 1).value)):
    e = T.cell(r, 5).value
    auto = isinstance(e, str) and 'ROUNDDOWN' in e
    tickets.append({
        'id': str(T.cell(r, 1).value),
        'boutique': txt(T.cell(r, 2).value),
        'date': date_iso(T.cell(r, 3).value),
        'total_yen': num(T.cell(r, 4).value),
        'detaxe_yen': None if auto else (num(e) or 0),
        'detaxe_auto': auto,
        'note': txt(T.cell(r, 10).value),
    })
    r += 1
ecartes = []
for r in range(48, T.max_row + 1):
    if T.cell(r, 2).value:
        ecartes.append({'libelle': txt(T.cell(r, 2).value), 'date': date_iso(T.cell(r, 3).value),
                        'total_yen': num(T.cell(r, 4).value), 'note': txt(T.cell(r, 10).value)})

# ------------------------------------------------------------------ lots (achats groupés)
L = wf['Lots PSA 10']
lots = []
lot_notes = {}
for r in range(2, 26):
    a = L.cell(r, 1).value
    if a == 'Total':
        lid = 'Lot %d' % (len(lots) + 1)
        lots.append({'id': lid, 'paye_yen': num(L.cell(r, 12).value), 'note': None})
    elif a and str(a).startswith('Lot'):
        m = re.search(r'MATCH\("([^"]+)"', str(L.cell(r, 3).value))
        if m and L.cell(r, 13).value:
            lot_notes[m.group(1)] = txt(L.cell(r, 13).value)

# ------------------------------------------------------------------ cartes
A = wf['Toutes les cartes']; Av = wv['Toutes les cartes']
hdr = [A.cell(1, c).value for c in range(1, 31)]
col = {h: i + 1 for i, h in enumerate(hdr)}
cartes = []
r = 2
while A.cell(r, 1).value not in (None, 'Total'):
    g = lambda h: A.cell(r, col[h]).value
    gv = lambda h: Av.cell(r, col[h]).value
    ref = ref_site(g('N°'))
    yen = num(g('Prix ticket (¥)'))
    sf = g('Payé (€)')
    if sf is None:
        achat = None
    elif isinstance(sf, (int, float)):
        achat = {'mode': 'eur', 'eur': sf}
    elif isinstance(sf, str) and sf.startswith('=M') and 'INDEX(Tickets' in sf:
        achat = {'mode': 'ticket', 'ticket': txt(g('Ticket'))}
    elif isinstance(sf, str) and re.fullmatch(r'=M\d+/Tickets!\$B\$2', sf):
        achat = {'mode': 'yen'}
    elif isinstance(sf, str) and 'Lots PSA 10' in sf:
        achat = {'mode': 'lot', 'lot': txt(g('Lot'))}
    else:
        achat = {'mode': 'eur', 'eur': round(gv('Payé (€)'), 2), 'formule': sf}
    remarque = txt(g('Remarque'))
    raw = str(g('N°'))
    if raw in lot_notes and (not remarque or lot_notes[raw] not in remarque):
        remarque = (remarque + ' · ' if remarque else '') + lot_notes[raw]
    lot_col = txt(g('Lot'))
    cartes.append({
        'ref': ref,
        'nom': txt(g('Pokémon')),
        'groupe': txt(g('Groupe')),
        'cat': txt(g('Catégorie')),
        'langue': txt(g('Langue')),
        'prix': num(g('Prix marché (€)')),
        'nom_en': txt(g('Nom anglais')),
        'set': txt(g('Set')),
        'rarete': txt(g('Rareté')),
        'etat': txt(g('État')),
        'nom_ticket': txt(g('Nom sur le ticket')),
        'yen': yen,
        'boutique': txt(g('Boutique')),
        'date_achat': date_iso(g('Date')),
        'ticket': txt(g('Ticket')),
        'verif': txt(g('Vérification')),
        'remarque': remarque,
        'achat': achat,
        'ebay': excel_string_after_last_substitute(g('eBay vendus')),
        'gardee': g('Gardée') == 'Oui',
        'vendu': g('Vendu') == 'Oui',
        'prix_vendu': num(g('Prix vendu (€)')),
        'vente_date': None,
        'canal': None,
        'lots_site': [lot_col] if lot_col and not lot_col.startswith('Lot ') else [],
        'alias_site': [],
        '_ligne': r,
    })
    r += 1

# ------------------------------------------------------------------ articles qu'Arthur n'a plus (retirés le 19/11/2026) : jamais réimportés
# coffret 30th Premium Deck (groupe « Coffret Premium Deck ») et Pikachu-ex 132/M-P (nuit) FUR
cartes = [c for c in cartes if c['groupe'] != 'Coffret Premium Deck' and not (c['ref'] == '290' and '132/M-P' in (c['nom'] or ''))]

# ------------------------------------------------------------------ correspondances avec les fiches du site
# lots du site qui regroupent des cartes de la compta
ALIAS = {}
LOTS_SITE = {'095': ['L01'], 'G4784': ['L01']}
for c in cartes:
    c['alias_site'] = ALIAS.get(c['ref'], [])
    for l in LOTS_SITE.get(c['ref'], []):
        if l not in c['lots_site']: c['lots_site'].append(l)

# ------------------------------------------------------------------ produits en quantité
CS = wf['Card sets 30 ans']; EX = wf['ex']; BO = wf['Boosters']
def vente_q(row):
    return {'vendus': num(V.cell(row, 2).value) or 0, 'prix_reel_moyen': num(V.cell(row, 10).value), 'envois': num(V.cell(row, 11).value)}
produits = [
    dict({'id': 'cardsets', 'nom': 'Card sets 30 ans (starters sous scellé)', 'libelle': '30 ans · card sets scellés', 'ordre': 4, 'refs_site': ['S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10'],
          'quantite': num(CS['B4'].value), 'prix_u': num(CS['B5'].value), 'paye_u': num(CS['B6'].value), 'frais_u': None,
          'ebay': [excel_string_after_last_substitute(CS['B13'].value), excel_string_after_last_substitute(CS['B14'].value)],
          'notes': [txt(CS['A2'].value), txt(CS['A16'].value), txt(CS['A17'].value)]}, **vente_q(22)),
    dict({'id': 'ex', 'nom': 'Cartes ex (ex basiques des tirages)', 'libelle': 'ex', 'ordre': 9,
          'quantite': num(EX['B4'].value), 'prix_u': num(EX['B5'].value), 'paye_u': num(EX['B6'].value), 'frais_u': None,
          'notes': [txt(EX['A2'].value), txt(EX['A13'].value)]}, **vente_q(23)),
    dict({'id': 'boosters', 'nom': "Boosters (displays vendus à l'unité en live Whatnot)", 'libelle': "Boosters (displays, vente à l'unité)", 'ordre': 10,
          'quantite': num(BO['B4'].value) * num(BO['B5'].value), 'displays': num(BO['B4'].value), 'par_display': num(BO['B5'].value),
          'prix_u': num(BO['B7'].value), 'paye_total': num(BO['B4'].value) * num(BO['B6'].value), 'paye_display': num(BO['B6'].value),
          'frais_u': num(BO['B7'].value) - num(BO['B8'].value),
          'notes': [txt(BO['C5'].value), txt(BO['C6'].value), txt(BO['C8'].value), txt(BO['A16'].value)]}, **vente_q(25)),
]
for p in produits:
    p['notes'] = [n for n in p['notes'] if n]

GROUPES = [
    {'id': 'Cartes', 'nom': 'Cartes (hors 30 ans)', 'ordre': 1},
    {'id': 'Lots PSA 10', 'nom': 'Lots PSA 10', 'ordre': 2},
    {'id': '30 ans', 'nom': '30 ans · cartes', 'ordre': 3},
    {'id': 'AR SR SAR', 'nom': 'AR SR SAR (photos)', 'ordre': 6},
    {'id': 'Cartes FR', 'nom': 'Cartes FR', 'ordre': 7},
    {'id': 'Classeur', 'nom': 'Classeur', 'ordre': 8},
]

modele = {
    'schema': 1,
    'meta': {
        'retraits': ['retrait-2026-11-19'],
        'app': 'Poké-Raichu · pilotage',
        'source': 'POKE-RAICHU-VF.xlsx',
        'importe_le': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
        'notes_excel': [txt(S.cell(r, 1).value) for r in range(55, 61) if S.cell(r, 1).value],
        'notes_params': notes_params,
    },
    'params': params,
    'groupes': GROUPES,
    'cartes': cartes,
    'tickets': tickets,
    'tickets_ecartes': ecartes,
    'lots': lots,
    'produits': produits,
    'journal': [],
}
lignes = {c['ref']: c.pop('_ligne') for c in cartes}
json.dump(lignes, open('lignes.json', 'w'))
json.dump(modele, open('modele.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print('cartes', len(cartes), 'tickets', len(tickets), 'lots', lots, 'produits', [p['id'] for p in produits])
print('params', params)
import collections
print(collections.Counter((c['achat'] or {}).get('mode') for c in cartes))
print('ebay manquant', sum(1 for c in cartes if not c['ebay']))
