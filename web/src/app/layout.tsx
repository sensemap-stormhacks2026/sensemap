import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SenseMap · Live SFU Study Conditions",
  description:
    "Privacy-first, real-time environmental conditions for SFU Burnaby study spaces.",
  appleWebApp: {
    capable: true,
    title: "SenseMap",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
