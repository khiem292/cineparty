import "./globals.css";

export const metadata = {
  title: "CineParty — Xem Phim Cùng Nhau (Watch Together)",
  description:
    "Tạo phòng riêng tư, dán link phim nhúng (Iframe), link .m3u8/.mp4, YouTube hoặc Chia sẻ màn hình trực tiếp để xem phim đồng bộ cùng bạn bè.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
