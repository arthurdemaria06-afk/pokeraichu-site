# -*- coding: utf-8 -*-
"""Rendu d'une fiche carte (FR et EN) et de sa vignette, au format exact des pages du site.

Utilise par construire.py (ajout de cartes depuis la page de gestion). Les blocs communs a toutes
les fiches (en-tete, pied de page, livraison) sont repris d'une fiche existante du meme genre.
"""
import html, json, os, re, unicodedata

SITE = 'https://pokeraichu.com'
BOLT = '<svg class="i-bolt" viewBox="0 0 12 20" aria-hidden="true" focusable="false"><path d="M7.6 0 .6 11.4h5L3.9 20l7.5-12.2H6.4L7.6 0z"/></svg>'
NNBSP = ' '

LANG = {
    'JP': ('Japonais', 'japonaise', 'Japanese'),
    'FR': ('Français', 'française', 'French'),
    'KR': ('Coréen', 'coréenne', 'Korean'),
    'EN': ('Anglais', 'anglaise', 'English'),
    'CN': ('Chinois', 'chinoise', 'Chinese'),
}
GRADERS = {'PSA': 'https://www.psacard.com/cert/%s', 'CGC': 'https://www.cgccards.com/certlookup/%s/',
           'BGS': 'https://www.beckett.com/grading/card-lookup?item_type=BGS&item_id=%s'}


def esc(s):
    return html.escape(str(s), quote=True)


def esc_text(s):
    return html.escape(str(s), quote=True)


def slugify(s):
    s = unicodedata.normalize('NFKD', str(s)).encode('ascii', 'ignore').decode('ascii').lower()
    s = s.replace('&', ' ')
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return re.sub(r'-{2,}', '-', s)


def deaccent(s):
    return unicodedata.normalize('NFKD', str(s)).encode('ascii', 'ignore').decode('ascii')


def num(p):
    if p is None:  # prix sur demande
        return ''
    p = float(p)
    return str(int(p)) if p == int(p) else ('%.2f' % p)  # 12.5 -> 12,50 €, comme sur le site


def thousands(n, sep):
    s = num(n)
    if '.' in s:
        i, f = s.split('.')
    else:
        i, f = s, None
    out = ''
    while len(i) > 3:
        out = sep + i[-3:] + out
        i = i[:-3]
    out = i + out
    return out + (',' + f if f else '') if sep == NNBSP else out + ('.' + f if f else '')


def eur_fr(p):
    if p is None:
        return 'Sur demande'
    return thousands(p, NNBSP) + NNBSP + '€'


def eur_en(p):
    if p is None:
        return 'On request'
    return '€' + thousands(p, ',')


def ask_cls(c):
    """classe des prix « sur demande » (site.css : .price--ask)"""
    return ' price--ask' if c.get('prix_eur') is None else ''


def is_slab(c):
    return c['etat']['type'] not in ('brute', 'scelle')


def grade_label(c):
    return c['etat']['libelle'] if is_slab(c) else ''


def grade_nb(c):
    return grade_label(c).replace(' ', '\xa0')


def full_name(c, lang):
    nom = c['nom_fr'] if lang == 'fr' else c['en']['nom']
    t = nom + ' ' + c['numero']
    if is_slab(c):
        t += ' ' + grade_nb(c)
    return t


def title_short(c, lang):
    return (c['nom_fr'] if lang == 'fr' else c['en']['nom']) + ' ' + c['numero']


def ext_slug(c):
    return slugify(c['extension']['code'] + ' ' + c['extension']['nom'])


def ext_label(c):
    return c['extension']['code'] + ' · ' + c['extension']['nom']


def qty_text(c, lang):
    q = int(c['quantite'])
    if lang == 'fr':
        return 'Exemplaire unique' if q == 1 else '%d exemplaires' % q
    return 'Single copy' if q == 1 else '%d copies' % q


def photo_v(root, rel):
    import hashlib
    p = os.path.join(root, rel)
    return hashlib.sha1(open(p, 'rb').read()).hexdigest()[:8]


def photos_of(root, c):
    out = []
    i = 1
    while os.path.exists(os.path.join(root, 'assets/photos/%s-%d-800.webp' % (c['slug'], i))):
        out.append(i)
        i += 1
    return out


