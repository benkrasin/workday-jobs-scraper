// Workday career-site client using the public JSON endpoints that power the sites' own job pages.
const UA = 'Mozilla/5.0 (compatible; KrasynLabsWorkdayJobsScraper/0.1; +https://apify.com/krasyn-side/workday-jobs-scraper)';
const MIN_GAP_MS = 1000; // ~1 request per second per host
const lastHit = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/... -> {tenant, host, site}
export function parseSiteUrl(raw) {
  let u;
  try { u = new URL(String(raw).trim().startsWith('http') ? String(raw).trim() : `https://${String(raw).trim()}`); } catch { return null; }
  const host = u.hostname.toLowerCase();
  const m = host.match(/^(?:([a-z0-9-]+)\.)?(wd\d+)\.(myworkdayjobs|myworkdaysite)\.com$/);
  if (!m) return null;
  let parts = u.pathname.split('/').filter(Boolean);
  // /wday/cxs/<tenant>/<site>/... API URL form
  if (parts[0] === 'wday' && parts[1] === 'cxs' && parts.length >= 4) return { tenant: parts[2], host, site: parts[3] };
  if (parts[0] && /^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(parts[0])) parts = parts.slice(1); // locale like en-US, fr-FR
  // myworkdaysite.com form: /recruiting/<tenant>/<site>
  if (parts[0] === 'recruiting' && parts.length >= 3) return { tenant: parts[1], host, site: parts[2] };
  if (!m[1]) return null;
  const site = parts[0];
  if (!site || site === 'job' || site === 'details') return null;
  return { tenant: m[1], host, site };
}

async function request(url, { method = 'GET', body } = {}, attempts = 5) {
  const host = new URL(url).hostname;
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    const wait = (lastHit.get(host) ?? 0) + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastHit.set(host, Date.now());
    try {
      const res = await fetch(url, {
        method,
        headers: { 'User-Agent': UA, Accept: 'application/json', 'Content-Type': 'application/json', 'Accept-Language': 'en-US' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) return await res.json();
      lastErr = new Error(`HTTP ${res.status} for ${method} ${url}`);
      if (res.status === 404 || (res.status >= 400 && res.status < 429 && res.status !== 408)) throw Object.assign(lastErr, { fatal: true });
    } catch (e) {
      if (e.fatal) throw e;
      lastErr = e;
    }
    await sleep(Math.min(30000, 2000 * 2 ** i) + Math.random() * 500);
  }
  throw lastErr;
}

const base = ({ host, tenant, site }) => `https://${host}/wday/cxs/${tenant}/${site}`;

// Yields raw job postings page by page (Workday allows max 20 per page).
export async function* listJobs(s, { searchText = '', max = Infinity, appliedFacets = {} } = {}) {
  let offset = 0; let total = null; let got = 0;
  while (got < max) {
    const limit = 20;
    const data = await request(`${base(s)}/jobs`, { method: 'POST', body: { appliedFacets, limit, offset, searchText } });
    if (total === null) total = data.total ?? 0; // total is only reported on the first page
    const page = data.jobPostings ?? [];
    if (!page.length) break;
    for (const p of page) { if (got >= max) break; got++; yield { posting: p, total }; }
    offset += page.length;
    if (offset >= total || page.length < limit) break;
  }
}

export async function jobDetail(s, externalPath) {
  const d = await request(`${base(s)}${externalPath}`);
  return d;
}

// "Posted Today" / "Posted Yesterday" / "Posted 3 Days Ago" / "Posted 30+ Days Ago" -> days (null if unknown)
export function postedDaysAgo(text) {
  if (!text) return null;
  const t = String(text).toLowerCase();
  if (t.includes('today')) return 0;
  if (t.includes('yesterday')) return 1;
  const m = t.match(/(\d+)\+?\s*day/);
  if (m) return t.includes('+') ? Number(m[1]) + 1 : Number(m[1]);
  return null;
}

const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
export function htmlToText(html) {
  if (!html) return null;
  return decode(String(html)
    .replace(/<\s*(br|\/p|\/div|\/li|\/h\d|\/tr)\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').replace(/^ +| +$/gm, '').trim();
}

export function normalizeJob(s, posting, detail, { scrapedAt, includeDescriptionHtml = false } = {}) {
  const info = detail?.jobPostingInfo;
  const daysAgo = postedDaysAgo(info?.postedOn ?? posting.postedOn);
  const locations = info ? [info.location, ...(info.additionalLocations ?? [])].filter(Boolean) : (posting.locationsText ? [posting.locationsText] : []);
  const row = {
    company: s.tenant,
    hiringEntity: detail?.hiringOrganization?.name || null,
    tenant: s.tenant,
    site: s.site,
    title: info?.title ?? posting.title,
    location: info?.location ?? posting.locationsText ?? null,
    locations,
    country: info?.jobRequisitionLocation?.country?.descriptor ?? info?.country?.descriptor ?? null,
    countryCode: info?.jobRequisitionLocation?.country?.alpha2Code ?? null,
    remoteType: info?.remoteType ?? posting.remoteType ?? null,
    postedOn: info?.postedOn ?? posting.postedOn ?? null,
    postedDaysAgo: daysAgo,
    postedDate: info?.startDate ?? (daysAgo !== null && daysAgo <= 30 && !/\+/.test(posting.postedOn ?? '') ? new Date(Date.now() - daysAgo * 864e5).toISOString().slice(0, 10) : null),
    applyEndDate: info?.endDate ?? null,
    jobReqId: info?.jobReqId ?? posting.bulletFields?.[0] ?? null,
    jobPostingId: info?.jobPostingId ?? posting.externalPath?.split('/').pop() ?? null,
    timeType: info?.timeType ?? null,
    url: info?.externalUrl ?? (s.host.includes('myworkdaysite') ? `https://${s.host}/recruiting/${s.tenant}/${s.site}${posting.externalPath}` : `https://${s.host}/${s.site}${posting.externalPath}`),
    description: info ? htmlToText(info.jobDescription) : null,
    scrapedAt,
  };
  if (includeDescriptionHtml) row.descriptionHtml = info?.jobDescription ?? null;
  return row;
}
