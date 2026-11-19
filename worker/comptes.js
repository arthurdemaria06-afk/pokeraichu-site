/* Poké-Raichu · comptes clients et listes d'éclairs (cartes favorites).
   - Connexion « Continuer avec Google » : le navigateur reçoit un jeton signé par Google (Google Identity Services),
     ce programme vérifie sa signature avec les clés publiques de Google, puis ouvre une session (cookie HttpOnly).
   - Données dans la base D1 liée sous le nom DB (wrangler.jsonc). Sans base liée, l'API répond 503 et le site
     garde les éclairs sur l'appareil du visiteur.
   - Espace vendeur (/gestion.html) : la liste des clients est réservée au propriétaire du dépôt GitHub du site,
     reconnu avec la clé GitHub déjà enregistrée sur son téléphone (elle n'est jamais stockée ici).
   - Pilotage (/pilotage.html) : mêmes conditions d'accès que la liste des clients, routes /api/pilotage dans pilotage.js.
   Aucune donnée de paiement. Le client peut supprimer son compte à tout moment (page Mes éclairs). */
import { EmailMessage } from 'cloudflare:email';
import { pilotage } from './pilotage.js';

const PROPRIETAIRE = 'arthurdemaria06-afk';
const COOKIE = 'pr_session';
const DUREE = 180 * 24 * 3600;           // session : 180 jours
const MAX_ECLAIRS = 400;
const REF = /^(\d{3,5}|[A-Z]\d{2}|G\d{4})$/;
const GOOGLE_ISS = ['accounts.google.com', 'https://accounts.google.com'];

/* ------------------------------------------------------------------ outils */
function json(data, status, extra) {
  const h = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  if (extra) Object.keys(extra).forEach(function (k) { h.append(k, extra[k]); });
  return new Response(JSON.stringify(data), { status: status || 200, headers: h });
}
function b64url(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function hex(buf) {
  return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
}
async function sha256(s) { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))); }
function nettoie(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n || 120); }
function refs(liste) {
  const vu = new Set();
  (Array.isArray(liste) ? liste : []).forEach(function (r) { r = String(r); if (REF.test(r)) vu.add(r); });
  return Array.from(vu).slice(0, MAX_ECLAIRS);
}
function cookie(request) {
  const m = (request.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([a-f0-9]{64})'));
  return m ? m[1] : null;
}
function setCookie(v, age) {
  return COOKIE + '=' + v + '; Path=/api/; Max-Age=' + age + '; HttpOnly; Secure; SameSite=Lax';
}
/* les écritures viennent forcément d'une page du site */
function memeOrigine(request) {
  const o = request.headers.get('origin');
  return !o || o === new URL(request.url).origin;
}

/* ------------------------------------------------------------------ réglages : identifiant Google lu dans config.js */
let idGoogle = null, idGoogleLu = 0;
export async function clientIdGoogle(env, request) {
  if (env.GOOGLE_CLIENT_ID) return String(env.GOOGLE_CLIENT_ID).trim();
  if (idGoogle !== null && Date.now() - idGoogleLu < 300000) return idGoogle;
  try {
    const r = await env.ASSETS.fetch(new Request(new URL('/config.js', request.url).toString()));
    const m = (await r.text()).match(/google_client_id\s*:\s*["']([^"']+)["']/);
    idGoogle = m ? m[1].trim() : '';
  } catch (e) { idGoogle = ''; }
  idGoogleLu = Date.now();
  return idGoogle;
}

/* ------------------------------------------------------------------ vérification du jeton Google (RS256) */
let cles = null, clesLues = 0;
async function clesGoogle(force) {
  if (!force && cles && Date.now() - clesLues < 3600000) return cles;
  const r = await fetch('https://www.googleapis.com/oauth2/v3/certs', { cf: { cacheTtl: 3600 } });
  if (!r.ok) throw new Error('clés Google indisponibles');
  cles = (await r.json()).keys || [];
  clesLues = Date.now();
  return cles;
}
export async function verifierJetonGoogle(jeton, aud, lireCles) {
  const p = String(jeton || '').split('.');
  if (p.length !== 3) throw new Error('jeton illisible');
  const tete = JSON.parse(new TextDecoder().decode(b64url(p[0])));
  const corps = JSON.parse(new TextDecoder().decode(b64url(p[1])));
  if (tete.alg !== 'RS256') throw new Error('algorithme refusé');
  let jwk = (await lireCles(false)).filter(function (k) { return k.kid === tete.kid; })[0];
  if (!jwk) jwk = (await lireCles(true)).filter(function (k) { return k.kid === tete.kid; })[0];
  if (!jwk) throw new Error('clé inconnue');
  const cle = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cle, b64url(p[2]), new TextEncoder().encode(p[0] + '.' + p[1]));
  if (!ok) throw new Error('signature invalide');
  const t = Math.floor(Date.now() / 1000);
  if (GOOGLE_ISS.indexOf(corps.iss) === -1) throw new Error('émetteur refusé');
  if (!aud || corps.aud !== aud) throw new Error('destinataire refusé');
  if (!(corps.exp > t - 60) || (corps.iat && corps.iat > t + 300)) throw new Error('jeton expiré');
  if (!corps.sub || !corps.email || corps.email_verified === false || corps.email_verified === 'false') throw new Error('e-mail non vérifié');
  return corps;
}

