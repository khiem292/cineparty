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
  /juicyads/i,
  /trafficjunky/i,
  /plugrush/i,
  /adsterra/i,
  /popads/i,
  /propellerads/i,
  /a-ads\.com/i,
  /magsrv\.com/i,
  /realsrv\.com/i,
  /syndication\.realsrv/i,
  /about:blank/i,
  /^data:/i,
  /^javascript:/i,
  /twitter\.com\/widgets/i,
  /accounts\.google\.com/i,
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
  "peertube",
  "rumble",
  "odysee",
  "twitch",
  "tiktok",
  "jav",
  "vlxx",
  "sex",
  "xvideos",
  "pornhub",
  "xnxx",
  "spankbang",
  "eporner",
  "streamlare",
  "voe",
  "lulustream",
  "turboviplay",
  "vtube",
  "fastplay",
  "helvid",
];

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
          extractedMethod: "Luồng video gốc (.m3u8)",
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
          isPurePlayer: true,
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
          isPurePlayer: true,
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
          isPurePlayer: true,
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
          isPurePlayer: true,
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
          isPurePlayer: true,
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
          isPurePlayer: true,
          sandbox: true,
        };
      }
    }
    if (host.includes("bilibili.tv")) {
      const match = u.pathname.match(/\/(?:video|play)\/(\d+)/i);
      if (match && match[1]) {
        return {
          type: "iframe",
          url: `https://www.bilibili.tv/en/embed/${match[1]}`,
          isPurePlayer: true,
          sandbox: true,
        };
      }
    }

    if (host.includes("tiktok.com")) {
      const match = u.pathname.match(/\/video\/(\d+)/);
      if (match && match[1]) {
        return {
          type: "iframe",
          url: `https://www.tiktok.com/embed/v2/${match[1]}`,
          isPurePlayer: true,
          sandbox: false,
        };
      }
    }

    if (host.includes("twitch.tv")) {
      const parentHost =
        typeof window !== "undefined" ? window.location.hostname : "localhost";
      const vidMatch = u.pathname.match(/\/videos\/(\d+)/);
      if (vidMatch && vidMatch[1]) {
        return {
          type: "iframe",
          url: `https://player.twitch.tv/?video=${vidMatch[1]}&parent=${parentHost}&autoplay=true`,
          isPurePlayer: true,
          sandbox: false,
        };
      }
      const chan = u.pathname.slice(1).split("/")[0];
      if (chan) {
        return {
          type: "iframe",
          url: `https://player.twitch.tv/?channel=${chan}&parent=${parentHost}&autoplay=true`,
          isPurePlayer: true,
          sandbox: false,
        };
      }
    }

    if (
      (host.includes("facebook.com") || host.includes("fb.watch")) &&
      (u.pathname.includes("/videos/") ||
        u.pathname.includes("/watch") ||
        u.pathname.includes("/reel/"))
    ) {
      return {
        type: "iframe",
        url: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(
          urlStr
        )}&show_text=false&autoplay=true`,
        isPurePlayer: true,
        sandbox: false,
      };
    }

    if (
      host.includes("streamtape") ||
      host.includes("dood") ||
      host.includes("filemoon") ||
      host.includes("mixdrop") ||
      host.includes("lulustream") ||
      host.includes("voe.sx")
    ) {
      const convertedPath = u.pathname.replace(/^\/(v|d|f)\//, "/e/");
      return {
        type: "iframe",
        url: `${u.origin}${convertedPath}${u.search}`,
        isPurePlayer: true,
        sandbox: true,
      };
    }
  } catch {}

  return null;
}

/**
 * Race 4 public CORS proxies in parallel so fetching HTML from ANY site succeeds reliably
 */
async function fetchHtmlViaProxy(targetUrl) {
  const proxyBuilders = [
    async () => {
      const r = await fetch(
        `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`
      );
      if (!r.ok) throw new Error("Failed");
      const d = await r.json();
      if (!d?.contents || d.contents.length < 100) throw new Error("Empty");
      return d.contents;
    },
    async () => {
      const r = await fetch(
        `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`
      );
      if (!r.ok) throw new Error("Failed");
      const text = await r.text();
      if (!text || text.length < 100) throw new Error("Empty");
      return text;
    },
    async () => {
      const r = await fetch(
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(
          targetUrl
        )}`
      );
      if (!r.ok) throw new Error("Failed");
      const text = await r.text();
      if (!text || text.length < 100) throw new Error("Empty");
      return text;
    },
    async () => {
      const r = await fetch(
        `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`
      );
      if (!r.ok) throw new Error("Failed");
      const text = await r.text();
      if (!text || text.length < 100) throw new Error("Empty");
      return text;
    },
  ];

  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), 6500)
    );
    return await Promise.race([
      Promise.any(proxyBuilders.map((fn) => fn())),
      timeoutPromise,
    ]);
  } catch {
    return null;
  }
}

