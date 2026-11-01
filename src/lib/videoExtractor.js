"use client";

import { parseMediaInput } from "./urlParser";

const IGNORED_IFRAME_PATTERNS = [
  /facebook\.com\/plugins\/(like|comments|page)/i,
  /disqus\.com/i,
  /google\.com\/recaptcha/i,
  /googletagmanager\.com/i,
  /doubleclick\.net/i,
  /googlesyndication\.com/i,
  /exoclick/i,
  /adsterra/i,
  /popads/i,
  /propellerads/i,
  /about:blank/i,
  /javascript:/i,
];

const PLAYER_IFRAME_KEYWORDS = [
  "embed",
  "player",
  "video",
  "stream",
  "play",
  "cloud",
  "hydrax",
  "ok.ru",
  "vimeo",
  "dailymotion",
  "youtube",
  "drive.google",
  "phim",
  "opstream",
  "goat",
  "vidsrc",
  "filemoon",
  "dood",
  "streamtape",
  "mixdrop",
  "hls",
  "m3u8",
  "vip",
];

/**
 * Append start timestamp to iframe player URLs for late joiners
 */
export function appendStartTimeToIframeUrl(urlStr, seconds) {
  const sec = Math.floor(seconds || 0);
  if (!urlStr || sec <= 3) return urlStr;

  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();

    if (host.includes("vimeo.com")) {
      u.hash = `t=${sec}s`;
      return u.toString();
    }
    if (host.includes("dailymotion.com")) {
      u.searchParams.set("start", String(sec));
      u.searchParams.set("autoplay", "1");
      return u.toString();
    }
    if (host.includes("bilibili.com")) {
      u.searchParams.set("t", String(sec));
      u.searchParams.set("autoplay", "1");
      return u.toString();
    }
    if (host.includes("ok.ru")) {
      u.searchParams.set("fromTime", String(sec));
      u.searchParams.set("autoplay", "1");
      return u.toString();
    }
    // Generic embed players often support ?t= or ?start= and autoplay=1
    if (!u.searchParams.has("t") && !u.searchParams.has("start")) {
      u.searchParams.set("autoplay", "1");
      u.searchParams.set("t", String(sec));
    }
    return u.toString();
  } catch {
    return urlStr;
  }
}

/**
 * Check if a URL has a direct .m3u8 or .mp4 link embedded in its query parameters
 * (e.g., https://player.phimapi.com/player/?url=https://.../index.m3u8)
 */
function extractStreamFromQueryParams(urlStr) {
  try {
    const u = new URL(urlStr);
    for (const [, val] of u.searchParams.entries()) {
      const decoded = decodeURIComponent(val || "");
      if (/^https?:\/\/.+\.m3u8(\?.*)?$/i.test(decoded)) {
        return {
          type: "hls",
          url: decoded,
          sandbox: false,
          extractedMethod: "Luồng video thuần (.m3u8 tự đồng bộ)",
        };
      }
      if (/^https?:\/\/.+\.(mp4|webm)(\?.*)?$/i.test(decoded)) {
        return {
          type: "video",
          url: decoded,
          sandbox: false,
          extractedMethod: "File video gốc (.mp4 tự đồng bộ)",
        };
      }
    }
  } catch {}
  return null;
}

/**
 * Convert known webpage URLs directly into pure video player URLs
 */
