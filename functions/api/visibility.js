import { requireOwner, json } from '../_lib.js';
import { recordChange, summarise } from '../_audit.js';

const KEY = 'visibility';
const MAX_MSG = 300;
const PAGES = ['photography'];

function sanitize(raw) {
  const body = raw && typeof raw === 'object' ? raw : {};
  const str = (v) => (typeof v === 'string' ? v.trim().slice(0, MAX_MSG) : '');

  const pages = {};
  for (const key of PAGES) {
    const p = body.pages && body.pages[key];
    pages[key] = { hidden: !!(p && p.hidden), message: str(p && p.message) };
  }

  return { siteDown: !!body.siteDown, siteMessage: str(body.siteMessage), pages };
}

export async function onRequestGet({ env }) {
  const visibility = await env.PORTFOLIO_KV.get(KEY, 'json');
  return json(sanitize(visibility || {}));
}

export async function onRequestPut({ request, env, waitUntil }) {
  const who = await requireOwner(request, env);
  if (!who) {
    return json({ error: 'not authorised' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid json' }, { status: 400 });
  }

  const visibility = sanitize(body);
  const old = await env.PORTFOLIO_KV.get(KEY, 'json');
  await env.PORTFOLIO_KV.put(KEY, JSON.stringify(visibility));

  const change = summarise('visibility', old && sanitize(old), visibility);
  recordChange(env, waitUntil, { who, resource: 'visibility', action: 'update', ...change });

  return json({ ok: true });
}
