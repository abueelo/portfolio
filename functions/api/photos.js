import { requireOwner, json, randomHex } from '../_lib.js';

const KEY = 'photos';
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_ROWS = 200;
const MAX_LEN = { title: 120, location: 120, taken: 60 };

function sniff(buf) {
  const b = new Uint8Array(buf);
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
  return null;
}

export async function onRequestGet({ env }) {
  const photos = await env.PORTFOLIO_KV.get(KEY, 'json');
  return json(photos || []);
}

export async function onRequestPost({ request, env }) {
  if (!(await requireOwner(request, env))) {
    return json({ error: 'not authorised' }, { status: 401 });
  }

  const buf = await request.arrayBuffer();
  if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) {
    return json({ error: 'photos must be between 1 byte and 15 MB' }, { status: 400 });
  }
  const type = sniff(buf);
  if (!type) {
    return json({ error: 'only jpeg, png, webp or gif files are accepted' }, { status: 400 });
  }

  const photos = (await env.PORTFOLIO_KV.get(KEY, 'json')) || [];
  if (photos.length >= MAX_ROWS) {
    return json({ error: 'photo limit reached' }, { status: 400 });
  }

  const id = Date.now().toString(36) + '-' + randomHex(4);
  await env.PHOTOS.put('photo-' + id, buf, { httpMetadata: { contentType: type } });

  const entry = { id, title: null, location: null, taken: null, type, size: buf.byteLength };
  photos.push(entry);
  await env.PORTFOLIO_KV.put(KEY, JSON.stringify(photos));
  return json(entry);
}

export async function onRequestPut({ request, env }) {
  if (!(await requireOwner(request, env))) {
    return json({ error: 'not authorised' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid json' }, { status: 400 });
  }
  if (!Array.isArray(body) || body.length > MAX_ROWS) {
    return json({ error: 'expected an array of photos' }, { status: 400 });
  }

  const old = (await env.PORTFOLIO_KV.get(KEY, 'json')) || [];
  const byId = {};
  old.forEach(p => { byId[p.id] = p; });

  const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

  const next = [];
  const seen = new Set();
  for (const p of body) {
    const existing = p && byId[p.id];
    if (!existing || seen.has(p.id)) {
      return json({ error: 'unknown or duplicate photo id' }, { status: 400 });
    }
    seen.add(p.id);
    next.push({
      id: existing.id,
      title: str(p.title, MAX_LEN.title),
      location: str(p.location, MAX_LEN.location),
      taken: str(p.taken, MAX_LEN.taken),
      type: existing.type,
      size: existing.size,
    });
  }

  for (const p of old) {
    if (!seen.has(p.id)) await env.PHOTOS.delete('photo-' + p.id);
  }

  await env.PORTFOLIO_KV.put(KEY, JSON.stringify(next));
  return json({ ok: true, count: next.length });
}
