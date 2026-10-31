"use client";

import { useEffect, useState, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { io } from "socket.io-client";
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
  ExternalLink,
} from "lucide-react";
import { parseMediaInput, formatTime, parseTimeInput } from "@/lib/urlParser";
import SyncedVideoPlayer from "@/components/SyncedVideoPlayer";
import ScreenShareStage from "@/components/ScreenShareStage";

export default function RoomPage({ params }) {
  const resolvedParams = use(params);
  const roomId = (resolvedParams?.roomId || "ROOM").toUpperCase();
  const router = useRouter();

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

  // Toolbar & UI state
  const [urlInput, setUrlInput] = useState("");
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [sidebarTab, setSidebarTab] = useState("chat"); // 'chat' | 'users' | 'help'
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [floatingReactions, setFloatingReactions] = useState([]);

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

  // Check saved username on mount
  useEffect(() => {
    const saved = localStorage.getItem("cineparty_username");
    if (saved && saved.trim()) {
      setUsername(saved.trim());
    } else {
      setNeedsNameModal(true);
    }
  }, []);

  // Connect to Socket.io once username is ready
  useEffect(() => {
    if (!username) return;

    const s = io({
      path: "/socket.io",
    });
    setSocket(s);

    s.on("connect", () => {
      s.emit("join-room", { roomId, username });

      // Check if host had pasted an initial URL when creating the room
      const initUrl = sessionStorage.getItem(`cineparty_init_url_${roomId}`);
      if (initUrl) {
        sessionStorage.removeItem(`cineparty_init_url_${roomId}`);
        const parsed = parseMediaInput(initUrl);
        if (parsed) {
          setUrlInput(initUrl);
          s.emit("change-media", { roomId, media: parsed });
        }
      }
    });

    s.on("room-state", (state) => {
      setHostId(state.hostId);
      setAllowAllControl(state.allowAllControl);
      setUsers(state.users || []);
      setMedia(state.media || { type: "empty", url: "", rawInput: "", sandbox: true });
      setUrlInput(state.media?.rawInput || state.media?.url || "");
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

    s.on("media-changed", ({ media: newMedia, playback: newPlayback, screenSharerId: sharerId, screenSharerName: sharerName }) => {
      setMedia(newMedia);
      setUrlInput(newMedia.rawInput || newMedia.url || "");
      setPlayback(newPlayback);
      setDisplayTimer(newPlayback.currentTime || 0);
      setScreenSharerId(sharerId || null);
      setScreenSharerName(sharerName || null);
    });

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

      // Also attempt to send standard postMessage commands to iframe players that support it
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
              JSON.stringify({ method: "setCurrentTime", value: newPlayback.currentTime }),
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

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Update shared reference timer every second when playback.isPlaying is true
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

  // Load media from URL input
  const handleLoadMedia = (e, customUrl) => {
    if (e) e.preventDefault();
    if (!canControl || !socket) return;

    const raw = customUrl !== undefined ? customUrl : urlInput;
    const parsed = parseMediaInput(raw);
    if (!parsed) return;

    // If I was sharing screen, stop it first
    if (localScreenStream) {
      stopLocalScreenShare();
    }

    socket.emit("change-media", {
      roomId,
      media: parsed,
    });
  };

  // Start WebRTC Screen Share
  const handleStartScreenShare = async () => {
    if (!canControl || !socket) return;
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

      // Detect when user clicks browser's native "Stop sharing" button
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          stopLocalScreenShare(stream);
        };
      }

      setLocalScreenStream(stream);
      socket.emit("start-screen-share", { roomId });
    } catch (err) {
      // User cancelled or browser denied
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

  const handleCopyInvite = () => {
    const inviteUrl = `${window.location.origin}/room/${roomId}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2200);
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
      <div className="landing-wrapper" style={{ justifyContent: "center", alignItems: "center" }}>
        <div className="auth-card" style={{ maxWidth: "420px", width: "100%" }}>
          <div className="brand-logo" style={{ marginBottom: "16px" }}>
            <div className="brand-icon">
              <Film size={20} />
            </div>
            <span>Tham gia phòng #{roomId}</span>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "18px" }}>
            Nhập tên hiển thị của bạn để mọi người trong phòng nhận ra bạn nhé:
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const finalName = tempName.trim() || `Khách_${Math.floor(100 + Math.random() * 900)}`;
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
      {/* Top Room Header */}
      <header className="room-header">
        <div className="room-header-left">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="brand-logo"
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "inherit" }}
            title="Về trang chủ"
          >
            <div className="brand-icon" style={{ width: "32px", height: "32px" }}>
              <Film size={17} />
            </div>
            <span style={{ fontSize: "1.1rem" }}>CineParty</span>
          </button>

          <div className="room-badge">
            <span style={{ color: "var(--text-secondary)" }}>Mã phòng:</span>
            <span className="room-code-text">{roomId}</span>
          </div>

          <button type="button" onClick={handleCopyInvite} className="btn-secondary">
            {copiedInvite ? <Check size={15} color="#10b981" /> : <Copy size={15} />}
            <span>{copiedInvite ? "Đã chép link mời!" : "Copy Link Mời Bạn Bè"}</span>
          </button>
        </div>

        <div className="room-header-right">
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
              {allowAllControl ? <Unlock size={15} color="#10b981" /> : <Lock size={15} color="#f59e0b" />}
              <span>{allowAllControl ? "Mọi người được chỉnh" : "Chỉ Chủ phòng chỉnh"}</span>
            </button>
          )}

          <div className="room-badge">
            <Users size={15} color="#a78bfa" />
            <span>{users.length} người đang xem</span>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <div className="room-body">
        {/* Left Stage Column */}
        <div className="stage-column">
          {/* Media Input & Screen Share Toolbar */}
          <div className="url-toolbar">
            <form onSubmit={(e) => handleLoadMedia(e)} style={{ display: "flex", flex: 1, gap: "8px", minWidth: "260px" }}>
              <div className="url-input-group">
                <Link2 size={16} color="var(--text-secondary)" />
                <input
                  type="text"
                  className="url-input"
                  placeholder={
                    canControl
                      ? "Dán link web phim, mã nhúng <iframe...>, link .m3u8, .mp4 hoặc YouTube vào đây..."
                      : "Chỉ Chủ phòng mới có quyền đổi link phim"
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
                style={{ width: "auto", padding: "9px 18px", fontSize: "0.86rem" }}
              >
                <Play size={15} />
                <span>Phát Link Này</span>
              </button>
            </form>

            {screenSharerId === socket?.id ? (
              <button type="button" onClick={() => stopLocalScreenShare()} className="btn-danger">
                <MonitorOff size={16} />
                <span>Dừng Chia Sẻ Màn Hình</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartScreenShare}
                disabled={!canControl}
                className={`btn-secondary ${media.type === "screenshare" ? "active-mode" : ""}`}
                title="Phát trực tiếp tab trình duyệt đang mở phim (kèm âm thanh) cho cả phòng"
              >
                <MonitorUp size={16} color="#22d3ee" />
                <span>Chia Sẻ Màn Hình (Kèm Âm Thanh)</span>
              </button>
            )}
          </div>

          {/* Video / Iframe / ScreenShare Viewport */}
          <div className="player-viewport">
            {/* 3-2-1 Countdown Overlay for Synchronized Play */}
            {countdownValue && (
              <div className="countdown-overlay">
                <div className="countdown-number">
                  {countdownValue === "GO" ? "BẤM PLAY!" : countdownValue}
                </div>
                <p style={{ fontSize: "1.1rem", color: "#e5e7eb", maxWidth: "460px" }}>
                  {countdownInfo?.startedBy} khởi động đếm ngược! Hãy chuẩn bị bấm nút{" "}
                  <strong>Play (▶)</strong> trên trình phát phim tại mốc{" "}
                  <strong>{formatTime(countdownInfo?.targetTime || 0)}</strong> khi đếm về 0!
                </p>
              </div>
            )}

            {/* Floating Emoji Reactions */}
            <div className="floating-reactions-container">
              {floatingReactions.map((r) => (
                <div key={r.id} className="floating-reaction-pill">
                  <span style={{ fontSize: "1.25rem" }}>{r.emoji}</span>
                  <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>{r.senderName}</span>
                </div>
              ))}
            </div>

            {/* Stage Content by Media Type */}
            {media.type === "empty" && (
              <div style={{ maxWidth: "560px", textAlign: "center", padding: "28px" }}>
                <div
                  style={{
                    width: "64px",
                    height: "64px",
                    borderRadius: "18px",
                    background: "rgba(139, 92, 246, 0.15)",
                    border: "1px solid rgba(139, 92, 246, 0.35)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 18px",
                    color: "#c4b5fd",
                  }}
                >
                  <Film size={32} />
                </div>
                <h2 style={{ fontSize: "1.4rem", fontWeight: 800, marginBottom: "10px" }}>
                  Rạp chiếu #{roomId} đã sẵn sàng!
                </h2>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.92rem", lineHeight: 1.6, marginBottom: "22px" }}>
                  Dán <strong>link phim nhúng (Iframe)</strong>, link <strong>.m3u8 / .mp4 / YouTube</strong> lên thanh công cụ phía trên, hoặc chọn <strong>Chia sẻ màn hình</strong> để phát trực tiếp tab web phim cho cả phòng.
                </p>

                <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", justifyContent: "center" }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      const demoMp4 = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
                      setUrlInput(demoMp4);
                      handleLoadMedia(null, demoMp4);
                    }}
                  >
                    <Play size={15} color="#34d399" />
                    <span>Thử Video Mẫu (.MP4 Tự Đồng Bộ)</span>
                  </button>

                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleStartScreenShare}
                  >
                    <MonitorUp size={15} color="#22d3ee" />
                    <span>Bật Chia Sẻ Màn Hình Phim</span>
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

            {(media.type === "video" || media.type === "hls" || media.type === "youtube") && (
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

          {/* Bottom Synchronization & Control Bar */}
          {media.type !== "empty" && media.type !== "screenshare" && (
            <div className="sync-control-bar">
              {media.type === "iframe" ? (
                <>
                  {/* Left: Shared Reference Timer & 3-2-1 Countdown for Cross-Origin Iframes */}
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        background: "var(--bg-primary)",
                        border: "1px solid var(--border-color)",
                        padding: "6px 12px",
                        borderRadius: "9px",
                      }}
                    >
                      <Timer size={16} color="#a78bfa" />
                      <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                        Giờ chuẩn của phòng:
                      </span>
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontWeight: 800,
                          fontSize: "1rem",
                          color: playback.isPlaying ? "#34d399" : "#fbbf24",
                        }}
                      >
                        {formatTime(displayTimer)}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <input
                        type="text"
                        value={targetTimeStr}
                        onChange={(e) => setTargetTimeStr(e.target.value)}
                        placeholder="00:00"
                        title="Nhập mốc phút:giây muốn đồng bộ (VD: 12:30)"
                        style={{
                          width: "70px",
                          padding: "6px 8px",
                          background: "var(--bg-primary)",
                          border: "1px solid var(--border-color)",
                          borderRadius: "8px",
                          color: "var(--text-primary)",
                          fontFamily: "monospace",
                          fontSize: "0.85rem",
                          textAlign: "center",
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleStartCountdown}
                        className="btn-primary"
                        style={{ width: "auto", padding: "7px 14px", fontSize: "0.83rem" }}
                      >
                        <Sparkles size={14} />
                        <span>Đếm Ngược 3-2-1 Bấm Play Cùng Lúc</span>
                      </button>
                    </div>

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
                        {playback.isPlaying ? <Pause size={14} /> : <Play size={14} />}
                        <span>{playback.isPlaying ? "Tạm dừng đồng hồ" : "Chạy đồng hồ"}</span>
                      </button>
                    )}
                  </div>

                  {/* Right: Sandbox Ad-Blocker Toggle & Reload */}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={handleToggleSandbox}
                      disabled={!canControl}
                      className={`btn-secondary ${media.sandbox ? "active-mode" : ""}`}
                      title="Chặn web phim tự ý mở tab quảng cáo khi bấm vào video. Nếu trình phát báo lỗi chặn Sandbox, hãy bấm để tắt."
                    >
                      {media.sandbox ? <Shield size={15} color="#34d399" /> : <ShieldOff size={15} color="#f59e0b" />}
                      <span>{media.sandbox ? "Chặn Popup Quảng Cáo: BẬT" : "Chặn Popup: TẮT"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIframeKey((k) => k + 1)}
                      className="btn-secondary"
                      title="Tải lại khung Iframe"
                    >
                      <RotateCcw size={14} />
                      <span>Tải lại Player</span>
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* Automatic Sync Status for Direct Video / HLS / YouTube */}
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span
                      style={{
                        width: "9px",
                        height: "9px",
                        borderRadius: "50%",
                        background: playback.isPlaying ? "#10b981" : "#f59e0b",
                      }}
                    />
                    <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      Đồng bộ tự động:{" "}
                      <strong style={{ color: "var(--text-primary)" }}>
                        {playback.isPlaying ? "Đang phát" : "Đang tạm dừng"} tại {formatTime(displayTimer)}
                      </strong>{" "}
                      (cập nhật bởi {playback.controllerName})
                    </span>
                  </div>

                  {canControl && (
                    <button
                      type="button"
                      onClick={() =>
                        handlePlaybackAction("sync", displayTimer, playback.isPlaying)
                      }
                      className="btn-secondary"
                    >
                      <RotateCcw size={14} />
                      <span>Đồng bộ tất cả theo thời gian này</span>
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Right Sidebar Column */}
        <aside className="sidebar-column">
          <div className="sidebar-tabs">
            <button
              type="button"
              className={`sidebar-tab ${sidebarTab === "chat" ? "active" : ""}`}
              onClick={() => setSidebarTab("chat")}
            >
              <MessageSquare size={15} />
              <span>Chat</span>
            </button>
            <button
              type="button"
              className={`sidebar-tab ${sidebarTab === "users" ? "active" : ""}`}
              onClick={() => setSidebarTab("users")}
            >
              <Users size={15} />
              <span>Bạn bè ({users.length})</span>
            </button>
            <button
              type="button"
              className={`sidebar-tab ${sidebarTab === "help" ? "active" : ""}`}
              onClick={() => setSidebarTab("help")}
            >
              <HelpCircle size={15} />
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
                      className={`msg-user ${m.senderId === socket?.id ? "own" : ""}`}
                    >
                      <div className="msg-header">
                        <span className="msg-author">
                          {m.isHost && <Crown size={13} color="#fbbf24" />}
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
                      title={`Thả biểu cảm ${emoji} lên màn hình`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleSendChat} style={{ display: "flex", gap: "6px" }}>
                  <input
                    type="text"
                    className="form-input"
                    style={{ padding: "9px 12px", fontSize: "0.86rem" }}
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
            <div style={{ padding: "14px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "10px" }}>
              {users.map((u) => (
                <div
                  key={u.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 12px",
                    background: "var(--bg-tertiary)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "11px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "50%",
                        background: u.isHost
                          ? "linear-gradient(135deg, #f59e0b, #d97706)"
                          : "rgba(139, 92, 246, 0.25)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        fontSize: "0.85rem",
                      }}
                    >
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: "0.88rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "5px" }}>
                        <span>{u.name}</span>
                        {u.id === socket?.id && (
                          <span style={{ fontSize: "0.73rem", color: "var(--text-secondary)" }}>(Bạn)</span>
                        )}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                        {u.isHost ? "👑 Chủ phòng" : "Thành viên"}
                        {screenSharerId === u.id ? " • 🖥️ Đang phát màn hình" : ""}
                      </div>
                    </div>
                  </div>

                  {isHost && u.id !== socket?.id && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: "5px 9px", fontSize: "0.75rem" }}
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
            <div style={{ padding: "16px", overflowY: "auto", flex: 1, fontSize: "0.84rem", lineHeight: 1.55, color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ background: "var(--bg-tertiary)", padding: "12px", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
                <h4 style={{ color: "var(--text-primary)", marginBottom: "6px" }}>
                  1. Khi dán link từ các web xem phim (Iframe)
                </h4>
                <p>
                  Do chính sách bảo mật trình duyệt, các trang web phim ngoài không cho phép trang web khác tự ý bấm nút Play/Tua bên trong khung của họ. Vì vậy CineParty trang bị cho bạn:
                </p>
                <ul style={{ paddingLeft: "18px", marginTop: "6px" }}>
                  <li>
                    <strong>Đếm ngược 3-2-1 Bấm Play Cùng Lúc:</strong> Cả phòng sẽ thấy hiệu ứng đếm ngược 3-2-1 trên màn hình để bấm Play cùng một tích tắc.
                  </li>
                  <li>
                    <strong>Chặn Popup Quảng Cáo:</strong> Giữ cho việc bấm vào player không bị nhảy sang các trang quảng cáo. (Nếu gặp web phim bắt tắt Sandbox mới cho xem, bạn chỉ cần bấm nút tắt Chặn Popup ở góc dưới).
                  </li>
                </ul>
              </div>

              <div style={{ background: "var(--bg-tertiary)", padding: "12px", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
                <h4 style={{ color: "var(--text-primary)", marginBottom: "6px" }}>
                  2. Mẹo xem mượt 100% không quảng cáo: Chia sẻ màn hình
                </h4>
                <p>
                  Nếu một web phim chặn không cho nhúng Iframe (báo lỗi từ chối kết nối), một người chỉ cần mở phim ở tab bên cạnh rồi bấm nút{" "}
                  <strong style={{ color: "#22d3ee" }}>Chia Sẻ Màn Hình (Kèm Âm Thanh)</strong>, chọn tab phim đó và tích vào ô <em>&quot;Chia sẻ âm thanh tab&quot;</em>. Cả phòng sẽ xem cùng nhau chuẩn từng khung hình!
                </p>
              </div>

              <div style={{ background: "var(--bg-tertiary)", padding: "12px", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
                <h4 style={{ color: "var(--text-primary)", marginBottom: "6px" }}>
                  3. Tự động đồng bộ 2 chiều (.m3u8, .mp4, YouTube)
                </h4>
                <p>
                  Nếu bạn dán link YouTube, file <code>.mp4</code> hoặc link luồng <code>.m3u8</code> (lấy từ F12 Network của web phim), bất kỳ ai bấm Tạm dừng hoặc Tua là máy của tất cả mọi người tự động tua theo ngay lập tức!
                </p>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
