const fs = require('fs');
const path = require('path');
const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const express = require('express'); // used later when attaching proxy route

const TIMEOUT_MS = 15000;
const providers = [];
const pDir = path.join(__dirname, 'providers');
const allowed = ['uhdmovies', 'vixsrc', 'vidlink', 'netmirror'];

if (fs.existsSync(pDir)) {
    fs.readdirSync(pDir).forEach(f => {
        const base = f.replace('.js', '');
        console.log(`Found provider file: ${f}`);

        if (allowed.includes(base)) {
            try {
                const p = require(path.join(pDir, f));
                if (p.getStreams) {
                    providers.push({ name: base, getStreams: p.getStreams });
                    console.log(`Loaded provider: ${base}`);
                } else {
                    console.log(`Skipped ${base}: no getStreams`);
                }
            } catch (e) {
                console.error(`Failed loading ${base}:`, e.message);
            }
        } else {
            console.log(`Not allowed: ${base}`);
        }
    });
}

console.log("Loaded providers:", providers.map(p => p.name));

// helper for proxying requests through this addon
// we don't know the exact host+port the client will use until the addon
// actually starts, so `ADDON_BASE` is initialized once the server listens.
// until then the function will fall back to a relative path (still valid
// for local testing) or localhost if necessary.
let ADDON_BASE = ''; // populated later
let LAST_HOST = '';    // updated by middleware for each incoming request

function proxyWrap(url, headers) {
    const encodedUrl = encodeURIComponent(url);
    const encodedHeaders = encodeURIComponent(JSON.stringify(headers || {}));
    const path = `/proxy?url=${encodedUrl}&headers=${encodedHeaders}`;

    // if we know the client's host (e.g. remote device), prefer that
    if (LAST_HOST && !LAST_HOST.startsWith('127.0.0.1')) {
        return `http://${LAST_HOST}${path}`;
    }

    // otherwise use the ADDON_BASE we computed earlier (usually localhost)
    if (ADDON_BASE) {
        return `${ADDON_BASE}${path}`;
    }

    // fallback to last host even if it's localhost (or blank path)
    if (LAST_HOST) {
        return `http://${LAST_HOST}${path}`;
    }

    return path;
}

const builder = new addonBuilder({
    id: "org.stremio.nuvio.om019",
    version: "61.0.0",
    name: "Nuvio Server Patched",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: []
});

builder.defineStreamHandler(async ({ type, id }) => {
    console.log('[stream handler] LAST_HOST =', LAST_HOST, 'ADDON_BASE =', ADDON_BASE);
    const [imdbId, season, episode] = id.split(":");
    let tmdbId = null;
    try {
        const { data } = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`);
        tmdbId = data.meta.moviedb_id;
    } catch (e) {}
    
    if (!tmdbId) return { streams: [] };

    // Convert series to tv
    const mediaType = type === "series" ? "tv" : "movie";
    const promises = providers.map(p => p.getStreams(tmdbId, mediaType, season, episode).catch(() => []));

    const results = await Promise.race([
        Promise.all(promises),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), TIMEOUT_MS))
    ]).catch(() => []);

    const streams = (Array.isArray(results) ? results.flat() : [])
        .filter(s => s && s.url)
        .map(s => {
            const providerHeaders = s.headers || {};
            
            // Merge provider headers directly (keeps the correct Referer and Cookie from Netmirror)
            const finalHeaders = {
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
                ...providerHeaders
            };

            // route the stream through our local proxy so that headers/cookies are
            // consistently applied even for playlist/segment requests
            const proxiedUrl = proxyWrap(s.url, finalHeaders);

            return {
                name: `Nuvio: ${s.name || "Source"}`,
                title: s.title || "Stream",
                url: proxiedUrl,
                subtitles: s.subtitles || [],
                behaviorHints: {
                    notWebReady: true
                }
            };
        });

    console.log(`🚀 Sending ${streams.length} streams to Nuvio`);
    return { streams };
});

// we build our own express server instead of using serveHTTP so we can
// register middleware ahead of the stremio router.  This allows us to capture
// the `Host` header from the client before the stream handler runs (needed for
// proper absolute URLs when the addon is accessed remotely).
function startServer(addonInterface, opts = {}) {
    const cacheMaxAge = opts.cacheMaxAge || opts.cache;
    if (cacheMaxAge > 365 * 24 * 60 * 60)
        console.warn('cacheMaxAge set to more then 1 year, be advised that cache times are in seconds, not milliseconds.');

    const app = express();

    // record host header early for use in stream handler
    app.use((req, res, next) => {
        if (req.headers && req.headers.host) {
            LAST_HOST = req.headers.host;
        }
        next();
    });

    // cache-control (copied from serveHTTP)
    app.use((_, res, next) => {
        if (cacheMaxAge && !res.getHeader('Cache-Control'))
            res.setHeader('Cache-Control', 'max-age=' + cacheMaxAge + ', public');
        next();
    });

    app.use(require('stremio-addon-sdk').getRouter(addonInterface));

    if (opts.static) {
        const location = path.join(process.cwd(), opts.static);
        if (!fs.existsSync(location)) throw new Error('directory to serve does not exist');
        app.use(opts.static, express.static(location));
    }

    const hasConfig = !!(addonInterface.manifest.config || []).length;
    const landingHTML = require('stremio-addon-sdk/src/landingTemplate')(addonInterface.manifest);
    app.get('/', (_, res) => {
        if (hasConfig) {
            res.redirect('/configure');
        } else {
            res.setHeader('content-type', 'text/html');
            res.end(landingHTML);
        }
    });
    if (hasConfig)
        app.get('/configure', (_, res) => {
            res.setHeader('content-type', 'text/html');
            res.end(landingHTML);
        });

    // bind to a host if provided; default to 0.0.0.0 for cloud environments
    const host = opts.host || '0.0.0.0';
    const server = app.listen(opts.port, host);
    return new Promise((resolve, reject) => {
        server.on('listening', () => {
            const url = `http://127.0.0.1:${server.address().port}/manifest.json`;
            console.log('HTTP addon accessible at:', url);
            resolve({ url, server });
        });
        server.on('error', reject);
    });
}

