import { requireOwner, json } from '../_lib.js';

const KEY = 'notfound';
const MAX = { title: 60, message: 300, buttonLabel: 60 };

function sanitize(raw) {
  const body = raw && typeof raw === 'object' ? raw : {};
  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

  return {
    title: str(body.title, MAX.title),
    message: str(body.message, MAX.message),
    buttonLabel: str(body.buttonLabel, MAX.buttonLabel),
    buttonEnabled: body.buttonEnabled !== false,
  };
}

export async function onRequestGet({ env }) {
  const notFound = await env.PORTFOLIO_KV.get(KEY, 'json');
  return json(sanitize(notFound || {}));
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

  const notFound = sanitize(body);
  await env.PORTFOLIO_KV.put(KEY, JSON.stringify(notFound));
  return json({ ok: true });
}
