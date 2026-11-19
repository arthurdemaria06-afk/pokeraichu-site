# -*- coding: utf-8 -*-
"""Poké-Raichu · retirer définitivement des fiches du site (cartes qu'on n'a plus), partout :
pages FR et EN, photos, vignettes de toutes les pages, encadrés « aussi en lot », rubriques devenues vides,
listes JSON-LD, compteurs (accueil, catalogue, collections, Pokémon, extensions, filtres du catalogue),
pages Pokémon ou extension devenues vides, index de recherche, sitemap, données (stock.json, ebay.json),
liens courts /r/ et /s/ et anciennes adresses redirigés vers la collection la plus proche.

Usage : python3 _outils/retirer.py <racine> <ref> [<ref>...]
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import modifier as M  # noqa: E402

TILE = M.TILE
SITE_URL = 'https://pokeraichu.com/'


def qty(tile):
    m = re.search(r'data-qty="(\d+)"', tile)
    return int(m.group(1)) if m else 0


def attrs(tile):
    head = re.match(r'<li class="tile" [^>]*>', tile).group(0)
    return dict(re.findall(r'(data-[\w-]+)="([^"]*)"', head))


def plural(n, mot):
    return '%d %s%s' % (n, mot, 's' if n > 1 else '')


def main(root, refs):
    R = set(refs)
    site = M.Site(root)
    st = json.load(open(os.path.join(root, 'data/stock.json'), encoding='utf-8'))
    cartes = [c for c in st['cartes'] if c['ref'] in R]
    manquantes = R - set(c['ref'] for c in cartes)
    if manquantes:
        print('Introuvables dans stock.json :', ', '.join(sorted(manquantes)))
    # pages supprimées et collection de repli (redirections)
    supprimees = {}   # rel -> cible de redirection (rel)
    for c in cartes:
        cols = c.get('collections') or []
        coll = 'pikachu' if 'pikachu' in cols else ('raichu' if 'raichu' in cols else ('30th-celebration' if '30th-celebration' in cols else None))
        en_coll = {'pikachu': 'pikachu', 'raichu': 'raichu', '30th-celebration': '30th-celebration'}.get(coll)
        cible_fr = 'collections/%s.html' % coll if coll else 'catalogue.html'
        cible_en = 'en/collections/%s.html' % en_coll if en_coll else 'en/catalogue.html'
        supprimees[M.page_of(c, 'fr')] = cible_fr
        supprimees[M.page_of(c, 'en')] = cible_en
        c['_cible'] = (cible_fr, cible_en)
    total_fiches = len(cartes)
    total_unites = sum(int(c.get('quantite') or 0) for c in cartes)

    pages = [p for p in site.pages() if p not in supprimees]
    retires = {}      # rel -> (tuiles retirées, unités)
    tuiles_catalogue = {}  # rel -> [attributs des tuiles retirées]

    def resoudre(rel, href):
        href = href.split('#')[0].split('?')[0]
        if not href or re.match(r'^[a-z]+:', href):
            if href.startswith(SITE_URL):
                return href[len(SITE_URL):]
            return None
        if href.startswith('/'):
            return href.lstrip('/')
        return os.path.normpath(os.path.join(os.path.dirname(rel), href)).replace(os.sep, '/')

    # 1. vignettes, encadrés de lot, options, JSON-LD, liens restants
    for rel in pages:
        s = site.rd(rel)
        o = s
        k, u, at = 0, 0, []

        def sub_tile(mt):
            nonlocal k, u
            t = mt.group(0)
            if M._ref_of(t) in R:
                k += 1
                u += qty(t)
                at.append(attrs(t))
                return ''
            return t
        s = TILE.sub(sub_tile, s)
        for ref in R:
            s = re.sub(r'<li class="pocket" data-ref="%s">.*?</li>' % re.escape(ref), '', s, flags=re.S)
            s = re.sub(r'<option value="%s"[^>]*>[^<]*</option>' % re.escape(ref), '', s)

        # lots : références vers des lots retirés
        def sub_lots(mt):
            reste = [x for x in mt.group(2).split() if x not in R]
            return (' %s="%s"' % (mt.group(1), ' '.join(reste))) if reste else ''
        s = re.sub(r' (data-in-lots|data-parts)="([^"]*)"', sub_lots, s)

        # encadrés qui renvoient vers une page retirée
        def sub_callout(mt):
            for h in re.findall(r'href="([^"]*)"', mt.group(0)):
                if resoudre(rel, h) in supprimees:
                    return ''
            return mt.group(0)
        s = re.sub(r'<div class="callout">(?:(?!</div>).)*</div>\n?', sub_callout, s, flags=re.S)

        # listes JSON-LD
        def sub_ld(mt):
            try:
                data = json.loads(mt.group(2))
            except ValueError:
                return mt.group(0)
            if not isinstance(data, dict) or data.get('@type') != 'ItemList' or 'itemListElement' not in data:
                return mt.group(0)
            items = [x for x in data['itemListElement'] if not (isinstance(x, dict) and resoudre(rel, x.get('url', '')) in supprimees)]
            if len(items) == len(data['itemListElement']):
                return mt.group(0)
            for i, x in enumerate(items, 1):
                x['position'] = i
            data['itemListElement'] = items
            if 'numberOfItems' in data:
                data['numberOfItems'] = len(items)
            return mt.group(1) + json.dumps(data, ensure_ascii=False).replace('</', '<\\/') + mt.group(3)
        s = re.sub(r'(<script type="application/ld\+json">)(.*?)(</script>)', sub_ld, s, flags=re.S)

        # rubriques « related » devenues vides
        def sub_section(mt):
            t = mt.group(0)
            return '' if ('<ul class="grid' in t and '<li class="tile"' not in t) else t
        s = re.sub(r'<section class="section related"[^>]*>.*?</section>\n?', sub_section, s, flags=re.S)

        if k:
            retires[rel] = (k, u)
            if rel in ('catalogue.html', 'en/catalogue.html'):
                tuiles_catalogue[rel] = at
        if s != o:
            site.wr(rel, s)

    # 2. pages Pokémon / extensions devenues vides : supprimées aussi
    vides = {}
    for rel, (k, u) in retires.items():
        if rel.startswith(('pokemon/', 'en/pokemon/', 'extensions/', 'en/sets/')) and not TILE.search(site.rd(rel)):
            vides[rel] = 'collections.html' if not rel.startswith('en/') else 'en/collections.html'
    supprimees.update(vides)

    # 3. compteurs
    def recompte(s, k, u):
        """« N fiches, M articles », « N fiches · M articles », « N listings, M items » : on retire k fiches et u articles."""
        return re.sub(r'(?<![\d.,])(\d+) (fiches?|listings?)(, | · )(\d+) (articles?|items?)\b',
                      lambda m: '%s%s%s' % (plural(int(m.group(1)) - k, m.group(2).rstrip('s')), m.group(3), plural(int(m.group(4)) - u, m.group(5).rstrip('s'))), s)

    def compte(s, rel):
        """Pages Pokémon et extensions, d'après les vignettes restantes : « N fiches … », numberOfItems,
        fourchette de prix et, pour une extension, la liste des Pokémon."""
        n = len(TILE.findall(s))
        s = re.sub(r'(?<![\d.,])(\d+) (fiches?|listings?)\b(?!(, | · )\d)', lambda m: plural(n, m.group(2).rstrip('s')), s)
        s = re.sub(r'("numberOfItems": )\d+', lambda m: m.group(1) + str(n), s)
        prix = sorted(float(x) for x in re.findall(r'<li class="tile" [^>]*?data-price="([\d.]+)"', s) if float(x) > 0)
        if not prix:  # plus que des cartes « sur demande » : la fourchette de prix disparaît
            s = re.sub(r', \d[\d\u202f]*(?:,\d+)?\u202f€(?: à \d[\d\u202f]*(?:,\d+)?\u202f€)?(?=[.<"])', '', s)
            s = re.sub(r', €[\d,]+(?:\.\d+)?(?: to €[\d,]+(?:\.\d+)?)?(?=[.<"])', '', s)
        if prix:
            a, b = prix[0], prix[-1]
            fr = (M.fiche.eur_fr(a) if a == b else '%s à %s' % (M.fiche.eur_fr(a), M.fiche.eur_fr(b)))
            en = (M.fiche.eur_en(a) if a == b else '%s to %s' % (M.fiche.eur_en(a), M.fiche.eur_en(b)))
            s = re.sub(r'\d[\d\u202f]*(?:,\d+)?\u202f€ à \d[\d\u202f]*(?:,\d+)?\u202f€', lambda m: fr, s)
            s = re.sub(r'€[\d,]+(?:\.\d+)? to €[\d,]+(?:\.\d+)?', lambda m: en, s)
        if rel.startswith(('extensions/', 'en/sets/')):
            pk = []
            for v in re.findall(r'<li class="tile" [^>]*?data-pk="([^"]*)"', s):
                pk += [x for x in v.split('|') if x and x not in pk]
            if pk:
                liste = ', '.join(sorted(pk, key=M.low))
                s = re.sub(r'(en stock\u202f: |in stock: )[^.<"]*\.', lambda m: m.group(1) + liste + '.', s)
        return s

    for rel, (k, u) in retires.items():
        if rel in vides:
            continue
        if rel.startswith(('pokemon/', 'en/pokemon/', 'extensions/', 'en/sets/')):
            site.wr(rel, compte(site.rd(rel), rel))
        elif rel.startswith(('collections/', 'en/collections/')):
            site.wr(rel, recompte(site.rd(rel), k, u))

    # totaux de l'accueil et du catalogue
    for rel in ('index.html', 'en/index.html', 'catalogue.html', 'en/catalogue.html'):
        if site.exists(rel):
            s = site.rd(rel)
            s = re.sub(r'(?<![\d.,])(\d+) (fiches?|listings?)(, | · )(\d+) (articles?|items?)\b',
                       lambda m: '%s%s%s' % (plural(int(m.group(1)) - total_fiches, m.group(2).rstrip('s')), m.group(3), plural(int(m.group(4)) - total_unites, m.group(5).rstrip('s'))), s)
            s = re.sub(r'(?<![\d.,])%d (fiches|listings)\b' % st['meta']['nb_fiches'],
                       lambda m: plural(st['meta']['nb_fiches'] - total_fiches, m.group(1).rstrip('s')), s)
            site.wr(rel, s)

    # pastilles et cartes de collection qui pointent vers une page modifiée
    for rel in [p for p in pages if p not in supprimees]:
        s = site.rd(rel)
        o = s

        def sub_chip(mt):
            cible = resoudre(rel, mt.group(2))
            if cible in vides:
                return ''
            if cible in retires:
                return mt.group(1) + str(len(TILE.findall(site.rd(cible)))) + mt.group(4)
            return mt.group(0)
        s = re.sub(r'<li>(<a class="chip" href="([^"]*)">[^<]*<span class="muted">)(\d+)(</span></a>)</li>',
                   lambda mt: (lambda r: r if r == '' else '<li>' + r + '</li>')(sub_chip(mt)), s)

        def sub_coll(mt):
            cible = resoudre(rel, mt.group(1))
            if cible not in retires:
                return mt.group(0)
            k, u = retires[cible]
            return mt.group(0)[:mt.start(2) - mt.start(0)] + recompte(mt.group(2), k, u) + mt.group(0)[mt.end(2) - mt.start(0):]
        s = re.sub(r'<a class="coll[^"]*" href="([^"]*)">(?:(?!</a>).)*?<span class="coll__count">([^<]*)</span>', sub_coll, s, flags=re.S)
        if s != o:
            site.wr(rel, s)

    # filtres du catalogue (langue, état, extension, Pokémon)
    for rel, L in tuiles_catalogue.items():
        s = site.rd(rel)
        for sel, cle in (('f-lang', 'data-lang'), ('f-grade', 'data-grade'), ('f-ext', 'data-ext'), ('f-pk', 'data-pk')):
            moins = {}
            for a in L:
                vals = [x for x in a.get(cle, '').split('|') if x] if cle == 'data-pk' else [a.get(cle, '')]
                for v in vals:
                    moins[v] = moins.get(v, 0) + 1
            m = re.search(r'(<select class="select" id="%s"[^>]*>)(.*?)(</select>)' % sel, s, re.S)
            if not m:
                continue

            def sub_opt(mo):
                v = mo.group(1)
                brut = v.replace('&amp;', '&').replace('&#x27;', "'")
                d = moins.get(v) or moins.get(brut) or 0
                if not d:
                    return mo.group(0)
                mm = re.match(r'(.*) \((\d+)\)$', mo.group(3), re.S)
                if not mm:
                    return mo.group(0)
                n = int(mm.group(2)) - d
                return '' if n <= 0 else '<option value="%s"%s>%s (%d)</option>' % (v, mo.group(2), mm.group(1), n)
            corps = re.sub(r'<option value="([^"]*)"([^>]*)>(.*?)</option>', sub_opt, m.group(2))
            s = s[:m.start(2)] + corps + s[m.end(2):]
        site.wr(rel, s)

    # 4. liens restants vers une page retirée : le texte reste, le lien part
    restes = []
    for rel in [p for p in pages if p not in supprimees]:
        s = site.rd(rel)

        def sub_a(mt):
            if resoudre(rel, mt.group(1)) in supprimees:
                restes.append((rel, mt.group(1)))
                return mt.group(2)
            return mt.group(0)
        s2 = re.sub(r'<a [^>]*?href="([^"]*)"[^>]*>(.*?)</a>', sub_a, s, flags=re.S)
        if s2 != s:
            site.wr(rel, s2)
    n = site.flush()

    # 5. fichiers supprimés : pages et photos
    effaces = 0
    for rel in supprimees:
        p = os.path.join(root, rel)
        if os.path.exists(p):
            os.remove(p)
            effaces += 1
    photos = 0
    for c in cartes:
        d = os.path.join(root, 'assets/photos')
        for f in os.listdir(d):
            if f.startswith(c['slug'] + '-'):
                os.remove(os.path.join(d, f))
                photos += 1

    # 6. sitemap
    sm = os.path.join(root, 'sitemap.xml')
    s = open(sm, encoding='utf-8').read()
    urls = set(SITE_URL + r for r in supprimees)
    s = re.sub(r'<url><loc>([^<]*)</loc>.*?</url>\n?', lambda m: '' if m.group(1) in urls else m.group(0), s, flags=re.S)
    open(sm, 'w', encoding='utf-8', newline='').write(s)

    # 7. redirections : liens courts des étiquettes et anciennes adresses
    rd = os.path.join(root, '_redirects')
    s = open(rd, encoding='utf-8').read()
    for c in cartes:
        fr, en = c['_cible']
        for ref in {c['ref'], c['ref'].lower()}:
            s = re.sub(r'^/r/%s\s.*$' % re.escape(ref), '/r/%s  /%s  302' % (ref, fr), s, flags=re.M)
            s = re.sub(r'^/en/r/%s\s.*$' % re.escape(ref), '/en/r/%s  /%s  302' % (ref, en), s, flags=re.M)
            s = re.sub(r'^/s/%s\s.*$' % re.escape(ref), '/s/%s  /%s  302' % (ref, fr), s, flags=re.M)
    ajout = ['/%s  /%s  301' % (rel, cible) for rel, cible in sorted(supprimees.items()) if ('/%s ' % rel) not in s]
    if ajout:
        s = s.rstrip('\n') + '\n# Fiches retirées (cartes qu’on n’a plus) : vers la collection la plus proche\n' + '\n'.join(ajout) + '\n'
    open(rd, 'w', encoding='utf-8', newline='').write(s)

    # 8. données : stock.json, index de recherche, ebay.json
    tx = st.get('taxonomies', {})
    for c in cartes:
        q = int(c.get('quantite') or 0)
        for t in tx.get('categories', []):
            if t['slug'] == c.get('categorie'):
                t['fiches'] -= 1; t['unites'] -= q
        for t in tx.get('langues', []):
            if t['code'] == c.get('langue'):
                t['unites'] -= q
        ex = c.get('extension') or {}
        for t in tx.get('extensions', []):
            if t.get('code') == ex.get('code') and t.get('nom') == ex.get('nom'):
                t['fiches'] -= 1
        for t in tx.get('pokemons', []):
            if t['nom'] in (c.get('pokemons') or []):
                t['fiches'] -= 1
        for t in tx.get('collections', []):
            if t['slug'] in (c.get('collections') or []):
                t['fiches'] -= 1; t['unites'] -= q
    for k in ('categories', 'extensions', 'pokemons', 'collections'):
        if k in tx:
            tx[k] = [t for t in tx[k] if t.get('fiches', 1) > 0]
    if 'langues' in tx:
        tx['langues'] = [t for t in tx['langues'] if t.get('unites', 1) > 0]
    st['cartes'] = [c for c in st['cartes'] if c['ref'] not in R]
    st['meta']['nb_fiches'] = len(st['cartes'])
    st['meta']['nb_unites'] = sum(int(c.get('quantite') or 0) for c in st['cartes'])
    st['parties'] = [x for x in st.get('parties') or [] if x.get('ref') not in R]
    json.dump(st, open(os.path.join(root, 'data/stock.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    for lang in ('fr', 'en'):
        p = os.path.join(root, 'data/recherche-%s.json' % lang)
        rech = json.load(open(p, encoding='utf-8'))
        rech['cartes'] = [row for row in rech['cartes'] if row[0] not in supprimees and ('en/' + row[0]) not in supprimees]
        json.dump(rech, open(p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    pe = os.path.join(root, 'data/ebay.json')
    if os.path.exists(pe):
        eb = json.load(open(pe, encoding='utf-8'))
        for ref in R:
            (eb.get('recherches') or {}).pop(ref, None)
        json.dump(eb, open(pe, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    M.versions(root)

    print('%d pages modifiées, %d pages supprimées, %d photos supprimées' % (n, effaces, photos))
    print('Pages vidées et supprimées :', ', '.join(sorted(vides)) or 'aucune')
    for rel, href in restes:
        print('Lien retiré (texte gardé) :', rel, '→', href)


if __name__ == '__main__':
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2:])
