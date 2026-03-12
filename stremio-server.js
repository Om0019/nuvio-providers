const fs = require('fs');
const path = require('path');
const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");

const TIMEOUT_MS = 15000;
const providers = [];
const pDir = path.join(__dirname, 'providers');
const allowed = ['uhdmovies', 'vixsrc', 'vidlink'];

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

            return {
                name: `Nuvio: ${s.name || "Source"}`,
                title: s.title || "Stream",
                url: s.url,
                headers: finalHeaders,
                subtitles: s.subtitles || [],
                behaviorHints: {
                    notWebReady: true,
                    proxyHeaders: {
                        request: finalHeaders
                    }
                }
            };
        });

    console.log(`🚀 Sending ${streams.length} streams to Nuvio`);
    return { streams };
});

serveHTTP(builder.getInterface(), { port: 7010 });
