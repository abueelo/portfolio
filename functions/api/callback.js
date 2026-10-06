import { OWNER, getCookie, makeSessionCookie, secureFlag } from '../_lib.js';
import { recordChange } from '../_audit.js';

function bounce(location, extraHeaders = {}) {
  return new Response(null, { status: 302, headers: { Location: location, ...extraHeaders } });
}

export async function onRequestGet({ request, env, waitUntil }) {
  const logLogin = (action, summary, who) =>
    recordChange(env, waitUntil, { who: who || null, resource: 'login', action, summary });

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const savedState = getCookie(request, 'oauth_state');
  const clearState = `oauth_state=; HttpOnly;${secureFlag(request)} SameSite=Lax; Path=/; Max-Age=0`;

  if (!code || !state || !savedState || state !== savedState) {
    console.error('[callback] state check failed', {
      hasCode: !!code, hasState: !!state, hasStateCookie: !!savedState, match: state === savedState,
    });
    logLogin('failed', 'login attempt failed the state check');
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
    logLogin('failed', 'github rejected the app credentials');
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
    logLogin('failed', 'could not read the github profile');
    return bounce('/edit#error-user', { 'Set-Cookie': clearState });
  }

  if (userBody.login !== OWNER) {
    logLogin('denied', 'someone else signed in with github', String(userBody.login).slice(0, 80));
    return bounce('/edit#denied', { 'Set-Cookie': clearState });
  }

  logLogin('login', 'signed in', userBody.login);

  const headers = new Headers({ Location: '/edit' });
  headers.append('Set-Cookie', clearState);
  headers.append('Set-Cookie', await makeSessionCookie(request, env, userBody.login));
  return new Response(null, { status: 302, headers });
}
