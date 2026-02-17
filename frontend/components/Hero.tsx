"use client";

import DAGVisualization from "./DAGVisualization";

export default function Hero() {
  return (
    <section className="pt-10 pb-12">
      <div className="backdrop-blur-sm bg-white/[0.03] border border-white/[0.06] rounded-[2rem] p-8 lg:p-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="max-w-[480px]">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.08] text-[11px] font-medium tracking-wide text-white/45 mb-6 uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
              Built on Ethereum
            </div>

            <h1 className="text-4xl lg:text-5xl font-semibold leading-[1.1] mb-5 tracking-tight text-white">
              Fund the source.
              <br />
              Reward every link.
            </h1>

            <p className="text-white/45 text-[15px] leading-relaxed mb-8">
              AI-powered attribution meets on-chain crowdfunding. Trace every
              contribution and automatically distribute funding to everyone who
              made it possible.
            </p>

            <div className="flex gap-3">
              <a
                href="#"
                className="px-5 py-2.5 rounded-full text-sm font-medium bg-white text-[#1b1140] hover:bg-white/90 transition-colors"
              >
                Explore Projects
              </a>
              <a
                href="#"
                className="px-5 py-2.5 rounded-full text-sm font-medium bg-white/[0.06] border border-white/[0.1] text-white/70 hover:bg-white/[0.1] hover:text-white/90 transition-all"
              >
                Submit a Project
              </a>
            </div>
          </div>

          <DAGVisualization />
        </div>
      </div>
    </section>
  );
}
