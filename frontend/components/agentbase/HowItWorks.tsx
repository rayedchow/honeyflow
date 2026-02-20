import React from 'react';
import Link from 'next/link';


export default function HowItWorks() {
    return (
        <section className="w-full py-12 bg-agentbase-bg border-b border-agentbase-border">
            <div className="px-8">


                <div className="flex flex-col md:flex-row gap-8 items-start justify-between">


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


                    <div className="md:w-1/2 w-full flex flex-col border border-agentbase-border bg-agentbase-card shadow-sm">


                        <div className="p-6 border-b border-agentbase-border hover:bg-agentbase-cardHover transition-colors group cursor-pointer">
                            <div className="flex items-center space-x-4 mb-2">
                                <div className="text-agentbase-cyan group-hover:scale-110 transition-transform">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <line x1="2" y1="12" x2="22" y2="12"></line>
                                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                                    </svg>
                                </div>
                                <h3 className="text-lg font-bold text-agentbase-text tracking-tight">Fund</h3>
                            </div>
                            <p className="text-agentbase-muted text-sm pl-9">
                                Pick any open source project, paper, or package. Deposit ETH. The treasury holds it until the contribution graph is resolved.
                            </p>
                        </div>


                        <div className="p-6 border-b border-agentbase-border hover:bg-agentbase-cardHover transition-colors group cursor-pointer">
                            <div className="flex items-center space-x-4 mb-2">
                                <div className="text-agentbase-muted group-hover:text-agentbase-cyan transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="16 18 22 12 16 6"></polyline>
                                        <polyline points="8 6 2 12 8 18"></polyline>
                                    </svg>
                                </div>
                                <h3 className="text-lg font-bold text-agentbase-text tracking-tight">Map</h3>
                            </div>
                            <p className="text-agentbase-muted text-sm pl-9">
                                Our AI crawls the full project tree: commits, dependencies, papers, reviews. Builds a weighted contribution graph. A human jury verifies scores through stake-weighted judging.
                            </p>
                        </div>


                        <div className="p-6 hover:bg-agentbase-cardHover transition-colors group cursor-pointer">
                            <div className="flex items-center space-x-4 mb-2">
                                <div className="text-agentbase-muted group-hover:text-agentbase-cyan transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                        <polyline points="7 10 12 15 17 10"></polyline>
                                        <line x1="12" y1="15" x2="12" y2="3"></line>
                                    </svg>
                                </div>
                                <h3 className="text-lg font-bold text-agentbase-text tracking-tight">Flow</h3>
                            </div>
                            <p className="text-agentbase-muted text-sm pl-9">
                                Funding propagates recursively through the graph. Every contributor gets their share, directly to their wallet. No middlemen. The honey flows down.
                            </p>
                        </div>


                    </div>
                </div>


            </div>
        </section>
    );
}
