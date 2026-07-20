import { OWNER, getCookie, makeSessionCookie, secureFlag } from '../_lib.js';

function bounce(location, extraHeaders = {}) {
  return new Response(null, { status: 302, headers: { Location: location, ...extraHeaders } });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const savedState = getCookie(request, 'oauth_state');
  const clearState = `oauth_state=; HttpOnly;${secureFlag(request)} SameSite=Lax; Path=/; Max-Age=0`;

  if (!code || !state || !savedState || state !== savedState) {
    console.error('[callback] state check failed', {
      hasCode: !!code, hasState: !!state, hasStateCookie: !!savedState, match: state === savedState,
    });
    return bounce('/edit#error-state', { 'Set-Cookie': clearState });
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
  const tokenBody = await tokenRes.json();
  if (!tokenBody.access_token) {
    console.error('[callback] token exchange failed:', JSON.stringify(tokenBody));
    return bounce('/edit#error-token', { 'Set-Cookie': clearState });
  }

  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${tokenBody.access_token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'russl-dev-portfolio',
    },
  });
  const userBody = await userRes.json();
  if (!userBody.login) {
    console.error('[callback] user lookup failed:', JSON.stringify(userBody));
    return bounce('/edit#error-user', { 'Set-Cookie': clearState });
  }

  if (userBody.login !== OWNER) {
    return bounce('/edit#denied', { 'Set-Cookie': clearState });
  }

  const headers = new Headers({ Location: '/edit' });
  headers.append('Set-Cookie', clearState);
  headers.append('Set-Cookie', await makeSessionCookie(request, env, userBody.login));
  return new Response(null, { status: 302, headers });
}
