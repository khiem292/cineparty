"use client";

import { parseMediaInput } from "./urlParser";

// Domains/patterns that are verified PURE video players (never full websites)
const PURE_PLAYER_PATTERNS = [
  /player\.phimapi\.com/i,
  /opstream/i,
  /goatembed/i,
  /player\.vimeo\.com/i,
  /dailymotion\.com\/embed/i,
  /drive\.google\.com\/file\/d\/[^/]+\/preview/i,
  /ok\.ru\/videoembed/i,
  /player\.bilibili\.com/i,
  /facebook\.com\/plugins\/video\.php/i,
  /youtube\.com\/embed/i,
  /vidsrc/i,
  /filemoon\.[^/]+\/e\//i,
  /streamtape\.[^/]+\/e\//i,
  /dood[^/]*\.[^/]+\/e\//i,
  /mixdrop\.[^/]+\/e\//i,
  /hydrax/i,
  /play\.ophim/i,
  /embed\./i,
  /\/embed\//i,
  /\/player\//i,
];

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

export function isPurePlayerUrl(urlStr) {
  if (!urlStr) return false;
  return PURE_PLAYER_PATTERNS.some((pat) => pat.test(urlStr));
}

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
    return u.toString();
  } catch {
    return urlStr;
  }
}

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
          extractedMethod: "Luồng video thuần (.m3u8)",
        };
      }
      if (/^https?:\/\/.+\.(mp4|webm)(\?.*)?$/i.test(decoded)) {
        return {
          type: "video",
          url: decoded,
          sandbox: false,
          extractedMethod: "File video gốc (.mp4)",
        };
      }
    }
  } catch {}
  return null;
}

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
      const timeout = setTimeout(() => controller.abort(), 5000);
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

/**
 * Extract clean movie title candidates from webpage <title> or og:title
 * e.g. "Phim Gả Kim Thoa / Gả trâm vàng Tập 1 Vietsub - Rophim" -> ["Gả Kim Thoa", "Gả trâm vàng"]
 */
function extractTitleCandidatesFromHtml(html) {
  if (!html) return [];
  const rawTitles = [];

  const ogMatch = html.match(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i
  );
  if (ogMatch && ogMatch[1]) rawTitles.push(ogMatch[1]);

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch && titleMatch[1]) rawTitles.push(titleMatch[1]);

  const candidates = [];
  for (const raw of rawTitles) {
    // Decode basic HTML entities
    const decoded = raw
      .replace(/&amp;/g, "&")
      .replace(/&#039;/g, "'")
      .replace(/&quot;/g, '"');

    // Split by |, -, /, –
    const parts = decoded.split(/\s*(?:\||\/|-|–|—)\s*/);
    for (let part of parts) {
      part = part
        .replace(/^(?:xem\s+phim|phim)\s+/i, "")
        .replace(/\s+(?:tập|tap|ep)\s*\d+.*$/i, "")
        .replace(
          /\s+(?:vietsub|thuyết\s*minh|lồng\s*tiếng|full\s*hd|hd|trọn\s*bộ|mới\s*nhất|\(\d{4}\)).*$/i,
          ""
        )
        .trim();

      if (
        part.length >= 2 &&
        part.length <= 60 &&
        !/^(rophim|motchill|phimmoi|subnhanh|chillhay|kkphim|ophim|trang chủ)/i.test(
          part
        )
      ) {
        if (!candidates.includes(part)) {
          candidates.push(part);
        }
      }
    }
  }
  return candidates;
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
      extractedMethod: "Luồng video gốc (.m3u8)",
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
      extractedMethod: "File video gốc (.mp4)",
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
      extractedMethod: "Khung trình phát (Player)",
    };
  }

  // D. Inner <iframe src="..."> (ONLY accept verified player iframes)
  const iframeRegex = /<iframe[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = iframeRegex.exec(html)) !== null) {
    let src = match[1].trim();
    if (!src) continue;
    if (IGNORED_IFRAME_PATTERNS.some((pat) => pat.test(src))) continue;

    try {
      const resolved = new URL(src, baseUrl).href;
      const queryStream = extractStreamFromQueryParams(resolved);
      if (queryStream) return queryStream;

      if (isPurePlayerUrl(resolved)) {
        return {
          type: "iframe",
          url: resolved,
          sandbox: true,
          extractedMethod: "Khung trình phát (Player)",
        };
      }
    } catch {}
  }

  return null;
}

/**
 * Clean movie slug and episode number from ANY Vietnamese movie URL
 * Supports Rophim (e.g. /xem-phim/ga-kim-thoa.p12345?ep=2), Motchill, Phimmoi, Subnhanh, etc.
 */