/* ------------------------------------------------------------------ base */
let schemaOk = false;
async function base(env) {
  if (!env.DB) return null;
  if (!schemaOk) {
    await env.DB.batch([
      env.DB.prepare('CREATE TABLE IF NOT EXISTS clients (id INTEGER PRIMARY KEY AUTOINCREMENT, google_sub TEXT UNIQUE NOT NULL, email TEXT NOT NULL, prenom TEXT, nom TEXT, langue TEXT, cree_le TEXT NOT NULL, vu_le TEXT NOT NULL)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS eclairs (client_id INTEGER NOT NULL, ref TEXT NOT NULL, ajoute_le TEXT NOT NULL, PRIMARY KEY (client_id, ref))'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, client_id INTEGER NOT NULL, expire INTEGER NOT NULL)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS sessions_client ON sessions (client_id)')
    ]);
    schemaOk = true;
  }
  return env.DB;
}
async function sessionClient(db, request) {
  const v = cookie(request);
  if (!v) return null;
  const h = await sha256(v);
  const row = await db.prepare('SELECT c.id, c.email, c.prenom, c.nom, c.cree_le FROM sessions s JOIN clients c ON c.id = s.client_id WHERE s.hash = ? AND s.expire > ?')
    .bind(h, Math.floor(Date.now() / 1000)).first();
  return row || null;
}
async function listeEclairs(db, id) {
  const r = await db.prepare('SELECT ref FROM eclairs WHERE client_id = ? ORDER BY ajoute_le DESC, ref').bind(id).all();
  return (r.results || []).map(function (x) { return x.ref; });
}
async function remplacerEclairs(db, id, liste) {
  const avant = new Set(await listeEclairs(db, id));
  const apres = refs(liste);
  const now = new Date().toISOString();
  const ops = [];
  avant.forEach(function (r) { if (apres.indexOf(r) === -1) ops.push(db.prepare('DELETE FROM eclairs WHERE client_id = ? AND ref = ?').bind(id, r)); });
  apres.forEach(function (r) { if (!avant.has(r)) ops.push(db.prepare('INSERT OR IGNORE INTO eclairs (client_id, ref, ajoute_le) VALUES (?, ?, ?)').bind(id, r, now)); });
  if (ops.length) await db.batch(ops);
  return listeEclairs(db, id);
}
function moi(c, eclairs) {
  return { client: { prenom: c.prenom || '', nom: c.nom || '', email: c.email, depuis: c.cree_le }, eclairs: eclairs };
}

