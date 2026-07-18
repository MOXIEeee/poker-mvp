import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "德州扑克 · 朋友间开一局",
  description: "和朋友一起玩德州扑克，简洁、流畅、有质感",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