/**
 * Build a sanitized, ad-free, video-isolated HTML document (`srcDoc`) from a webpage's HTML.
 * Physically strips popup ads, banners, headers, menus, footers, and locks ONLY the video player to 100vw x 100vh!
 */
export function buildIsolatedVideoSrcDoc(html, originalUrl) {
  if (!html) return null;
  let originUrl = originalUrl;
  try {
    const u = new URL(originalUrl);
    originUrl = `${u.origin}/`;
  } catch {}

  const isolatorInjection = `
<base href="${originUrl}" />
<style id="cineparty-video-isolator-style">
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    overflow: hidden !important;
    background: #000 !important;
  }
  /* Hide all website chrome, menus, headers, footers, comments, and popup ad containers */
  header, nav, footer, aside,
  .header, .navbar, .nav, .footer, .sidebar, .comments, .comment-section,
  .related-movies, .movie-info, .breadcrumb, .ads, .banner, .popup, .modal,
  [class*="popup"], [class*="modal"], [class*="banner"], [class*="quang-cao"], [class*="qc-"],
  [id*="popup"], [id*="modal"], [id*="banner"], [id*="quang-cao"], [id*="qc-"],
  #header, #navbar, #footer, #sidebar, #comments {
    display: none !important;
    opacity: 0 !important;
    pointer-events: none !important;
    width: 0 !important;
    height: 0 !important;
  }
  .cineparty-isolated-target {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    max-width: 100vw !important;
    max-height: 100vh !important;
    z-index: 2147483647 !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #000 !important;
    border: none !important;
    transform: none !important;
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
    pointer-events: auto !important;
  }
</style>
<script>
(function() {
  const SELECTORS = [
    'video',
    'iframe[allowfullscreen]',
    'iframe[src*="embed"]',
    'iframe[src*="player"]',
    'iframe[src*="stream"]',
    'iframe[data-src]',
    'iframe[data-litespeed-src]',
    '.jwplayer',
    '.artplayer-app',
    '.plyr',
    '.video-js',
    '.dplayer',
    '.fluid_video_wrapper',
    '#player',
    '#video-player',
    '#watch-player',
    '#media-player',
    '.player-wrapper',
    '.responsive-player',
    '.video-container',
    '.watch-player',
    '[id*="player"]',
    '[class*="player-container"]'
  ];

  function nukeAdsAndIsolatePlayer() {
    // 1. Activate lazy-loaded iframes if present
    document.querySelectorAll('iframe').forEach((ifr) => {
      const lazySrc =
        ifr.getAttribute('data-litespeed-src') ||
        ifr.getAttribute('data-lazy-src') ||
        ifr.getAttribute('data-src');
      if (lazySrc && (!ifr.src || ifr.src === 'about:blank' || ifr.src.startsWith('data:'))) {
        ifr.src = lazySrc;
      }
    });

    // 2. Find the main video/player element
    let targetPlayer = null;
    for (const sel of SELECTORS) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        const rect = el.getBoundingClientRect();
        if (
          el.tagName === 'VIDEO' ||
          el.tagName === 'IFRAME' ||
          (rect.width >= 180 && rect.height >= 100)
        ) {
          targetPlayer = el;
          break;
        }
      }
      if (targetPlayer) break;
    }

    if (targetPlayer) {
      if (!targetPlayer.classList.contains('cineparty-isolated-target')) {
        targetPlayer.classList.add('cineparty-isolated-target');
      }
      // Keep ancestors visible and unclipped, and hide all non-ancestor fixed overlays (popup ads!)
      const ancestors = new Set();
      let p = targetPlayer;
      while (p) {
        ancestors.add(p);
        if (p !== targetPlayer && p !== document.body && p !== document.documentElement) {
          p.style.setProperty('display', 'block', 'important');
          p.style.setProperty('visibility', 'visible', 'important');
          p.style.setProperty('opacity', '1', 'important');
          p.style.setProperty('overflow', 'visible', 'important');
          p.style.setProperty('transform', 'none', 'important');
        }
        p = p.parentElement;
      }

      // Remove any fixed/absolute overlay or ad image that is NOT an ancestor or descendant of targetPlayer
      document.querySelectorAll('body *').forEach((node) => {
        if (ancestors.has(node) || targetPlayer.contains(node)) return;
        const style = window.getComputedStyle(node);
        if (
          style.position === 'fixed' ||
          (style.position === 'absolute' && parseInt(style.zIndex || '0', 10) > 50)
        ) {
          node.remove();
        }
      });
    }
  }

  setInterval(nukeAdsAndIsolatePlayer, 250);
  window.addEventListener('DOMContentLoaded', nukeAdsAndIsolatePlayer);
  window.addEventListener('load', nukeAdsAndIsolatePlayer);
})();
</script>
`;

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => `${match}${isolatorInjection}`);
  }
  return `${isolatorInjection}${html}`;
}