_DIM = {}


def width(root, c, i, h):
    rel = 'assets/photos/%s-%d-%d.webp' % (c['slug'], i, h)
    if rel not in _DIM:
        from PIL import Image
        with Image.open(os.path.join(root, rel)) as im:
            _DIM[rel] = im.size
    return _DIM[rel][0]


def pic(root, c, i, h, up):
    rel = 'assets/photos/%s-%d-%d.webp' % (c['slug'], i, h)
    return up + rel + '?v=' + photo_v(root, rel)


# ---------------------------------------------------------------- fiche
def media_html(root, c, lang, up):
    ph = photos_of(root, c)
    colon = '\u202f: ' if lang == 'fr' else ' : '
    alt0 = 'Photo' + colon + full_name(c, lang)
    if not ph:
        return ('<div class="product__media"><div class="media-box"><span class="art art--carte" aria-hidden="true">'
                '<span class="art__set">%s</span><span class="art__lang">%s</span><span class="art__name">%s</span>'
                '<span class="art__num">%s</span><img class="art__seal" src="%sassets/img/marque.svg?v=%s" alt="" width="24" height="24"></span>'
                '<span class="sticker" data-sticker hidden>%s</span></div></div>') % (
            esc_text(c['extension']['code']), c['langue'], esc_text(c['nom_fr'] if lang == 'fr' else c['en']['nom']),
            esc_text(c['numero']), up, photo_v(root, 'assets/img/marque.svg'), 'Réservée' if lang == 'fr' else 'Reserved')
    n = len(ph)
    items = []
    for k, i in enumerate(ph):
        alt = alt0 if n == 1 else 'Photo %d/%d%s%s' % (k + 1, n, colon, full_name(c, lang))
        W = [width(root, c, i, h) for h in (560, 800, 1200, 1600)]
        items.append('<a class="gallery__item" href="%s" data-zoom><img src="%s" srcset="%s %dw, %s %dw, %s %dw, %s %dw" '
                     'sizes="(min-width: 860px) 420px, 66vw" alt="%s" %sdecoding="async" width="%d" height="800"></a>' % (
                         pic(root, c, i, 1600, up), pic(root, c, i, 800, up), pic(root, c, i, 560, up), W[0], pic(root, c, i, 800, up), W[1],
                         pic(root, c, i, 1200, up), W[2], pic(root, c, i, 1600, up), W[3], esc(alt),
                         'loading="eager" fetchpriority="high" ' if k == 0 else 'loading="lazy" ', W[1]))
    thumbs = ''
    if n > 1:
        thumbs = '<div class="gallery__thumbs">' + ''.join(
            '<button type="button" class="gallery__thumb" data-goto="%d" aria-label="Photo %d"%s><img src="%s" alt="" width="%d" height="240" loading="lazy" decoding="async"></button>' % (
                k, k + 1, ' aria-current="true"' if k == 0 else '', pic(root, c, i, 240, up), width(root, c, i, 240)) for k, i in enumerate(ph)) + '</div>'
    hint = ('<p class="gallery__hint"><span class="only-touch">Touchez</span><span class="only-mouse">Cliquez sur</span> la photo pour l’agrandir.</p>'
            if lang == 'fr' else '<p class="gallery__hint"><span class="only-touch">Tap</span><span class="only-mouse">Click</span> the photo to enlarge it.</p>')
    return ('<div class="product__media"><div class="media-box media-box--photo"><div class="gallery" data-gallery><div class="gallery__track" data-track tabindex="0" role="group" aria-label="%s">%s</div>%s%s</div>'
            '<span class="sticker" data-sticker hidden>%s</span></div></div>') % (
        'Photos de la carte' if lang == 'fr' else 'Photos of the card', ''.join(items), thumbs, hint, 'Réservée' if lang == 'fr' else 'Reserved')


