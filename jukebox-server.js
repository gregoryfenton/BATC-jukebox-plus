import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec, execSync } from 'child_process';
import chokidar from 'chokidar';
import QRCode from 'qrcode';
import { createCanvas, loadImage } from 'canvas';
import { XMLParser } from 'fast-xml-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAIN_DIR = '/home/greg/BATC';
const VIDEO_DIR = '/home/greg/Videos/jukebox';
const TEMP_QR_PATH = '/tmp/qr.tmp';
const QR_PATH = MAIN_DIR + '/slides/current_qr.png';
const TEMP_NEWS_QR_PATH = '/tmp/newsqr.tmp';
const NEWS_QR_PATH = MAIN_DIR + '/news_qr.png';
const ALERT_SOUND = MAIN_DIR + '/alert.wav';
const LOCATIONS_FILE = MAIN_DIR + '/locations.json';
const BLACKLIST_FILE = MAIN_DIR + '/blacklist.json';
const MESSAGES_FILE = MAIN_DIR + '/messages.txt';
const FORWARD_MESSAGES_FILE = MAIN_DIR + '/mailmessages.txt';
const VISITOR_FLAGS_FILE = MAIN_DIR + '/visitorflags.txt';
const EXTENSIONS = ['.mp4', '.mkv', '.avi'];
const BOT_IMAGE_PATH = MAIN_DIR + "/bot.png";
const PORT = 3000;
const speechAnnounceVisitors = true;
const doorbellAnnounceVisitors = false;
const speechCommand = "espeak-ng";
const speechAmplitude = 20;

const RSS_SOURCES = [
    { url: "https://www.arrl.org/arrl.rss", label: "ARRL NEWS" },
    { url: "https://rsgb.org/main/blog/category/news/feed/", label: "RSGB NEWS" },
    { url: "https://rsgb.org/main/feed/", label: "RSGB MAIN" },
    { url: "https://daily.hamweekly.com/atom.xml", label: "HAM DAILY" },
    { url: "https://forum.batc.org.uk/app.php/feed", label: "BATC FORUM" },
    { url: "https://www.rtl-sdr.com/feed/", label: "RTL-SDR.COM" },
    { url: "https://amsat-uk.org/feed/", label: "AMSAT UK" },
    { url: "https://www.spaceweather.com/service/feed.xml", label: "SPACE WEATHER" },
    { url: "https://www.arnewsline.org/news?format=rss", label: "ARNEWSLINE" }
];

let commandQueue = [];

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    alwaysCreateTextNode: true,
    trimValues: true
});

/**
 * THE RADIO NEWS PARSER LIBRARY
 * Surgical string-sniping to handle various RSS and Atom flavors.
 */