/**
 * Scan webpage HTML for any direct video stream (.m3u8, .mp4, <video>, og:video, schema itemprop)
 * or inner video player <iframe> (including lazy-loaded iframes and Base64/MacCMS configs!)
 */
function extractVideoFromHtml(html, baseUrl) {
  if (!html) return null;

  const unescaped = html.replace(/\\\//g, "/");

  // 1. Check Schema.org / OpenGraph / Twitter Player meta tags (itemprop="contentUrl", itemprop="embedUrl", og:video)
  const metaRegex =
    /<meta[^>]+(?:property|name|itemprop)=["'](?:og:video|og:video:url|og:video:secure_url|twitter:player|twitter:player:stream|contentUrl|embedUrl)["'][^>]+content=["']([^"']+)["']/gi;
  let metaMatch;
  while ((metaMatch = metaRegex.exec(html)) !== null) {
    try {
      const candidateUrl = metaMatch[1].trim();
      if (!candidateUrl || IGNORED_IFRAME_PATTERNS.some((p) => p.test(candidateUrl))) {
        continue;
      }
      const resolvedMeta = new URL(candidateUrl, baseUrl).href;
      if (/\.m3u8(\?.*)?$/i.test(resolvedMeta)) {
        return {
          type: "hls",
          url: resolvedMeta,
          sandbox: false,
          extractedMethod: "Luồng video gốc (.m3u8)",
        };
      }
      if (/\.(mp4|webm)(\?.*)?$/i.test(resolvedMeta)) {
        return {
          type: "video",
          url: resolvedMeta,
          sandbox: false,
          extractedMethod: "File video gốc (.mp4)",
        };
      }
      return {
        type: "iframe",
        url: resolvedMeta,
        isPurePlayer: true,
        sandbox: true,
        extractedMethod: "Trình phát gốc (Player)",
      };
    } catch {}
  }

  // 2. Direct .m3u8 stream URLs in HTML or inline scripts
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

  // 3. Direct <video src="..."> or <source src="..."> tags in HTML
  const videoTagMatch = html.match(
    /<(?:video|source)[^>]+(?:src|data-src)=["']([^"']+\.(?:mp4|webm|m3u8)[^"']*)["']/i
  );
  if (videoTagMatch && videoTagMatch[1]) {
    try {
      const resolvedVid = new URL(videoTagMatch[1].trim(), baseUrl).href;
      return {
        type: resolvedVid.includes(".m3u8") ? "hls" : "video",
        url: resolvedVid,
        sandbox: false,
        extractedMethod: "Thẻ <video> gốc trên trang",
      };
    } catch {}
  }

  // 4. Direct .mp4 video URLs in scripts/configs
  const mp4Regex = /(https?:\/\/[^\s"'<>\\]+\.mp4(?:\?[^\s"'<>\\]*)?)/gi;
  const mp4Matches = [...unescaped.matchAll(mp4Regex)]
    .map((m) => m[1])
    .filter(
      (u) =>
        !u.includes("ad") &&
        !u.includes("banner") &&
        !u.includes("tx88") &&
        !u.includes(" gif")
    );
  if (mp4Matches.length > 0) {
    return {
      type: "video",
      url: mp4Matches[0],
      sandbox: false,
      extractedMethod: "File video gốc (.mp4)",
    };
  }

  // 5. Look for player embed URLs in JSON configs (link_embed, embed_url, player_aaaa, iframe_url, player_url, video_url)
  const embedJsonMatch = unescaped.match(
    /"(?:link_embed|embed_url|embedUrl|iframe_url|player_url|video_url|stream_url)"\s*:\s*"(https?:\/\/[^"]+)"/i
  );
  if (embedJsonMatch && embedJsonMatch[1]) {
    const embedUrl = embedJsonMatch[1];
    const queryStream = extractStreamFromQueryParams(embedUrl);
    if (queryStream) return queryStream;
    return {
      type: "iframe",
      url: embedUrl,
      isPurePlayer: true,
      sandbox: true,
      extractedMethod: "Khung trình phát (Player)",
    };
  }

  // 6. Inspect ALL <iframe ...> tags in HTML (properly supporting lazy-load attributes like data-litespeed-src, data-lazy-src, data-src!)
  const iframeTagRegex = /<iframe\b[^>]*>/gi;
  const candidates = [];
  let tagMatch;
  while ((tagMatch = iframeTagRegex.exec(html)) !== null) {
    const tagStr = tagMatch[0];
    // Extract all candidate src attributes in priority order (lazy attributes first, then src)
    const attrNames = [
      "data-litespeed-src",
      "data-lazy-src",
      "data-src",
      "data-runner-src",
      "src",
    ];
    let chosenSrc = null;
    for (const attr of attrNames) {
      const m = tagStr.match(new RegExp(`\\b${attr}=["']([^"']+)["']`, "i"));
      if (m && m[1]) {
        const val = m[1].trim();
        if (val && !IGNORED_IFRAME_PATTERNS.some((pat) => pat.test(val))) {
          chosenSrc = val;
          break;
        }
      }
    }

    if (!chosenSrc) continue;

    try {
      const resolved = new URL(chosenSrc, baseUrl).href;
      const queryStream = extractStreamFromQueryParams(resolved);
      if (queryStream) return queryStream;

      let score = 1;
      const lower = resolved.toLowerCase();
      for (const kw of PLAYER_IFRAME_KEYWORDS) {
        if (lower.includes(kw)) score += 3;
      }
      if (tagStr.toLowerCase().includes("allowfullscreen")) score += 5;
      candidates.push({ url: resolved, score });
    } catch {}
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score);
    return {
      type: "iframe",
      url: candidates[0].url,
      isPurePlayer: true,
      sandbox: true,
      extractedMethod: "Khung trình phát video (Đã lọc bỏ trang web & quảng cáo)",
    };
  }

  return null;
}

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
    const decoded = raw
      .replace(/&amp;/g, "&")
      .replace(/&#039;/g, "'")
      .replace(/&quot;/g, '"');

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

function extractMovieSlugAndEpisode(urlStr) {
  try {
    const u = new URL(urlStr);

    let episodeNum = 1;
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
      "v",
      "e",
      "play",
    ]);

    const meaningful = segments.filter(
      (s) =>
        !ignoreWords.has(s.toLowerCase()) && !/^(?:tap|ep)-?\d+$/i.test(s)
    );

    if (meaningful.length === 0) return null;

    let rawSlug = meaningful[meaningful.length - 1];
    rawSlug = rawSlug.split(".")[0];
    rawSlug = rawSlug.replace(/-(?:tap|ep|episode)-\d+.*$/i, "");
    const slugWithoutTrailingId = rawSlug
      .replace(/-[a-z0-9]{6,}$/i, "")
      .replace(/-\d{3,}$/, "");

    return {
      slug: rawSlug,
      cleanSlug: slugWithoutTrailingId || rawSlug,
      episodeNum,
    };
  } catch {
    return null;
  }
}

function pickEpisodeFromNguonCData(data, episodeNum = 1) {
  const movie = data?.movie;
  const episodesGroups = movie?.episodes;
  if (!Array.isArray(episodesGroups) || episodesGroups.length === 0)
    return null;

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
      movieTitle: `${movie.name || "Phim"} — Tập ${
        matchedEp.name || episodeNum
      }`,
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
        movieTitle: `${movie.name || "Phim"} — Tập ${
          matchedEp.name || episodeNum
        }`,
        episodes: allEpisodes,
        currentEpisodeIndex: items.indexOf(matchedEp),
      };
    }
    return {
      type: "iframe",
      url: matchedEp.embed,
      isPurePlayer: true,
      sandbox: true,
      movieTitle: `${movie.name || "Phim"} — Tập ${
        matchedEp.name || episodeNum
      }`,
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
      isPurePlayer: true,
      sandbox: true,
      movieTitle: `${movieInfo?.name || "Phim"} — ${matchedEp.name || ""}`,
      episodes: allEpisodes,
      currentEpisodeIndex: serverData.indexOf(matchedEp),
      extractedMethod: "Khung trình phát (Player)",
    };
  }

  return null;
}

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

  const keyword = slugOrQuery.replace(/-/g, " ").trim();
  if (keyword.length < 2) return null;

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
 * Universal Video Resolver:
 * Works with ANY website URL pasted by the user and isolates ONLY the video (zero website ads/popups)!
 */
