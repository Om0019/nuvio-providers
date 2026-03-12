/**
 * webstreamer-latino - Spanish/Latino streams via public WebStreamr instance
 */
"use strict";

const axios = require('axios');

// Public WebStreamr instance
const WEBSTREAMR_BASE = 'https://webstreamr.hayd.uk';

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        // Construct the URL for WebStreamr
        let streamUrl;
        if (mediaType === 'tv' && season && episode) {
            streamUrl = `${WEBSTREAMR_BASE}/stream/${mediaType}/${tmdbId}:${season}:${episode}.json`;
        } else {
            streamUrl = `${WEBSTREAMR_BASE}/stream/${mediaType}/${tmdbId}.json`;
        }

        const response = await axios.get(streamUrl, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const data = response.data;
        if (!data.streams || !Array.isArray(data.streams)) {
            return [];
        }

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

        return latinoStreams;
    } catch (error) {
        console.error('[WebStreamer Latino] Error fetching streams:', error.message);
        return [];
    }
}

module.exports = { getStreams };
