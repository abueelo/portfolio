
const DDL = [
  `CREATE TABLE IF NOT EXISTS hits (
     id TEXT PRIMARY KEY, at INTEGER NOT NULL, path TEXT, host TEXT,
     visitor_key TEXT, country TEXT, region TEXT, city TEXT, timezone TEXT,
     colo TEXT, asn INTEGER, as_org TEXT, ua TEXT,
     bot_points INTEGER DEFAULT 0, bot_reasons TEXT, beaconed INTEGER DEFAULT 0
   )`,
  'CREATE INDEX IF NOT EXISTS hits_at ON hits (at)',
  'CREATE INDEX IF NOT EXISTS hits_match ON hits (visitor_key, path, at)',

  `CREATE TABLE IF NOT EXISTS visits (
     id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, ended_at INTEGER,
     duration_ms INTEGER DEFAULT 0, path TEXT, host TEXT, referrer TEXT,
     visitor_key TEXT, country TEXT, region TEXT, city TEXT, timezone TEXT,
     colo TEXT, asn INTEGER, as_org TEXT, ua TEXT, device TEXT, viewport TEXT,
     max_scroll INTEGER DEFAULT 0, bot_score INTEGER DEFAULT 0,
     bot_verdict TEXT, bot_reasons TEXT
   )`,
  'CREATE INDEX IF NOT EXISTS visits_started ON visits (started_at)',
  'CREATE INDEX IF NOT EXISTS visits_visitor ON visits (visitor_key)',

  `CREATE TABLE IF NOT EXISTS visit_areas (
     visit_id TEXT NOT NULL, area TEXT NOT NULL,
     ms INTEGER DEFAULT 0, views INTEGER DEFAULT 0,
     PRIMARY KEY (visit_id, area)
   )`,

  `CREATE TABLE IF NOT EXISTS visit_events (
     id INTEGER PRIMARY KEY AUTOINCREMENT, visit_id TEXT NOT NULL,
     at INTEGER NOT NULL, kind TEXT NOT NULL, target TEXT
   )`,
  'CREATE INDEX IF NOT EXISTS visit_events_visit ON visit_events (visit_id, at)',

  `CREATE TABLE IF NOT EXISTS changes (
     id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, who TEXT,
     resource TEXT NOT NULL, action TEXT NOT NULL, summary TEXT, detail TEXT
   )`,
  'CREATE INDEX IF NOT EXISTS changes_at ON changes (at)',
];

let creating = null;

function createTables(db) {
  if (!creating) {
    creating = db.batch(DDL.map(sql => db.prepare(sql))).finally(() => { creating = null; });
  }
  return creating;
}

export async function withLogs(env, fn) {
  try {
    return await fn();
  } catch (err) {
    if (!/no such table/i.test(String((err && err.message) || err))) throw err;
    await createTables(env.LOGS);
    return fn();
  }
}
