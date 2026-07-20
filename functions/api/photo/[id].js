export async function onRequestGet({ params, env }) {
  const id = String(params.id || '');
  if (!/^[a-z0-9-]{1,40}$/.test(id)) {
    return new Response('not found', { status: 404 });
  }
  const obj = await env.PHOTOS.get('photo-' + id);
  if (!obj) {
    return new Response('not found', { status: 404 });
  }
  return new Response(obj.body, {
    headers: {
      'Content-Type': (obj.httpMetadata && obj.httpMetadata.contentType) || 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
