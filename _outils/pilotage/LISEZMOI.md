# Pilotage : outils de Claude (non publiés)

Ces scripts ne contiennent aucune donnée. Ils servent à (re)construire le document du pilotage à partir de l'Excel
POKE-RAICHU, à vérifier les calculs et à fabriquer le lien d'import chiffré.

Copier ce dossier hors du dépôt (ex. /home/claude/pilotage), y mettre l'Excel d'Arthur, puis
(PR_SITE = chemin du dépôt, /home/claude/pokeraichu-site par défaut) :

    python3 extraire.py POKE-RAICHU.xlsx        # → modele.json (document, schéma 1) + lignes.json (n° → ligne Excel)
    python3 verifier.py POKE-RAICHU.xlsx        # moteur Python = valeurs de l'Excel, carte par carte (0 écart attendu)
    python3 attendu.py                          # → attendu.json (sortie du moteur Python)
    node test_calcul.js                         # moteur JS (assets/js/pilotage-calcul.js) = moteur Python = Excel
    node test_worker.mjs                        # API /api/pilotage avec une base D1 simulée (node:sqlite)
    python3 chiffrer.py modele.json ../pokeraichu-site/pilotage   # → pilotage/import-<id>.bin + « import=<id>.<clé> »

Lien à donner à Arthur : https://pokeraichu.com/pilotage.html#import=<id>.<clé>
La clé n'existe que dans ce lien (jamais dans le dépôt). Supprimer pilotage/import-<id>.bin une fois l'import fait.
