/**
 * webstreamer-latino - Spanish/Latino streams via public WebStreamr instance
 */
"use strict";

const axios = require('axios');

// Public WebStreamr instance
const WEBSTREAMR_BASE = 'https://webstreamr.hayd.uk';

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        // WebStreamr public instance only reliably supports movies
        if (mediaType !== 'movie') {
            console.log(`[WebStreamer Latino] Skipping TV show (${tmdbId}) - public instance only supports movies`);
            return [];
        }

        const streamUrl = `${WEBSTREAMR_BASE}/stream/movie/${tmdbId}.json`;

        console.log(`[WebStreamer Latino] Fetching: ${streamUrl}`);

        const response = await axios.get(streamUrl, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            }
        });

        const data = response.data;
        if (!data.streams || !Array.isArray(data.streams)) {
            console.log(`[WebStreamer Latino] No streams in response for movie ${tmdbId}`);
            return [];
        }

        console.log(`[WebStreamer Latino] Found ${data.streams.length} streams, filtering for latino...`);

        // Filter for Latin American Spanish (Latino) streams only
        const latinoStreams = data.streams
            .filter(stream => {
                if (!stream.title) return false;
                const lowerTitle = stream.title.toLowerCase();
                // Include only Latino streams (Latin American Spanish), exclude Castilian
                return lowerTitle.includes('latino');
            })
            .map(stream => ({
                name: 'WebStreamer',
                title: stream.title || 'WebStreamer Stream',
                url: stream.url,
                headers: {
                    'Referer': WEBSTREAMR_BASE,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                subtitles: stream.subtitles || []
            }));

        console.log(`[WebStreamer Latino] Returning ${latinoStreams.length} latino streams`);
        return latinoStreams;
    } catch (error) {
        const status = error.response?.status || 'unknown';
        console.error(`[WebStreamer Latino] Error fetching streams (${status}):`, error.message);
        return [];
    }
}

module.exports = { getStreams };
