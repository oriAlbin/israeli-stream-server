const express = require('express');
const cron    = require('node-cron');
const scrapers = require('./scrapers');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── In-memory cache ─────────────────────────────────────────────────────────
// Holds the latest known-good URL for every channel.
// Starts with hardcoded fallbacks so the server is useful immediately on boot,
// even before the first scrape completes.
let cache = {
  // TV
  kan11:     { url: 'https://kan11.media.kan.org.il/hls/live/2024514/2024514/master.m3u8',         updated: null, source: 'fallback' },
  keshet12:  { url: '',                                                                              updated: null, source: 'fallback' },
  channel14: { url: 'https://channel14-live-consume.immergo.tv/channel14/live/hls/index.m3u8',     updated: null, source: 'fallback' },
  channel15: { url: 'https://d2xg1g9o5vns8m.cloudfront.net/out/v1/66d4ac8748ce4a9298b4e40e48d1ae2f/index.m3u8', updated: null, source: 'fallback' },
  // Radio
  galatz:    { url: 'https://glzwizzlv.bynetcdn.com/glz_mp3',                                      updated: null, source: 'fallback' },
  reshetb:   { url: 'https://kanbet.media.kan.org.il/hls/live/2024811/2024811/kanbet_mp3/chunklist.m3u8', updated: null, source: 'fallback' },
  galei:     { url: 'https://live.radiodarom.co.il:1935/livegaleyisrael/galiaud1/manifest.m3u8',   updated: null, source: 'fallback' },
  fm103:     { url: 'https://cdn88.mediacast.co.il/103fm/103fm_aac/icecast.audio',                 updated: null, source: 'fallback' },
  fm99:      { url: 'https://eco-live.mediacast.co.il/99fm_aac',                                   updated: null, source: 'fallback' },
  galgalatz: { url: 'https://glzwizzlv.bynetcdn.com/glglz_mp3',                                    updated: null, source: 'fallback' },
  fm102:     { url: 'https://cdn88.mediacast.co.il/102fm-tlv/102fm_aac/icecast.audio',             updated: null, source: 'fallback' },
  radius100: { url: 'https://cdn.cybercdn.live/Radios_100FM/Audio/playlist.m3u8',                  updated: null, source: 'fallback' },
};

// ── Refresh all channels ─────────────────────────────────────────────────────
async function refreshAll() {
  console.log(`[${new Date().toISOString()}] Starting stream URL refresh...`);

  const jobs = [
    // Each scraper returns { id, url } or throws
    scrapers.scrapeKan11(),
    scrapers.scrapeKeshet12(),
    scrapers.scrapeChannel14(),
    scrapers.scrapeChannel15(),
    scrapers.scrapeGalatz(),
    scrapers.scrapeReshetB(),
    scrapers.scrapeGalei(),
    scrapers.scrapeFm103(),
    scrapers.scrapeFm99(),
    scrapers.scrapeGalgalatz(),
    scrapers.scrapeFm102(),
    scrapers.scrapeRadius100(),
  ];

  const results = await Promise.allSettled(jobs);

  results.forEach((result, i) => {
    if (result.status === 'fulfilled' && result.value?.url) {
      const { id, url, source } = result.value;
      const prev = cache[id]?.url;
      cache[id] = { url, updated: new Date().toISOString(), source: source || 'scraped' };
      if (prev !== url) {
        console.log(`  ✅ ${id}: URL updated (${source || 'scraped'})`);
      } else {
        console.log(`  ✔  ${id}: URL unchanged`);
      }
    } else {
      const err = result.reason?.message || 'unknown error';
      console.warn(`  ⚠️  Job ${i} failed: ${err} — keeping cached URL`);
    }
  });

  console.log(`[${new Date().toISOString()}] Refresh complete.\n`);
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /streams  →  returns all URLs as JSON (what your Android app calls)
app.get('/streams', (req, res) => {
  const response = {};
  for (const [id, data] of Object.entries(cache)) {
    response[id] = {
      url:     data.url,
      updated: data.updated,
      source:  data.source,
    };
  }
  res.json(response);
});

// GET /streams/:id  →  returns a single channel URL
app.get('/streams/:id', (req, res) => {
  const data = cache[req.params.id];
  if (!data) return res.status(404).json({ error: 'Channel not found' });
  res.json({ id: req.params.id, url: data.url, updated: data.updated, source: data.source });
});

// GET /health  →  simple uptime check (Render uses this)
app.get('/health', (req, res) => {
  const allOk = Object.values(cache).every(c => c.url);
  res.json({
    status:    allOk ? 'ok' : 'degraded',
    channels:  Object.keys(cache).length,
    timestamp: new Date().toISOString(),
  });
});

// GET /  →  human-readable status page
app.get('/', (req, res) => {
  const rows = Object.entries(cache)
    .map(([id, d]) => `
      <tr>
        <td><b>${id}</b></td>
        <td style="word-break:break-all;font-size:12px">${d.url || '❌ missing'}</td>
        <td>${d.source}</td>
        <td>${d.updated ? new Date(d.updated).toLocaleString('he-IL') : 'not yet'}</td>
      </tr>`)
    .join('');

  res.send(`<!DOCTYPE html>
<html dir="ltr">
<head><meta charset="UTF-8"><title>🇮🇱 Stream Server</title>
<style>body{font-family:sans-serif;padding:20px;background:#111;color:#eee}
table{width:100%;border-collapse:collapse}th,td{padding:8px 12px;border:1px solid #333;text-align:left}
th{background:#1976D2}tr:nth-child(even){background:#1a1a1a}</style></head>
<body>
<h2>🇮🇱 Israeli TV & Radio — Stream Server</h2>
<p>Auto-refreshes every <b>30 minutes</b>. Last full refresh visible in each row.</p>
<table><tr><th>Channel</th><th>Stream URL</th><th>Source</th><th>Last Updated</th></tr>${rows}</table>
<br><a href="/streams" style="color:#90CAF9">View raw JSON →</a>
</body></html>`);
});

// ── Scheduler ────────────────────────────────────────────────────────────────
// Refresh every 30 minutes
cron.schedule('*/30 * * * *', refreshAll);

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`🚀 Stream server running on port ${PORT}`);
  // Scrape immediately on boot so cache is warm right away
  await refreshAll();
});
