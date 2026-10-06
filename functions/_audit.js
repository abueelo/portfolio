import { withLogs } from './_schema.js';

const MAX_SUMMARY = 500;
const MAX_DETAIL = 4000;

export function recordChange(env, waitUntil, entry) {
  if (!env.LOGS) return;
  const work = withLogs(env, () => env.LOGS
    .prepare('INSERT INTO changes (at, who, resource, action, summary, detail) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(
      Date.now(),
      entry.who || null,
      entry.resource,
      entry.action || 'update',
      (entry.summary || '').slice(0, MAX_SUMMARY) || null,
      entry.detail ? JSON.stringify(entry.detail).slice(0, MAX_DETAIL) : null
    )
    .run())
    .catch(() => {});
  if (waitUntil) waitUntil(work);
}

function plural(n, word) {
  return n + ' ' + word + (n === 1 ? '' : 's');
}

function listNames(names, limit) {
  limit = limit || 3;
  if (names.length <= limit) return names.join(', ');
  return names.slice(0, limit).join(', ') + ' and ' + (names.length - limit) + ' more';
}

function changedFields(before, after, fields) {
  const out = [];
  for (const f of fields) {
    const a = (before && before[f]) || null;
    const b = (after && after[f]) || null;
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(f);
  }
  return out;
}

function keyOf(p) {
  return p.custom ? 'custom:' + p.id : (p.url || p.name);
}

function diffProjects(before, after) {
  const old = new Map((before || []).map(p => [keyOf(p), p]));
  const now = new Map((after || []).map(p => [keyOf(p), p]));
  const added = [];
  const edited = [];
  for (const [k, p] of now) {
    if (!old.has(k)) { added.push(p.name); continue; }
    if (JSON.stringify(old.get(k)) !== JSON.stringify(p)) edited.push(p.name);
  }
  const removed = [...old.keys()].filter(k => !now.has(k)).map(k => old.get(k).name);
  const shown = (after || []).filter(p => !p.hidden).length;

  const bits = [];
  if (added.length) bits.push('added ' + listNames(added));
  if (removed.length) bits.push('removed ' + listNames(removed));
  if (edited.length) bits.push('edited ' + listNames(edited));
  if (!bits.length) bits.push('no visible change');
  bits.push(shown + ' on display');
  return { summary: bits.join(' · '), detail: { added, removed, edited, shown } };
}

function diffPhotos(before, after) {
  const old = new Map((before || []).map(p => [p.id, p]));
  const now = new Map((after || []).map(p => [p.id, p]));
  const added = [...now.keys()].filter(k => !old.has(k));
  const removed = [...old.keys()].filter(k => !now.has(k));
  const edited = [...now.keys()].filter(k => old.has(k) && JSON.stringify(old.get(k)) !== JSON.stringify(now.get(k)));
  const visible = (after || []).filter(p => !p.hidden).length;

  const bits = [];
  if (added.length) bits.push('added ' + plural(added.length, 'photo'));
  if (removed.length) bits.push('removed ' + plural(removed.length, 'photo'));
  if (edited.length) bits.push('edited ' + plural(edited.length, 'photo'));
  if (!bits.length) bits.push('no visible change');
  bits.push(visible + ' in the gallery');
  return { summary: bits.join(' · '), detail: { added, removed, edited, visible } };
}

function diffSite(before, after) {
  const fields = changedFields(before, after, ['tagline', 'about', 'photoAbout', 'contacts', 'history']);
  const label = {
    tagline: 'tagline', about: 'about text', photoAbout: 'photography about text',
    contacts: 'links', history: 'history',
  };
  const summary = fields.length
    ? 'changed ' + fields.map(f => label[f] || f).join(', ')
    : 'saved with no change';
  return { summary, detail: { fields } };
}

function diffVisibility(before, after) {
  const bits = [];
  const b = before || {};
  const a = after || {};
  if (!!b.siteDown !== !!a.siteDown) bits.push(a.siteDown ? 'took the whole site offline' : 'brought the site back online');
  for (const page of Object.keys(a.pages || {})) {
    const was = !!(b.pages && b.pages[page] && b.pages[page].hidden);
    const is = !!(a.pages[page] && a.pages[page].hidden);
    if (was !== is) bits.push((is ? 'hid' : 'unhid') + ' /' + page);
  }
  if (changedFields(b, a, ['siteMessage']).length) bits.push('changed the offline message');
  if (!bits.length) bits.push('saved with no change');
  return { summary: bits.join(' · '), detail: { siteDown: !!a.siteDown } };
}

function diffNotFound(before, after) {
  const fields = changedFields(before, after, ['title', 'message', 'buttonLabel', 'buttonEnabled']);
  const summary = fields.length ? 'changed ' + fields.join(', ') : 'saved with no change';
  return { summary, detail: { fields } };
}

export function summarise(resource, before, after) {
  if (resource === 'projects') return diffProjects(before, after);
  if (resource === 'photos') return diffPhotos(before, after);
  if (resource === 'site') return diffSite(before, after);
  if (resource === 'visibility') return diffVisibility(before, after);
  if (resource === 'notfound') return diffNotFound(before, after);
  return { summary: 'updated', detail: null };
}
