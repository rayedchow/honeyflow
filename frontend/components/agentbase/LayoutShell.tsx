"use client";

import { usePathname } from "next/navigation";
import Navbar from "./Navbar";

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const wide = pathname === "/donate";
  const maxW = wide ? "100vw" : "64rem";

  return (
    <div className="relative flex flex-col min-h-screen bg-agentbase-bg text-agentbase-text overflow-hidden selection:bg-agentbase-cyan/30">
      {/* Fixed background grid + border columns */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="h-full flex justify-center">
          <div
            className="w-full border-x border-agentbase-border transition-[max-width] duration-700 ease-in-out"
            style={{ maxWidth: maxW }}
          />
        </div>
        <div className="absolute inset-y-0 left-0 right-0 flex justify-center">
          <div
            className="w-full relative transition-[max-width] duration-700 ease-in-out"
            style={{ maxWidth: maxW }}
          >
            <div className="absolute inset-y-0 right-full w-[50vw] bg-grid" />
            <div className="absolute inset-y-0 left-full w-[50vw] bg-grid" />
          </div>
        </div>
      </div>

      {/* Navbar */}
      <div className="w-full flex flex-col fixed top-0 left-0 right-0 z-50">
        <Navbar maxW={maxW} />
      </div>

      <div className="h-[94px]" />

      {/* Content container */}
      <div
        className="relative z-10 mx-auto w-full border-x border-agentbase-border flex flex-col flex-1 transition-[max-width] duration-700 ease-in-out"
        style={{ maxWidth: maxW }}
      >
        {children}
      </div>
    </div>
  );
}