const ParserLibrary = {
    // Standard RSS Snipper (ARRL, RSGB, ARNEWSLINE, RTL-SDR)
    parseRSS: function(xml, label) {
        const items = [];
        const blocks = xml.split(/<item/i).slice(1);
        blocks.forEach(block => {
            const title = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
            const link = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] || "";
            const desc = block.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] || "";
            const date = block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] || new Date().toISOString();
            if (title) items.push(this.process(title, link, desc, label, date));
        });
        return items;
    },

    // Atom Snipper (BATC, Ham Daily)
    parseAtom: function(xml, label) {
        const items = [];
        const blocks = xml.split(/<entry/i).slice(1);
        blocks.forEach(block => {
            const title = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
            const link = block.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] || "";
            const desc = block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i)?.[1] || 
                         block.match(/<content[^>]*>([\s\S]*?)<\/content>/i)?.[1] || "";
            const date = block.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i)?.[1] || new Date().toISOString();
            if (title) items.push(this.process(title, link, desc, label, date));
        });
        return items;
    },

    // Specialized AMSAT Snipper (Focuses on primary link, ignores media content)
    parseAmsatUK: function(xml, label) {
        const items = [];
        const blocks = xml.split(/<item/i).slice(1);
        blocks.forEach(block => {
            const title = block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "";
            const link = block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || "";
            const desc = block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || "";
            const date = block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] || new Date().toISOString();
            if (title) items.push(this.process(title, link, desc, label, date));
        });
        return items;
    },

    process: function(t, l, d, label, date) {
        const strip = (str) => {
            if (!str) return "";
            return str.replace(/<!\[CDATA\[/g, '')
                      .replace(/\]\]>/g, '')
                      .replace(/<[^>]*>/g, '') 
                      .replace(/&nbsp;/g, ' ')
                      .replace(/&#8217;/g, "'")
                      .replace(/&#8230;/g, "...")
                      .trim();
        };

        const cleanTitle = strip(t);
        const cleanDesc = strip(d);
        const isSK = /SILENT KEY|\(SK\)/i.test(cleanTitle + cleanDesc);

        return {
            title: cleanTitle,
            link: strip(l),
            description: cleanDesc,
            sourceLabel: label,
            pubDate: new Date(date),
            isSilentKey: isSK
        };
    }
};

function sanitizePango(text) {
    if (!text) return "";
    let clean = text.toString();
    clean = clean.replace(/<\/?[^>]+(>|$)/g, "");
    clean = clean.replace(/Â/g, "").replace(/â€TM/g, "'").replace(/â€/g, '"');
    return clean
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function getHttpsData(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', (err) => reject(err));
    });
}

// Ensure directories exist
[path.dirname(QR_PATH), path.dirname(LOCATIONS_FILE)].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

if (!fs.existsSync(LOCATIONS_FILE)) fs.writeFileSync(LOCATIONS_FILE, JSON.stringify({}, null, 4));
if (!fs.existsSync(BLACKLIST_FILE)) fs.writeFileSync(BLACKLIST_FILE, JSON.stringify([], null, 4));
if (!fs.existsSync(MESSAGES_FILE)) fs.writeFileSync(MESSAGES_FILE, '');
if (!fs.existsSync(VISITOR_FLAGS_FILE)) fs.writeFileSync(VISITOR_FLAGS_FILE, "Countries that have visited this stream:\n");

function getIP(req) { return req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''; }

function isBlacklisted(ip) {
    try {
        const list = JSON.parse(fs.readFileSync(BLACKLIST_FILE, 'utf8'));
        return list.includes(ip);
    } catch (e) { return false; }
}

function banIP(ip, reason) {
    if (ip === '127.0.0.1' || ip === '::1') return; 
    try {
        const list = JSON.parse(fs.readFileSync(BLACKLIST_FILE, 'utf8'));
        if (!list.includes(ip)) {
            list.push(ip);
            fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(list, null, 4));
            console.log(`[SECURITY] BANNED: ${ip} | Reason: ${reason}`);
        }
    } catch (e) { console.error("Ban failed", e); }
}

const VALID_ROUTES = [
    '/api/list', '/api/play', '/api/get-command', '/api/news', '/api/sysop-alert', 
    '/api/load-locations', '/api/save-location', '/api/save-message', 
    '/thumbs/', '/api/update-visitor-flags'
];

const HONEYPOTS = new Set(['wp-login.php', 'phpmyadmin', '.env', '.git/config', 'setup.cgi']);

function generateThumb(videoFile) {
    if (videoFile.match(/\[(.*?)\]/)) return;
    const thumbName = videoFile.split('.').slice(0, -1).join('.') + '.png';
    const thumbsDir = path.join(VIDEO_DIR, 'thumbs');
    if (!fs.existsSync(thumbsDir)) fs.mkdirSync(thumbsDir);
    const thumbPath = path.join(thumbsDir, thumbName);
    const videoPath = path.join(VIDEO_DIR, videoFile);
    if (!fs.existsSync(thumbPath)) {
        try {
            execSync(`ffmpeg -ss 00:00:05 -i "${videoPath}" -vframes 1 -q:v:v 2 "${thumbPath}" -y`, { stdio: 'ignore' });
        } catch (e) { console.error(`[Thumb fail] ${videoPath}`); }
    }
}

