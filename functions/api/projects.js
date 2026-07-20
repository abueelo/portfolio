import { requireOwner, json, validImageId } from '../_lib.js';

const KEY = 'projects';
const MAX_PROJECTS = 30;
const MAX_IMAGES = 10;
const MAX_LEN = {
  name: 100, url: 300, language: 60, homepage: 300, description: 2000,
  linkUrl: 300, linkText: 40, details: 4000,
};

export async function onRequestGet({ env }) {
  const projects = await env.PORTFOLIO_KV.get(KEY, 'json');
  return json(projects || []);
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
  if (!Array.isArray(body) || body.length > MAX_PROJECTS) {
    return json({ error: 'expected an array of projects' }, { status: 400 });
  }

  const old = (await env.PORTFOLIO_KV.get(KEY, 'json')) || [];
  const oldImageIds = new Set();
  old.forEach(p => (p.images || []).forEach(id => oldImageIds.add(id)));

  const clean = [];
  const newImageIds = new Set();
  for (const p of body) {
    if (!p || typeof p.name !== 'string' || typeof p.url !== 'string') {
      return json({ error: 'each project needs a name and url' }, { status: 400 });
    }
    if (!p.url.startsWith('https://github.com/')) {
      return json({ error: 'project urls must point at github' }, { status: 400 });
    }
    const field = (key) => {
      const v = p[key];
      return typeof v === 'string' && v.trim() ? v.trim().slice(0, MAX_LEN[key]) : null;
    };
    const linkUrl = field('linkUrl');
    if (linkUrl && !/^https?:\/\//.test(linkUrl)) {
      return json({ error: 'custom links must start with http(s)://' }, { status: 400 });
    }

    const images = Array.isArray(p.images) ? p.images.slice(0, MAX_IMAGES) : [];
    for (const id of images) {
      if (!validImageId(id)) {
        return json({ error: 'invalid image reference' }, { status: 400 });
      }
      newImageIds.add(id);
    }

    clean.push({
      name: p.name.slice(0, MAX_LEN.name),
      url: p.url.slice(0, MAX_LEN.url),
      language: field('language'),
      homepage: field('homepage'),
      blurb: field('blurb'),
      description: field('description'),
      linkUrl,
      linkText: field('linkText'),
      details: field('details'),
      images,
    });
  }

  for (const id of oldImageIds) {
    if (!newImageIds.has(id)) await env.PHOTOS.delete('photo-' + id);
  }

  await env.PORTFOLIO_KV.put(KEY, JSON.stringify(clean));
  return json({ ok: true, count: clean.length });
}
