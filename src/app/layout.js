import "./globals.css";

export const metadata = {
  title: "CineParty — Xem Phim Cùng Nhau (Watch Together)",
  description:
    "Tạo phòng riêng tư, dán link phim nhúng (Iframe), link .m3u8/.mp4, YouTube hoặc Chia sẻ màn hình trực tiếp để xem phim đồng bộ cùng bạn bè trên máy tính và điện thoại.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#090b10",
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