function extractMovieSlugAndEpisode(urlStr) {
  try {
    const u = new URL(urlStr);

    let episodeNum = 1;
    // Check query params ?ep=2, ?tap=2, ?episode=2
    const epQuery =
      u.searchParams.get("ep") ||
      u.searchParams.get("tap") ||
      u.searchParams.get("episode");
    if (epQuery && /^\d+$/.test(epQuery)) {
      episodeNum = parseInt(epQuery, 10) || 1;
    }

    const segments = u.pathname
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.replace(/\.(html|htm|php)$/i, ""));

    if (segments.length === 0) return null;

    for (const seg of segments) {
      const epMatch = seg.match(/(?:^|-)(?:tap|ep|episode)-?(\d+)/i);
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
      "quoc-gia",
      "the-loai",
    ]);

    const meaningful = segments.filter(
      (s) =>
        !ignoreWords.has(s.toLowerCase()) && !/^(?:tap|ep)-?\d+$/i.test(s)
    );

    if (meaningful.length === 0) return null;

    let rawSlug = meaningful[meaningful.length - 1];
    // 1. Strip Rophim's .XXXXX ID suffix (e.g. "ga-kim-thoa.AbCdEf" -> "ga-kim-thoa")
    rawSlug = rawSlug.split(".")[0];
    // 2. Strip "-tap-1..." suffix
    rawSlug = rawSlug.replace(/-(?:tap|ep|episode)-\d+.*$/i, "");
    // 3. Also create a version without trailing numeric ID (e.g. "ga-kim-thoa-18492" -> "ga-kim-thoa")
    const slugWithoutTrailingId = rawSlug.replace(/-[a-z0-9]{5,}$/i, "").replace(/-\d{3,}$/, "");

    return {
      slug: rawSlug,
      cleanSlug: slugWithoutTrailingId || rawSlug,
      episodeNum,
    };
  } catch {
    return null;
  }
}

/**
 * Parse NguonC API response format (phim.nguonc.com)
 */
function pickEpisodeFromNguonCData(data, episodeNum = 1) {
  const movie = data?.movie;
  const episodesGroups = movie?.episodes;
  if (!Array.isArray(episodesGroups) || episodesGroups.length === 0) return null;

  const items = episodesGroups[0]?.items;
  if (!Array.isArray(items) || items.length === 0) return null;

  const targetIndex = Math.max(0, Math.min(items.length - 1, episodeNum - 1));
  const matchedEp =
    items.find((ep) => {
      const m = (ep.slug || ep.name || "").match(/(\d+)/);
      return m && parseInt(m[1], 10) === episodeNum;
    }) || items[targetIndex];

  if (!matchedEp) return null;

  const allEpisodes = items.map((ep, idx) => ({
    name: ep.name ? `Tập ${ep.name}` : `Tập ${idx + 1}`,
    slug: ep.slug || `${idx + 1}`,
    link_m3u8: ep.m3u8 || "",
    link_embed: ep.embed || "",
  }));

  if (matchedEp.m3u8) {
    return {
      type: "hls",
      url: matchedEp.m3u8,
      sandbox: false,
      movieTitle: `${movie.name || "Phim"} — Tập ${matchedEp.name || episodeNum}`,
      episodes: allEpisodes,
      currentEpisodeIndex: items.indexOf(matchedEp),
      extractedMethod: "Luồng video thuần (.m3u8)",
    };
  }

  if (matchedEp.embed) {
    const queryStream = extractStreamFromQueryParams(matchedEp.embed);
    if (queryStream) {
      return {
        ...queryStream,
        movieTitle: `${movie.name || "Phim"} — Tập ${matchedEp.name || episodeNum}`,
        episodes: allEpisodes,
        currentEpisodeIndex: items.indexOf(matchedEp),
      };
    }
    return {
      type: "iframe",
      url: matchedEp.embed,
      sandbox: true,
      movieTitle: `${movie.name || "Phim"} — Tập ${matchedEp.name || episodeNum}`,
      episodes: allEpisodes,
      currentEpisodeIndex: items.indexOf(matchedEp),
      extractedMethod: "Khung trình phát (Player)",
    };
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
      extractedMethod: "Luồng video thuần (.m3u8)",
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
      extractedMethod: "Khung trình phát (Player)",
    };
  }

  return null;
}

/**
 * Query KKPhim (phimapi.com), OPhim (ophim1.com), and NguonC (phim.nguonc.com)
 * by slug or keyword to get a 100% pure video stream!
 */
