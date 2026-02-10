/**
 * CONFIG Initialization
 * Phase 1: Define the core directory.
 */
const CONFIG = {
	MAIN_DIR: "/home/greg/BATC" // Use colon, not equals
};

/**
 * Phase 2: Assign the rest of the properties.
 * We reference CONFIG.MAIN_DIR to keep the paths dynamic and DRY.
 */
Object.assign(CONFIG, {
	// --- Connection & Authentication ---
	addr: "ws://127.0.0.1:4455",
	pass: "YOUR_OBS_PASSWORD",
	api: "http://127.0.0.1:3000",
	room: "M0ODZ",
	nick: "🤖ODZBot🤖",

	// --- Directory & File Paths ---
	mainDir: CONFIG.MAIN_DIR,
	videoDir: "/home/greg/Videos/jukebox/",
	linesDir: CONFIG.MAIN_DIR + "/lines/",
	alertFile: CONFIG.MAIN_DIR + "/alert.wav",

	// --- OBS Scenes & Groups ---
	scene: "Main Scene",
	obsSKScene: "Header group",
	headerBackgroundGroup: "Header group",

	// --- OBS Media & Overlay Sources ---
	source: "Jukebox_Source", // Main video input
	alertSource: "Sysop_Alert_Source", // Alert overlay
	textSource: "Now_Playing_Text", // Current song text
	nicksSource: "nicks", // Chat user list
	visitorsSource: "Visitors", // Visitor tracker
	statsSource: "statsBox", // Performance metrics
	chatSource: "BATC Chat", // Chat display
	clockSource: "clock", // System clock
	networkStatusSource: "Network_Status_Text",
	obsSKSource: "Silent Key", // Silent key indicator
	headerBackgroundSource: "Header background",
	mahoosiveSource: "mahoosiveSource",

	// --- News & QR Code Sources ---
	newsSource: "newsfeed",
	newsTextLink: "News Item text",
	newsQRSource: "News Item QRCode",
	qrImageSource: "Youtube QRCode",
	qrTextSource: "Youtube QRCode text",
	jukeboxBannerSource: "jukeboxBanner",

	// --- Station & Logic Settings ---
	homeGrid: "IO94gt",
	jukeboxUrl: "https://jukebox.gregoryfenton.com",
	nextVideoStartAfter: 120, // Seconds to wait before next video

	// --- Optional Features ---
	announceVisitor: true // annnounce when viewer joins the stream
});

const COMMAND_LIST = [
	"play", "list", "sysop", "help", "joke", "bofh", "status", "ham", "weather", "fact", "fortune", "eightball", "signal", "upgrade",
	"confess", "diagnose", "uptime", "fix", "loc", "url", "ping", "request", "about", "coinflip", "dice", "socials", "coffee", "tea",
	"juice", "cookie", "biscuit", "pizza", "burger", "chips", "cake", "hug", "antenna", "valve", "shackcat", "component", "menu", "message", "sendmail", "getmail"
];

const HELP_DOCS = {
	"play": "Usage: !play [number]. Starts playing a video.",
	"list": "Usage: !list [optional search]. Shows random videos or matches for a term.",
	"request": "Usage: !request [keyword]. Search for a video.",
	"url": "Displays the Jukebox link.",
	"socials": "Links to Greg's GitHub, QRZ, and YouTube.",
	"ping": "Check current latency.",
	"about": "Station information.",
	"uptime": "System uptime details.",
	"message": "Usage: !message [your text]. Leaves a message for Greg.",
	"sendmail": "Usage: !sendmail [callsign] [message]. Store a message for a user.",
	"getmail": "Retrieves any stored messages for your callsign.",
	"sysop": "Alerts the station operator that you need attention.",
	"help": "Usage: !help [command]. Displays available commands.",
	"joke": "Tells a random joke.",
	"bofh": "Provides a random technical excuse from the Station Operator From Hell.",
	"status": "Displays current station and system status.",
	"ham": "Provides a random amateur radio tip or fact.",
	"weather": "Displays current weather for the station location.",
	"fact": "Shares an interesting random fact.",
	"fortune": "Predicts your future with a fortune cookie message.",
	"eightball": "Usage: !eightball [question]. Seek wisdom from the magic 8-ball.",
	"signal": "Reports your current signal strength and quality.",
	"upgrade": "A humorous report on a hypothetical system upgrade.",
	"confess": "The bot will tell you a secret.",
	"diagnose": "Runs a diagnostic on the current system state.",
	"fix": "Attempts to 'fix' a random technical issue.",
	"loc": "Usage: !loc [GridSquare]. Saves your location.",
	"coinflip": "Flips a virtual coin.",
	"dice": "Rolls a standard six-sided die.",
	"coffee": "Serves a fresh, virtual cuppa joe.",
	"tea": "Serves a soothing virtual tea.",
	"juice": "Pours a refreshing virtual fruit juice.",
	"cookie": "Offers a delicious virtual chocolate chip cookie.",
	"biscuit": "Hands out a classic virtual British biscuit.",
	"pizza": "Delivers a hot virtual pizza.",
	"burger": "Grills up a virtual burger.",
	"chips": "Serves a side of virtual golden chips.",
	"cake": "Provides a slice of virtual cake.",
	"hug": "Sends a warm virtual hug.",
	"antenna": "Attempt to tune the station antenna.",
	"valve": "Warm up the virtual vacuum tubes.",
	"shackcat": "Pet the station cat.",
	"component": "Find a random electronic part in the junk box.",
	"menu": "Displays the full list of food, drink, and station commands."
};

let obs, batcSocket, videoList = [],
	newsHeadlines = [],
	newsIndex = 0,
	lastNicks = [],
	initialNicksLoaded = false,
	messageCache = new Set();
let pingStartTime = 0,
	pingCount = 0,
	lastPongTime = 0,
	currentLatency = 0,
	dynamicDuration = 25000,
	idleSeconds = 0,
	chatQueue = [],
	newsTimer = null,
	lastAnnouncedHour = -1,
	userLocations = {};
let currentIdleMessage = "Jukebox Idle\nPick a video!";

let remoteSockets = {};
let remoteNicksMap = {};
let Viewers = -1;

function isCallsign(name) {
	if (!name) return false;
	const clean = name.replace('[unverified]', '').trim().toUpperCase();
	const parts = clean.split(/[\s_\-]+/);
	return parts.some(p => /^[A-Z]{1,2}\d[A-Z0-9]*/.test(p));
}

