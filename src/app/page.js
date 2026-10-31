"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Film,
  Users,
  MonitorUp,
  Code2,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  KeyRound,
} from "lucide-react";

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export default function HomePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("create"); // 'create' | 'join'
  const [username, setUsername] = useState("");
  const [initialUrl, setInitialUrl] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const savedName = localStorage.getItem("cineparty_username");
    if (savedName) {
      setUsername(savedName);
    }
  }, []);

  const handleCreateRoom = (e) => {
    e.preventDefault();
    setError("");
    const cleanName = username.trim() || `Khách_${Math.floor(100 + Math.random() * 900)}`;
    localStorage.setItem("cineparty_username", cleanName);

    const newRoomCode = generateRoomCode();
    if (initialUrl.trim()) {
      sessionStorage.setItem(`cineparty_init_url_${newRoomCode}`, initialUrl.trim());
    }
    router.push(`/room/${newRoomCode}`);
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    setError("");
    const cleanName = username.trim() || `Khách_${Math.floor(100 + Math.random() * 900)}`;
    localStorage.setItem("cineparty_username", cleanName);

    let extractedCode = joinCode.trim();
    if (!extractedCode) {
      setError("Vui lòng nhập mã phòng hoặc dán link mời.");
      return;
    }

    // If user pasted a full invite URL like http://localhost:3000/room/ABC123
    const match = extractedCode.match(/\/room\/([A-Za-z0-9_-]+)/i);
    if (match && match[1]) {
      extractedCode = match[1];
    }

    extractedCode = extractedCode.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    if (!extractedCode) {
      setError("Mã phòng không hợp lệ.");
      return;
    }

    router.push(`/room/${extractedCode}`);
  };

  return (
    <div className="landing-wrapper">
      <header className="landing-nav">
        <div className="brand-logo">
          <div className="brand-icon">
            <Film size={20} />
          </div>
          <span>CineParty</span>
        </div>
        <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          Rạp chiếu phim trực tuyến dành cho bạn bè
        </div>
      </header>

      <main className="landing-main">
        {/* Left Hero Column */}
        <div>
          <div className="hero-badge">
            <Sparkles size={15} />
            <span>Xem Phim Chung Thời Gian Thực • Không Giới Hạn Nguồn Phim</span>
          </div>
          <h1 className="hero-title">
            Dán link phim bất kỳ,{" "}
            <span className="hero-gradient-text">thưởng thức cùng nhau</span> dù ở bất cứ đâu.
          </h1>
          <p className="hero-desc">
            Tạo phòng riêng tư chỉ trong 1 giây. Hỗ trợ nhúng trực tiếp{" "}
            <strong>Iframe từ các web phim</strong> (kèm lá chắn chặn quảng cáo bật tab mới),{" "}
            <strong>Chia sẻ màn hình trình duyệt (kèm âm thanh)</strong>, hoặc đồng bộ tự động{" "}
            <strong>Play / Pause / Tua</strong> với link <code>.m3u8</code>, <code>.mp4</code> và{" "}
            <strong>YouTube</strong>.
          </p>

          <div className="feature-grid">
            <div className="feature-card">
              <Code2 size={20} color="#a78bfa" />
              <h3>Link Nhúng Iframe & Chặn Popup</h3>
              <p>
                Dán mã <code>&lt;iframe&gt;</code> hoặc link từ web phim. Tích hợp Sandbox chặn quảng cáo tự mở tab và bộ đếm ngược 3-2-1 đồng bộ.
              </p>
            </div>

            <div className="feature-card">
              <MonitorUp size={20} color="#22d3ee" />
              <h3>Chia Sẻ Màn Hình 60FPS</h3>
              <p>
                Web phim chặn nhúng? Phát trực tiếp tab phim kèm âm thanh gốc qua WebRTC cho cả phòng xem mượt mà 100%.
              </p>
            </div>

            <div className="feature-card">
              <PlayCircle size={20} color="#34d399" />
              <h3>Đồng Bộ Play / Pause / Seek</h3>
              <p>
                Tự động đồng bộ từng giây khi xem nguồn <code>.m3u8</code> (HLS), <code>.mp4</code> hoặc YouTube cùng bạn bè.
              </p>
            </div>

            <div className="feature-card">
              <ShieldCheck size={20} color="#fbbf24" />
              <h3>Phòng Riêng Tư & Link Mời</h3>
              <p>
                Mỗi phòng có mã 6 ký tự riêng. Chỉ những ai có mã phòng hoặc link mời mới có thể tham gia cùng bạn.
              </p>
            </div>
          </div>
        </div>

        {/* Right Action Card */}
        <div className="auth-card">
          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab ${activeTab === "create" ? "active" : ""}`}
              onClick={() => {
                setActiveTab("create");
                setError("");
              }}
            >
              Tạo Phòng Mới
            </button>
            <button
              type="button"
              className={`auth-tab ${activeTab === "join" ? "active" : ""}`}
              onClick={() => {
                setActiveTab("join");
                setError("");
              }}
            >
              Vào Bằng Mã Phòng
            </button>
          </div>

          {activeTab === "create" ? (
            <form onSubmit={handleCreateRoom}>
              <div className="form-group">
                <label className="form-label">Tên hiển thị của bạn</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="VD: Minh, Lan, Chủ Rạp..."
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  maxLength={28}
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  Link phim / Mã nhúng Iframe (Tùy chọn — có thể dán sau trong phòng)
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Dán link web phim, <iframe...>, .m3u8, .mp4 hoặc YouTube..."
                  value={initialUrl}
                  onChange={(e) => setInitialUrl(e.target.value)}
                />
              </div>

              {error && (
                <div
                  style={{
                    color: "#fca5a5",
                    fontSize: "0.84rem",
                    marginBottom: "14px",
                  }}
                >
                  {error}
                </div>
              )}

              <button type="submit" className="btn-primary">
                <span>Tạo Phòng Xem Chung Ngay</span>
                <ArrowRight size={18} />
              </button>

              <p
                style={{
                  marginTop: "14px",
                  fontSize: "0.78rem",
                  color: "var(--text-muted)",
                  textAlign: "center",
                }}
              >
                Bạn cũng có thể bật <strong>Chia sẻ màn hình (Screen Share)</strong> ngay sau khi vào phòng.
              </p>
            </form>
          ) : (
            <form onSubmit={handleJoinRoom}>
              <div className="form-group">
                <label className="form-label">Tên hiển thị của bạn</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="VD: Minh, Lan..."
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  maxLength={28}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Mã phòng hoặc Link mời</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="VD: K9X4P2 hoặc dán link phòng..."
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  style={{ textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.04em" }}
                />
              </div>

              {error && (
                <div
                  style={{
                    color: "#fca5a5",
                    fontSize: "0.84rem",
                    marginBottom: "14px",
                  }}
                >
                  {error}
                </div>
              )}

              <button type="submit" className="btn-primary">
                <KeyRound size={18} />
                <span>Vào Phòng Xem Chung</span>
              </button>
            </form>
          )}
        </div>
      </main>

      <footer
        style={{
          textAlign: "center",
          fontSize: "0.8rem",
          color: "var(--text-muted)",
          padding: "12px 0",
        }}
      >
        CineParty • Xây dựng với Next.js, Socket.IO & WebRTC
      </footer>
    </div>
  );
}
