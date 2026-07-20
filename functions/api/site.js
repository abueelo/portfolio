import { requireOwner, json } from '../_lib.js';

const KEY = 'site';
const MAX = { about: 3000, label: 30, text: 100, url: 300, when: 40, what: 200 };
const MAX_ROWS = { contacts: 20, history: 30 };

export async function onRequestGet({ env }) {
  const site = await env.PORTFOLIO_KV.get(KEY, 'json');
  return json(site || {});
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

  const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

  const about = str(body.about, MAX.about);
  const photoAbout = str(body.photoAbout, MAX.about);

  const contacts = [];
  for (const c of Array.isArray(body.contacts) ? body.contacts.slice(0, MAX_ROWS.contacts) : []) {
    const label = str(c && c.label, MAX.label);
    const text = str(c && c.text, MAX.text);
    const url = str(c && c.url, MAX.url);
    if (!label && !text) continue;
    if (url && !/^(https?:\/\/|mailto:)/.test(url)) {
      return json({ error: 'contact urls must start with http(s):// or mailto:' }, { status: 400 });
    }
    contacts.push({ label, text, url });
  }

  const history = [];
  for (const h of Array.isArray(body.history) ? body.history.slice(0, MAX_ROWS.history) : []) {
    const when = str(h && h.when, MAX.when);
    const what = str(h && h.what, MAX.what);
    if (!when && !what) continue;
    history.push({ when, what });
  }

  const site = { about, photoAbout, contacts, history };
  await env.PORTFOLIO_KV.put(KEY, JSON.stringify(site));
  return json({ ok: true });
}
