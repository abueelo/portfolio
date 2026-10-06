import { requireOwner, json } from '../_lib.js';
import { withLogs } from '../_schema.js';

const RANGES = { '24h': 1, '7d': 7, '30d': 30, '90d': 90 };
const PAGE = 50;

function cutoffFor(range) {
  const days = RANGES[range] || 7;
  const hours = range === '24h' ? 24 : days * 24;
  return Date.now() - hours * 60 * 60 * 1000;
}

const all = async (stmt) => (await stmt.all()).results || [];
const one = async (stmt) => {
  const row = await stmt.first();
  return row || {};
};

async function overview(db, since) {
  const [counts, hitCounts, byDay, byHour, median, topPaths] = await Promise.all([
    one(db.prepare(
      `SELECT COUNT(*) AS sessions,
              COALESCE(SUM(CASE WHEN bot_score < 40 THEN 1 ELSE 0 END), 0) AS humans,
              COALESCE(SUM(CASE WHEN bot_score >= 60 THEN 1 ELSE 0 END), 0) AS bots,
              COALESCE(SUM(CASE WHEN bot_score >= 40 AND bot_score < 60 THEN 1 ELSE 0 END), 0) AS unclear
         FROM visits WHERE started_at > ?`
    ).bind(since)),
    one(db.prepare(
      `SELECT COUNT(*) AS requests,
              COALESCE(SUM(CASE WHEN beaconed = 0 THEN 1 ELSE 0 END), 0) AS no_js,
              COUNT(DISTINCT visitor_key) AS visitors
         FROM hits WHERE at > ?`
    ).bind(since)),
    all(db.prepare(
      `SELECT date(at / 1000, 'unixepoch') AS day, COUNT(*) AS requests
         FROM hits WHERE at > ? GROUP BY day ORDER BY day`
    ).bind(since)),
    all(db.prepare(
      `SELECT strftime('%H', at / 1000, 'unixepoch') AS hour, COUNT(*) AS requests
         FROM hits WHERE at > ? GROUP BY hour ORDER BY requests DESC LIMIT 1`
    ).bind(since)),
    one(db.prepare(
      `SELECT duration_ms AS median FROM visits
        WHERE started_at > ? AND bot_score < 40 AND duration_ms > 0
        ORDER BY duration_ms
        LIMIT 1 OFFSET (SELECT COUNT(*) / 2 FROM visits
                         WHERE started_at > ? AND bot_score < 40 AND duration_ms > 0)`
    ).bind(since, since)),
    all(db.prepare(
      `SELECT path, COUNT(*) AS requests FROM hits
        WHERE at > ? GROUP BY path ORDER BY requests DESC LIMIT 10`
    ).bind(since)),
  ]);

  return {
    ...counts,
    ...hitCounts,
    medianMs: median.median || 0,
    busiestHour: byHour.length ? byHour[0].hour : null,
    byDay,
    topPaths,
  };
}

async function geo(db, since) {
  const group = (col) => all(db.prepare(
    `SELECT ${col} AS name, COUNT(*) AS sessions FROM visits
      WHERE started_at > ? AND ${col} IS NOT NULL
      GROUP BY name ORDER BY sessions DESC LIMIT 20`
  ).bind(since));

  const [countries, regions, cities, networks] = await Promise.all([
    group('country'), group('region'), group('city'), group('as_org'),
  ]);
  return { countries, regions, cities, networks };
}

async function areas(db, since) {
  const [list, events] = await Promise.all([
    all(db.prepare(
      `SELECT a.area AS area,
              SUM(a.ms) AS total_ms,
              AVG(a.ms) AS mean_ms,
              COUNT(DISTINCT a.visit_id) AS sessions
         FROM visit_areas a JOIN visits v ON v.id = a.visit_id
        WHERE v.started_at > ? AND v.bot_score < 60
        GROUP BY a.area ORDER BY total_ms DESC LIMIT 40`
    ).bind(since)),
    all(db.prepare(
      `SELECT e.kind AS kind, e.target AS target, COUNT(*) AS count
         FROM visit_events e JOIN visits v ON v.id = e.visit_id
        WHERE v.started_at > ? AND v.bot_score < 60
        GROUP BY e.kind, e.target ORDER BY count DESC LIMIT 60`
    ).bind(since)),
  ]);

  const totalSessions = await one(db.prepare(
    'SELECT COUNT(*) AS n FROM visits WHERE started_at > ? AND bot_score < 60'
  ).bind(since));

  return { areas: list, events, totalSessions: totalSessions.n || 0 };
}

async function sessions(db, since, page) {
  const rows = await all(db.prepare(
    `SELECT id, started_at, duration_ms, path, referrer, country, region, city,
            as_org, device, viewport, max_scroll, bot_score, bot_verdict, bot_reasons, ua
       FROM visits WHERE started_at > ?
      ORDER BY started_at DESC LIMIT ? OFFSET ?`
  ).bind(since, PAGE + 1, page * PAGE));

  return { sessions: rows.slice(0, PAGE), more: rows.length > PAGE, page };
}

