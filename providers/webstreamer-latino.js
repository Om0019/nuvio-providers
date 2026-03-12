/**
 * webstreamer-latino - Direct scraper for Latin American Spanish streams
 * Targets: HomeCine, CineHDPlus, Cuevana, VerHdLink
 */
"use strict";

const axios = require('axios');
const cheerio = require('cheerio-without-node-native');

// Sources for Latino content
const SOURCES = {
    homecine: { base: 'https://www3.homecine.to', name: 'HomeCine' },
    cinehdplus: { base: 'https://cinehdplus.gratis', name: 'CineHDPlus' },
    cuevana: { base: 'https://ww1.cuevana3.is', name: 'Cuevana' },
    verhdlink: { base: 'https://verhdlink.cam', name: 'VerHdLink' }
};

async function searchHomeCine(title, year) {
    try {
        const searchUrl = `${SOURCES.homecine.base}/?s=${encodeURIComponent(title)}`;
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
            console.log(`[Latino Scraper] Found ${results.length} results on HomeCine for "${title}"`);
            return results[0].href;
        }

        return null;
    } catch (error) {
        console.error(`[Latino Scraper] HomeCine search error:`, error.message);
        return null;
    }
}

async function extractLatinoFromHomeCine(pageUrl) {
    try {
        const response = await axios.get(pageUrl, {
            timeout: 8000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });

        const $ = cheerio.load(response.data);
        const streams = [];

        $('.les-content a').each((i, el) => {
            const text = $(el).text().toLowerCase();
            if (text.includes('latino')) {
                const iframeSrc = $('iframe', el).attr('src');
                if (iframeSrc) {
                    streams.push({
                        name: 'HomeCine Latino',
                        title: text.trim(),
                        url: iframeSrc,
                        headers: { 'Referer': pageUrl, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                    });
                }
            }
        });

        console.log(`[Latino Scraper] HomeCine: ${streams.length} Latino streams`);
        return streams;
    } catch (error) {
        console.error(`[Latino Scraper] HomeCine extraction error:`, error.message);
        return [];
    }
}

async function searchCineHDPlus(title, year, tmdbId) {
    try {
        const searchUrl = `${SOURCES.cinehdplus.base}/series/?story=${tmdbId}&do=search&subaction=search`;
        console.log(`[Latino Scraper] Searching CineHDPlus`);

        const response = await axios.get(searchUrl, {
            timeout: 8000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });

        const $ = cheerio.load(response.data);
        const firstResult = $('.card__title a').first().attr('href');
        if (firstResult) {
            console.log(`[Latino Scraper] Found CineHDPlus result`);
            return firstResult;
        }
        return null;
    } catch (error) {
        console.error(`[Latino Scraper] CineHDPlus search error:`, error.message);
        return null;
    }
}

async function extractLatinoFromCineHDPlus(pageUrl) {
    try {
        const response = await axios.get(pageUrl, {
            timeout: 8000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });

        const $ = cheerio.load(response.data);
        const streams = [];

        // CineHDPlus shows language in details section
        if ($('.details__langs').html()?.includes('Latino')) {
            $('[data-link!=""]').each((i, el) => {
                const url = $(el).attr('data-link');
                if (url && !url.includes(',https')) {
                    streams.push({
                        name: 'CineHDPlus Latino',
                        title: 'CineHDPlus Stream',
                        url: url.replace(/^(https:)?\/\//, 'https://'),
                        headers: { 'Referer': pageUrl, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                    });
                }
            });
        }

        console.log(`[Latino Scraper] CineHDPlus: ${streams.length} Latino streams`);
        return streams;
    } catch (error) {
        console.error(`[Latino Scraper] CineHDPlus extraction error:`, error.message);
        return [];
    }
}

async function searchCuevana(title, year) {
    try {
        const searchUrl = `${SOURCES.cuevana.base}/?s=${encodeURIComponent(title)}`;
        console.log(`[Latino Scraper] Searching Cuevana`);

        const response = await axios.get(searchUrl, {
            timeout: 8000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });

        const $ = cheerio.load(response.data);
        const firstResult = $('a').filter((i, el) => {
            const href = $(el).attr('href');
            return href && (href.includes('/pelicula/') || href.includes('/serie/'));
        }).first().attr('href');

        if (firstResult) {
            console.log(`[Latino Scraper] Found Cuevana result`);
            return firstResult;
        }
        return null;
    } catch (error) {
        console.error(`[Latino Scraper] Cuevana search error:`, error.message);
        return null;
    }
}

async function extractLatinoFromCuevana(pageUrl) {
    try {
        const response = await axios.get(pageUrl, {
            timeout: 8000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });

        const $ = cheerio.load(response.data);
        const streams = [];

        $('a').each((i, el) => {
            const text = $(el).text().toLowerCase();
            if (text.includes('español') && text.includes('latino')) {
                const href = $(el).attr('href');
                if (href) {
                    // Extract iframe from player page
                    streams.push({
                        name: 'Cuevana Latino',
                        title: text.trim(),
                        url: href,
                        headers: { 'Referer': pageUrl, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                    });
                }
            }
        });

        console.log(`[Latino Scraper] Cuevana: ${streams.length} Latino streams`);
        return streams;
    } catch (error) {
        console.error(`[Latino Scraper] Cuevana extraction error:`, error.message);
        return [];
    }
}

async function extractLatinoFromVerHdLink(pageUrl) {
    try {
        const response = await axios.get(pageUrl, {
            timeout: 8000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });

        const $ = cheerio.load(response.data);
        const streams = [];

        $('.\_player-mirrors').each((i, el) => {
            const classes = $(el).attr('class') || '';
            // Only extract latino mirrors
            if (classes.includes('latino')) {
                $('[data-link!=""]', el).each((j, link) => {
                    const url = $(link).attr('data-link');
                    if (url) {
                        streams.push({
                            name: 'VerHdLink Latino',
                            title: 'VerHdLink Stream',
                            url: url.replace(/^(https:)?\/\//, 'https://'),
                            headers: { 'Referer': pageUrl, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                        });
                    }
                });
            }
        });

        console.log(`[Latino Scraper] VerHdLink: ${streams.length} Latino streams`);
        return streams;
    } catch (error) {
        console.error(`[Latino Scraper] VerHdLink extraction error:`, error.message);
        return [];
    }
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
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

        let allStreams = [];

        // Try HomeCine
        const homecineUrl = await searchHomeCine(title, year);
        if (homecineUrl) {
            const streams = await extractLatinoFromHomeCine(homecineUrl);
            allStreams = allStreams.concat(streams);
        }

        // Try CineHDPlus (works better with TMDB ID)
        const cinehdplusUrl = await searchCineHDPlus(title, year, tmdbId);
        if (cinehdplusUrl) {
            const streams = await extractLatinoFromCineHDPlus(cinehdplusUrl);
            allStreams = allStreams.concat(streams);
        }

        // Try Cuevana
        const cuevanaUrl = await searchCuevana(title, year);
        if (cuevanaUrl) {
            const streams = await extractLatinoFromCuevana(cuevanaUrl);
            allStreams = allStreams.concat(streams);
        }

        console.log(`[Latino Scraper] Total Latino streams found: ${allStreams.length}`);
        return allStreams;

    } catch (error) {
        console.error(`[Latino Scraper] Error in getStreams:`, error.message);
        return [];
    }
}

module.exports = { getStreams };
