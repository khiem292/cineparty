"use client";

import { useEffect, useRef, useState } from "react";
import { MonitorUp, MonitorOff, Volume2, VolumeX, Maximize2 } from "lucide-react";

const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export default function ScreenShareStage({
  socket,
  roomId,
  sharerId,
  sharerName,
  localStream,
  onStopLocalShare,
}) {
  const videoRef = useRef(null);
  const peersRef = useRef(new Map()); // viewerId -> RTCPeerConnection (for sharer)
  const viewerPcRef = useRef(null); // RTCPeerConnection (for viewer)
  const [isMuted, setIsMuted] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("connecting");

  const isMeSharing = Boolean(socket && sharerId === socket.id);

  // 1. If I am the Sharer: preview my localStream and answer viewer requests
  useEffect(() => {
    if (!isMeSharing || !localStream || !socket) return;

    if (videoRef.current) {
      videoRef.current.srcObject = localStream;
      videoRef.current.muted = true; // Always mute own local preview to prevent echo
      videoRef.current.play().catch(() => {});
      setConnectionStatus("connected");
    }

    const createOfferForViewer = async (viewerId) => {
      try {
        if (peersRef.current.has(viewerId)) {
          peersRef.current.get(viewerId).close();
        }

        const pc = new RTCPeerConnection(RTC_CONFIG);
        peersRef.current.set(viewerId, pc);

        localStream.getTracks().forEach((track) => {
          pc.addTrack(track, localStream);
        });

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit("webrtc-ice-candidate", {
              targetId: viewerId,
              candidate: event.candidate,
            });
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit("webrtc-offer", {
          targetId: viewerId,
          sdp: pc.localDescription,
        });
      } catch (err) {
        console.error("Lỗi tạo kết nối WebRTC cho người xem:", err);
      }
    };

    const handleViewerReady = ({ viewerId }) => {
      if (viewerId && viewerId !== socket.id) {
        createOfferForViewer(viewerId);
      }
    };

    const handleAnswer = async ({ fromId, sdp }) => {
      const pc = peersRef.current.get(fromId);
      if (pc && sdp) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        } catch (err) {
          console.error("Lỗi setRemoteDescription answer:", err);
        }
      }
    };

    const handleIceCandidate = async ({ fromId, candidate }) => {
      const pc = peersRef.current.get(fromId);
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {}
      }
    };

    socket.on("webrtc-viewer-ready", handleViewerReady);
    socket.on("webrtc-answer", handleAnswer);
    socket.on("webrtc-ice-candidate", handleIceCandidate);

    return () => {
      socket.off("webrtc-viewer-ready", handleViewerReady);
      socket.off("webrtc-answer", handleAnswer);
      socket.off("webrtc-ice-candidate", handleIceCandidate);
      for (const pc of peersRef.current.values()) {
        pc.close();
      }
      peersRef.current.clear();
    };
  }, [isMeSharing, localStream, socket]);

  // 2. If I am a Viewer: request stream from sharerId and display incoming stream
  useEffect(() => {
    if (isMeSharing || !sharerId || !socket) return;

    setConnectionStatus("connecting");

    const setupViewerPeer = () => {
      if (viewerPcRef.current) {
        viewerPcRef.current.close();
      }

      const pc = new RTCPeerConnection(RTC_CONFIG);
      viewerPcRef.current = pc;

      pc.ontrack = (event) => {
        if (videoRef.current && event.streams && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0];
          setConnectionStatus("connected");
          videoRef.current.play().catch(() => {
            // If browser blocks unmuted autoplay, fallback to muted first and show unmute button
            if (videoRef.current) {
              videoRef.current.muted = true;
              setIsMuted(true);
              videoRef.current.play().catch(() => {});
            }
          });
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("webrtc-ice-candidate", {
            targetId: sharerId,
            candidate: event.candidate,
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          setConnectionStatus("connected");
        } else if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          setConnectionStatus("reconnecting");
        }
      };
    };

    setupViewerPeer();

    const handleOffer = async ({ fromId, sdp }) => {
      if (fromId !== sharerId) return;
      try {
        if (!viewerPcRef.current) setupViewerPeer();
        const pc = viewerPcRef.current;
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("webrtc-answer", {
          targetId: sharerId,
          sdp: pc.localDescription,
        });
      } catch (err) {
        console.error("Lỗi nhận WebRTC offer:", err);
      }
    };

    const handleIceCandidate = async ({ fromId, candidate }) => {
      if (fromId !== sharerId || !viewerPcRef.current || !candidate) return;
      try {
        await viewerPcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {}
    };

    socket.on("webrtc-offer", handleOffer);
    socket.on("webrtc-ice-candidate", handleIceCandidate);

    // Request the stream from sharer
    socket.emit("webrtc-request-stream", { targetSharerId: sharerId });

    return () => {
      socket.off("webrtc-offer", handleOffer);
      socket.off("webrtc-ice-candidate", handleIceCandidate);
      if (viewerPcRef.current) {
        viewerPcRef.current.close();
        viewerPcRef.current = null;
      }
    };
  }, [isMeSharing, sharerId, socket]);

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  };

  const handleFullscreen = () => {
    if (!videoRef.current) return;
    if (videoRef.current.requestFullscreen) {
      videoRef.current.requestFullscreen();
    }
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#000",
      }}
    >
      <video
        ref={videoRef}
        className="player-video"
        playsInline
        autoPlay
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />

      {/* Top Live Indicator */}
      <div
        style={{
          position: "absolute",
          top: "16px",
          left: "16px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          background: "rgba(9, 11, 16, 0.82)",
          border: "1px solid rgba(255,255,255,0.12)",
          padding: "8px 14px",
          borderRadius: "999px",
          fontSize: "0.84rem",
          zIndex: 20,
        }}
      >
        <span
          style={{
            width: "9px",
            height: "9px",
            borderRadius: "50%",
            background: "#ef4444",
            boxShadow: "0 0 10px #ef4444",
          }}
        />
        <span>
          {isMeSharing ? (
            <strong>Bạn đang phát trực tiếp màn hình cho cả phòng</strong>
          ) : (
            <>
              Đang xem màn hình của <strong>{sharerName || "Chủ phòng"}</strong>
            </>
          )}
        </span>
      </div>

      {/* Viewer Unmute Prompt if browser auto-muted */}
      {!isMeSharing && isMuted && connectionStatus === "connected" && (
        <button
          onClick={toggleMute}
          className="btn-primary"
          style={{
            position: "absolute",
            width: "auto",
            padding: "12px 22px",
            zIndex: 25,
          }}
        >
          <Volume2 size={18} />
          <span>Bấm để bật âm thanh phim</span>
        </button>
      )}

      {/* Connecting State for Viewer */}
      {!isMeSharing && connectionStatus !== "connected" && (
        <div
          style={{
            position: "absolute",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "10px",
            color: "var(--text-secondary)",
          }}
        >
          <MonitorUp size={36} color="#8b5cf6" />
          <span>Đang kết nối luồng hình ảnh từ {sharerName || "Chủ phòng"}...</span>
        </div>
      )}

      {/* Bottom Floating Controls */}
      <div
        style={{
          position: "absolute",
          bottom: "18px",
          right: "18px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          zIndex: 20,
        }}
      >
        {isMeSharing ? (
          <button type="button" onClick={onStopLocalShare} className="btn-danger">
            <MonitorOff size={16} />
            <span>Dừng chia sẻ màn hình</span>
          </button>
        ) : (
          <>
            <button type="button" onClick={toggleMute} className="btn-secondary">
              {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              <span>{isMuted ? "Đang tắt tiếng" : "Âm thanh bật"}</span>
            </button>
            <button type="button" onClick={handleFullscreen} className="btn-secondary">
              <Maximize2 size={16} />
              <span>Toàn màn hình</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
