import { hmac, randomHex } from './_lib.js';
import { withLogs } from './_schema.js';

const RETAIN_DAYS = 90;
const ID_WINDOW_DAYS = 30;

export async function visitorKey(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const ua = request.headers.get('User-Agent') || '';
  const window = Math.floor(Date.now() / (ID_WINDOW_DAYS * 24 * 60 * 60 * 1000));
  const salt = await hmac(env.SESSION_SECRET || 'dev', 'w' + window);
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(ip + '|' + ua + '|' + salt)
  );
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

export function geoFrom(request) {
  const cf = request.cf || {};
  const s = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 80) : null);
  return {
    country: s(cf.country),
    region: s(cf.region),
    city: s(cf.city),
    timezone: s(cf.timezone),
    colo: s(cf.colo),
    asn: typeof cf.asn === 'number' ? cf.asn : null,
    as_org: s(cf.asOrganization),
  };
}

const CRAWLER = /bot\b|bot\/|crawler|crawl\b|spider|slurp|archiver|scraper|feedfetcher|facebookexternalhit|bingpreview|yandex|baidu|duckduck|semrush|ahrefs|mj12|dotbot|petalbot|gptbot|claudebot|ccbot|perplexity|bytespider|applebot/i;
const HEADLESS = /headless|phantomjs|puppeteer|playwright|selenium|webdriver|electron\//i;
const CLI = /^curl|^wget|python-requests|python-urllib|go-http-client|^java\/|libwww|okhttp|axios|node-fetch|httpclient|guzzle|^lwp/i;
const DATACENTRE = /amazon|aws|google (cloud|llc)|microsoft|azure|digitalocean|hetzner|ovh|linode|akamai|scaleway|oracle|vultr|contabo|leaseweb|choopa|cloudflare|alibaba|tencent|datacamp|m247|psychz|quadranet/i;

export function serverBotSignals(request) {
  const ua = request.headers.get('User-Agent') || '';
  const cf = request.cf || {};
  const reasons = [];
  let points = 0;

  if (!ua.trim()) {
    points += 40;
    reasons.push('no user agent');
  } else {
    if (CRAWLER.test(ua)) { points += 50; reasons.push('crawler user agent'); }
    if (HEADLESS.test(ua)) { points += 50; reasons.push('headless browser'); }
    if (CLI.test(ua)) { points += 50; reasons.push('command line client'); }
  }

  const org = typeof cf.asOrganization === 'string' ? cf.asOrganization : '';
  if (org && DATACENTRE.test(org)) {
    points += 25;
    reasons.push('datacentre network');
  }

  if (!request.headers.get('Accept-Language')) {
    points += 15;
    reasons.push('no accept-language');
  }

  const accept = request.headers.get('Accept') || '';
  if (accept === '*/*' || !accept) {
    points += 10;
    reasons.push('generic accept header');
  }

  if (!request.headers.get('Sec-Fetch-Mode') && !HEADLESS.test(ua) && ua.trim()) {
    points += 10;
    reasons.push('no fetch metadata');
  }

  const bm = cf.botManagement;
  if (bm) {
    if (bm.verifiedBot) { points += 60; reasons.push('verified bot'); }
    else if (typeof bm.score === 'number' && bm.score <= 30) {
      points += 40;
      reasons.push('low cloudflare bot score');
    }
  }

  return { points, reasons };
}

export function clamp(n, lo, hi) {
  n = Number(n);
  if (!isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

export function classify(points) {
  if (points < 20) return 'human';
  if (points < 40) return 'likely human';
  if (points < 60) return 'unclear';
  if (points < 80) return 'likely bot';
  return 'bot';
}

export function newId() {
  return randomHex(8);
}

export function maybePrune(env, waitUntil) {
  if (!env.LOGS || Math.random() > 0.005) return;
  const cutoff = Date.now() - RETAIN_DAYS * 24 * 60 * 60 * 1000;
  const work = withLogs(env, () => env.LOGS.batch([
    env.LOGS.prepare('DELETE FROM visit_areas WHERE visit_id IN (SELECT id FROM visits WHERE started_at < ?)').bind(cutoff),
    env.LOGS.prepare('DELETE FROM visit_events WHERE visit_id IN (SELECT id FROM visits WHERE started_at < ?)').bind(cutoff),
    env.LOGS.prepare('DELETE FROM visits WHERE started_at < ?').bind(cutoff),
    env.LOGS.prepare('DELETE FROM hits WHERE at < ?').bind(cutoff),
  ])).catch(() => {});
  if (waitUntil) waitUntil(work);
}
