# -*- coding: utf-8 -*-
"""Poké-Raichu · modifier une fiche deja en ligne (nom, etat, Pokemon, prix, photo).

Principe : on ne regenere jamais une page. On calcule ce que le moteur (fiche.py) produit pour l'ancienne et pour
la nouvelle version de la carte, puis on reporte seulement les differences dans la vraie page (fusion a trois voies).
Tout ce qui a ete ajoute a la main dans une page (lots, precisions, editions, image de partage...) est donc conserve.

Deux usages :
  - construire.py appelle appliquer_modifs() : modifications enregistrees depuis /gestion.html (_ajouts/modifs.json) ;
  - en ligne de commande, pour changer la base du depot :
        python3 _outils/modifier.py <racine> <ref> '{"etat": "Excellent"}'
    cles acceptees : nom_fr, nom_en, etat (carte non gradee), cert (slab), pokemons, pokemons_en, prix_eur, quantite.
"""
import copy, difflib, hashlib, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fiche  # noqa: E402
from fiche import esc, slugify, low  # noqa: E402

ETAT_EN = {'Near Mint': 'Near Mint', 'Excellent': 'Excellent', 'Très bon état': 'Very good', 'Bon état': 'Good', 'Abîmée': 'Played'}
UNIT = re.compile(r'<[!/]?[\w:-]+|\s+[\w:@.-]+(?:="[^"]*")?|/?>|[^<]+|<')   # balises (un attribut = une unite) et textes
WORD = re.compile(r'\w+|\s+|[^\w\s]')     # mots, espaces, signes
TILE = re.compile(r'<li class="tile" [^>]*>.*?</button></div></li>', re.S)
SKIP_DIRS = ('.git', 'assets', '_ajouts', '_outils', 'worker', 'node_modules', 'data')


# ------------------------------------------------------------------ fusion a trois voies
def _match(A, B):
    m = {}
    for a, b, n in difflib.SequenceMatcher(None, A, B, autojunk=False).get_matching_blocks():
        for k in range(n):
            m[a + k] = b + k
    return m


def diff3(base, new, ours, lvl=0):
    """Reporte dans « ours » les changements base -> new. Retourne (texte, nombre de conflits)."""
    if base == new:
        return ours, 0
    if base == ours:
        return new, 0
    tok = (UNIT, WORD)[lvl]
    A, B, O = tok.findall(base), tok.findall(new), tok.findall(ours)
    mb, mo = _match(A, B), _match(A, O)
    out, conflicts = [], 0
    ia = ib = io = 0
    for a in [a for a in sorted(mb) if a in mo] + [None]:
        ea, eb, eo = (a, mb[a], mo[a]) if a is not None else (len(A), len(B), len(O))
        ca, cb, co = A[ia:ea], B[ib:eb], O[io:eo]
        if ca == cb:
            out += co
        elif ca == co or cb == co:
            out += cb
        elif lvl == 0:
            # meme endroit change des deux cotes : on affine mot a mot, et au moindre doute la page reste telle quelle
            ta, tb, to = ''.join(ca), ''.join(cb), ''.join(co)
            t, n = diff3(ta, tb, to, 1)
            if n or difflib.SequenceMatcher(None, WORD.findall(ta), WORD.findall(to), autojunk=False).ratio() < 0.6:
                t, n = to, 1
            out.append(t)
            conflicts += n
        elif not ca:  # ajout des deux cotes au meme endroit : on garde les deux
            out += cb + co
        else:  # la page a ete changee a la main au meme endroit : on la laisse telle quelle
            out += co
            conflicts += 1
        if a is not None:
            out.append(O[eo])
            ia, ib, io = ea + 1, eb + 1, eo + 1
    return ''.join(out), conflicts


# ------------------------------------------------------------------ fichiers
class Site(object):
    def __init__(self, root):
        self.root = root
        self.cache = {}
        self.dirty = set()

    def p(self, rel):
        return os.path.join(self.root, rel)

    def exists(self, rel):
        return rel in self.cache or os.path.exists(self.p(rel))

    def rd(self, rel):
        if rel not in self.cache:
            self.cache[rel] = open(self.p(rel), encoding='utf-8').read()
        return self.cache[rel]

    def wr(self, rel, s):
        if self.cache.get(rel) != s:
            self.cache[rel] = s
            self.dirty.add(rel)

    def flush(self):
        for rel in sorted(self.dirty):
            with open(self.p(rel), 'w', encoding='utf-8', newline='') as f:
                f.write(self.cache[rel])
        n = len(self.dirty)
        self.dirty = set()
        return n

    def pages(self):
        if not hasattr(self, '_pages'):
            out = []
            for dp, dn, fn in os.walk(self.root):
                dn[:] = [x for x in dn if not (dp == self.root and x in SKIP_DIRS)]
                out += [os.path.relpath(os.path.join(dp, f), self.root) for f in fn if f.endswith('.html')]
            self._pages = sorted(out)
        return self._pages


