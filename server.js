const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");

const isProdFlag = process.argv.includes("--prod");
if (isProdFlag) {
  process.env.NODE_ENV = "production";
}
const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev });
const handle = app.getRequestHandler();

// In-memory store for rooms
const rooms = new Map();

function getOrCreateRoom(roomId) {
  const normalizedId = roomId.toUpperCase();
  if (!rooms.has(normalizedId)) {
    rooms.set(normalizedId, {
      roomId: normalizedId,
      hostId: null,
      allowAllControl: true,
      screenSharerId: null,
      screenSharerName: null,
      media: {
        type: "empty", // 'empty' | 'video' | 'hls' | 'youtube' | 'iframe' | 'screenshare'
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
    });
  }
  return rooms.get(normalizedId);
}

function serializeRoom(room) {
  // Compute estimated current time if playing
  let estimatedTime = room.playback.currentTime;
  if (room.playback.isPlaying) {
    const elapsedSeconds = (Date.now() - room.playback.updatedAt) / 1000;
    estimatedTime += Math.max(0, elapsedSeconds);
  }

  return {
    roomId: room.roomId,
    hostId: room.hostId,
    allowAllControl: room.allowAllControl,
    screenSharerId: room.screenSharerId,
    screenSharerName: room.screenSharerName,
    media: room.media,
    playback: {
      ...room.playback,
      currentTime: estimatedTime,
    },
    users: Array.from(room.users.values()),
    messages: room.messages.slice(-50),
  };
}

function addSystemMessage(room, text, io) {
  const msg = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: "system",
    text,
    timestamp: Date.now(),
  };
  room.messages.push(msg);
  if (room.messages.length > 100) room.messages.shift();
  io.to(room.roomId).emit("new-message", msg);
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    let currentRoomId = null;

    socket.on("join-room", ({ roomId, username }) => {
      if (!roomId) return;
      const normalizedId = roomId.toUpperCase();
      currentRoomId = normalizedId;
      socket.join(normalizedId);

      const room = getOrCreateRoom(normalizedId);
      const cleanName = (username || "Khách").trim().slice(0, 28) || "Khách";

      if (!room.hostId || !room.users.has(room.hostId)) {
        room.hostId = socket.id;
      }

      const userObj = {
        id: socket.id,
        name: cleanName,
        isHost: room.hostId === socket.id,
        joinedAt: Date.now(),
      };

      room.users.set(socket.id, userObj);

      // Update isHost flags
      for (const [id, u] of room.users.entries()) {
        u.isHost = id === room.hostId;
      }

      socket.emit("room-state", serializeRoom(room));
      io.to(normalizedId).emit("users-updated", {
        hostId: room.hostId,
        users: Array.from(room.users.values()),
      });

      addSystemMessage(room, `${cleanName} đã tham gia phòng.`, io);
    });

    socket.on("change-media", ({ roomId, media }) => {
      if (!roomId) return;
      const room = rooms.get(roomId.toUpperCase());
      if (!room) return;

      const user = room.users.get(socket.id);
      if (!user) return;
      if (!room.allowAllControl && room.hostId !== socket.id) return;

      // If someone was sharing screen and media changed to a link, stop screen share
      if (room.screenSharerId && media.type !== "screenshare") {
        room.screenSharerId = null;
        room.screenSharerName = null;
      }

      room.media = {
        type: media.type || "iframe",
        url: media.url || "",
        rawInput: media.rawInput || media.url || "",
        sandbox: media.sandbox !== undefined ? media.sandbox : true,
      };

      room.playback = {
        isPlaying: false,
        currentTime: 0,
        updatedAt: Date.now(),
        controllerName: user.name,
      };

      io.to(room.roomId).emit("media-changed", {
        media: room.media,
        playback: room.playback,
        screenSharerId: room.screenSharerId,
        screenSharerName: room.screenSharerName,
        changedBy: user.name,
      });

      const modeLabel =
        room.media.type === "youtube"
          ? "YouTube"
          : room.media.type === "video" || room.media.type === "hls"
          ? "Video trực tiếp"
          : room.media.type === "screenshare"
          ? "Chia sẻ màn hình"
          : "Link nhúng (Iframe)";
      addSystemMessage(room, `${user.name} đã đổi nguồn phát sang ${modeLabel}.`, io);
    });

    socket.on("toggle-sandbox", ({ roomId, sandbox }) => {
      if (!roomId) return;
      const room = rooms.get(roomId.toUpperCase());
      if (!room) return;
      const user = room.users.get(socket.id);
      if (!user) return;
      if (!room.allowAllControl && room.hostId !== socket.id) return;

      room.media.sandbox = Boolean(sandbox);
      io.to(room.roomId).emit("sandbox-toggled", {
        sandbox: room.media.sandbox,
        changedBy: user.name,
      });
    });

    socket.on("playback-action", ({ roomId, action, currentTime, isPlaying }) => {
      if (!roomId) return;
      const room = rooms.get(roomId.toUpperCase());
      if (!room) return;

      const user = room.users.get(socket.id);
      if (!user) return;
      if (!room.allowAllControl && room.hostId !== socket.id) return;

      room.playback = {
        isPlaying: Boolean(isPlaying),
        currentTime: typeof currentTime === "number" && !isNaN(currentTime) ? Math.max(0, currentTime) : 0,
        updatedAt: Date.now(),
        controllerName: user.name,
      };

      socket.to(room.roomId).emit("playback-update", {
        action,
        playback: room.playback,
        senderId: socket.id,
      });
    });

    socket.on("start-countdown", ({ roomId, targetTime }) => {
      if (!roomId) return;
      const room = rooms.get(roomId.toUpperCase());
      if (!room) return;

      const user = room.users.get(socket.id);
      if (!user) return;

      const startAtTime = typeof targetTime === "number" && !isNaN(targetTime) ? Math.max(0, targetTime) : 0;

      io.to(room.roomId).emit("countdown-started", {
        startedBy: user.name,
        targetTime: startAtTime,
        serverTimestamp: Date.now(),
      });

      addSystemMessage(
        room,
        `⏱️ ${user.name} đã phát tín hiệu đếm ngược 3-2-1 để bấm Play cùng lúc (tại mốc ${formatSeconds(startAtTime)})!`,
        io
      );

      // After 3 seconds, set room timer to playing from targetTime
      setTimeout(() => {
        if (!rooms.has(room.roomId)) return;
        room.playback = {
          isPlaying: true,
          currentTime: startAtTime,
          updatedAt: Date.now(),
          controllerName: user.name,
        };
        io.to(room.roomId).emit("playback-update", {
          action: "countdown-play",
          playback: room.playback,
          senderId: socket.id,
        });
      }, 3000);
    });

    socket.on("toggle-permissions", ({ roomId, allowAllControl }) => {
      if (!roomId) return;
      const room = rooms.get(roomId.toUpperCase());
      if (!room || room.hostId !== socket.id) return;

      room.allowAllControl = Boolean(allowAllControl);
      io.to(room.roomId).emit("permissions-updated", {
        allowAllControl: room.allowAllControl,
      });

      addSystemMessage(
        room,
        room.allowAllControl
          ? "Chủ phòng đã cho phép tất cả mọi người điều khiển video."
          : "Chủ phòng đã bật chế độ chỉ Chủ phòng mới được điều khiển video.",
        io
      );
    });

    socket.on("transfer-host", ({ roomId, targetUserId }) => {
      if (!roomId) return;
      const room = rooms.get(roomId.toUpperCase());
      if (!room || room.hostId !== socket.id) return;
      if (!room.users.has(targetUserId)) return;

      room.hostId = targetUserId;
      for (const [id, u] of room.users.entries()) {
        u.isHost = id === room.hostId;
      }

      const newHost = room.users.get(targetUserId);
      io.to(room.roomId).emit("users-updated", {
        hostId: room.hostId,
        users: Array.from(room.users.values()),
      });
      if (newHost) {
        addSystemMessage(room, `👑 ${newHost.name} đã trở thành Chủ phòng mới.`, io);
      }
    });

    socket.on("chat-message", ({ roomId, text }) => {
      if (!roomId || !text || !text.trim()) return;
      const room = rooms.get(roomId.toUpperCase());
      if (!room) return;
      const user = room.users.get(socket.id);
      if (!user) return;

      const msg = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: "user",
        senderId: socket.id,
        senderName: user.name,
        isHost: user.isHost,
        text: text.trim().slice(0, 500),
        timestamp: Date.now(),
      };
      room.messages.push(msg);
      if (room.messages.length > 100) room.messages.shift();
      io.to(room.roomId).emit("new-message", msg);
    });

    socket.on("send-reaction", ({ roomId, emoji }) => {
      if (!roomId || !emoji) return;
      const room = rooms.get(roomId.toUpperCase());
      if (!room) return;
      const user = room.users.get(socket.id);
      if (!user) return;

      io.to(room.roomId).emit("reaction-received", {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        emoji,
        senderName: user.name,
      });
    });

    // --- WebRTC Screen Share Signaling ---
    socket.on("start-screen-share", ({ roomId }) => {
      if (!roomId) return;
      const room = rooms.get(roomId.toUpperCase());
      if (!room) return;
      const user = room.users.get(socket.id);
      if (!user) return;

      room.screenSharerId = socket.id;
      room.screenSharerName = user.name;
      room.media = {
        type: "screenshare",
        url: "",
        rawInput: "",
        sandbox: true,
      };

      io.to(room.roomId).emit("screen-share-started", {
        sharerId: socket.id,
        sharerName: user.name,
        media: room.media,
      });

      addSystemMessage(room, `🖥️ ${user.name} đang phát trực tiếp màn hình của họ.`, io);
    });

    socket.on("stop-screen-share", ({ roomId }) => {
      if (!roomId) return;
      const room = rooms.get(roomId.toUpperCase());
      if (!room) return;

      if (room.screenSharerId === socket.id) {
        const user = room.users.get(socket.id);
        room.screenSharerId = null;
        room.screenSharerName = null;
        if (room.media.type === "screenshare") {
          room.media.type = "empty";
        }
        io.to(room.roomId).emit("screen-share-stopped", {
          media: room.media,
        });
        if (user) {
          addSystemMessage(room, `${user.name} đã dừng chia sẻ màn hình.`, io);
        }
      }
    });

    socket.on("webrtc-request-stream", ({ targetSharerId }) => {
      if (!targetSharerId) return;
      io.to(targetSharerId).emit("webrtc-viewer-ready", {
        viewerId: socket.id,
      });
    });

    socket.on("webrtc-offer", ({ targetId, sdp }) => {
      if (!targetId) return;
      io.to(targetId).emit("webrtc-offer", {
        fromId: socket.id,
        sdp,
      });
    });

    socket.on("webrtc-answer", ({ targetId, sdp }) => {
      if (!targetId) return;
      io.to(targetId).emit("webrtc-answer", {
        fromId: socket.id,
        sdp,
      });
    });

    socket.on("webrtc-ice-candidate", ({ targetId, candidate }) => {
      if (!targetId) return;
      io.to(targetId).emit("webrtc-ice-candidate", {
        fromId: socket.id,
        candidate,
      });
    });

    socket.on("disconnect", () => {
      if (!currentRoomId) return;
      const room = rooms.get(currentRoomId);
      if (!room) return;

      const leavingUser = room.users.get(socket.id);
      room.users.delete(socket.id);

      if (room.screenSharerId === socket.id) {
        room.screenSharerId = null;
        room.screenSharerName = null;
        if (room.media.type === "screenshare") {
          room.media.type = "empty";
        }
        io.to(room.roomId).emit("screen-share-stopped", {
          media: room.media,
        });
      }

      if (room.users.size === 0) {
        // Keep room state for 10 minutes in case of page refresh, then clean up
        setTimeout(() => {
          const r = rooms.get(currentRoomId);
          if (r && r.users.size === 0) {
            rooms.delete(currentRoomId);
          }
        }, 10 * 60 * 1000);
        return;
      }

      if (room.hostId === socket.id) {
        const nextHostId = room.users.keys().next().value;
        room.hostId = nextHostId;
        for (const [id, u] of room.users.entries()) {
          u.isHost = id === room.hostId;
        }
        const nextHost = room.users.get(nextHostId);
        if (nextHost) {
          addSystemMessage(room, `👑 ${nextHost.name} đã trở thành Chủ phòng mới.`, io);
        }
      }

      if (leavingUser) {
        addSystemMessage(room, `${leavingUser.name} đã rời phòng.`, io);
      }

      io.to(room.roomId).emit("users-updated", {
        hostId: room.hostId,
        users: Array.from(room.users.values()),
      });
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(`> CineParty Watch-Together sẵn sàng tại http://localhost:${port}`);
  });
});

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