/* ------------------------------------------------------------------ e-mail au vendeur pour chaque nouveau compte */
function b64(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function motEncode(s) { return /^[\x20-\x7e]*$/.test(s) ? s : '=?UTF-8?B?' + b64(s) + '?='; }
async function prevenir(env, c, eclairs) {
  const to = String(env.CONTACT_TO || '').trim();
  if (!env.MAIL || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return;
  const nom = ((c.prenom || '') + ' ' + (c.nom || '')).trim() || c.email;
  const corps = 'Nouveau compte client sur pokeraichu.com\n\n' + 'Nom : ' + nom + '\nE-mail : ' + c.email +
    '\nLangue : ' + (c.langue === 'en' ? 'anglais' : 'français') + '\nÉclairs à l’inscription : ' + (eclairs.length ? eclairs.join(', ') : 'aucun') +
    '\n\nToutes les fiches clients : https://pokeraichu.com/gestion.html (rubrique Clients).\n';
  const raw = [
    'From: ' + motEncode('Poké-Raichu (site)') + ' <site@pokeraichu.com>',
    'To: <' + to + '>',
    'Subject: ' + motEncode('Poké-Raichu · Nouveau compte · ' + nom.slice(0, 60)),
    'Date: ' + new Date().toUTCString().replace('GMT', '+0000'),
    'Message-ID: <' + crypto.randomUUID() + '@pokeraichu.com>',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64'
  ].join('\r\n') + '\r\n\r\n' + b64(corps).replace(/.{76}/g, '$&\r\n') + '\r\n';
  try { await env.MAIL.send(new EmailMessage('site@pokeraichu.com', to, raw)); } catch (e) {}
}

/* ------------------------------------------------------------------ vendeur : clé GitHub du propriétaire du dépôt */
const vendeurs = new Map();
async function estVendeur(request) {
  const t = (request.headers.get('x-gestion') || '').trim();
  if (!t || t.length > 300) return false;
  const h = await sha256(t);
  const v = vendeurs.get(h);
  if (v && Date.now() - v < 600000) return true;
  const r = await fetch('https://api.github.com/user', {
    headers: { authorization: 'Bearer ' + t, accept: 'application/vnd.github+json', 'user-agent': 'pokeraichu-site' }
  });
  if (!r.ok) return false;
  const u = await r.json();
  if (String(u.login || '').toLowerCase() !== PROPRIETAIRE) return false;
  vendeurs.set(h, Date.now());
  return true;
}

/* ------------------------------------------------------------------ routes /api/... */
export async function api(request, env) {
  const url = new URL(request.url);
  const chemin = url.pathname.replace(/\/+$/, '');
  const m = request.method;
  if (m !== 'GET' && !memeOrigine(request)) return json({ erreur: 'origine refusée' }, 403);
  let db;
  try { db = await base(env); } catch (e) { return json({ erreur: 'base indisponible' }, 503); }
  if (!db) return json({ erreur: 'comptes pas encore activés' }, 503);

  if (chemin === '/api/connexion' && m === 'POST') {
    const aud = await clientIdGoogle(env, request);
    if (!aud) return json({ erreur: 'connexion Google pas encore réglée' }, 503);
    let corps, info;
    try { corps = await request.json(); } catch (e) { return json({ erreur: 'requête illisible' }, 400); }
    try { info = await verifierJetonGoogle(corps && corps.credential, aud, clesGoogle); } catch (e) { return json({ erreur: 'connexion refusée' }, 401); }
    const now = new Date().toISOString();
    const langue = corps.langue === 'en' ? 'en' : 'fr';
    let c = await db.prepare('SELECT id, email, prenom, nom, cree_le, langue FROM clients WHERE google_sub = ?').bind(info.sub).first();
    const nouveau = !c;
    if (nouveau) {
      await db.prepare('INSERT INTO clients (google_sub, email, prenom, nom, langue, cree_le, vu_le) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(info.sub, nettoie(info.email, 200), nettoie(info.given_name || info.name, 80), nettoie(info.family_name, 80), langue, now, now).run();
      c = await db.prepare('SELECT id, email, prenom, nom, cree_le, langue FROM clients WHERE google_sub = ?').bind(info.sub).first();
    } else {
      await db.prepare('UPDATE clients SET email = ?, prenom = ?, nom = ?, vu_le = ? WHERE id = ?')
        .bind(nettoie(info.email, 200), nettoie(info.given_name || info.name, 80), nettoie(info.family_name, 80), now, c.id).run();
      c.email = nettoie(info.email, 200); c.prenom = nettoie(info.given_name || info.name, 80); c.nom = nettoie(info.family_name, 80);
    }
    /* les éclairs posés avant la connexion rejoignent le compte */
    const deja = await listeEclairs(db, c.id);
    const eclairs = await remplacerEclairs(db, c.id, deja.concat(refs(corps.eclairs)));
    const jeton = hex(crypto.getRandomValues(new Uint8Array(32)));
    const exp = Math.floor(Date.now() / 1000) + DUREE;
    await db.batch([
      db.prepare('INSERT INTO sessions (hash, client_id, expire) VALUES (?, ?, ?)').bind(await sha256(jeton), c.id, exp),
      db.prepare('DELETE FROM sessions WHERE expire < ?').bind(Math.floor(Date.now() / 1000))
    ]);
    if (nouveau) await prevenir(env, c, eclairs);
    return json(Object.assign(moi(c, eclairs), { nouveau: nouveau }), 200, { 'set-cookie': setCookie(jeton, DUREE) });
  }

  if (chemin === '/api/admin/clients' && m === 'GET') {
    let ok = false;
    try { ok = await estVendeur(request); } catch (e) { ok = false; }
    if (!ok) return json({ erreur: 'réservé au vendeur' }, 401);
    const cl = await db.prepare('SELECT id, email, prenom, nom, langue, cree_le, vu_le FROM clients ORDER BY cree_le DESC').all();
    const ec = await db.prepare('SELECT client_id, ref, ajoute_le FROM eclairs ORDER BY ajoute_le DESC').all();
    const par = {};
    (ec.results || []).forEach(function (e) { (par[e.client_id] = par[e.client_id] || []).push({ ref: e.ref, le: e.ajoute_le }); });
    return json({
      clients: (cl.results || []).map(function (c) {
        return { id: c.id, email: c.email, prenom: c.prenom, nom: c.nom, langue: c.langue, cree_le: c.cree_le, vu_le: c.vu_le, eclairs: par[c.id] || [] };
      })
    });
  }

  /* pilotage (contrôle de gestion) : réservé au vendeur, données dans pilotage.js */
  if (chemin === '/api/pilotage' || chemin.indexOf('/api/pilotage/') === 0) {
    let ok = false;
    try { ok = await estVendeur(request); } catch (e) { ok = false; }
    if (!ok) return json({ erreur: 'réservé au vendeur' }, 401);
    return pilotage(request, db, url);
  }

  const c = await sessionClient(db, request);
  if (chemin === '/api/moi' && m === 'GET') {
    if (!c) return json({ erreur: 'non connecté' }, 401);
    return json(moi(c, await listeEclairs(db, c.id)));
  }
  if (chemin === '/api/eclairs' && m === 'PUT') {
    if (!c) return json({ erreur: 'non connecté' }, 401);
    let corps;
    try { corps = await request.json(); } catch (e) { return json({ erreur: 'requête illisible' }, 400); }
    const eclairs = await remplacerEclairs(db, c.id, corps && corps.eclairs);
    await db.prepare('UPDATE clients SET vu_le = ? WHERE id = ?').bind(new Date().toISOString(), c.id).run();
    return json({ eclairs: eclairs });
  }
  if (chemin === '/api/deconnexion' && m === 'POST') {
    const v = cookie(request);
    if (v) await db.prepare('DELETE FROM sessions WHERE hash = ?').bind(await sha256(v)).run();
    return json({ ok: true }, 200, { 'set-cookie': setCookie('', 0) });
  }
  if (chemin === '/api/moi' && m === 'DELETE') {
    if (!c) return json({ erreur: 'non connecté' }, 401);
    await db.batch([
      db.prepare('DELETE FROM eclairs WHERE client_id = ?').bind(c.id),
      db.prepare('DELETE FROM sessions WHERE client_id = ?').bind(c.id),
      db.prepare('DELETE FROM clients WHERE id = ?').bind(c.id)
    ]);
    return json({ ok: true }, 200, { 'set-cookie': setCookie('', 0) });
  }
  return json({ erreur: 'introuvable' }, 404);
}

/* page du compte : la politique de sécurité autorise le bouton Google, et lui seul */
export const CSP_COMPTE = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' https://accounts.google.com/gsi/style; " +
  "script-src 'self' https://accounts.google.com/gsi/client; frame-src https://accounts.google.com/gsi/; font-src 'self'; " +
  "connect-src 'self' https://accounts.google.com/gsi/ https://cloud.umami.is https://gist.githubusercontent.com; worker-src 'self'; " +
  "manifest-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