def editable(c):
    return c.get('type') in ('carte', 'slab') and not c.get('lot') and not c.get('groupe')


def _safe(c, lang='fr'):
    """Copie rendue par le moteur comme la page d'origine : le « numero » reprend la fin du titre (variante, n° de serie)."""
    nom, titre = (c['nom_fr'], c['titre']) if lang == 'fr' else (c['en']['nom'], c['en']['titre'])
    num = c.get('numero') or ''
    if titre.startswith(nom + ' ') and titre[len(nom) + 1:] != num:
        num = titre[len(nom) + 1:]
    if num != c.get('numero'):
        c = dict(c)
        c['numero'] = num
    return c


def page_of(c, lang):
    return ('cartes/%s.html' % c['slug']) if lang == 'fr' else ('en/cards/%s.html' % c['en']['slug'])


def _render_page(site, c, lang, page):
    sb, sl = fiche.extract_ship(page)
    m = re.search(r'</article>\n(.*?)</div>\n<div class="buybar"', page, re.S)
    return fiche.render_product(site.root, _safe(c, lang), lang, page, sb, sl, sl.get('priceValidUntil'), m.group(1) if m else '')


def _tile_ctx(t, rel):
    g = lambda k: (re.search(k + r'="([^"]*)"', t) or [None, ''])[1]
    lang = 'en' if rel.startswith('en/') else 'fr'
    up = '../' * rel.count('/')
    src = re.search(r'<img (?!class="lqip")[^>]*?src="([^"]*?)assets/', t)
    if src:  # chemin reel des images de cette page (404.html utilise des chemins absolus)
        up = src.group(1)
    lq = re.search(r'class="lqip" src="([^"]*)"', t)
    return {'lang': lang, 'up': up, 'sel': g('data-sel'), 'rec': g('data-rec'), 'add': g('data-add'),
            'first': 'fetchpriority="high"' in t, 'lqip': lq.group(1) if lq else None}


def _render_tile(site, c, x, lqip=None):
    return fiche.render_tile(site.root, _safe(c, x['lang']), x['lang'], x['up'], x['sel'], x['rec'], x['add'], first=x['first'], lqip=x['lqip'] or lqip)


def _ref_of(t):
    return re.search(r'data-ref="([^"]*)"', t).group(1)


# ------------------------------------------------------------------ nouvelle version d'une carte
def clean_text(v, n=80):
    v = re.sub(r'[\x00-\x1f<>"]', ' ', str(v or ''))
    return re.sub(r'\s+', ' ', v).strip()[:n]


def nouvelle(old, m):
    """Carte « old » avec les champs de la modification « m ». Les valeurs incorrectes sont ignorees."""
    c = copy.deepcopy(old)
    nom = clean_text(m.get('nom_fr'))
    if nom:
        if c['titre'].startswith(c['nom_fr']):
            c['titre'] = nom + c['titre'][len(c['nom_fr']):]
        c['nom_fr'] = nom
    nom_en = clean_text(m.get('nom_en'))
    if nom_en:
        if c['en']['titre'].startswith(c['en']['nom']):
            c['en']['titre'] = nom_en + c['en']['titre'][len(c['en']['nom']):]
        c['en']['nom'] = c['nom_en'] = nom_en
    if c['etat']['type'] == 'brute':
        if m.get('etat') in ETAT_EN:
            c['etat']['libelle'] = m['etat']
            c['en']['etat'] = ETAT_EN[m['etat']]
    elif fiche.is_slab(c) and 'cert' in m:
        c['etat']['cert'] = re.sub(r'\D', '', str(m.get('cert') or ''))[:12] or None
    if isinstance(m.get('pokemons'), list):
        pk = [clean_text(p, 40) for p in m['pokemons'] if clean_text(p, 40)][:4]
        en = m.get('pokemons_en') if isinstance(m.get('pokemons_en'), list) else []
        en = [clean_text(p, 40) for p in en if clean_text(p, 40)][:4]
        if len(en) != len(pk):
            known = dict(zip(old['pokemons'], old['en']['pokemons']))
            en = [known.get(p, p) for p in pk]
        c['pokemons'], c['en']['pokemons'] = pk, en
        for p, s in (('Pikachu', 'pikachu'), ('Raichu', 'raichu')):
            if p in pk and s not in c['collections']:
                c['collections'].append(s)
            if p not in pk and s in c['collections'] and p in old['pokemons']:
                c['collections'].remove(s)
    if m.get('quantite') is not None:
        try:
            q = int(m['quantite'])
            if 1 <= q <= 99:
                c['quantite'] = q
        except (TypeError, ValueError):
            pass
    if m.get('prix_eur') is not None and old.get('prix_eur') is not None:
        try:
            v = round(float(m['prix_eur']), 2)
            if 0 < v < 100000:
                c['prix_eur'] = v
        except (TypeError, ValueError):
            pass
    return c


