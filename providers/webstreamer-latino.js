/**
 * webstreamer-latino - Direct scraper for Latin American Spanish streams
 * Targets: HomeCine, CineHDPlus for Latino content
 */
"use strict";

const axios = require('axios');
const cheerio = require('cheerio-without-node-native');

// HomeCine source for Latino content
const HOMECINE_BASE = 'https://www3.homecine.to';

async function searchHomeCine(title, year) {
    try {
        const searchUrl = `${HOMECINE_BASE}/?s=${encodeURIComponent(title)}`;
        console.log(`[Latino Scraper] Searching HomeCine: ${searchUrl}`);

        const response = await axios.get(searchUrl, {
            timeout: 8000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        const results = [];

        $('a.Selectable').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim();
            if (href && text) {
                results.push({ href, title: text });
            }
        });

        if (results.length > 0) {
            console.log(`[Latino Scraper] Found ${results.length} results for "${title}"`);
            return results[0].href; // Return first match
        }

        return null;
    } catch (error) {
        console.error(`[Latino Scraper] Search error:`, error.message);
        return null;
    }
}

async function extractLatinoStreams(pageUrl) {
    try {
        console.log(`[Latino Scraper] Fetching page: ${pageUrl}`);

        const response = await axios.get(pageUrl, {
            timeout: 8000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        const streams = [];

        // Find all player links and filter for Latino ones
        $('.les-content a').each((i, el) => {
            const text = $(el).text().toLowerCase();

            // Only extract Latino streams
            if (text.includes('latino')) {
                try {
                    const iframeSrc = $('iframe', el).attr('src');
                    if (iframeSrc) {
                        streams.push({
                            name: 'HomeCine Latino',
                            title: text.trim(),
                            url: iframeSrc,
                            headers: {
                                'Referer': pageUrl,
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                            }
                        });
                    }
                } catch (e) {
                    // Skip invalid entries
                }
            }
        });

        console.log(`[Latino Scraper] Extracted ${streams.length} Latino streams from page`);
        return streams;
    } catch (error) {
        console.error(`[Latino Scraper] Extraction error:`, error.message);
        return [];
    }
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        // Fetch TMDB info to get title and year
        const tmdbUrl = `https://api.themoviedb.org/3/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}?api_key=68e094699525b18a70bab2f86b1fa706`;

        const tmdbResponse = await axios.get(tmdbUrl, { timeout: 5000 });
        const tmdbData = tmdbResponse.data;

        let title = mediaType === 'tv' ? tmdbData.name : tmdbData.title;
        let year = mediaType === 'tv' 
            ? tmdbData.first_air_date?.substring(0, 4)
            : tmdbData.release_date?.substring(0, 4);

        if (!title) {
            console.log(`[Latino Scraper] Could not get title for TMDB ${tmdbId}`);
            return [];
        }

        console.log(`[Latino Scraper] Looking for "${title}" (${year})`);

        // Search HomeCine
        const pageUrl = await searchHomeCine(title, year);
        if (!pageUrl) {
            console.log(`[Latino Scraper] No results found for "${title}"`);
            return [];
        }

        // Extract Latino streams
        const streams = await extractLatinoStreams(pageUrl);
        return streams;

    } catch (error) {
        console.error(`[Latino Scraper] Error in getStreams:`, error.message);
        return [];
    }
}

module.exports = { getStreams };