export async function resolvePureVideoMedia(rawInput) {
  if (!rawInput || !rawInput.trim()) return null;
  const trimmed = rawInput.trim();

  if (
    trimmed.includes("khiem292.github.io/cineparty") ||
    (typeof window !== "undefined" &&
      trimmed.includes(window.location.host) &&
      trimmed.includes("?room="))
  ) {
    return {
      error:
        "Bạn vừa dán link mời phòng CineParty! Hãy dán link bộ phim cần xem vào ô này nhé.",
    };
  }

  const looksLikeUrlOrIframe =
    /^https?:\/\//i.test(trimmed) ||
    /<iframe/i.test(trimmed) ||
    /^[a-z0-9-]+\.(com|net|org|vn|io|tv|me|cc|to|xyz|info|biz|top|club|site|online|pro|live|stream|watch|video|gg|ly|be|life|cx|co|ink|fm|phim|sh|ws|ru|uk|us|jp|kr|cn|sex|xxx|porn| tube)\b/i.test(
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

  // 3. Check if user explicitly pasted an <iframe src="..."> tag
  if (/<iframe[^>]+src=/i.test(rawInput)) {
    return {
      ...basic,
      isPurePlayer: true,
    };
  }

  // 4. Convert known platforms (Google Drive, Vimeo, Dailymotion, Ok.ru, Bilibili, TikTok, Twitch, Facebook Video, Streamtape...)
  const platformPlayer = convertKnownPlatformToPlayerUrl(basic.url);
  if (platformPlayer) {
    return {
      ...basic,
      ...platformPlayer,
    };
  }

  // 5. Scrape the target webpage HTML AND check public HLS stream databases in parallel!
  const slugInfo = extractMovieSlugAndEpisode(basic.url);

  const [html, slugStream] = await Promise.all([
    fetchHtmlViaProxy(basic.url),
    slugInfo
      ? lookupMovieStreamBySlugOrKeyword(
          slugInfo.cleanSlug,
          slugInfo.episodeNum
        )
      : Promise.resolve(null),
  ]);

  // 5a. If webpage HTML has a direct .m3u8, .mp4, <video>, og:video, itemprop="embedUrl", or inner player <iframe>, use it!
  if (html) {
    const extracted = extractVideoFromHtml(html, basic.url);
    if (extracted) {
      // If extracted is an inner iframe, check if that inner iframe has a raw .m3u8/.mp4
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

  // 5b. If slug matched a pure .m3u8 stream on CDN, use it!
  if (slugStream) {
    return {
      ...basic,
      ...slugStream,
    };
  }

  // 5c. If HTML was fetched, try matching movie title from <title> / og:title on CDN
  if (html) {
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

    // 5d. If it's a custom website whose HTML we fetched, use `buildIsolatedVideoSrcDoc`
    //     to physically strip out all popup ads (like TX88 banners) and headers, showing ONLY the video player!
    return {
      ...basic,
      type: "isolated-html",
      url: basic.url,
      isPurePlayer: true,
      autoIsolateVideo: false,
      extractedMethod: "Đã lọc sạch quảng cáo & tách riêng khung Video",
    };
  }

  // 6. Fallback if proxy couldn't fetch HTML
  return {
    ...basic,
    isPurePlayer: false,
    autoIsolateVideo: true,
    extractedMethod: "Chế độ lọc riêng khung Video",
  };
}

/**
 * Helper used by WatchRoom when media.type === 'isolated-html' to fetch & sanitize HTML locally on each client
 */
export async function fetchAndBuildIsolatedSrcDoc(url) {
  const html = await fetchHtmlViaProxy(url);
  if (!html) return null;
  return buildIsolatedVideoSrcDoc(html, url);
}