def msg_lines(c, lang, kind):
    if lang == 'fr':
        head = {'res': 'Bonjour, je souhaite réserver cette carte vue sur Poké-Raichu :',
                'resv': 'Bonjour, cette carte est indiquée réservée sur Poké-Raichu. Pouvez-vous me prévenir si elle se libère ?',
                'photos': 'Bonjour, pourriez-vous m’envoyer des photos de cette carte ?'}[kind]
        L = [head, title_short(c, 'fr'), 'Extension : %s, version %s' % (ext_label(c), LANG[c['langue']][1])]
        L.append('Grade : ' + grade_nb(c) if is_slab(c) else 'État : %s (non gradée)' % c['etat']['libelle'])
        if kind == 'res':
            L.append('Prix : ' + (eur_fr(c['prix_eur']) if c['prix_eur'] is not None else 'sur demande'))
        L += ['Réf. ' + c['ref'], 'Langue du site : français']
    else:
        head = {'res': 'Hello, I would like to reserve this card on Poké-Raichu:',
                'resv': 'Hello, this card is marked as reserved on Poké-Raichu. Could you let me know if it becomes available?',
                'photos': 'Hello, could you send me photos of this card?'}[kind]
        L = [head, title_short(c, 'en'), 'Set: %s, %s version' % (ext_label(c), LANG[c['langue']][2])]
        L.append('Grade: ' + grade_nb(c) if is_slab(c) else 'Condition: %s (raw)' % c['en']['etat'])
        if kind == 'res':
            L.append('Price: ' + (eur_en(c['prix_eur']) if c['prix_eur'] is not None else 'on request'))
        L += ['Ref. ' + c['ref'], 'Site language: English']
    t = '\n'.join(L)
    if lang == 'fr':
        t = t.replace(' :', NNBSP + ':').replace(' ?', NNBSP + '?')
    return esc(t)


def page_exists(root, rel):
    return os.path.exists(os.path.join(root, rel))


def specs_html(root, c, lang):
    fr = lang == 'fr'
    D = []
    D.append(('Référence' if fr else 'Reference', esc_text(c['ref'])))
    if fr and c['en']['nom'] != c['nom_fr']:
        D.append(('Nom anglais', '<span lang="en">%s</span>' % esc_text(c['en']['nom'])))
    es = ext_slug(c)
    ext_rel = ('extensions/%s.html' if fr else 'en/sets/%s.html') % es
    lab = esc_text(ext_label(c))
    D.append(('Extension' if fr else 'Set', '<a href="../%s">%s</a>' % (('extensions/' if fr else 'sets/') + es + '.html', lab) if page_exists(root, ext_rel) else lab))
    var = c.get('variante') if fr else c['en'].get('variante')
    if var and c['numero'] in ('(%s)' % var, var, ''):  # carte ancienne sans numero de collection
        D.append(('Précision' if fr else 'Detail', esc_text(var)))
    else:
        D.append(('Numéro' if fr else 'Number', esc_text(c['numero'])))
    ed = c.get('edition') if fr else c['en'].get('edition')
    if ed:
        D.append(('Édition' if fr else 'Edition', esc_text(ed)))
    if c.get('rarete'):
        D.append(('Rareté' if fr else 'Rarity', esc_text(c['rarete'] if fr else c['en']['rarete'])))
    pks = c['pokemons'] if fr else c['en']['pokemons']
    if pks:
        parts = []
        for p in pks:
            coll = ('collections/%s.html' if fr else 'en/collections/%s.html') % slugify(p)
            rel = ('pokemon/%s.html' if fr else 'en/pokemon/%s.html') % slugify(p)
            if page_exists(root, coll):
                parts.append('<a href="../collections/%s.html">%s</a>' % (slugify(p), esc_text(p)))
            elif page_exists(root, rel):
                parts.append('<a href="../pokemon/%s.html">%s</a>' % (slugify(p), esc_text(p)))
            else:
                parts.append(esc_text(p))
        D.append(('Pokémon', ', '.join(parts)))
    D.append(('Langue' if fr else 'Language', LANG[c['langue']][0 if fr else 2]))
    if is_slab(c):
        e = c['etat']
        v = esc_text(grade_nb(c))
        if e.get('cert'):
            u = GRADERS.get(e['type'])
            if u:
                host = re.sub(r'^https://(www\.)?([^/]+)/.*$', r'\2', u)
                v += '<br>%s %s · <a href="%s" target="_blank" rel="noopener">%s %s</a>' % (
                    'Certificat' if fr else 'Certificate', esc_text(e['cert']), esc(u % e['cert']), 'vérifier sur' if fr else 'verify on', host)
            else:
                v += '<br>%s %s' % ('Certificat' if fr else 'Certificate', esc_text(e['cert']))
        D.append(('État' if fr else 'Condition', v))
    else:
        D.append(('État' if fr else 'Condition', esc_text(c['etat']['libelle'] if fr else c['en']['etat']) + (' · photos détaillées sur demande' if fr else ' · detailed photos on request')))
    D.append(('Disponibilité' if fr else 'Availability', qty_text(c, lang)))
    D.append(('Lien court' if fr else 'Short link', '<span data-shortlink="../r/%s">%s/r/%s</span>' % (c['ref'].lower(), '' if fr else '/en', c['ref'].lower())))
    return '<dl class="specs">' + ''.join('<dt>%s</dt><dd>%s</dd>' % kv for kv in D) + '</dl>'


