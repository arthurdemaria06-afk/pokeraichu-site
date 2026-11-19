# -*- coding: utf-8 -*-
"""Poké-Raichu · construction du site par Cloudflare (a chaque commit).

1. Ajoute au site les cartes enregistrees depuis la page de gestion (_ajouts/cartes.json et _ajouts/photos/),
   avec leurs vraies pages FR et EN.
2. Reporte les modifications de fiches enregistrees depuis la page de gestion (_ajouts/modifs.json : nom, etat,
   Pokemon), sur les cartes du depot comme sur les cartes ajoutees (voir modifier.py).
3. Retire les fichiers de travail du site publie.
Sans ajout ni modification, le site est publie tel quel. Relancable : il part toujours des fichiers du depot.
"""
import datetime, hashlib, io, json, os, re, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fiche  # noqa: E402
from fiche import esc, slugify, low  # noqa: E402

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..'))
KEEP_WORK = '--garder' in sys.argv
AJ = os.path.join(ROOT, '_ajouts', 'cartes.json')
TODAY = datetime.date.today()

ETAT_EN = {'Near Mint': 'Near Mint', 'Excellent': 'Excellent', 'Très bon état': 'Very good', 'Bon état': 'Good', 'Abîmée': 'Played'}
RAR_EN = {'Réédition 30 ans': '30th Anniversary reprint', 'Commune': 'Common', 'Peu commune': 'Uncommon', 'Chromatique': 'Shiny'}
RAR_CAT = {'SAR': 'sar', 'SR': 'sr', 'CHR': 'sr', 'AR': 'ar', 'Full art': 'ar', 'FUR': 'fur', 'Réédition 30 ans': 'reeditions-30', 'Promo': 'promos'}
LANG_COLL = {'JP': 'japon', 'KR': 'coree', 'FR': 'france'}
GRADERS = ('PSA', 'PCA', 'CGC', 'BGS', 'SGC', 'CCC')


def P(*a):
    return os.path.join(ROOT, *a)


def rd(rel):
    return open(P(rel), encoding='utf-8').read()


def wr(rel, s):
    with open(P(rel), 'w', encoding='utf-8', newline='') as f:
        f.write(s)


def h8(rel, algo='md5'):
    return getattr(hashlib, algo)(open(P(rel), 'rb').read()).hexdigest()[:8]


def clean_text(v, n=80):
    v = re.sub(r'[\x00-\x1f<>"]', ' ', str(v or ''))
    return re.sub(r'\s+', ' ', v).strip()[:n]


# ------------------------------------------------------------------ lecture et controle des ajouts
def load_raw():
    if not os.path.exists(AJ):
        return []
    data = json.load(open(AJ, encoding='utf-8'))
    out = []
    for r in data.get('cartes', []):
        try:
            out.append(check(r))
        except Exception as e:  # une carte mal remplie ne bloque jamais le site
            print('carte ignoree (%s) : %s' % (r.get('ref'), e))
    return out