export async function lookupMovieStreamBySlugOrKeyword(
  slugOrQuery,
  episodeNum = 1
) {
  if (!slugOrQuery) return null;
  const cleanSlug = slugOrQuery
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

  // 1. Direct slug lookup across all 3 CDNs in parallel
  if (cleanSlug.length >= 2 && !slugOrQuery.includes(" ")) {
    try {
      const results = await Promise.allSettled([
        fetch(`https://phimapi.com/phim/${encodeURIComponent(cleanSlug)}`).then(
          (r) => (r.ok ? r.json() : null)
        ),
        fetch(`https://ophim1.com/phim/${encodeURIComponent(cleanSlug)}`).then(
          (r) => (r.ok ? r.json() : null)
        ),
        fetch(
          `https://phim.nguonc.com/api/film/${encodeURIComponent(cleanSlug)}`
        ).then((r) => (r.ok ? r.json() : null)),
      ]);

      for (let i = 0; i < results.length; i++) {
        if (results[i].status === "fulfilled" && results[i].value) {
          const data = results[i].value;
          const parsed =
            i === 2
              ? pickEpisodeFromNguonCData(data, episodeNum)
              : pickEpisodeFromApiData(data, episodeNum);
          if (parsed && parsed.type === "hls") return parsed;
          if (parsed) return parsed;
        }
      }
    } catch {}
  }

  // 2. Keyword search across KKPhim, OPhim, and NguonC
  const keyword = slugOrQuery.replace(/-/g, " ").trim();
  if (keyword.length < 2) return null;

  // 2a. KKPhim search
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

  // 2b. NguonC search
  try {
    const searchRes = await fetch(
      `https://phim.nguonc.com/api/films/search?keyword=${encodeURIComponent(
        keyword
      )}`
    );
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const items = searchData?.items || [];
      if (items.length > 0 && items[0].slug) {
        const detailRes = await fetch(
          `https://phim.nguonc.com/api/film/${items[0].slug}`
        );
        if (detailRes.ok) {
          const detailData = await detailRes.json();
          const parsed = pickEpisodeFromNguonCData(detailData, episodeNum);
          if (parsed) return parsed;
        }
      }
    }
  } catch {}

  // 2c. OPhim search
  try {
    const searchRes = await fetch(
      `https://ophim1.com/v1/api/tim-kiem?keyword=${encodeURIComponent(
        keyword
      )}&limit=5`
    );
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const items = searchData?.data?.items || [];
      if (items.length > 0 && items[0].slug) {
        const detailRes = await fetch(
          `https://ophim1.com/phim/${items[0].slug}`
        );
        if (detailRes.ok) {
          const detailData = await detailRes.json();
          const parsed = pickEpisodeFromApiData(detailData, episodeNum);
          if (parsed) return parsed;
        }
      }
    }
  } catch {}

  return null;
}

export async function searchMoviesByKeyword(keyword) {
  if (!keyword || !keyword.trim()) return [];
  const q = keyword.trim();
  const combined = [];
  const seenSlugs = new Set();

  try {
    const [kkRes, ncRes] = await Promise.allSettled([
      fetch(
        `https://phimapi.com/v1/api/tim-kiem?keyword=${encodeURIComponent(
          q
        )}&limit=8`
      ).then((r) => (r.ok ? r.json() : null)),
      fetch(
        `https://phim.nguonc.com/api/films/search?keyword=${encodeURIComponent(
          q
        )}`
      ).then((r) => (r.ok ? r.json() : null)),
    ]);

    if (kkRes.status === "fulfilled" && kkRes.value) {
      const data = kkRes.value;
      const items = data?.data?.items || [];
      const cdnDomain =
        data?.data?.APP_DOMAIN_CDN_IMAGE || "https://phimimg.com";
      for (const item of items) {
        if (!seenSlugs.has(item.slug)) {
          seenSlugs.add(item.slug);
          combined.push({
            name: item.name,
            origin_name: item.origin_name || "",
            slug: item.slug,
            year: item.year || "",
            episode_current: item.episode_current || "Full",
            quality: item.quality || "HD",
            lang: item.lang || "Vietsub",
            poster: item.poster_url?.startsWith("http")
              ? item.poster_url
              : `${cdnDomain}/${item.poster_url}`,
          });
        }
      }
    }

    if (ncRes.status === "fulfilled" && ncRes.value) {
      const items = ncRes.value?.items || [];
      for (const item of items.slice(0, 6)) {
        if (!seenSlugs.has(item.slug)) {
          seenSlugs.add(item.slug);
          combined.push({
            name: item.name,
            origin_name: item.original_name || "",
            slug: item.slug,
            year: "",
            episode_current: item.current_episode || "Full",
            quality: item.quality || "HD",
            lang: item.language || "Vietsub",
            poster: item.thumb_url || item.poster_url || "",
          });
        }
      }
    }
  } catch {}

  return combined;
}

