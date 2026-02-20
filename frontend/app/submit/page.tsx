import type { Metadata } from "next";
import Navbar from "@/components/agentbase/Navbar";
import Footer from "@/components/agentbase/Footer";
import SubmitClient from "./SubmitClient";

export const metadata: Metadata = {
  title: "Donate — HoneyFlow",
  description:
    "Fund a project and watch the honey flow down through the full contribution graph.",
};

export default function DonatePage() {
  return (
    <div className="relative flex flex-col min-h-screen bg-agentbase-bg text-agentbase-text overflow-hidden selection:bg-agentbase-cyan/30">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="h-full flex justify-center">
          <div className="max-w-5xl w-full border-x border-agentbase-border" />
        </div>
        <div className="absolute inset-y-0 left-0 right-0 flex justify-center">
          <div className="max-w-5xl w-full relative">
            <div className="absolute inset-y-0 right-full w-[50vw] bg-grid" />
            <div className="absolute inset-y-0 left-full w-[50vw] bg-grid" />
          </div>
        </div>
      </div>

      <Navbar />

      <div className="h-[94px]" />

      <div className="relative z-10 max-w-5xl mx-auto w-full border-x border-agentbase-border flex flex-col flex-1">
        <main className="flex-col flex w-full flex-1">
          <SubmitClient />
        </main>

        <Footer />
      </div>
    </div>
  );
}
