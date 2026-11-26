"""Lien de prix pour la page Gestion (26/11/2026) : chiffre une liste de prix en pilotage/prix-<id>.bin
(iv 12 octets + AES-256-GCM) et donne le lien https://pokeraichu.com/gestion.html#prix=<id>.<clé>.

Le JSON vient d'un fichier HORS du dépôt (ex. /tmp/prix.json) :
  {"source": "<d'où viennent les prix>", "prix": [{"ref": "<réf. du site>", "prix": <euros>}]}
Arthur ouvre le lien sur son téléphone (clé de gestion enregistrée), relit la liste « ancien → nouveau » et touche
« Appliquer » : chaque prix part dans le Gist comme une saisie à la main (un prix égal au prix publié retire le prix
en direct). À utiliser en plus de `modifier.py` (prix publié dans les fiches) ; seul l'ordre change : le Gist prime.
Usage, depuis la racine du dépôt : python3 _outils/pilotage/prix.py /tmp/prix.json   (retirer le .bin ensuite)."""
import os, sys, json, base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

src = sys.argv[1]
racine = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if os.path.abspath(src).startswith(racine + os.sep):
    sys.exit('Le JSON en clair ne doit pas être dans le dépôt : mets-le dans /tmp.')
doc = json.load(open(src, encoding='utf-8'))
assert isinstance(doc.get('prix'), list) and doc['prix'], 'aucun prix'
for x in doc['prix']:
    assert str(x.get('ref', '')).strip() and isinstance(x.get('prix'), (int, float)) and 0 < x['prix'] < 1e6, x
cle, iv, ident = os.urandom(32), os.urandom(12), os.urandom(6).hex()
sortie = os.path.join(racine, 'pilotage', 'prix-%s.bin' % ident)
open(sortie, 'wb').write(iv + AESGCM(cle).encrypt(iv, json.dumps(doc, ensure_ascii=False).encode('utf-8'), None))
print(os.path.relpath(sortie, racine))
print('https://pokeraichu.com/gestion.html#prix=%s.%s' % (ident, base64.urlsafe_b64encode(cle).rstrip(b'=').decode()))
