/*
  Poké-Raichu · réglages du site
  C'est le seul fichier à modifier à la main. Enregistrez, puis relancez la publication
  (python3 tools/publier.py ...) : certaines valeurs (livraison, remises, médiateur, TVA, réseaux)
  sont aussi écrites dans les pages et les données Google au moment de la génération.

  whatsapp         : numéro au format international, chiffres uniquement, sans « + » ni 0 initial.
                     Exemple pour 06 12 34 56 78 : "33612345678"
  instagram        : nom du compte, sans @. Exemple : "poke.raichu"
  email            : facultatif.
  ebay             : adresse de ta boutique ou de ton profil eBay (https://www.ebay.fr/...). Dès qu'elle est remplie,
                     un lien « Notre boutique eBay » apparaît en pied de page et sur la page Contact.
  ebay_evaluations : chiffres réels de ton profil eBay, recopiés à la main. Exemple : { pourcentage: 100, nombre: 42 }.
                     Rien ne s'affiche tant que « nombre » vaut 0.
  chaine_whatsapp  : lien de ta chaîne WhatsApp « Arrivages » (https://whatsapp.com/channel/...). Vide = boutons masqués.
  mesure_audience  : identifiant du site sur Umami Cloud (36 caractères, offre gratuite). Vide = aucune mesure.
  depot            : dépôt GitHub du site (« compte/nom »), où la page de gestion enregistre les cartes ajoutées.
                     Cloudflare reconstruit le site à chaque ajout. Vide = bouton « Ajouter une carte » désactivé.
  statuts_url      : lien « Raw » du Gist GitHub qui contient statuts.json (cartes réservées ou vendues en direct,
                     modifiables depuis /gestion.html sans republier). Vide = seulement la liste « reservees » ci-dessous.
  reservees        : références des cartes réservées en ce moment, ex. ["108", "113"]. Elles s'affichent
                     « Réservée » partout sur le site, et le bouton propose d'être prévenu si elles se libèrent.
  vendues          : références des cartes vendues, ex. ["010", "113"]. Elles s'affichent « Vendue » partout sur le site,
                     même sans le Gist. La page /gestion.html les reprend et les écrit dans le Gist au prochain enregistrement.
  google_client_id : identifiant OAuth « Application Web » de Google Cloud (se termine par .apps.googleusercontent.com).
                     Vide : pas de bouton « Continuer avec Google », les éclairs restent sur l'appareil du visiteur.
  vendues_le       : date de la liste « vendues » (format ISO, heure UTC). Dès que le Gist est enregistré après cette date,
                     c'est lui qui fait foi (une carte remise en vente depuis /gestion.html redevient disponible).
  taux_change      : taux indicatifs (1 € = ...) : prix en £ et $ de la version anglaise, calculateur d'import (JPY).
  livraison        : prix indicatifs à la charge de l'acheteur, par zone. « offerte_des » : livraison offerte
                     en France métropolitaine dès ce montant d'achat (après remise). null = sur devis.
                     carte = 1 à 5 cartes brutes · cartes = 6 cartes et plus · slab = 1 slab · slabs = 2 ou 3 slabs
                     · scelle = 1 produit scellé.
  remises          : remises par nombre de cartes (hors pièces à prix sur demande), ex. [{ des: 3, pourcent: 5 }].
                     [] = aucune remise (paliers −5 % / −10 % retirés le 25/11/2026).
  coups_de_foudre  : la vente flash de la semaine (onglet « Coups de foudre »). « du » et « au » : premier et dernier jour,
                     au format AAAA-MM-JJ (de 0 h le premier jour à 23 h 59 le dernier, heure de Paris). « cartes » :
                     les références et leurs prix flash, par exemple { ref: "095", prix: 179 }. Le prix barré est calculé
                     automatiquement : le plus bas des 30 jours précédents (la publication refuse un prix qui n'est pas une baisse,
                     une carte à prix sur demande ou une carte qui n'était pas encore en vente). « video » (facultatif) : lien
                     https d'une vidéo Instagram ou TikTok, pour la semaine ou pour une carte. Vidéos hébergées sur le site : dépose
                     videos/semaine.mp4 et videos/<réf>.mp4 (ou .mov) avant de publier. Une fois la semaine finie, l'onglet affiche
                     « prochaine sélection bientôt » tout seul ; vide « cartes » ou remplace la sélection pour la semaine suivante.
  tva              : "" (non affiché), "franchise" (« TVA non applicable, art. 293 B du CGI »),
                     "occasion" (régime particulier des biens d'occasion, art. 297 A du CGI)
                     ou "normal" (prix TTC, TVA 20 % incluse). À valider avec ton comptable.
  mediateur        : médiateur de la consommation auquel tu as adhéré (obligatoire pour vendre à des particuliers).
                     Exemple : { nom: "CM2C", adresse: "49 rue de Ponthieu, 75008 Paris", site: "https://www.cm2c.net" }
  legal            : informations obligatoires des mentions légales (page /mentions-legales.html).
  boutique         : à remplir à l'ouverture. L'adresse s'affiche alors sur l'accueil et la page Contact,
                     et Google reçoit les informations du magasin (adresse, horaires, téléphone).
                     horaires_google : mêmes horaires au format international, ex. "Tu-Sa 10:00-19:00".

  Tant que « whatsapp » est vide, les boutons « Réserver » ouvrent Instagram, puis l'e-mail,
  et à défaut la page Contact.
*/
window.PR_CONFIG = {
  whatsapp: "33659379881",
  reservees: [],
  vendues: ["010", "011", "012", "027", "031", "032", "058", "077", "084", "088", "094", "097", "113", "117", "125", "234", "281", "290", "345", "350", "G1633", "G1830", "L04"],
  vendues_le: "2026-11-25T18:45:00Z",
  google_client_id: "353695117013-jmqarchqnv5tn8stoklm7rdgkebdueuu.apps.googleusercontent.com",
  instagram: "",
  email: "",
  ebay: "",
  ebay_evaluations: { pourcentage: 0, nombre: 0 },
  chaine_whatsapp: "",
  mesure_audience: { umami: "b930f619-59f5-49bb-8bdc-cd87162a0a0b" },
  depot: "arthurdemaria06-afk/pokeraichu-site",
  statuts_url: "https://gist.githubusercontent.com/arthurdemaria06-afk/dcf1d1b3bd2d78231c263bdcba55fc41/raw/statuts.json",
  taux_change: { date: "26/10/2026", GBP: 0.8382, USD: 1.1188, JPY: 176.15 },
  livraison: {
    offerte_des: 100,
    zones: {
      fr: { carte: 4.5, cartes: 7.5, slab: 6.5, slabs: 9.5, scelle: 11.5 },
      ue: { carte: 8.5, cartes: 16, slab: 15.5, slabs: 16.5, scelle: 21 },
      uk: { carte: 8.5, cartes: 16, slab: 15.5, slabs: 20.5, scelle: 25 },
      monde: { carte: 8.5, cartes: 16, slab: 15.5, slabs: 21, scelle: null }
    }
  },
  coups_de_foudre: {
    du: "2026-11-02",
    au: "2026-11-08",
    video: "",
    cartes: [
      { ref: "106", prix: 85 },
      { ref: "001", prix: 135 },
      { ref: "098", prix: 46 },
      { ref: "204", prix: 36 },
      { ref: "071", prix: 29 },
    ]
  },
  remises: [],
  tva: "",
  mediateur: { nom: "", adresse: "", site: "" },
  legal: {
    raison_sociale: "",
    forme: "",
    siege: "",
    siren: "",
    directeur: ""
  },
  boutique: {
    adresse: "",
    code_postal: "",
    ville: "Mandelieu-la-Napoule",
    horaires: "",
    horaires_google: ""
  }
};
