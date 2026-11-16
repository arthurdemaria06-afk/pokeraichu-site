# Poké-Raichu · passation du site (à lire avant toute modification)

Mis à jour le 16 novembre 2026. Ce fichier résume l'état du site, comment il est hébergé et publié,
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

## 3. Les outils du vendeur (pages non référencées)

- **`/gestion.html`**. Sa clé GitHub (jeton à accès précis) est enregistrée dans le `localStorage` du téléphone
  (`pr.gestion.jeton`, une fois par adresse de site). Elle doit avoir : **Gists Read/write** et
  **Repository access `pokeraichu-site` · Contents Read and write**.
  - Statuts (disponible / réservée / vendue) et **prix en direct** : écrits dans un **Gist secret**
    (`statuts.json`, lien Raw dans `config.js` → `statuts_url`), lus par le site sans republier.
  - **Ajouter une carte au stock** (`assets/js/ajout.js`) : nom, photos (3 max, recadrées), prix…
    commit en un seul envoi de `_ajouts/cartes.json` + `_ajouts/photos/<ref>-<i>.jpg` via l'API Git Data
    (blobs → tree → commit → ref). Puis Cloudflare reconstruit le site.
  - **Bouton « Annonce »** (`assets/js/annonce.js`) : titre, prix, description et photos prêts à copier pour
    **eBay (80 car.), Vinted (60), Leboncoin (50)**. Écart de prix par plateforme et cases « postée sur… »
    gardés dans le `localStorage`. Rien n'est envoyé aux plateformes (Vinted interdit l'automatisation).
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

## 6. À faire ou à surveiller

- **Test de l'ajout de carte depuis le téléphone** sur pokeraichu.com : premier essai réel prévu par Arthur.
  Vérifier que la carte apparaît en 2 à 3 minutes et que le build Cloudflare est vert. Si le build échoue,
  demander la ligne `✘ [ERROR]` du journal.
- **Tester le formulaire de contact** (réception sur la boîte d'Arthur via Email Routing).
- Quand Netlify aura de nouveau des crédits : vérifier que `pokeraichu.netlify.app` redirige bien vers pokeraichu.com,
  puis proposer à Arthur de verrouiller la publication automatique sur Netlify (« Lock to stop auto publishing »).
- Arthur doit mettre **pokeraichu.com** dans ses bios Instagram et TikTok.
- Idée proposée et non faite : une fiche « Boosters japonais » (Storm Emeralda, Méga Brave, Ninja Spinner) à l'unité.

## 7. Historique récent (commits)

- `133799d` Ajout de cartes depuis la page de gestion (GitHub + build)
- `67e4073` Page de tirage au sort
- `7758e1a` Bouton « Annonce » (eBay, Vinted, Leboncoin)
- `f2c2f5d` Déménagement vers Cloudflare et l'adresse pokeraichu.com (worker formulaires, mentions légales, redirection Netlify)
- `92fd50c` Redirections compatibles Cloudflare
- `01cc236` Lien « Gestion » en pied de page, visible seulement sur l'appareil où la clé est enregistrée
