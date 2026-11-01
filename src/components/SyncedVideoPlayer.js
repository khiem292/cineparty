"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { Volume2 } from "lucide-react";

function computeExpectedTime(playback) {
  if (!playback) return 0;
  let t = playback.currentTime || 0;
  if (playback.isPlaying && playback.updatedAt) {
    const elapsed = (Date.now() - playback.updatedAt) / 1000;
    if (elapsed > 0 && elapsed < 36000) {
      t += elapsed;
    }
  }
  return Math.max(0, t);
}

export default function SyncedVideoPlayer({
  media,
  playback,
  canControl,
  isHost,
  onPlaybackAction,
  socket,
  roomId,
}) {
  const videoRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const playbackRef = useRef(playback);
  const ytContainerId = "cineparty-yt-player";
  const isRemoteActionRef = useRef(false);
  const remoteTimeoutRef = useRef(null);
  const [ytReady, setYtReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [autoMuted, setAutoMuted] = useState(false);

  useEffect(() => {
    playbackRef.current = playback;
  }, [playback]);

  const markRemoteGuard = () => {
    isRemoteActionRef.current = true;
    if (remoteTimeoutRef.current) clearTimeout(remoteTimeoutRef.current);
    remoteTimeoutRef.current = setTimeout(() => {
      isRemoteActionRef.current = false;
    }, 850);
  };

  // Smart Autoplay helper: tries unmuted first; if browser blocks autoplay, plays muted immediately so video stays synced!
  const smartPlayVideo = async (video) => {
    if (!video) return;
    try {
      await video.play();
    } catch {
      try {
        video.muted = true;
        setAutoMuted(true);
        await video.play();
      } catch {}
    }
  };

  // Unmute automatically on first user tap anywhere on the page if browser forced muted autoplay
  useEffect(() => {
    if (!autoMuted) return;
    const handleFirstInteraction = () => {
      if (videoRef.current) {
        videoRef.current.muted = false;
        setAutoMuted(false);
      }
    };
    window.addEventListener("click", handleFirstInteraction, { once: true });
    window.addEventListener("touchstart", handleFirstInteraction, { once: true });
    return () => {
      window.removeEventListener("click", handleFirstInteraction);
      window.removeEventListener("touchstart", handleFirstInteraction);
    };
  }, [autoMuted]);

  const syncLocalVideoToPlayback = (targetPlayback) => {
    if (!targetPlayback) return;
    const expectedTime = computeExpectedTime(targetPlayback);

    if (media.type === "video" || media.type === "hls") {
      const video = videoRef.current;
      if (!video || video.readyState < 1) return;

      const drift = Math.abs(video.currentTime - expectedTime);
      if (drift > 2.2) {
        markRemoteGuard();
        video.currentTime = expectedTime;
      }

      if (targetPlayback.isPlaying && video.paused) {
        markRemoteGuard();
        smartPlayVideo(video);
      } else if (!targetPlayback.isPlaying && !video.paused) {
        markRemoteGuard();
        video.pause();
      }
    } else if (media.type === "youtube" && ytReady && ytPlayerRef.current) {
      const player = ytPlayerRef.current;
      if (!player.getCurrentTime) return;

      const current = player.getCurrentTime() || 0;
      if (Math.abs(current - expectedTime) > 2.4) {
        markRemoteGuard();
        player.seekTo(expectedTime, true);
      }
      const state = player.getPlayerState ? player.getPlayerState() : -1;
      if (targetPlayback.isPlaying && state !== 1) {
        markRemoteGuard();
        player.playVideo();
      } else if (!targetPlayback.isPlaying && state === 1) {
        markRemoteGuard();
        player.pauseVideo();
      }
    }
  };

  // Setup HTML5 Video or HLS (.m3u8)
  useEffect(() => {
    setErrorMsg("");
    setAutoMuted(false);
    if (media.type !== "video" && media.type !== "hls") return;
    const video = videoRef.current;
    if (!video || !media.url) return;

    let hls = null;

    const applyInitialSync = () => {
      const pb = playbackRef.current;
      const startSec = computeExpectedTime(pb);
      markRemoteGuard();
      if (startSec > 0.5) {
        video.currentTime = startSec;
      }
      if (pb?.isPlaying !== false) {
        smartPlayVideo(video);
      }
    };

    if (media.type === "hls") {
      if (Hls.isSupported()) {
        const startSec = computeExpectedTime(playbackRef.current);
        hls = new Hls({
          enableWorker: true,
          startPosition: startSec > 1 ? startSec : -1,
        });
        hls.loadSource(media.url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          applyInitialSync();
        });
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            setErrorMsg(
              "Không thể tải luồng HLS (.m3u8) này. Hãy thử chọn phim khác hoặc dùng nút Tìm Phim."
            );
          }
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = media.url;
        video.addEventListener("loadedmetadata", applyInitialSync, { once: true });
      }
    } else {
      video.src = media.url;
      video.addEventListener("loadedmetadata", applyInitialSync, { once: true });
    }

    return () => {
      video.removeEventListener("loadedmetadata", applyInitialSync);
      if (hls) {
        hls.destroy();
      }
    };
  }, [media.type, media.url]);

  // Whenever `playback` prop updates (e.g., when room-state arrives right after a late joiner connects),
  // immediately sync the video to that timestamp!
  useEffect(() => {
    syncLocalVideoToPlayback(playback);
  }, [playback, ytReady]);

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

      const startSec = Math.floor(computeExpectedTime(playbackRef.current));

      ytPlayerRef.current = new window.YT.Player(ytContainerId, {
        videoId: media.url,
        playerVars: {
          autoplay: 1,
          controls: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          start: startSec,
        },
        events: {
          onReady: (event) => {
            if (!isMounted) return;
            setYtReady(true);
            const currentTarget = computeExpectedTime(playbackRef.current);
            if (currentTarget > 1) {
              event.target.seekTo(currentTarget, true);
            }
            if (playbackRef.current?.isPlaying !== false) {
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

  // Listen to incoming remote playback-update and playback-heartbeat events
  useEffect(() => {
    if (!socket) return;

    const handleRemotePlayback = ({ playback: remotePlayback }) => {
      if (!remotePlayback) return;
      syncLocalVideoToPlayback(remotePlayback);
    };

    socket.on("playback-update", handleRemotePlayback);
    socket.on("playback-heartbeat", handleRemotePlayback);
    return () => {
      socket.off("playback-update", handleRemotePlayback);
      socket.off("playback-heartbeat", handleRemotePlayback);
    };
  }, [socket, media.type, ytReady]);

  // Host periodic heartbeat: Every 2.5 seconds, Host broadcasts exact current video time
  // so anyone joining late or drifting is automatically locked to the Host's exact second!
  useEffect(() => {
    if (!socket || !isHost) return;

    const interval = setInterval(() => {
      if (media.type === "video" || media.type === "hls") {
        const video = videoRef.current;
        if (!video || video.readyState < 1) return;
        socket.emit("time-heartbeat", {
          roomId,
          currentTime: video.currentTime || 0,
          isPlaying: !video.paused,
        });
      } else if (media.type === "youtube" && ytReady && ytPlayerRef.current) {
        const player = ytPlayerRef.current;
        if (!player.getCurrentTime || !player.getPlayerState) return;
        const state = player.getPlayerState();
        if (state === 1 || state === 2) {
          socket.emit("time-heartbeat", {
            roomId,
            currentTime: player.getCurrentTime() || 0,
            isPlaying: state === 1,
          });
        }
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [socket, isHost, media.type, ytReady, roomId]);

  const handleVideoPlay = () => {
    if (isRemoteActionRef.current || !canControl || !videoRef.current) return;
    onPlaybackAction("play", videoRef.current.currentTime, true);
  };

  const handleVideoPause = () => {
    if (isRemoteActionRef.current || !canControl || !videoRef.current) return;
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
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <video
        ref={videoRef}
        className="player-video"
        controls
        playsInline
        autoPlay
        onPlay={handleVideoPlay}
        onPause={handleVideoPause}
        onSeeked={handleVideoSeeked}
        onLoadedMetadata={() => syncLocalVideoToPlayback(playbackRef.current)}
        onError={() =>
          setErrorMsg(
            "Không thể phát trực tiếp file video này. Bạn có thể bấm nút Tìm Phim để chọn nguồn khác."
          )
        }
      />

      {autoMuted && (
        <button
          type="button"
          onClick={() => {
            if (videoRef.current) {
              videoRef.current.muted = false;
              setAutoMuted(false);
            }
          }}
          className="btn-primary"
          style={{
            position: "absolute",
            top: "16px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "auto",
            padding: "10px 18px",
            zIndex: 30,
          }}
        >
          <Volume2 size={17} />
          <span>Bấm để bật tiếng (Phim đang tự chạy đồng bộ)</span>
        </button>
      )}

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
