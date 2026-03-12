const fs = require('fs');
const path = require('path');
const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");

const providersDir = path.join(__dirname, 'providers');
const loadedProviders = [];
const allowedProviders = ['uhdmovies', 'netmirror', 'vixsrc', 'vidlink'];

if (fs.existsSync(providersDir)) {
    const files = fs.readdirSync(providersDir).filter(file => file.endsWith('.js'));
    for (const file of files) {
        const baseName = file.toLowerCase().replace('.js', '');
        if (allowedProviders.includes(baseName)) {
            try {
                const provider = require(path.join(providersDir, file));
                if (typeof provider.getStreams === 'function') {
                    loadedProviders.push({ name: file.replace('.js', ''), getStreams: provider.getStreams });
                }
            } catch (err) {}
        }
    }
}

const manifest = {
    id: "org.stremio.nuvio.om0019.bridge",
    version: "18.0.0",
    name: "Nuvio Final Bridge",
    description: "Cookie & Header Passthrough for Netmirror",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: []
};

const builder = new addonBuilder(manifest);

async function getTmdbId(imdbId, type) {
    try {
        const url = `https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`;
        const { data } = await axios.get(url);
        if (data && data.meta && data.meta.moviedb_id) return data.meta.moviedb_id;
    } catch (err) {}
    return null;
}

builder.defineStreamHandler(async ({ type, id }) => {
    const idParts = id.split(":");
    const imdbId = idParts[0];
    const season = idParts.length > 1 ? idParts[1] : undefined;
    const episode = idParts.length > 2 ? idParts[2] : undefined;
    const mediaType = type === "series" ? "tv" : "movie";

    const tmdbId = await getTmdbId(imdbId, mediaType);
    if (!tmdbId) return { streams: [] };

    const streamPromises = loadedProviders.map(async (provider) => {
        try {
            const streams = await provider.getStreams(tmdbId, mediaType, season, episode);
            if (!streams) return [];

            return streams.map(stream => {
                const providerHeaders = stream.headers || {};
                let host = "";

                try {
                    host = new URL(stream.url).hostname.toLowerCase();
                } catch (e) { return null; }

                // Detection for Netmirror specifically
                const isNetmirror = host.includes("net52.cc") || host.includes("net22.cc") || host.includes("netmirror");

                // Default headers - specifically for iOS/Nuvio
                const finalHeaders = {
                    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
                    ...providerHeaders // This injects your Cookie and Referer from netmirror.js
                };

                // Safety: Ensure Netmirror uses the provider's Referer if set, or a safe fallback
                if (isNetmirror && !finalHeaders.Referer) {
                    finalHeaders.Referer = "https://net22.cc/";
                }

                // Log output to terminal for your verification
                if (isNetmirror) {
                    console.log("[NETMIRROR OUT]", {
                        url: stream.url,
                        cookie: finalHeaders.Cookie ? "FOUND" : "MISSING",
                        referer: finalHeaders.Referer
                    });
                }

                return {
                    name: `Nuvio: ${provider.name}`,
                    title: `${stream.title || "Movie"}\n${stream.quality || ""}`,
                    url: stream.url,
                    headers: finalHeaders,
                    subtitles: stream.subtitles || [],
                    behaviorHints: {
                        notWebReady: true,
                        proxyHeaders: { request: finalHeaders }
                    }
                };
            }).filter(s => s !== null);
        } catch (error) {
            return [];
        }
    });

    const results = await Promise.all(streamPromises);
    return { streams: results.flat() };
});

const port = 7010;
serveHTTP(builder.getInterface(), { port });
console.log(`🚀 Server Running on Port: ${port}`);
