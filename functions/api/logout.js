export async function onRequestGet() {
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/edit',
      'Set-Cookie': 'session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0',
    },
  });
}
