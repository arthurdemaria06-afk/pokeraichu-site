"""Chiffre modele.json pour l'import en un lien : pilotage/import-<id>.bin (iv 12 octets + AES-256-GCM)."""
import os, sys, base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
src, dossier = sys.argv[1], sys.argv[2]
cle = os.urandom(32); iv = os.urandom(12); ident = os.urandom(6).hex()
data = open(src, 'rb').read()
os.makedirs(dossier, exist_ok=True)
open(os.path.join(dossier, 'import-%s.bin' % ident), 'wb').write(iv + AESGCM(cle).encrypt(iv, data, None))
print('import=%s.%s' % (ident, base64.urlsafe_b64encode(cle).rstrip(b'=').decode()))
