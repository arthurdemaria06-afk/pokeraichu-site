// Test du Worker : base D1 simulée (node:sqlite), GitHub simulé, module cloudflare:email remplacé.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const SRC = (process.env.PR_SITE || '/home/claude/pokeraichu-site') + '/worker/';
fs.mkdirSync('wtest', { recursive: true });
for (const f of ['formulaires.js', 'comptes.js', 'pilotage.js']) {
  let s = fs.readFileSync(SRC + f, 'utf8').replace("import { EmailMessage } from 'cloudflare:email';", "class EmailMessage { constructor(){} }");
  fs.writeFileSync('wtest/' + f, s);
}
class Stmt {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...a) { const s = new Stmt(this.db, this.sql); s.args = a; return s; }
  first() { const r = this.db.prepare(this.sql).get(...this.args); return Promise.resolve(r ? { ...r } : null); }
  all() { return Promise.resolve({ results: this.db.prepare(this.sql).all(...this.args).map(r => ({ ...r })) }); }
  run() { const r = this.db.prepare(this.sql).run(...this.args); return Promise.resolve({ success: true, meta: { changes: Number(r.changes) } }); }
}
class D1 {
  constructor() { this.db = new DatabaseSync(':memory:'); }
  prepare(sql) { return new Stmt(this.db, sql); }
  async batch(list) { this.db.exec('BEGIN'); try { const out = []; for (const s of list) out.push(await s.run()); this.db.exec('COMMIT'); return out; } catch (e) { this.db.exec('ROLLBACK'); throw e; } }
}
globalThis.fetch = async (url, opts = {}) => {
  if (String(url) === 'https://api.github.com/user') {
    const a = (opts.headers || {}).authorization || '';
    if (a === 'Bearer bon') return new Response(JSON.stringify({ login: 'arthurdemaria06-afk' }), { status: 200 });
    if (a === 'Bearer autre') return new Response(JSON.stringify({ login: 'quelquun' }), { status: 200 });
    return new Response('{}', { status: 401 });
  }
  throw new Error('fetch inattendu ' + url);
};
const worker = (await import('./wtest/formulaires.js')).default;
const env = { DB: new D1(), ASSETS: { fetch: async () => new Response('x') } };
const O = 'https://pokeraichu.com';
async function call(method, path, { token, body, origin } = {}) {
  const h = {};
  if (token) h['x-gestion'] = token;
  if (origin !== undefined) h['origin'] = origin; else if (method !== 'GET') h['origin'] = O;
  if (body !== undefined) h['content-type'] = 'application/json';
  const r = await worker.fetch(new Request(O + path, { method, headers: h, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) }), env);
  let j = null; try { j = await r.json(); } catch (e) {}
  return { s: r.status, j };
}
const modele = JSON.parse(fs.readFileSync('modele.json', 'utf8'));
let r;
r = await call('GET', '/api/pilotage'); assert.equal(r.s, 401);
r = await call('GET', '/api/pilotage', { token: 'faux' }); assert.equal(r.s, 401);
r = await call('GET', '/api/pilotage', { token: 'autre' }); assert.equal(r.s, 401);
r = await call('GET', '/api/pilotage', { token: 'bon' }); assert.equal(r.s, 200); assert.equal(r.j.rev, 0); assert.equal(r.j.data, null);
r = await call('PUT', '/api/pilotage', { token: 'bon', body: { base: 0, data: modele, note: 'Import' }, origin: 'https://ailleurs.example' }); assert.equal(r.s, 403);
r = await call('PUT', '/api/pilotage', { token: 'bon', body: { base: 0, data: { schema: 2 } } }); assert.equal(r.s, 400);
r = await call('PUT', '/api/pilotage', { token: 'bon', body: '{pas du json' }); assert.equal(r.s, 400);
r = await call('PUT', '/api/pilotage', { token: 'autre', body: { base: 0, data: modele } }); assert.equal(r.s, 401);
r = await call('PUT', '/api/pilotage', { token: 'bon', body: { base: 0, data: modele, note: 'Import de l’Excel' } }); assert.equal(r.s, 200, JSON.stringify(r.j)); assert.equal(r.j.rev, 1);
r = await call('GET', '/api/pilotage', { token: 'bon' }); assert.equal(r.j.rev, 1); assert.deepEqual(r.j.data, modele); assert.equal(r.j.note, 'Import de l’Excel');
r = await call('PUT', '/api/pilotage', { token: 'bon', body: { base: 0, data: modele } }); assert.equal(r.s, 409); assert.equal(r.j.rev, 1);
const m2 = structuredClone(modele); m2.cartes[0].prix = 900;
r = await call('PUT', '/api/pilotage', { token: 'bon', body: { base: 1, data: m2, note: 'Prix 102' } }); assert.equal(r.s, 200); assert.equal(r.j.rev, 2);
r = await call('GET', '/api/pilotage/historique', { token: 'bon' }); assert.equal(r.j.versions.length, 2); assert.equal(r.j.versions[0].rev, 2); assert.equal(r.j.versions[0].note, 'Prix 102');
r = await call('GET', '/api/pilotage/version?rev=1', { token: 'bon' }); assert.equal(r.s, 200); assert.equal(r.j.data.cartes[0].prix, 850);
r = await call('GET', '/api/pilotage/version?rev=99', { token: 'bon' }); assert.equal(r.s, 404);
r = await call('GET', '/api/pilotage/rien', { token: 'bon' }); assert.equal(r.s, 404);
let rev = 2;
for (let i = 0; i < 70; i++) { r = await call('PUT', '/api/pilotage', { token: 'bon', body: { base: rev, data: m2, note: 'n' + i } }); assert.equal(r.s, 200); rev = r.j.rev; }
r = await call('GET', '/api/pilotage/historique', { token: 'bon' }); assert.equal(r.j.versions.length, 60); assert.equal(r.j.versions[0].rev, 72); assert.equal(r.j.versions.at(-1).rev, 13);
const big = structuredClone(modele); big.meta.gros = 'x'.repeat(1900000);
r = await call('PUT', '/api/pilotage', { token: 'bon', body: { base: rev, data: big } }); assert.equal(r.s, 413);
// les autres routes marchent toujours
r = await call('GET', '/api/moi'); assert.equal(r.s, 401);
r = await call('GET', '/api/admin/clients', { token: 'bon' }); assert.equal(r.s, 200);
console.log('Worker : tous les tests passent. Taille du document :', JSON.stringify(modele).length, 'caractères');