function gridToLatLon(grid) { grid = grid.toUpperCase(); if (grid.length < 4) return null; let lon = (grid.charCodeAt(0) - 65) * 20 - 180; let lat = (grid.charCodeAt(1) - 65) * 10 - 90;
	lon += (grid.charCodeAt(2) - 48) * 2;
	lat += (grid.charCodeAt(3) - 48) * 1; if (grid.length >= 6) { lon += (grid.charCodeAt(4) - 65) * (2 / 24) + (1 / 24);
		lat += (grid.charCodeAt(5) - 65) * (1 / 24) + (0.5 / 24); } else { lon += 1;
		lat += 0.5; } return { lat, lon }; }

function getDistance(grid1, grid2) { const loc1 = gridToLatLon(grid1); const loc2 = gridToLatLon(grid2); if (!loc1 || !loc2) return null; const R = 6371; const dLat = (loc2.lat - loc1.lat) * Math.PI / 180; const dLon = (loc2.lon - loc1.lon) * Math.PI / 180; const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(loc1.lat * Math.PI / 180) * Math.cos(loc2.lat * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2); const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); return Math.round(R * c); }
async function saveUserLocation(user, grid) { if (!/^[A-R]{2}[0-9]{2}([A-X]{2})?$/i.test(grid)) return "Invalid Grid Square.";
	userLocations[user] = grid.toUpperCase(); try { await $.post(CONFIG.api + '/api/save-location', { user: user, grid: grid.toUpperCase() }); const dist = getDistance(CONFIG.homeGrid, grid); return `Location saved! You are ${dist}km from M0ODZ.`; } catch (e) { return "Error saving location file."; } }
async function loadLocations() { try { userLocations = await $.getJSON(CONFIG.api + '/api/load-locations'); } catch (e) { console.error("[Init] No locations file found yet."); } }

const FLAG_LOOKUP = {
	'F':'🇫🇷', 'D':'🇩🇪', 'I':'🇮🇹', 'HB':'🇨🇭', 'OE':'🇦🇹', 'SV':'🇬🇷', 'CT':'🇵🇹', 'EA':'🇪🇸', 'EB':'🇪🇸', 'EC':'🇪🇸', 'LA':'🇳🇴', 'LB':'🇳🇴', 'SM':'🇸🇪', 'SA':'🇸🇪', 'SI':'🇸🇪', 'OZ':'🇩🇰', 'OH':'🇫🇮', 'ES':'🇪🇪', 'LY':'🇱🇹', 'YL':'🇱🇻', 'SP':'🇵🇱', 'SQ':'🇵🇱', 'SN':'🇵🇱', 'SO':'🇵🇱', 'HA':'🇭🇺', 'OK':'🇨🇿', 'OL':'🇨🇿', 'OM':'🇸🇰', 'S5':'🇸🇮', '9A':'🇭🇷', 'E7':'🇧🇦', 'ER':'🇲🇩', 'YU':'🇷🇸', 'ZA':'🇦🇱', 'Z3':'🇲🇰', 'LZ':'🇧🇬', 'YO':'🇷🇴', 'LX':'🇱🇺', 'ON':'🇧🇪', 'PA':'🇳🇱', 'PI':'🇳🇱', 'UR':'🇺🇦', 'UW':'🇺🇦', 'UX':'🇺🇦', 'RA':'🇷🇺', 'UA':'🇷🇺', 'R':'🇷🇺', 'EU':'🇧🇾', 'TF':'🇮🇸', 'OY':'🇫🇴', 'K':'🇺🇸', 'W':'🇺🇸', 'N':'🇺🇸', 'AA':'🇺🇸', 'AK':'🇺🇸', 'VE':'🇨🇦', 'VA':'🇨🇦', 'XE':'🇲🇽', 'CM':'🇨🇺', 'CO':'🇨🇺', 'HI':'🇩🇴', 'KP':'🇵🇷', 'TI':'🇨🇷', 'YN':'🇳🇮', 'YS':'🇸🇻', 'TG':'🇬🇹', 'V3':'🇧🇿', 'HP':'🇵🇦', 'ZF':'🇰🇾', 'PY':'🇧🇷', 'LU':'🇦🇷', 'CE':'🇨🇱', 'CX':'🇺🇾', 'OA':'🇵🇪', 'HK':'🇨🇴', 'YV':'🇻🇪', 'HC':'🇪CW', 'ZP':'🇵🇾', 'CP':'🇧🇴', 'JA':'🇯🇵', 'BY':'🇨🇳', 'HL':'🇰🇷', 'BV':'🇹🇼', 'VR':'🇭🇰', 'XY':'🇲🇲', 'HS':'🇹🇭', '9V':'🇸🇬', '9M':'🇲🇾', 'YB':'🇮團', 'DU':'🇵🇭', '4X':'🇮🇱', '4Z':'🇮🇱', 'HZ':'🇸🇦', 'A7':'🇶🇦', 'A6':'🇦🇪', 'A9':'🇧🇭', 'JY':'🇯🇴', 'OD':'🇱🇧', 'YK':'🇸🇾', 'VU':'🇮🇳', '4S':'🇱開', 'S2':'🇧開', 'TA':'🇹🇷', 'EY':'🇹🇯', 'UK':'🇺🇿', 'UN':'🇰🇿', 'EX':'🇰🇬', 'VK':'🇦🇺', 'ZL':'🇳🇿', 'V7':'🇲🇭', 'V8':'🇧🇳', '3D':'🇫🇯', 'T3':'🇰🇮', 'ZS':'🇿🇦', '5Z':'🇰🇪', 'ET':'🇪🇹', 'SU':'🇪🇬', 'CN':'🇲🇦', '7X':'🇩🇿', '3V':'🇹🇳', '5N':'🇳🇬', 'D4':'🇨WV', 'EL':'🇱須'
};

function levenshtein(a, b) { const matrix = []; for (let i = 0; i <= b.length; i++) matrix[i] = [i]; for (let j = 0; j <= a.length; j++) matrix[0][j] = j; for (let i = 1; i <= b.length; i++) { for (let j = 1; j <= a.length; j++) { if (b.charAt(i - 1) === a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
			else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)); } } return matrix[b.length][a.length]; }

function resolveCommand(input) {
	if (COMMAND_LIST.includes(input)) return { type: 'match', cmd: input };
	const matches = COMMAND_LIST.filter(cmd => cmd.startsWith(input));
	if (matches.length === 1) return { type: 'match', cmd: matches[0] };
	if (matches.length > 1) return { type: 'ambiguous', matches: matches };
	let bestMatch = null;
	let minDistance = 3;
	for (const cmd of COMMAND_LIST) {
		const distance = levenshtein(input, cmd);
		if (distance < minDistance) { minDistance = distance;
			bestMatch = cmd; if (distance === 0) return { type: 'match', cmd: bestMatch }; }
	}
	if (bestMatch) return { type: 'match', cmd: bestMatch };
	return { type: 'none' };
}

