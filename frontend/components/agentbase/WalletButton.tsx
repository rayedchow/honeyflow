"use client";

import React from "react";
import { useWallet } from "@/hooks/useWallet";

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function WalletButton() {
  const { address, isConnecting, error, connect, disconnect } = useWallet();

  if (address) {
    return (
      <div className="relative group">
        <button className="inline-flex items-center gap-2 px-4 py-2 border border-agentbase-border bg-agentbase-card font-mono text-xs tracking-wide rounded-full hover:bg-agentbase-cardHover transition-colors text-agentbase-text">
          <span className="w-1.5 h-1.5 rounded-full bg-agentbase-accent" />
          {truncateAddress(address)}
        </button>
        <button
          onClick={disconnect}
          className="absolute top-full right-0 mt-1 px-3 py-1.5 text-[10px] font-mono tracking-wider uppercase bg-agentbase-invertedBg text-agentbase-invertedText rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={connect}
      disabled={isConnecting}
      title={error || undefined}
      className="inline-flex items-center gap-2 px-4 py-2 border border-agentbase-border font-mono text-xs tracking-widest uppercase font-bold rounded-full hover:bg-agentbase-invertedBg hover:text-agentbase-invertedText transition-colors disabled:opacity-50"
    >
      {isConnecting ? (
        <>
          <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          Connecting…
        </>
      ) : (
        "Connect Wallet"
      )}
    </button>
  );
}