def descr(c, lang):
    if lang == 'fr':
        etat = 'gradée ' + grade_nb(c) if is_slab(c) else 'état ' + c['etat']['libelle']
        return '%s, carte Pokémon %s de l’extension %s, %s. %s, prix %s. Réservation sur le site, paiement sur eBay.' % (
            full_name(c, 'fr'), LANG[c['langue']][1], c['extension']['nom'], etat, qty_text(c, 'fr'), eur_fr(c['prix_eur']) if c['prix_eur'] is not None else 'sur demande')
    etat = 'graded ' + grade_nb(c) if is_slab(c) else c['en']['etat'] + ' condition'
    return '%s, %s Pokémon card from the %s set, %s. %s, price %s. Reserve on the site, pay on eBay.' % (
        full_name(c, 'en'), LANG[c['langue']][2], c['extension']['nom'], etat, qty_text(c, 'en'), eur_en(c['prix_eur']) if c['prix_eur'] is not None else 'on request')


def page_title(c, lang):
    if lang == 'fr':
        return '%s · carte Pokémon %s, %s | Poké-Raichu' % (full_name(c, 'fr'), LANG[c['langue']][1], c['extension']['nom'])
    return '%s · %s Pokémon card, %s | Poké-Raichu' % (full_name(c, 'en'), LANG[c['langue']][2], c['extension']['nom'])


def urls(c):
    return SITE + '/cartes/%s.html' % c['slug'], SITE + '/en/cards/%s.html' % c['en']['slug']


