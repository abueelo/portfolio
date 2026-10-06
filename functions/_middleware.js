import { visitorKey, geoFrom, serverBotSignals, maybePrune, newId } from './_track.js';
import { withLogs } from './_schema.js';

const ALWAYS_ALLOWED = new Set([
  '/style.css',
  '/track.js',
  '/robots.txt',
  '/sitemap.xml',
  '/og-image.png',
  '/og-image-photography.png',
  '/unavailable.html',
  '/privacy',
  '/privacy.html',
]);

const ASSET_EXT = /\.(css|js|mjs|map|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|pdf|xml|txt|json)$/i;

function pageKeyFor(pathname, isPhotographyHost) {
  if (isPhotographyHost || pathname === '/photography') return 'photography';
  return null;
}

async function unavailableResponse(env, url, reason) {
  const res = await env.ASSETS.fetch(new Request(new URL('/unavailable.html', url), { method: 'GET' }));
  const html = (await res.text()).replace('__REASON__', reason);
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  return new Response(html, { status: 503, headers });
}

async function recordHit(request, env, url) {
  const [key, signals] = await Promise.all([
    visitorKey(request, env),
    Promise.resolve(serverBotSignals(request)),
  ]);
  const geo = geoFrom(request);
  await withLogs(env, () => env.LOGS.prepare(
    `INSERT INTO hits
      (id, at, path, host, visitor_key, country, region, city, timezone, colo,
       asn, as_org, ua, bot_points, bot_reasons, beaconed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
  ).bind(
    newId(), Date.now(), url.pathname.slice(0, 200), url.hostname.slice(0, 120), key,
    geo.country, geo.region, geo.city, geo.timezone, geo.colo, geo.asn, geo.as_org,
    (request.headers.get('User-Agent') || '').slice(0, 300) || null,
    Math.max(0, signals.points), JSON.stringify(signals.reasons.slice(0, 12))
  ).run());
}

export async function onRequest({ request, next, env, waitUntil }) {
  const url = new URL(request.url);
  const isPhotographyHost = url.hostname.startsWith('photography.');
  const isConsole = url.pathname.startsWith('/edit') || url.pathname.startsWith('/logs');
  const gated = request.method === 'GET'
    && !url.pathname.startsWith('/api/')
    && !isConsole
    && !ALWAYS_ALLOWED.has(url.pathname);

  if (gated) {
    const visibility = await env.PORTFOLIO_KV.get('visibility', 'json');
    if (visibility) {
      if (visibility.siteDown) {
        return unavailableResponse(env, url, 'site');
      }
      const pageKey = pageKeyFor(url.pathname, isPhotographyHost);
      if (pageKey && visibility.pages && visibility.pages[pageKey] && visibility.pages[pageKey].hidden) {
        return unavailableResponse(env, url, 'page:' + pageKey);
      }
    }
  }

  const loggable = request.method === 'GET'
    && !isConsole
    && !url.pathname.startsWith('/api/')
    && !ASSET_EXT.test(url.pathname)
    && env.LOGS;

  if (loggable && waitUntil) {
    waitUntil(recordHit(request, env, url).catch(() => {}));
    maybePrune(env, waitUntil);
  }

  if (isPhotographyHost && url.pathname === '/') {
    return env.ASSETS.fetch(new Request(new URL('/photography', url), request));
  }
  return next();
}
