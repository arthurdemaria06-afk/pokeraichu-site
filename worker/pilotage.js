/* Poké-Raichu · pilotage (contrôle de gestion privé, page /pilotage.html).
   Toutes les données de gestion (prix payés, marges, tickets, ventes) forment un seul document JSON,
   enregistré par révisions dans la base D1 (binding DB). Elles ne passent jamais par le dépôt GitHub, qui est public.
   Accès réservé au vendeur : comptes.js vérifie l'en-tête x-gestion (clé GitHub du téléphone) avant d'appeler ce module.
   - GET  /api/pilotage                    → { rev, maj, note, data }   (data = null tant que rien n'est importé)
   - PUT  /api/pilotage { base, data, note } → { rev, maj }            (409 si quelqu'un a enregistré entre-temps)
   - GET  /api/pilotage/historique         → { versions: [{ rev, maj, note, taille }] }  (les 60 dernières)
   - GET  /api/pilotage/version?rev=N      → { rev, maj, note, data }  (pour restaurer une ancienne version) */

const TAILLE_MAX = 1800000;   // la base refuse une ligne de plus de 2 Mo
const GARDER = 60;            // nombre de versions gardées dans l'historique

function reponse(texte, status) {
  return new Response(texte, { status: status || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
function json(data, status) { return reponse(JSON.stringify(data), status); }
function note(v) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200); }

let pret = false;
async function tables(db) {
  if (pret) return;
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS pilotage (id INTEGER PRIMARY KEY CHECK (id = 1), rev INTEGER NOT NULL, maj TEXT NOT NULL, note TEXT, data TEXT NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS pilotage_hist (rev INTEGER PRIMARY KEY, maj TEXT NOT NULL, note TEXT, taille INTEGER NOT NULL, data TEXT NOT NULL)')
  ]);
  pret = true;
}

function documentValide(d) {
  return d && typeof d === 'object' && !Array.isArray(d) && d.schema === 1 && Array.isArray(d.cartes) && d.params && typeof d.params === 'object';
}

export async function pilotage(request, db, url) {
  await tables(db);
  const chemin = url.pathname.replace(/\/+$/, '');
  const m = request.method;

  if (chemin === '/api/pilotage' && m === 'GET') {
    const row = await db.prepare('SELECT rev, maj, note, data FROM pilotage WHERE id = 1').first();
    if (!row) return json({ rev: 0, maj: null, note: '', data: null });
    /* le document est renvoyé tel qu'il est enregistré, sans le relire */
    return reponse('{"rev":' + Number(row.rev) + ',"maj":' + JSON.stringify(row.maj) + ',"note":' + JSON.stringify(row.note || '') + ',"data":' + row.data + '}');
  }

  if (chemin === '/api/pilotage' && m === 'PUT') {
    const texte = await request.text();
    if (texte.length > TAILLE_MAX) return json({ erreur: 'données trop volumineuses' }, 413);
    let corps;
    try { corps = JSON.parse(texte); } catch (e) { return json({ erreur: 'requête illisible' }, 400); }
    if (!corps || !documentValide(corps.data)) return json({ erreur: 'données invalides' }, 400);
    const base = Number(corps.base);
    if (!Number.isInteger(base) || base < 0) return json({ erreur: 'révision manquante' }, 400);
    const data = JSON.stringify(corps.data);
    if (data.length > TAILLE_MAX) return json({ erreur: 'données trop volumineuses' }, 413);
    const rev = base + 1;
    const maj = new Date().toISOString();
    const n = note(corps.note);
    /* écriture conditionnelle : sans effet si la révision a changé depuis la lecture (autre appareil, autre onglet) */
    await db.prepare(
      'INSERT INTO pilotage (id, rev, maj, note, data) VALUES (1, ?, ?, ?, ?) ' +
      'ON CONFLICT(id) DO UPDATE SET rev = excluded.rev, maj = excluded.maj, note = excluded.note, data = excluded.data WHERE pilotage.rev = ?'
    ).bind(rev, maj, n, data, base).run();
    /* relecture : c'est bien notre version qui est enregistrée ? */
    const cur = await db.prepare('SELECT rev, maj FROM pilotage WHERE id = 1').first();
    if (!cur || Number(cur.rev) !== rev || cur.maj !== maj) {
      return json({ erreur: 'conflit', rev: cur ? Number(cur.rev) : 0 }, 409);
    }
    await db.batch([
      db.prepare('INSERT OR REPLACE INTO pilotage_hist (rev, maj, note, taille, data) VALUES (?, ?, ?, ?, ?)').bind(rev, maj, n, data.length, data),
      db.prepare('DELETE FROM pilotage_hist WHERE rev <= ?').bind(rev - GARDER)
    ]);
    return json({ rev: rev, maj: maj });
  }

  if (chemin === '/api/pilotage/historique' && m === 'GET') {
    const r = await db.prepare('SELECT rev, maj, note, taille FROM pilotage_hist ORDER BY rev DESC LIMIT ?').bind(GARDER).all();
    return json({ versions: (r.results || []).map(function (v) { return { rev: Number(v.rev), maj: v.maj, note: v.note || '', taille: Number(v.taille) }; }) });
  }

  if (chemin === '/api/pilotage/version' && m === 'GET') {
    const n = Number(url.searchParams.get('rev'));
    if (!Number.isInteger(n) || n < 1) return json({ erreur: 'révision invalide' }, 400);
    const row = await db.prepare('SELECT rev, maj, note, data FROM pilotage_hist WHERE rev = ?').bind(n).first();
    if (!row) return json({ erreur: 'version introuvable' }, 404);
    return reponse('{"rev":' + Number(row.rev) + ',"maj":' + JSON.stringify(row.maj) + ',"note":' + JSON.stringify(row.note || '') + ',"data":' + row.data + '}');
  }

  return json({ erreur: 'introuvable' }, 404);
}
