var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));

const axios = require("axios");
console.log("[NetMirror] Initializing NetMirror provider");
const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const NETMIRROR_BASE = "https://netmirror.live";
const NETMIRROR_PLAY = "https://netmirror.live";
const BASE_HEADERS = {
  "X-Requested-With": "XMLHttpRequest",
  "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
};

function getStreams(tmdbId, type, season, episode) {
  console.log("[NetMirror] getStreams called:", { tmdbId, type, season, episode });
  let globalCookie = "";
  
  return axios.post(`${NETMIRROR_PLAY}/tv/p.php`, null, {
    headers: __spreadValues(__spreadValues({}, BASE_HEADERS), {
      "Referer": `${NETMIRROR_BASE}/`
    })
  }).then(function(response) {
    const setCookie = response.headers["set-cookie"];
    console.log("[NetMirror] p.php status:", response.status);
    console.log("[NetMirror] headers:", response.headers);
    console.log("[NetMirror] set-cookie:", setCookie);
    
    if (setCookie) {
      const match = setCookie[0].match(/t_hash_t=([^;]+)/);
      if (match) {
        globalCookie = match[1];
      }
    }
    
    const platforms = ["netflix", "disney", "prime", "hulu", "apple", "hbo"];
    
    function tryPlatform(platformIndex) {
      if (platformIndex >= platforms.length) {
        return Promise.resolve([]);
      }
      const platform = platforms[platformIndex];
      console.log("[NetMirror] trying platform:", platform);
      
      const cookieString = `t_hash_t=${globalCookie}; ott=nf; hd=on`;
      
      function trySearch(useAlt) {
        console.log(`[NetMirror] Trying search with platform: ${platform}`);
        console.log(`[NetMirror] Request URL: ${NETMIRROR_PLAY}/tv/s.php`);
        return axios.get(`https://api.themoviedb.org/3/${type === "series" || type === "tv" ? "tv" : "movie"}/${tmdbId}?api_key=${TMDB_API_KEY}`).then(function(tmdbRes) {
          const year = type === "series" || type === "tv" ? tmdbRes.data.first_air_date ? tmdbRes.data.first_air_date.split("-")[0] : "" : tmdbRes.data.release_date ? tmdbRes.data.release_date.split("-")[0] : "";
          const titleToSearch = useAlt && tmdbRes.data.original_name ? tmdbRes.data.original_name : tmdbRes.data.name || tmdbRes.data.title;
          
          const body = new URLSearchParams();
          body.append("t", tmdbId);
          if (type === "tv" || type === "series") {
            body.append("s", season || "");
            body.append("e", episode || "");
          }
          body.append("p", platform);
          
          return axios.post(`${NETMIRROR_PLAY}/tv/s.php`, body.toString(), {
            headers: __spreadValues(__spreadValues({}, BASE_HEADERS), {
              "Content-Type": "application/x-www-form-urlencoded",
              "Referer": `${NETMIRROR_BASE}/`,
              "Cookie": cookieString
            })
          }).then(function(res) {
            if (!res) {
              console.error('[NetMirror] No response received');
              return null;
            }
            
            if (res.status === 404) {
              console.error(`[NetMirror] Endpoint not found: ${res.config.url}`);
              return null; 
            }

            if (!res.data) {
              console.error('[NetMirror] No data in response');
              return null;
            }

            console.log('[NetMirror] Response data:', res.data);
            
            if (res.data?.status === "success" && Array.isArray(res.data.streams)) {
              console.log("[NetMirror] stream count:", res.data.streams.length);
              
              const streams = res.data.streams
                .filter(stream => stream && stream.url)
                .map(function(stream) {
                  let streamTitle = (stream.title || "NetMirror") + (Array.isArray(stream.extra) ? " [" + stream.extra.map((l) => l.name).join("/") + "]" : "");
                  return {
                    name: "NetMirror",
                    title: streamTitle,
                    url: stream.url,
                    quality: stream.quality || "HD",
                    subtitles: stream.subtitles || [],
                    headers: {
                      "User-Agent": BASE_HEADERS["User-Agent"],
                      "Referer": `${NETMIRROR_BASE}/`,
                      "Cookie": cookieString
                    }
                  };
                });
                
              streams.sort((a, b) => {
                if (a.quality.toLowerCase() === "auto" && b.quality.toLowerCase() !== "auto") {
                  return -1;
                }
                if (b.quality.toLowerCase() === "auto" && a.quality.toLowerCase() !== "auto") {
                  return 1;
                }
                const parseQuality = (quality) => {
                  const match = quality.match(/(\d{3,4})p/i);
                  return match ? parseInt(match[1], 10) : 0;
                };
                const qualityA = parseQuality(a.quality);
                const qualityB = parseQuality(b.quality);
                return qualityB - qualityA;
              });
              
              console.log(`[NetMirror] Successfully processed ${streams.length} streams from ${platform}`);
              return streams;
            }
            return null; // Passes to the next catch block if nothing was found
          });
        });
      }
      
      return trySearch(false).then(function(result) {
        if (result && result.length > 0) {
          console.log(`[NetMirror] Found ${result.length} streams on ${platform}`);
          return result;
        } else {
          console.log(`[NetMirror] No content found on ${platform}, status ${res?.status}, data:`, res?.data);
          return tryPlatform(platformIndex + 1);
        }
      }).catch(function(error) {
        console.error(`[NetMirror] platform failed:`, platform, error.message);
        return tryPlatform(platformIndex + 1);
      });
    }
    
    return tryPlatform(0);
  }).catch(function(error) {
    console.error(`[NetMirror] Error in getStreams: ${error.message}`);
    return [];
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
