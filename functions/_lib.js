
export const OWNER = 'abueelo';
const SESSION_DAYS = 7;

const enc = new TextEncoder();

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function secureFlag(request) {
  return new URL(request.url).protocol === 'https:' ? ' Secure;' : '';
}

export async function makeSessionCookie(request, env, login) {
  const expiry = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = `${login}.${expiry}`;
  const sig = await hmac(env.SESSION_SECRET, payload);
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  return `session=${payload}.${sig}; HttpOnly;${secureFlag(request)} SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

export async function sessionLogin(request, env) {
  const raw = getCookie(request, 'session');
  if (!raw) return null;
  const [login, expiry, sig] = raw.split('.');
  if (!login || !expiry || !sig) return null;
  if (Number(expiry) < Date.now()) return null;
  const expected = await hmac(env.SESSION_SECRET, `${login}.${expiry}`);
  if (sig !== expected) return null;
  return login;
}

export async function requireOwner(request, env) {
  const login = await sessionLogin(request, env);
  return login === OWNER ? login : null;
}

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...(init.headers || {}),
    },
  });
}

export function randomHex(bytes = 16) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function newImageId() {
  return Date.now().toString(36) + '-' + randomHex(4);
}

export function sniffImage(buf) {
  const b = new Uint8Array(buf);
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
  return null;
}

export function validImageId(id) {
  return typeof id === 'string' && /^[a-z0-9-]{1,40}$/.test(id);
}