def check(r):
    ref = str(r['ref'])
    assert re.fullmatch(r'\d{3,5}|L\d{2}', ref), 'reference'  # L.. : lot
    nom = clean_text(r['nom_fr'])
    numero = clean_text(r.get('numero'), 20)
    # carte ancienne sans numero de collection : la variante (« Neo Genesis, dos ancien ») complete le titre
    variante = clean_text(r.get('variante'), 60) or None
    assert nom and (numero or variante), 'nom ou numero vide'
    ask = bool(r.get('prix_sur_demande')) and r.get('prix_eur') in (None, '', 0)
    if ask:
        prix = None
    else:
        prix = float(r['prix_eur'])
        assert 0 < prix < 100000, 'prix'
    q = int(r.get('quantite') or 1)
    assert 1 <= q <= 99, 'quantite'
    lang = r.get('langue', 'JP')
    assert lang in fiche.LANG, 'langue'
    ext = r['extension']
    code, enom = clean_text(ext['code'], 20), clean_text(ext['nom'], 60)
    assert code and enom, 'extension'
    e = r['etat']
    if e.get('type') in GRADERS:
        note = clean_text(e.get('note'), 6).replace(',', '.')
        assert re.fullmatch(r'\d{1,2}(\.\d)?', note), 'note'
        cert = re.sub(r'\D', '', str(e.get('cert') or ''))[:12] or None
        etat = {'type': e['type'], 'note': note, 'cert': cert, 'libelle': '%s %s' % (e['type'], note), 'a_signaler': False}
    else:
        lib = e.get('libelle') if e.get('libelle') in ETAT_EN else 'Near Mint'
        etat = {'type': 'brute', 'note': None, 'cert': None, 'libelle': lib, 'a_signaler': False}
    n = int(r.get('photos') or 0)
    assert 1 <= n <= 4, 'photos'
    for i in range(1, n + 1):
        assert os.path.exists(P('_ajouts', 'photos', '%s-%d.jpg' % (ref, i))), 'photo %d manquante' % i
    pks = [clean_text(p, 40) for p in r.get('pokemons', []) if clean_text(p, 40)][:4]
    pks_en = [clean_text(p, 40) for p in r.get('pokemons_en', []) if clean_text(p, 40)][:4]
    if len(pks_en) != len(pks):
        pks_en = list(pks)
    rar = clean_text(r.get('rarete'), 30) or None
    cat = r.get('categorie') if r.get('categorie') in ('vintage', 'ar', 'sar', 'sr', 'fur', 'promos', 'autres', 'reeditions-30') else None
    return {'ref': ref, 'nom_fr': nom, 'nom_en': clean_text(r.get('nom_en')) or nom, 'numero': numero or None, 'prix_eur': prix, 'quantite': q,
            'langue': lang, 'extension': {'code': code, 'nom': enom}, 'etat': etat, 'photos': n, 'pokemons': pks, 'pokemons_en': pks_en,
            'rarete': rar, 'ajoute_le': str(r.get('ajoute_le') or TODAY.isoformat())[:10], 'prix_sur_demande': ask,
            'variante': variante, 'variante_en': clean_text(r.get('variante_en'), 60) or variante,
            'edition': clean_text(r.get('edition'), 30) or None, 'edition_en': clean_text(r.get('edition_en'), 30) or None,
            'rarete_en': clean_text(r.get('rarete_en'), 30) or None, 'categorie': cat, 'nouveau': r.get('nouveau', True) is not False}


# ------------------------------------------------------------------ fiche complete au format de stock.json
def complete(r, used_fr, used_en, batch, sel):
    slab = r['etat']['type'] != 'brute'

    def mk(nom, used, suite):
        b = slugify(nom + ' ' + suite)
        if r['langue'] != 'JP':
            b += '-' + r['langue'].lower()
        if slab:
            b += '-' + slugify(r['etat']['libelle']) + ('-' + r['etat']['cert'][-4:] if r['etat']['cert'] else '')
        s = b if b not in used else b + '-' + r['ref']
        used.add(s)
        return s

    slug = mk(r['nom_fr'], used_fr, r['numero'] or r['variante'])
    slug_en = mk(r['nom_en'], used_en, r['numero'] or r['variante_en'])
    rar = r['rarete']
    cat = 'gradees' if slab else r.get('categorie') or RAR_CAT.get(rar, 'autres')
    titre = r['nom_fr'] + ' ' + r['numero'] if r['numero'] else '%s (%s)' % (r['nom_fr'], r['variante'])
    titre_en = r['nom_en'] + ' ' + r['numero'] if r['numero'] else '%s (%s)' % (r['nom_en'], r['variante_en'])
    colls = []
    if re.search(r'30th|30e anniversaire', r['extension']['nom'], re.I):
        colls.append('30th-celebration')
    if slab:
        colls.append('gradees')
    if r['langue'] in LANG_COLL:
        colls.append(LANG_COLL[r['langue']])
    for p, s in (('Pikachu', 'pikachu'), ('Raichu', 'raichu')):
        if p in r['pokemons']:
            colls.append(s)
    lib = r['etat']['libelle']
    c = {'ref': r['ref'], 'slug': slug, 'type': 'slab' if slab else 'carte', 'titre': titre, 'nom_fr': r['nom_fr'],
         'nom_en': r['nom_en'], 'numero': r['numero'], 'sous_numero': None, 'variante': None if r['numero'] else r['variante'],
         'edition': r.get('edition'), 'pokemons': r['pokemons'],
         'extension': r['extension'], 'rarete': rar, 'categorie': cat, 'collections': colls, 'langue': r['langue'], 'etat': r['etat'],
         'quantite': r['quantite'], 'prix_eur': r['prix_eur'], 'prix_sur_demande': bool(r.get('prix_sur_demande')), 'nouveau': r.get('nouveau', True), 'phare_rang': None,
         'photo': 'assets/photos/%s-1-800.webp' % slug,
         'en': {'nom': r['nom_en'], 'variante': None if r['numero'] else r['variante_en'], 'edition': r.get('edition_en'),
                'rarete': r.get('rarete_en') or (RAR_EN.get(rar, rar) if rar else None),
                'etat': lib if slab else ETAT_EN.get(lib, lib), 'pokemons': r['pokemons_en'], 'titre': titre_en, 'slug': slug_en},
         'ajout': batch}
    c['_sel'] = sel
    c['_n'] = r['photos']
    return c


