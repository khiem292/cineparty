export function parseMediaInput(rawInput) {
  if (!rawInput || typeof rawInput !== "string") {
    return null;
  }

  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  let extractedUrl = trimmed;

  // 1. Check if the user pasted a full <iframe ... src="..."> snippet
  const iframeSrcMatch = trimmed.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  if (iframeSrcMatch && iframeSrcMatch[1]) {
    extractedUrl = iframeSrcMatch[1].trim();
  }

  // Handle protocol-relative URLs like //example.com/embed/...
  if (extractedUrl.startsWith("//")) {
    extractedUrl = "https:" + extractedUrl;
  } else if (!/^https?:\/\//i.test(extractedUrl)) {
    extractedUrl = "https://" + extractedUrl;
  }

  // 2. Check if it's a YouTube URL
  const ytId = extractYouTubeId(extractedUrl);
  if (ytId) {
    return {
      type: "youtube",
      url: ytId,
      rawInput: trimmed,
      sandbox: false,
    };
  }

  // 3. Check if it's an HLS (.m3u8) stream
  if (/\.m3u8(\?.*|#.*)?$/i.test(extractedUrl) || extractedUrl.includes(".m3u8?")) {
    return {
      type: "hls",
      url: extractedUrl,
      rawInput: trimmed,
      sandbox: false,
    };
  }

  // 4. Check if it's a direct HTML5 video file (.mp4, .webm, .ogg, .mov)
  if (/\.(mp4|webm|ogg|mov)(\?.*|#.*)?$/i.test(extractedUrl)) {
    return {
      type: "video",
      url: extractedUrl,
      rawInput: trimmed,
      sandbox: false,
    };
  }

  // 5. Default: Iframe Embed from movie site
  return {
    type: "iframe",
    url: extractedUrl,
    rawInput: trimmed,
    sandbox: true,
  };
}

export function extractYouTubeId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.slice(1).split("/")[0] || null;
    }
    if (parsed.hostname.includes("youtube.com")) {
      if (parsed.pathname === "/watch") {
        return parsed.searchParams.get("v");
      }
      if (parsed.pathname.startsWith("/embed/") || parsed.pathname.startsWith("/shorts/")) {
        return parsed.pathname.split("/")[2] || null;
      }
    }
  } catch {
    // Fallback regex
  }
  const match = url.match(/(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/i);
  return match ? match[1] : null;
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
}

export function parseTimeInput(str) {
  if (!str) return 0;
  const parts = str
    .trim()
    .split(":")
    .map((p) => parseInt(p, 10) || 0);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0] || 0;
}