export function convertKnownPlatformToPlayerUrl(urlStr) {
  const fromQuery = extractStreamFromQueryParams(urlStr);
  if (fromQuery) return fromQuery;

  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();

    if (host.includes("drive.google.com")) {
      const match = u.pathname.match(/\/file\/d\/([^/]+)/);
      if (match && match[1]) {
        return {
          type: "iframe",
          url: `https://drive.google.com/file/d/${match[1]}/preview`,
          sandbox: false,
        };
      }
    }

    if (host === "vimeo.com" || host === "www.vimeo.com") {
      const match = u.pathname.match(/^\/(\d+)/);
      if (match && match[1]) {
        return {
          type: "iframe",
          url: `https://player.vimeo.com/video/${match[1]}?autoplay=1`,
          sandbox: false,
        };
      }
    }

    if (host.includes("dailymotion.com")) {
      const match = u.pathname.match(/\/video\/([a-zA-Z0-9]+)/);
      if (match && match[1]) {
        return {
          type: "iframe",
          url: `https://www.dailymotion.com/embed/video/${match[1]}?autoplay=1`,
          sandbox: false,
        };
      }
    }
    if (host === "dai.ly") {
      const id = u.pathname.slice(1).split("/")[0];
      if (id) {
        return {
          type: "iframe",
          url: `https://www.dailymotion.com/embed/video/${id}?autoplay=1`,
          sandbox: false,
        };
      }
    }

    if (host.includes("ok.ru")) {
      const match = u.pathname.match(/\/video\/(\d+)/);
      if (match && match[1]) {
        return {
          type: "iframe",
          url: `https://ok.ru/videoembed/${match[1]}?autoplay=1`,
          sandbox: false,
        };
      }
    }

    if (host.includes("bilibili.com")) {
      const match = u.pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/i);
      if (match && match[1]) {
        return {
          type: "iframe",
          url: `https://player.bilibili.com/player.html?bvid=${match[1]}&high_quality=1&autoplay=1`,
          sandbox: true,
        };
      }
    }

    if (host.includes("facebook.com") && u.pathname.includes("/videos/")) {
      return {
        type: "iframe",
        url: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(
          urlStr
        )}&show_text=false&autoplay=true`,
        sandbox: false,
      };
    }

    if (
      host.includes("streamtape") ||
      host.includes("dood") ||
      host.includes("filemoon") ||
      host.includes("mixdrop")
    ) {
      const convertedPath = u.pathname.replace(/^\/(v|d|f)\//, "/e/");
      return {
        type: "iframe",
        url: `${u.origin}${convertedPath}${u.search}`,
        sandbox: true,
      };
    }
  } catch {}

  return null;
}

async function fetchHtmlViaProxy(targetUrl) {
  const proxies = [
    (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ];

  for (const buildProxyUrl of proxies) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(buildProxyUrl(targetUrl), {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) continue;

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = await res.json();
        if (
          data &&
          typeof data.contents === "string" &&
          data.contents.length > 100
        ) {
          return data.contents;
        }
      } else {
        const text = await res.text();
        if (text && text.length > 100) {
          return text;
        }
      }
    } catch {}
  }
  return null;
}

function extractVideoFromHtml(html, baseUrl) {
  if (!html) return null;

  const unescaped = html.replace(/\\\//g, "/");

  // A. Direct .m3u8 stream URLs
  const m3u8Regex = /(https?:\/\/[^\s"'<>\\]+\.m3u8(?:\?[^\s"'<>\\]*)?)/gi;
  const m3u8Matches = [...unescaped.matchAll(m3u8Regex)].map((m) => m[1]);
  if (m3u8Matches.length > 0) {
    const bestM3u8 =
      m3u8Matches.find((u) => !u.includes("trailer")) || m3u8Matches[0];
    return {
      type: "hls",
      url: bestM3u8,
      sandbox: false,
      extractedMethod: "Luồng video gốc (.m3u8 tự đồng bộ)",
    };
  }

  // B. Direct .mp4 video URLs
  const mp4Regex = /(https?:\/\/[^\s"'<>\\]+\.mp4(?:\?[^\s"'<>\\]*)?)/gi;
  const mp4Matches = [...unescaped.matchAll(mp4Regex)]
    .map((m) => m[1])
    .filter((u) => !u.includes("ad") && !u.includes("banner"));
  if (mp4Matches.length > 0) {
    return {
      type: "video",
      url: mp4Matches[0],
      sandbox: false,
      extractedMethod: "File video gốc (.mp4 tự đồng bộ)",
    };
  }

  // C. Look for link_embed in embedded JSON
  const embedJsonMatch = unescaped.match(
    /"(?:link_embed|embed_url|embedUrl|iframe_url|player_url)"\s*:\s*"(https?:\/\/[^"]+)"/i
  );
  if (embedJsonMatch && embedJsonMatch[1]) {
    const embedUrl = embedJsonMatch[1];
    const queryStream = extractStreamFromQueryParams(embedUrl);
    if (queryStream) return queryStream;
    return {
      type: "iframe",
      url: embedUrl,
      sandbox: true,
      extractedMethod: "Trình phát nhúng (Player)",
    };
  }

  // D. Inner <iframe src="...">
  const iframeRegex = /<iframe[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*>/gi;
  const candidates = [];
  let match;
  while ((match = iframeRegex.exec(html)) !== null) {
    let src = match[1].trim();
    if (!src) continue;
    if (IGNORED_IFRAME_PATTERNS.some((pat) => pat.test(src))) continue;

    try {
      const resolved = new URL(src, baseUrl).href;
      const queryStream = extractStreamFromQueryParams(resolved);
      if (queryStream) return queryStream;

      let score = 0;
      const lower = resolved.toLowerCase();
      for (const kw of PLAYER_IFRAME_KEYWORDS) {
        if (lower.includes(kw)) score += 2;
      }
      if (match[0].toLowerCase().includes("allowfullscreen")) score += 3;
      candidates.push({ url: resolved, score });
    } catch {}
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score);
    return {
      type: "iframe",
      url: candidates[0].url,
      sandbox: true,
      extractedMethod: "Khung trình phát (Player Iframe)",
    };
  }

  return null;
}

function extractMovieSlugAndEpisode(urlStr) {
  try {
    const u = new URL(urlStr);
    const segments = u.pathname
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.replace(/\.(html|htm|php)$/i, ""));

    if (segments.length === 0) return null;

    let episodeNum = 1;
    for (const seg of segments) {
      const epMatch = seg.match(/(?:tap|ep|episode)-?(\d+)/i);
      if (epMatch && epMatch[1]) {
        episodeNum = parseInt(epMatch[1], 10) || 1;
      }
    }

    const ignoreWords = new Set([
      "phim",
      "xem-phim",
      "xemphim",
      "watch",
      "movie",
      "movies",
      "thong-tin",
      "chi-tiet",
      "vietsub",
      "thuyet-minh",
    ]);

    const meaningful = segments.filter(
      (s) =>
        !ignoreWords.has(s.toLowerCase()) && !/^(?:tap|ep)-?\d+$/i.test(s)
    );

    if (meaningful.length === 0) return null;

    let rawSlug = meaningful[meaningful.length - 1];
    rawSlug = rawSlug.replace(/-(?:tap|ep)-\d+.*$/i, "");

    return { slug: rawSlug, episodeNum };
  } catch {
    return null;
  }
}

export async function lookupMovieStreamBySlugOrKeyword(
  slugOrQuery,
  episodeNum = 1
) {
  // 1. Try direct slug on KKPhim API (phimapi.com/phim/{slug})
  try {
    const res = await fetch(
      `https://phimapi.com/phim/${encodeURIComponent(slugOrQuery)}`
    );
    if (res.ok) {
      const data = await res.json();
      const parsed = pickEpisodeFromApiData(data, episodeNum);
      if (parsed) return parsed;
    }
  } catch {}

  // 2. Try direct slug on OPhim API (ophim1.com/phim/{slug})
  try {
    const res = await fetch(
      `https://ophim1.com/phim/${encodeURIComponent(slugOrQuery)}`
    );
    if (res.ok) {
      const data = await res.json();
      const parsed = pickEpisodeFromApiData(data, episodeNum);
      if (parsed) return parsed;
    }
  } catch {}

  // 3. Try searching KKPhim by keyword derived from slug
  const keyword = slugOrQuery.replace(/-/g, " ").trim();
  if (keyword.length >= 2) {
    try {
      const searchRes = await fetch(
        `https://phimapi.com/v1/api/tim-kiem?keyword=${encodeURIComponent(
          keyword
        )}&limit=5`
      );
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const items = searchData?.data?.items || [];
        if (items.length > 0 && items[0].slug) {
          const detailRes = await fetch(
            `https://phimapi.com/phim/${items[0].slug}`
          );
          if (detailRes.ok) {
            const detailData = await detailRes.json();
            const parsed = pickEpisodeFromApiData(detailData, episodeNum);
            if (parsed) return parsed;
          }
        }
      }
    } catch {}
  }

  return null;
}

