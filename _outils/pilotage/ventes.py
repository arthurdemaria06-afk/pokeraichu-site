"""Lien de ventes pour le Pilotage (25/11/2026) : chiffre une liste de ventes en pilotage/ventes-<id>.bin
(iv 12 octets + AES-256-GCM) et donne le lien https://pokeraichu.com/pilotage.html#ventes=<id>.<clé>.

Le JSON vient d'un fichier HORS du dépôt (ex. /tmp/ventes.json) :
  {"source": "<d'où viennent les ventes>",
   "frais_canal": {"<canal>": <taux entre 0 et 1>}, "frais_note": "<pourquoi ce taux, affiché sous la case>",
   "ventes": [{"ref": "<réf.>", "prix": <euros>, "date": "AAAA-MM-JJ", "canal": "<canal>", "note": "<commande, détail>"}],
   "cartes": [{"ref": "<réf. du site>", "nom": "<nom n°>", "nom_en": "…", "groupe": "Cartes", "cat": "<SAR, AR…>",
               "langue": "JP", "prix": <prix marché>, "set": "<code · nom>", "rarete": "…", "etat": "Near Mint",
               "achat": {"mode": "eur", "eur": <payé>}, "date_achat": "AAAA-MM-JJ ou null"}]}
ventes et cartes sont chacune facultatives (au moins une des deux).
(aucun chiffre réel dans ce fichier : le dépôt est public)
ref = réf. du site (ou N° du Pilotage) ; prix = ce qui reste de la vente, frais d'envoi payés par Arthur déduits ;
canal parmi CANAUX (null = à préciser) ; frais_canal (facultatif) = part du prix, entre 0 et 1.
Usage, depuis la racine du dépôt : python3 _outils/pilotage/ventes.py /tmp/ventes.json
Arthur touche le lien, relit la feuille « Ventes à enregistrer » et confirme. Le dépôt est public : seul le chiffré y
passe ; retirer le .bin une fois les ventes enregistrées."""
import os, sys, json, base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

CANAUX = ['WhatsApp', 'Instagram', 'eBay', 'Vinted', 'Leboncoin', 'Whatnot', 'Cardmarket', 'Salon', 'Dépôt-vente', 'Autre']
src = sys.argv[1]
racine = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if os.path.abspath(src).startswith(racine + os.sep):
    sys.exit('Le JSON en clair ne doit pas être dans le dépôt (public) : mets-le dans /tmp.')
doc = json.load(open(src, encoding='utf-8'))
ventes, cartes = doc.get('ventes') or [], doc.get('cartes') or []
assert isinstance(ventes, list) and isinstance(cartes, list) and (ventes or cartes), 'ni vente ni carte'
for a in cartes:
    assert str(a.get('ref', '')).strip() and str(a.get('nom', '')).strip(), a
    assert a.get('prix') is None or (isinstance(a['prix'], (int, float)) and a['prix'] >= 0), a
    ach = a.get('achat')
    assert ach is None or (ach.get('mode') == 'eur' and isinstance(ach.get('eur'), (int, float)) and ach['eur'] >= 0), a
for v in ventes:
    assert str(v.get('ref', '')).strip(), v
    assert isinstance(v.get('prix'), (int, float)) and v['prix'] >= 0, v
    assert v.get('canal') is None or v['canal'] in CANAUX, v   # None = canal à préciser
for cn, t in (doc.get('frais_canal') or {}).items():
    assert cn in CANAUX and 0 <= t < 1, (cn, t)
cle, iv, ident = os.urandom(32), os.urandom(12), os.urandom(6).hex()
sortie = os.path.join(racine, 'pilotage', 'ventes-%s.bin' % ident)
open(sortie, 'wb').write(iv + AESGCM(cle).encrypt(iv, json.dumps(doc, ensure_ascii=False).encode('utf-8'), None))
print(os.path.relpath(sortie, racine))
print('https://pokeraichu.com/pilotage.html#ventes=%s.%s' % (ident, base64.urlsafe_b64encode(cle).rstrip(b'=').decode()))
