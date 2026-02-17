export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 backdrop-blur-2xl bg-white/[0.03] border-b border-white/[0.06]">
      <div className="max-w-[1200px] mx-auto px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-white/[0.1] backdrop-blur-sm flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              width="13"
              height="13"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
            </svg>
          </div>
          <span className="font-semibold text-[15px] tracking-tight text-white">
            SourceFund
          </span>
        </div>

        <div className="flex items-center gap-8">
          <div className="hidden md:flex gap-6 text-[13px] text-white/40">
            <span className="cursor-pointer hover:text-white/70 transition-colors">
              Projects
            </span>
            <span className="cursor-pointer hover:text-white/70 transition-colors">
              Docs
            </span>
            <span className="cursor-pointer hover:text-white/70 transition-colors">
              About
            </span>
          </div>
          <button className="px-4 py-1.5 text-[13px] font-medium rounded-full bg-white text-[#1b1140] hover:bg-white/90 transition-colors">
            Launch App
          </button>
        </div>
      </div>
    </nav>
  );
}
