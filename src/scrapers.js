/**
 * scrapers.js
 *
 * Each function fetches the broadcaster's page and extracts the current
 * live HLS/AAC stream URL. They all return a Promise<{ id, url, source }>.
 *
 * Strategy per channel:
 *  - Stable public streams (Kan, radio stations): verify the known URL is
 *    still alive with a HEAD request. If it is, return it as-is.
 *  - Ticket-based streams (Keshet 12): fetch the live page and parse the
 *    m3u8 URL out of the page source or the network manifest API.
 *  - CDN streams: HEAD check, fall back to scraping if dead.
 */

const axios   = require('axios');
const cheerio = require('cheerio');

// ── Shared HTTP client ───────────────────────────────────────────────────────
const http = axios.create({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8',
  },
  // Don't throw on 4xx/5xx — we check status ourselves
  validateStatus: () => true,
});

// ── Helper: check if a stream URL is alive (HEAD request) ───────────────────
async function isAlive(url) {
  try {
    const res = await http.head(url, { timeout: 8000 });
    return res.status < 400;
  } catch {
    return false;
  }
}

// ── Helper: GET with retries ─────────────────────────────────────────────────
async function get(url, options = {}, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await http.get(url, options);
    } catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 1500));
    }
  }
}

// ── Helper: extract first m3u8 match from a string ──────────────────────────
function extractM3u8(text) {
  const match = text.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/);
  return match ? match[0] : null;
}

// ────────────────────────────────────────────────────────────────────────────
// TV CHANNELS
// ────────────────────────────────────────────────────────────────────────────

// כאן 11 — official Kan CDN, very stable
async function scrapeKan11() {
  const known = 'https://kan11.media.kan.org.il/hls/live/2024514/2024514/master.m3u8';
  if (await isAlive(known)) return { id: 'kan11', url: known, source: 'verified-known' };

  // Fallback: fetch Kan live page and look for HLS URL
  const res = await get('https://www.kan.org.il/live/');
  const $   = cheerio.load(res.data);
  const src = $('video source').attr('src') ||
              extractM3u8(res.data);
  if (src) return { id: 'kan11', url: src, source: 'scraped-kan' };
  throw new Error('Kan 11 URL not found');
}

// קשת 12 — Mako, uses expiring ticket tokens
// We fetch the Mako live page, find the JSON config block that contains
// the HLS URL including the fresh TICKET parameter.
async function scrapeKeshet12() {
  // Try the Mako VOD live API first — returns JSON with the stream URL
  const apiRes = await get(
    'https://www.mako.co.il/mako-vod-live-tv/VOD-6540b8dcb64fd31006.htm',
    { headers: { 'Referer': 'https://www.mako.co.il/' } }
  );

  // Look for m3u8 URL with optional ticket param in the HTML
  const m3u8 = extractM3u8(apiRes.data);
  if (m3u8) return { id: 'keshet12', url: m3u8, source: 'scraped-mako' };

  // Try the Mako player config API
  const configRes = await get(
    'https://mass.mako.co.il/ClicksStatistics/entitlementsV2.aspx?et=PermaLinkFile&lp=/mako-vod-live-tv/VOD-6540b8dcb64fd31006.htm&rv=0',
    { headers: { 'Referer': 'https://www.mako.co.il/' } }
  );
  if (configRes.data?.videoUrl) return { id: 'keshet12', url: configRes.data.videoUrl, source: 'mako-api' };

  const m3u8b = extractM3u8(JSON.stringify(configRes.data));
  if (m3u8b) return { id: 'keshet12', url: m3u8b, source: 'mako-api-parsed' };

  throw new Error('Keshet 12 ticket URL not found — will use cached value');
}

// ערוץ 14
async function scrapeChannel14() {
  const known = 'https://channel14-live-consume.immergo.tv/channel14/live/hls/index.m3u8';
  if (await isAlive(known)) return { id: 'channel14', url: known, source: 'verified-known' };

  // Scrape now14.co.il for a fresh URL
  const res = await get('https://www.now14.co.il/live');
  const m3u8 = extractM3u8(res.data);
  if (m3u8) return { id: 'channel14', url: m3u8, source: 'scraped-now14' };
  throw new Error('Channel 14 URL not found');
}

// ערוץ 15
async function scrapeChannel15() {
  const known = 'https://d2xg1g9o5vns8m.cloudfront.net/out/v1/66d4ac8748ce4a9298b4e40e48d1ae2f/index.m3u8';
  if (await isAlive(known)) return { id: 'channel15', url: known, source: 'verified-known' };

  const res = await get('https://www.15tv.co.il/live');
  const m3u8 = extractM3u8(res.data);
  if (m3u8) return { id: 'channel15', url: m3u8, source: 'scraped-15tv' };
  throw new Error('Channel 15 URL not found');
}

// ────────────────────────────────────────────────────────────────────────────
// RADIO STATIONS
// All radio stations use stable AAC/MP3 stream URLs that rarely change.
// We just HEAD-check them and return the known URL if alive.
// ────────────────────────────────────────────────────────────────────────────

