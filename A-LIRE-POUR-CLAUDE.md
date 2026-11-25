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
    - **Titre eBay en français + anglais** (`titreEbay`, 22/11) : nom FR / nom EN, numéro, note PSA, langue en anglais
      d'abord, puis code et nom anglais de l'extension, rareté, « Pokémon », langue en français, état, tant que ça tient
      dans 80 caractères (priorités, puis ordre de lecture). **L'anglais est réservé à eBay** (règle d'Arthur) :
      Vinted et Leboncoin ont titre et description 100 % en français, extension sous son nom français (`extFr` :
      `nom_fr`, sinon `nom` pour les sets japonais sans équivalent). La description eBay ajoute un bloc « — English — »
      (nom anglais, set, rareté, état, envoi) avant la réf.
    - **Titres eBay français + anglais** (section repliable de la page Gestion, `outils.js`) : une ligne par annonce eBay
      à renommer (cartes cochées « Annonce postée sur eBay » sur l'appareil, sinon toutes les cartes en vente), nouveau
      titre, « Copier », case « Titre changé sur eBay » gardée tant que le titre ne change pas (`pr.annonce.titres`).
      Claude n'a pas accès au compte eBay : le renommage se fait à la main, annonce par annonce.
    - **Photos** (22/11, deuxième version) : **Leboncoin** = photo rendue carrée, carte décalée à gauche, fond prolongé
      à partir des bords de la photo (ou fond flou voilé de papier si la carte touche les bords), et un **sceau** rond
      dans l'espace libre à droite (logo `assets/img/logo-photo.png`, « POKÉ-RAICHU » en arc, éclairs, ruban
      « pokeraichu.com ») placé pour rester visible dans la vignette, même recadrée en 4:3. Case cochée par défaut
      (`pr.annonce.tampon`). **eBay et Vinted = photos d'origine**, sans case : ils refusent logo et texte sur les
      photos (règlement « Picture policy » d'eBay ; Vinted, d'après Arthur). L'ancien bandeau sous la photo ne se voyait
      qu'en plein écran : abandonné. Les photos du site ne changent pas.
    - **Filtres et tri des annonces** (25/11, `outils.js`) : sous la recherche, chips « À poster · n » (carte
      disponible pas encore cochée sur les 3 canaux ; réservées et vendues à part) et « Postées partout · n » (les trois
      cases cochées), puis « Trier : Réf. | Prix décroissant | Prix croissant » (prix en direct compris, cartes sans prix
      à la fin, choix gardé dans `pr.gestion.tri`). Ligne de la carte : « Annonce postée sur eBay · à poster sur Vinted,
      Leboncoin » ou « ✓ Annonce postée sur les 3 canaux ». Une carte qu'on vient de changer depuis son annonce reste
      affichée (`garde`) jusqu'au prochain changement de filtre, de tri ou de recherche, et le compte ne la compte plus.
    - **Bouton « Cocher les 3 canaux »** en bas de chaque annonce (25/11, `annonce.js` › `finAnnonce`) : coche eBay,
      Vinted et Leboncoin d'un coup, referme l'annonce et ramène la ligne de la carte à l'écran ; « Tout décocher »
      quand les trois sont cochées. Les cases restent propres à chaque appareil (`pr.annonce.postees`).
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

### Prix en direct et Shopify (pour Claude)
- Le Gist `statuts.json` n'est **pas lisible depuis le terminal** (proxy : gist.github.com et gist.githubusercontent.com
  refusés, API `gists/` refusée car la session est liée au dépôt) ni par WebFetch sur le lien Raw (robots). Ce qui marche :
  **WebFetch sur la page `https://gist.github.com/arthurdemaria06-afk/dcf1d1b3bd2d78231c263bdcba55fc41`**, lue deux fois
  avec deux consignes différentes (JSON complet, puis liste CLÉ=VALEUR), et comparée. Ne pas passer par une branche
  GitHub Actions pour la lire (refusé le 25/11).