async function generateCompositeSlide(url, title, subtitle, outputPath) {
    const width = 600;
    const height = 300;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    try {
        // Generate QR
        const qrBuffer = await QRCode.toBuffer(url, { 
            width: 300, 
            margin: 1,
            errorCorrectionLevel: 'H',
            color: { dark: '#ffffff', light: '#000000' }
        });
        const qrImage = await loadImage(qrBuffer);
        ctx.drawImage(qrImage, 0, 0);

        const cx = 150;
        const cy = 150;

        // Draw center logo (bot.png) if it exists
        if (fs.existsSync(BOT_IMAGE_PATH)) {
            const botImg = await loadImage(BOT_IMAGE_PATH);
            const iconSize = 64; // Adjust as needed
            
            // Clear space behind logo to ensure scannability
            ctx.fillStyle = '#000000';
            ctx.fillRect(cx - (iconSize/2 + 5), cy - (iconSize/2 + 5), iconSize + 10, iconSize + 10);
            
            ctx.drawImage(botImg, cx - iconSize/2, cy - iconSize/2, iconSize, iconSize);
        }

        // Sidebar Text
        ctx.textAlign = 'left';
        ctx.fillStyle = '#00ff00';
        ctx.font = 'bold 24px Monospace';
        ctx.fillText(title, 302, 130);

        ctx.fillStyle = '#ffffff';
        ctx.font = '16px Monospace';
        ctx.fillText(subtitle, 302, 170);

        fs.writeFileSync(outputPath, canvas.toBuffer('image/png'));
    } catch (err) {
        console.error("Slide Gen Error:", err);
    }
}

async function updateQRFile(videoFile) {
    const ytId = videoFile.match(/\[(.*?)\]/)?.[1];
    try {
        if (ytId) {
            await generateCompositeSlide(`https://youtu.be/${ytId}`, "YOUTUBE LINK", `https://youtu.be/${ytId}`, TEMP_QR_PATH);
        } else {
            await generateCompositeSlide(`de M0ODZ`, "de M0ODZ", "no YT link", TEMP_QR_PATH);
        }
        await fs.promises.rename(TEMP_QR_PATH, QR_PATH);
    } catch (err) { console.error('QR Write Error:', err); }
}

const watcher = chokidar.watch(VIDEO_DIR, { ignored: /(^|[\/\\])\../, persistent: true });
watcher.on('add', f => {
    const base = path.basename(f);
    if (EXTENSIONS.includes(path.extname(base).toLowerCase())) { generateThumb(base); }
});

