/**
 * scrapers.js
 *
 * Each function checks a list of candidate URLs with a HEAD request.
 * Returns the first live one. Falls back to scraping the broadcaster's
 * website if all candidates fail.
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
  validateStatus: () => true,
});

// ── Helper: check if a stream URL responds (HEAD request) ───────────────────
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

// ── Helper: extract first m3u8 URL from a string ────────────────────────────
function extractM3u8(text) {
  const match = text.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/);
  return match ? match[0] : null;
}

// ────────────────────────────────────────────────────────────────────────────
// TV CHANNELS
// ────────────────────────────────────────────────────────────────────────────

// כאן 11
async function scrapeKan11() {
  const candidates = [
    'https://kan11w.media.kan.org.il/hls/live/2105694/2105694/master.m3u8',
    'https://kancdn.medonecdn.net/livehls/oil/kancdn-live/live/kan11/live.livx/playlist.m3u8',
    'https://kan11.media.kan.org.il/hls/live/2024514/2024514/master.m3u8',
    'https://kan11sub.media.kan.org.il/hls/live/2024678/2024678/master.m3u8',
  ];
  for (const url of candidates) {
    if (await isAlive(url)) return { id: 'kan11', url, source: 'verified-known' };
  }
  try {
    const res = await get('https://www.kan.org.il/live/');
    const m3u8 = extractM3u8(res.data);
    if (m3u8) return { id: 'kan11', url: m3u8, source: 'scraped-kan' };
  } catch {}
  throw new Error('Kan 11 URL not found');
}

// קשת 12
async function scrapeKeshet12() {
  const candidates = [
    'https://mako-streaming.akamaized.net/stream/hls/live/2033791/k12dvr/profile/5/profileManifest.m3u8?_uid=0&rK=b6',
    'https://mako-streaming.akamaized.net/n12/hls/live/2103938/k12/index.m3u8',
    'https://mako-streaming.akamaized.net/direct/hls/live/2033791/k12dvr/index.m3u8',
  ];
  for (const url of candidates) {
    if (await isAlive(url)) return { id: 'keshet12', url, source: 'verified-known' };
  }
  throw new Error('Keshet 12 URL not found');
}

// ערוץ 14
async function scrapeChannel14() {
  const candidates = [
    'https://now14-cdn.wizzlv.com/now14/live/hls/index.m3u8',
    'https://vod.c14.co.il/live/hls/index.m3u8',
    'https://channel14-live-consume.immergo.tv/channel14/live/hls/index.m3u8',
    'https://1247634592.rsc.cdn77.org/1247634592/playlist.m3u8',
  ];
  for (const url of candidates) {
    if (await isAlive(url)) return { id: 'channel14', url, source: 'verified-known' };
  }
  try {
    const res = await get('https://www.c14.co.il/live', {
      headers: { 'Referer': 'https://www.c14.co.il/' }
    });
    const m3u8 = extractM3u8(res.data);
    if (m3u8) return { id: 'channel14', url: m3u8, source: 'scraped-c14' };
  } catch {}
  throw new Error('Channel 14 URL not found');
}

// ערוץ 15 — i24 News Hebrew
// Channel 15 in Israel broadcasts i24 News.
// URLs confirmed from iptv-org/iptv public database.
async function scrapeChannel15() {
  const candidates = [
    // i24 News Hebrew
    'https://bcovlive-a.akamaihd.net/d89ede8094c741b7924120b27764153c/eu-central-1/5377161796001/playlist.m3u8',
    // i24 News English fallback
    'https://bcovlive-a.akamaihd.net/95116e8d79524d87bf3ac20ba04241e3/eu-central-1/5377161796001/playlist.m3u8',
    // i24 News French fallback
    'https://bcovlive-a.akamaihd.net/ecf224f43f3b43e69471a7b626481af0/eu-central-1/5377161796001/playlist.m3u8',
  ];
  for (const url of candidates) {
    if (await isAlive(url)) return { id: 'channel15', url, source: 'verified-known' };
  }
  throw new Error('Channel 15 / i24 URL not found');
}

// ────────────────────────────────────────────────────────────────────────────
// RADIO STATIONS
// ────────────────────────────────────────────────────────────────────────────

// גלי צהל
async function scrapeGalatz() {
  const candidates = [
    'https://glzwizzlv.bynetcdn.com/glz_mp3',
    'https://glz-cdn.wizzlv.com/glz_mp3',
  ];
  for (const url of candidates) {
    if (await isAlive(url)) return { id: 'galatz', url, source: 'verified-known' };
  }
  throw new Error('Galatz URL not found');
}

// רשת ב — ICY endpoint confirmed working from multiple Israeli radio sources
async function scrapeReshetB() {
  const candidates = [
    'https://kanliveicy.media.kan.org.il/icy/kanbet_mp3',
    'https://kanbet.media.kan.org.il/hls/live/2024811/2024811/playlist.m3u8',
    'https://kanbet.media.kan.org.il/hls/live/2024811/2024811/kanbet_mp3/chunklist.m3u8',
    'https://rb3wizzlv.bynetcdn.com/rb3_mp3',
  ];
  for (const url of candidates) {
    if (await isAlive(url)) return { id: 'reshetb', url, source: 'verified-known' };
  }
  throw new Error('Reshet B URL not found');
}

// גלי ישראל — confirmed from idoroseman.com Israeli radio URL list (Oct 2025)
async function scrapeGalei() {
  const candidates = [
    'https://cdn.cybercdn.live/GaleyIsrael/Live/icecast.audio',
    'https://galey-israel.streamgates.net/GaleyIsrael/mp3/icy',
    'https://icy.streamgates.net/GaleyIsrael/mp3/icy',
    'https://live.radiodarom.co.il:1935/livegaleyisrael/galiaud1/manifest.m3u8',
  ];
  for (const url of candidates) {
    if (await isAlive(url)) return { id: 'galei', url, source: 'verified-known' };
  }
  throw new Error('Galei Israel URL not found');
}

// 103FM — confirmed from radiory.com
async function scrapeFm103() {
  const candidates = [
    'https://cdn.cybercdn.live/103FM/Live/icecast.audio',
    'https://cdn88.mediacast.co.il/103fm/103fm_aac/icecast.audio',
    'https://103fm.streamgates.net/103fm_aac/icecast.audio',
  ];
  for (const url of candidates) {
    if (await isAlive(url)) return { id: 'fm103', url, source: 'verified-known' };
  }
  throw new Error('103FM URL not found');
}

// 99FM
async function scrapeFm99() {
  const candidates = [
    'https://eco-live.mediacast.co.il/99fm_aac',
    'https://cdn.cybercdn.live/99FM/Live/icecast.audio',
    'https://99fm.streamgates.net/99fm_aac/icecast.audio',
  ];
  for (const url of candidates) {
    if (await isAlive(url)) return { id: 'fm99', url, source: 'verified-known' };
  }
  throw new Error('99FM URL not found');
}

// גלגלץ
async function scrapeGalgalatz() {
  const candidates = [
    'https://glzwizzlv.bynetcdn.com/glglz_mp3',
    'https://glglz-cdn.wizzlv.com/glglz_mp3',
  ];
  for (const url of candidates) {
    if (await isAlive(url)) return { id: 'galgalatz', url, source: 'verified-known' };
  }
  throw new Error('Galgalatz URL not found');
}

// 102FM — confirmed from idoroseman.com
async function scrapeFm102() {
  const candidates = [
    'https://102.livecdn.biz/102fm_mp3',
    'https://cdn88.mediacast.co.il/102fm-tlv/102fm_aac/icecast.audio',
    'https://cdn.cybercdn.live/102FM/Live/icecast.audio',
  ];
  for (const url of candidates) {
    if (await isAlive(url)) return { id: 'fm102', url, source: 'verified-known' };
  }
  throw new Error('102FM URL not found');
}

// Radius 100
async function scrapeRadius100() {
  const candidates = [
    'https://cdn.cybercdn.live/Radios_100FM/Audio/playlist.m3u8',
    'https://cdn.cybercdn.live/Radios_100FM/Audio/icecast.audio',
    'https://20423.live.streamtheworld.com/RADIUS100AAC.aac',
  ];
  for (const url of candidates) {
    if (await isAlive(url)) return { id: 'radius100', url, source: 'verified-known' };
  }
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