- Prix d'une carte = `prix` du Gist s'il existe (seuls les prix changés y sont), sinon `prix_eur` de `data/stock.json`.
- Shopify (synchro Whatnot) : SKU `PKR-<réf sans les zéros de tête>` (`PKR-78` = 078), plusieurs réfs d'une même fiche
  jointes par « - » (`PKR-38-210`, `PKR-118-119-120`) ; lots `PKR-L02`, gradées `PKR-G…`, boosters `PKR-BOOST-…` (hors
  site, prix gérés à part). Mise à jour des prix avec `productVariantsBulkUpdate`, plusieurs produits par appel (alias).

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
- **Noms d'extensions en français côté FR (depuis le 22/11)** : `extension.nom` reste le nom anglais d'origine
  (les adresses `extensions/<code-nom>.html` et `en/sets/` en dépendent : ne jamais le traduire). Le nom français est
  dans `extension.nom_fr` (stock.json, cartes et taxonomie) et dans le dictionnaire `EXT_FR` de `fiche.py`
  (clé `(code, nom anglais)`) ; `fiche.ext_nom(c, 'fr')` / `ext_label(c, 'fr')` l'utilisent pour les pages FR,
  `construire.py` remplit `nom_fr` tout seul pour les nouvelles cartes. **Nouvelle extension japonaise** : ajouter sa
  paire dans `EXT_FR` (nom officiel de l'équivalent français), sinon le nom anglais s'affiche aussi côté FR.
  Restent en anglais exprès : VMAX Climax, Pokémon GO, Pokémon VS (2001), Promo McDonald's 2025 ; les cartes FR
  (30C, DRI, ME04) ont déjà un nom français. La recherche accepte les deux noms (FR et EN). Les pages EN, les outils
  de gestion et le texte des annonces gardent le nom anglais. Images de partage (`assets/partage/`) des pages
  d'extension FR et de la collection 30e Anniversaire refaites avec le nom FR (même gabarit : Libre Caslon Display
  74 px, x 404, ligne de base 294, interligne 80 ; lignes compteurs et prix recopiées de l'ancienne image).
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
- `_outils/retirer.py` : **retire des fiches pour de bon** (carte qu'Arthur n'a plus) :
  `python3 _outils/retirer.py . <réf> <réf>…`. Supprime fiches FR/EN et photos, enlève vignettes, pochettes, options,
  encadrés et listes JSON-LD qui les citent, recompte pages Pokémon/extension/collections, accueil, catalogue et filtres,
  supprime les pages Pokémon ou extension devenues vides, nettoie `sitemap.xml`, `data/stock.json`, les index de recherche
  et `data/ebay.json`, et redirige (301) les anciennes adresses et les liens courts `/r/`, `/s/` vers la collection la
  plus proche dans `_redirects`. Penser aussi à Shopify (supprimer le produit) et au pilotage.
  `--vers=<réf>` : les fiches retirées sont des doublons d'une fiche gardée (adresses et liens courts y mènent).
  **Ne retirer que les réfs qu'Arthur nomme** : une fiche liée (lot, carte d'un coffret, même Pokémon) reste en ligne
  tant qu'il ne l'a pas citée (erreur du 20/11 : les cartes d'un coffret ouvert avaient été retirées avec le coffret).
- Compteurs « N fiches, M articles » des collections : `modifier.compteurs_collections(racine)` les recalcule depuis
  `stock.json` (pages de collection FR/EN, cartes de collection de l'accueil et de /collections, taxonomie). Appelé par
  `construire.py` (à chaque déploiement), `retirer.py` et `modifier.appliquer` : avant le 20/11, les cartes ajoutées
  n'étaient pas comptées dans les collections (Japon affichait 185 fiches pour 220).
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

- (25/11) Gestion : filtres « À poster » / « Postées partout », tri par prix, bouton « Cocher les 3 canaux » en bas de l'annonce.
- (23/11) Pilotage › Stock : bouton « € | % » sur les lignes, tuile Rentabilité pondérée des ventes.
- (22/11) Pilotage › Stock : le scellé compté avec les cartes (tuiles, liste, tableau).
- (22/11) Annonces : anglais seulement sur eBay (titre + bloc « English »), section « Titres eBay français + anglais »
  pour renommer les annonces en ligne, sceau Poké-Raichu sur les photos Leboncoin (photos d'origine pour eBay et Vinted).
- (22/11) Pilotage et Gestion en allemand : bouton FR | DE (`langue.js` + `langue-de.js`), voir § Pilotage › Langue allemande.
- (22/11) Pilotage : frais de vente par canal (Vinted 0 %).
- (22/11) Pilotage : dates de vente (chrono à partir du 22/11/2026, ventes passées sans date à l'achat + 7 j) ;
  « À compléter » = cartes sans prix de vente seulement.
- (22/11) Pilotage : mode sombre automatique (suit le réglage de l'iPad ou de l'iPhone).
- (22/11) Pilotage, étape 2 : Analyse, Coûts, SASU, Ventes, Stock, Achats et Voyages au format du nouveau tableau de bord.
- (22/11) Gestion › Annonce : titres eBay français + anglais, cadre Poké-Raichu sur les photos enregistrées.
- (22/11) Pilotage refait visuellement (tableau de bord filtrable façon Qlik, graphiques interactifs, rendu iPad) :
  voir § Pilotage › Refonte visuelle.
- (22/11) Noms d'extensions en français sur tout le site FR (filtres, fiches, pages d'extension, vignettes, titres,
  descriptions, pochettes, collection « 30e Anniversaire », images de partage) ; adresses inchangées ; EN inchangé
  (voir section 4).
- (20/11) 350 Rondoudou d'Érika 139/103 JP (5 €, vendue : liste `vendues` de config.js, `vendues_le` avancé) ;
  Darkrai & Cresselia LÉGENDE : une seule fiche, 038 (la paire en photo), à 2 exemplaires, 116 et 280 (moitiés)
  retirées et redirigées vers 038 (Shopify : PKR-38-210 à 2, PKR-116 et PKR-280 archivés) ; nouvelle photo du lot
  L04 avec les deux Psykokwak.
- (20/11) Bouton « remonter en haut » sur toutes les pages : flèche-éclair jaune sur rond noir (`.haut`, créé par site.js),
  visible après un demi-écran de défilement, rangé au-dessus du bouton WhatsApp, de la barre de réservation ou du salon.
- (20/11) Coffrets 30th Premium Deck ouverts (Arthur a 3 Mentali-ex 043, 3 Noctali-ex 044, 3 Victini 041 et 3 Zeraora
  042) et Pikachu-ex 132/M-P (nuit) FUR échangé contre des displays. Site : fiches S01 (coffret scellé) et 290 retirées
  via `_outils/retirer.py` ; 301, 302 et 303 passées à 3 exemplaires ; lots L02 et L03 gardés. Shopify : PKR-S01 et
  PKR-290 supprimés, PKR-301/302/303 (stock 3) et PKR-L02/L03 recréés. Pilotage : voir § Pilotage (`coffretOuvert`).
  Un premier passage avait retiré à tort 301, 302, 303, L02 et L03 (commit cd51463) : tout est revenu.
- (20/11) Mesure d'audience : l'appareil qui a la clé de gestion (`pr.gestion.jeton`) n'est jamais compté, et la case
  « Ne pas compter mes visites » (`pr.moi`) se coche toute seule dessus. Les visites passées restent dans Umami.
- (19/11) Ajout 347 Minotaupe 079/071 AR (SV5M), 348 Minotaupe 059/049 CHR (sm11b Dream League), 349 Démolosse 206/184 CHR (s8b), prix sur demande, brouillons Shopify PKR-347 à 349.
- (19/11) Comptes clients (connexion Google) et éclairs : voir § Comptes clients et éclairs. Reste à faire par Arthur : ID client Google dans `config.js` (`google_client_id`) et base D1 liée (`d1_databases` dans `wrangler.jsonc`).
- (19/11) Ajout 345 Raikou-ex 108/076 KR et 346 Mentali-ex 211/187 KR (SAR, prix sur demande ; Shopify : brouillons PKR-345 et PKR-346 à 0 €, à publier avec un prix). `construire.py` : la livraison d'une nouvelle fiche est reprise d'une fiche chiffrée si le modèle est en prix sur demande.
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


## Menu à trois traits et « Mes favoris » (19/11/2026)
- Le menu ☰ (bouton `.menu-btn`, tiroir `#menu-tiroir`) est construit par `assets/js/site.js` (bloc favoris) sur toutes les pages FR et EN : compte Google, Mes favoris, Ma sélection, Boutique (catalogue, nouveautés `?tri=recent`, coups de foudre, collections, Raichu, gradées), Services, liens de contact repris du pied de page, langue, mentions. Rien à modifier dans les pages HTML.
- Sous 480 px, le sélecteur FR/EN de l'en-tête est masqué : il est dans le menu.
- Côté visiteurs, les « éclairs » s'appellent désormais **favoris** (choix d'Arthur : « Coups de foudre » reste le nom de la vente flash de la semaine). Les clés techniques (`pokeraichu.eclairs.v1`, `/api/eclairs`, colonnes D1) ne changent pas.
- Vignettes : le bandeau Vendue/Réservée est en bas de la photo, l'éclair des favoris en haut à gauche.
- Mesure d'audience : `window.PR_TRACK(nom, données)` envoie un évènement Umami ; évènements ajoutés : `favori-ajout`, `menu-ouvert`, `menu`.

## Pilotage : contrôle de gestion privé (19/11/2026)

Arthur a demandé de transformer son Excel POKE-RAICHU en « véritable site de gestion » : c'est **/pilotage.html**
(lien dans le pied de page et dans le menu ☰, seulement sur l'appareil où la clé de gestion est enregistrée, et en bas de /gestion.html).

**Règle d'or : aucune donnée de gestion dans le dépôt (il est public).** Prix payés, marges, tickets, ventes vivent
dans la base D1 (binding DB), tables `pilotage` (version courante) et `pilotage_hist` (60 dernières versions).
- `worker/pilotage.js` : GET/PUT `/api/pilotage` (PUT = `{ base, data, note }`, 409 si la révision a changé),
  `/api/pilotage/historique`, `/api/pilotage/version?rev=N`. Appelé par `worker/comptes.js` après `estVendeur`
  (en-tête `x-gestion` = clé GitHub d'Arthur, même vérification que la liste des clients).
- `assets/js/pilotage-calcul.js` : moteur de calcul, mêmes règles que l'Excel (vérifié cellule par cellule : 335 cartes,
  34 tickets, lots, Synthèse, Ventes, 0 écart). Payé d'une carte : `achat.mode` = ticket (¥ × payé/total du ticket ÷ taux),
  yen (¥ ÷ taux), lot (payé du lot au prorata du prix marché), eur, ou rien (coût estimé = prix ÷ (1 + TVA + rentabilité)).
- `assets/js/pilotage.js` : l'application (Bord, Stock, fiche carte, Ventes, Achats/tickets, Lots, Scellé, Contrôles,
  Réglages). Chaque modification enregistre une version, avec « Annuler » 7 s. Hors ligne : gardé dans
  localStorage `pr.pilotage.attente` et proposé au retour. Vente : peut passer la fiche en « Vendue » dans le Gist
  (même format que /gestion.html) ; « Annuler » défait aussi le site.
- `assets/js/pilotage-xlsx.js` : export .xlsx sans bibliothèque (chargé à la demande). Sauvegarde/import .json dans Réglages.
- Photos : fiche du site (par n° ou `alias_site`), sinon fiche du site d'un exemplaire au nom identique, sinon image
  officielle Limitless TCG (`tpc/{SET}/{SET}_{n}_R_JP_SM|LG.png`, international `tpci/{SET}/{SET}_{nnn}_R_EN_…`),
  sinon le n°. `_headers` donne à /pilotage.html sa propre CSP (img-src + limitlesstcg.nyc3.cdn.digitaloceanspaces.com).
- Contrôles avec le site : `alias_site` (P1, P1-2, P1-3 = fiche 301 ; P2… = 302 ; P3… = 303), `lots_site` (L01 = 095 + G4784,
  L02 = P1 + P2, L03 = P3 + P4, L04 = 313 + 314), `refs_site` des produits (card sets = S02–S10).
- Coffrets ouverts (20/11) : `coffretOuvert()` de pilotage.js, appliqué une fois à l'ouverture et à chaque import (trace
  dans le journal et `meta.retraits` = `coffret-ouvert-2026-11-20`). Le produit « coffret » disparaît, ses cartes P1–P4
  passent du groupe « Coffret Premium Deck » (hors totaux) au groupe « 30 ans » (même coût et même valeur au total ;
  Victini et Zeraora à 0 € car le prix du coffret était réparti sur Mentali et Noctali), P1-2/P1-3, P2-2/P2-3 et
  P3-2/P3-3 sont ajoutées sans prix payé (3 exemplaires de chaque), le Pikachu FUR 290 est retiré. Si la version fautive
  du 20/11 au matin (`meta.retraits` = `retrait-2026-11-19`, cartes P1–P4 supprimées) est déjà passée, les cartes sont
  reprises dans l'historique des versions (dernière version avant la note « Retirés (plus en stock) »).
  `_outils/pilotage/extraire.py` reste fidèle au classeur : c'est pilotage.js qui fait la transformation.

**Document (schéma 1)** : `params` (taux_jpy, frais_vente, tva_import, rentabilite_estimee, frais_envoi,
gardees_dans_totaux), `groupes` (id, nom, ordre, hors_totaux), `cartes` (ref = n° du site, nom, groupe, cat, langue, prix,
yen, ticket, achat, vendu, prix_vendu, vente_date, canal, gardee, alias_site, lots_site, infos), `tickets` (id, boutique,
date, total_yen, detaxe_yen, detaxe_auto), `tickets_ecartes`, `lots` (id, paye_yen), `produits` (cardsets, ex,
boosters : quantite, prix_u, paye_u ou paye_total, frais_u, vendus, prix_reel_moyen, envois, composants), `journal`.

**Import / mise à jour depuis un Excel** : outils dans `_outils/pilotage/` (voir LISEZMOI.md). On ne transmet jamais les
données en clair : `chiffrer.py` dépose `pilotage/import-<id>.bin` (AES-GCM) et donne `#import=<id>.<clé>` ; Arthur
touche https://pokeraichu.com/pilotage.html#import=… et confirme. Supprimer le .bin du dépôt une fois l'import fait.
Premier import : POKE-RAICHU-VF.xlsx du 19/11/2026 (aucun chiffre de gestion à recopier ici : le dépôt est public).

**Onglet Analyse (vague 1, 19/11/2026)** : `assets/js/pilotage-analyse.js` (PRAnalyse), chargé avant pilotage.js.
- Découpages : bloc (d'après le code du set : M… = Méga Évolution, SV… = Écarlate et Violet, s… = Épée et Bouclier…),
  extension, rareté (déduite de `rarete`/`cat`/`nom`), PSA ou brute, type de produit (cartes brutes/gradées + scellé),
  langue, gamme de prix, groupe, canal. Hors « Type de produit », seules les cartes comptent (le scellé n'a pas de rareté).
- Par segment : écoulement = coût vendu ÷ coût total ; rentabilité réalisée = bénéfice net ÷ coût des ventes ;
  attendue = stock au prix marché × taux de réalisation (celui du segment s'il a ≥ 3 ventes, sinon du portefeuille),
  frais et envoi déduits ; retenue = (n ventes × réalisée + 5 × attendue) ÷ (n + 5).
- Avis : Renforcer / Sélectif / Rotation / Alléger selon la position face aux moyennes (rentabilité pondérée par le
  capital, écoulement global) ; « À tester » si < 3 ventes et < 5 articles, ou < 20 € investis ; « Coût à compléter »
  si plus de 50 % du coût est estimé ; « Données à compléter » si l'attribut manque.
- Budget du prochain voyage : poids = rentabilité retenue × max(écoulement, 5 %), plafond 40 % par segment, 10 % pour
  tester les 2 meilleurs « À tester » (≥ 2 articles). Budget gardé dans localStorage `pr.pilotage.budget`.
- Simulateur gradation : espérance sur 10 / 9 / reste au prix brut, frais de vente et d'envoi des réglages déduits,
  probabilité de 10 d'équilibre. Délai de vente : date d'achat de la carte, sinon date de son ticket ; « Dater mes ventes »
  remplit `vente_date` et `date_achat` manquantes.
- Onglets : Bord · Stock · Ventes · Analyse · Plus (Achats passe dans Plus ; sur ordinateur, liens « Gestion » sous les
  onglets). Analyse a des sous-onglets : Segments (#analyse), Coûts (#couts), Voyages (#voyages, #voyage/<id>).

**Charges, voyages, coûts complets (vague 2, 19/11/2026)** : `assets/js/pilotage-couts.js` (PRCouts), chargé avant pilotage.js.
- Document : `charges` [{ id, date, libelle, montant, devise 'EUR'|'JPY', tva, cat, cible 'general'|'voyage'|'carte', voyage, ref,
  recurrence 'mois'|'an', fin, heures (catégorie temps), note }], `voyages` [{ id, nom, debut, fin, note }] ; rattachement manuel
  par `voyage` sur un ticket, un lot, une carte ou un produit. Paramètres : taux_horaire, minutes_par_vente, cout_capital
  (défaut 1,7 % = Livret A au 01/08/2026), cle_voyage ('valeur' | 'nombre'), tva_recuperable (vague 3).
- Catégories alignées sur le PCG (6251 voyages, 6256 repas, 6241 transport sur achats, 611 gradation, 6222 commissions,
  6242 envois, 6064 fournitures, 651 abonnements, 626, 623, 627, 6226, 616, 635, 6063, 658, 628) avec nature
  (directe / structure / cachée) et comportement (variable / fixe). Les récurrences s'ajoutent jusqu'à aujourd'hui.
- Voyage d'une carte : `c.voyage`, sinon son lot, sinon son ticket (`voyage` ou date dans les dates du voyage), sinon sa
  date d'achat. Frais du voyage répartis au prorata du coût d'achat (ou par article). Coût complet = achat × (1 + TVA import)
  + quote-part voyage + frais directs rattachés à la carte.
- Cascade : CA → marge commerciale → frais d'achat des articles vendus (frais de voyage « déstockés ») → frais de vente →
  marge sur coûts directs → structure → résultat analytique → coûts cachés (temps, immobilisation au coût du capital,
  décote prix marché − prix vendu, dépréciation : coût complet > prix marché × réalisation − frais) → résultat économique.
- Seuil : coûts variables (achats vendus, frais proportionnels), charges fixes (voyages payés dans la période, structure) ;
  l'écart avec le résultat analytique = frais de voyage mis en stock ou déstockés. Point mort au rythme de la période.
- Sans charges ni voyages, le résultat analytique = bénéfice net de l'Excel (testé : `_outils/pilotage/test_couts.js`).
- Écrans : Plus › Charges (#charges), Analyse › Coûts, Analyse › Voyages (création proposée d'après les dates des tickets),
  bloc « Coût complet » sur la fiche d'une carte, « Après toutes tes charges » sur le Bord, feuilles Charges, Voyages, Coûts
  dans l'export Excel.

**SASU (vague 3, 19/11/2026)** : `assets/js/pilotage-fiscal.js` (PRFiscal), Analyse › SASU (#fiscal).
- Année complète simulée ; hypothèses préremplies d'après le rythme réel (ventes annualisées, coût d'achat en % du prix,
  part importée, voyages, charges), modifiables, gardées dans localStorage `pr.pilotage.sasu` (« Reprendre mes chiffres »).
- Règles 2026 vérifiées le 19/11/2026 : franchise de TVA 85 000 € / 93 500 € (inchangés en 2026, réforme à 25 000 €
  abandonnée) ; IS 15 % jusqu'à 42 500 € puis 25 % (CA < 10 M€, capital libéré, 75 % personnes physiques) ; dividendes
  PFU 31,4 % (12,8 % + 18,6 %) ou barème après 40 % ; réserve légale 5 % jusqu'à 10 % du capital ; président ≈ 80 % de
  cotisations sur le net ; CFE exonérée l'année de création (minimum 243–579 € si CA N-2 entre 5 000 et 10 000 €).
- TVA au réel : cartes de particuliers au régime de la marge (art. 297 A : marge × 20/120, carte par carte, pas de
  déduction), cartes importées ou achetées à un pro : TVA sur le prix, TVA d'achat ou d'import déductible. En franchise
  la TVA d'import (20 %) est un coût. Coût de la TVA au réel = TVA facturée (l'amont est récupéré) ; en franchise = TVA
  d'import + TVA des charges. Testé : écart de résultat avant IS = écart de coût de TVA.
- Provenance d'une carte : `c.provenance` ('import' | 'particulier' | 'pro'), sinon importée si ticket, yens ou lot.
  Modifiable dans « Modifier » de la fiche. Réglage `tva_recuperable` : charges comptées HT dans l'onglet Coûts.
- Sorties : comparaison franchise / réel, compte de résultat en SIG, IS, salaire ou dividendes (courbe de ce qui reste
  selon le salaire, optimum), ratios (marge, marque, coefficient, rotation, durée de stockage, BFR, poids des charges
  fixes, rentabilités). Mention « je ne suis ni expert-comptable ni avocat » affichée.

**Refonte visuelle (22/11/2026, demande d'Arthur : « niveau QlikSense », outil pro sur iPad)** :
- Rendu « application iPad » : police système partout (plus de Caslon dans le Pilotage), cartes blanches à filet fin sur
  fond neutre, barre latérale à partir de 1000 px, onglets en bas en dessous. Tout est sous `body.pl` dans
  `assets/css/pilotage.css` (variables `--pl-*` pour l'interface, `--g-*` pour les graphiques) : le site public n'est pas touché.
  Mise en page par requêtes de conteneur sur `.pl-main` : téléphone (1 colonne, tuiles par 2), 620–979 px (iPad portrait,
  Split View : 2 colonnes, `pl-m12` = pleine largeur), 980 px et plus (iPad paysage : grille de 12, classes `pl-c3`…`pl-c8`).
- `assets/js/pilotage-graph.js` (PRGraph) : graphiques maison en SVG/HTML, sans bibliothèque, compatibles CSP (aucun
  attribut style : CSSOM et attributs SVG) : `colonnes` (+ ligne), `courbe` (réticule), `barres` (classées, divergentes,
  repère), `nuage`, `cascade`, `tendance`, `jauge`, `parts`, `legende`. Infobulle au survol, au toucher et au clavier ;
  redessin à la largeur du cadre (ResizeObserver, `PRGraph.nettoyer()` à chaque rendu). Palette validée (script de contrôle
  daltonisme/contraste) : bleu `#2a78d6` puis orange `#eb6834` ; écart positif/négatif bleu/rouge ; gris = non sélectionné.
- `assets/js/pilotage-bord.js` (PRBord, testable dans Node) : « faits » (ventes, stock, achats), périodes (30 j, 90 j,
  12 mois, depuis le début), filtres, séries par jour/semaine/mois. **Sans filtre et sur « Depuis le début », les totaux
  retombent exactement sur ceux de pilotage-calcul.js** (vérifié sur 3 jeux fictifs, écart < 1e-11). Ventes de produits :
  lignes datées de leur `historique`, le reste en une ligne « sans date ». Une période ne garde que les ventes datées.
- Bord : barre de filtres collante (période, groupe, langue, canal) + sélections au toucher des graphiques (groupe, canal,
  langue, gamme de prix), comme dans Qlik : tout le tableau suit (`S.fb`). Tuiles avec écart vs la période d'avant et
  tendance ; CA et bénéfice dans le temps (ventes sans date en gris), investissement récupéré, bénéfice par groupe, ventes
  par canal et par langue, stock par groupe (trait = coût) et par gamme, meilleures ventes, plus grosses pièces.
  Chaque graphique a sa vue « Tableau » ; tableaux triables (`tableau(..., { cle })`, colonne `v`, mini-barres `barre`).
- Étape 2 (22/11) : toutes les vues au même format (grille, tuiles `kpi()`, `carte()` avec bouton « Tableau »).
  Analyse › Segments (nuage, tableau par segment, budget), Coûts (cascade des marges, seuil de rentabilité, parts),
  SASU (cascade, courbe « ce qui te reste »), Ventes (mêmes filtres partagés `S.fb` que le Bord), Stock (tuiles qui
  suivent les filtres, bascule Liste/Tableau `S.stockVue`, colonne « En stock depuis »), Achats (origine de
  l'investissement, dépenses par boutique, achats dans le temps, tickets triables), Voyages (une carte par voyage :
  retour potentiel, coût récupéré ; comparaison des retours et du poids des frais) et fiche voyage (frais en barres,
  seuil d'achats en jauge, ventes triables). Options PRGraph ajoutées : `nuage` log/diagonale/etiquettes/rayon,
  `cls` par catégorie dans `colonnes`, `signe` forcé dans `barres` (repère négatif pris dans l'échelle).
  Formats : estimations à l'euro, ventes réelles au centime ; métadonnées sans doublon (`sansDoublons`).
- Dates de vente (22/11, règle demandée par Arthur, `pilotage-calcul.js`) : les ventes actives commencent le 22/11/2026
  (`params.debut_ventes`, Réglages › Dates de vente) : le chrono des cartes en stock part de là (ou de leur achat, s'il
  est plus tard) → Stock « En vente depuis », délais d'Analyse « de la mise en vente à la vente ». Vente passée sans
  date : placée 7 jours après l'achat (`params.delai_vente_passee`), au plus tard le 22/11 ; sans date d'achat, la fin
  du voyage rattaché sert d'achat ; sans rien, délai de 7 jours compté mais vente « sans date » dans le temps.
  **`c.vente_date` n'est jamais écrit par la règle** : les moteurs lisent `r.date_vente` (retenue), `r.vente_estimee`,
  `r.mise_en_vente`, `r.delai_vente`, `r.delai_estime` ; affichage « vers le » / « ≈ ». Une vraie date saisie l'emporte.
- Vente annoncée par Arthur (Claude n'a pas la clé, donc pas accès à la compta D1) : 1) inscrire la réf dans
  `config.js` › `vendues` et avancer `vendues_le` (site) ; 2) lui donner le lien
  `https://pokeraichu.com/pilotage.html#vendre/REF?prix=50&canal=Vinted&date=AAAA-MM-JJ` : fiche de la carte + feuille
  de vente préremplie, il n'a qu'à toucher « Enregistrer » (canal = un des `CANAUX`). Jamais le prix dans le dépôt.
- Frais de vente par canal (22/11, `params.frais_canal`, Réglages › Frais de vente par canal) : taux propre au canal
  pour les cartes vendues dessus (Vinted 0 % par défaut : l'acheteur paie la protection), vide = taux général ;
  stock et scellé gardent le taux général. Seul écart voulu avec les règles de l'Excel. La feuille de vente montre
  le bénéfice avec les frais du canal choisi.
- « À compléter » (Stock) = cartes en stock **sans prix de vente** seulement (demande d'Arthur, 22/11 : il n'aura pas
  d'autres infos). Les cartes à coût estimé sont des cartes normales : plus de mention « coût estimé » dans les listes,
  plus d'alerte ni de section Contrôles pour elles (le libellé « Coût estimé » reste sur la fiche).
- Mode sombre (22/11) : suit le réglage de l'appareil (`prefers-color-scheme`), bloc à la fin de `pilotage.css` qui ne
  redéfinit que les jetons (`--pl-*`, `--g-*`) et quelques détails (flèche des listes, ombres). Plus aucune couleur en dur
  ailleurs : toute nouvelle couleur passe par un jeton avec ses deux valeurs. Palette sombre des graphiques validée sur la
  carte #1A1A19 ; `pilotage.html` a `color-scheme` et deux `theme-color` (clair/sombre).
- Test sans données réelles : banc local hors dépôt (données fictives tirées du stock public, API simulée, CSP du site,
  captures Playwright iPad 1376 px / portrait / Split View / iPhone, clair et sombre). Ne jamais mettre ces données dans le dépôt.
- **Bénéfice en € ou en % (23/11, demande d'Arthur)** : bouton « € | % » à côté de « Liste | Tableau » dans Stock
  (caché en Tableau, qui montre déjà Bénéfice et Rentab.). En %, chaque ligne affiche la rentabilité de la vente
  (`r.vente.rentab` = bénéfice ÷ coût) ou, pour une carte en stock, `r.gain` ; sans coût connu, la ligne reste en €.
  Choix gardé sur l'appareil (`pr.pilotage.unite`). Tuiles « Vendues » : Vendues (panier moyen en sous-titre),
  Encaissé, Bénéfice (% du prix de vente = taux de marque) et **Rentabilité pondérée** = Σ bénéfice ÷ Σ coût des
  cartes vendues filtrées (une grosse vente pèse plus qu'une petite).
- **Scellé dans le Stock (22/11, demande d'Arthur)** : la vue Stock compte le scellé comme les cartes. En-tête
  « N cartes et M produits scellés en stock » ; tuiles Valeur marché, Coût et Plus-value = cartes + scellé (détail
  « cartes … · scellé … » en sous-titre) ; liste : groupe « Scellé » (`ligneProduit`, touche → Plus › Scellé) puis
  « Cartes » ; en Tableau, un tableau Scellé au-dessus de celui des cartes. Le scellé sort dès qu'un filtre propre aux
  cartes est mis (groupe, catégorie, langue, À compléter, Vendues) ; la recherche le garde s'il correspond.
- **Langue allemande (22/11, demande d'Arthur pour sa compagne, allemande et expert-comptable)** : bouton FR | DE dans
  la barre du haut du Pilotage et en haut à droite de l'en-tête de la page Gestion (l'en-tête du site garde son FR | EN
  public). Choix mémorisé par appareil (`localStorage` `pr.langue`) ; la page se recharge au changement. En FR, rien ne
  change.
  - `assets/js/langue.js` : traduction au vol de la page (textes, `placeholder`, `aria-label`, `title`, `alt`, boutons,
    `alert/confirm/prompt`, titre de l'onglet), MutationObserver pour ce qui s'affiche ensuite. Les moteurs et les
    données ne sont pas touchés. Nombres et dates au format allemand (1.348 €, 22.11.2026 um 22:02, 6. Juli).
  - `assets/js/langue-de.js` (généré) : `PR_DE` = dictionnaire. Clé = texte français dont les nombres et dates sont
    remplacés par {0}, {1}… ; `[Karte|Karten]` choisit singulier ou pluriel selon le nombre qui précède. `PR_DE_RE` =
    motifs pour les textes qui contiennent une donnée (« Achats du voyage X », « N° 123 · … », « Frais du voyage « X » ») ;
    `PR_DE_CTX` = traductions selon l'endroit (« Annuler » dans un toast = « Rückgängig »).
  - Ordre de recherche : dictionnaire → motif → nombres seuls → phrase par phrase (sans couper après « réf. », « art. »)
    → séparateurs (` · `, ` : `, `, `…) → parenthèses → guillemets « » rendus „ “.
  - Restent en français, exprès (`translate="no"`) : noms des cartes et textes d'annonce (eBay, Vinted, Leboncoin).
    Noms d'extensions, de voyages et de boutiques = données, laissés tels quels.
  - **Tout nouveau texte français du Pilotage ou de la Gestion doit recevoir sa traduction dans `langue-de.js`**, sinon
    il reste en français en mode DE (sans rien casser). Le dictionnaire est produit sur le banc local hors dépôt :
    collecte de tous les textes de toutes les vues, lots traduits à la main, contrôle des restes en français.
  - Vocabulaire : Pilotage = Controlling ; « du » dans le Pilotage (comme le « tu »), « Sie » dans la Gestion (comme le
    « vous »). Marge = Handelsspanne, rentabilité = Rendite, bénéfice net = Nettogewinn, CA = Umsatz, charges =
    Aufwendungen, ticket = Beleg, coût complet = Vollkosten, seuil de rentabilité = Gewinnschwelle, scellé = Sealed,
    franchise = Kleinunternehmerregelung, réel = Regelbesteuerung, TVA sur la marge = Differenzbesteuerung, TVA = USt.,
    TVA d'achat = Vorsteuer, TVA import = Einfuhrumsatzsteuer, IS = Körperschaftsteuer, EBE = EBITDA, TMI =
    Grenzsteuersatz. La mention « TVA non applicable, art. 293 B du CGI » reste en français (c'est le texte de la facture).
