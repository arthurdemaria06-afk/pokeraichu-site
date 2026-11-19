/* Poké-Raichu · formulaires du site (contact, alerte d'arrivage, recherche au Japon).
   Les pages et fichiers sont servis tels quels par Cloudflare ; ce petit programme ne reçoit que les envois de formulaires
   et les transmet par e-mail (Cloudflare Email Routing) à l'adresse enregistrée dans le secret CONTACT_TO.
   Rien n'est stocké. Sans réglage e-mail, l'envoi échoue proprement et le site propose WhatsApp. */
import { EmailMessage } from 'cloudflare:email';
import { api, CSP_COMPTE } from './comptes.js';

const FROM = 'site@pokeraichu.com';
const NOMS = { contact: 'Contact', alerte: 'Alerte d’arrivage', recherche: 'Recherche au Japon' };
const LIBELLES = {
  nom: 'Nom', email: 'E-mail', sujet: 'Sujet', reference: 'Référence', message: 'Message', carte: 'Carte',
  recherche: 'Recherche', q: 'Carte recherchée', details: 'Détails', description: 'Description',
  budget: 'Budget', etat: 'État', version: 'Version', langue: 'Langue du site'
};
const MAX = 12000;

export function propre(v, n) {
  return String(v == null ? '' : v).replace(/\r\n?/g, '\n').slice(0, n || 4000).trim();
}
export function enTete(v) { return propre(v, 300).replace(/[\r\n]+/g, ' '); }
export function emailValide(v) { return /^[^\s@<>()",;:]{1,64}@[^\s@<>()",;:]{1,190}\.[A-Za-z]{2,24}$/.test(v); }

function b64(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function motEncode(s) { return /^[\x20-\x7e]*$/.test(s) ? s : '=?UTF-8?B?' + b64(s) + '?='; }

/* message brut (RFC 5322), texte seul en UTF-8 */
export function composer(champs, to, quand) {
  const form = enTete(champs['form-name'] || 'contact');
  const nomForm = NOMS[form] || form;
  const email = enTete(champs.email);
  const lignes = [];
  Object.keys(champs).forEach(function (k) {
    if (k === 'form-name' || k === 'bot-field') return;
    const v = propre(champs[k]);
    if (!v) return;
    lignes.push((LIBELLES[k] || k) + ' : ' + (v.indexOf('\n') !== -1 ? '\n' + v : v));
  });
  const corps = 'Nouveau message depuis le formulaire « ' + nomForm + ' » de pokeraichu.com\n\n' + lignes.join('\n\n') +
    '\n\n—\n' + (emailValide(email) ? 'Répondez directement à ce message pour écrire à ' + email + '.' : 'Pas d’adresse e-mail valide fournie.') + '\n';
  const sujet = 'Poké-Raichu · ' + nomForm + (champs.nom ? ' · ' + enTete(champs.nom).slice(0, 60) : '') +
    (champs.reference ? ' · réf. ' + enTete(champs.reference).slice(0, 12) : '');
  const id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) + '@pokeraichu.com';
  const h = [
    'From: ' + motEncode('Poké-Raichu (site)') + ' <' + FROM + '>',
    'To: <' + to + '>',
    'Subject: ' + motEncode(sujet),
    'Date: ' + (quand || new Date()).toUTCString().replace('GMT', '+0000'),
    'Message-ID: <' + id + '>',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64'
  ];
  if (emailValide(email)) h.splice(2, 0, 'Reply-To: <' + email + '>');
  const body = b64(corps).replace(/.{76}/g, '$&\r\n');
  return h.join('\r\n') + '\r\n\r\n' + body + '\r\n';
}

async function lireChamps(request) {
  const type = request.headers.get('content-type') || '';
  const texte = await request.text();
  if (texte.length > MAX) return null;
  if (/application\/x-www-form-urlencoded/i.test(type)) return Object.fromEntries(new URLSearchParams(texte));
  if (/multipart\/form-data/i.test(type)) {
    const fd = await new Request('https://x/', { method: 'POST', headers: { 'content-type': type }, body: texte }).formData();
    const o = {};
    fd.forEach(function (v, k) { if (typeof v === 'string') o[k] = v; });
    return o;
  }
  return null;
}

async function formulaire(request, env) {
  const champs = await lireChamps(request);
  if (!champs || !NOMS[champs['form-name']]) return new Response('Formulaire inconnu', { status: 400 });
  /* piège à robots : on fait comme si tout s'était bien passé */
  if (champs['bot-field']) return new Response('ok');
  const to = String(env.CONTACT_TO || '').trim();
  if (!env.MAIL || !emailValide(to)) return new Response('Envoi par e-mail non configuré', { status: 503 });
  const msg = new EmailMessage(FROM, to, composer(champs, to));
  await env.MAIL.send(msg);
  return new Response('ok');
}

/* mêmes en-têtes de sécurité que _headers, pour les pages qui passent par ce programme */
const SECU = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Speculation-Rules': '"/regles-navigation.json"',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self' https://cloud.umami.is https://gist.githubusercontent.com https://api.github.com; worker-src 'self'; manifest-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
};
function securiser(res) {
  if (!/text\/html/i.test(res.headers.get('content-type') || '')) return res;
  const r = new Response(res.body, res);
  Object.keys(SECU).forEach(function (k) { if (!r.headers.has(k)) r.headers.set(k, SECU[k]); });
  return r;
}

/* adresses sans « .html » ou en « / » (comme chez Netlify) : /en/ -> /en/index.html, /catalogue -> /catalogue.html */
async function page(request, env) {
  const res = await env.ASSETS.fetch(request);
  if (res.status !== 404) return res;
  const url = new URL(request.url);
  const essais = url.pathname.endsWith('/') ? [url.pathname + 'index.html']
    : /\.[a-z0-9]+$/i.test(url.pathname) ? [] : [url.pathname + '.html', url.pathname + '/index.html'];
  for (const p of essais) {
    const u = new URL(url); u.pathname = p;
    const r = await env.ASSETS.fetch(new Request(u.toString(), request));
    if (r.status === 200) return r;
  }
  return res;
}

export default {
  async fetch(request, env) {
    const chemin = new URL(request.url).pathname;
    /* comptes clients et éclairs (voir comptes.js) */
    if (chemin.indexOf('/api/') === 0) {
      try { return await api(request, env); } catch (e) {
        return new Response('{"erreur":"indisponible"}', { status: 500, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
      }
    }
    if (request.method === 'POST') {
      const url = new URL(request.url);
      let res;
      try { res = await formulaire(request, env); } catch (e) { res = new Response('Échec de l’envoi', { status: 502 }); }
      /* envoi sans JavaScript (formulaire classique) : retour sur la page avec ?envoye=1 */
      const nav = (request.headers.get('sec-fetch-mode') || '') === 'navigate';
      if (nav && url.pathname !== '/' && res.ok) {
        url.searchParams.set('envoye', '1');
        return Response.redirect(url.toString(), 303);
      }
      return res;
    }
    const res = securiser(await page(request, env));
    if (/^\/(compte|en\/account)(\.html)?$/.test(chemin) && /text\/html/i.test(res.headers.get('content-type') || '')) {
      const r = new Response(res.body, res);
      r.headers.set('Content-Security-Policy', CSP_COMPTE);
      return r;
    }
    return res;
  }
};
