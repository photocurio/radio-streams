"use strict"

const https = require( "https" )
const fs = require( "fs" )
const path = require( "path" )

const WIDGET_URL = "https://widgets.spinitron.com/KBCS/show/221692/Road-Songs?css=https%3A%2F%2Fwww.kbcs.fm%2F%2Fspinitronembed.css"
const OUT_M3U = path.resolve( process.cwd(), "kbcs.m3u8" )
const OUT_URL = path.resolve( process.cwd(), "latest-url.txt" )

/**
 * Fetches a URL and follows redirects.
 * @param {string} url - The URL to fetch.
 * @param {number} [redirects=5] - Number of redirects to follow.
 * @returns {Promise<string>} - Resolves with the response body.
 */
function fetchUrl ( url, redirects ) {
	redirects = redirects === undefined ? 5 : redirects
	return new Promise( function ( resolve, reject ) {
		const req = https.get( url, function ( res ) {
			const statusCode = res.statusCode
			const headers = res.headers
			if ( statusCode && statusCode >= 300 && statusCode < 400 && headers.location && redirects > 0 ) {
				res.resume()
				return resolve( fetchUrl( headers.location, redirects - 1 ) )
			}
			if ( statusCode !== 200 ) {
				res.resume()
				return reject( new Error( "Request Failed. Status Code: " + statusCode ) )
			}
			let raw = ""
			res.on( "data", function ( c ) { raw += c } )
			res.on( "end", function () { resolve( raw ) } )
		} )
		req.on( "error", reject )
		req.end()
	} )
}

( async function () {
	try {
		console.log( "Fetching widget HTML..." )
		const html = await fetchUrl( WIDGET_URL )

		/** @type {RegExpMatchArray|null} */
		const m = html.match( /data-ark-start=['"]([^'"]+)['"]/ )
		if ( !m ) {
			console.error( "❌ data-ark-start not found in widget HTML" )
			process.exit( 1 )
		}

		/** @type {string} */
		const timestamp = m[1]
		/** @type {string} */
		const streamUrl = "https://ark3.spinitron.com/ark2/KBCS-" + timestamp + "/index.m3u8"

		const m3u = "#EXTM3U\n#EXTINF:-1,KBCS Road Songs\n" + streamUrl + "\n"
		fs.writeFileSync( OUT_M3U, m3u, "utf8" )
		fs.writeFileSync( OUT_URL, streamUrl + "\n", "utf8" )

		console.log( "✅ Saved kbcs.m3u8 ->", OUT_M3U )
		console.log( "✅ Saved latest-url.txt ->", OUT_URL )
		console.log( "Stream URL:", streamUrl )
	} catch ( /** @type {any} */ err ) {
		console.error( "Error:", err.message || err )
		process.exit( 1 )
	}
} )()
