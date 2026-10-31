"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

export default function SyncedVideoPlayer({
  media,
  playback,
  canControl,
  onPlaybackAction,
  socket,
  roomId,
}) {
  const videoRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const ytContainerId = "cineparty-yt-player";
  const isRemoteActionRef = useRef(false);
  const remoteTimeoutRef = useRef(null);
  const [ytReady, setYtReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const markRemoteGuard = () => {
    isRemoteActionRef.current = true;
    if (remoteTimeoutRef.current) clearTimeout(remoteTimeoutRef.current);
    remoteTimeoutRef.current = setTimeout(() => {
      isRemoteActionRef.current = false;
    }, 650);
  };

  // Setup HTML5 Video or HLS (.m3u8)
  useEffect(() => {
    setErrorMsg("");
    if (media.type !== "video" && media.type !== "hls") return;
    const video = videoRef.current;
    if (!video || !media.url) return;

    let hls = null;

    if (media.type === "hls") {
      if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
        });
        hls.loadSource(media.url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (playback?.currentTime > 1) {
            video.currentTime = playback.currentTime;
          }
          if (playback?.isPlaying) {
            video.play().catch(() => {});
          }
        });
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            setErrorMsg(
              "Không thể tải luồng HLS (.m3u8) này (có thể do сервер phim chặn CORS). Hãy thử chế độ Nhúng Iframe hoặc Chia sẻ màn hình."
            );
          }
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = media.url;
      }
    } else {
      video.src = media.url;
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, [media.type, media.url]);

  // Setup YouTube IFrame API
  useEffect(() => {
    if (media.type !== "youtube" || !media.url) return;
    setYtReady(false);

    let isMounted = true;

    const createPlayer = () => {
      if (!isMounted || !window.YT || !window.YT.Player) return;
      if (ytPlayerRef.current && ytPlayerRef.current.destroy) {
        try {
          ytPlayerRef.current.destroy();
        } catch {}
      }

      ytPlayerRef.current = new window.YT.Player(ytContainerId, {
        videoId: media.url,
        playerVars: {
          autoplay: playback?.isPlaying ? 1 : 0,
          controls: 1,
          rel: 0,
          modestbranding: 1,
          start: Math.floor(playback?.currentTime || 0),
        },
        events: {
          onReady: (event) => {
            if (!isMounted) return;
            setYtReady(true);
            if (playback?.currentTime > 1) {
              event.target.seekTo(playback.currentTime, true);
            }
            if (playback?.isPlaying) {
              event.target.playVideo();
            } else {
              event.target.pauseVideo();
            }
          },
          onStateChange: (event) => {
            if (!isMounted || isRemoteActionRef.current || !canControl) return;
            const YTState = window.YT.PlayerState;
            const currentTime = event.target.getCurrentTime() || 0;
            if (event.data === YTState.PLAYING) {
              onPlaybackAction("play", currentTime, true);
            } else if (event.data === YTState.PAUSED) {
              onPlaybackAction("pause", currentTime, false);
            }
          },
        },
      });
    };

    if (window.YT && window.YT.Player) {
      createPlayer();
    } else {
      const existingScript = document.getElementById("youtube-iframe-api");
      if (!existingScript) {
        const tag = document.createElement("script");
        tag.id = "youtube-iframe-api";
        tag.src = "https://www.youtube.com/iframe_api";
        document.body.appendChild(tag);
      }
      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prevCallback) prevCallback();
        createPlayer();
      };
    }

    return () => {
      isMounted = false;
      if (ytPlayerRef.current && ytPlayerRef.current.destroy) {
        try {
          ytPlayerRef.current.destroy();
        } catch {}
      }
    };
  }, [media.type, media.url]);

  // Listen to incoming remote playback updates
  useEffect(() => {
    if (!socket) return;

    const handleRemotePlayback = ({ playback: remotePlayback }) => {
      if (!remotePlayback) return;

      if (media.type === "video" || media.type === "hls") {
        const video = videoRef.current;
        if (!video) return;

        markRemoteGuard();
        const drift = Math.abs(video.currentTime - remotePlayback.currentTime);
        if (drift > 1.5) {
          video.currentTime = remotePlayback.currentTime;
        }
        if (remotePlayback.isPlaying && video.paused) {
          video.play().catch(() => {});
        } else if (!remotePlayback.isPlaying && !video.paused) {
          video.pause();
        }
      } else if (media.type === "youtube" && ytReady && ytPlayerRef.current) {
        const player = ytPlayerRef.current;
        if (!player.getCurrentTime) return;

        markRemoteGuard();
        const current = player.getCurrentTime() || 0;
        if (Math.abs(current - remotePlayback.currentTime) > 1.8) {
          player.seekTo(remotePlayback.currentTime, true);
        }
        if (remotePlayback.isPlaying) {
          player.playVideo();
        } else {
          player.pauseVideo();
        }
      }
    };

    socket.on("playback-update", handleRemotePlayback);
    return () => {
      socket.off("playback-update", handleRemotePlayback);
    };
  }, [socket, media.type, ytReady]);

  // Handlers for local HTML5 video events
  const handleVideoPlay = () => {
    if (isRemoteActionRef.current || !canControl || !videoRef.current) return;
    onPlaybackAction("play", videoRef.current.currentTime, true);
  };

  const handleVideoPause = () => {
    if (isRemoteActionRef.current || !canControl || !videoRef.current) return;
    // Ignore pause event fired right while seeking
    if (videoRef.current.seeking) return;
    onPlaybackAction("pause", videoRef.current.currentTime, false);
  };

  const handleVideoSeeked = () => {
    if (isRemoteActionRef.current || !canControl || !videoRef.current) return;
    onPlaybackAction(
      "seek",
      videoRef.current.currentTime,
      !videoRef.current.paused
    );
  };

  if (media.type === "youtube") {
    return (
      <div style={{ width: "100%", height: "100%", position: "relative" }}>
        <div id={ytContainerId} style={{ width: "100%", height: "100%" }} />
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <video
        ref={videoRef}
        className="player-video"
        controls
        playsInline
        onPlay={handleVideoPlay}
        onPause={handleVideoPause}
        onSeeked={handleVideoSeeked}
        onError={() =>
          setErrorMsg(
            "Không thể phát trực tiếp file video này (có thể do link hết hạn hoặc chặn CORS). Bạn có thể chuyển sang chế độ Nhúng Iframe hoặc Chia sẻ màn hình."
          )
        }
      />
      {errorMsg && (
        <div
          style={{
            position: "absolute",
            bottom: "70px",
            left: "24px",
            right: "24px",
            background: "rgba(239, 68, 68, 0.92)",
            color: "white",
            padding: "12px 16px",
            borderRadius: "10px",
            fontSize: "0.86rem",
            textAlign: "center",
          }}
        >
          {errorMsg}
        </div>
      )}
    </div>
  );
}