async function scrapeGalatz() {
  const candidates = [
    'https://glzwizzlv.bynetcdn.com/glz_mp3',
    'https://glz-cdn.wizzlv.com/glz_mp3',
  ];
  for (const url of candidates) {
    if (await isAlive(url)) return { id: 'galatz', url, source: 'verified-known' };
  }
  // Scrape Galatz live page
  const res = await get('https://glz.co.il/live');
  const m3u8 = extractM3u8(res.data) ||
    res.data.match(/https?:\/\/[^\s"'<>]+(mp3|aac|stream)[^\s"'<>]*/i)?.[0];
  if (m3u8) return { id: 'galatz', url: m3u8, source: 'scraped-glz' };
  throw new Error('Galatz URL not found');
}

async function scrapeReshetB() {
  const candidates = [
    'https://kanbet.media.kan.org.il/hls/live/2024811/2024811/kanbet_mp3/chunklist.m3u8',
    'https://rb3wizzlv.bynetcdn.com/rb3_mp3',
  ];
  for (const url of candidates) {
    if (await isAlive(url)) return { id: 'reshetb', url, source: 'verified-known' };
  }
  const res = await get('https://www.kan.org.il/radio/reshetbet/');
  const m3u8 = extractM3u8(res.data);
  if (m3u8) return { id: 'reshetb', url: m3u8, source: 'scraped-kan' };
  throw new Error('Reshet B URL not found');
}

async function scrapeGalei() {
  const candidates = [
    'https://live.radiodarom.co.il:1935/livegaleyisrael/galiaud1/manifest.m3u8',
    'https://galey-israel.streamgates.net/GaleyIsrael/mp3/icy',
  ];
  for (const url of candidates) {
    if (await isAlive(url)) return { id: 'galei', url, source: 'verified-known' };
  }
  const res = await get('https://www.galey-israel.co.il/live');
  const m3u8 = extractM3u8(res.data);
  if (m3u8) return { id: 'galei', url: m3u8, source: 'scraped-galei' };
  throw new Error('Galei Israel URL not found');
}

async function scrapeFm103() {
  const candidates = [
    'https://cdn88.mediacast.co.il/103fm/103fm_aac/icecast.audio',
    'https://103fm.streamgates.net/103fm_mp3',
  ];
  for (const url of candidates) {
    if (await isAlive(url)) return { id: 'fm103', url, source: 'verified-known' };
  }
  const res = await get('https://www.103fm.co.il/live');
  const m3u8 = extractM3u8(res.data);
  if (m3u8) return { id: 'fm103', url: m3u8, source: 'scraped-103fm' };
  throw new Error('103FM URL not found');
}

async function scrapeFm99() {
  const candidates = [
    'https://eco-live.mediacast.co.il/99fm_aac',
    'https://99fm.streamgates.net/99fm_mp3',
  ];
  for (const url of candidates) {
    if (await isAlive(url)) return { id: 'fm99', url, source: 'verified-known' };
  }
  const res = await get('https://www.99fm.co.il/live');
  const m3u8 = extractM3u8(res.data);
  if (m3u8) return { id: 'fm99', url: m3u8, source: 'scraped-99fm' };
  throw new Error('99FM URL not found');
}

async function scrapeGalgalatz() {
  const candidates = [
    'https://glzwizzlv.bynetcdn.com/glglz_mp3',
    'https://glglz-cdn.wizzlv.com/glglz_mp3',
  ];
  for (const url of candidates) {
    if (await isAlive(url)) return { id: 'galgalatz', url, source: 'verified-known' };
  }
  const res = await get('https://glz.co.il/galgalatz');
  const m3u8 = extractM3u8(res.data) ||
    res.data.match(/https?:\/\/[^\s"'<>]+(mp3|aac|stream)[^\s"'<>]*/i)?.[0];
  if (m3u8) return { id: 'galgalatz', url: m3u8, source: 'scraped-glz' };
  throw new Error('Galgalatz URL not found');
}

async function scrapeFm102() {
  const candidates = [
    'https://cdn88.mediacast.co.il/102fm-tlv/102fm_aac/icecast.audio',
    'https://102fm.streamgates.net/102fm_mp3',
  ];
  for (const url of candidates) {
    if (await isAlive(url)) return { id: 'fm102', url, source: 'verified-known' };
  }
  const res = await get('https://www.102fm.co.il/live');
  const m3u8 = extractM3u8(res.data);
  if (m3u8) return { id: 'fm102', url: m3u8, source: 'scraped-102fm' };
  throw new Error('102FM URL not found');
}

async function scrapeRadius100() {
  const candidates = [
    'https://cdn.cybercdn.live/Radios_100FM/Audio/playlist.m3u8',
    'https://20423.live.streamtheworld.com/RADIUS100AAC.aac',
  ];
  for (const url of candidates) {
    if (await isAlive(url)) return { id: 'radius100', url, source: 'verified-known' };
  }
  const res = await get('https://www.radius100.co.il/live');
  const m3u8 = extractM3u8(res.data);
  if (m3u8) return { id: 'radius100', url: m3u8, source: 'scraped-radius100' };
  throw new Error('Radius 100 URL not found');
}

// ── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  scrapeKan11,
  scrapeKeshet12,
  scrapeChannel14,
  scrapeChannel15,
  scrapeGalatz,
  scrapeReshetB,
  scrapeGalei,
  scrapeFm103,
  scrapeFm99,
  scrapeGalgalatz,
  scrapeFm102,
  scrapeRadius100,
};
