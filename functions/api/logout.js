import { secureFlag } from '../_lib.js';

export async function onRequestGet({ request }) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/edit',
      'Set-Cookie': `session=; HttpOnly;${secureFlag(request)} SameSite=Lax; Path=/; Max-Age=0`,
    },
  });
}