function getFlag(fullName, currentMessage = "") {
	if (!fullName) return '';
	if (fullName === CONFIG.nick || fullName.toUpperCase() === "SYSTEM") return '💻';

	const flagRegex = /[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]|🏴󠁧󠁢󠁥󠁮󠁧󠁿|🏴󠁧󠁢󠁳󠁣󠁴󠁿|🏴󠁧󠁢󠁷󠁬󠁳󠁿|🌐/;
	if (flagRegex.test(fullName) || flagRegex.test(currentMessage)) return '';

	const parts = fullName.replace('[unverified]', '').trim().toUpperCase().split(/[\s_\-]+/);
	const cs = parts.find(p => /^[A-Z]{1,2}\d[A-Z0-9]*/.test(p));
	
	if (!cs) return '🌐';

	// Special handling for UK Prefixes
	if (/^G|^M|^2E|^GB/.test(cs)) {
		if (/^GM|^MM|^2M/.test(cs)) return '🏴󠁧󠁢󠁳󠁣󠁴󠁿';
		if (/^GW|^MW|^2W/.test(cs)) return '🏴󠁧󠁢󠁷󠁬󠁳󠁿';
		if (/^GI|^MI|^2I/.test(cs)) return '🇮🇪';
		return '🏴󠁧󠁢󠁥󠁮󠁧󠁿';
	}

	// Match longest prefix first (DXCC standard)
	return FLAG_LOOKUP[cs.substring(0, 4)] || 
		   FLAG_LOOKUP[cs.substring(0, 3)] || 
		   FLAG_LOOKUP[cs.substring(0, 2)] || 
		   FLAG_LOOKUP[cs.substring(0, 1)] || 
		   '🌐';
}

/**
 * escapePango: 
 * Protects final clean text from breaking Pango markup.
 */
