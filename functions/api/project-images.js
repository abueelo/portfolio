import { requireOwner, json, newImageId, sniffImage } from '../_lib.js';
import { recordChange } from '../_audit.js';

const MAX_BYTES = 15 * 1024 * 1024;

export async function onRequestPost({ request, env, waitUntil }) {
  const who = await requireOwner(request, env);
  if (!who) {
    return json({ error: 'not authorised' }, { status: 401 });
  }

  const buf = await request.arrayBuffer();
  if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) {
    return json({ error: 'images must be between 1 byte and 15 MB' }, { status: 400 });
  }
  const type = sniffImage(buf);
  if (!type) {
    return json({ error: 'only jpeg, png, webp or gif files are accepted' }, { status: 400 });
  }

  const id = newImageId();
  await env.PHOTOS.put('photo-' + id, buf, { httpMetadata: { contentType: type } });

  recordChange(env, waitUntil, {
    who, resource: 'project-images', action: 'upload',
    summary: 'uploaded a project image (' + Math.round(buf.byteLength / 1024) + ' kb)',
    detail: { id, type, size: buf.byteLength },
  });

  return json({ id, type, size: buf.byteLength });
}
