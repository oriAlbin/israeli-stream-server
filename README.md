# 🇮🇱 Israeli Stream Server

Auto-refreshing backend that keeps live stream URLs current for all 12
Israeli TV channels and radio stations. Refreshes every 30 minutes.

## How it works

1. On startup, pre-fills the cache with known-good URLs so it's instantly useful
2. Every 30 minutes, checks each URL with a HEAD request
3. If a URL is dead, scrapes the broadcaster's website to find the new one
4. Your Android app calls `/streams` to get the latest URLs

## API

| Endpoint | Returns |
|---|---|
| `GET /` | Human-readable status page |
| `GET /streams` | All 12 channel URLs as JSON |
| `GET /streams/keshet12` | Single channel URL |
| `GET /health` | Health check (used by Render) |

---

## Deploy to Render.com (FREE — no credit card needed)

### Step 1 — Push to GitHub

1. Go to https://github.com and create a free account if you don't have one
2. Click the **+** button → **New repository**
3. Name it `israeli-stream-server`, set it to **Public**, click **Create repository**
4. GitHub will show you commands — open a terminal/command prompt on your computer and run:

```bash
cd path/to/stream-server
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/israeli-stream-server.git
git push -u origin main
```

Replace `YOUR-USERNAME` with your GitHub username.

### Step 2 — Deploy on Render

1. Go to https://render.com and sign up with your GitHub account (free)
2. Click **New** → **Web Service**
3. Click **Connect** next to your `israeli-stream-server` repository
4. Render will auto-detect the settings from `render.yaml` — just click **Create Web Service**
5. Wait 2–3 minutes for the first deploy

### Step 3 — Get your server URL

After deploying, Render gives you a URL like:
```
https://israeli-stream-server.onrender.com
```

Test it by opening:
```
https://israeli-stream-server.onrender.com/streams
```

You should see a JSON response with all 12 channel URLs.

### Step 4 — Update your Android app

Open the file:
```
app/src/main/java/com/yourapp/israelitvradio/StreamServerRepository.kt
```

Find this line:
```kotlin
private const val SERVER_URL = "https://YOUR-APP-NAME.onrender.com/streams"
```

Replace `YOUR-APP-NAME` with your actual Render app name, e.g.:
```kotlin
private const val SERVER_URL = "https://israeli-stream-server.onrender.com/streams"
```

Rebuild and reinstall the app on your phone.

---

## ⚠️ Important: Render Free Plan Sleep

On the free plan, Render spins down your server after 15 minutes of inactivity.
The first request after sleep takes ~30 seconds to wake up.

To avoid this, use a free uptime monitor to ping your server every 10 minutes:
- https://uptimerobot.com (free, just add your `/health` URL)

---

## URL Fallback Chain

```
Your Server (fresh, auto-scraped)
      ↓  (if server unreachable)
Firebase Remote Config (manually updated)
      ↓  (if Firebase fails)
Encrypted local cache (last known good)
      ↓  (if cache empty)
Hardcoded APK fallback
```
