import { visitorKey, geoFrom, serverBotSignals, classify, clamp, maybePrune } from '../_track.js';
import { withLogs } from '../_schema.js';

const MAX_BODY = 8 * 1024;
const MAX_EVENTS = 200;
const MAX_AREAS = 40;
const ID_RE = /^[a-f0-9]{16}$/;

const AREAS = new Set([
  'about', 'projects', 'contact', 'footer', 'header',
  'gallery', 'photo', 'writeup', 'notfound',
]);
const KINDS = new Set([
  'modal_open', 'modal_close', 'outbound', 'lightbox', 'theme', 'cv', 'copy', 'repo', 'nav',
]);
const MAX_SEGMENTS = 300;

const DEVICES = new Set(['desktop', 'mobile', 'tablet']);

function str(v, max) {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}

function cleanReferrer(v) {
  const raw = str(v, 300);
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return (u.origin + u.pathname).slice(0, 200);
  } catch {
    return null;
  }
}

function clientBotSignals(body) {
  const reasons = [];
  let points = 0;
  const sig = (body && body.signals) || {};
  const duration = clamp(body && body.duration, 0, 24 * 60 * 60 * 1000);

  if (sig.webdriver === true) {
    points += 60;
    reasons.push('navigator.webdriver set');
  }
  const moves = clamp(sig.moves, 0, 1e6);
  const scrolls = clamp(sig.scrolls, 0, 1e6);
  const keys = clamp(sig.keys, 0, 1e6);
  const touches = clamp(sig.touches, 0, 1e6);
  const interacted = moves + scrolls + keys + touches;

  if (duration > 3000 && interacted === 0) {
    points += 35;
    reasons.push('no interaction at all');
  }
  if (sig.languages === 0) {
    points += 20;
    reasons.push('no browser languages');
  }
  if (sig.screenW === 0 || sig.screenH === 0 || sig.screenW > 20000 || sig.screenH > 20000) {
    points += 15;
    reasons.push('implausible screen size');
  }
  if (body && body.phase === 'close' && duration > 0 && duration < 300) {
    points += 15;
    reasons.push('left almost immediately');
  }
  if (interacted > 3 && duration > 2000) {
    points -= 30;
    reasons.push('behaved like a person');
  }
  return { points, reasons };
}

export async function onRequestPost(context) {
  const { request, env, waitUntil } = context;
  const nothing = () => new Response(null, { status: 204 });

  if (request.headers.get('DNT') === '1' || request.headers.get('Sec-GPC') === '1') {
    return nothing();
  }
  if (!env.LOGS) return nothing();

  const raw = await request.text();
  if (!raw || raw.length > MAX_BODY) return nothing();

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return nothing();
  }
  if (!body || typeof body !== 'object' || !ID_RE.test(body.id || '')) return nothing();

  const path = str(body.path, 200) || '/';
  if (path.startsWith('/edit') || path.startsWith('/logs')) return nothing();

  const now = Date.now();
  const geo = geoFrom(request);
  const key = await visitorKey(request, env);
  const server = serverBotSignals(request);
  const client = clientBotSignals(body);
  const score = clamp(server.points + client.points, 0, 100);
  const reasons = JSON.stringify(server.reasons.concat(client.reasons).slice(0, 12));
  const duration = clamp(body.duration, 0, 24 * 60 * 60 * 1000);
  const ua = (request.headers.get('User-Agent') || '').slice(0, 300) || null;
  const device = DEVICES.has(body.device) ? body.device : null;
  const viewport = /^\d{1,5}x\d{1,5}$/.test(body.viewport || '') ? body.viewport : null;

  const statements = [];

  statements.push(
    env.LOGS.prepare(
      `INSERT INTO visits
        (id, started_at, ended_at, duration_ms, path, host, referrer, visitor_key,
         country, region, city, timezone, colo, asn, as_org, ua, device, viewport,
         max_scroll, bot_score, bot_verdict, bot_reasons)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         ended_at = excluded.ended_at,
         duration_ms = max(visits.duration_ms, excluded.duration_ms),
         max_scroll = max(visits.max_scroll, excluded.max_scroll),
         bot_score = excluded.bot_score,
         bot_verdict = excluded.bot_verdict,
         bot_reasons = excluded.bot_reasons`
    ).bind(
      body.id, now - duration, now, duration, path,
      str(body.host, 120), cleanReferrer(body.referrer), key,
      geo.country, geo.region, geo.city, geo.timezone, geo.colo, geo.asn, geo.as_org,
      ua, device, viewport, clamp(body.maxScroll, 0, 100), score, classify(score), reasons
    )
  );

  const areas = body.areas && typeof body.areas === 'object' ? body.areas : {};
  let areaCount = 0;
  for (const name of Object.keys(areas)) {
    if (areaCount >= MAX_AREAS) break;
    const [base] = name.split(':');
    if (!AREAS.has(base)) continue;
    const a = areas[name] || {};
    const ms = clamp(a.ms, 0, 24 * 60 * 60 * 1000);
    if (!ms) continue;
    areaCount++;
    statements.push(
      env.LOGS.prepare(
        `INSERT INTO visit_areas (visit_id, area, ms, views) VALUES (?, ?, ?, ?)
         ON CONFLICT(visit_id, area) DO UPDATE SET
           ms = max(visit_areas.ms, excluded.ms),
           views = max(visit_areas.views, excluded.views)`
      ).bind(body.id, name.slice(0, 80), ms, clamp(a.views, 0, 1000))
    );
  }

  const segments = Array.isArray(body.segments) ? body.segments.slice(0, MAX_SEGMENTS) : [];
  const events = Array.isArray(body.events) ? body.events.slice(0, MAX_EVENTS) : [];

  if (events.length || segments.length) {
    statements.push(env.LOGS.prepare('DELETE FROM visit_events WHERE visit_id = ?').bind(body.id));
  }

  for (const seg of segments) {
    if (!seg || typeof seg.area !== 'string') continue;
    const [base] = seg.area.split(':');
    if (!AREAS.has(base)) continue;
    const ms = clamp(seg.ms, 0, 24 * 60 * 60 * 1000);
    if (!ms) continue;
    statements.push(
      env.LOGS.prepare('INSERT INTO visit_events (visit_id, at, kind, target, ms) VALUES (?, ?, ?, ?, ?)')
        .bind(body.id, clamp(seg.at, 0, 24 * 60 * 60 * 1000), 'view', seg.area.slice(0, 80), ms)
    );
  }

  if (events.length) {
    for (const e of events) {
      if (!e || !KINDS.has(e.kind)) continue;
      statements.push(
        env.LOGS.prepare('INSERT INTO visit_events (visit_id, at, kind, target, ms) VALUES (?, ?, ?, ?, ?)')
          .bind(
            body.id, clamp(e.at, 0, 24 * 60 * 60 * 1000), e.kind, str(e.target, 200),
            e.ms === undefined || e.ms === null ? null : clamp(e.ms, 0, 24 * 60 * 60 * 1000)
          )
      );
    }
  }

  statements.push(
    env.LOGS.prepare(
      `UPDATE hits SET beaconed = 1
        WHERE rowid IN (
          SELECT rowid FROM hits
           WHERE visitor_key = ? AND path = ? AND beaconed = 0 AND at > ?
           ORDER BY at DESC LIMIT 1
        )`
    ).bind(key, path, now - duration - 30000)
  );

  try {
    await withLogs(env, () => env.LOGS.batch(statements));
  } catch {
  }

  maybePrune(env, waitUntil);
  return nothing();
}
