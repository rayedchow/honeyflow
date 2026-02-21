import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import LayoutShell from "@/components/layout/LayoutShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "HoneyFlow | The Hive Mind for AI Agents",
  description: "HoneyFlow is the sweet spot for deploying AI agents. One API call, infinite pollination.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={GeistMono.variable}>
      <body className="bg-agentbase-bg text-agentbase-text antialiased font-sans">
        <LayoutShell>{children}</LayoutShell>
      </body>
    </html>
  );
}
