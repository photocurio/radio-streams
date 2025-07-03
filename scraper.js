const { chromium } = require( 'playwright' )
const fs = require( 'fs' );

( async () => {
	const browser = await chromium.launch( {
		headless: true,
		args: ['--autoplay-policy=no-user-gesture-required']
	} )
	const page = await browser.newPage()

	// Go to the KBCS Road Songs program page
	await page.goto( 'https://www.kbcs.fm/programs/road-songs/', { waitUntil: 'load' } )

	// Get the Spinitron iframe and its frame context
	const frameHandle = await page.waitForSelector( 'iframe[src*="spinitron.com"]', { timeout: 10000 } )
	const frame = await frameHandle.contentFrame()

	// Click the first archive link and wait for the playlist archive to load
	const archiveLink = await frame.waitForSelector( '#playlist-list-0 .list-item .block a.link.row', { timeout: 5000 } )
	await Promise.all( [
		frame.waitForLoadState( 'load' ),
		archiveLink.click()
	] )
	console.log( '🧭 Iframe navigated to playlist archive' )

	// Extract the timestamp from the ark-player div
	const arkDiv = await frame.waitForSelector( '#ark-player[data-ark-start]', { timeout: 5000 } )
	const timestamp = await arkDiv.getAttribute( 'data-ark-start' )
	console.log( 'Found timestamp:', timestamp )

	if ( timestamp ) {
		const streamUrl = `https://ark3.spinitron.com/ark2/KBCS-${timestamp}/index.m3u8`
		console.log( '🎧 Constructed stream URL:', streamUrl )

		const m3u = `#EXTM3U\n#EXTINF:-1,KBCS Road Songs\n${streamUrl}`
		fs.writeFileSync( 'kbcs.m3u', m3u )
		console.log( '✅ Saved kbcs.m3u' )
	} else {
		console.error( '❌ Could not find data-ark-start attribute.' )
		process.exit( 1 )
	}

	await browser.close()
} )()
