"use strict"

/**
 * Downloads archived episodes of the radio shows listed in shows.json (any show
 * on a Spinitron station) into the music folder, one file per episode:
 *
 *   ~/Documents/Music/Radio/Road Songs/
 *     cover.jpg                    show artwork, saved once
 *     Road Songs.m3u               every episode, newest first (rewritten each run)
 *     2026-11-03 Road Songs.m4a    the episode: album "Road Songs", title "2026-11-03",
 *                                  with the playlist as lyrics
 *     2026-11-03 Road Songs.json   the playlist as data
 *
 * Episodes whose .m4a already exists are skipped. To drop an episode, delete its
 * .m4a and .json. Spinitron only keeps about two weeks of archives, so deleted
 * episodes are not downloaded again.
 *
 * Usage:
 *   node radio-download.js            download any new episodes
 *   node radio-download.js --dry-run  list what would be downloaded
 *   node radio-download.js --rescan   ask Lyrion to rescan afterwards
 *
 * Environment:
 *   RADIO_DIR  output folder (default ~/Documents/Music/Radio)
 *   LMS_HOST   Lyrion server for --rescan (default 192.168.4.38:9000)
 *   FFMPEG     path to ffmpeg (default: found on PATH or in Homebrew)
 */

const fs = require( "fs" )
const os = require( "os" )
const path = require( "path" )
const { spawnSync } = require( "child_process" )

const SHOWS_FILE = path.join( __dirname, "shows.json" )
const OUT_ROOT = process.env.RADIO_DIR || path.join( os.homedir(), "Documents", "Music", "Radio" )
const LMS_HOST = process.env.LMS_HOST || "192.168.4.38:9000"
const DRY_RUN = process.argv.includes( "--dry-run" )
const RESCAN = process.argv.includes( "--rescan" )

/** @param {string} url */
async function fetchText ( url ) {
	const res = await fetch( url )
	if ( !res.ok ) throw new Error( "HTTP " + res.status + " for " + url )
	return res.text()
}

/** @param {string} s */
function decodeEntities ( s ) {
	return s
		.replace( /&#(\d+);/g, function ( _, n ) { return String.fromCharCode( Number( n ) ) } )
		.replace( /&#x([0-9a-f]+);/gi, function ( _, n ) { return String.fromCharCode( parseInt( n, 16 ) ) } )
		.replace( /&nbsp;/g, " " ).replace( /&quot;/g, "\"" ).replace( /&apos;/g, "'" )
		.replace( /&lt;/g, "<" ).replace( /&gt;/g, ">" ).replace( /&amp;/g, "&" )
}

/** @param {string} s */
function stripTags ( s ) {
	return decodeEntities( s.replace( /<[^>]*>/g, "" ) ).trim()
}

/**
 * The station settings Spinitron's archive player uses: station name, time zone
 * and where the archive streams live.
 * @param {string} html
 */
function parsePlayerConfig ( html ) {
	const m = html.match( /ark2Player\([^,]+,\s*(\{[^}]*\})\s*\)/ )
	if ( !m ) throw new Error( "Archive player settings not found on the show page" )
	const c = JSON.parse( m[1] )
	return { station: c.stationName, timeZone: c.timeZone, hlsBase: c.hlsBaseUrl }
}

/**
 * Episodes on the show page that still have an archive.
 * @param {string} html @param {string} site
 */
function parseEpisodes ( html, site ) {
	return html.split( "<div class=\"list-item\"" ).slice( 1 ).map( function ( chunk ) {
		const ark = chunk.match( /data-ark-start=['"]([^'"]+)['"]/ )
		const pl = chunk.match( /href="(\/[^"]+\/pl\/\d+\/[^"]*)"/ )
		const dj = chunk.match( /class="dj"><span>([^<]+)</ )
		if ( !ark || !pl ) return null
		return { ark: ark[1], playlistUrl: site + pl[1], dj: dj ? decodeEntities( dj[1] ).trim() : "" }
	} ).filter( Boolean )
}

/**
 * Songs on a playlist page.
 * @param {string} html
 */
function parseSpins ( html ) {
	return html.split( "<tr id=\"sp-" ).slice( 1 ).map( function ( chunk ) {
		const data = chunk.match( /data-spin="([^"]+)"/ )
		const time = chunk.match( /class="spin-time"><a [^>]*>([^<]+)</ )
		const label = chunk.match( /class="label">([\s\S]*?)<\/span>/ )
		if ( !data || !time ) return null
		const spin = JSON.parse( decodeEntities( data[1] ) )
		return {
			time: time[1].trim(),
			artist: spin.a || "",
			title: spin.s || "",
			album: spin.r || "",
			label: label ? stripTags( label[1] ) : ""
		}
	} ).filter( Boolean )
}