def render_product(root, c, lang, shell, ship_block, ship_ld, valid_until, related_html=''):
    """shell : texte d'une fiche existante de la meme langue ; ship_block / ship_ld : livraison reprise d'une fiche du meme genre."""
    fr = lang == 'fr'
    up = '../' if fr else '../../'
    ufr, uen = urls(c)
    me = ufr if fr else uen
    t = page_title(c, lang)
    ds = descr(c, lang)
    ph = photos_of(root, c)
    s = shell
    # 1. titre, description, liens canoniques
    head1 = ('<title>%s</title>\n<meta name="description" content="%s">\n<link rel="canonical" href="%s">\n'
             '<link rel="alternate" hreflang="fr" href="%s">\n<link rel="alternate" hreflang="en" href="%s">\n'
             '<link rel="alternate" hreflang="x-default" href="%s">\n') % (esc_text(t), esc(ds), me, ufr, uen, ufr)
    s = re.sub(r'<title>.*?(?=<meta name="theme-color")', lambda m: head1, s, count=1, flags=re.S)
    # 2. Open Graph
    if ph:
        rel = 'assets/photos/%s-partage.jpg' % c['slug']
        import hashlib
        img = SITE + '/' + rel + '?v=' + hashlib.sha1(open(os.path.join(root, rel), 'rb').read()).hexdigest()[:8]
        og_img = '<meta property="og:image" content="%s">\n<meta property="og:image:width" content="857">\n<meta property="og:image:height" content="1200">\n<meta property="og:image:alt" content="%s">\n' % (
            img, esc('Photo' + ('\u202f: ' if fr else ' : ') + full_name(c, lang)))
    else:
        og_img = re.search(r'<meta property="og:image" .*?(?=<meta name="twitter:card")', shell, re.S).group(0)
    og = '<meta property="og:title" content="%s">\n<meta property="og:description" content="%s">\n%s' % (esc(t), esc(ds), og_img)
    s = re.sub(r'<meta property="og:title".*?(?=<meta name="twitter:card")', lambda m: og, s, count=1, flags=re.S)
    # 3. donnees structurees
    prod = {"@context": "https://schema.org", "@type": "Product", "name": full_name(c, lang), "sku": c['ref'],
            "brand": {"@type": "Brand", "name": "Pokémon"}, "category": "Cartes à collectionner" if fr else "Trading cards",
            "description": ds, "url": me}
    if ph:
        prod["image"] = [SITE + '/assets/photos/%s-%d-1600.webp' % (c['slug'], i) for i in ph]
    if is_slab(c) and c['etat'].get('cert'):
        prod["mpn"] = c['etat']['cert']
    offer = {"@type": "Offer", "price": '%.2f' % float(c['prix_eur'] or 0), "priceCurrency": "EUR", "url": me,
             "availability": "https://schema.org/InStock", "itemCondition": "https://schema.org/UsedCondition",
             "seller": {"@type": "Organization", "name": "Poké-Raichu"}, "priceValidUntil": valid_until}
    offer["shippingDetails"] = ship_ld['shippingDetails']
    offer["hasMerchantReturnPolicy"] = ship_ld['hasMerchantReturnPolicy']
    offer["inventoryLevel"] = {"@type": "QuantitativeValue", "value": int(c['quantite'])}
    if c['prix_eur'] is not None:
        prod["offers"] = offer
    bc = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Accueil" if fr else "Home", "item": SITE + ('/' if fr else '/en/')},
        {"@type": "ListItem", "position": 2, "name": "Catalogue", "item": SITE + ('/catalogue.html' if fr else '/en/catalogue.html')},
        {"@type": "ListItem", "position": 3, "name": title_short(c, lang)}]}
    lds = '<script type="application/ld+json">%s</script>\n<script type="application/ld+json">%s</script>\n' % (
        json.dumps(prod, ensure_ascii=False).replace('</', '<\\/'), json.dumps(bc, ensure_ascii=False).replace('</', '<\\/'))
    s = re.sub(r'<script type="application/ld\+json">.*?</script>\n<script type="application/ld\+json">.*?</script>\n', lambda m: lds, s, count=1, flags=re.S)
    # 4. liens de langue de l'en-tete
    s = re.sub(r'<a href="[^"]*"( hreflang="fr" lang="fr"[^>]*data-lang-link>)', lambda m: '<a href="%s"%s' % (
        c['slug'] + '.html' if fr else '../../cartes/%s.html' % c['slug'], m.group(1)), s)
    s = re.sub(r'<a href="[^"]*"( hreflang="en" lang="en"[^>]*data-lang-link>)', lambda m: '<a href="%s"%s' % (
        '../en/cards/%s.html' % c['en']['slug'] if fr else c['en']['slug'] + '.html', m.group(1)), s)
    # 5. contenu
    name = esc_text(c['nom_fr'] if fr else c['en']['nom'])
    eyebrow = ' · '.join(([grade_nb(c)] if is_slab(c) else []) + ([c['rarete'] if fr else c['en']['rarete']] if c.get('rarete') and c['rarete'] not in ('Commune', 'Peu commune') else []) + [LANG[c['langue']][0 if fr else 2]])
    stock = qty_text(c, lang) + (' · ' + grade_nb(c) if is_slab(c) else '')
    price = eur_fr(c['prix_eur']) if fr else eur_en(c['prix_eur'])
    ref = c['ref']
    contact = '../contact.html'
    m_res, m_resv, m_ph = msg_lines(c, lang, 'res'), msg_lines(c, lang, 'resv'), msg_lines(c, lang, 'photos')
    if fr:
        L = dict(home='Accueil', crumbs='Fil d’Ariane', pager='Fiches voisines dans votre liste', avail='Disponible', res='Réserver sur WhatsApp',
                 lres='Me prévenir si elle se libère', add='Ajouter à ma sélection', rem='Retirer de ma sélection', alert='Être prévenu par e-mail',
                 photos='Demander des photos', copy='Copier le message', share='Partager', home_href='../index.html', cat='../catalogue.html')
    else:
        L = dict(home='Home', crumbs='Breadcrumb', pager='Neighbouring listings in your list', avail='Available', res='Reserve on WhatsApp',
                 lres='Tell me if it becomes available', add='Add to my selection', rem='Remove from my selection', alert='Get an e-mail alert',
                 photos='Request photos', copy='Copy the message', share='Share', home_href='../index.html', cat='../catalogue.html')
    crumbs = re.search(r'<div class="crumbs-row">.*?</div>\n', shell, re.S).group(0)
    crumbs = re.sub(r'<li aria-current="page">.*?</li>', lambda m: '<li aria-current="page">%s</li>' % esc_text(title_short(c, lang)), crumbs)
    cta = ('<div class="product__cta" data-main-cta><a class="btn" href="%s" data-contact data-ref="%s" data-msg="%s" data-msg-reserved="%s" data-label-reserved="%s">%s</a>'
           '<button type="button" class="btn btn--ghost" data-pick="%s" data-pick-main data-label-add="%s" data-label-remove="%s">%s</button>'
           '<button type="button" class="btn btn--ghost" data-alert-open data-alert-ref="%s" data-alert-name="%s" data-alert-q="%s" data-alert-reserved hidden>%s</button></div>'
           '<p class="cta-help" data-cta-help data-ref="%s" hidden></p>'
           '<p class="product__links"><a href="%s" data-contact data-ref="%s" data-msg="%s">%s</a><button type="button" class="linkbtn" data-copy-msg="%s">%s</button>'
           '<button type="button" class="linkbtn" data-share data-title="%s" hidden>%s</button></p>') % (
        contact, ref, m_res, m_resv, L['lres'], L['res'], ref, L['add'], L['rem'], L['add'], ref, esc(full_name(c, lang)),
        esc(c['nom_fr'] if fr else c['en']['nom']), L['alert'], ref, contact, ref, m_ph, L['photos'], m_res, L['copy'],
        esc(full_name(c, lang) + ' · Poké-Raichu'), L['share'])
    art = ('<article class="product" data-lot-ref="%s">\n%s\n<div class="product__info">\n<p class="eyebrow">%s%s</p>\n'
           '<h1 class="product__title">%s <span class="product__num">%s</span></h1>\n<p class="product__en">%s</p>\n'
           '<p class="product__price-wrap"><span class="product__price%s">%s</span></p>\n'
           '<p class="product__stock"><span class="status" data-status-text>%s</span> · %s</p>\n%s%s%s\n\n</div>\n</article>\n') % (
        ref, media_html(root, c, lang, up), BOLT if 'Raichu' in c['pokemons'] else '', esc_text(eyebrow), name, esc_text(c['numero']), esc_text(ext_label(c)), ask_cls(c), price,
        L['avail'], esc_text(stock), cta, ship_block, specs_html(root, c, lang))
    buybar = ('<div class="buybar" data-buybar><span class="price%s">%s</span><a class="btn" href="%s" data-contact data-ref="%s" data-msg="%s" '
              'data-msg-reserved="%s" data-label-reserved="%s">%s</a></div>\n') % (ask_cls(c), price, contact, ref, m_res, m_resv, L['lres'], L['res'])
    main = crumbs + art + (related_html or '\n') + '</div>\n' + buybar
    s = re.sub(r'<div class="crumbs-row">.*?(?=</main>)', lambda m: main, s, count=1, flags=re.S)
    return s


