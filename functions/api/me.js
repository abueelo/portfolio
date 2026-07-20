import { OWNER, sessionLogin, json } from '../_lib.js';

export async function onRequestGet({ request, env }) {
  const login = await sessionLogin(request, env);
  return json({ authed: login === OWNER, login });
}
