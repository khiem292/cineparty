"use client";

import Peer from "peerjs";

const HOST_PREFIX = "cineparty-vn-room-";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

function formatSeconds(sec) {
  const s = Math.floor(sec || 0);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
}

export function createP2PRoomClient(roomId) {
  const normalizedRoomId = roomId.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  const hostPeerId = `${HOST_PREFIX}${normalizedRoomId}`;

  const listeners = new Map(); // event -> Set<callback>
  let peer = null;
  let isHostNode = false;
  let hostConn = null; // Used when this client is a Guest
  const guestConns = new Map(); // peerId -> DataConnection (Used when this client is the Host)
  const pendingEmits = [];
  let isReady = false;
  let isDestroyed = false;

  // Authoritative state (only used when isHostNode === true)
  const roomState = {
    roomId: normalizedRoomId,
    hostId: null,
    allowAllControl: true,
    screenSharerId: null,
    screenSharerName: null,
    media: {
      type: "empty",
      url: "",
      rawInput: "",
      sandbox: true,
    },
    playback: {
      isPlaying: false,
      currentTime: 0,
      updatedAt: Date.now(),
      controllerName: "Hệ thống",
    },
    users: new Map(),
    messages: [],
  };

  function triggerLocal(event, data) {
    const set = listeners.get(event);
    if (set) {
      for (const cb of set) {
        try {
          cb(data);
        } catch (err) {
          console.error(`Lỗi xử lý sự kiện ${event}:`, err);
        }
      }
    }
  }

  function broadcastFromHost(event, payload, excludePeerId = null) {
    if (excludePeerId !== client.id) {
      triggerLocal(event, payload);
    }
    for (const [peerId, conn] of guestConns.entries()) {
      if (peerId !== excludePeerId && conn.open) {
        try {
          conn.send({ event, payload });
        } catch {}
      }
    }
  }

  function sendToSpecificPeer(targetPeerId, event, payload) {
    if (targetPeerId === client.id) {
      triggerLocal(event, payload);
      return;
    }
    const conn = guestConns.get(targetPeerId);
    if (conn && conn.open) {
      try {
        conn.send({ event, payload });
      } catch {}
    }
  }

  function serializeRoomState() {
    let estimatedTime = roomState.playback.currentTime;
    if (roomState.playback.isPlaying) {
      const elapsed = (Date.now() - roomState.playback.updatedAt) / 1000;
      estimatedTime += Math.max(0, elapsed);
    }
    return {
      roomId: roomState.roomId,
      hostId: roomState.hostId,
      allowAllControl: roomState.allowAllControl,
      screenSharerId: roomState.screenSharerId,
      screenSharerName: roomState.screenSharerName,
      media: roomState.media,
      playback: {
        ...roomState.playback,
        currentTime: estimatedTime,
      },
      users: Array.from(roomState.users.values()),
      messages: roomState.messages.slice(-50),
    };
  }

  function addSystemMessage(text) {
    const msg = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: "system",
      text,
      timestamp: Date.now(),
    };
    roomState.messages.push(msg);
    if (roomState.messages.length > 100) roomState.messages.shift();
    broadcastFromHost("new-message", msg);
  }

  function handleActionOnHost(senderId, event, payload) {
    if (event === "join-room") {
      const cleanName = (payload?.username || "Khách").trim().slice(0, 28) || "Khách";
      if (!roomState.hostId || !roomState.users.has(roomState.hostId)) {
        roomState.hostId = senderId;
      }
      roomState.users.set(senderId, {
        id: senderId,
        name: cleanName,
        isHost: roomState.hostId === senderId,
        joinedAt: Date.now(),
      });
      for (const [id, u] of roomState.users.entries()) {
        u.isHost = id === roomState.hostId;
      }

      sendToSpecificPeer(senderId, "room-state", serializeRoomState());
      broadcastFromHost("users-updated", {
        hostId: roomState.hostId,
        users: Array.from(roomState.users.values()),
      });
      addSystemMessage(`${cleanName} đã tham gia phòng.`);
      return;
    }

    const user = roomState.users.get(senderId);
    if (!user) return;

    if (event === "change-media") {
      if (!roomState.allowAllControl && roomState.hostId !== senderId) return;
      const media = payload?.media || {};
      if (roomState.screenSharerId && media.type !== "screenshare") {
        roomState.screenSharerId = null;
        roomState.screenSharerName = null;
      }
      roomState.media = {
        type: media.type || "iframe",
        url: media.url || "",
        rawInput: media.rawInput || media.url || "",
        sandbox: media.sandbox !== undefined ? media.sandbox : true,
      };
      roomState.playback = {
        isPlaying: false,
        currentTime: 0,
        updatedAt: Date.now(),
        controllerName: user.name,
      };
      broadcastFromHost("media-changed", {
        media: roomState.media,
        playback: roomState.playback,
        screenSharerId: roomState.screenSharerId,
        screenSharerName: roomState.screenSharerName,
        changedBy: user.name,
      });

      const modeLabel =
        roomState.media.type === "youtube"
          ? "YouTube"
          : roomState.media.type === "video" || roomState.media.type === "hls"
          ? "Video trực tiếp"
          : roomState.media.type === "screenshare"
          ? "Chia sẻ màn hình"
          : "Link nhúng (Iframe)";
      addSystemMessage(`${user.name} đã đổi nguồn phát sang ${modeLabel}.`);
      return;
    }

    if (event === "toggle-sandbox") {
      if (!roomState.allowAllControl && roomState.hostId !== senderId) return;
      roomState.media.sandbox = Boolean(payload?.sandbox);
      broadcastFromHost("sandbox-toggled", {
        sandbox: roomState.media.sandbox,
        changedBy: user.name,
      });
      return;
    }

    if (event === "playback-action") {
      if (!roomState.allowAllControl && roomState.hostId !== senderId) return;
      roomState.playback = {
        isPlaying: Boolean(payload?.isPlaying),
        currentTime:
          typeof payload?.currentTime === "number" && !isNaN(payload.currentTime)
            ? Math.max(0, payload.currentTime)
            : 0,
        updatedAt: Date.now(),
        controllerName: user.name,
      };
      broadcastFromHost(
        "playback-update",
        {
          action: payload?.action,
          playback: roomState.playback,
          senderId,
        },
        senderId
      );
      return;
    }

    if (event === "start-countdown") {
      const startAtTime =
        typeof payload?.targetTime === "number" && !isNaN(payload.targetTime)
          ? Math.max(0, payload.targetTime)
          : 0;
      broadcastFromHost("countdown-started", {
        startedBy: user.name,
        targetTime: startAtTime,
        serverTimestamp: Date.now(),
      });
      addSystemMessage(
        `⏱️ ${user.name} đã phát tín hiệu đếm ngược 3-2-1 để bấm Play cùng lúc (tại mốc ${formatSeconds(startAtTime)})!`
      );
      setTimeout(() => {
        if (isDestroyed) return;
        roomState.playback = {
          isPlaying: true,
          currentTime: startAtTime,
          updatedAt: Date.now(),
          controllerName: user.name,
        };
        broadcastFromHost("playback-update", {
          action: "countdown-play",
          playback: roomState.playback,
          senderId,
        });
      }, 3000);
      return;
    }

    if (event === "toggle-permissions") {
      if (roomState.hostId !== senderId) return;
      roomState.allowAllControl = Boolean(payload?.allowAllControl);
      broadcastFromHost("permissions-updated", {
        allowAllControl: roomState.allowAllControl,
      });
      addSystemMessage(
        roomState.allowAllControl
          ? "Chủ phòng đã cho phép tất cả mọi người điều khiển video."
          : "Chủ phòng đã bật chế độ chỉ Chủ phòng mới được điều khiển video."
      );
      return;
    }

    if (event === "transfer-host") {
      if (roomState.hostId !== senderId) return;
      const targetUserId = payload?.targetUserId;
      if (!roomState.users.has(targetUserId)) return;
      roomState.hostId = targetUserId;
      for (const [id, u] of roomState.users.entries()) {
        u.isHost = id === roomState.hostId;
      }
      const newHost = roomState.users.get(targetUserId);
      broadcastFromHost("users-updated", {
        hostId: roomState.hostId,
        users: Array.from(roomState.users.values()),
      });
      if (newHost) {
        addSystemMessage(`👑 ${newHost.name} đã trở thành Chủ phòng mới.`);
      }
      return;
    }

    if (event === "chat-message") {
      const text = payload?.text?.trim();
      if (!text) return;
      const msg = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: "user",
        senderId,
        senderName: user.name,
        isHost: user.isHost,
        text: text.slice(0, 500),
        timestamp: Date.now(),
      };
      roomState.messages.push(msg);
      if (roomState.messages.length > 100) roomState.messages.shift();
      broadcastFromHost("new-message", msg);
      return;
    }

    if (event === "send-reaction") {
      if (!payload?.emoji) return;
      broadcastFromHost("reaction-received", {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        emoji: payload.emoji,
        senderName: user.name,
      });
      return;
    }

    if (event === "start-screen-share") {
      roomState.screenSharerId = senderId;
      roomState.screenSharerName = user.name;
      roomState.media = {
        type: "screenshare",
        url: "",
        rawInput: "",
        sandbox: true,
      };
      broadcastFromHost("screen-share-started", {
        sharerId: senderId,
        sharerName: user.name,
        media: roomState.media,
      });
      addSystemMessage(`🖥️ ${user.name} đang phát trực tiếp màn hình của họ.`);
      return;
    }

    if (event === "stop-screen-share") {
      if (roomState.screenSharerId === senderId) {
        roomState.screenSharerId = null;
        roomState.screenSharerName = null;
        if (roomState.media.type === "screenshare") {
          roomState.media.type = "empty";
        }
        broadcastFromHost("screen-share-stopped", {
          media: roomState.media,
        });
        addSystemMessage(`${user.name} đã dừng chia sẻ màn hình.`);
      }
      return;
    }

    // Signaling relay between peers for WebRTC Screen Share
    if (
      event === "webrtc-request-stream" ||
      event === "webrtc-offer" ||
      event === "webrtc-answer" ||
      event === "webrtc-ice-candidate"
    ) {
      const targetId = payload?.targetSharerId || payload?.targetId;
      if (!targetId) return;
      if (event === "webrtc-request-stream") {
        sendToSpecificPeer(targetId, "webrtc-viewer-ready", {
          viewerId: senderId,
        });
      } else {
        sendToSpecificPeer(targetId, event, {
          fromId: senderId,
          sdp: payload?.sdp,
          candidate: payload?.candidate,
        });
      }
    }
  }

  function flushPendingEmits() {
    while (pendingEmits.length > 0) {
      const { event, payload } = pendingEmits.shift();
      client.emit(event, payload);
    }
  }

  // Step 1: Try registering as the Room Host (`cineparty-vn-room-${roomId}`)
  function initAsHostOrFallbackToGuest() {
    if (isDestroyed) return;

    const candidateHostPeer = new Peer(hostPeerId, {
      config: { iceServers: ICE_SERVERS },
    });

    candidateHostPeer.on("open", (id) => {
      if (isDestroyed) {
        candidateHostPeer.destroy();
        return;
      }
      peer = candidateHostPeer;
      isHostNode = true;
      client.id = id;
      isReady = true;

      // Accept incoming Guest connections
      peer.on("connection", (conn) => {
        guestConns.set(conn.peer, conn);

        conn.on("data", (data) => {
          if (data && data.event) {
            handleActionOnHost(conn.peer, data.event, data.payload);
          }
        });

        conn.on("close", () => {
          handleGuestDisconnect(conn.peer);
        });

        conn.on("error", () => {
          handleGuestDisconnect(conn.peer);
        });
      });

      triggerLocal("connect", {});
      flushPendingEmits();
    });

    candidateHostPeer.on("error", (err) => {
      if (err.type === "unavailable-id") {
        // Host already exists! Connect as Guest
        try {
          candidateHostPeer.destroy();
        } catch {}
        initAsGuest();
      } else {
        console.warn("PeerJS Host Error:", err.type, err);
      }
    });
  }

  function handleGuestDisconnect(guestPeerId) {
    if (!guestConns.has(guestPeerId)) return;
    guestConns.delete(guestPeerId);

    const leavingUser = roomState.users.get(guestPeerId);
    roomState.users.delete(guestPeerId);

    if (roomState.screenSharerId === guestPeerId) {
      roomState.screenSharerId = null;
      roomState.screenSharerName = null;
      if (roomState.media.type === "screenshare") {
        roomState.media.type = "empty";
      }
      broadcastFromHost("screen-share-stopped", {
        media: roomState.media,
      });
    }

    if (roomState.hostId === guestPeerId && roomState.users.size > 0) {
      const nextHostId = roomState.users.keys().next().value;
      roomState.hostId = nextHostId;
      for (const [id, u] of roomState.users.entries()) {
        u.isHost = id === roomState.hostId;
      }
    }

    if (leavingUser) {
      addSystemMessage(`${leavingUser.name} đã rời phòng.`);
    }

    broadcastFromHost("users-updated", {
      hostId: roomState.hostId,
      users: Array.from(roomState.users.values()),
    });
  }

  function initAsGuest() {
    if (isDestroyed) return;

    const guestPeer = new Peer({
      config: { iceServers: ICE_SERVERS },
    });

    guestPeer.on("open", (id) => {
      if (isDestroyed) {
        guestPeer.destroy();
        return;
      }
      peer = guestPeer;
      isHostNode = false;
      client.id = id;

      const conn = peer.connect(hostPeerId, { reliable: true });
      hostConn = conn;

      conn.on("open", () => {
        isReady = true;
        triggerLocal("connect", {});
        flushPendingEmits();
      });

      conn.on("data", (data) => {
        if (data && data.event) {
          triggerLocal(data.event, data.payload);
        }
      });

      conn.on("close", () => {
        // Host left the room! Attempt to take over as new Host after short delay
        if (!isDestroyed) {
          isReady = false;
          setTimeout(() => {
            if (!isDestroyed) {
              try {
                guestPeer.destroy();
              } catch {}
              initAsHostOrFallbackToGuest();
            }
          }, 1200);
        }
      });
    });

    guestPeer.on("error", (err) => {
      console.warn("PeerJS Guest Error:", err.type, err);
      if (err.type === "peer-unavailable" && !isDestroyed) {
        // The Host just closed their tab right as we connected; become Host!
        setTimeout(() => {
          try {
            guestPeer.destroy();
          } catch {}
          initAsHostOrFallbackToGuest();
        }, 800);
      }
    });
  }

  const client = {
    id: null,
    on(event, callback) {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event).add(callback);
    },
    off(event, callback) {
      if (!listeners.has(event)) return;
      if (callback) {
        listeners.get(event).delete(callback);
      } else {
        listeners.delete(event);
      }
    },
    emit(event, payload) {
      if (!isReady) {
        pendingEmits.push({ event, payload });
        return;
      }
      if (isHostNode) {
        handleActionOnHost(client.id, event, payload);
      } else if (hostConn && hostConn.open) {
        hostConn.send({ event, payload });
      }
    },
    disconnect() {
      isDestroyed = true;
      if (hostConn) {
        try {
          hostConn.close();
        } catch {}
      }
      for (const conn of guestConns.values()) {
        try {
          conn.close();
        } catch {}
      }
      if (peer) {
        try {
          peer.destroy();
        } catch {}
      }
    },
  };

  initAsHostOrFallbackToGuest();

  return client;
}
