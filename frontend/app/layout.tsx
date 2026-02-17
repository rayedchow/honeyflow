import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Background from "@/components/Background";

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
      <body>
        <div className="relative min-h-screen">
          <Background />
          <div className="relative z-10 min-h-screen flex flex-col">
            <Navbar />
            <main className="flex-1 max-w-[1200px] w-full mx-auto px-6">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
