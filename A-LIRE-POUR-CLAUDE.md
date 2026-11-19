# Poké-Raichu · passation du site (à lire avant toute modification)

Mis à jour le 18 novembre 2026. Ce fichier résume l'état du site, comment il est hébergé et publié,
et les règles à respecter. Il n'est pas publié sur le site (exclu dans `.assetsignore`).

## 1. Le propriétaire et sa façon de travailler

- Arthur, boutique de cartes Pokémon **Poké-Raichu – Trading Cards · Mandelieu** (Instagram + TikTok).
- **Toujours répondre en français.**
- Il n'est **pas développeur** et travaille **sur iPhone** : instructions très simples, **une action à la fois**,
  liens directs, et demander une capture d'écran quand un doute existe.
- **Ne jamais lui demander sa clé GitHub** ni une capture qui la montre. Elle reste sur son téléphone uniquement.
- Vidéos pour ses réseaux : toujours dans sa DA (crème / cuivre), **sans musique**, et livrer avec
  **une description + 5 hashtags** (Instagram/TikTok).

## 2. Où vit le site

| Élément | Valeur |
|---|---|
| Adresse | **https://pokeraichu.com** (domaine acheté chez Cloudflare le 16/11/2026, renouvellement auto) |
| Code | Dépôt GitHub **public** `arthurdemaria06-afk/pokeraichu-site`, branche `main` |
| Hébergement | **Cloudflare Workers** (fichiers statiques + un petit worker), projet `pokeraichu-site` |
| Publication | Automatique à chaque commit sur `main` : Cloudflare lance `npx wrangler deploy` (environ 1 min) |
| Ancienne adresse | `pokeraichu.netlify.app` : Netlify en pause (crédits gratuits épuisés). `netlify.toml` contient déjà une redirection 301 de toutes les pages vers pokeraichu.com, qui s'activera quand Netlify republiera (prochain cycle de crédits). |

Pourquoi le dépôt est public : l'offre gratuite Netlify refusait les commits faits par un autre contributeur sur un dépôt privé.
Il ne contient **aucun secret** (vérifié). Personne d'autre qu'Arthur ne peut y écrire.

Limites Cloudflare (offre gratuite) : 3 000 minutes de build par mois (environ 1 500 à 3 000 publications),
visites illimitées pour les fichiers statiques, 100 000 passages par jour pour le worker.

### Fichiers Cloudflare

- `wrangler.jsonc` : nom `pokeraichu-site`, `assets.directory = "."`, `html_handling: "none"` (les URL gardent `.html`),
  `not_found_handling: "404-page"`, `run_worker_first` sur `/` et les pages qui ont un formulaire,
  `build.command` = installe Pillow puis lance `python3 _outils/construire.py`, binding e-mail `MAIL`.
