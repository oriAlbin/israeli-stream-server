/**
 * scrapers.js
 *
 * Each function returns a Promise<{ id, url, source }>.
 *
 * For channels whose pages are JavaScript-rendered (c14, i24, kan, galei),
 * we call the broadcaster's internal JSON/stream API directly instead of
 * scraping HTML, which is how the browser actually gets the stream URL.
 */

const axios = require('axios');

// ── Shared HTTP client ───────────────────────────────────────────────────────
const http = axios.create({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8',
  },
  validateStatus: () => true,
});

// ── Helper: HEAD-check a URL ─────────────────────────────────────────────────
async function isAlive(url) {
  try {
    const res = await http.head(url, { timeout: 8000 });
    return res.status < 400;
  } catch {
    return false;
  }
}

// ── Helper: try a list of candidates, return first alive ────────────────────
async function firstAlive(id, candidates) {
  for (const url of candidates) {
    if (await isAlive(url)) return { id, url, source: 'verified-known' };
  }
  return null;
}

// ── Helper: extract first m3u8 from a string ─────────────────────────────────
function extractM3u8(text) {
  const m = text.match(/https?:\/\/[^\s"'\\<>]+\.m3u8[^\s"'\\<>]*/);
  return m ? m[0] : null;
}

// ── Helper: extract first icecast/mp3/aac stream URL ─────────────────────────
function extractAudio(text) {
  const m = text.match(/https?:\/\/[^\s"'\\<>]+(icecast\.audio|\.mp3|\.aac|_mp3|_aac)[^\s"'\\<>]*/i);
  return m ? m[0] : null;
}

// ────────────────────────────────────────────────────────────────────────────
// TV CHANNELS
// ────────────────────────────────────────────────────────────────────────────

// כאן 11
async function scrapeKan11() {
  const result = await firstAlive('kan11', [
    'https://kan11w.media.kan.org.il/hls/live/2105694/2105694/master.m3u8',
    'https://kancdn.medonecdn.net/livehls/oil/kancdn-live/live/kan11/live.livx/playlist.m3u8',
    'https://kan11.media.kan.org.il/hls/live/2024514/2024514/master.m3u8',
    'https://kan11sub.media.kan.org.il/hls/live/2024678/2024678/master.m3u8',
  ]);
  if (result) return result;
  throw new Error('Kan 11 URL not found');
}

// קשת 12
async function scrapeKeshet12() {
  const result = await firstAlive('keshet12', [
    'https://mako-streaming.akamaized.net/stream/hls/live/2033791/k12dvr/profile/5/profileManifest.m3u8?_uid=0&rK=b6',
    'https://mako-streaming.akamaized.net/n12/hls/live/2103938/k12/index.m3u8',
    'https://mako-streaming.akamaized.net/direct/hls/live/2033791/k12dvr/index.m3u8',
  ]);
  if (result) return result;
  throw new Error('Keshet 12 URL not found');
}

// ערוץ 14
// The live page is c14.co.il/live?t=1 — it loads the stream via a Wowza/CDN
// API call. We call the known CDN endpoints and also try the Wowza API.
async function scrapeChannel14() {
  // Known CDN candidates
  const result = await firstAlive('channel14', [
    'https://c14-wowza.cdn.wizzlv.com/c14/live/hls/index.m3u8',
    'https://now14-cdn.wizzlv.com/now14/live/hls/index.m3u8',
    'https://vod.c14.co.il/live/hls/index.m3u8',
    'https://channel14-live-consume.immergo.tv/channel14/live/hls/index.m3u8',
    'https://1247634592.rsc.cdn77.org/1247634592/playlist.m3u8',
  ]);
  if (result) return result;

  // Try calling the C14 stream-info API that the player page uses
  try {
    const apiRes = await http.get('https://www.c14.co.il/api/live-stream', {
      headers: { 'Referer': 'https://www.c14.co.il/live' }
    });
    const text = JSON.stringify(apiRes.data);
    const m3u8 = extractM3u8(text);
    if (m3u8) return { id: 'channel14', url: m3u8, source: 'c14-api' };
  } catch {}

  throw new Error('Channel 14 URL not found');
}

// ערוץ 15 — i24 News Hebrew
// The page video.i24news.tv/live/brightcove/he uses Brightcove player.
// The Brightcove account for i24 is 5377161796001.
// We call the Brightcove playback API to get a fresh HLS URL.
async function scrapeChannel15() {
  // Known stable Akamai CDN URLs for i24 Hebrew (from iptv-org database)
  const result = await firstAlive('channel15', [
    'https://bcovlive-a.akamaihd.net/d89ede8094c741b7924120b27764153c/eu-central-1/5377161796001/playlist.m3u8',
    'https://bcovlive-a.akamaihd.net/95116e8d79524d87bf3ac20ba04241e3/eu-central-1/5377161796001/playlist.m3u8',
  ]);
  if (result) return result;

  // Try the Brightcove Playback API for i24 Hebrew live stream
  // Account: 5377161796001, Video ID for i24 Hebrew live: 5476555825001
  try {
    const bcRes = await http.get(
      'https://edge.api.brightcove.com/playback/v1/accounts/5377161796001/videos/5476555825001',
      {
        headers: {
          'Accept': 'application/json;pk=BCpkADawqM0T8lW3nMChuAbrcunBBHmh4YkNl5e6ZrKd74sRll9-5IkT_d-R0inside_oMkAaHa2fP8bPdv6wFNLt3fjFDioqjfz7g2UrEg8cNNW8pYTarR0nE-w31ZvK_OBKK2F_F9-YZr0NKOkZCqFIV4c43kTp4j'
        }
      }
    );
    if (bcRes.data && bcRes.data.sources) {
      const hls = bcRes.data.sources.find(s => s.type === 'application/x-mpegURL' && s.src);
      if (hls) return { id: 'channel15', url: hls.src, source: 'brightcove-api' };
    }
  } catch {}

  throw new Error('Channel 15 / i24 URL not found');
}

// ────────────────────────────────────────────────────────────────────────────
// RADIO STATIONS
// ────────────────────────────────────────────────────────────────────────────

// גלי צהל
async function scrapeGalatz() {
  const result = await firstAlive('galatz', [
    'https://glzwizzlv.bynetcdn.com/glz_mp3',
    'https://glz-cdn.wizzlv.com/glz_mp3',
  ]);
  if (result) return result;
  throw new Error('Galatz URL not found');
}

// רשת ב
// The Kan website at kan.org.il/live/?stationId=4483 uses the Kan ICY streams.
// The confirmed working ICY endpoint for Kan Bet (stationId 4483) is kanbet_mp3.
async function scrapeReshetB() {
  const result = await firstAlive('reshetb', [
    'https://kanliveicy.media.kan.org.il/icy/kanbet_mp3',
    'https://kanbet.media.kan.org.il/hls/live/2024811/2024811/playlist.m3u8',
    'https://kanbet.media.kan.org.il/hls/live/2024811/2024811/kanbet_mp3/chunklist.m3u8',
    'https://rb3wizzlv.bynetcdn.com/rb3_mp3',
  ]);
  if (result) return result;

  // Try calling the Kan stream API — same API the website uses for all stations
  try {
    const apiRes = await http.get(
      'https://www.kan.org.il/stream/?stationId=4483',
      { headers: { 'Referer': 'https://www.kan.org.il/live/' } }
    );
    const text = typeof apiRes.data === 'string' ? apiRes.data : JSON.stringify(apiRes.data);
    const url = extractM3u8(text) || extractAudio(text);
    if (url) return { id: 'reshetb', url, source: 'kan-api' };
  } catch {}

  throw new Error('Reshet B URL not found');
}

// גלי ישראל
// The website gly.co.il uses a Wowza/streamgates CDN.
// rlive.co.il and fm1.co.il both embed the same stream.
async function scrapeGalei() {
  const result = await firstAlive('galei', [
    'https://cdn.cybercdn.live/GaleyIsrael/Live/icecast.audio',
    'https://glylive.wizzlv.com/gly/live/icecast.audio',
    'https://galey-israel.streamgates.net/GaleyIsrael/mp3/icy',
    'https://icy.streamgates.net/GaleyIsrael/mp3/icy',
    'https://live.radiodarom.co.il:1935/livegaleyisrael/galiaud1/manifest.m3u8',
  ]);
  if (result) return result;

  // Try fetching the gly.co.il stream API
  try {
    const apiRes = await http.get('https://www.gly.co.il/api/stream', {
      headers: { 'Referer': 'https://www.gly.co.il/' }
    });
    const text = typeof apiRes.data === 'string' ? apiRes.data : JSON.stringify(apiRes.data);
    const url = extractM3u8(text) || extractAudio(text);
    if (url) return { id: 'galei', url, source: 'gly-api' };
  } catch {}

  throw new Error('Galei Israel URL not found');
}

// 103FM
async function scrapeFm103() {
  const result = await firstAlive('fm103', [
    'https://cdn.cybercdn.live/103FM/Live/icecast.audio',
    'https://cdn88.mediacast.co.il/103fm/103fm_aac/icecast.audio',
    'https://103fm.streamgates.net/103fm_aac/icecast.audio',
  ]);
  if (result) return result;
  throw new Error('103FM URL not found');
}

// 99FM
async function scrapeFm99() {
  const result = await firstAlive('fm99', [
    'https://eco-live.mediacast.co.il/99fm_aac',
    'https://cdn.cybercdn.live/99FM/Live/icecast.audio',
    'https://99fm.streamgates.net/99fm_aac/icecast.audio',
  ]);
  if (result) return result;
  throw new Error('99FM URL not found');
}

// גלגלץ
async function scrapeGalgalatz() {
  const result = await firstAlive('galgalatz', [
    'https://glzwizzlv.bynetcdn.com/glglz_mp3',
    'https://glglz-cdn.wizzlv.com/glglz_mp3',
  ]);
  if (result) return result;
  throw new Error('Galgalatz URL not found');
}

// 102FM
async function scrapeFm102() {
  const result = await firstAlive('fm102', [
    'https://102.livecdn.biz/102fm_mp3',
    'https://cdn88.mediacast.co.il/102fm-tlv/102fm_aac/icecast.audio',
    'https://cdn.cybercdn.live/102FM/Live/icecast.audio',
  ]);
  if (result) return result;
  throw new Error('102FM URL not found');
}

// Radius 100
async function scrapeRadius100() {
  const result = await firstAlive('radius100', [
    'https://cdn.cybercdn.live/Radios_100FM/Audio/playlist.m3u8',
    'https://cdn.cybercdn.live/Radios_100FM/Audio/icecast.audio',
    'https://20423.live.streamtheworld.com/RADIUS100AAC.aac',
  ]);
  if (result) return result;
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