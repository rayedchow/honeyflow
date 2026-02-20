'use client';

import React, { useRef } from 'react';
import Link from 'next/link';

const projects = [
    {
        title: 'SwarmSearch',
        description: 'Autonomous research agent that crawls academic papers, synthesizes findings, and generates literature reviews.',
        href: '#',
    },
    {
        title: 'HiveMind CRM',
        description: 'AI sales agent that qualifies leads, schedules demos, and follows up via email and Slack.',
        href: '#',
    },
    {
        title: 'PollenTracker',
        description: 'Real-time market intelligence agent monitoring competitor pricing, news, and social sentiment.',
        href: '#',
    },
    {
        title: 'NectarCode',
        description: 'Code review agent that catches bugs, suggests improvements, and auto-generates test cases from PRs.',
        href: '#',
    },
    {
        title: 'WaxSeal',
        description: 'Compliance agent that audits documents, flags regulatory issues, and auto-generates reports.',
        href: '#',
    },
    {
        title: 'DroneDeploy',
        description: 'Multi-agent orchestrator that spins up specialized sub-agents for multi-step workflows.',
        href: '#',
    },
];

export default function ProjectShowcase() {
    const scrollRef = useRef<HTMLDivElement>(null);

    const scrollRight = () => {
        if (!scrollRef.current) return;
        const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
        if (scrollLeft + clientWidth >= scrollWidth - 10) {
            scrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
            scrollRef.current.scrollBy({ left: 340, behavior: 'smooth' });
        }
    };

    return (
        <section className="w-full py-12 bg-agentbase-bg relative border-b border-agentbase-border">
            <div className="px-8 mb-8 flex items-end justify-between">
                <div>
                    <h2 className="text-4xl md:text-5xl font-bold tracking-tighter text-agentbase-text mb-3">
                        Built with HoneyFlow
                    </h2>
                    <p className="text-lg text-agentbase-muted">
                        See what the swarm is shipping in production
                    </p>
                </div>
                <button
                    onClick={scrollRight}
                    className="shrink-0 w-12 h-12 rounded-full border border-agentbase-border bg-agentbase-card flex items-center justify-center hover:bg-[var(--ab-pill-bg)] hover:text-[var(--ab-pill-text)] hover:border-[var(--ab-pill-bg)] transition-colors group"
                    aria-label="Scroll right"
                >
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                    </svg>
                </button>
            </div>

            <div
                ref={scrollRef}
                className="flex gap-5 overflow-x-auto px-8 pb-4 scrollbar-hide"
                style={{ scrollSnapType: 'x mandatory', scrollPaddingInline: '2rem', WebkitOverflowScrolling: 'touch' }}
            >
                {projects.map((project, i) => (
                    <Link
                        key={project.title}
                        href={project.href}
                        className={`group flex flex-col shrink-0 w-[300px] border border-agentbase-border bg-agentbase-card p-6${i === 0 ? ' ml-0' : ''}`}
                        style={{ scrollSnapAlign: 'start' }}
                    >
                        <h3 className="text-lg font-bold tracking-tight text-yellow-400 mb-2">
                            {project.title}
                        </h3>
                        <p className="text-sm text-agentbase-muted leading-relaxed mb-5">
                            {project.description}
                        </p>
                        <span className="mt-auto text-sm font-semibold text-agentbase-text flex items-center gap-1.5">
                            View Project
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="5" y1="12" x2="19" y2="12" />
                                <polyline points="12 5 19 12 12 19" />
                            </svg>
                        </span>
                    </Link>
                ))}
            </div>
        </section>
    );
}