/**
 * Master function: Resolves ANY user input to ONLY a pure video stream or pure player!
 * NEVER returns a full webpage URL.
 */
export async function resolvePureVideoMedia(rawInput) {
  if (!rawInput || !rawInput.trim()) return null;
  const trimmed = rawInput.trim();

  // Prevent user from accidentally pasting the CineParty invite URL itself into the movie box
  if (
    trimmed.includes("khiem292.github.io/cineparty") ||
    (typeof window !== "undefined" &&
      trimmed.includes(window.location.host) &&
      trimmed.includes("?room="))
  ) {
    return {
      error:
        "Bạn vừa dán link mời phòng CineParty! Hãy dán link bộ phim cần xem hoặc bấm nút Tìm Phim nhé.",
    };
  }

  const looksLikeUrlOrIframe =
    /^https?:\/\//i.test(trimmed) ||
    /<iframe/i.test(trimmed) ||
    /^[a-z0-9-]+\.(com|net|org|vn|io|tv|me|cc|to|xyz|info|biz|top|club|site|online|pro|live|stream|watch|video|gg|ly|be|life|cx|co|ink|fm)\b/i.test(
      trimmed
    );

  // If user typed a movie name directly (e.g. "Gả Kim Thoa tập 2")
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
    return {
      error: `Không tìm thấy phim "${cleanKeyword}". Hãy thử bấm nút Tìm Phim ở góc trên nhé!`,
    };
  }

  const basic = parseMediaInput(trimmed);
  if (!basic) return null;

  // 1. Direct YouTube, .m3u8 (HLS), or .mp4 file
  if (
    basic.type === "youtube" ||
    basic.type === "hls" ||
    basic.type === "video"
  ) {
    return basic;
  }

  // 2. Check if URL has ?url=...m3u8 in query string
  const queryStream = extractStreamFromQueryParams(basic.url);
  if (queryStream) {
    return {
      ...basic,
      ...queryStream,
    };
  }

  // 3. Check if user explicitly pasted an <iframe src="..."> tag or a known pure player URL
  if (/<iframe[^>]+src=/i.test(rawInput) || isPurePlayerUrl(basic.url)) {
    return basic;
  }

  // 4. Check known platforms (Google Drive, Vimeo, Dailymotion, Ok.ru, Bilibili, Facebook Video, Streamtape...)
  const platformPlayer = convertKnownPlatformToPlayerUrl(basic.url);
  if (platformPlayer) {
    return {
      ...basic,
      ...platformPlayer,
    };
  }

  // 5. Extract movie slug & episode from the movie website URL (Rophim, Motchill, Phimmoi, etc.)
  const slugInfo = extractMovieSlugAndEpisode(basic.url);
  if (slugInfo) {
    // Try cleanSlug first (e.g. "ga-kim-thoa")
    const byCleanSlug = await lookupMovieStreamBySlugOrKeyword(
      slugInfo.cleanSlug,
      slugInfo.episodeNum
    );
    if (byCleanSlug) {
      return {
        ...basic,
        ...byCleanSlug,
      };
    }
    if (slugInfo.slug !== slugInfo.cleanSlug) {
      const byRawSlug = await lookupMovieStreamBySlugOrKeyword(
        slugInfo.slug,
        slugInfo.episodeNum
      );
      if (byRawSlug) {
        return {
          ...basic,
          ...byRawSlug,
        };
      }
    }
  }

  // 6. Scrape the webpage HTML via CORS proxy:
  //    a) Check for direct .m3u8 / .mp4 / pure player iframe inside HTML
  //    b) Extract the Vietnamese/English movie title from <title> / og:title and search the 3 Movie APIs!
  const html = await fetchHtmlViaProxy(basic.url);
  if (html) {
    const extracted = extractVideoFromHtml(html, basic.url);
    if (extracted) {
      return {
        ...basic,
        ...extracted,
      };
    }

    const titleCandidates = extractTitleCandidatesFromHtml(html);
    const epNum = slugInfo?.episodeNum || 1;
    for (const candidate of titleCandidates) {
      const byTitle = await lookupMovieStreamBySlugOrKeyword(candidate, epNum);
      if (byTitle) {
        return {
          ...basic,
          ...byTitle,
        };
      }
    }
  }

  // NEVER return the full webpage in an iframe!
  return {
    error:
      "Trang web này khóa mã nguồn video. Bạn hãy nhập thẳng Tên Phim vào ô trên (VD: Gả Kim Thoa) hoặc bấm nút Tìm Phim để phát trực tiếp Video thuần 100% nhé!",
    suggestedQuery: slugInfo?.cleanSlug?.replace(/-/g, " ") || "",
  };
}
