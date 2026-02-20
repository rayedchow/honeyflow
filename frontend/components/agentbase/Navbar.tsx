"use client";

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import DarkModeToggle from './DarkModeToggle';
import EthIcon from './EthIcon';
import WalletButton from './WalletButton';

export default function Navbar({ maxW = "64rem" }: { maxW?: string }) {
  return (
    <>
      <div className="w-full flex justify-center">
        <div
          className="w-full flex justify-center py-2 text-[11px] text-agentbase-invertedText hover:text-agentbase-invertedText/70 bg-agentbase-invertedBg font-sans font-semibold tracking-wide border-x border-agentbase-invertedBg transition-[max-width,color] duration-700 ease-in-out"
          style={{ maxWidth: maxW }}
        >
          <Link href="https://discord.com/invite/KFtqf7j9fs" target="_blank" rel="noopener noreferrer">
            Join the swarm - start as a juror for any topic →
          </Link>
        </div>
      </div>

      <div className="relative w-full flex justify-center">
        <div
          className="w-full px-8 h-16 flex items-center justify-between relative bg-[var(--ab-bg)] backdrop-blur-md border-x border-b border-agentbase-border transition-[max-width] duration-700 ease-in-out"
          style={{ maxWidth: maxW }}
        >
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2 text-xl font-bold tracking-tighter text-agentbase-text">
              <Image src="/logo.svg" alt="HoneyFlow" width={28} height={28} />
              HoneyFlow
            </Link>

            <Link href="/explore" className="flex items-center gap-2 text-agentbase-text hover:opacity-70 transition-opacity" aria-label="Discover">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
              </svg>
              <span className="text-[11px] font-mono font-bold tracking-widest uppercase">Explore</span>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <WalletButton />
            <DarkModeToggle />
            <Link
              href="/donate"
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-agentbase-invertedBg text-agentbase-invertedText font-mono text-xs tracking-widest uppercase font-bold rounded-full hover:bg-agentbase-invertedHover transition-colors"
            >
              <EthIcon size={12} />
              Donate
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
