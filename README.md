# Radio Streams

Save radio show archives from [Spinitron](https://spinitron.com) stations into your music
library, so Lyrion (LMS) can play them like albums. Also includes a script that plays the latest
KBCS [**Road Songs**](https://www.kbcs.fm/programs/road-songs/) archive directly on a LinkPlay
speaker (WiiM or Isetta).

---

## Download shows for Lyrion

`radio-download.js` reads [shows.json](shows.json) and saves every archived episode it doesn't
already have:

```
~/Documents/Music/Radio/
  Road Songs/
    cover.jpg                    show artwork, saved once
    2026-11-03 Road Songs.m4a    the 2-hour episode
    2026-11-03 Road Songs.json   its playlist
```

- The audio is copied from the archive stream without re-encoding, and cut at the end of the
  show's time slot. The archive itself keeps running into the following programs.
- Each `.m4a` is tagged: album `Road Songs – 2026-11-03`, artist and album artist `KBCS Road Songs`,
  genre `Radio`, comment with the DJ. The playlist is also stored in the **lyrics** tag, so a
  player that shows lyrics can display it.
- The `.json` holds the station, show, date, DJ, time slot, archive and playlist URLs, and each
  song's logged time, artist, title, album and label.
- **To drop an episode,** delete its `.m4a` and `.json`. Spinitron only keeps about two weeks of
  archives, so it won't be downloaded again once it has aged out.

```bash
node radio-download.js            # download new episodes (needs: brew install ffmpeg)
node radio-download.js --dry-run  # list what would be downloaded
node radio-download.js --rescan   # also ask Lyrion (LMS_HOST) to rescan
```

`RADIO_DIR` changes the output folder, and `LMS_HOST` the Lyrion server (default `192.168.4.38:9000`).

### Adding a show

Add its Spinitron show page to `shows.json`. The station name, time zone and archive location
are read from that page.

```json
[
	{ "name": "Road Songs", "spinitron": "https://widgets.spinitron.com/KBCS/show/221692/Road-Songs" }
]
```

### Run it automatically

```bash
cp launchd/com.photocurio.radio-download.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.photocurio.radio-download.plist
```

This runs daily at 9:00 AM, or when the Mac next wakes, and logs to `~/Library/Logs/radio-download.log`.
It loads nvm first, so it uses your default Node version. If the log says "Operation not permitted",
allow `node` to access the Documents folder under
**System Settings → Privacy & Security → Files and Folders**.

```bash
launchctl kickstart gui/$(id -u)/com.photocurio.radio-download   # run it now
launchctl bootout gui/$(id -u)/com.photocurio.radio-download      # uninstall
```

---

## Play the latest Road Songs on a LinkPlay speaker

For speakers that aren't Lyrion players. This sends the newest episode's archive stream straight
to the speaker's HTTP API.

```bash
./play-roadsongs.sh isetta   # or: wiim
```

The stream URL comes from the newest `.json` in `Music/Radio/Road Songs/`, so `radio-download.js`
needs to have run at least once. The speaker IPs are set at the top of the script (currently
WiiM `192.168.4.41`, Isetta `192.168.4.43`). Update them if your router gives the speakers new addresses.

---

## Requirements

- **Node.js** 18 or newer (no npm packages needed)
- **ffmpeg** for downloading (`brew install ffmpeg`)
- **jq** for `play-roadsongs.sh` (included with macOS)
- Speakers and the Lyrion server on the same local network