def extract_ship(page, root=None, lang='fr'):
    blk = re.search(r'<div class="ship">.*?</ul>\n', page, re.S).group(0)
    ld = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', page, re.S).group(1))
    if 'offers' not in ld and root:   # fiche en prix sur demande : livraison reprise d'une fiche chiffree
        d = os.path.join(root, 'cartes' if lang == 'fr' else os.path.join('en', 'cards'))
        for f in sorted(os.listdir(d)):
            t = open(os.path.join(d, f), encoding='utf-8').read()
            m = re.search(r'<script type="application/ld\+json">(.*?)</script>', t, re.S)
            if m and '"offers"' in m.group(1):
                ld = json.loads(m.group(1))
                break
    return blk, ld['offers']


# ---------------------------------------------------------------- vignette
CAT_TAG = {'reeditions-30': ('Réédition 30 ans', '30th Anniversary reprint')}
MINOR_RAR = ('Commune', 'Peu commune')


def tile_tag(c, lang):
    t = []
    if is_slab(c):
        t.append(grade_label(c))
    if c['categorie'] in CAT_TAG:
        t.append(CAT_TAG[c['categorie']][0 if lang == 'fr' else 1])
    elif c.get('rarete'):
        t.append(c['rarete'] if lang == 'fr' else c['en']['rarete'])
    return ' · '.join(t)