# ------------------------------------------------------------------ photos
def make_images(c):
    from PIL import Image, ImageOps
    out = []
    for i in range(1, c['_n'] + 1):
        im = Image.open(P('_ajouts', 'photos', '%s-%d.jpg' % (c['ref'], i)))
        im = ImageOps.exif_transpose(im).convert('RGB')
        W, H = im.size
        # cadrage 5:7 de securite (la page de gestion recadre deja)
        if abs(W / H - 5 / 7) > 0.01:
            if W / H > 5 / 7:
                nw = round(H * 5 / 7)
                im = im.crop(((W - nw) // 2, 0, (W - nw) // 2 + nw, H))
            else:
                nh = round(W * 7 / 5)
                im = im.crop((0, (H - nh) // 2, W, (H - nh) // 2 + nh))
            W, H = im.size
        for h in (240, 560, 800, 1200, 1600):
            w = round(h * W / H)
            im.resize((w, h), Image.LANCZOS).save(P('assets', 'photos', '%s-%d-%d.webp' % (c['slug'], i, h)), 'WEBP', quality=84, method=6)
        if i == 1:
            im.resize((857, 1200), Image.LANCZOS).save(P('assets', 'photos', '%s-partage.jpg' % c['slug']), 'JPEG', quality=86, optimize=True, progressive=True)
            b = io.BytesIO()
            im.resize((11, 16), Image.LANCZOS).save(b, 'WEBP', quality=40)
            import base64
            c['_lqip'] = 'data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode()
        out.append(i)
    c['photo_t'] = 'assets/photos/%s-1-240.webp?v=%s' % (c['slug'], h8('assets/photos/%s-1-240.webp' % c['slug'], 'sha1'))
    c['photo_xs'] = 'assets/photos/%s-1-560.webp?v=%s' % (c['slug'], h8('assets/photos/%s-1-560.webp' % c['slug'], 'sha1'))


# ------------------------------------------------------------------ pages
def ref_card(stock, slab, high):
    for c in stock:
        if c['type'] == ('slab' if slab else 'carte') and (float(c['prix_eur'] or 0) >= 100) == high and not c.get('lot') and not c.get('groupe') and c.get('photo'):
            return c
    for c in stock:
        if c['type'] == ('slab' if slab else 'carte') and c.get('photo'):
            return c


def tile_attrs_from_catalogue():
    s = rd('catalogue.html')
    out = {}
    for t in re.findall(r'<li class="tile"[^>]*>', s):
        ref = re.search(r'data-ref="([^"]+)"', t).group(1)
        g = lambda k: (re.search(k + r'="([^"]*)"', t) or [None, ''])[1]
        out[ref] = (g('data-sel'), g('data-rec'), g('data-add'))
    lq = {}
    for m in re.finditer(r'<li class="tile"[^>]*data-ref="([^"]+)"[^>]*>.*?(?:class="lqip" src="([^"]*)"|</li>)', s, re.S):
        lq[m.group(1)] = m.group(2)
    return out, lq


def related(c, lang, pool, attrs, lqips):
    fr = lang == 'fr'
    up = '../' if fr else '../../'
    same_pk = [x for x in pool if x['ref'] != c['ref'] and set(x['pokemons']) & set(c['pokemons'])]
    same_pk.sort(key=lambda x: -float(x['prix_eur'] or 0))
    raichu = 'Raichu' in c['pokemons']
    picks = same_pk[:4]
    if len(picks) < 4:
        ext = [x for x in pool if x['ref'] != c['ref'] and x not in picks and x['extension'] == c['extension']]
        ext.sort(key=lambda x: -float(x['prix_eur'] or 0))
        picks += ext[:4 - len(picks)]
    if not picks:
        return ''
    if raichu and same_pk:
        head = ('<h2 id="t-rel">Les autres Raichu</h2><a class="more" href="../collections/raichu.html">Toute la collection →</a>' if fr
                else '<h2 id="t-rel">The other Raichu</h2><a class="more" href="../collections/raichu.html">Full collection →</a>')
    elif same_pk:
        head = '<h2 id="t-rel">%s</h2><a class="more" href="../catalogue.html" data-cat-link>Catalogue →</a>' % ('Du même Pokémon' if fr else 'Same Pokémon')
    else:
        head = '<h2 id="t-rel">%s</h2><a class="more" href="../catalogue.html" data-cat-link>Catalogue →</a>' % ('De la même extension' if fr else 'Same set')
    tiles = ''
    for x in picks:
        sel, rec, add = attrs.get(x['ref'], (x.get('_sel', 0), x['ref'] if x['ref'].isdigit() else 0, x.get('ajout', 1)))
        tiles += fiche.render_tile(ROOT, x, lang, up, sel, int(rec) if str(rec).isdigit() else rec, add, lqip=x.get('_lqip') or lqips.get(x['ref']))
    return ('<section class="section related" aria-labelledby="t-rel"><div class="section-head">%s</div><ul class="grid" role="list">%s</ul></section>\n') % (head, tiles)


def rec_of(c):
    return int(c['ref']) if c['ref'].isdigit() else 0


def R(c, lang):
    """Carte ancienne sans numero : rendue comme les fiches d'origine (la fin du titre tient lieu de numero)."""
    if c.get('numero'):
        return c
    nom, titre = (c['nom_fr'], c['titre']) if lang == 'fr' else (c['en']['nom'], c['en']['titre'])
    d = dict(c)
    d['numero'] = titre[len(nom) + 1:] if titre.startswith(nom + ' ') else ''
    return d


def tile(c, lang, up, first=False):
    return fiche.render_tile(ROOT, c, lang, up, c['_sel'], rec_of(c), c['ajout'], first=first, lqip=c['_lqip'])


def prepend_grid(rel, html_tiles, grid_pat=r'<ul class="grid" role="list"[^>]*>'):
    if not os.path.exists(P(rel)):
        return False
    s = rd(rel)
    m = re.search(grid_pat, s)
    if not m:
        return False
    rest = s[m.end():]
    rest = rest.replace('loading="eager" fetchpriority="high" ', 'loading="lazy" ', 1) if 'fetchpriority' in html_tiles else rest
    wr(rel, s[:m.end()] + html_tiles + rest)
    return True


def en_twin(rel_fr):
    s = rd(rel_fr)
    m = re.search(r'hreflang="en" href="https://pokeraichu\.com/([^"]+)"', s)
    return m.group(1) if m else None


def bump_option(page, sel_id, value, label):
    s = rd(page)
    m = re.search(r'(<select class="select" id="%s"[^>]*>)(.*?)(</select>)' % sel_id, s, re.S)
    if not m:
        return
    opts = re.findall(r'<option value="([^"]*)">(.*?)</option>', m.group(2))
    found = False
    new = []
    for v, l in opts:
        if v == value and v:
            mm = re.match(r'(.*) \((\d+)\)$', l)
            l = '%s (%d)' % (mm.group(1), int(mm.group(2)) + 1) if mm else l
            found = True
        new.append((v, l))
    if not found:
        new.append((value, '%s (1)' % esc(label)))
        if sel_id == 'f-pk':
            new = new[:1] + sorted(new[1:], key=lambda o: low(o[0]))
    body = ''.join('<option value="%s">%s</option>' % o for o in new)
    wr(page, s[:m.start(2)] + body + s[m.end(2):])


def add_pocket(c, rel, lang):
    if not os.path.exists(P(rel)):
        return
    fr = lang == 'fr'
    s = rd(rel)
    up = '../' if fr else '../../'
    W = [fiche.width(ROOT, c, 1, h) for h in (560, 800, 1200, 1600)]
    art = ('<span class="art art--photo"><img class="lqip" src="%s" alt="" aria-hidden="true" width="5" height="7"><img src="%s" srcset="%s %dw, %s %dw, %s %dw, %s %dw" '
           'sizes="(min-width: 980px) 260px, (min-width: 640px) 22vw, 31vw" alt="" loading="lazy" decoding="async" width="%d" height="800"></span>') % (
        c['_lqip'], fiche.pic(ROOT, c, 1, 800, up), fiche.pic(ROOT, c, 1, 560, up), W[0], fiche.pic(ROOT, c, 1, 800, up), W[1],
        fiche.pic(ROOT, c, 1, 1200, up), W[2], fiche.pic(ROOT, c, 1, 1600, up), W[3], W[1])
    sub = [c['numero']]
    if fiche.is_slab(c):
        sub.append(fiche.grade_nb(c))
    if c.get('rarete') and c['rarete'] not in fiche.MINOR_RAR:
        sub.append(c['rarete'] if fr else c['en']['rarete'])
    href = ('../cartes/%s.html' % c['slug']) if fr else ('../cards/%s.html' % c['en']['slug'])
    pocket = ('<li class="pocket" data-ref="%s"><a class="pocket__link" href="%s">%s<span class="pocket__cap"><span class="pocket__name">%s</span>'
              '<span class="pocket__sub">%s</span><span class="pocket__price"><span class="price">%s</span></span></span></a></li>') % (
        c['ref'], href, art, esc(c['nom_fr'] if fr else c['en']['nom']), esc(' · '.join(sub)), fiche.eur_fr(c['prix_eur']) if fr else fiche.eur_en(c['prix_eur']))
    m = re.search(r'<li class="pocket pocket--empty".*?</li>', s, re.S)
    if m:
        s = s[:m.start()] + pocket + s[m.end():]
        s = re.sub(r'(<p class="rc-free">)(\d+)( pochettes libres| empty pockets)', lambda x: x.group(1) + str(max(0, int(x.group(2)) - 1)) + x.group(3), s)
    else:
        i = s.rfind('</ul>', 0, s.find('<p class="rc-free"') if '<p class="rc-free"' in s else len(s))
        s = s[:i] + pocket + s[i:]
    wr(rel, s)


def main():
    ajouter()
    try:  # une modification mal remplie ne bloque jamais le site
        import modifier
        for line in modifier.appliquer_modifs(ROOT):
            print(line)
    except Exception as e:
        print('modifications ignorées : %r' % e)
    cleanup()


def ajouter():
    raws = load_raw()
    if not raws:
        print('Aucune carte ajoutée.')
        return
    st = json.load(open(P('data', 'stock.json'), encoding='utf-8'))
    stock = st['cartes']
    known = {c['ref'] for c in stock} | {v.get('ref') for v in st.get('vendus', []) if isinstance(v, dict)}
    raws = [r for r in raws if r['ref'] not in known]
    if not raws:
        return
    used_fr = {f[:-5] for f in os.listdir(P('cartes'))}
    used_en = {f[:-5] for f in os.listdir(P('en', 'cards'))}
    base_batch = max([c.get('ajout') or 1 for c in stock] + [1])
    days = sorted({r['ajoute_le'] for r in raws})
    raws.sort(key=lambda r: (r['ajoute_le'], int(re.sub(r'\D', '', r['ref']) or 0)))
    min_sel = min([0] + [int(a[0]) for a in tile_attrs_from_catalogue()[0].values() if re.fullmatch(r'-?\d+', a[0] or '')])
    new = []
    for k, r in enumerate(raws):
        sel = min_sel - (len(raws) - k)  # la plus recente en premier
        new.append(complete(r, used_fr, used_en, base_batch + 1 + days.index(r['ajoute_le']), sel))
    for c in new:
        make_images(c)
    newest_first = list(reversed(new))
    attrs, lqips = tile_attrs_from_catalogue()
    valid_until = (TODAY + datetime.timedelta(days=90)).isoformat()
    shells = {'fr': rd('cartes/%s.html' % stock[0]['slug']), 'en': rd('en/cards/%s.html' % stock[0]['en']['slug'])}
    pool = [c for c in stock if c['type'] in ('carte', 'slab') and c.get('numero') and c.get('photo') and not (
        c.get('edition') or c.get('variante') or c.get('sous_numero') or c.get('groupe') or c.get('lot') or c.get('stock_ouvert')
        or c['etat'].get('a_signaler') or c.get('prix_sur_demande') or c.get('variante_en'))] + [
        c for c in new if c.get('numero') and not (c.get('edition') or c.get('prix_sur_demande'))]
    # 1. fiches
    for c in new:
        rc = ref_card(stock, fiche.is_slab(c), float(c['prix_eur'] or 0) >= 100)
        for lang in ('fr', 'en'):
            src = rd(('cartes/%s.html' if lang == 'fr' else 'en/cards/%s.html') % (rc['slug'] if lang == 'fr' else rc['en']['slug']))
            sb, sl = fiche.extract_ship(src)
            page = fiche.render_product(ROOT, R(c, lang), lang, shells[lang], sb, sl, valid_until, related(c, lang, pool, attrs, lqips))
            wr(('cartes/%s.html' if lang == 'fr' else 'en/cards/%s.html') % (c['slug'] if lang == 'fr' else c['en']['slug']), page)
    # 2. listes
    fr_tiles = lambda up, first=False: ''.join(tile(R(c, 'fr'), 'fr', up, first and i == 0) for i, c in enumerate(newest_first))
    en_tiles = lambda up, first=False: ''.join(tile(R(c, 'en'), 'en', up, first and i == 0) for i, c in enumerate(newest_first))
    prepend_grid('catalogue.html', fr_tiles('', True), r'<ul class="grid" role="list" data-grid>')
    prepend_grid('en/catalogue.html', en_tiles('../', True), r'<ul class="grid" role="list" data-grid>')
    for c in newest_first:
        targets = ['collections/%s.html' % s for s in c['collections']]
        targets += ['pokemon/%s.html' % slugify(p) for p in c['pokemons']]
        targets.append('extensions/%s.html' % fiche.ext_slug(c))
        for rel in targets:
            if os.path.exists(P(rel)):
                prepend_grid(rel, tile(R(c, 'fr'), 'fr', '../'))
                twin = en_twin(rel)
                if twin and os.path.exists(P(twin)):
                    prepend_grid(twin, tile(R(c, 'en'), 'en', '../../'))
    # classeur Raichu : une pochette libre par nouvelle carte Raichu
    for c in new:
        if 'Raichu' in c['pokemons']:
            add_pocket(R(c, 'fr'), 'collections/raichu.html', 'fr')
            add_pocket(R(c, 'en'), 'en/collections/raichu.html', 'en')
    # accueil : dernieres arrivees (8 au plus) et tirage au hasard
    for rel, lang, up in (('index.html', 'fr', ''), ('en/index.html', 'en', '../')):
        s = rd(rel)
        m = re.search(r'(<h2 id="t-news">.*?<ul class="grid grid--rail" role="list">)(.*?)(</ul>)', s, re.S)
        if m:
            tiles_old = re.findall(r'<li class="tile".*?</li>(?=<li class="tile"|$)', m.group(2), re.S)
            tiles_new = [tile(R(c, lang), lang, up) for c in newest_first]
            s = s[:m.start(2)] + ''.join((tiles_new + tiles_old)[:8]) + s[m.end(2):]
        m = re.search(r'(<template id="hasard"[^>]*>(?:<ul[^>]*>)?)', s)
        if m:
            s = s[:m.end()] + ''.join(tile(R(c, lang), lang, up) for c in newest_first) + s[m.end():]
        wr(rel, s)
    # 3. compteurs et filtres
    n_f, n_u = st['meta']['nb_fiches'], st['meta']['nb_unites']
    N_f, N_u = n_f + len(new), n_u + sum(c['quantite'] for c in new)
    for rel in ('catalogue.html', 'index.html'):
        s = rd(rel)
        s = re.sub(r'\b%d fiches\b' % n_f, '%d fiches' % N_f, s)
        s = re.sub(r'\b%d articles\b' % n_u, '%d articles' % N_u, s)
        wr(rel, s)
    for rel in ('en/catalogue.html', 'en/index.html'):
        s = rd(rel)
        s = re.sub(r'\b%d listings\b' % n_f, '%d listings' % N_f, s)
        s = re.sub(r'\b%d items\b' % n_u, '%d items' % N_u, s)
        wr(rel, s)
    for c in new:
        for page, lang in (('catalogue.html', 'fr'), ('en/catalogue.html', 'en')):
            fr = lang == 'fr'
            bump_option(page, 'f-lang', c['langue'], fiche.LANG[c['langue']][0 if fr else 2])
            bump_option(page, 'f-grade', fiche.grade_slug(c), fiche.grade_label(c) if fiche.is_slab(c) else ('Non gradées' if fr else 'Raw'))
            bump_option(page, 'f-ext', fiche.ext_slug(c), fiche.ext_label(c))
            for p in (c['pokemons'] if fr else c['en']['pokemons']):
                bump_option(page, 'f-pk', p, p)
    # 4. donnees
    clean = lambda c: {k: v for k, v in c.items() if not k.startswith('_')}
    st['cartes'] = [clean(c) for c in newest_first] + stock
    st['meta']['nb_fiches'], st['meta']['nb_unites'] = N_f, N_u
    tx = st.get('taxonomies', {})
    for c in new:
        for t in tx.get('categories', []):
            if t['slug'] == c['categorie']:
                t['fiches'] += 1
                t['unites'] += c['quantite']
        for t in tx.get('collections', []):
            if t['slug'] in c['collections']:
                t['fiches'] += 1
                t['unites'] += c['quantite']
        for t in tx.get('langues', []):
            if t['code'] == c['langue']:
                t['unites'] += c['quantite']
        hit = [t for t in tx.get('extensions', []) if t['code'] == c['extension']['code'] and t['nom'] == c['extension']['nom'] and t.get('langue') == c['langue']]
        if hit:
            hit[0]['fiches'] += 1
        elif 'extensions' in tx:
            tx['extensions'].append({'code': c['extension']['code'], 'nom': c['extension']['nom'], 'langue': c['langue'], 'fiches': 1})
        for p in c['pokemons']:
            hit = [t for t in tx.get('pokemons', []) if t['nom'] == p]
            if hit:
                hit[0]['fiches'] += 1
            elif 'pokemons' in tx:
                tx['pokemons'].append({'nom': p, 'fiches': 1})
    with open(P('data', 'stock.json'), 'w', encoding='utf-8', newline='') as f:
        json.dump(st, f, ensure_ascii=False, separators=(',', ':'))
    for rel, lang in (('data/recherche-fr.json', 'fr'), ('data/recherche-en.json', 'en')):
        d = json.load(open(P(rel), encoding='utf-8'))
        fr = lang == 'fr'
        rows = []
        for c in newest_first:
            rc = R(c, lang)
            sub = c['numero'] or (c.get('variante') if fr else c['en'].get('variante')) or ''
            rows.append([('cartes/%s.html' % c['slug']) if fr else ('en/cards/%s.html' % c['en']['slug']), fiche.full_name(rc, lang),
                         '%s · %s · %s' % (sub, c['extension']['code'], fiche.LANG[c['langue']][0 if fr else 2]),
                         fiche.eur_fr(c['prix_eur']) if fr else fiche.eur_en(c['prix_eur']), fiche.search_string(rc), c['photo_t'], c['_sel'], ''])
        d['cartes'] = rows + d['cartes']
        with open(P(rel), 'w', encoding='utf-8', newline='') as f:
            json.dump(d, f, ensure_ascii=False, separators=(',', ':'))
    # sitemap
    s = rd('sitemap.xml')
    add = ''
    for c in newest_first:
        ufr, uen = fiche.urls(c)
        imgs = ''.join('<image:image><image:loc>%s/assets/photos/%s-%d-1600.webp</image:loc></image:image>' % (fiche.SITE, c['slug'], i) for i in range(1, c['_n'] + 1))
        for u in (ufr, uen):
            add += ('<url><loc>%s</loc><xhtml:link rel="alternate" hreflang="fr" href="%s"/><xhtml:link rel="alternate" hreflang="en" href="%s"/>'
                    '<xhtml:link rel="alternate" hreflang="x-default" href="%s"/><lastmod>%s</lastmod>%s</url>\n') % (u, ufr, uen, ufr, TODAY.isoformat(), imgs)
    s = s.replace('</urlset>', add + '</urlset>', 1)
    wr('sitemap.xml', s)
    # liens courts
    s = rd('_redirects')
    lines = ''.join('/r/%s  /cartes/%s.html  302\n/en/r/%s  /en/cards/%s.html  302\n/s/%s  /cartes/%s.html?stand=1  302\n' % (
        c['ref'], c['slug'], c['ref'], c['en']['slug'], c['ref'], c['slug']) for c in new)
    ms = list(re.finditer(r'^/s/\S+ .*\n', s, re.M))
    s = s[:ms[-1].end()] + lines + s[ms[-1].end():] if ms else lines + s
    wr('_redirects', s)
    # 5. versions des index de recherche et du service worker
    vf, ve = h8('data/recherche-fr.json'), h8('data/recherche-en.json')
    for dp, dn, fn in os.walk(ROOT):
        if '/assets' in dp or '/.git' in dp or '/_ajouts' in dp:
            continue
        for f in fn:
            if f.endswith('.html'):
                rel = os.path.relpath(os.path.join(dp, f), ROOT)
                s = rd(rel)
                t = re.sub(r'recherche-fr\.json\?v=[0-9a-f]+', 'recherche-fr.json?v=' + vf, s)
                t = re.sub(r'recherche-en\.json\?v=[0-9a-f]+', 'recherche-en.json?v=' + ve, t)
                if t != s:
                    wr(rel, t)
    s = rd('sw.js')
    s = re.sub(r"var VERSION = '[0-9a-f]+';", "var VERSION = '%s';" % hashlib.md5((s + vf + ve).encode()).hexdigest()[:10], s, count=1)
    wr('sw.js', s)
    print('%d carte(s) ajoutée(s) : %s' % (len(new), ', '.join('%s %s' % (c['ref'], c['slug']) for c in new)))


def cleanup():
    if KEEP_WORK:
        return
    for d in ('_ajouts', '_outils'):
        shutil.rmtree(P(d), ignore_errors=True)
    for f in ('requirements.txt', 'runtime.txt'):
        if os.path.exists(P(f)):
            os.remove(P(f))


if __name__ == '__main__':
    main()