async function visitors(db, since, page) {
  const rows = await all(db.prepare(
    `SELECT v.visitor_key AS visitor_key,
            COUNT(*) AS visits,
            MIN(v.started_at) AS first_seen,
            MAX(v.started_at) AS last_seen,
            SUM(v.duration_ms) AS total_ms,
            MAX(v.max_scroll) AS max_scroll,
            MIN(v.bot_score) AS bot_score,
            COUNT(DISTINCT v.path) AS pages,
            MAX(v.country) AS country,
            MAX(v.region) AS region,
            MAX(v.city) AS city,
            MAX(v.as_org) AS as_org,
            MAX(v.device) AS device,
            MAX(v.ua) AS ua,
            (SELECT COUNT(*) FROM visit_events e
              JOIN visits v2 ON v2.id = e.visit_id
             WHERE v2.visitor_key = v.visitor_key AND e.kind != 'view') AS actions
       FROM visits v
      WHERE v.started_at > ? AND v.visitor_key IS NOT NULL
      GROUP BY v.visitor_key
      ORDER BY last_seen DESC
      LIMIT ? OFFSET ?`
  ).bind(since, PAGE + 1, page * PAGE));

  return { visitors: rows.slice(0, PAGE), more: rows.length > PAGE, page };
}

async function visitor(db, key, since) {
  const visits = await all(db.prepare(
    `SELECT id, started_at, duration_ms, path, referrer, country, region, city,
            as_org, device, viewport, max_scroll, bot_score, bot_verdict, bot_reasons, ua
       FROM visits WHERE visitor_key = ? AND started_at > ?
      ORDER BY started_at DESC LIMIT 60`
  ).bind(key, since));

  if (!visits.length) return { visits: [], timeline: {} };

  const ids = visits.map(v => v.id);
  const marks = ids.map(() => '?').join(',');
  const rows = await all(db.prepare(
    `SELECT visit_id, at, kind, target, ms FROM visit_events
      WHERE visit_id IN (${marks}) ORDER BY visit_id, at`
  ).bind(...ids));

  const timeline = {};
  for (const r of rows) {
    (timeline[r.visit_id] = timeline[r.visit_id] || []).push(r);
  }
  return { visits, timeline };
}

async function session(db, id) {
  const [visit, areaRows, eventRows] = await Promise.all([
    one(db.prepare('SELECT * FROM visits WHERE id = ?').bind(id)),
    all(db.prepare('SELECT area, ms, views FROM visit_areas WHERE visit_id = ? ORDER BY ms DESC').bind(id)),
    all(db.prepare('SELECT at, kind, target, ms FROM visit_events WHERE visit_id = ? ORDER BY at').bind(id)),
  ]);
  return { visit, areas: areaRows, timeline: eventRows };
}

async function bots(db, since) {
  const [verdicts, agents, networks, noJs] = await Promise.all([
    all(db.prepare(
      `SELECT bot_verdict AS verdict, COUNT(*) AS sessions FROM visits
        WHERE started_at > ? GROUP BY verdict ORDER BY sessions DESC`
    ).bind(since)),
    all(db.prepare(
      `SELECT ua, COUNT(*) AS requests, MAX(bot_points) AS points FROM hits
        WHERE at > ? AND bot_points >= 40
        GROUP BY ua ORDER BY requests DESC LIMIT 25`
    ).bind(since)),
    all(db.prepare(
      `SELECT as_org AS name, COUNT(*) AS requests FROM hits
        WHERE at > ? AND bot_points >= 40 AND as_org IS NOT NULL
        GROUP BY name ORDER BY requests DESC LIMIT 15`
    ).bind(since)),
    one(db.prepare(
      `SELECT COALESCE(SUM(CASE WHEN beaconed = 0 THEN 1 ELSE 0 END), 0) AS no_js,
              COUNT(*) AS requests
         FROM hits WHERE at > ?`
    ).bind(since)),
  ]);
  return { verdicts, agents, networks, ...noJs };
}

async function changes(db, page, resource) {
  const where = resource ? 'WHERE resource = ?' : '';
  const binds = resource ? [resource, PAGE + 1, page * PAGE] : [PAGE + 1, page * PAGE];
  const rows = await all(db.prepare(
    `SELECT id, at, who, resource, action, summary, detail FROM changes
     ${where} ORDER BY at DESC LIMIT ? OFFSET ?`
  ).bind(...binds));
  return { changes: rows.slice(0, PAGE), more: rows.length > PAGE, page };
}

export async function onRequestGet({ request, env }) {
  if (!(await requireOwner(request, env))) {
    return json({ error: 'not authorised' }, { status: 401 });
  }
  if (!env.LOGS) {
    return json({ error: 'no logs database bound' }, { status: 503 });
  }

  const url = new URL(request.url);
  const view = url.searchParams.get('view') || 'overview';
  const range = url.searchParams.get('range') || '7d';
  const page = Math.max(0, Math.min(parseInt(url.searchParams.get('page'), 10) || 0, 500));
  const since = cutoffFor(range);
  const db = env.LOGS;

  try {
    const run = (fn) => withLogs(env, fn);
    if (view === 'overview') return json(await run(() => overview(db, since)));
    if (view === 'geo') return json(await run(() => geo(db, since)));
    if (view === 'areas') return json(await run(() => areas(db, since)));
    if (view === 'sessions') return json(await run(() => sessions(db, since, page)));
    if (view === 'visitors') return json(await run(() => visitors(db, since, page)));
    if (view === 'visitor') {
      const key = url.searchParams.get('key') || '';
      if (!/^[a-f0-9]{16}$/.test(key)) return json({ error: 'bad key' }, { status: 400 });
      return json(await run(() => visitor(db, key, since)));
    }
    if (view === 'bots') return json(await run(() => bots(db, since)));
    if (view === 'changes') return json(await run(() => changes(db, page, url.searchParams.get('resource'))));
    if (view === 'session') {
      const id = url.searchParams.get('id') || '';
      if (!/^[a-f0-9]{16}$/.test(id)) return json({ error: 'bad id' }, { status: 400 });
      return json(await run(() => session(db, id)));
    }
  } catch (err) {
    return json({ error: String(err && err.message || err) }, { status: 500 });
  }

  return json({ error: 'unknown view' }, { status: 400 });
}