CAT_LABEL = {'gradees': ('Gradées PSA · PCA', 'Graded PSA · PCA'), 'sar': ('SAR', 'SAR'), 'sr': ('SR · CHR', 'SR · CHR'), 'ar': ('AR', 'AR'),
             'fur': ('FUR', 'FUR'), 'reeditions-30': ('Rééditions 30 ans', '30th Anniversary reprints'), 'promos': ('Promos', 'Promos'),
             'vintage': ('Vintage', 'Vintage'), 'scelle': ('Scellé', 'Sealed'), 'autres': ('Autres', 'Other')}
RAR_EN = {'Réédition 30 ans': '30th anniversary reprint', 'Commune': 'common', 'Peu commune': 'uncommon', 'Chromatique': 'shiny'}


def low(s):
    s = unicodedata.normalize('NFKD', str(s))
    s = ''.join(ch for ch in s if not unicodedata.combining(ch))
    return unicodedata.normalize('NFC', s).lower()


def search_string(c):
    e = c['etat']
    nf, ne = c['nom_fr'], c['en']['nom']
    w = [nf + ' ' + c['numero'], ne + ' ' + c['numero'], nf, ne, c['numero'],
         c['extension']['code'] + ' ' + c['extension']['nom']]
    if c.get('rarete'):
        w += [c['rarete'], RAR_EN.get(c['rarete'], c['en'].get('rarete') or c['rarete'])]
    if is_slab(c):
        w += [e['libelle'], e['libelle']] + ([e['cert']] if e.get('cert') else [])
    else:
        w += [e['libelle'], c['en']['etat']]
    w += ['ref', c['ref'], c['ref'], LANG[c['langue']][0], LANG[c['langue']][2], c['langue']]
    lab = CAT_LABEL.get(c['categorie'], (c['categorie'], c['categorie']))
    w += [lab[0], lab[1]]
    w += list(c['pokemons']) + list(c['en']['pokemons'])
    return low(' '.join(w))


def grade_slug(c):
    return slugify(c['etat']['libelle']) if is_slab(c) else 'brute'


def sub_line(c):
    code = c['extension']['code']
    if c['numero'].upper().endswith('/' + code.upper()):
        return c['numero']
    return c['numero'] + ' · ' + code


