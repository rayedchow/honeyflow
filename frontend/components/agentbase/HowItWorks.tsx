import React from 'react';
import Link from 'next/link';

export default function HowItWorks() {
    return (
        <section className="w-full py-16 bg-agentbase-bg border-b border-agentbase-border">
            <div className="px-8">

                <div className="flex flex-col md:flex-row gap-10 items-start justify-between">

                    <div className="md:w-1/2 flex flex-col space-y-5">
                        <h2 className="text-4xl md:text-5xl font-bold tracking-tighter text-agentbase-text">
                            How It Works
                        </h2>
                        <p className="text-lg text-agentbase-muted">
                            Fund any project. We map the contributors. The honey flows down.
                        </p>

                        <div className="pt-2">
                            <Link
                                href="/docs"
                                className="px-6 py-3 bg-agentbase-pillBg text-agentbase-pillText font-mono text-xs tracking-widest uppercase font-bold rounded-full hover:opacity-80 transition-colors inline-block"
                            >
                                Read Docs →
                            </Link>
                        </div>
                    </div>

                    <div className="md:w-1/2 w-full flex flex-col gap-4">

                        <div className="relative p-6 border border-yellow-500/30 bg-gradient-to-br from-yellow-500/10 to-amber-500/5 hover:from-yellow-500/20 hover:to-amber-500/10 transition-all group cursor-pointer overflow-hidden">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-yellow-400/10 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500" />
                            <div className="relative">
                                <div className="flex items-center space-x-4 mb-2">
                                    <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-400 group-hover:scale-110 transition-transform">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="12" cy="12" r="10"></circle>
                                            <line x1="2" y1="12" x2="22" y2="12"></line>
                                            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                                        </svg>
                                    </div>
                                    <div>
                                        <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-yellow-400/70">Step 1</span>
                                        <h3 className="text-lg font-bold text-agentbase-text tracking-tight">Fund</h3>
                                    </div>
                                </div>
                                <p className="text-agentbase-muted text-sm pl-14">
                                    Pick any open source project, paper, or package. Deposit ETH. The treasury holds it until the contribution graph is resolved.
                                </p>
                            </div>
                        </div>

                        <div className="relative p-6 border border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-cyan-500/5 hover:from-blue-500/20 hover:to-cyan-500/10 transition-all group cursor-pointer overflow-hidden">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-400/10 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500" />
                            <div className="relative">
                                <div className="flex items-center space-x-4 mb-2">
                                    <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="16 18 22 12 16 6"></polyline>
                                            <polyline points="8 6 2 12 8 18"></polyline>
                                        </svg>
                                    </div>
                                    <div>
                                        <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-blue-400/70">Step 2</span>
                                        <h3 className="text-lg font-bold text-agentbase-text tracking-tight">Map</h3>
                                    </div>
                                </div>
                                <p className="text-agentbase-muted text-sm pl-14">
                                    0G decentralized inference crawls the full project tree — commits, dependencies, papers. Builds a verifiable contribution graph on-chain.
                                </p>
                            </div>
                        </div>

                        <div className="relative p-6 border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-green-500/5 hover:from-emerald-500/20 hover:to-green-500/10 transition-all group cursor-pointer overflow-hidden">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-400/10 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500" />
                            <div className="relative">
                                <div className="flex items-center space-x-4 mb-2">
                                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                            <polyline points="7 10 12 15 17 10"></polyline>
                                            <line x1="12" y1="15" x2="12" y2="3"></line>
                                        </svg>
                                    </div>
                                    <div>
                                        <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-emerald-400/70">Step 3</span>
                                        <h3 className="text-lg font-bold text-agentbase-text tracking-tight">Flow</h3>
                                    </div>
                                </div>
                                <p className="text-agentbase-muted text-sm pl-14">
                                    A stake-weighted jury finalizes scores. ETH splits proportionally — straight to wallets, no middlemen.
                                </p>
                            </div>
                        </div>

                    </div>
                </div>

            </div>
        </section>
    );
}