const server = http.createServer(async (req, res) => {
    const clientIP = getIP(req);
    const url = new URL(req.url, `http://${req.headers.host}`);
    const normalizedPath = url.pathname.substring(1).toLowerCase();

    if (isBlacklisted(clientIP)) { res.writeHead(403); return res.end("Forbidden."); }
    const isRealRoute = VALID_ROUTES.some(r => url.pathname.startsWith(r)) || url.pathname === '/';
    if (!isRealRoute && HONEYPOTS.has(normalizedPath)) {
        banIP(clientIP, `Security probe on: ${url.pathname}`);
        res.writeHead(403); return res.end("Forbidden.");
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    if (url.pathname.startsWith('/thumbs/')) {
        const filePath = path.join(VIDEO_DIR, 'thumbs', path.basename(url.pathname));
        if (fs.existsSync(filePath)) {
            res.writeHead(200, { 'Content-Type': 'image/png' });
            return res.end(fs.readFileSync(filePath));
        }
        res.writeHead(404); return res.end();
    }

    if (url.pathname === '/api/update-visitor-flags' && req.method === 'POST') {
        let body = '';
        let resEnd = 'OK';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            const params = new URLSearchParams(body);
            const flag = params.get('flag');
            if (flag) {
                let currentFlags = fs.readFileSync(VISITOR_FLAGS_FILE, 'utf8');
                if (!currentFlags.includes(flag))
                {
                    fs.appendFileSync(VISITOR_FLAGS_FILE, flag + " ");
                    resEnd = 'NEW FLAG';
                }
            }
            res.writeHead(200); res.end(resEnd);
        });
        return;
    }

    if (url.pathname === '/api/load-locations') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(fs.readFileSync(LOCATIONS_FILE, 'utf8'));
    }

    if (url.pathname === '/api/save-location' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            const params = new URLSearchParams(body);
            const user = params.get('user'), grid = params.get('grid');
            if (user && grid) {
                const data = JSON.parse(fs.readFileSync(LOCATIONS_FILE, 'utf8'));
                data[user] = grid.toUpperCase();
                fs.writeFileSync(LOCATIONS_FILE, JSON.stringify(data, null, 4));
            }
            res.writeHead(200); res.end("OK");
        });
        return;
    }

    if (url.pathname === '/api/save-message' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            const params = new URLSearchParams(body);
            const user = params.get('user'), msg = params.get('message');
            if (user && msg) {
                const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
                fs.appendFileSync(MESSAGES_FILE, `[${ts}] ${user}: ${msg}\n`);
            }
            res.writeHead(200); res.end("OK");
        });
        return;
    }

    if (url.pathname === '/api/list') {
        const videos = fs.readdirSync(VIDEO_DIR)
            .filter(f => EXTENSIONS.includes(path.extname(f).toLowerCase()))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(videos));
    }

    if (url.pathname === '/api/play') {
        const id = parseInt(url.searchParams.get('id')), user = url.searchParams.get('user') || 'Guest';
        const videos = fs.readdirSync(VIDEO_DIR).filter(f => EXTENSIONS.includes(path.extname(f).toLowerCase()))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
        if (id > 0 && id <= videos.length) {
            commandQueue.push({ id, user });
            updateQRFile(videos[id - 1]);
            res.writeHead(200); return res.end("Queued");
        }
        res.writeHead(400); return res.end("Invalid");
    }

    if (url.pathname === '/api/get-command') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(commandQueue.shift() || null));
    }

    if (url.pathname === '/api/sysop-alert' && req.method === 'POST') {
        exec(`ffplay -nodisp -autoexit "${ALERT_SOUND}"`);
        res.writeHead(200); return res.end("Alerted");
    }

    if (url.pathname === '/api/news') {
        try {
            let allItems = [];
            let seenTitles = new Set();
            for (const source of RSS_SOURCES) {
                try {
                    const spaghetti = await getHttpsData(source.url);
                    let parsedItems = [];
                    if (source.label.includes("BATC") || source.label.includes("HAM DAILY")) {
                        parsedItems = ParserLibrary.parseAtom(spaghetti, source.label);
                    } else if (source.label.includes("AMSAT")) {
                        parsedItems = ParserLibrary.parseAmsatUK(spaghetti, source.label);
                    } else {
                        parsedItems = ParserLibrary.parseRSS(spaghetti, source.label);
                    }
                    parsedItems.forEach(i => {
                        if (!seenTitles.has(i.title)) {
                            seenTitles.add(i.title);
                            allItems.push(i);
                        }
                    });
                } catch (e) { console.error(`Fetch Error ${source.label}:`, e.message); }
            }
            allItems.sort((a, b) => b.pubDate - a.pubDate);
            let xmlRes = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>BATC News</title>`;
            allItems.forEach(i => {
                xmlRes += `<item>`;
                xmlRes += `<title>${sanitizePango(i.title)}</title>`;
                xmlRes += `<description>${sanitizePango(i.description)}</description>`;
                xmlRes += `<sourceLabel>${sanitizePango(i.sourceLabel)}</sourceLabel>`;
                xmlRes += `<link>${sanitizePango(i.link)}</link>`;
                xmlRes += `<pubDate>${i.pubDate.toISOString()}</pubDate>`;
                xmlRes += `<isSilentKey>${i.isSilentKey}</isSilentKey>`;
                xmlRes += `</item>`;
            });
            xmlRes += `</channel></rss>`;
            res.writeHead(200, { 'Content-Type': 'application/xml' });
            return res.end(xmlRes);
        } catch (e) { res.writeHead(500); return res.end("News fail: " + e.message); }
    }

    if (url.pathname === '/api/doorbell' && req.method === 'POST') {
        if(speechAnnounceVisitors || doorbellAnnounceVisitors)
        {
            let body = '';
            
            req.on('data', chunk => { 
                body += chunk.toString(); 
            });

            req.on('end', () => {
                try {
                    const params = new URLSearchParams(body);
                    const name = params.get('name') || 'Visitor';
                    const audioPath = `${MAIN_DIR}/doorbell.mp3`;

                    console.log(`[DOORBELL] Triggered by: ${name}`);

                    if(doorbellAnnounceVisitors) {
                        if (!fs.existsSync(audioPath)) {
                            console.error(`[DOORBELL ERR] File not found at: ${audioPath}`);
                            res.writeHead(404);
                            return res.end("Audio file missing");
                        }
                    }

                    if(doorbellAnnounceVisitors) {
                        console.log(`[DOORBELL] Attempting to play: ${audioPath}`);
                        const ffplayCmd = `ffplay -nodisp -autoexit "${audioPath}"`;
                        exec(ffplayCmd);
                    }

                    if(speechAnnounceVisitors) {
                        const speechCmd = `${speechCommand} -a ${speechAmplitude} "${name} is visiting your B A T C livestream"`;
                        exec(`${speechCmd}`, (error, stdout, stderr) => {
                            if (error) {
                                console.error(`[SPEECH PROCESS CRASH]: ${error.message}`);
                            }
                        });
                    }

                } catch (e) {
                    console.error("[DOORBELL PARSE ERR]", e);
                }
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end("OK");
            });
            return;
        }
    }

    if (url.pathname === '/api/debug-item' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try {
                const payload = JSON.parse(body), filePath = MAIN_DIR + '/debug-item.json';
                const entry = { _debug_time: new Date().toISOString(), ...payload };
                if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
                    fs.writeFileSync(filePath, "[" + JSON.stringify(entry, null, 4) + "]");
                } else {
                    let content = fs.readFileSync(filePath, 'utf8').trim();
                    if (content.endsWith(']')) content = content.slice(0, -1);
                    fs.writeFileSync(filePath, content + ",\n" + JSON.stringify(entry, null, 4) + "]");
                }
            } catch (e) { console.error("[DEBUG ERR]", e); }
            res.writeHead(200); res.end("OK");
        });
        return;
    }

    if (url.pathname === '/api/update-news-qr') {
        const targetUrl = url.searchParams.get('url');
        if (targetUrl) {
            try {
                await QRCode.toFile(TEMP_NEWS_QR_PATH, targetUrl, { width: 300, margin: 1, errorCorrectionLevel: 'H' });
                await fs.promises.rename(TEMP_NEWS_QR_PATH, NEWS_QR_PATH);
                res.writeHead(200); return res.end("OK");
            } catch (err) { res.writeHead(500); return res.end("QR Fail"); }
        }
        res.writeHead(400); return res.end("Missing URL");
    }

    function escapeHtml(text) {
        if (!text) return "";
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    /**
     * Server-side version of your callsign check.
     * Ensures the username contains a valid amateur radio prefix/pattern.
     */
    function isCallsign(name) {
        if (!name) return false;
        // Remove the [unverified] tag if present, then clean
        const clean = escapeHtml(name.toUpperCase().trim());
        const parts = clean.split(/[\s_\-]+/);
        return parts.some(p => /^[A-Z]{1,2}\d[A-Z0-9]*/.test(p));
    }

    /**
     * Extracts the callsign from a string (e.g., "Greg M0ODZ" -> "M0ODZ")
     */
    function getCallsignFromExtra(name) {
        if (!name) return null;
        const clean = escapeHtml(name.toUpperCase().trim());
        const parts = clean.split(/[\s_\-]+/);
        // Find the part that matches the callsign regex
        return parts.find(p => /^[A-Z]{1,2}\d[A-Z0-9]*/.test(p)) || null;
    }

    // --- STORE ENDPOINT (!sendmail) ---
    if (url.pathname === '/api/store' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const { from, to, msg } = JSON.parse(body);
                const senderCall = getCallsignFromExtra(from);
                const targetCall = getCallsignFromExtra(to);

                if (!senderCall || !targetCall || !msg) {
                    res.writeHead(400);
                    res.end("Invalid callsign data");
                    return;
                }

                // CLEAN THE MESSAGE BEFORE SAVING
                const cleanMsg = escapeHtml(msg);

                let db = {};
                if (fs.existsSync(FORWARD_MESSAGES_FILE)) {
                    const content = fs.readFileSync(FORWARD_MESSAGES_FILE, 'utf8').trim();
                    if (content.length > 0) {
                        try {
                            db = JSON.parse(content);
                        } catch (e) {
                            db = {};
                        }
                    }
                }

                if (!db[targetCall]) db[targetCall] = [];
                db[targetCall].push({ 
                    from: senderCall, 
                    msg: cleanMsg, 
                    time: new Date().toISOString() 
                });

                fs.writeFileSync(FORWARD_MESSAGES_FILE, JSON.stringify(db, null, 4));
                res.writeHead(200); 
                res.end("OK");
            } catch (e) {
                res.writeHead(400); 
                res.end("Error");
            }
        });
        return;
    }

    // --- FORWARD/RETRIEVE ENDPOINT ---
    if (url.pathname === '/api/forward' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const { user } = JSON.parse(body);
                const targetCall = getCallsignFromExtra(user);

                if (!targetCall) {
                    res.writeHead(400);
                    res.end(JSON.stringify([]));
                    return;
                }

                let msgs = [];
                if (fs.existsSync(FORWARD_MESSAGES_FILE)) {
                    const content = fs.readFileSync(FORWARD_MESSAGES_FILE, 'utf8').trim();
                    if (content.length > 0) {
                        let db = JSON.parse(content);
                        if (db[targetCall]) {
                            msgs = db[targetCall];
                            delete db[targetCall];
                            fs.writeFileSync(FORWARD_MESSAGES_FILE, JSON.stringify(db, null, 4));
                        }
                    }
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(msgs));
            } catch (e) {
                res.writeHead(400); res.end("Error");
            }
        });
        return;
    }

    // --- CHECK MESSAGES ENDPOINT ---
    if (url.pathname === '/api/checkmessages' && req.method === 'GET') {
        const user = new URL(req.url, `http://${req.headers.host}`).searchParams.get("user");
        const targetCall = getCallsignFromExtra(user);
        
        if (!targetCall) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ count: 0 }));
            return;
        }

        try {
            if (fs.existsSync(FORWARD_MESSAGES_FILE)) {
                const content = fs.readFileSync(FORWARD_MESSAGES_FILE, 'utf8').trim();
                if (content.length > 0) {
                    const db = JSON.parse(content);
                    const count = db[targetCall] ? db[targetCall].length : 0;
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ count }));
                    return;
                }
            }
            res.end(JSON.stringify({ count: 0 }));
        } catch (e) {
            res.end(JSON.stringify({ count: 0 }));
        }
        return;
    }


    if (url.pathname === '/' || url.pathname === '/control') {
        fs.readFile(path.join(__dirname, 'control.html'), 'utf8', (err, data) => {
            if (err) { res.writeHead(500); return res.end("Error"); }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
        return;
    }
    res.writeHead(404); res.end("Not Found");
});

server.listen(PORT, () => console.log(`Jukebox Server running on port ${PORT}`));