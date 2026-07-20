// shared helpers for the edit-page API functions

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

export async function makeSessionCookie(env, login) {
  const expiry = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = `${login}.${expiry}`;
  const sig = await hmac(env.SESSION_SECRET, payload);
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  return `session=${payload}.${sig}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

// returns the logged-in owner's login, or null
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
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
}

export function randomHex(bytes = 16) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}