# ------------------------------------------------------------------ report d'un changement dans tout le site
def capturer(site, old):
    """Ce que le moteur produit pour l'ancienne version, partout ou la carte apparait."""
    snap = {'pages': {}, 'tiles': {}}
    for lang in ('fr', 'en'):
        rel = page_of(old, lang)
        if site.exists(rel):
            snap['pages'][rel] = (lang, _render_page(site, old, lang, site.rd(rel)))
    mark = 'data-ref="%s"' % old['ref']
    for rel in site.pages():
        s = site.rd(rel)
        if mark not in s:
            continue
        L = []
        for mt in TILE.finditer(s):
            t = mt.group(0)
            if _ref_of(t) == old['ref']:
                x = _tile_ctx(t, rel)
                L.append((x, _render_tile(site, old, x)))
        if L:
            snap['tiles'][rel] = L
    return snap


def reporter(site, snap, old, new, lqip=None):
    """Reporte old -> new dans les pages. Retourne le nombre d'endroits laisses tels quels (conflits)."""
    conflicts = 0
    for rel, (lang, base) in snap['pages'].items():
        page = site.rd(rel)
        out, n = diff3(base, _render_page(site, new, lang, page), page)
        if new.get('photo') and new.get('photo') != old.get('photo'):  # premiere photo : le bloc photo est repris en entier
            media = fiche.media_html(site.root, _safe(new, lang), lang, '../' if lang == 'fr' else '../../') + '\n'
            out, n = re.sub(r'<div class="product__media">.*?\n(?=<div class="product__info">)', lambda m: media, out, count=1, flags=re.S), 0
        conflicts += n
        site.wr(rel, out)
    for rel, L in snap['tiles'].items():
        it = iter(L)
        box = [0]

        def sub(mt):
            t = mt.group(0)
            if _ref_of(t) != old['ref']:
                return t
            x, base = next(it)
            out, n = diff3(base, _render_tile(site, new, x, lqip), t)
            box[0] += n
            return out
        site.wr(rel, TILE.sub(sub, site.rd(rel)))
        conflicts += box[0]
    conflicts += _autres(site, old, new)
    _appartenance(site, old, new, lqip)
    return conflicts


def _autres(site, old, new):
    """Listes deroulantes de la page d'import et pochettes du classeur Raichu."""
    n = 0
    for rel, lang in (('importer-du-japon.html', 'fr'), ('en/import-from-japan.html', 'en'), ('collections/raichu.html', 'fr'), ('en/collections/raichu.html', 'en')):
        if not site.exists(rel):
            continue
        fr = lang == 'fr'
        a, b = (old['nom_fr'], new['nom_fr']) if fr else (old['en']['nom'], new['en']['nom'])
        pa = fiche.eur_fr(old['prix_eur']) if fr else fiche.eur_en(old['prix_eur'])
        pb = fiche.eur_fr(new['prix_eur']) if fr else fiche.eur_en(new['prix_eur'])

        def sub(mt):
            t = mt.group(0)
            t = t.replace('>' + esc(a), '>' + esc(b), 1) if a != b else t
            if pa != pb:
                t = t.replace(pa, pb).replace('data-prix="%s"' % fiche.num(old['prix_eur']), 'data-prix="%s"' % fiche.num(new['prix_eur']))
            return t
        s = site.rd(rel)
        s = re.sub(r'<option value="%s"[^>]*>[^<]*</option>' % re.escape(old['ref']), sub, s)
        s = re.sub(r'<li class="pocket" data-ref="%s">.*?</li>' % re.escape(old['ref']), sub, s, flags=re.S)
        site.wr(rel, s)
    return n


