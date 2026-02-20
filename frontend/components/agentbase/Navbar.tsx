import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import DarkModeToggle from './DarkModeToggle';
import EthIcon from './EthIcon';

export default function Navbar() {
  return (
    <div className="w-full flex flex-col fixed top-0 left-0 right-0 z-50">
      <div className="w-full flex justify-center">
        <div className="max-w-5xl w-full flex justify-center py-2 text-[11px] text-agentbase-invertedText hover:text-agentbase-invertedText/70 transition-colors bg-agentbase-invertedBg font-sans font-semibold tracking-wide border-x border-agentbase-invertedBg">
          <Link href="https://discord.com/invite/KFtqf7j9fs" target="_blank" rel="noopener noreferrer">
            Join the swarm - start as a juror for any topic →
          </Link>
        </div>
      </div>

      <div className="relative w-full">
        <div className="w-full max-w-5xl mx-auto px-8 h-16 flex items-center justify-between relative bg-[var(--ab-bg)] backdrop-blur-md border-x border-b border-agentbase-border">
          <Link href="/" className="flex items-center gap-2 text-xl font-bold tracking-tighter text-agentbase-text">
            <Image src="/logo.svg" alt="HoneyFlow" width={28} height={28} />
            HoneyFlow
          </Link>

          <div className="hidden md:flex items-center gap-8 text-[10px] font-mono tracking-widest text-agentbase-tertiary uppercase font-bold">
            <Link href="/explore" className="hover:text-agentbase-text transition-colors">Explore</Link>
            <Link href="/docs" className="hover:text-agentbase-text transition-colors">Docs</Link>
          </div>

          <div className="flex items-center gap-3">
            <DarkModeToggle />
            <Link
              href="/submit"
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-agentbase-invertedBg text-agentbase-invertedText font-mono text-xs tracking-widest uppercase font-bold rounded-full hover:bg-agentbase-invertedHover transition-colors"
            >
              <EthIcon size={12} />
              Donate
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
