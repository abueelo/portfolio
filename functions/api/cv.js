import { requireOwner, json } from '../_lib.js';

const DATA_KEY = 'cv-file';
const META_KEY = 'cv-meta';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function onRequestGet({ request, env }) {
  const meta = await env.PORTFOLIO_KV.get(META_KEY, 'json');

  if (new URL(request.url).searchParams.has('info')) {
    return json(meta ? { exists: true, name: meta.name, size: meta.size } : { exists: false });
  }

  if (!meta) return json({ error: 'no cv uploaded' }, { status: 404 });
  const buf = await env.PORTFOLIO_KV.get(DATA_KEY, 'arrayBuffer');
  if (!buf) return json({ error: 'no cv uploaded' }, { status: 404 });

  return new Response(buf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${meta.name}"`,
      'Cache-Control': 'no-cache',
    },
  });
}

export async function onRequestPut({ request, env }) {
  if (!(await requireOwner(request, env))) {
    return json({ error: 'not authorised' }, { status: 401 });
  }

  const buf = await request.arrayBuffer();
  if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) {
    return json({ error: 'cv must be between 1 byte and 10 MB' }, { status: 400 });
  }
  const head = new TextDecoder().decode(new Uint8Array(buf, 0, 4));
  if (head !== '%PDF') {
    return json({ error: 'only pdf files are accepted' }, { status: 400 });
  }

  let name = decodeURIComponent(request.headers.get('X-Filename') || 'cv.pdf');
  name = name.replace(/[^\w. -]/g, '').slice(0, 80) || 'cv.pdf';
  if (!name.toLowerCase().endsWith('.pdf')) name += '.pdf';

  await env.PORTFOLIO_KV.put(DATA_KEY, buf);
  await env.PORTFOLIO_KV.put(META_KEY, JSON.stringify({
    name,
    size: buf.byteLength,
    uploaded: Date.now(),
  }));
  return json({ ok: true, name, size: buf.byteLength });
}

export async function onRequestDelete({ request, env }) {
  if (!(await requireOwner(request, env))) {
    return json({ error: 'not authorised' }, { status: 401 });
  }
  await env.PORTFOLIO_KV.delete(DATA_KEY);
  await env.PORTFOLIO_KV.delete(META_KEY);
  return json({ ok: true });
}