def render_tile(root, c, lang, up, sel, rec, add, first=False, lqip=None):
    """up : chemin vers la racine depuis la page ('' , '../' ou '../../'). lang : langue de la page."""
    fr = lang == 'fr'
    nom = c['nom_fr'] if fr else c['en']['nom']
    pks = c['pokemons'] if fr else c['en']['pokemons']
    href = (up + 'cartes/' + c['slug'] + '.html') if fr else (up[3:] + 'cards/' + c['en']['slug'] + '.html')
    attrs = [('data-cat', c['categorie']), ('data-lang', c['langue']), ('data-ext', ext_slug(c)), ('data-pk', '|' + '|'.join(pks) + '|'),
             ('data-price', num(c['prix_eur'])), ('data-sel', str(sel)), ('data-rec', str(rec)), ('data-name', low(nom + ' ' + c['numero'])),
             ('data-qty', str(int(c['quantite']))), ('data-search', search_string(c)), ('data-ref', c['ref']), ('data-grade', grade_slug(c)),
             ('data-add', str(add))]
    a = '<li class="tile" ' + ' '.join('%s="%s"' % (k, esc(v)) for k, v in attrs) + '>'
    ph = photos_of(root, c)
    if ph:
        W = [width(root, c, 1, h) for h in (560, 800, 1200, 1600)]
        art = ('<span class="art art--photo"><img class="lqip" src="%s" alt="" aria-hidden="true" width="5" height="7"><img src="%s" srcset="%s %dw, %s %dw, %s %dw, %s %dw" '
               'sizes="(min-width: 980px) 260px, (min-width: 640px) 22vw, 31vw" alt="" %sdecoding="async" width="%d" height="800"></span>') % (
            lqip, pic(root, c, 1, 800, up), pic(root, c, 1, 560, up), W[0], pic(root, c, 1, 800, up), W[1], pic(root, c, 1, 1200, up), W[2],
            pic(root, c, 1, 1600, up), W[3], 'loading="eager" fetchpriority="high" ' if first else 'loading="lazy" ', W[1])
    elif is_slab(c):
        art = ('<span class="art art--slab" aria-hidden="true"><span class="art__label"><span>%s</span></span><span class="art__window"><span class="art__set">%s</span>'
               '<span class="art__name">%s</span><span class="art__num">%s</span></span></span>') % (esc(grade_nb(c)), esc(c['extension']['code']), esc(nom), esc(c['numero']))
    else:
        art = ('<span class="art art--carte" aria-hidden="true"><span class="art__set">%s</span><span class="art__lang">%s</span><span class="art__name">%s</span>'
               '<span class="art__num">%s</span><img class="art__seal" src="%sassets/img/marque.svg?v=%s" alt="" width="24" height="24"></span>') % (
            esc(c['extension']['code']), c['langue'], esc(nom), esc(c['numero']), up, photo_v(root, 'assets/img/marque.svg'))
    tag = []
    if c.get('nouveau'):
        tag.append('<span class="tag-new">%s</span>' % ('Nouveau' if fr else 'New'))
    if is_slab(c):
        tag.append(esc(grade_nb(c)))
    lang_in_tag = False
    if c['categorie'] in CAT_TAG:
        tag.append(CAT_TAG[c['categorie']][0 if fr else 1])
    elif c.get('rarete') and c['rarete'] not in MINOR_RAR:
        tag.append(esc(c['rarete'] if fr else c['en']['rarete']))
    elif not is_slab(c):
        tag.append(LANG[c['langue']][0 if fr else 2])
        lang_in_tag = True
    langspan = '' if lang_in_tag else '<span class="tile__lang"><span aria-hidden="true"> · %s</span><span class="sr-only">, %s</span></span>' % (c['langue'], LANG[c['langue']][0 if fr else 2])
    body = ('<span class="tile__body"><span class="tile__tag">%s</span><span class="tile__name">%s</span><span class="tile__sub">%s%s</span>'
            '<span class="tile__status" data-status-text>%s</span></span>') % (' · '.join(tag), esc(nom), esc(sub_line(c)), langspan,
                                                                              'Disponible' if fr else 'Available')
    price = eur_fr(c['prix_eur']) if fr else eur_en(c['prix_eur'])
    q = int(c['quantite'])
    meta = '' if q == 1 else '<span class="tile__meta"><span class="badge"><span aria-hidden="true">×%d</span><span class="sr-only">%s</span></span></span>' % (q, qty_text(c, lang))
    pick_lab = ('Sélectionner ' if fr else 'Select ') + full_name(c, lang)
    foot = ('<div class="tile__foot"><span class="tile__price"><span class="price%s">%s</span></span>%s<button type="button" class="pick" data-pick="%s" aria-pressed="false" aria-label="%s">'
            '%s</button></div></li>') % (ask_cls(c), price, meta, c['ref'], esc(pick_lab), PICK_SVG)
    return a + '<a class="tile__link" href="%s">%s%s</a>%s' % (href, art, body, foot)


PICK_SVG = ('<svg class="pick__plus" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 2.5v11M2.5 8h11"/></svg>'
            '<svg class="pick__check" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2.5 8.6l3.6 3.4 7.4-8"/></svg>')