function pickEpisodeFromApiData(data, episodeNum = 1) {
  const episodesGroups = data?.episodes;
  const movieInfo = data?.movie;
  if (!Array.isArray(episodesGroups) || episodesGroups.length === 0)
    return null;

  const serverData = episodesGroups[0]?.server_data;
  if (!Array.isArray(serverData) || serverData.length === 0) return null;

  const targetIndex = Math.max(
    0,
    Math.min(serverData.length - 1, episodeNum - 1)
  );
  const matchedEp =
    serverData.find((ep) => {
      const m = (ep.slug || ep.name || "").match(/(\d+)/);
      return m && parseInt(m[1], 10) === episodeNum;
    }) || serverData[targetIndex];

  if (!matchedEp) return null;

  const allEpisodes = serverData.map((ep, idx) => ({
    name: ep.name || `Tập ${idx + 1}`,
    slug: ep.slug || `${idx + 1}`,
    link_m3u8: ep.link_m3u8 || "",
    link_embed: ep.link_embed || "",
  }));

  if (matchedEp.link_m3u8) {
    return {
      type: "hls",
      url: matchedEp.link_m3u8,
      sandbox: false,
      movieTitle: `${movieInfo?.name || "Phim"} — ${matchedEp.name || ""}`,
      episodes: allEpisodes,
      currentEpisodeIndex: serverData.indexOf(matchedEp),
      extractedMethod: "Luồng video thuần (.m3u8 tự đồng bộ)",
    };
  }

  if (matchedEp.link_embed) {
    const queryStream = extractStreamFromQueryParams(matchedEp.link_embed);
    if (queryStream) {
      return {
        ...queryStream,
        movieTitle: `${movieInfo?.name || "Phim"} — ${matchedEp.name || ""}`,
        episodes: allEpisodes,
        currentEpisodeIndex: serverData.indexOf(matchedEp),
      };
    }
    return {
      type: "iframe",
      url: matchedEp.link_embed,
      sandbox: true,
      movieTitle: `${movieInfo?.name || "Phim"} — ${matchedEp.name || ""}`,
      episodes: allEpisodes,
      currentEpisodeIndex: serverData.indexOf(matchedEp),
      extractedMethod: "Trình phát thuần (Player Embed)",
    };
  }

  return null;
}