// allow the port to be specified by the environment (Render, Heroku, etc.)
const PORT = process.env.PORT || 7010;

startServer(builder.getInterface(), { port: PORT }).then(({ server, url }) => {
    ADDON_BASE = url.replace(/\/manifest\.json$/, '');
    console.log('addon base url:', ADDON_BASE);

    const app = server._events.request;

    app.get('/proxy', async (req, res) => {
        try {
            const targetUrl = req.query.url && decodeURIComponent(req.query.url);
            if (!targetUrl) return res.status(400).send('missing url');
            let headers = {};
            if (req.query.headers) {
                try {
                    headers = JSON.parse(decodeURIComponent(req.query.headers));
                } catch (e) {
                    console.error('proxy: failed to parse headers', e.message);
                }
            }

            const resp = await axios.get(targetUrl, {
                headers,
                responseType: 'stream',
                timeout: 10000
            });

            // copy status and headers
            res.status(resp.status);
            Object.entries(resp.headers).forEach(([k, v]) => res.setHeader(k, v));

            const contentType = (resp.headers['content-type'] || '').toLowerCase();
            const isPlaylist = contentType.includes('mpegurl') || targetUrl.endsWith('.m3u8');
            if (isPlaylist) {
                let data = '';
                resp.data.on('data', chunk => data += chunk.toString());
                resp.data.on('end', () => {
                    // Get base URL for resolving relative paths
                    const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
                    
                    // rewrite playlist lines: both absolute URLs and relative paths
                    const rewritten = data.split('\n').map(line => {
                        const trimmed = line.trim();
                        
                        // skip comments and empty lines
                        if (!trimmed || trimmed.startsWith('#')) return line;
                        
                        // determine the absolute URL to proxy
                        let urlToProxy = '';
                        
                        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
                            // already absolute
                            urlToProxy = trimmed;
                        } else if (trimmed.startsWith('/')) {
                            // absolute path - reconstruct with base domain
                            const baseUrlObj = new URL(baseUrl);
                            urlToProxy = baseUrlObj.protocol + '//' + baseUrlObj.host + trimmed;
                        } else {
                            // relative path - resolve against baseUrl
                            urlToProxy = new URL(trimmed, baseUrl).href;
                        }
                        
                        // don't re-wrap URLs that are already proxied
                        if (urlToProxy.includes('/proxy?')) return line;
                        
                        // wrap through proxy
                        const eurl = encodeURIComponent(urlToProxy);
                        const eheaders = encodeURIComponent(JSON.stringify(headers));
                        let prefix = '';
                        if (LAST_HOST && !LAST_HOST.startsWith('127.0.0.1')) {
                            prefix = `http://${LAST_HOST}`;
                        } else if (ADDON_BASE) {
                            prefix = ADDON_BASE;
                        } else if (LAST_HOST) {
                            prefix = `http://${LAST_HOST}`;
                        }
                        return `${prefix}/proxy?url=${eurl}&headers=${eheaders}`;
                    }).join('\n');
                    
                    res.send(rewritten);
                });
            } else {
                resp.data.pipe(res);
            }
        } catch (err) {
            console.error('proxy error', err && err.message);
            res.status(500).send('proxy error');
        }
    });
});
