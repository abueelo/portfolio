export async function onRequest({ request, next, env }) {
  const url = new URL(request.url);
  if (url.hostname.startsWith('photography.') && url.pathname === '/') {
    return env.ASSETS.fetch(new Request(new URL('/photography', url), request));
  }
  return next();
}
