# KBCS Stream Updater

This project automatically updates an `.m3u` playlist file with the latest stream URL for the [**Road Songs**](https://www.kbcs.fm/programs/road-songs/) radio program on KBCS.

## 🔁 What It Does

- Scrapes the most recent archived stream from the Road Songs playlist
- Extracts the timestamp and constructs a valid `.m3u8` stream URL
- Writes it to a file called `kbcs.m3u`
- Publishes that file via GitHub Pages every Wednesday morning

## 🔗 Public Stream Link

If GitHub Pages is enabled, there will be a permanent stream link at:
https://photocurio.github.io/radio-streams/kbcs.m3u