/**
 * The episode's time slot, e.g. { start: "9:00 PM", end: "11:00 PM" }.
 * @param {string} html
 */
function parseTimeslot ( html ) {
	const m = decodeEntities( html ).match( /class="timeslot"[\s\S]*?(\d{1,2}:\d\d\s*[AP]M)\s*[–-]\s*(\d{1,2}:\d\d\s*[AP]M)/i )
	return m ? { start: m[1], end: m[2] } : null
}

/**
 * "9:03 PM" -> minutes past midnight
 * @param {string} t
 */
function clockToMinutes ( t ) {
	const m = t.trim().match( /^(\d{1,2}):(\d\d)\s*([AP])M$/i )
	if ( !m ) throw new Error( "Unexpected time: " + t )
	return ( +m[1] % 12 + ( m[3].toUpperCase() === "P" ? 12 : 0 ) ) * 60 + +m[2]
}

/**
 * "20261104T050000Z" -> local date (YYYY-MM-DD) and clock time at the station.
 * @param {string} ark @param {string} timeZone
 */
function arkToLocal ( ark, timeZone ) {
	const m = ark.match( /^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z$/ )
	if ( !m ) throw new Error( "Unexpected archive timestamp: " + ark )
	const d = new Date( Date.UTC( +m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6] ) )
	/** @type {Record<string,string>} */
	const p = {}
	new Intl.DateTimeFormat( "en-US", {
		timeZone, hourCycle: "h23",
		year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
	} ).formatToParts( d ).forEach( function ( x ) { p[x.type] = x.value } )
	return { date: p.year + "-" + p.month + "-" + p.day, minutes: +p.hour * 60 + +p.minute }
}

/**
 * Episode length in seconds: the time slot, or 5 minutes after the last song.
 * The archive keeps running into the next programs, so the download stops here.
 * @param {{start:string,end:string}|null} slot @param {{time:string}[]} spins @param {number} startMinutes
 */
function episodeSeconds ( slot, spins, startMinutes ) {
	const end = slot ? clockToMinutes( slot.end ) : clockToMinutes( spins[spins.length - 1].time ) + 5
	let len = end - startMinutes
	if ( len <= 0 ) len += 1440 // show crosses midnight
	return len * 60
}

/**
 * The playlist as time-synced lyrics (LRC), stored in the file's lyrics tag.
 * Each line starts with the song's position in the episode, e.g. [63:00], so
 * Material highlights the current song and scrolls with playback. Positions
 * come from Spinitron's logged times, so they are only accurate to the minute.
 * Works from the saved .json alone, so existing episodes can be retagged.
 * @param {any} ep
 */
function playlistText ( ep ) {
	const head = ep.station + " " + ep.show + " · " + ep.date + ( ep.dj ? " · " + ep.dj : "" )
	const start = ep.start ? clockToMinutes( ep.start ) : ( ep.tracks.length ? clockToMinutes( ep.tracks[0].time ) : 0 )
	let prev = 0
	return [ "[0:00]" + head ].concat( ep.tracks.map( function ( /** @type {any} */ t ) {
		let m = clockToMinutes( t.time ) - start
		if ( m < -720 ) m += 1440 // show crosses midnight
		prev = Math.max( prev, m ) // LRC times must never go backwards
		return "[" + prev + ":00]" + t.time + "  " + t.artist + " – " + t.title
	} ) ).join( "\n" )
}

