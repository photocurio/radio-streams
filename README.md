# KBCS Road Songs – Stream Player

Play the latest [**Road Songs**](https://www.kbcs.fm/programs/road-songs/) archive from KBCS on your local network speakers.

## How it works

1. **Scrape** – fetches the Road Songs widget from KBCS/Spinitron, extracts the latest archived stream URL, and saves it to `latest-url.txt` and `kbcs.m3u8`.
2. **Play** – sends that URL to a network speaker (WiiM or Isetta) via its HTTP API.

---

## Usage

### 1. Scrape the latest stream URL

```bash
node scraper-lite.js
```

This writes the stream URL to `latest-url.txt` and `kbcs.m3u8`.

### 2. Play the stream

Send the stream to a speaker:

```bash
./play-roadsongs.sh wiim      # WiiM device (192.168.4.59)
./play-roadsongs.sh isetta    # Isetta device (192.168.4.29)
```

---

## Quick start (both steps at once)

```bash
node scraper-lite.js && ./play-roadsongs.sh wiim
```

---

## Requirements

- **Node.js** (no extra packages needed — uses built-in `https` and `fs`)
- The speaker must be on the same local network