function escapePango(str) {
	if (!str) return "";

	return str
		.toString()
		.replace(/[\u0000-\u001F\u007F]/g, "") // control chars
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

async function updateNewsFeed() {
	try {
		const response = await fetch(`${CONFIG.api}/api/news`);
		const xmlText = await response.text();
		const parser = new DOMParser();
		const xmlDoc = parser.parseFromString(xmlText, "text/xml");

		// Handle both standard RSS <item> and Atom <entry>
		const items = xmlDoc.querySelectorAll("item, entry");
		if (items.length > 0) {
			newsHeadlines = Array.from(items).map(el => {
				const titleNode = el.querySelector("title");
				const descNode =
					el.querySelector("description") ||
					el.querySelector("content") ||
					el.querySelector("summary");

				const linkNode = el.querySelector("link");
				const isSilentKeyNode = el.querySelector("isSilentKey");
				const sourceLabelNode = el.querySelector("sourceLabel");

				return {
					title: titleNode ?.textContent || "",
					description: descNode ?.textContent || "",
					link: linkNode ?.getAttribute("href") || linkNode ?.textContent || "",
					isSilentKey: isSilentKeyNode ?.textContent === "true",
					sourceLabel: sourceLabelNode ?.textContent || "NEWS"
				};
			});

			if (!newsTimer) cycleHeadlines();
		}
	} catch (e) { console.error("[News] CORS/Sync error:", e.stack); }
}

async function updateJukeboxBanner() {
	if (!obs || !obs.socket) return;
	try {
		// Fetch a random line from jukebox.txt (falls back if empty)
		let line = await getLineFromFile('jukebox') || `Your online jukebox is available at ${CONFIG.jukeboxUrl}`;
		line = line.replace("{jukeboxlink}", CONFIG.jukeboxUrl);
		const safeMsg = escapePango(line);
		await obs.call('SetInputSettings', { inputName: CONFIG.jukeboxBannerSource, inputSettings: { text: safeMsg } });
	} catch (e) {
		console.error("[Jukebox Banner] Error updating banner:", e);
	}
}

updateJukeboxBanner();
// Rotate every 12 seconds
setInterval(updateJukeboxBanner, 30000);

async function updateObsStats() {
	// Ensure the OBS connection exists and is active
	if (!obs || !obs.socket) return;

	try {
		// 1. Fetch current video configuration (for resolutions and FPS ratio)
		const videoSettings = await obs.call('GetVideoSettings');

		// 2. Fetch real-time performance statistics
		const stats = await obs.call('GetStats');

		// 3. Calculate the true FPS from the numerator and denominator
		// Standard formula: FPS = Numerator / Denominator
		const trueFPS = (videoSettings.fpsNumerator / videoSettings.fpsDenominator).toFixed(2);

		// 4. Determine if a stream or recording is currently active
		// We can check if outputTotalFrames is increasing or use GetStreamStatus if specifically for streaming
		let streamStatus;
		try {
			streamStatus = await obs.call('GetStreamStatus');
		} catch (err) {
			// Fallback if not streaming
			streamStatus = { outputActive: false, outputSkippedFrames: 0 };
		}

		// 5. Construct the display message
		// Using the fields confirmed in your documentation: cpuUsage, outputWidth, outputHeight
		const msg = [
			`Streaming: ${streamStatus.outputActive ? 'LIVE' : 'OFF'}`,
			`FPS: ${stats.activeFps.toFixed(1)} (${trueFPS})`,
			`Res: ${videoSettings.outputWidth}x${videoSettings.outputHeight}`,
			`CPU: ${stats.cpuUsage.toFixed(1)}%`,
			`Dropped: ${stats.outputSkippedFrames}`
		].join('\n');

		// 6. Update the Text Source in OBS
		await obs.call('SetInputSettings', {
			inputName: CONFIG.statsSource,
			inputSettings: { text: msg }
		});

	} catch (e) {
		// Calmly log errors to the console without interrupting the interval
		console.error("[OBS Stats] Error updating overlay:", e);
	}
}

// Update every 2 seconds (2000ms)
setInterval(updateObsStats, 2000);

function decodeAndStripHtml(input) {
	if (!input || typeof input !== "string") return "";

	let text = input;

	// Step 1: Iteratively decode HTML/XML entities (handles &amp;lt; → &lt; → <)
	for (let i = 0; i < 3; i++) {
		const doc = new DOMParser().parseFromString(text, "text/html");
		const decoded = doc.documentElement.textContent || "";
		if (decoded === text) break;
		text = decoded;
	}

	// Step 2: Decode numeric character references (&#nnn; and &#xhhh;)
	text = text.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
	text = text.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

	// Step 3: Strip remaining literal tags
	const doc = new DOMParser().parseFromString(text, "text/html");
	text = doc.body.textContent || "";

	// Step 4: Remove control chars and collapse whitespace
	return text
		.replace(/[\u0000-\u001F\u007F]/g, "") // control chars
		.replace(/\s+/g, " ")
		.trim();
}

function cycleHeadlines() {
	if (newsHeadlines.length === 0) return;
	if (newsTimer) clearTimeout(newsTimer);

	const $content = $("#ticker-content");
	$content.addClass("fade-out").removeClass("fade-in");

	setTimeout(async () => {
		const item = newsHeadlines[newsIndex];

		// 1. Clean input
		const cleanTitle = decodeAndStripHtml(item.title);
		const cleanDesc = decodeAndStripHtml(item.description);

		// 2. Silent key comes from FIELD, not text
		const isSilentKey = item.isSilentKey === true;

		// 3. Build Pango-safe text ONCE
		const pangoTitle = escapePango(cleanTitle);
		const pangoDesc = escapePango(cleanDesc);
		const sep = (pangoTitle && pangoDesc) ? ": " : "";

		const pangoText =
			`<span foreground='#00ff00' weight='bold'>${pangoTitle}${sep}</span>` +
			`<span foreground='#ffffff'>${pangoDesc}</span>`;

		// 4. Browser ticker
		$("#ticker-label").text(item.sourceLabel);
		$content.html(`<span class="headline-title">${cleanTitle}</span>`);
		$content.removeClass("fade-out").addClass("fade-in");

		// 5. OBS logic
		if (obs && obs.socket) {
			try {
				const newsQrId = await getSceneItemId(CONFIG.newsQRSource);
				if (item.link && item.link.startsWith("http")) {
					await obs.call('SetInputSettings', { inputName: CONFIG.newsTextLink, inputSettings: { text: escapePango(item.link) } });

					fetch(`${CONFIG.api}/api/update-news-qr?url=${encodeURIComponent(item.link)}`);
					if (newsQrId !== null)
						await obs.call("SetSceneItemEnabled", {
							sceneName: CONFIG.scene,
							sceneItemId: newsQrId,
							sceneItemEnabled: true
						});
				} else {
					if (newsQrId !== null)
						await obs.call("SetSceneItemEnabled", {
							sceneName: CONFIG.scene,
							sceneItemId: newsQrId,
							sceneItemEnabled: false
						});
				}

				const skItemId = await getSceneItemId(CONFIG.obsSKSource);
				if (skItemId !== null)
					await obs.call("SetSceneItemEnabled", {
						sceneName: CONFIG.scene,
						sceneItemId: skItemId,
						sceneItemEnabled: isSilentKey
					});

				const bgItemId = await getSceneItemId(CONFIG.headerBackgroundSource);
				if (bgItemId !== null) {
					await obs.call("SetInputSettings", {
						inputName: CONFIG.headerBackgroundSource,
						inputSettings: {
							color: isSilentKey ? 0xFF000000 : 0xFF009900
						}
					});
				}

				await obs.call("SetInputSettings", {
					inputName: CONFIG.newsSource,
					inputSettings: { text: pangoText }
				});

			} catch (e) {
				console.error("[OBS] Headline Logic Error.", e);
			}
		}

		newsIndex = (newsIndex + 1) % newsHeadlines.length;
		newsTimer = setTimeout(cycleHeadlines, 12000);

	}, 600);
}

async function getLineFromFile(filename) {
	try {
		const res = await fetch(`${CONFIG.linesDir}${filename}.txt?t=${Date.now()}`);
		if (!res.ok) return null;
		const lines = (await res.text()).split(/\r?\n/).filter(l => l.trim() !== "");
		return lines[Math.floor(Math.random() * lines.length)];
	} catch (e) { return null; }
}

async function speakFromFlatFile(filename, fallback, templateVar = null, templateVal = null) {
	let line = await getLineFromFile(filename) || fallback;
	if (templateVar && templateVal) { const flag = getFlag(templateVal); const valWithFlag = `${templateVal} ${flag}`; const re = new RegExp(templateVar, 'g');
		line = line.replace(re, valWithFlag); }
	botSpeak(line);
}

async function checkTopOfHour() {
	const now = new Date();
	if (now.getMinutes() === 0 && lastAnnouncedHour !== now.getHours()) {
		lastAnnouncedHour = now.getHours();
		let randomMsg = await getLineFromFile('jukebox') || "Please visit my jukebox at {jukeboxlink}";
		botSpeak("========================== ");
		botSpeak(randomMsg.replace(/{jukeboxlink}/g, CONFIG.jukeboxUrl));
		botSpeak("==========================  ");
	}
}

function triggerHeartbeat() { const now = Date.now(); if (lastPongTime > 0) dynamicDuration = now - lastPongTime;
	lastPongTime = now;
	pingCount++; const heart = $("#heart"); const durationSec = (dynamicDuration / 1000).toFixed(2) + "s";
	heart.css("animation", "none");
	void heart[0].offsetWidth;
	heart.css("animation", `${(pingCount % 2 !== 0) ? "moveRight" : "moveLeft"} ${durationSec} linear forwards`); }

function processChatMessage(name, message, isHistoric = false, timestamp = null) {
	if (!name || !message) return;
	const msgHash = `${name}|${message}`;
	if (messageCache.has(msgHash)) return;
	messageCache.add(msgHash);
	setTimeout(() => { messageCache.delete(msgHash); }, 2000);
	const container = $("#log");
	const logTime = timestamp ? new Date(timestamp) : new Date();
	const timeStr = logTime.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
	const flag = getFlag(name, message);
	let badgeType = name.toLowerCase().includes(CONFIG.room.toLowerCase()) ? "host" : "verified";
	if (name === CONFIG.nick) badgeType = "bot";
	container.append(`<div class="msg"><span class="timestamp">[${timeStr}]</span> <span class="user-badge badge-${badgeType}">${badgeType.toUpperCase()}</span> <span class="${(name === CONFIG.nick) ? "bot-name" : "chat-name"}">${name} ${flag}:</span> <span class="payload-text">${message}</span></div>`);
	if ($("#log .msg").length > 40) $("#log .msg:first").remove();
	if (!isHistoric && name !== CONFIG.nick) handleCommands(name, message);
}

async function handleCommands(user, message) {
	const input = message.trim().toLowerCase();
	if (!input.startsWith('!')) return;
	const parts = input.substring(1).split(' ');
	const rawCmd = parts[0];
	const args = parts.slice(1).join(' ').trim();
	const result = resolveCommand(rawCmd);
	if (result.type === 'ambiguous') { botSpeak(`Ambiguous ! command, matches: !${result.matches.join(', !')}`); return; }
	if (result.type === 'match') {
		const cmd = result.cmd;
		if (cmd === 'help') {
			if (!args) botSpeak("Available: !" + COMMAND_LIST.join(', !'));
			else {
				const search = args.startsWith('!') ? args.substring(1) : args;
				const matches = COMMAND_LIST.filter(c => c.startsWith(search));
				if (matches.length === 0) botSpeak(`No help found for "${search}".`);
				else matches.forEach(m => botSpeak(`!${m}: ${HELP_DOCS[m] || "No description available."}`));
			}
		} else if (cmd === 'menu') {
			try {
				const res = await fetch(`${CONFIG.linesDir}menu.txt?t=${Date.now()}`);
				if (res.ok) {
					const menuLines = (await res.text()).split(/\r?\n/).filter(l => l.trim() !== "");
					menuLines.forEach(line => botSpeak(line));
				} else { botSpeak("Canteen menu is currently offline."); }
			} catch (e) { console.error(`[Menu] Error: ${e}`); }
		} else if (cmd === 'loc') { if (!args) { const saved = userLocations[user]; if (saved) botSpeak(`${user}: Your saved grid is ${saved}. Distance: ${getDistance(CONFIG.homeGrid, saved)}km.`);
				else botSpeak(`${user}: Use !loc [GridSquare] to save your location.`); } else { const response = await saveUserLocation(user, args);
				botSpeak(`${user}: ${response}`); } } else if (cmd === 'message') { if (!args) { botSpeak(`${user}: Usage !message [your text]`); } else { try { await $.post(CONFIG.api + '/api/save-message', { user: user, message: args });
					botSpeak(`${user}: Message received and saved. 73!`); } catch (e) { botSpeak(`${user}: Error saving message.`); } } } else if (cmd === 'sendmail') {
			const mailParts = args.split(' ');
			const recipient = mailParts[0];
			const note = mailParts.slice(1).join(' ');
			if (!recipient || !note) {
				botSpeak(`${user}: Usage !sendmail [callsign] [message]`);
			} else if (!isCallsign(user) || !isCallsign(recipient)) {
				botSpeak(`${user}: Both sender and recipient must have valid callsigns.`);
			} else {
				try {
					await $.post(CONFIG.api + '/api/store', JSON.stringify({ from: user, to: recipient, msg: note }));
					botSpeak(`${user}: Message stored for ${recipient.toUpperCase()}.`);
				} catch (e) { botSpeak(`${user}: Error storing message.`); }
			}
		} else if (cmd === 'getmail') {
			if (!isCallsign(user)) {
				botSpeak(`${user}: You must have a valid callsign to retrieve mail.`);
			} else {
				try {
					// Use $.ajax to ensure we send and receive as JSON
					$.ajax({
						url: CONFIG.api + '/api/forward',
						type: 'POST',
						contentType: 'application/json',
						data: JSON.stringify({ user: user }),
						success: function(msgs) {
							// msgs will already be an object/array if the server sends correct headers
							if (Array.isArray(msgs) && msgs.length > 0) {
								msgs.forEach(m => {
									botSpeak(`[MAIL] From ${m.from}: ${m.msg}`);
								});
							} else {
								botSpeak(`${user}: You have no mail waiting.`);
							}
						},
						error: function(xhr, status, error) {
							console.error(`[GETMAIL] Error: ${error}`);
							botSpeak(`${user}: Error retrieving mail.`);
						}
					});
				} catch (e) { 
					botSpeak(`${user}: Error initiating mail request.`); 
				}
			}
		} else if (cmd === 'play') { const id = args,
				file = videoList[parseInt(id) - 1]; if (file) playVideo(id, user, file); } else if (cmd === 'list') {
			if (args) {
				const matches = videoList.map((f, i) => ({ f, i })).filter(item => item.f.toLowerCase().includes(args.toLowerCase()));
				if (matches.length === 0) { botSpeak(`${user}: No matches found for "${args}".`); } else { const countToShow = Math.min(matches.length, 5);
					botSpeak(`${user}: Found ${matches.length} matches. Showing first ${countToShow}:`);
					matches.slice(0, 5).forEach(item => botSpeak(`#${item.i + 1}: ${cleanName(item.f)}`)); }
			} else {
				botSpeak(`There are ${videoList.length} videos in the jukebox`);
				[...videoList].sort(() => 0.5 - Math.random()).slice(0, 5).forEach(f => botSpeak(`#${videoList.indexOf(f) + 1}: ${cleanName(f)}`)); }
		} else if (cmd === 'request') { if (!args) { botSpeak(`${user}: Usage !request [keyword]`); return; } const matches = videoList.map((v, i) => ({ v, i })).filter(item => item.v.toLowerCase().includes(args.toLowerCase())); if (matches.length === 0) { botSpeak(`${user}: No matches found for "${args}".`); } else { const results = matches.slice(0, 3).map(item => `#${item.i + 1}`).join(', ');
				botSpeak(`${user}: Matches for "${args}": ${results}${matches.length > 3 ? ' (more found...)' : ''}`); } } else if (cmd === 'sysop') { triggerObsAlert(user);
			botSpeak(`Alerting Sysop... ${user} ${getFlag(user)}.`);
			$.post(CONFIG.api + '/api/sysop-alert', { user: user }); } else if (cmd === 'url') { botSpeak(`Visit the Jukebox here: ${CONFIG.jukeboxUrl}`); } else if (cmd === 'ping') { botSpeak(`Pong! Current Latency: ${currentLatency}ms.`); } else if (cmd === 'socials') { botSpeak(`GitHub: github.com/gregoryfenton | QRZ: qrz.com/db/M0ODZ | YouTube: @GregoryFenton_UK`); } else if (['about', 'uptime', 'joke', 'bofh', 'status', 'ham', 'weather', 'fact', 'fortune', 'eightball', 'signal', 'upgrade', 'confess', 'diagnose', 'coinflip', 'dice', 'coffee', 'tea', 'juice', 'cookie', 'biscuit', 'pizza', 'burger', 'chips', 'cake', 'hug', 'antenna', 'valve', 'shackcat', 'component', 'menu'].includes(cmd)) { speakFromFlatFile(cmd, `Command !${cmd} file missing.`, "{name}", user); } else if (cmd === 'fix') speakFromFlatFile('fix', `Fixing...`, "{name}", user);
	}
}

function botSpeak(msg) { chatQueue.push(msg); }

function processChatQueue() { if (chatQueue.length > 0 && batcSocket ?.connected) { const msg = chatQueue.shift();
		batcSocket.emit('message', { message: msg });
		processChatMessage(CONFIG.nick, msg, false); } }

/**
 * Sets up the BATC live chat connection.
 * Parses the "viewers" packet structure: ["viewers", { "num": X }]
 */
function setupChat() {
	batcSocket = io('https://batc.org.uk', {
		path: "/live-chat/socket.io",
		query: 'room=' + CONFIG.room,
		transports: ['websocket']
	});

	batcSocket.on('connect', () => {
		batcSocket.emit('setnick', { nick: CONFIG.nick });
	});

	batcSocket.on('history', (data) => {
		// Check for viewer count in history snapshot
		if (data && typeof data.num !== 'undefined') {
			Viewers = data.num;
			refreshLocalNicksDisplay();
		}

		if (data ?.nicks) {
			updateNicksDisplay(data.nicks);
			initialNicksLoaded = true;
		}

		(Array.isArray(data) ? data : data.history || []).forEach(m => {
			processChatMessage(m.name, m.message, true, m.time || m.timestamp);
		});
	});

	// Handle the "viewers" event specifically for the { "num": X } structure
	batcSocket.on('viewers', (data) => {
		if (data && typeof data.num !== 'undefined') {
			Viewers = data.num;
			refreshLocalNicksDisplay();
		}
	});

	batcSocket.on('message', (data) => {
		if (data ?.name && data ?.message) {
			processChatMessage(data.name, data.message, false, data.timestamp);
		}
	});

	// Global queue to manage multiple "New Country" announcements
	let flagQueue = [];
	let isProcessingQueue = false;

	/**
	 * Processes the queue of new countries one by one
	 */
	async function processFlagQueue() {
		if (isProcessingQueue || flagQueue.length === 0) return;

		isProcessingQueue = true;
		const visitorFlag = flagQueue.shift();

		try {
			const mahoosiveSourceId = await getSceneItemId(CONFIG.mahoosiveSource);
			
			if (mahoosiveSourceId) {
				console.log(`[DISPLAYING NEW COUNTRY]: ${visitorFlag}`);
				const newCountry = "NEW COUNTRY"

				// 1. Set text and show source
				await obs.call('SetInputSettings', {
					inputName: CONFIG.mahoosiveSource,
					inputSettings: { text: `${newCountry}\n ` }
				});

				await obs.call('SetSceneItemEnabled', {
					sceneName: CONFIG.scene,
					sceneItemId: mahoosiveSourceId,
					sceneItemEnabled: true
				});

				await obs.call('SetInputSettings', {
					inputName: CONFIG.mahoosiveSource,
					inputSettings: { text: `${newCountry}\n${visitorFlag}` }
				});				

				// 2. Wait for 5 seconds
				await new Promise(resolve => setTimeout(resolve, 5000));

				// 3. Clear text and hide source
				await obs.call('SetInputSettings', {
					inputName: CONFIG.mahoosiveSource,
					inputSettings: { text: `` }
				});

				await obs.call('SetSceneItemEnabled', {
					sceneName: CONFIG.scene,
					sceneItemId: mahoosiveSourceId,
					sceneItemEnabled: false
				});
			}
		} catch (err) {
			console.error("[QUEUE PROCESS ERR]", err);
		} finally {
			isProcessingQueue = false;
			// Check if there's another flag waiting in the queue
			processFlagQueue();
		}
	}

	batcSocket.on('nicks', (data) => {
		if (data?.nicks) {
			if (!initialNicksLoaded) {
				initialNicksLoaded = true;
			} else {
				data.nicks.forEach(async (n) => {
					if (!lastNicks.includes(n) && n !== CONFIG.nick) {

						// 1. Welcome Logic (Existing Code Intact)
						await speakFromFlatFile('welcome', `Welcome, ${n}!`, "{name}", n);

						if (CONFIG.announceVisitor) {
							$.post(CONFIG.api + '/api/doorbell', { name: n });
						}

						// 2. Mail Announcement Logic (New: only announce if mail exists)
						if (isCallsign(n)) {
							try {
								const check = await $.getJSON(`${CONFIG.api}/api/checkmessages?user=${encodeURIComponent(n)}`);
								if (check && check.count > 0) {
									botSpeak(`[MAIL] ${n}, you have ${check.count} message(s) waiting. Type !getmail to read.`);
								}
							} catch (e) { console.error("[Mail Check] Error:", e); }
						}

						// 3. Flag Logic with Queue Integration (Existing Code Intact)
						const visitorFlag = getFlag(n);
						if (visitorFlag && visitorFlag !== '🌐' && visitorFlag !== '💻') {
							
							$.post(CONFIG.api + '/api/update-visitor-flags', { flag: visitorFlag }).done(function(responseData) {
								if (responseData === "NEW FLAG") {
									console.log(`[QUEUEING NEW COUNTRY]: ${visitorFlag}`);
									// Add to queue and trigger processing
									flagQueue.push(visitorFlag);
									processFlagQueue();
								}
							});
						}
					}
				});
			}
			lastNicks = [...data.nicks];
			updateNicksDisplay(data.nicks);
		}
	});

	batcSocket.io.engine.on('ping', () => {
		pingStartTime = Date.now();
	});

	batcSocket.io.engine.on('pong', () => {
		currentLatency = Date.now() - pingStartTime;
		$("#latency").text(`| Ping: ${currentLatency}ms`);
		triggerHeartbeat();
	});
}

/**
 * Refreshes the display and handles errors with line-number reporting.
 */
async function refreshLocalNicksDisplay() {
	const hostCallsgn = CONFIG.room.toUpperCase();
	const botNick = CONFIG.nick.toUpperCase();

	const effectiveViewerCount = (typeof Viewers !== 'undefined' && Viewers !== -1) ?
		Viewers :
		lastNicks.length;

	let finalOutput = "Stream Viewers:\n";

	try {
		finalOutput += lastNicks
			.sort((a, b) => {
				const aU = a.toUpperCase();
				const bU = b.toUpperCase();
				if (aU.includes(hostCallsgn) && !bU.includes(hostCallsgn)) return -1;
				if (!aU.includes(hostCallsgn) && bU.includes(hostCallsgn)) return 1;
				if (aU === botNick && bU !== botNick) return -1;
				if (aU !== botNick && bU === botNick) return 1;
				return a.localeCompare(b);
			})
			.map(n => {
				const flag = getFlag(n);
				const escaped = escapePango(n);
				const upper = n.toUpperCase();

				if (upper.includes(hostCallsgn)) {
					return `<span background='#007bff' foreground='#ffffff'> HOST </span> ${flag} ${escaped}`;
				}
				if (upper === botNick) {
					return `<span background='#f39c12' foreground='#ffffff'> BOT </span> 💻 ${escaped}`;
				}
				return `<span background='#28a745' foreground='#ffffff'> USER </span> ${flag} ${escaped}`;
			})
			.join('\n');

		$("#viewer-count").text(`| Viewers: ${effectiveViewerCount}`);

		await obs.call('SetInputSettings', {
			inputName: CONFIG.nicksSource,
			inputSettings: { text: finalOutput }
		});

	} catch (e) {
		// Extract line number and file from stack trace
		const stack = e.stack || "";
		const match = stack.match(/at\s+(.*):(\d+):(\d+)/) || stack.match(/:(\d+):(\d+)/);
		const lineInfo = match ? `Line: ${match[1] || match[0]}` : "Line info unavailable";

		console.error(`[OBS Stats Error] ${e.message} | ${lineInfo}`);
	}
}

async function refreshNetworkStatusDisplay() {
	let finalOutput = "BATC Network Activity:\n";
	let entries = [];
	for (const [url, data] of Object.entries(remoteNicksMap)) {
		if (data.nicks ?.length > 0) {
			let roomHeader = `<span background='#007bff' foreground='#ffffff'> ${data.type} </span> ${getFlag(data.title)} ${escapePango(data.title)}`;
			let userList = data.nicks.map(n => `<span background='#28a745' foreground='#ffffff'> USER </span> ${getFlag(n)} ${escapePango(n)}`).join('\n');
			entries.push(`${roomHeader}\n${userList}`);
		}
	}
	finalOutput += entries.length > 0 ? entries.join('\n\n') : "Scanning Network...";
	try { await obs.call('SetInputSettings', { inputName: CONFIG.networkStatusSource, inputSettings: { text: finalOutput } }); } catch (e) {}
}

async function updateNicksDisplay(nicks) { lastNicks = [...nicks];
	refreshLocalNicksDisplay(); }

async function pollBATCChannels() {
	try {
		const response = await fetch('https://batc.org.uk/live-api/stream_list.php');
		const data = await response.json();
		const activeInPHP = new Set();
		const processItem = (item, type) => {
			const url = item.stream_output_url;
			if (item.active && url) {
				activeInPHP.add(url);
				if (!remoteSockets[url]) {
					const socket = io('https://batc.org.uk', { path: "/live-chat/socket.io", query: 'room=' + url, transports: ['websocket'], reconnection: true });
					remoteSockets[url] = socket;
					remoteNicksMap[url] = { title: item.stream_title || url, type: type, nicks: [] };
					socket.on('connect', () => { socket.emit('join', { room: url }); });
					socket.on('history', (d) => { if (d ?.nicks) { remoteNicksMap[url].nicks = d.nicks;
							refreshNetworkStatusDisplay(); } });
					socket.on('nicks', (d) => { if (d ?.nicks) { remoteNicksMap[url].nicks = d.nicks;
							refreshNetworkStatusDisplay(); } });
				} else { remoteSockets[url].emit('getnicks'); }
			}
		};
		const lists = [{ list: data.members, type: "MEMBER" }, { list: data.repeaters, type: "REPEATER" }, { list: data.events, type: "EVENT" }];
		lists.forEach(category => { if (category.list) category.list.forEach(item => processItem(item, category.type)); });
		Object.keys(remoteSockets).forEach(url => { if (!activeInPHP.has(url)) { remoteSockets[url].disconnect();
				delete remoteSockets[url];
				delete remoteNicksMap[url];
				refreshNetworkStatusDisplay(); } });
	} catch (e) { console.error("[PHP Poll] Fetch error."); }
}

async function pollWeb() {
	try {
		const d = await $.getJSON(CONFIG.api + '/api/get-command');
		if (d && d.id) {
			const videoIndex = parseInt(d.id) - 1;
			const selectedVideo = videoList[videoIndex];
			if (selectedVideo) { playVideo(d.id, d.user, selectedVideo); }
		}
	} catch (e) { console.error(`pollWeb error: ${e}`); }
}

function cleanName(fileName) { if (!fileName) return ""; return fileName.replace(/\s*\[.*?\]/g, '').split('.').slice(0, -1).join('.'); }

function generateProgressBar(current, total, length) {
	if (total <= 0) return "░".repeat(length);
	const progress = Math.min(Math.max(current / total, 0), 1);
	const filledLength = Math.round(progress * length);
	const emptyLength = length - filledLength;
	return `[${"█".repeat(filledLength)}${"░".repeat(emptyLength)}]`;
}

async function updateClock() {
	if (!obs || !obs.socket) return;
	const now = new Date();
	const utcTime = now.toISOString().substr(11, 8);
	const localTime = now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
	const clockText = `U${utcTime} L${localTime}`;
	try { await obs.call('SetInputSettings', { inputName: CONFIG.clockSource, inputSettings: { text: clockText } }); } catch (e) {}
}

async function updateText() {
	if (!obs || !obs.socket) return;
	try {
		const status = await obs.call('GetMediaInputStatus', { inputName: CONFIG.source });
		const settings = await obs.call('GetInputSettings', { inputName: CONFIG.source });
		const currentStatus = status.mediaStatus || status.mediaState;
		const isPlaying = (currentStatus === "OBS_MEDIA_STATE_PLAYING" || currentStatus === "OBS_MEDIA_STATE_PAUSED");

		if (isPlaying && settings.inputSettings ?.local_file) {
			idleSeconds = 0;
			const fileName = settings.inputSettings.local_file.split(/[\\/]/).pop();
			const cleanedName = cleanName(fileName);
			const ytMatch = fileName.match(/\[([a-zA-Z0-9_-]{11})\]/);
			const qrTextId = await getSceneItemId(CONFIG.qrTextSource);
			const qrImgId = await getSceneItemId(CONFIG.qrImageSource);

			if (ytMatch) {
				if (qrTextId !== null) {
					await obs.call('SetSceneItemEnabled', { sceneName: CONFIG.scene, sceneItemId: qrTextId, sceneItemEnabled: true });
					await obs.call('SetInputSettings', { inputName: CONFIG.qrTextSource, inputSettings: { text: `Direct link to this video on Youtube:\nhttps://youtu.be/${ytMatch[1]}` } });
				}
				if (qrImgId !== null) await obs.call('SetSceneItemEnabled', { sceneName: CONFIG.scene, sceneItemId: qrImgId, sceneItemEnabled: true });
			} else {
				if (qrTextId !== null) await obs.call('SetSceneItemEnabled', { sceneName: CONFIG.scene, sceneItemId: qrTextId, sceneItemEnabled: false });
				if (qrImgId !== null) await obs.call('SetSceneItemEnabled', { sceneName: CONFIG.scene, sceneItemId: qrImgId, sceneItemEnabled: false });
				//await setSourceHeight(CONFIG.chatSource, 1080);
			}

			const cursor = status.mediaCursor || 0;
			const duration = status.mediaDuration || 0;
			const progressBar = generateProgressBar(cursor, duration, 40);

			const safeName = escapePango(cleanedName);
			const finalDisplay = `Now Playing:\n${safeName}\n${formatTime(cursor)} / ${formatTime(duration)}\n${progressBar}`;
			await obs.call('SetInputSettings', { inputName: CONFIG.textSource, inputSettings: { text: finalDisplay } });
		} else {
			if (idleSeconds === 0) {
				const line = await getLineFromFile('jukebox');
				currentIdleMessage = line ? line.replace(/{jukeboxlink}/g, CONFIG.jukeboxUrl) : "";
				const qrTextId = await getSceneItemId(CONFIG.qrTextSource);
				const qrImgId = await getSceneItemId(CONFIG.qrImageSource);
				if (qrTextId !== null) await obs.call('SetSceneItemEnabled', { sceneName: CONFIG.scene, sceneItemId: qrTextId, sceneItemEnabled: false });
				if (qrImgId !== null) await obs.call('SetSceneItemEnabled', { sceneName: CONFIG.scene, sceneItemId: qrImgId, sceneItemEnabled: false });
				//await setSourceHeight(CONFIG.chatSource, 1080);
			}
			idleSeconds++;
			if (idleSeconds >= CONFIG.nextVideoStartAfter) { await playRandom();
				idleSeconds = 0; } else {
				const remaining = CONFIG.nextVideoStartAfter - idleSeconds;
				const progressBar = generateProgressBar(idleSeconds, CONFIG.nextVideoStartAfter, 40);
				const safeIdle = escapePango(currentIdleMessage);
				const idleMsg = `Jukebox Idle\nThe next video starts in ${remaining} seconds\n${progressBar}\n${safeIdle}\n00:00 / 00:00`;
				await obs.call('SetInputSettings', { inputName: CONFIG.textSource, inputSettings: { text: idleMsg } });
			}
		}
	} catch (e) { console.error("[OBS] Text update error:", e); }
}

async function getSceneItemId(sourceName, sceneName = CONFIG.scene) { try { const res = await obs.call('GetSceneItemList', { sceneName }); const item = res.sceneItems.find(i => i.sourceName === sourceName); if (item) return item.sceneItemId; for (const i of res.sceneItems) { if (i.sceneItemKind === 'group') { const groupRes = await obs.call('GetGroupSceneItemList', { sceneName: i.sourceName }); const groupItem = groupRes.sceneItems.find(g => g.sourceName === sourceName); if (groupItem) return groupItem.sceneItemId; } } return null; } catch (e) { return null; } }
async function setSourceHeight(sourceName, height) { const itemId = await getSceneItemId(sourceName); if (itemId !== null) try { await obs.call('SetSceneItemTransform', { sceneName: CONFIG.scene, sceneItemId: itemId, sceneItemTransform: { boundsHeight: height, boundsType: "OBS_BOUNDS_STRETCH" } }); } catch (e) {} }

function formatTime(ms) { let s = Math.floor(ms / 1000); return Math.floor(s / 60).toString().padStart(2, '0') + ":" + (s % 60).toString().padStart(2, '0'); }
async function playRandom() { if (videoList.length === 0) return; const file = videoList[Math.floor(Math.random() * videoList.length)]; let line = await getLineFromFile('idle');
	playVideo(videoList.indexOf(file) + 1, "The Dial", file, line ? line.replace("{title}", cleanName(file)) : `Auto-Dial: ${cleanName(file)}`); }
async function playVideo(num, user, file, customMsg) { try { fetch(`${CONFIG.api}/api/update-qr?file=${encodeURIComponent(file)}`);
		await obs.call('SetInputSettings', { inputName: CONFIG.source, inputSettings: { local_file: CONFIG.videoDir + file } });
		setTimeout(() => obs.call('TriggerMediaInputAction', { inputName: CONFIG.source, mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART' }), 150);
		botSpeak(customMsg || `Playing #${num} for ${user}: ${cleanName(file)}`); } catch (e) {} }
async function triggerObsAlert(user) { try { await obs.call('SetInputSettings', { inputName: CONFIG.alertSource, inputSettings: { local_file: CONFIG.alertFile } });
		setTimeout(() => { obs.call('TriggerMediaInputAction', { inputName: CONFIG.alertSource, mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART' }); }, 50); } catch (e) {} }

/**
 * Updates the standalone viewer display.
 * Separated from OBS stats to maintain DRY principles.
 */
function updateViewerDisplay(count) {
	const viewerElement = $("#viewer-count");
	if (viewerElement.length) {
		viewerElement.text(`Viewers: ${count}`);
	}
}

async function init() {
	obs = new(window.obswebsocketjs ?.OBSWebSocket || OBSWebSocket)();
	try {
		await obs.connect(CONFIG.addr, CONFIG.pass);
		videoList = await $.getJSON(CONFIG.api + '/api/list');
		setInterval(async () => {
			try { videoList = await $.getJSON(CONFIG.api + '/api/list'); } catch (e) { console.error("[VideoList] Refresh failed."); }
		}, 30000);
		await loadLocations();
		setupChat();
		await updateNewsFeed();
		pollBATCChannels();
		setTimeout(() => { pollBATCChannels();
			setInterval(pollBATCChannels, 30000); }, 10000);
		setInterval(updateNewsFeed, 900000);
		setInterval(pollWeb, 1500);
		setInterval(updateText, 1000);
		setInterval(updateClock, 250);
		setInterval(processChatQueue, 200);
		setInterval(checkTopOfHour, 30000);
	} catch (e) { console.error("[Init] Failure."); }
}

window.addEventListener('beforeunload', () => { if (batcSocket) batcSocket.disconnect();
	Object.values(remoteSockets).forEach(s => s.disconnect()); });
init();