/** @param {string} s */
function safeName ( s ) {
	return s.replace( /[\/\\:*?"<>|]+/g, "-" ).replace( /\s+/g, " " ).trim()
}

function findFfmpeg () {
	const candidates = [ process.env.FFMPEG, "/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "ffmpeg" ]
	for ( const c of candidates ) {
		if ( c && spawnSync( c, [ "-version" ], { stdio: "ignore" } ).status === 0 ) return c
	}
	throw new Error( "ffmpeg not found. Install it with: brew install ffmpeg" )
}

/**
 * Downloads the episode into a temporary file, then moves it into place, so a
 * failed run never leaves a partial episode in the music folder.
 * @param {string} ffmpeg @param {any} ep @param {string} dest
 */
function downloadEpisode ( ffmpeg, ep, dest ) {
	const work = fs.mkdtempSync( path.join( os.tmpdir(), "radio-" ) )
	const tmp = path.join( work, "episode.m4a" )
	try {
		// Each show is one album, and each episode a track titled with its date.
		const r = spawnSync( ffmpeg, [
			"-hide_banner", "-loglevel", "error", "-y",
			"-i", ep.archiveUrl, "-t", String( ep.seconds ),
			"-vn", "-c:a", "copy", "-map_metadata", "-1",
			"-metadata", "title=" + ep.date,
			"-metadata", "album=" + ep.show,
			"-metadata", "artist=" + ep.station + " " + ep.show,
			"-metadata", "album_artist=" + ep.station + " " + ep.show,
			"-metadata", "date=" + ep.date,
			"-metadata", "genre=Radio",
			"-metadata", "comment=" + ( ep.dj ? "With " + ep.dj : ep.station ),
			"-metadata", "lyrics=" + playlistText( ep ),
			"-movflags", "+faststart", "-f", "mp4", tmp
		], { stdio: "inherit" } )
		if ( r.status !== 0 ) throw new Error( "ffmpeg failed for " + ep.archiveUrl )
		fs.copyFileSync( tmp, dest + ".part" )
		fs.renameSync( dest + ".part", dest )
	} finally {
		fs.rmSync( work, { recursive: true, force: true } )
	}
}

/**
 * Saves the show artwork as cover.jpg if the folder doesn't have one yet.
 * @param {string} html @param {string} site @param {string} dir
 */
async function saveCoverOnce ( html, site, dir ) {
	const dest = path.join( dir, "cover.jpg" )
	if ( fs.existsSync( dest ) ) return
	const m = html.match( /<img src="(\/images\/Show\/[^"?]+)/ )
	if ( !m ) return
	const res = await fetch( site + m[1] )
	if ( !res.ok ) return
	fs.writeFileSync( dest, Buffer.from( await res.arrayBuffer() ) )
	console.log( "🖼  Saved " + dest )
}

/**
 * Rewrites "<Show>.m3u" in the show folder, listing every episode there newest
 * first, so Lyrion has a playlist with the latest episode on top. Episodes
 * deleted by hand drop out on the next run. Only writes when the list changes.
 * @param {string} dir @param {string} showName
 */
function writePlaylist ( dir, showName ) {
	const dest = path.join( dir, safeName( showName ) + ".m3u" )
	const episodes = fs.readdirSync( dir ).filter( function ( f ) { return f.endsWith( ".m4a" ) } ).sort().reverse()
	const lines = [ "#EXTM3U" ]
	episodes.forEach( function ( f ) {
		const date = f.slice( 0, 10 )
		let seconds = -1
		try {
			seconds = JSON.parse( fs.readFileSync( path.join( dir, f.replace( /\.m4a$/, ".json" ) ), "utf8" ) ).seconds
		} catch ( e ) { /* no .json: length unknown */ }
		lines.push( "#EXTINF:" + seconds + "," + date, f )
	} )
	const m3u = lines.join( "\n" ) + "\n"
	if ( fs.existsSync( dest ) && fs.readFileSync( dest, "utf8" ) === m3u ) return
	fs.writeFileSync( dest, m3u, "utf8" )
	console.log( "   📝 " + path.basename( dest ) + ": " + episodes.length + " episode(s), newest first" )
}

async function rescan () {
	const res = await fetch( "http://" + LMS_HOST + "/jsonrpc.js", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify( { id: 1, method: "slim.request", params: [ "", [ "rescan" ] ] } )
	} )
	if ( !res.ok ) throw new Error( "Rescan request failed: HTTP " + res.status )
	console.log( "🔄 Asked Lyrion at " + LMS_HOST + " to rescan" )
}

