import { OWNER, getCookie, makeSessionCookie } from '../_lib.js';

function bounce(location, extraHeaders = {}) {
  return new Response(null, { status: 302, headers: { Location: location, ...extraHeaders } });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const savedState = getCookie(request, 'oauth_state');
  const clearState = 'oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';

  if (!code || !state || !savedState || state !== savedState) {
    return bounce('/edit#error', { 'Set-Cookie': clearState });
  }

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/api/callback`,
    }),
  });
  const token = (await tokenRes.json()).access_token;
  if (!token) return bounce('/edit#error', { 'Set-Cookie': clearState });

  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'russl-dev-portfolio',
    },
  });
  const login = (await userRes.json()).login;

  if (login !== OWNER) {
    return bounce('/edit#denied', { 'Set-Cookie': clearState });
  }

  const headers = new Headers({ Location: '/edit' });
  headers.append('Set-Cookie', clearState);
  headers.append('Set-Cookie', await makeSessionCookie(env, login));
  return new Response(null, { status: 302, headers });
}
