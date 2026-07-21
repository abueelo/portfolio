import { OWNER, requireOwner, json } from '../_lib.js';

const CACHE_KEY = 'repos-cache';
const STALE_KEY = 'repos-cache-stale';
const CACHE_TTL = 300;

export async function onRequestGet({ request, env }) {
  if (!(await requireOwner(request, env))) {
    return json({ error: 'not authorised' }, { status: 401 });
  }

  const cached = await env.PORTFOLIO_KV.get(CACHE_KEY, 'json');
  if (cached) return json(cached);

  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'russl-dev-portfolio' };
  if (env.GITHUB_API_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_API_TOKEN}`;

  const res = await fetch(
    `https://api.github.com/users/${OWNER}/repos?per_page=100&sort=updated`,
    { headers }
  );
  if (!res.ok) {
    const stale = await env.PORTFOLIO_KV.get(STALE_KEY, 'json');
    if (stale) return json(stale);
    return json({ error: 'github api failed' }, { status: 502 });
  }

  const repos = (await res.json()).map(r => ({
    name: r.name,
    url: r.html_url,
    language: r.language,
    homepage: r.homepage || null,
    blurb: r.description || null,
  }));

  await env.PORTFOLIO_KV.put(CACHE_KEY, JSON.stringify(repos), { expirationTtl: CACHE_TTL });
  await env.PORTFOLIO_KV.put(STALE_KEY, JSON.stringify(repos));
  return json(repos);
}
