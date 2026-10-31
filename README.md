# 🎬 CineParty — Trang Web Xem Phim Chung Thời Gian Thực (Watch Together)

Ứng dụng web xem phim cùng nhau được xây dựng bằng **Next.js (React)**, **Socket.IO** và **WebRTC**, hỗ trợ đầy đủ 3 chế độ phát phổ biến nhất hiện nay:

1. **Link Nhúng (Iframe Embed) từ các web xem phim khác:**
   - Tự động bóc tách URL nếu bạn dán nguyên thẻ `<iframe src="..."></iframe>` hoặc dán link trực tiếp.
   - Tích hợp **Lá chắn Chặn Popup Quảng Cáo (Sandbox Shield)** giúp bấm Play không bị mở tab quảng cáo lạ (có nút bật/tắt nhanh nếu gặp trình phát yêu cầu tắt Sandbox).
   - Tích hợp **Đếm Ngược 3-2-1 Bấm Play Cùng Lúc** + **Đồng Hồ Chuẩn Của Phòng** để mọi người luôn khớp từng giây ngay cả với những web phim chặn điều khiển từ bên ngoài.
2. **Chia Sẻ Màn Hình Trực Tiếp (WebRTC Screen Share 60FPS kèm Âm Thanh):**
   - Giải pháp hoàn hảo khi web phim chặn nhúng (`X-Frame-Options: DENY`). Chủ phòng mở tab phim và bấm **"Chia Sẻ Màn Hình (Kèm Âm Thanh)"** để truyền hình ảnh & âm thanh gốc trực tiếp cho cả phòng.
3. **Đồng Bộ Hóa Tự Động 2 Chiều (Play / Pause / Seek):**
   - Hoạt động tự động 100% khi dán link luồng `.m3u8` (HLS), file `.mp4`/`.webm` hoặc link **YouTube**. Bất kỳ ai bấm dừng hoặc tua là máy của cả phòng tự động đồng bộ theo.

## 🚀 Cách chạy dự án

```bash
cd C:\Users\chinh\.gemini\antigravity\scratch\watch-together
npm install
npm run dev
```

Sau đó mở trình duyệt tại địa chỉ: **http://localhost:3000**

## 🌐 Cách mời bạn bè ở xa vào xem cùng

- **Trong cùng mạng Wi-Fi / LAN:** Gửi địa chỉ IP máy của bạn kèm cổng `:3000` (VD: `http://192.168.1.x:3000/room/MÃ_PHÒNG`).
- **Qua Internet (Khuyên dùng):** Bạn có thể mở 1 cửa sổ terminal khác và chạy `npx cloudflared tunnel --url http://localhost:3000` hoặc `ngrok http 3000` để nhận một đường link `https://...` miễn phí gửi cho bạn bè ở bất kỳ đâu!
