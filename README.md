# KBCS Stream Updater

This project automatically updates an `.m3u8` stream link with the latest stream URL for the [**Road Songs**](https://www.kbcs.fm/programs/road-songs/) radio program on KBCS.

## 🔁 What It Does

- Scrapes the most recent archived stream from the Road Songs playlist
- Extracts the timestamp and constructs a valid `.m3u8` stream URL
- Writes it to a file called `latest-uel.m3u8`