def _catalogue_ctx(site, ref):
    out = {}
    for rel, lang, up in (('catalogue.html', 'fr', '../'), ('en/catalogue.html', 'en', '../../')):
        for mt in TILE.finditer(site.rd(rel)):
            if _ref_of(mt.group(0)) == ref:
                x = _tile_ctx(mt.group(0), rel)
                x['up'], x['first'] = up, False
                out[lang] = x
                break
    return out


def _en_twin(site, rel_fr):
    m = re.search(r'hreflang="en" href="https://pokeraichu\.com/([^"]+)"', site.rd(rel_fr))
    return m.group(1) if m else None


def _recompter(site, rel):
    """Nombre de fiches annonce en tete d'une page Pokemon."""
    s = site.rd(rel)
    n = len(TILE.findall(s))
    s = re.sub(r'("numberOfItems": )\d+', lambda m: m.group(1) + str(n), s)
    s = re.sub(r'(<p class="lede">)\d+ fiches? ', lambda m: '%s%d fiche%s ' % (m.group(1), n, 's' if n > 1 else ''), s)
    s = re.sub(r'(<p class="lede">)\d+ listings? of ', lambda m: '%s%d listing%s of ' % (m.group(1), n, 's' if n > 1 else ''), s)
    site.wr(rel, s)


