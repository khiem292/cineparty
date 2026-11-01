"use client";

import { useEffect, useState, useRef } from "react";
import {
  Film,
  Copy,
  Check,
  Users,
  MessageSquare,
  Crown,
  Link2,
  MonitorUp,
  MonitorOff,
  Play,
  RotateCcw,
  Send,
  Lock,
  Unlock,
  Maximize2,
  Minimize2,
  Share2,
  Search,
  Loader2,
  ListVideo,
  X,
} from "lucide-react";
import { formatTime } from "@/lib/urlParser";
import {
  resolvePureVideoMedia,
  searchMoviesByKeyword,
  lookupMovieStreamBySlugOrKeyword,
  appendStartTimeToIframeUrl,
} from "@/lib/videoExtractor";
import { createP2PRoomClient } from "@/lib/p2pRoomClient";
import SyncedVideoPlayer from "@/components/SyncedVideoPlayer";
import ScreenShareStage from "@/components/ScreenShareStage";

export default function WatchRoom({ roomId: rawRoomId, onLeaveRoom }) {
  const roomId = (rawRoomId || "ROOM").toUpperCase();

  const [socket, setSocket] = useState(null);
  const [username, setUsername] = useState("");
  const [needsNameModal, setNeedsNameModal] = useState(false);
  const [tempName, setTempName] = useState("");

  // Room state
  const [hostId, setHostId] = useState(null);
  const [allowAllControl, setAllowAllControl] = useState(true);
  const [users, setUsers] = useState([]);
  const [media, setMedia] = useState({
    type: "empty",
    url: "",
    rawInput: "",
    sandbox: true,
    movieTitle: "",
    episodes: null,
    currentEpisodeIndex: 0,
    extractedMethod: "",
  });
  const [playback, setPlayback] = useState({
    isPlaying: true,
    currentTime: 0,
    updatedAt: Date.now(),
    controllerName: "Hệ thống",
  });
  const [screenSharerId, setScreenSharerId] = useState(null);
  const [screenSharerName, setScreenSharerName] = useState(null);
  const [localScreenStream, setLocalScreenStream] = useState(null);

  // Toolbar & Mobile UI state
  const [urlInput, setUrlInput] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [sidebarTab, setSidebarTab] = useState("chat"); // 'chat' | 'episodes' | 'users'
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [floatingReactions, setFloatingReactions] = useState([]);
  const [showMobileUrlBar, setShowMobileUrlBar] = useState(true);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [mobileToast, setMobileToast] = useState("");

  // Built-in Movie Search Modal
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  const [displayTimer, setDisplayTimer] = useState(0);
  const [iframeStartOffset, setIframeStartOffset] = useState(0);

  const iframeRef = useRef(null);
  const chatEndRef = useRef(null);

  const isHost = Boolean(socket && hostId === socket.id);
  const canControl = isHost || allowAllControl;

  const showToast = (msg) => {
    setMobileToast(msg);
    setTimeout(() => setMobileToast(""), 4500);
  };

  useEffect(() => {
    const saved = localStorage.getItem("cineparty_username");
    if (saved && saved.trim()) {
      setUsername(saved.trim());
    } else {
      setNeedsNameModal(true);
    }
  }, []);

  useEffect(() => {
    if (!username) return;

    const s = createP2PRoomClient(roomId);
    setSocket(s);

    s.on("connect", async () => {
      s.emit("join-room", { roomId, username });

      const initUrl = sessionStorage.getItem(`cineparty_init_url_${roomId}`);
      if (initUrl) {
        sessionStorage.removeItem(`cineparty_init_url_${roomId}`);
        setUrlInput(initUrl);
        setIsExtracting(true);
        const resolved = await resolvePureVideoMedia(initUrl);
        setIsExtracting(false);
        if (resolved && !resolved.error) {
          s.emit("change-media", { roomId, media: resolved });
          setShowMobileUrlBar(false);
        } else if (resolved?.error) {
          showToast(resolved.error);
        }
      }
    });

    s.on("room-state", (state) => {
      setHostId(state.hostId);
      setAllowAllControl(state.allowAllControl);
      setUsers(state.users || []);
      const nextMedia = state.media || {
        type: "empty",
        url: "",
        rawInput: "",
        sandbox: true,
      };
      setMedia(nextMedia);
      if (nextMedia.type !== "empty") {
        setShowMobileUrlBar(false);
      }
      setUrlInput(nextMedia?.rawInput || nextMedia?.url || "");
      const incomingPlayback = state.playback || {
        isPlaying: true,
        currentTime: 0,
        updatedAt: Date.now(),
        controllerName: "Hệ thống",
      };
      setPlayback({
        ...incomingPlayback,
        updatedAt: Date.now(),
      });
      setDisplayTimer(incomingPlayback.currentTime || 0);
      setIframeStartOffset(Math.floor(incomingPlayback.currentTime || 0));
      setScreenSharerId(state.screenSharerId || null);
      setScreenSharerName(state.screenSharerName || null);
      setMessages(state.messages || []);
    });

    s.on("users-updated", ({ hostId: newHostId, users: newUsers }) => {
      setHostId(newHostId);
      setUsers(newUsers || []);
    });

    s.on(
      "media-changed",
      ({
        media: newMedia,
        playback: newPlayback,
        screenSharerId: sharerId,
        screenSharerName: sharerName,
      }) => {
        setMedia(newMedia);
        setUrlInput(newMedia.rawInput || newMedia.url || "");
        setPlayback({
          ...newPlayback,
          updatedAt: Date.now(),
        });
        setDisplayTimer(newPlayback.currentTime || 0);
        setIframeStartOffset(0);
        setScreenSharerId(sharerId || null);
        setScreenSharerName(sharerName || null);
        if (newMedia.type !== "empty") {
          setShowMobileUrlBar(false);
        }
      }
    );

    const handleIncomingPlayback = ({ action, playback: newPlayback }) => {
      if (!newPlayback) return;
      setPlayback({
        ...newPlayback,
        updatedAt: Date.now(),
      });
      setDisplayTimer(newPlayback.currentTime || 0);

      if (iframeRef.current && iframeRef.current.contentWindow) {
        try {
          const win = iframeRef.current.contentWindow;
          if (newPlayback.isPlaying) {
            win.postMessage(JSON.stringify({ method: "play" }), "*");
            win.postMessage(
              { event: "command", func: "playVideo", args: "" },
              "*"
            );
          } else {
            win.postMessage(JSON.stringify({ method: "pause" }), "*");
            win.postMessage(
              { event: "command", func: "pauseVideo", args: "" },
              "*"
            );
          }
          if (action === "seek" || action === "sync") {
            win.postMessage(
              JSON.stringify({
                method: "setCurrentTime",
                value: newPlayback.currentTime,
              }),
              "*"
            );
          }
        } catch {}
      }
    };

    s.on("playback-update", handleIncomingPlayback);
    s.on("playback-heartbeat", handleIncomingPlayback);

    s.on("permissions-updated", ({ allowAllControl: allowed }) => {
      setAllowAllControl(allowed);
    });

    s.on("screen-share-started", ({ sharerId, sharerName, media: newMedia }) => {
      setScreenSharerId(sharerId);
      setScreenSharerName(sharerName);
      setMedia(newMedia);
      setShowMobileUrlBar(false);
    });

    s.on("screen-share-stopped", ({ media: newMedia }) => {
      setScreenSharerId(null);
      setScreenSharerName(null);
      if (newMedia) setMedia(newMedia);
    });

    s.on("new-message", (msg) => {
      setMessages((prev) => [...prev.slice(-99), msg]);
    });

    s.on("reaction-received", (reaction) => {
      setFloatingReactions((prev) => [...prev, reaction]);
      setTimeout(() => {
        setFloatingReactions((prev) => prev.filter((r) => r.id !== reaction.id));
      }, 3300);
    });

    return () => {
      s.disconnect();
    };
  }, [username, roomId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!playback.isPlaying) {
      setDisplayTimer(playback.currentTime || 0);
      return;
    }

    const updateTimer = () => {
      const elapsed = (Date.now() - playback.updatedAt) / 1000;
      setDisplayTimer((playback.currentTime || 0) + Math.max(0, elapsed));
    };

    updateTimer();
    const interval = setInterval(updateTimer, 500);
    return () => clearInterval(interval);
  }, [playback]);

  const handleLoadMedia = async (e, customUrl) => {
    if (e) e.preventDefault();
    if (!canControl || !socket) return;

    const raw = customUrl !== undefined ? customUrl : urlInput;
    if (!raw || !raw.trim()) return;

    setIsExtracting(true);
    const resolved = await resolvePureVideoMedia(raw);
    setIsExtracting(false);

    if (!resolved) return;

    if (resolved.error) {
      showToast(resolved.error);
      if (resolved.suggestedQuery) {
        setSearchQuery(resolved.suggestedQuery);
        setShowSearchModal(true);
        setIsSearching(true);
        const results = await searchMoviesByKeyword(resolved.suggestedQuery);
        setSearchResults(results);
        setIsSearching(false);
      }
      return;
    }

    if (localScreenStream) {
      stopLocalScreenShare();
    }

    if (resolved.movieTitle) {
      showToast(`🎬 Đang phát: ${resolved.movieTitle}`);
    } else if (resolved.extractedMethod) {
      showToast(`✨ Đã tách riêng video: ${resolved.extractedMethod}`);
    }

    socket.emit("change-media", {
      roomId,
      media: resolved,
    });
    setShowMobileUrlBar(false);
  };

  const handleSelectEpisode = (ep, idx) => {
    if (!canControl || !socket) return;
    const nextMedia = {
      ...media,
      type: ep.link_m3u8 ? "hls" : "iframe",
      url: ep.link_m3u8 || ep.link_embed,
      sandbox: !ep.link_m3u8,
      currentEpisodeIndex: idx,
      movieTitle: `${media.movieTitle?.split(" — ")[0] || "Phim"} — ${ep.name}`,
    };
    socket.emit("change-media", {
      roomId,
      media: nextMedia,
    });
    showToast(`🎬 Chuyển sang: ${nextMedia.movieTitle}`);
  };

  const handleMovieSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    const results = await searchMoviesByKeyword(searchQuery);
    setSearchResults(results);
    setIsSearching(false);
  };

  const handlePickSearchedMovie = async (movie) => {
    if (!canControl || !socket) return;
    setShowSearchModal(false);
    setIsExtracting(true);
    const stream = await lookupMovieStreamBySlugOrKeyword(movie.slug, 1);
    setIsExtracting(false);
    if (stream) {
      setUrlInput(movie.name);
      socket.emit("change-media", {
        roomId,
        media: {
          rawInput: movie.name,
          ...stream,
        },
      });
      setShowMobileUrlBar(false);
      showToast(`🎬 Đang phát: ${stream.movieTitle}`);
    } else {
      showToast("Không tìm thấy luồng phát cho phim này.");
    }
  };

  const handleStartScreenShare = async () => {
    if (!canControl || !socket) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      showToast(
        "📱 Trình duyệt điện thoại chỉ hỗ trợ XEM chia sẻ màn hình từ máy tính. Trên điện thoại, bạn hãy dán link phim hoặc bấm Tìm Phim nhé!"
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 60, max: 60 },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          stopLocalScreenShare(stream);
        };
      }

      setLocalScreenStream(stream);
      socket.emit("start-screen-share", { roomId });
      setShowMobileUrlBar(false);
    } catch (err) {
      console.warn("Không bắt đầu chia sẻ màn hình:", err);
    }
  };

  const stopLocalScreenShare = (streamToStop) => {
    const activeStream = streamToStop || localScreenStream;
    if (activeStream) {
      activeStream.getTracks().forEach((t) => t.stop());
    }
    setLocalScreenStream(null);
    if (socket) {
      socket.emit("stop-screen-share", { roomId });
    }
  };

  const handlePlaybackAction = (action, currentTime, isPlaying) => {
    if (!canControl || !socket) return;
    const nextPlayback = {
      isPlaying,
      currentTime,
      updatedAt: Date.now(),
      controllerName: username,
    };
    setPlayback(nextPlayback);
    setDisplayTimer(currentTime);
    socket.emit("playback-action", {
      roomId,
      action,
      currentTime,
      isPlaying,
    });
  };

  const handleCopyInvite = async () => {
    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    const inviteUrl = `${baseUrl}?room=${roomId}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 2200);
    } catch {}
  };

  const handleNativeShare = async () => {
    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    const inviteUrl = `${baseUrl}?room=${roomId}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `CineParty — Phòng xem phim #${roomId}`,
          text: `Vào xem phim chung với mình tại phòng #${roomId} nhé!`,
          url: inviteUrl,
        });
        return;
      } catch {}
    }
    handleCopyInvite();
  };

  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !socket) return;
    socket.emit("chat-message", {
      roomId,
      text: chatInput,
    });
    setChatInput("");
  };

  const handleSendReaction = (emoji) => {
    if (!socket) return;
    socket.emit("send-reaction", {
      roomId,
      emoji,
    });
  };

  if (needsNameModal) {
    return (
      <div
        className="landing-wrapper"
        style={{ justifyContent: "center", alignItems: "center" }}
      >
        <div className="auth-card" style={{ maxWidth: "420px", width: "100%" }}>
          <div className="brand-logo" style={{ marginBottom: "16px" }}>
            <div className="brand-icon">
              <Film size={20} />
            </div>
            <span>Tham gia phòng #{roomId}</span>
          </div>
          <p
            style={{
              color: "var(--text-secondary)",
              fontSize: "0.9rem",
              marginBottom: "18px",
            }}
          >
            Nhập tên hiển thị của bạn để vào xem ngay đoạn phim mọi người đang
            xem:
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const finalName =
                tempName.trim() ||
                `Khách_${Math.floor(100 + Math.random() * 900)}`;
              localStorage.setItem("cineparty_username", finalName);
              setUsername(finalName);
              setNeedsNameModal(false);
            }}
          >
            <div className="form-group">
              <input
                type="text"
                className="form-input"
                placeholder="Tên của bạn (VD: Minh, Lan...)"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                autoFocus
                maxLength={28}
              />
            </div>
            <button type="submit" className="btn-primary">
              Vào Xem Ngay
            </button>
          </form>
        </div>
      </div>
    );
  }

  const effectiveIframeUrl =
    media.type === "iframe" && media.url
      ? appendStartTimeToIframeUrl(media.url, iframeStartOffset)
      : "";

  const hasEpisodes =
    Array.isArray(media.episodes) && media.episodes.length > 1;

  return (
    <div className="room-layout">
      {/* Toast Notification */}
      {mobileToast && (
        <div
          style={{
            position: "fixed",
            top: "58px",
            left: "12px",
            right: "12px",
            maxWidth: "560px",
            margin: "0 auto",
            background: "rgba(17, 21, 31, 0.96)",
            border: "1px solid var(--accent-primary)",
            color: "var(--text-primary)",
            padding: "11px 16px",
            borderRadius: "12px",
            fontSize: "0.85rem",
            zIndex: 100,
            boxShadow: "0 12px 32px rgba(0,0,0,0.55)",
            textAlign: "center",
          }}
        >
          {mobileToast}
        </div>
      )}

      {/* Built-in Movie Search Modal */}
      {showSearchModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(5, 6, 9, 0.85)",
            backdropFilter: "blur(6px)",
            zIndex: 90,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
        >
          <div
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
              borderRadius: "18px",
              width: "100%",
              maxWidth: "600px",
              maxHeight: "82dvh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
            }}
          >
            <div
              style={{
                padding: "14px 18px",
                borderBottom: "1px solid var(--border-color)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontWeight: 700,
                }}
              >
                <Film size={18} color="#a78bfa" />
                <span>Tìm Phim Trực Tiếp (100% Chỉ Hiện Video • Tự Đồng Bộ)</span>
              </div>
              <button
                type="button"
                onClick={() => setShowSearchModal(false)}
                className="btn-secondary"
                style={{ padding: "5px 8px" }}
              >
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={handleMovieSearch}
              style={{
                padding: "12px 16px",
                display: "flex",
                gap: "8px",
                borderBottom: "1px solid var(--border-color)",
              }}
            >
              <input
                type="text"
                className="form-input"
                placeholder="Nhập tên phim (VD: Gả Kim Thoa, Đảo Hải Tặc, Mai, Squid Game...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
              <button
                type="submit"
                className="btn-primary"
                style={{ width: "auto", padding: "10px 18px" }}
                disabled={isSearching}
              >
                {isSearching ? <Loader2 size={16} /> : <Search size={16} />}
                <span>Tìm</span>
              </button>
            </form>

            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "12px 16px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              {searchResults.length === 0 && !isSearching && (
                <div
                  style={{
                    textAlign: "center",
                    color: "var(--text-secondary)",
                    padding: "28px 12px",
                    fontSize: "0.88rem",
                  }}
                >
                  Nhập tên phim bất kỳ để phát trực tiếp luồng{" "}
                  <strong>Video thuần (.m3u8)</strong>. Khung xem sẽ chỉ hiện
                  duy nhất video và tự động đồng bộ thời gian thực!
                </div>
              )}

              {searchResults.map((item) => (
                <div
                  key={item.slug}
                  onClick={() => handlePickSearchedMovie(item)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "10px",
                    borderRadius: "12px",
                    background: "var(--bg-tertiary)",
                    border: "1px solid var(--border-color)",
                    cursor: "pointer",
                  }}
                >
                  <img
                    src={item.poster}
                    alt={item.name}
                    style={{
                      width: "48px",
                      height: "68px",
                      objectFit: "cover",
                      borderRadius: "8px",
                      flexShrink: 0,
                      background: "#000",
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: "0.94rem",
                        color: "var(--text-primary)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {item.name}
                    </div>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        color: "var(--text-secondary)",
                        marginTop: "2px",
                      }}
                    >
                      {item.origin_name} {item.year ? `(${item.year})` : ""}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: "6px",
                        marginTop: "5px",
                        fontSize: "0.73rem",
                      }}
                    >
                      <span
                        style={{
                          background: "rgba(139, 92, 246, 0.2)",
                          color: "#c4b5fd",
                          padding: "2px 7px",
                          borderRadius: "6px",
                        }}
                      >
                        {item.episode_current}
                      </span>
                      <span
                        style={{
                          background: "rgba(16, 185, 129, 0.18)",
                          color: "#6ee7b7",
                          padding: "2px 7px",
                          borderRadius: "6px",
                        }}
                      >
                        {item.quality} • {item.lang}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{
                      width: "auto",
                      padding: "8px 12px",
                      fontSize: "0.8rem",
                    }}
                  >
                    <Play size={14} />
                    <span>Phát</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Top Room Header */}
      <header className="room-header">
        <div className="room-header-left">
          <button
            type="button"
            onClick={onLeaveRoom}
            className="brand-logo"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "inherit",
            }}
            title="Về trang chủ"
          >
            <div
              className="brand-icon"
              style={{ width: "30px", height: "30px" }}
            >
              <Film size={16} />
            </div>
            <span className="hide-on-mobile" style={{ fontSize: "1.08rem" }}>
              CineParty
            </span>
          </button>

          <div className="room-badge">
            <span
              className="hide-on-mobile"
              style={{ color: "var(--text-secondary)" }}
            >
              Mã phòng:
            </span>
            <span className="room-code-text">#{roomId}</span>
          </div>

          <button
            type="button"
            onClick={handleCopyInvite}
            className="btn-secondary hide-on-mobile"
          >
            {copiedInvite ? (
              <Check size={15} color="#10b981" />
            ) : (
              <Copy size={15} />
            )}
            <span>{copiedInvite ? "Đã chép link!" : "Copy Link Mời"}</span>
          </button>

          <button
            type="button"
            onClick={handleNativeShare}
            className="btn-secondary mobile-only"
            title="Chia sẻ link phòng"
          >
            {copiedInvite ? (
              <Check size={14} color="#10b981" />
            ) : (
              <Share2 size={14} />
            )}
            <span>{copiedInvite ? "Đã chép" : "Mời"}</span>
          </button>
        </div>

        <div className="room-header-right">
          {media.type !== "empty" && media.type !== "screenshare" && (
            <div
              className="room-badge hide-on-mobile"
              style={{ gap: "6px" }}
              title="Trạng thái đồng bộ tự động của phòng"
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: playback.isPlaying ? "#10b981" : "#f59e0b",
                }}
              />
              <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                {media.movieTitle ? `${media.movieTitle} • ` : ""}
                <strong style={{ color: "var(--text-primary)" }}>
                  {formatTime(displayTimer)}
                </strong>
              </span>
              {canControl && (
                <button
                  type="button"
                  onClick={() =>
                    handlePlaybackAction(
                      "sync",
                      displayTimer,
                      playback.isPlaying
                    )
                  }
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#c4b5fd",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    marginLeft: "4px",
                  }}
                  title="Đồng bộ tất cả theo máy bạn"
                >
                  <RotateCcw size={13} />
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowSearchModal(true)}
            disabled={!canControl}
            className="btn-secondary"
            style={{
              borderColor: "rgba(139, 92, 246, 0.5)",
              color: "#ddd6fe",
            }}
            title="Tìm phim phát trực tiếp không dính giao diện web"
          >
            <Search size={14} color="#a78bfa" />
            <span>Tìm Phim</span>
          </button>

          <button
            type="button"
            onClick={() => setShowMobileUrlBar((v) => !v)}
            className={`btn-secondary mobile-only ${
              showMobileUrlBar ? "active-mode" : ""
            }`}
          >
            <Link2 size={14} />
            <span>Dán Link</span>
          </button>

          {media.type !== "empty" && (
            <button
              type="button"
              onClick={() => setMobileExpanded((v) => !v)}
              className="btn-secondary mobile-only"
              title="Phóng to / Thu nhỏ khung phim"
            >
              {mobileExpanded ? (
                <Minimize2 size={14} />
              ) : (
                <Maximize2 size={14} />
              )}
            </button>
          )}

          {isHost && (
            <button
              type="button"
              onClick={() =>
                socket?.emit("toggle-permissions", {
                  roomId,
                  allowAllControl: !allowAllControl,
                })
              }
              className="btn-secondary"
              title="Chỉnh quyền điều khiển phim trong phòng"
            >
              {allowAllControl ? (
                <Unlock size={14} color="#10b981" />
              ) : (
                <Lock size={14} color="#f59e0b" />
              )}
              <span className="hide-on-mobile">
                {allowAllControl
                  ? "Mọi người được chỉnh"
                  : "Chỉ Chủ phòng chỉnh"}
              </span>
            </button>
          )}

          <div className="room-badge">
            <Users size={14} color="#a78bfa" />
            <span>{users.length}</span>
            <span className="hide-on-mobile">người</span>
          </div>
        </div>
      </header>

      <div className="room-body">
        <div className="stage-column">
          {/* URL & Auto-Extractor Toolbar */}
          <div
            className={`url-toolbar ${
              !showMobileUrlBar && media.type !== "empty"
                ? "mobile-collapsed"
                : ""
            }`}
          >
            <form
              onSubmit={(e) => handleLoadMedia(e)}
              style={{ display: "flex", flex: 1, gap: "6px", width: "100%" }}
            >
              <div className="url-input-group">
                <Link2 size={15} color="var(--text-secondary)" />
                <input
                  type="text"
                  className="url-input"
                  placeholder={
                    canControl
                      ? "Dán link phim (Rophim, Motchill, YouTube...) hoặc nhập thẳng tên phim (VD: Gả Kim Thoa)..."
                      : "Chỉ Chủ phòng mới đổi được phim"
                  }
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  disabled={!canControl || isExtracting}
                />
              </div>
              <button
                type="submit"
                className="btn-primary"
                disabled={!canControl || isExtracting}
                style={{
                  width: "auto",
                  padding: "8px 14px",
                  fontSize: "0.84rem",
                }}
              >
                {isExtracting ? <Loader2 size={14} /> : <Play size={14} />}
                <span>
                  {isExtracting ? "Đang lấy video..." : "Phát Video"}
                </span>
              </button>
            </form>

            {screenSharerId === socket?.id ? (
              <button
                type="button"
                onClick={() => stopLocalScreenShare()}
                className="btn-danger"
              >
                <MonitorOff size={15} />
                <span>Dừng Chia Sẻ</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartScreenShare}
                disabled={!canControl}
                className={`btn-secondary hide-on-mobile ${
                  media.type === "screenshare" ? "active-mode" : ""
                }`}
                title="Phát trực tiếp tab trình duyệt đang mở phim (kèm âm thanh) cho cả phòng"
              >
                <MonitorUp size={15} color="#22d3ee" />
                <span>Chia Sẻ Màn Hình</span>
              </button>
            )}
          </div>

          {/* 100% Pure Video Stage (The exact red rectangle area!) */}
          <div
            className={`player-viewport ${
              mobileExpanded ? "mobile-expanded" : ""
            }`}
          >
            {isExtracting && (
              <div className="countdown-overlay" style={{ zIndex: 45 }}>
                <Loader2
                  size={42}
                  color="#a78bfa"
                  style={{ marginBottom: "12px" }}
                />
                <h3 style={{ fontSize: "1.05rem", marginBottom: "6px" }}>
                  Đang lấy luồng Video thuần (không giao diện web)...
                </h3>
                <p
                  style={{
                    fontSize: "0.84rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  Khung xem sẽ chỉ hiển thị duy nhất trình phát video và tự động
                  đồng bộ cho cả phòng.
                </p>
              </div>
            )}

            <div className="floating-reactions-container">
              {floatingReactions.map((r) => (
                <div key={r.id} className="floating-reaction-pill">
                  <span style={{ fontSize: "1.15rem" }}>{r.emoji}</span>
                  <span
                    style={{ color: "var(--text-secondary)", fontWeight: 600 }}
                  >
                    {r.senderName}
                  </span>
                </div>
              ))}
            </div>

            {media.type === "empty" && (
              <div
                style={{
                  maxWidth: "540px",
                  textAlign: "center",
                  padding: "16px",
                }}
              >
                <h2
                  style={{
                    fontSize: "1.15rem",
                    fontWeight: 800,
                    marginBottom: "8px",
                  }}
                >
                  Khung Xem Phim Thuần 100% — Phòng #{roomId}
                </h2>
                <p
                  style={{
                    color: "var(--text-secondary)",
                    fontSize: "0.84rem",
                    lineHeight: 1.5,
                    marginBottom: "14px",
                  }}
                >
                  Dán link bộ phim từ web phim bất kỳ (VD: Rophim, Motchill...)
                  hoặc nhập tên phim lên ô phía trên. Khung này sẽ{" "}
                  <strong>chỉ hiển thị duy nhất Video</strong> và tự động đồng
                  bộ đoạn đang xem cho mọi người!
                </p>

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "8px",
                    justifyContent: "center",
                  }}
                >
                  <button
                    type="button"
                    className="btn-primary"
                    style={{
                      width: "auto",
                      padding: "9px 16px",
                      fontSize: "0.84rem",
                    }}
                    onClick={() => setShowSearchModal(true)}
                  >
                    <Search size={15} />
                    <span>Tìm Phim Phát Ngay (Chỉ Hiện Video)</span>
                  </button>

                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      const demoMp4 =
                        "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
                      setUrlInput(demoMp4);
                      handleLoadMedia(null, demoMp4);
                    }}
                  >
                    <Play size={14} color="#34d399" />
                    <span>Thử Video Mẫu (.MP4)</span>
                  </button>
                </div>
              </div>
            )}

            {media.type === "screenshare" && (
              <ScreenShareStage
                socket={socket}
                roomId={roomId}
                sharerId={screenSharerId}
                sharerName={screenSharerName}
                localStream={localScreenStream}
                onStopLocalShare={() => stopLocalScreenShare()}
              />
            )}

            {(media.type === "video" ||
              media.type === "hls" ||
              media.type === "youtube") && (
              <SyncedVideoPlayer
                media={media}
                playback={playback}
                canControl={canControl}
                isHost={isHost}
                onPlaybackAction={handlePlaybackAction}
                socket={socket}
                roomId={roomId}
              />
            )}

            {media.type === "iframe" && effectiveIframeUrl && (
              <iframe
                key={effectiveIframeUrl}
                ref={iframeRef}
                src={effectiveIframeUrl}
                className="player-iframe"
                allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                allowFullScreen
                {...(media.sandbox
                  ? {
                      sandbox:
                        "allow-scripts allow-same-origin allow-forms allow-presentation",
                    }
                  : {})}
              />
            )}
          </div>
        </div>

        {/* Right / Bottom Sidebar */}
        <aside className="sidebar-column">
          <div className="sidebar-tabs">
            <button
              type="button"
              className={`sidebar-tab ${sidebarTab === "chat" ? "active" : ""}`}
              onClick={() => setSidebarTab("chat")}
            >
              <MessageSquare size={14} />
              <span>Chat</span>
            </button>
            <button
              type="button"
              className={`sidebar-tab ${
                sidebarTab === "episodes" ? "active" : ""
              }`}
              onClick={() => setSidebarTab("episodes")}
            >
              <ListVideo size={14} />
              <span>
                Tập Phim {hasEpisodes ? `(${media.episodes.length})` : ""}
              </span>
            </button>
            <button
              type="button"
              className={`sidebar-tab ${
                sidebarTab === "users" ? "active" : ""
              }`}
              onClick={() => setSidebarTab("users")}
            >
              <Users size={14} />
              <span>Bạn bè ({users.length})</span>
            </button>
          </div>

          {sidebarTab === "chat" && (
            <>
              <div className="chat-messages">
                {messages.map((m) =>
                  m.type === "system" ? (
                    <div key={m.id} className="msg-system">
                      {m.text}
                    </div>
                  ) : (
                    <div
                      key={m.id}
                      className={`msg-user ${
                        m.senderId === socket?.id ? "own" : ""
                      }`}
                    >
                      <div className="msg-header">
                        <span className="msg-author">
                          {m.isHost && <Crown size={12} color="#fbbf24" />}
                          {m.senderName}
                        </span>
                        <span style={{ color: "var(--text-muted)" }}>
                          {new Date(m.timestamp).toLocaleTimeString("vi-VN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <div style={{ wordBreak: "break-word" }}>{m.text}</div>
                    </div>
                  )
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="chat-footer">
                <div className="reaction-bar">
                  {["😂", "❤️", "😱", "🔥", "👏", "🍿"].map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className="emoji-btn"
                      onClick={() => handleSendReaction(emoji)}
                      title={`Thả biểu cảm ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>

                <form
                  onSubmit={handleSendChat}
                  style={{ display: "flex", gap: "6px" }}
                >
                  <input
                    type="text"
                    className="form-input"
                    style={{ padding: "9px 12px" }}
                    placeholder="Nhập tin nhắn..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="btn-primary"
                    style={{ width: "auto", padding: "9px 14px" }}
                  >
                    <Send size={15} />
                  </button>
                </form>
              </div>
            </>
          )}

          {sidebarTab === "episodes" && (
            <div
              style={{
                padding: "12px",
                overflowY: "auto",
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              {hasEpisodes ? (
                <>
                  <div
                    style={{
                      fontSize: "0.84rem",
                      fontWeight: 700,
                      color: "#c4b5fd",
                    }}
                  >
                    {media.movieTitle}
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))",
                      gap: "8px",
                    }}
                  >
                    {media.episodes.map((ep, idx) => (
                      <button
                        key={ep.slug || idx}
                        type="button"
                        disabled={!canControl}
                        onClick={() => handleSelectEpisode(ep, idx)}
                        className={`btn-secondary ${
                          media.currentEpisodeIndex === idx ? "active-mode" : ""
                        }`}
                        style={{ padding: "8px 6px", fontSize: "0.8rem" }}
                      >
                        {ep.name}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div
                  style={{
                    textAlign: "center",
                    color: "var(--text-secondary)",
                    padding: "24px 12px",
                    fontSize: "0.84rem",
                  }}
                >
                   Khi bạn dán link phim bộ hoặc chọn phim từ mục{" "}
                  <strong>Tìm Phim</strong>, danh sách tất cả các tập sẽ hiện ở
                  đây để bạn chuyển tập chỉ với 1 chạm.
                </div>
              )}
            </div>
          )}

          {sidebarTab === "users" && (
            <div
              style={{
                padding: "12px",
                overflowY: "auto",
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              {users.map((u) => (
                <div
                  key={u.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "9px 12px",
                    background: "var(--bg-tertiary)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "11px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        width: "30px",
                        height: "30px",
                        borderRadius: "50%",
                        background: u.isHost
                          ? "linear-gradient(135deg, #f59e0b, #d97706)"
                          : "rgba(139, 92, 246, 0.25)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        fontSize: "0.82rem",
                      }}
                    >
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: "0.86rem",
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          gap: "5px",
                        }}
                      >
                        <span>{u.name}</span>
                        {u.id === socket?.id && (
                          <span
                            style={{
                              fontSize: "0.72rem",
                              color: "var(--text-secondary)",
                            }}
                          >
                            (Bạn)
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: "0.73rem",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {u.isHost ? "👑 Chủ phòng" : "Thành viên"}
                        {screenSharerId === u.id
                          ? " • 🖥️ Đang phát màn hình"
                          : ""}
                      </div>
                    </div>
                  </div>

                  {isHost && u.id !== socket?.id && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: "5px 9px", fontSize: "0.73rem" }}
                      onClick={() =>
                        socket?.emit("transfer-host", {
                          roomId,
                          targetUserId: u.id,
                        })
                      }
                    >
                      Nhường Chủ phòng
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
