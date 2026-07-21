import { requireOwner, json } from '../_lib.js';
import UTIF from '../_vendor/utif.js';
import encode from '../_vendor/jpeg-encoder.js';

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_DIM = 2400;

function boxResize(src, sw, sh, dw, dh) {
  const dst = new Uint8ClampedArray(dw * dh * 4);
  for (let dy = 0; dy < dh; dy++) {
    const sy0 = Math.floor(dy * sh / dh);
    const sy1 = Math.max(sy0 + 1, Math.floor((dy + 1) * sh / dh));
    for (let dx = 0; dx < dw; dx++) {
      const sx0 = Math.floor(dx * sw / dw);
      const sx1 = Math.max(sx0 + 1, Math.floor((dx + 1) * sw / dw));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = sy0; yy < sy1; yy++) {
        const rowOff = yy * sw;
        for (let xx = sx0; xx < sx1; xx++) {
          const i = (rowOff + xx) * 4;
          r += src[i]; g += src[i + 1]; b += src[i + 2]; a += src[i + 3];
          n++;
        }
      }
      const o = (dy * dw + dx) * 4;
      dst[o] = r / n; dst[o + 1] = g / n; dst[o + 2] = b / n; dst[o + 3] = a / n;
    }
  }
  return dst;
}

export async function onRequestPost({ request, env }) {
  if (!(await requireOwner(request, env))) {
    return json({ error: 'not authorised' }, { status: 401 });
  }

  const buf = await request.arrayBuffer();
  if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) {
    return json({ error: 'file must be between 1 byte and 25 MB' }, { status: 400 });
  }

  let rgba, sw, sh;
  try {
    const ifds = UTIF.decode(buf);
    if (!ifds.length) throw new Error('no image found in tiff');
    UTIF.decodeImage(buf, ifds[0]);
    rgba = UTIF.toRGBA8(ifds[0]);
    sw = ifds[0].width;
    sh = ifds[0].height;
    if (!sw || !sh) throw new Error('tiff missing dimensions');
  } catch {
    return json({ error: 'could not decode tiff' }, { status: 400 });
  }

  const scale = Math.min(1, MAX_DIM / Math.max(sw, sh));
  const dw = Math.round(sw * scale);
  const dh = Math.round(sh * scale);
  const pixels = scale === 1 ? rgba : boxResize(rgba, sw, sh, dw, dh);

  const out = encode({ data: pixels, width: dw, height: dh }, 85);

  return new Response(out.data, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'no-store',
      'X-Image-Width': String(dw),
      'X-Image-Height': String(dh),
    },
  });
}