def _appartenance(site, old, new, lqip=None):
    """Pokemon ajoute ou retire : pages Pokemon, collections Pikachu et Raichu, filtre du catalogue."""
    added = [p for p in new['pokemons'] if p not in old['pokemons']]
    removed = [p for p in old['pokemons'] if p not in new['pokemons']]
    if not added and not removed:
        return
    ctx = _catalogue_ctx(site, new['ref'])

    def pages_for(p):
        s = slugify(p)
        return ['pokemon/%s.html' % s] + (['collections/%s.html' % s] if s in ('pikachu', 'raichu') else [])

    def insert(rel, lang):
        x = ctx.get(lang)
        s = site.rd(rel)
        m = re.search(r'<ul class="grid" role="list"[^>]*>', s)
        if x and m and ('data-ref="%s"' % new['ref']) not in s[m.end():]:
            site.wr(rel, s[:m.end()] + _render_tile(site, new, x, lqip) + s[m.end():])
            return True

    def pocket(rel, lang):
        # classeur Raichu : la carte prend une pochette libre (cartes avec photo seulement)
        x = ctx.get(lang)
        s = site.rd(rel)
        if not x or not fiche.photos_of(site.root, new) or '<li class="pocket" data-ref="%s">' % new['ref'] in s:
            return
        fr = lang == 'fr'
        up = x['up']
        W = [fiche.width(site.root, new, 1, h) for h in (560, 800, 1200, 1600)]
        P = [fiche.pic(site.root, new, 1, h, up) for h in (560, 800, 1200, 1600)]
        art = ('<span class="art art--photo"><img class="lqip" src="%s" alt="" aria-hidden="true" width="5" height="7"><img src="%s" srcset="%s %dw, %s %dw, %s %dw, %s %dw" '
               'sizes="(min-width: 980px) 260px, (min-width: 640px) 22vw, 31vw" alt="" loading="lazy" decoding="async" width="%d" height="800"></span>') % (
            x['lqip'] or lqip, P[1], P[0], W[0], P[1], W[1], P[2], W[2], P[3], W[3], W[1])
        sub = [new['numero'] or '']
        if fiche.is_slab(new):
            sub.append(fiche.grade_nb(new))
        if new.get('rarete') and new['rarete'] not in fiche.MINOR_RAR:
            sub.append(new['rarete'] if fr else new['en']['rarete'])
        href = ('../cartes/%s.html' % new['slug']) if fr else ('../cards/%s.html' % new['en']['slug'])
        li = ('<li class="pocket" data-ref="%s"><a class="pocket__link" href="%s">%s<span class="pocket__cap"><span class="pocket__name">%s</span>'
              '<span class="pocket__sub">%s</span><span class="pocket__price"><span class="price">%s</span></span></span></a></li>') % (
            new['ref'], href, art, esc(new['nom_fr'] if fr else new['en']['nom']), esc(' · '.join(t for t in sub if t)),
            fiche.eur_fr(new['prix_eur']) if fr else fiche.eur_en(new['prix_eur']))
        m = re.search(r'<li class="pocket pocket--empty".*?</li>', s, re.S)
        if m:
            s = s[:m.start()] + li + s[m.end():]
            s = re.sub(r'(<p class="rc-free">)(\d+)( pochettes libres| empty pockets)', lambda g: g.group(1) + str(max(0, int(g.group(2)) - 1)) + g.group(3), s)
            site.wr(rel, s)

    def drop(rel):
        s = site.rd(rel)
        site.wr(rel, TILE.sub(lambda mt: '' if _ref_of(mt.group(0)) == new['ref'] else mt.group(0), s))
        s = site.rd(rel)
        site.wr(rel, re.sub(r'<li class="pocket" data-ref="%s">.*?</li>' % re.escape(new['ref']), '', s, flags=re.S))

    for plist, fn in ((added, 'in'), (removed, 'out')):
        for p in plist:
            for rel in pages_for(p):
                if not site.exists(rel):
                    continue
                twin = _en_twin(site, rel)
                for r, lang in ((rel, 'fr'), (twin, 'en')):
                    if not r or not site.exists(r):
                        continue
                    if fn == 'in':
                        insert(r, lang)
                        if r.endswith('collections/raichu.html'):
                            pocket(r, lang)
                    else:
                        drop(r)
                    if r.startswith(('pokemon/', 'en/pokemon/')):
                        _recompter(site, r)
    # filtre « Pokemon » du catalogue : une option par Pokemon, avec le nombre de fiches
    for page, o, n_ in (('catalogue.html', old['pokemons'], new['pokemons']), ('en/catalogue.html', old['en']['pokemons'], new['en']['pokemons'])):
        s = site.rd(page)
        m = re.search(r'(<select class="select" id="f-pk"[^>]*>)(.*?)(</select>)', s, re.S)
        if not m:
            continue
        opts = [[v, l] for v, l in re.findall(r'<option value="([^"]*)">(.*?)</option>', m.group(2))]
        for p, d in [(p, 1) for p in n_ if p not in o] + [(p, -1) for p in o if p not in n_]:
            hit = [x for x in opts if x[0] == esc(p)]
            if hit:
                mm = re.match(r'(.*) \((\d+)\)$', hit[0][1])
                k = (int(mm.group(2)) if mm else 1) + d
                if k <= 0:
                    opts.remove(hit[0])
                else:
                    hit[0][1] = '%s (%d)' % (mm.group(1) if mm else esc(p), k)
            elif d > 0:
                opts.append([esc(p), '%s (1)' % esc(p)])
        opts = opts[:1] + sorted(opts[1:], key=lambda x: low(x[0]))
        site.wr(page, s[:m.start(2)] + ''.join('<option value="%s">%s</option>' % tuple(x) for x in opts) + s[m.end(2):])


def maj_donnees(st, rech, old, new):
    """stock.json (carte et compteurs par Pokemon) et index de recherche."""
    for i, c in enumerate(st['cartes']):
        if c['ref'] == old['ref']:
            st['cartes'][i] = {k: v for k, v in new.items() if not k.startswith('_')}
    tx = st.get('taxonomies', {})
    if 'pokemons' in tx:
        for p in new['pokemons']:
            if p not in old['pokemons']:
                hit = [t for t in tx['pokemons'] if t['nom'] == p]
                if hit:
                    hit[0]['fiches'] += 1
                else:
                    tx['pokemons'].append({'nom': p, 'fiches': 1})
        for p in old['pokemons']:
            if p not in new['pokemons']:
                for t in [t for t in tx['pokemons'] if t['nom'] == p]:
                    t['fiches'] -= 1
        tx['pokemons'] = [t for t in tx['pokemons'] if t['fiches'] > 0]
    for lang in ('fr', 'en'):
        fr = lang == 'fr'
        so, sn = _safe(old, lang), _safe(new, lang)
        for row in rech[lang]['cartes']:
            if row[0] == page_of(old, lang):
                row[1] = diff3(fiche.full_name(so, lang), fiche.full_name(sn, lang), row[1], 1)[0]
                row[4] = diff3(fiche.search_string(so), fiche.search_string(sn), row[4], 1)[0]
                if old['prix_eur'] != new['prix_eur']:
                    row[3] = fiche.eur_fr(new['prix_eur']) if fr else fiche.eur_en(new['prix_eur'])
                if new.get('photo_t') and new.get('photo_t') != old.get('photo_t'):
                    row[5] = new['photo_t']