/**
 * @param {{name:string, spinitron:string}} show
 * @param {string} ffmpeg
 * @returns {Promise<number>} episodes added
 */
async function processShow ( show, ffmpeg ) {
	const site = new URL( show.spinitron ).origin
	const html = await fetchText( show.spinitron )
	const cfg = parsePlayerConfig( html )
	const episodes = parseEpisodes( html, site )
	const dir = path.join( OUT_ROOT, safeName( show.name ) )
	console.log( "📻 " + cfg.station + " " + show.name + ": " + episodes.length + " archived episode(s)" )

	if ( !DRY_RUN ) {
		fs.mkdirSync( dir, { recursive: true } )
		await saveCoverOnce( html, site, dir )
	}

	let added = 0
	for ( const e of episodes ) {
		const local = arkToLocal( e.ark, cfg.timeZone )
		const base = path.join( dir, local.date + " " + safeName( show.name ) )
		if ( fs.existsSync( base + ".m4a" ) ) {
			console.log( "   ✔︎ " + local.date + " already saved" )
			continue
		}

		const playlistHtml = await fetchText( e.playlistUrl )
		const tracks = parseSpins( playlistHtml )
		const slot = parseTimeslot( playlistHtml )
		const ep = {
			station: cfg.station,
			show: show.name,
			date: local.date,
			dj: e.dj,
			start: slot ? slot.start : "",
			end: slot ? slot.end : "",
			seconds: tracks.length ? episodeSeconds( slot, tracks, local.minutes ) : 7200,
			archiveUrl: cfg.hlsBase + "/" + cfg.station + "-" + e.ark + "/index.m3u8",
			playlistUrl: e.playlistUrl,
			tracks
		}

		if ( DRY_RUN ) {
			console.log( "   ⬇︎ " + local.date + ": " + tracks.length + " songs, " + ep.seconds / 60 + " min" + ( ep.dj ? ", " + ep.dj : "" ) )
			continue
		}

		console.log( "   ⬇️  Downloading " + local.date + " …" )
		downloadEpisode( ffmpeg, ep, base + ".m4a" )
		fs.writeFileSync( base + ".json", JSON.stringify( ep, null, "\t" ) + "\n", "utf8" )
		console.log( "   ✅ " + path.basename( base ) + ".m4a + .json (" + tracks.length + " songs)" )
		added++
	}
	if ( !DRY_RUN ) writePlaylist( dir, show.name )
	return added
}

async function main () {
	try {
		/** @type {{name:string, spinitron:string}[]} */
		const shows = JSON.parse( fs.readFileSync( SHOWS_FILE, "utf8" ) )
		const ffmpeg = DRY_RUN ? "" : findFfmpeg()

		let added = 0
		let failed = 0
		for ( const show of shows ) {
			try {
				added += await processShow( show, ffmpeg )
			} catch ( /** @type {any} */ err ) {
				console.error( "❌ " + show.name + ": " + ( err.message || err ) )
				failed++
			}
		}

		if ( RESCAN && added ) await rescan()
		if ( !DRY_RUN ) console.log( added ? "Done: " + added + " new episode(s) in " + OUT_ROOT : "No new episodes." )
		if ( failed ) process.exit( 1 )
	} catch ( /** @type {any} */ err ) {
		console.error( "Error:", err.message || err )
		process.exit( 1 )
	}
}

if ( require.main === module ) main()

module.exports = { playlistText }
