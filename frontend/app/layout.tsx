import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SourceFund - Recursive Funding Protocol",
  description:
    "AI-powered attribution meets Ethereum-based crowdfunding. Fund projects and automatically distribute to every contributor.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