# ------------------------------------------------------------------ versions (index de recherche, service worker)
def h8(root, rel):
    return hashlib.md5(open(os.path.join(root, rel), 'rb').read()).hexdigest()[:8]


def versions(root):
    """A appeler apres l'ecriture de data/recherche-*.json : met a jour ?v= dans les pages et la version du service worker."""
    vf, ve = h8(root, 'data/recherche-fr.json'), h8(root, 'data/recherche-en.json')
    for dp, dn, fn in os.walk(root):
        dn[:] = [x for x in dn if not (dp == root and x in ('.git', 'assets', '_ajouts', '_outils', 'worker', 'node_modules'))]
        for f in fn:
            if f.endswith('.html'):
                p = os.path.join(dp, f)
                s = open(p, encoding='utf-8').read()
                t = re.sub(r'recherche-fr\.json\?v=[0-9a-f]+', 'recherche-fr.json?v=' + vf, s)
                t = re.sub(r'recherche-en\.json\?v=[0-9a-f]+', 'recherche-en.json?v=' + ve, t)
                if t != s:
                    with open(p, 'w', encoding='utf-8', newline='') as o:
                        o.write(t)
    p = os.path.join(root, 'sw.js')
    s = open(p, encoding='utf-8').read()
    s = re.sub(r"var VERSION = '[0-9a-f]+';", "var VERSION = '%s';" % hashlib.md5((s + vf + ve).encode()).hexdigest()[:10], s, count=1)
    with open(p, 'w', encoding='utf-8', newline='') as o:
        o.write(s)


def _dump(root, rel, obj, indent=None):
    with open(os.path.join(root, rel), 'w', encoding='utf-8', newline='') as f:
        if indent is None:
            json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
        else:
            json.dump(obj, f, ensure_ascii=False, indent=indent)


def appliquer(root, changes, indent=None, entre=None):
    """changes : {ref: modification}. Retourne la liste des lignes de compte rendu."""
    site = Site(root)
    st = json.load(open(site.p('data/stock.json'), encoding='utf-8'))
    rech = {'fr': json.load(open(site.p('data/recherche-fr.json'), encoding='utf-8')),
            'en': json.load(open(site.p('data/recherche-en.json'), encoding='utf-8'))}
    by = {c['ref']: c for c in st['cartes']}
    log, done = [], 0
    for ref, m in changes.items():
        old = by.get(str(ref))
        if not old or not isinstance(m, dict):
            log.append('%s : fiche absente, modification ignorée' % ref)
            continue
        if not editable(old):
            log.append('%s : lot ou scellé, à modifier dans le dépôt' % ref)
            continue
        try:
            new = nouvelle(old, m)
            if {k: v for k, v in new.items() if not k.startswith('_')} == old and not entre:
                continue
            snap = capturer(site, old)
            lqip = entre(site, old, new) if entre else None
            n = reporter(site, snap, old, new, lqip)
            maj_donnees(st, rech, old, new)
            by[old['ref']] = new
            done += 1
            log.append('%s %s : modifiée%s' % (ref, new['titre'], ' (%d endroit(s) laissé(s) tels quels)' % n if n else ''))
        except Exception as e:  # une modification mal remplie ne bloque jamais le site
            log.append('%s : modification ignorée (%r)' % (ref, e))
    if done:
        site.flush()
        _dump(root, 'data/stock.json', st, indent)
        _dump(root, 'data/recherche-fr.json', rech['fr'])
        _dump(root, 'data/recherche-en.json', rech['en'])
        versions(root)
    return log


def appliquer_modifs(root):
    """Modifications enregistrees depuis /gestion.html."""
    p = os.path.join(root, '_ajouts', 'modifs.json')
    if not os.path.exists(p):
        return []
    try:
        mods = json.load(open(p, encoding='utf-8')).get('modifs', {})
    except Exception as e:
        return ['modifs.json illisible (%r)' % e]
    return appliquer(root, mods) if isinstance(mods, dict) and mods else []


if __name__ == '__main__':
    for line in appliquer(os.path.abspath(sys.argv[1]), {sys.argv[2]: json.loads(sys.argv[3])}, indent=1):
        print(line)
