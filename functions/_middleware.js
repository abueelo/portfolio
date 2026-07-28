const ALWAYS_ALLOWED = new Set([
  '/style.css',
  '/robots.txt',
  '/sitemap.xml',
  '/og-image.png',
  '/og-image-photography.png',
  '/unavailable.html',
]);

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

export async function onRequest({ request, next, env }) {
  const url = new URL(request.url);
  const isPhotographyHost = url.hostname.startsWith('photography.');
  const gated = request.method === 'GET'
    && !url.pathname.startsWith('/api/')
    && !url.pathname.startsWith('/edit')
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

  if (isPhotographyHost && url.pathname === '/') {
    return env.ASSETS.fetch(new Request(new URL('/photography', url), request));
  }
  return next();
}