- `.assetsignore` : fichiers du dépôt qui ne sont **pas** publiés (`worker/`, `_outils/`, `_ajouts/`, configs, ce fichier…).
- `worker/formulaires.js` : ne traite que les **POST des formulaires** (contact, alerte d'arrivage, recherche au Japon)
  et les envoie par e-mail via **Cloudflare Email Routing**. Pour les GET, il sert les fichiers
  (et gère `/en/` → `/en/index.html`, `/catalogue` → `/catalogue.html`) en ajoutant les en-têtes de sécurité.
  - Expéditeur `site@pokeraichu.com`, destinataire = **secret `CONTACT_TO`** réglé dans Cloudflare
    (jamais dans le code). Email Routing est activé sur pokeraichu.com, avec l'adresse de destination vérifiée.
  - Piège à robots (`bot-field`), limite de taille, pas d'injection d'en-têtes.
- `_headers` et `_redirects` : compatibles Cloudflare (776 redirections statiques, codes 301/302 seulement :
  **pas de règle 404 ni 200** dans `_redirects`, Cloudflare les refuse).

### Comptes clients et éclairs (ajoutés le 19/11)

- **Éclairs** = cartes favorites. Bouton éclair rond en haut à gauche de chaque vignette, bouton « Mettre en éclair » sur
  les fiches, pastille ronde ⚡ + compteur dans l'en-tête (avant FR/EN). Tout est injecté par `site.js` (dernier bloc),
  aucune page générée n'a été modifiée. Liste locale `pokeraichu.eclairs.v1`.
- **Page Mes éclairs** : `compte.html` / `en/account.html` (noindex). Bouton Google (Google Identity Services, chargé
  seulement sur ces pages : CSP propre posée par le worker, `CSP_COMPTE` dans `worker/comptes.js`).
- **Worker** `worker/comptes.js` (importé par `formulaires.js`), routes `/api/connexion` (jeton Google vérifié en RS256
  avec les clés publiques Google, `aud` = `google_client_id` de `config.js`), `/api/moi` (GET, DELETE), `/api/eclairs`
  (PUT), `/api/deconnexion`, `/api/admin/clients` (gestion : en-tête `x-gestion` = clé GitHub du téléphone, vérifiée
  par `api.github.com/user`, login `arthurdemaria06-afk`, jamais stockée). Session : cookie HttpOnly `pr_session`
  (180 j), seul le hachage SHA-256 est en base. Écritures refusées si l'en-tête Origin n'est pas le site. E-mail au
  vendeur (binding `MAIL`, secret `CONTACT_TO`) à chaque nouveau compte.
- **Base D1** liée sous le nom `DB` (tables créées toutes seules : clients, eclairs, sessions). Sans base : l'API répond
  503, les éclairs restent sur l'appareil, la page affiche « les comptes ouvrent bientôt ».
- `wrangler.jsonc` : `/api/*`, `/compte.html`, `/en/account.html` dans `run_worker_first` (sinon Cloudflare sert la
  page 404 aux navigations sans passer par le worker). `sw.js` ne met jamais `/api/` en cache.
- Gestion : rubrique « Clients et éclairs » (fiches clients, cartes les plus demandées).
- Confidentialité FR/EN : section « Compte client » (`#compte` / `#account`).
- Testé en local avec `wrangler dev` (D1 local, Google et GitHub simulés) : connexion, fusion des éclairs, 2e appareil,
  jetons refusés (mauvais destinataire, expiré, signature trafiquée, e-mail non vérifié), admin, déconnexion, suppression.

## 3. Les outils du vendeur (pages non référencées)

- **`/gestion.html`**. Sa clé GitHub (jeton à accès précis) est enregistrée dans le `localStorage` du téléphone
  (`pr.gestion.jeton`, une fois par adresse de site). Elle doit avoir : **Gists Read/write** et
  **Repository access `pokeraichu-site` · Contents Read and write**.
  - Statuts (disponible / réservée / vendue) et **prix en direct** : écrits dans un **Gist secret**
    (`statuts.json`, lien Raw dans `config.js` → `statuts_url`), lus par le site sans republier.
  - **Ventes inscrites sans le Gist** (Claude n'a pas la clé) : liste `vendues` de `config.js`, datée par `vendues_le`.
    Le site l'ajoute aux ventes du Gist ; la page de gestion la recopie dans le Gist au premier enregistrement,
    et un Gist enregistré après `vendues_le` fait ensuite foi (une carte remise en vente redevient disponible).
    Une vente partielle (une carte en plusieurs exemplaires) se fait en baissant `quantite` avec `modifier.py`.
  - **Ajouter une carte au stock** (`assets/js/ajout.js`) : nom, photos (3 max, recadrées), prix…
    commit en un seul envoi de `_ajouts/cartes.json` + `_ajouts/photos/<ref>-<i>.jpg` via l'API Git Data
    (blobs → tree → commit → ref). Puis Cloudflare reconstruit le site.
  - **Bouton « Annonce »** (`assets/js/annonce.js`) : titre, prix, description et photos prêts à copier pour
    **eBay (80 car.), Vinted (60), Leboncoin (50)**. Écart de prix par plateforme et cases « postée sur… »
    gardés dans le `localStorage`. Rien n'est envoyé aux plateformes (Vinted interdit l'automatisation).
  - **Bouton « Modifier »** (`assets/js/modif.js`) : change le **nom** (FR et EN), l'**état** d'une carte non gradée
    (ou le n° de certificat d'un slab) et les **Pokémon** d'une fiche déjà en ligne. Un seul fichier est commité :
    `_ajouts/modifs.json` (`{"modifs": {"<réf>": {nom_fr, nom_en, etat | cert, pokemons, pokemons_en, le}}}`), puis
    Cloudflare reconstruit le site. La référence et l'adresse (slug) de la fiche ne changent jamais.
    Lots et scellés ne sont pas modifiables depuis le téléphone. L'attente de publication est gardée dans le
    `localStorage` (`pr.modif.attente`).
  - **Bouton « Ventes eBay ↗ »** sur chaque carte (sauf lots) : ouvre dans un nouvel onglet les ventes réussies eBay.fr
    (LH_Sold, LH_Complete). Recherche reprise de `data/ebay.json` (préparée dans l'Excel, carte par carte), sinon
    construite par `outils.js` sur le même modèle : nom anglais, (n°,n°/total), langue, grade, exclusions.
  - La liste affiche **toutes les cartes d'un coup** (plus de limite à 60, demandé le 19/11) : on fait défiler.
  - Bouton filtre **« Prix sur demande · n »** sous la recherche : n'affiche que les cartes sans prix (se combine avec la recherche).
  - **Petite photo** de la carte à gauche du nom (lien vers la fiche) ; pastille avec la réf. quand il n'y a pas de photo.
  - **Carte en prix sur demande** : champ « Prix » + « Publier ». Le premier prix part dans `_ajouts/modifs.json`
    (`prix_eur`, fusionné avec une éventuelle modification de nom ou d'état), `modifier.py` reconstruit fiche, vignettes,
    recherche et données Google (livraison reprise d'une fiche chiffrée). En ligne en 2 à 3 minutes ; ensuite le prix se
    change en direct comme les autres. Attente gardée dans `pr.modif.prix`.
  - Un lien « Gestion (visible seulement sur ce téléphone) » apparaît en pied de page du site quand la clé est
    enregistrée (`site.js`).
- `/salon.html` : caisse du stand utilisable hors ligne. `/etiquettes.html`, `/panneau-salon.html` : étiquettes et QR codes.
- `/tirage.html` : tirage au sort pour les jeux concours (import CSV/XLSX/texte, tirage pondéré, mode film).
  Arthur utilise surtout une **page de tirage séparée** hébergée comme artifact claude.ai
  (« Tirage Poké-Raichu »), qui n'est **pas** dans ce dépôt.

## 4. Comment le site est construit

Le site est **statique** (HTML/CSS/JS déjà générés, environ 1 750 fichiers dont 218 fiches FR `cartes/` et autant en EN `en/cards/`).
Le générateur d'origine (`tools/publier.py`, cité dans `config.js`) **n'est pas dans ce dépôt**. Les pages sont maintenant
modifiées directement, et les nouvelles cartes sont produites par :

- `_outils/construire.py` : lit `_ajouts/cartes.json`, crée les images (webp 240/480/800/1600 + jpg de partage),
  les pages FR et EN de chaque carte, les vignettes dans les grilles (catalogue, collections, extensions, Pokémon, accueil),
  les pochettes du classeur Raichu, `data/stock.json`, les index de recherche, `sitemap.xml`, les liens courts `/r/`, `/en/r/`, `/s/`
  dans `_redirects`, puis met à jour les numéros de version (`?v=`) et la version du service worker.
  Ensuite il supprime `_ajouts/` et `_outils/` de la copie publiée. Sans carte ajoutée, il ne change rien.
- `_outils/fiche.py` : rendu d'une fiche et d'une vignette, à l'identique des pages d'origine (validé sur 258/260 fiches
  et 774/774 vignettes). À respecter pour rester identique :
  - espace fine insécable U+202F avant « : ? ! » et dans les prix FR (« 150 € ») ;
  - libellés de note avec espace insécable ;
  - `?v=` = 8 premiers caractères du **sha1** de la photo ;
  - largeurs réelles des webp ;
  - éclair Raichu (svg) dans l'eyebrow ;
  - Pikachu/Raichu liés à leurs collections ;
  - liens courts en minuscules ;
  - raretés mineures omises ;
  - numérotation des promos ;
  - apostrophe → « - » dans les slugs ;
  - bloc « cartes liées » vide = "\n".
- `_outils/modifier.py` : **modifie une fiche déjà en ligne sans la régénérer**. Il calcule ce que `fiche.py` produit
  pour l'ancienne et la nouvelle version de la carte, puis reporte seulement les différences dans les vraies pages
  (fusion à trois voies : tout ce qui a été ajouté à la main dans une page est conservé). Il met à jour la fiche FR et EN,
  toutes les vignettes, les pages Pokémon et collections Pikachu/Raichu, le filtre du catalogue, `data/stock.json`,
  les index de recherche, puis les `?v=` et la version du service worker.
  - Appelé par `construire.py` pour `_ajouts/modifs.json` (cartes du dépôt et cartes ajoutées).
  - **Pour changer la base du dépôt** (état, nom, Pokémon, prix publié), ne plus éditer les pages à la main :
    `python3 _outils/modifier.py . 094 '{"etat": "Excellent"}'` (clés : `nom_fr`, `nom_en`, `etat`, `cert`, `pokemons`,
    `pokemons_en`, `prix_eur`), puis commit. Une modification enregistrée depuis le téléphone pour la même fiche
    garde la priorité au moment de la construction.
  - Limites : lots et scellés non gérés ; une carte sans photo ne prend pas de pochette dans le classeur Raichu ;
    ajouter une première photo à une fiche du dépôt se fait par script (paramètre `entre` de `appliquer`, voir le commit `e9f37c2`).
  - Contrôle fait le 18/11 : aller-retour sur les 204 fiches modifiables (changement puis retour) = site identique, 0 conflit.
- `data/stock.json` : clés `meta, taxonomies, cartes, vendus, parties, coups_de_foudre` (217 cartes au 16/11).
- `config.js` : **seul fichier de réglages à la main** (WhatsApp, livraison, remises, coups de foudre, TVA, médiateur…).
  Tout est documenté en tête du fichier.

### Règles quand on modifie un fichier CSS ou JS

1. Changer le `?v=xxxxxxxx` de ce fichier dans **toutes** les pages qui le chargent
   (8 premiers caractères du md5 du fichier ; exemple : `site.js` est chargé par environ 550 pages).
2. Changer `var VERSION = '…'` dans `sw.js`, et la liste `PRECACHE` si le fichier y figure.
3. Tester en local avec un serveur qui applique la CSP de `_headers` (pas de script ni de style en ligne : CSP stricte).
4. Faire un commit sur `main` : Cloudflare publie tout seul. Vérifier ensuite que le déploiement est vert
   (Cloudflare → Workers & Pages → pokeraichu-site → Deployments) : Arthur peut envoyer une capture.

## 5. Direction artistique

- Couleurs : washi `#F3EEE3`, gofun `#FBF9F4`, sumi `#1E1B18`, shu (cuivre) `#B85414`, shu foncé `#9A4410`,
  orange `#E5802B`, yamabuki `#F4C430`, brun `#3B2414`, nezumi `#6B665F`, line `#DDD5C6`, tint `#F8E8D4`.
- Polices : **Libre Caslon Display** (titres), **Libre Caslon Text** (texte, italique), police système pour l'interface.
- Motif « grecque » cuivre (`--raimon`) en bandeaux. Logo : carte orange bordée de brun, éclair jaune (`assets/img/marque.svg`).
- Ne jamais dessiner Raichu ni d'autres personnages ou visuels officiels Pokémon (droits d'auteur).

### Ajouts faits par Claude dans le dépôt (sans le téléphone)

- Déposer `_ajouts/cartes.json` + `_ajouts/photos/<réf>-<i>.jpg`, lancer `python3 _outils/construire.py . --garder`,
  puis **supprimer `_ajouts/`** avant le commit. Champs en plus de ceux du téléphone : `prix_sur_demande: true`
  (avec `prix_eur: null`), `variante` / `variante_en` pour une carte ancienne sans numéro (titre « Roigada (Neo Genesis,
  dos ancien) », comme les fiches d'origine), `edition` / `edition_en`, `categorie` (`vintage`…), `rarete_en`,
  `nouveau: false`, et les références de lot `L..`.
- Photo d'une fiche existante qui n'en a pas : `modifier.appliquer(racine, {réf: {}}, entre=...)` (le crochet `entre`
  crée les images avec `construire.make_images`). Vérifier ensuite la vignette : une fusion ratée se répare en
  rendant de nouveau la vignette (`modifier._render_tile`).

## 6. À faire ou à surveiller

- **Test de l'ajout de carte depuis le téléphone** sur pokeraichu.com : premier essai réel prévu par Arthur.
  Vérifier que la carte apparaît en 2 à 3 minutes et que le build Cloudflare est vert. Si le build échoue,
  demander la ligne `✘ [ERROR]` du journal.
- **Premier essai réel du bouton « Modifier »** depuis le téléphone : vérifier que la fiche change en 2 à 3 minutes
  et que le build Cloudflare est vert (le journal liste chaque fiche modifiée ou ignorée).
- **Tester le formulaire de contact** (réception sur la boîte d'Arthur via Email Routing).
- Quand Netlify aura de nouveau des crédits : vérifier que `pokeraichu.netlify.app` redirige bien vers pokeraichu.com,
  puis proposer à Arthur de verrouiller la publication automatique sur Netlify (« Lock to stop auto publishing »).
- Arthur doit mettre **pokeraichu.com** dans ses bios Instagram et TikTok.
- Idée proposée et non faite : une fiche « Boosters japonais » (Storm Emeralda, Méga Brave, Ninja Spinner) à l'unité.

## 7. Historique récent (commits)

- (19/11) Comptes clients (connexion Google) et éclairs : voir § Comptes clients et éclairs. Reste à faire par Arthur : ID client Google dans `config.js` (`google_client_id`) et base D1 liée (`d1_databases` dans `wrangler.jsonc`).
- (19/11) Ajout 345 Raikou-ex 108/076 KR et 346 Mentali-ex 211/187 KR (SAR, prix sur demande, pas encore sur Shopify comme les cartes du classeur). `construire.py` : la livraison d'une nouvelle fiche est reprise d'une fiche chiffrée si le modèle est en prix sur demande.
- (19/11) Gestion : petite photo à gauche du nom ; premier prix possible pour les cartes en prix sur demande
- (19/11) Bouton « Ventes eBay » dans la page de gestion ; « Nouveau pour vous » devient un petit sticker « New » au logo
  (l'ancien bandeau couvrait toute la carte : `.art::before` a un `inset`, il faut remettre `bottom` et `left` à `auto`)

- (19/11) Ventes de l'Excel marquées « Vendue » (liste `vendues` de config.js, quantités 005, 038, 201 baissées),
  30 cartes du classeur Ramoloss / Wattouat (réf. 315 à 344, prix sur demande, photos recadrées pour dépanner),
  photos du classeur pour 081, 083, 094, 098, lot vendu L04 (deux Psykokwak Gym, 43 €)

- (18/11) Bouton « Modifier » de la page de gestion (nom, état, Pokémon) + `_outils/modifier.py` dans la construction
- `e9f37c2` États « Excellent » des cartes d'avant 2012, photos des slabs PCA 231 et 232, Nymphali à 35 €
- `133799d` Ajout de cartes depuis la page de gestion (GitHub + build)
- `67e4073` Page de tirage au sort
- `7758e1a` Bouton « Annonce » (eBay, Vinted, Leboncoin)
- `f2c2f5d` Déménagement vers Cloudflare et l'adresse pokeraichu.com (worker formulaires, mentions légales, redirection Netlify)
- `92fd50c` Redirections compatibles Cloudflare
- `01cc236` Lien « Gestion » en pied de page, visible seulement sur l'appareil où la clé est enregistrée