export async function searchMoviesByKeyword(keyword) {
  if (!keyword || !keyword.trim()) return [];
  try {
    const res = await fetch(
      `https://phimapi.com/v1/api/tim-kiem?keyword=${encodeURIComponent(
        keyword.trim()
      )}&limit=8`
    );
    if (!res.ok) return [];
    const data = await res.json();
    const items = data?.data?.items || [];
    const cdnDomain = data?.data?.APP_DOMAIN_CDN_IMAGE || "https://phimimg.com";
    return items.map((item) => ({
      name: item.name,
      origin_name: item.origin_name,
      slug: item.slug,
      year: item.year,
      episode_current: item.episode_current,
      quality: item.quality,
      lang: item.lang,
      poster: item.poster_url?.startsWith("http")
        ? item.poster_url
        : `${cdnDomain}/${item.poster_url}`,
    }));
  } catch {
    return [];
  }
}

export async function resolvePureVideoMedia(rawInput) {
  if (!rawInput || !rawInput.trim()) return null;
  const trimmed = rawInput.trim();

  const looksLikeUrlOrIframe =
    /^https?:\/\//i.test(trimmed) ||
    /<iframe/i.test(trimmed) ||
    /^[a-z0-9-]+\.(com|net|org|vn|io|tv|me|cc|to|xyz|info|biz|top|club|site|online|pro|live|stream|watch|video|gg|ly|be)\b/i.test(
      trimmed
    );

  if (!looksLikeUrlOrIframe) {
    let epNum = 1;
    const epMatch = trimmed.match(/(?:tập|tap|ep)\s*(\d+)/i);
    if (epMatch && epMatch[1]) {
      epNum = parseInt(epMatch[1], 10) || 1;
    }
    const cleanKeyword = trimmed.replace(/(?:tập|tap|ep)\s*\d+/i, "").trim();
    const byKeyword = await lookupMovieStreamBySlugOrKeyword(
      cleanKeyword,
      epNum
    );
    if (byKeyword) {
      return {
        rawInput: trimmed,
        ...byKeyword,
      };
    }
  }

  const basic = parseMediaInput(trimmed);
  if (!basic) return null;

  if (
    basic.type === "youtube" ||
    basic.type === "hls" ||
    basic.type === "video"
  ) {
    return basic;
  }

  // Check if URL has ?url=...m3u8
  const queryStream = extractStreamFromQueryParams(basic.url);
  if (queryStream) {
    return {
      ...basic,
      ...queryStream,
    };
  }

  if (/<iframe[^>]+src=/i.test(rawInput)) {
    return basic;
  }

  // Step 1: Try looking up movie slug first on Vietnamese movie APIs so we get a 100% syncable .m3u8 stream!
  const slugInfo = extractMovieSlugAndEpisode(basic.url);
  if (slugInfo && slugInfo.slug && slugInfo.slug.length >= 3) {
    const apiStream = await lookupMovieStreamBySlugOrKeyword(
      slugInfo.slug,
      slugInfo.episodeNum
    );
    if (apiStream && apiStream.type === "hls") {
      return {
        ...basic,
        ...apiStream,
      };
    }
  }

  // Step 2: Check known platforms (Google Drive, Vimeo, Dailymotion, Ok.ru, Bilibili...)
  const platformPlayer = convertKnownPlatformToPlayerUrl(basic.url);
  if (platformPlayer) {
    return {
      ...basic,
      ...platformPlayer,
    };
  }

  // Step 3: Scrape target webpage HTML for .m3u8, .mp4, or inner player <iframe>
  const html = await fetchHtmlViaProxy(basic.url);
  if (html) {
    const extracted = extractVideoFromHtml(html, basic.url);
    if (extracted) {
      // If extracted is an iframe, also try once to see if that iframe page contains a raw .m3u8!
      if (extracted.type === "iframe" && extracted.url) {
        const innerHtml = await fetchHtmlViaProxy(extracted.url);
        if (innerHtml) {
          const innerExtracted = extractVideoFromHtml(innerHtml, extracted.url);
          if (
            innerExtracted &&
            (innerExtracted.type === "hls" || innerExtracted.type === "video")
          ) {
            return {
              ...basic,
              ...innerExtracted,
            };
          }
        }
      }
      return {
        ...basic,
        ...extracted,
      };
    }
  }

  return basic;
}
