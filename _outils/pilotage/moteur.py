"""Moteur de calcul de référence (Python) : mêmes règles que l'Excel. Sert à valider le modèle et le moteur JS."""
import json, math

def calcul(m):
    P = m['params']; taux = P['taux_jpy']; fv = P['frais_vente']; tva = P['tva_import']; rent = P['rentabilite_estimee']
    gardees = P['gardees_dans_totaux']
    tk = {}
    for t in m['tickets']:
        tot = t['total_yen'] or 0
        det = math.floor(tot * 10 / 110) if t['detaxe_auto'] else (t['detaxe_yen'] or 0)
        tk[t['id']] = dict(t, detaxe=det, paye_yen=tot - det, paye_eur=(tot - det) / taux, ratio=((tot - det) / tot) if tot else None)
    lots = {l['id']: dict(l, paye_eur=(l['paye_yen'] / taux) if l['paye_yen'] is not None else None) for l in m['lots']}
    for lid, l in lots.items():
        px = [c['prix'] for c in m['cartes'] if (c['achat'] or {}).get('mode') == 'lot' and c['achat'].get('lot') == lid and c['prix'] is not None]
        l['prix_total'] = sum(px) if px else None
    out = []
    for c in m['cartes']:
        a = c['achat'] or {}
        mode = a.get('mode'); paye = None
        if mode == 'ticket':
            t = tk.get(a.get('ticket'))
            paye = (c['yen'] or 0) * t['ratio'] / taux if t and t['ratio'] is not None else None
        elif mode == 'yen':
            paye = (c['yen'] or 0) / taux
        elif mode == 'lot':
            l = lots.get(a.get('lot'))
            paye = None if (c['prix'] is None or not l or not l['prix_total'] or l['paye_eur'] is None) else l['paye_eur'] * c['prix'] / l['prix_total']
        elif mode == 'eur':
            paye = a.get('eur')
        enc = (c['prix_vendu'] if c['prix_vendu'] is not None else c['prix']) if c['vendu'] else None
        est = None
        if paye is None:
            base = enc if c['vendu'] else c['prix']
            if base is not None: est = base * (1 - fv) / ((1 + tva) + rent)
        marge = c['prix'] * (1 - fv) - paye * (1 + tva) if (c['prix'] is not None and paye is not None) else None
        gain = (marge / paye) if (marge is not None and paye) else None
        bv = ((enc or 0) * (1 - fv) - ((paye or 0) + (est or 0)) * (1 + tva)) if c['vendu'] else None
        out.append(dict(ref=c['ref'], paye=paye, estime=est, marge=marge, gain=gain, encaisse=enc, benef=bv,
                        compte=(gardees or not c['gardee'])))
    R = {'cartes': out, 'tickets': tk, 'lots': lots}
    # produits
    comp = {}
    for p in m['produits']:
        if p.get('composants'):
            cs = [(c, o) for c, o in zip(m['cartes'], out) if c['groupe'] == p['composants']]
            px = [c['prix'] for c, o in cs if c['prix'] is not None]
            comp[p['id']] = dict(prix=sum(px) if px else None, paye=sum((o['paye'] or 0) for c, o in cs))
    def prod_vals(p):
        q = p['quantite'] or 0
        if p.get('composants'):
            valeur = comp[p['id']]['prix']; paye = comp[p['id']]['paye']; pu = paye; prix_u = valeur
        else:
            prix_u = p['prix_u']; valeur = q * (prix_u or 0)
            if p.get('paye_total') is not None: paye = p['paye_total']; pu = paye / q if q else None
            else: pu = p['paye_u']; paye = q * (pu or 0)
        if p.get('frais_u') is not None:
            marge = q * ((prix_u or 0) - p['frais_u']) - paye
        elif p.get('composants'):
            marge = (valeur * (1 - fv) - paye * (1 + tva)) if valeur is not None else None
        else:
            marge = (valeur * (1 - fv) - paye * (1 + tva)) if (p.get('paye_u') is not None or p.get('paye_total') is not None) else None
        return dict(nb=q, paye=paye, valeur=valeur, marge=marge, prix_u=prix_u, paye_unitaire=pu)
    R['produits'] = {p['id']: prod_vals(p) for p in m['produits']}
    # synthèse
    syn = []
    gs = [g for g in m['groupes'] if not g.get('hors_totaux')]
    order = ['Cartes', 'Lots PSA 10', '30 ans', 'cardsets', 'AR SR SAR', 'Cartes FR', 'Classeur', 'ex', 'boosters']
    for k in order:
        if k in R['produits']:
            v = R['produits'][k]
            syn.append(dict(cle=k, nb=v['nb'], paye=v['paye'], valeur=v['valeur'], marge=v['marge'],
                            gain=(v['marge'] / v['paye']) if (v['marge'] is not None and v['paye']) else None))
        else:
            rows = [(c, o) for c, o in zip(m['cartes'], out) if c['groupe'] == k and o['compte']]
            nb = len(rows); paye = sum(o['paye'] or 0 for c, o in rows); valeur = sum(c['prix'] or 0 for c, o in rows)
            marge = sum(o['marge'] or 0 for c, o in rows)
            den = sum(o['paye'] or 0 for c, o in rows if c['prix'] is not None)
            syn.append(dict(cle=k, nb=nb, paye=paye, valeur=valeur, marge=marge, gain=(marge / den) if den else None))
    tot = dict(cle='TOTAL', nb=sum(x['nb'] for x in syn), paye=sum(x['paye'] or 0 for x in syn), valeur=sum(x['valeur'] or 0 for x in syn),
               marge=sum(x['marge'] or 0 for x in syn))
    tot['gain'] = tot['marge'] / tot['paye'] if tot['paye'] else None
    R['synthese'] = syn + [tot]
    # ventes
    ven = []
    for k in ['Cartes', '30 ans', 'AR SR SAR', 'Cartes FR', 'Lots PSA 10', 'Classeur']:
        rows = [(c, o) for c, o in zip(m['cartes'], out) if c['groupe'] == k]
        vd = [(c, o) for c, o in rows if c['vendu']]
        enc = sum(o['encaisse'] or 0 for c, o in vd)
        paye = (sum(o['paye'] or 0 for c, o in vd) + sum(o['estime'] or 0 for c, o in vd)) * (1 + tva)
        env = len(vd) * P['frais_envoi']
        b = enc - enc * fv - paye - env
        ven.append(dict(cle=k, vendus=len(vd), stock=len(rows) - len(vd), encaisse=enc, frais=enc * fv, paye=paye, envoi=env, benef=b,
                        rentab=(b / paye) if paye else None, estime=sum(o['estime'] or 0 for c, o in vd) * (1 + tva)))
    for p in m['produits']:
        v = R['produits'][p['id']]; n = p.get('vendus') or 0
        enc = n * (p['prix_reel_moyen'] if p.get('prix_reel_moyen') is not None else (v['prix_u'] or 0))
        frais = n * p['frais_u'] if p.get('frais_u') is not None else enc * fv
        paye = n * (v['paye_unitaire'] or 0) * (1 if p.get('frais_u') is not None else (1 + tva))
        env = (p['envois'] if p.get('envois') is not None else n) * P['frais_envoi']
        b = enc - frais - paye - env
        ven.append(dict(cle=p['id'], vendus=n, stock=(p['quantite'] or 0) - n, encaisse=enc, frais=frais, paye=paye, envoi=env, benef=b,
                        rentab=(b / paye) if paye else None, estime=0))
    tv = {k: sum(x[k] for x in ven) for k in ['vendus', 'stock', 'encaisse', 'frais', 'paye', 'envoi', 'benef', 'estime']}
    tv['rentab'] = tv['benef'] / tv['paye'] if tv['paye'] else None
    R['ventes'] = ven + [dict(cle='TOTAL', **tv)]
    return R

if __name__ == '__main__':
    m = json.load(open('modele.json'))
    R = calcul(m)
    for x in R['synthese']: print('SYN', x)
    for x in R['ventes']: print('VEN', {k: (round(v, 4) if isinstance(v, float) else v) for k, v in x.items()})
