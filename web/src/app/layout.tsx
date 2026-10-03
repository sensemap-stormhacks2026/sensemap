import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SenseMap · Live SFU Study Conditions",
  description:
    "Privacy-first, real-time environmental conditions for SFU Burnaby study spaces.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
