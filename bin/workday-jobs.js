#!/usr/bin/env node
// Usage: workday-jobs <career-site-url> [--search "engineer"] [--max 100] [--details] [--days 7] [--csv]
import { parseSiteUrl, listJobs, jobDetail, normalizeJob, postedDaysAgo } from '../src/workday.js';

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const valued = new Set(['--search', '--max', '--days']);
const url = args.find((a, i) => !a.startsWith('--') && !valued.has(args[i - 1]));
if (!url) {
  console.error('usage: workday-jobs <career-site-url> [--search text] [--max N] [--details] [--days N] [--csv]');
  process.exit(1);
}
const s = parseSiteUrl(url);
if (!s) { console.error(`Not a Workday career site URL: ${url}`); process.exit(1); }
const max = Number(flag('--max') ?? 100);
const days = flag('--days') !== undefined ? Number(flag('--days')) : null;
const details = args.includes('--details');
const csv = args.includes('--csv');
const scrapedAt = new Date().toISOString();
const rows = [];
for await (const { posting } of listJobs(s, { searchText: flag('--search') ?? '', max })) {
  if (days !== null) { const d = postedDaysAgo(posting.postedOn); if (d !== null && d > days) continue; }
  const detail = details ? await jobDetail(s, posting.externalPath).catch(() => null) : null;
  rows.push(normalizeJob(s, posting, detail, { scrapedAt }));
}
if (csv) {
  const cols = ['company', 'title', 'location', 'country', 'remoteType', 'postedOn', 'jobReqId', 'timeType', 'url'];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  console.log(cols.join(','));
  for (const r of rows) console.log(cols.map((c) => q(r[c])).join(','));
} else {
  console.log(JSON.stringify(rows, null, 2));
}
console.error(`${rows.length} jobs from ${s.tenant}/${s.site}`);
