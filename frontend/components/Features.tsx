export default function Features() {
  return (
    <section className="pb-16">
      <div className="mb-8">
        <p className="text-[11px] font-medium uppercase tracking-widest text-white/35 mb-2">
          How it works
        </p>
        <h2 className="text-xl font-semibold tracking-tight text-white">
          From project to every contributor
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Traditional */}
        <div className="group backdrop-blur-md bg-white/[0.04] border border-white/[0.07] rounded-2xl p-7 flex flex-col gap-4 transition-all hover:bg-white/[0.06] hover:border-white/[0.1]">
          <div className="w-9 h-9 rounded-xl bg-white/[0.07] flex items-center justify-center text-white/40 group-hover:text-white/60 transition-colors">
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              stroke="currentColor"
              fill="none"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <polyline points="19 12 12 19 5 12" />
            </svg>
          </div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-white/35">
            Traditional
          </p>
          <h3 className="text-[17px] text-white font-medium tracking-tight">
            Direct Flow
          </h3>
          <p className="text-[13px] text-white/55 leading-relaxed">
            Funding goes directly to the project owner. Dependencies,
            maintainers, and contributors see nothing.
          </p>
        </div>

        {/* SourceFund */}
        <div className="group backdrop-blur-md bg-white/[0.04] border border-white/[0.07] rounded-2xl p-7 flex flex-col gap-4 transition-all hover:bg-white/[0.06] hover:border-white/[0.1]">
          <div className="w-9 h-9 rounded-xl bg-white/[0.07] flex items-center justify-center text-white/40 group-hover:text-white/60 transition-colors">
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              stroke="currentColor"
              fill="none"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-white/35">
            SourceFund
          </p>
          <h3 className="text-[17px] text-white font-medium tracking-tight">
            Recursive Split
          </h3>
          <p className="text-[13px] text-white/55 leading-relaxed">
            AI traces every attribution. Smart contracts split funding
            recursively through the entire dependency graph.
          </p>
        </div>

        {/* The Result */}
        <div className="group relative backdrop-blur-md bg-white/[0.04] border border-white/[0.08] rounded-2xl p-7 flex flex-col gap-4 transition-all hover:bg-white/[0.06] hover:border-white/[0.12] overflow-hidden">
          <div className="absolute top-0 right-0 w-[140px] h-[140px] bg-[radial-gradient(circle,rgba(255,255,255,0.03)_0%,transparent_70%)] pointer-events-none" />
          <div className="w-9 h-9 rounded-xl bg-white/[0.09] flex items-center justify-center text-white/55 group-hover:text-white/75 transition-colors">
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              stroke="currentColor"
              fill="none"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-white/40">
            The Result
          </p>
          <h3 className="text-[17px] text-white font-medium tracking-tight">
            Full-Chain Funding
          </h3>
          <p className="text-[13px] text-white/55 leading-relaxed">
            Every contributor, every dependency, every piece of infrastructure
            gets funded automatically on-chain.
          </p>
        </div>
      </div>
    </section>
  );
}
