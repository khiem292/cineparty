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
  Pause,
  RotateCcw,
  Shield,
  ShieldOff,
  Timer,
  Send,
  HelpCircle,
  Lock,
  Unlock,
  Sparkles,
  Maximize2,
  Minimize2,
  Share2,
} from "lucide-react";
import { parseMediaInput, formatTime, parseTimeInput } from "@/lib/urlParser";
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
  });
  const [playback, setPlayback] = useState({
    isPlaying: false,
    currentTime: 0,
    updatedAt: Date.now(),
    controllerName: "Hệ thống",
  });
  const [screenSharerId, setScreenSharerId] = useState(null);
  const [screenSharerName, setScreenSharerName] = useState(null);
  const [localScreenStream, setLocalScreenStream] = useState(null);

  // Toolbar & Mobile UI state
  const [urlInput, setUrlInput] = useState("");
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [sidebarTab, setSidebarTab] = useState("chat"); // 'chat' | 'users' | 'help'
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [floatingReactions, setFloatingReactions] = useState([]);
  const [showMobileUrlBar, setShowMobileUrlBar] = useState(true);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [mobileToast, setMobileToast] = useState("");

  // Countdown & Reference Timer for Iframe Embeds
  const [countdownValue, setCountdownValue] = useState(null); // 3 | 2 | 1 | 'GO' | null
  const [countdownInfo, setCountdownInfo] = useState(null);
  const [displayTimer, setDisplayTimer] = useState(0);
  const [targetTimeStr, setTargetTimeStr] = useState("00:00");
  const [iframeKey, setIframeKey] = useState(0);

  const iframeRef = useRef(null);
  const chatEndRef = useRef(null);

  const isHost = Boolean(socket && hostId === socket.id);
  const canControl = isHost || allowAllControl;

  const showToast = (msg) => {
    setMobileToast(msg);
    setTimeout(() => setMobileToast(""), 3800);
  };

  // Check saved username on mount
  useEffect(() => {
    const saved = localStorage.getItem("cineparty_username");
    if (saved && saved.trim()) {
      setUsername(saved.trim());
    } else {
      setNeedsNameModal(true);
    }
  }, []);

  // Connect P2P Room Client once username is ready
  useEffect(() => {
    if (!username) return;

    const s = createP2PRoomClient(roomId);
    setSocket(s);

    s.on("connect", () => {
      s.emit("join-room", { roomId, username });

      const initUrl = sessionStorage.getItem(`cineparty_init_url_${roomId}`);
      if (initUrl) {
        sessionStorage.removeItem(`cineparty_init_url_${roomId}`);
        const parsed = parseMediaInput(initUrl);
        if (parsed) {
          setUrlInput(initUrl);
          s.emit("change-media", { roomId, media: parsed });
          setShowMobileUrlBar(false);
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
      setPlayback(
        state.playback || {
          isPlaying: false,
          currentTime: 0,
          updatedAt: Date.now(),
          controllerName: "Hệ thống",
        }
      );
      setDisplayTimer(state.playback?.currentTime || 0);
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
        setPlayback(newPlayback);
        setDisplayTimer(newPlayback.currentTime || 0);
        setScreenSharerId(sharerId || null);
        setScreenSharerName(sharerName || null);
        if (newMedia.type !== "empty") {
          setShowMobileUrlBar(false);
        }
      }
    );

    s.on("sandbox-toggled", ({ sandbox }) => {
      setMedia((prev) => ({ ...prev, sandbox }));
      setIframeKey((k) => k + 1);
    });

    s.on("playback-update", ({ action, playback: newPlayback }) => {
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
            win.postMessage({ event: "command", func: "playVideo", args: "" }, "*");
          } else {
            win.postMessage(JSON.stringify({ method: "pause" }), "*");
            win.postMessage({ event: "command", func: "pauseVideo", args: "" }, "*");
          }
          if (action === "seek") {
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
    });

    s.on("countdown-started", ({ startedBy, targetTime }) => {
      setCountdownInfo({ startedBy, targetTime });
      setCountdownValue(3);
      setTimeout(() => setCountdownValue(2), 1000);
      setTimeout(() => setCountdownValue(1), 2000);
      setTimeout(() => setCountdownValue("GO"), 3000);
      setTimeout(() => {
        setCountdownValue(null);
        setCountdownInfo(null);
      }, 4300);
    });

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

  const handleLoadMedia = (e, customUrl) => {
    if (e) e.preventDefault();
    if (!canControl || !socket) return;

    const raw = customUrl !== undefined ? customUrl : urlInput;
    const parsed = parseMediaInput(raw);
    if (!parsed) return;

    if (localScreenStream) {
      stopLocalScreenShare();
    }

    socket.emit("change-media", {
      roomId,
      media: parsed,
    });
    setShowMobileUrlBar(false);
  };

  const handleStartScreenShare = async () => {
    if (!canControl || !socket) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      showToast(
        "📱 Trình duyệt điện thoại chỉ hỗ trợ XEM chia sẻ màn hình từ máy tính. Trên điện thoại, bạn hãy dán link phim (Iframe / .m3u8 / .mp4 / YouTube) nhé!"
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

  const handleStartCountdown = () => {
    if (!socket) return;
    const targetSeconds = parseTimeInput(targetTimeStr);
    socket.emit("start-countdown", {
      roomId,
      targetTime: targetSeconds,
    });
  };

  const handleToggleSandbox = () => {
    if (!canControl || !socket) return;
    socket.emit("toggle-sandbox", {
      roomId,
      sandbox: !media.sandbox,
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
            Nhập tên hiển thị của bạn để mọi người trong phòng nhận ra bạn nhé:
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
              Vào Phòng Xem Chung
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="room-layout">
      {/* Toast Notification for Mobile */}
      {mobileToast && (
        <div
          style={{
            position: "fixed",
            top: "58px",
            left: "12px",
            right: "12px",
            background: "rgba(17, 21, 31, 0.96)",
            border: "1px solid var(--accent-primary)",
            color: "var(--text-primary)",
            padding: "11px 14px",
            borderRadius: "12px",
            fontSize: "0.84rem",
            zIndex: 100,
            boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
            textAlign: "center",
          }}
        >
          {mobileToast}
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
            <div className="brand-icon" style={{ width: "30px", height: "30px" }}>
              <Film size={16} />
            </div>
            <span className="hide-on-mobile" style={{ fontSize: "1.08rem" }}>
              CineParty
            </span>
          </button>

          <div className="room-badge">
            <span className="hide-on-mobile" style={{ color: "var(--text-secondary)" }}>
              Mã phòng:
            </span>
            <span className="room-code-text">#{roomId}</span>
          </div>

          <button
            type="button"
            onClick={handleCopyInvite}
            className="btn-secondary hide-on-mobile"
          >
            {copiedInvite ? <Check size={15} color="#10b981" /> : <Copy size={15} />}
            <span>{copiedInvite ? "Đã chép link!" : "Copy Link Mời"}</span>
          </button>

          {/* Compact Share / Copy button on Mobile */}
          <button
            type="button"
            onClick={handleNativeShare}
            className="btn-secondary mobile-only"
            title="Chia sẻ link phòng"
          >
            {copiedInvite ? <Check size={14} color="#10b981" /> : <Share2 size={14} />}
            <span>{copiedInvite ? "Đã chép" : "Mời"}</span>
          </button>
        </div>

        <div className="room-header-right">
          {/* Mobile button to toggle URL input bar */}
          <button
            type="button"
            onClick={() => setShowMobileUrlBar((v) => !v)}
            className={`btn-secondary mobile-only ${showMobileUrlBar ? "active-mode" : ""}`}
          >
            <Link2 size={14} />
            <span>Đổi Phim</span>
          </button>

          {/* Mobile button to expand/shrink video player */}
          {media.type !== "empty" && (
            <button
              type="button"
              onClick={() => setMobileExpanded((v) => !v)}
              className="btn-secondary mobile-only"
              title="Phóng to / Thu nhỏ khung phim"
            >
              {mobileExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
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
                {allowAllControl ? "Mọi người được chỉnh" : "Chỉ Chủ phòng chỉnh"}
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
          {/* URL & Screen Share Toolbar (Collapsible on Mobile) */}
          <div
            className={`url-toolbar ${
              !showMobileUrlBar && media.type !== "empty" ? "mobile-collapsed" : ""
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
                      ? "Dán link phim, <iframe...>, .m3u8, .mp4, YouTube..."
                      : "Chỉ Chủ phòng mới đổi được link phim"
                  }
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  disabled={!canControl}
                />
              </div>
              <button
                type="submit"
                className="btn-primary"
                disabled={!canControl}
                style={{ width: "auto", padding: "8px 14px", fontSize: "0.84rem" }}
              >
                <Play size={14} />
                <span>Phát</span>
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
                <span>Chia Sẻ Màn Hình (Kèm Âm Thanh)</span>
              </button>
            )}
          </div>

          {/* Cinema Player Viewport */}
          <div
            className={`player-viewport ${
              mobileExpanded ? "mobile-expanded" : ""
            }`}
          >
            {countdownValue && (
              <div className="countdown-overlay">
                <div className="countdown-number">
                  {countdownValue === "GO" ? "BẤM PLAY!" : countdownValue}
                </div>
                <p
                  style={{
                    fontSize: "0.95rem",
                    color: "#e5e7eb",
                    maxWidth: "420px",
                  }}
                >
                  {countdownInfo?.startedBy} đếm ngược! Hãy bấm{" "}
                  <strong>Play (▶)</strong> tại mốc{" "}
                  <strong>{formatTime(countdownInfo?.targetTime || 0)}</strong>!
                </p>
              </div>
            )}

            <div className="floating-reactions-container">
              {floatingReactions.map((r) => (
                <div key={r.id} className="floating-reaction-pill">
                  <span style={{ fontSize: "1.15rem" }}>{r.emoji}</span>
                  <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>
                    {r.senderName}
                  </span>
                </div>
              ))}
            </div>

            {media.type === "empty" && (
              <div
                style={{
                  maxWidth: "520px",
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
                  Rạp chiếu #{roomId} đã sẵn sàng!
                </h2>
                <p
                  style={{
                    color: "var(--text-secondary)",
                    fontSize: "0.84rem",
                    lineHeight: 1.5,
                    marginBottom: "14px",
                  }}
                >
                  Dán <strong>link phim nhúng (Iframe)</strong>, link{" "}
                  <strong>.m3u8 / .mp4 / YouTube</strong> lên ô phía trên rồi bấm{" "}
                  <strong>Phát</strong> để xem cùng nhau.
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

                  <button
                    type="button"
                    className="btn-secondary hide-on-mobile"
                    onClick={handleStartScreenShare}
                  >
                    <MonitorUp size={14} color="#22d3ee" />
                    <span>Chia Sẻ Màn Hình Phim</span>
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
                onPlaybackAction={handlePlaybackAction}
                socket={socket}
                roomId={roomId}
              />
            )}

            {media.type === "iframe" && media.url && (
              <iframe
                key={`${media.url}-${iframeKey}-${media.sandbox}`}
                ref={iframeRef}
                src={media.url}
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

          {/* Sync Control Strip */}
          {media.type !== "empty" && media.type !== "screenshare" && (
            <div className="sync-control-bar">
              {media.type === "iframe" ? (
                <>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        background: "var(--bg-primary)",
                        border: "1px solid var(--border-color)",
                        padding: "5px 10px",
                        borderRadius: "8px",
                      }}
                    >
                      <Timer size={14} color="#a78bfa" />
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontWeight: 800,
                          fontSize: "0.92rem",
                          color: playback.isPlaying ? "#34d399" : "#fbbf24",
                        }}
                      >
                        {formatTime(displayTimer)}
                      </span>
                    </div>

                    <input
                      type="text"
                      value={targetTimeStr}
                      onChange={(e) => setTargetTimeStr(e.target.value)}
                      placeholder="00:00"
                      title="Nhập mốc phút:giây muốn đồng bộ (VD: 12:30)"
                      style={{
                        width: "62px",
                        padding: "5px 6px",
                        background: "var(--bg-primary)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "8px",
                        color: "var(--text-primary)",
                        fontFamily: "monospace",
                        fontSize: "0.82rem",
                        textAlign: "center",
                      }}
                    />

                    <button
                      type="button"
                      onClick={handleStartCountdown}
                      className="btn-primary"
                      style={{
                        width: "auto",
                        padding: "6px 12px",
                        fontSize: "0.78rem",
                      }}
                    >
                      <Sparkles size={13} />
                      <span>Đếm 3-2-1 Play</span>
                    </button>

                    {canControl && (
                      <button
                        type="button"
                        onClick={() =>
                          handlePlaybackAction(
                            playback.isPlaying ? "pause" : "play",
                            displayTimer,
                            !playback.isPlaying
                          )
                        }
                        className="btn-secondary"
                      >
                        {playback.isPlaying ? (
                          <Pause size={13} />
                        ) : (
                          <Play size={13} />
                        )}
                      </button>
                    )}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      flexShrink: 0,
                    }}
                  >
                    <button
                      type="button"
                      onClick={handleToggleSandbox}
                      disabled={!canControl}
                      className={`btn-secondary ${
                        media.sandbox ? "active-mode" : ""
                      }`}
                      title="Chặn quảng cáo mở tab mới"
                    >
                      {media.sandbox ? (
                        <Shield size={14} color="#34d399" />
                      ) : (
                        <ShieldOff size={14} color="#f59e0b" />
                      )}
                      <span>
                        {media.sandbox ? "Chặn QC: BẬT" : "Chặn QC: TẮT"}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIframeKey((k) => k + 1)}
                      className="btn-secondary"
                      title="Tải lại khung Iframe"
                    >
                      <RotateCcw size={13} />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: playback.isPlaying ? "#10b981" : "#f59e0b",
                      }}
                    />
                    <span
                      style={{
                        fontSize: "0.8rem",
                        color: "var(--text-secondary)",
                      }}
                    >
                      <strong style={{ color: "var(--text-primary)" }}>
                        {playback.isPlaying ? "Đang phát" : "Tạm dừng"} (
                        {formatTime(displayTimer)})
                      </strong>{" "}
                      • {playback.controllerName}
                    </span>
                  </div>

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
                      className="btn-secondary"
                    >
                      <RotateCcw size={13} />
                      <span>Đồng bộ theo tôi</span>
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Bottom / Right Sidebar (Chat, Users, Tips) */}
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
                sidebarTab === "users" ? "active" : ""
              }`}
              onClick={() => setSidebarTab("users")}
            >
              <Users size={14} />
              <span>Bạn bè ({users.length})</span>
            </button>
            <button
              type="button"
              className={`sidebar-tab ${sidebarTab === "help" ? "active" : ""}`}
              onClick={() => setSidebarTab("help")}
            >
              <HelpCircle size={14} />
              <span>Mẹo Xem</span>
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

          {sidebarTab === "help" && (
            <div
              style={{
                padding: "12px",
                overflowY: "auto",
                flex: 1,
                fontSize: "0.82rem",
                lineHeight: 1.5,
                color: "var(--text-secondary)",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <div
                style={{
                  background: "var(--bg-tertiary)",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  border: "1px solid var(--border-color)",
                }}
              >
                <h4 style={{ color: "var(--text-primary)", marginBottom: "4px" }}>
                  📱 Mẹo xem trên Điện Thoại
                </h4>
                <p>
                  • Bấm nút <strong>Đổi Phim</strong> ở thanh trên cùng để mở/ẩn
                  ô dán link phim.
                  <br />• Bấm biểu tượng <strong>Phóng to [ ]</strong> ở góc
                  trên để mở rộng khung phim, hoặc xoay ngang điện thoại để xem
                  chế độ toàn cảnh.
                </p>
              </div>

              <div
                style={{
                  background: "var(--bg-tertiary)",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  border: "1px solid var(--border-color)",
                }}
              >
                <h4 style={{ color: "var(--text-primary)", marginBottom: "4px" }}>
                  🎬 Khi dán link web phim (Iframe)
                </h4>
                <p>
                  Bấm <strong>Đếm 3-2-1 Play</strong> để cả phòng cùng bấm Play
                  tại một mốc thời gian. Nếu trình phát báo lỗi chặn Sandbox,
                  hãy bấm tắt nút <strong>Chặn QC</strong>.
                </p>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
