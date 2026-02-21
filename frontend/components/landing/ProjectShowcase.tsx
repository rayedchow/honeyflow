'use client';

import React, { useRef, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { fetchProjects } from '@/lib/api';
import { typeConfig } from '@/components/ui/TypeIcons';
import type { Project } from '@/lib/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const fetcher = () => fetchProjects().then((d) => d.projects);

function SkeletonCard() {
    return (
        <div className="flex flex-col shrink-0 w-[300px] border border-agentbase-border bg-agentbase-card overflow-hidden animate-pulse">
            <div className="relative w-full h-40 bg-agentbase-border/30 flex items-center justify-center">
                <svg className="w-6 h-6 text-agentbase-muted animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
            </div>
            <div className="p-6 flex flex-col gap-4 flex-1">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-agentbase-border/40 rounded" />
                    <div className="flex-1 min-w-0 space-y-2">
                        <div className="h-4 bg-agentbase-border/40 rounded w-3/4" />
                        <div className="h-3 bg-agentbase-border/40 rounded w-1/2" />
                    </div>
                </div>
                <div className="space-y-2">
                    <div className="h-3 bg-agentbase-border/40 rounded w-full" />
                    <div className="h-3 bg-agentbase-border/40 rounded w-2/3" />
                </div>
                <div className="flex items-center gap-3 pt-3 border-t border-agentbase-border mt-auto">
                    <div className="h-6 bg-agentbase-border/40 rounded w-20" />
                    <div className="h-3 bg-agentbase-border/40 rounded w-24" />
                </div>
            </div>
        </div>
    );
}

function ShowcaseCard({ project }: { project: Project }) {
    const typeKey = project.type as keyof typeof typeConfig;
    const { Icon } = typeConfig[typeKey] || typeConfig['repo'];
    const [imgLoaded, setImgLoaded] = useState(false);
    const raised =
        typeof project.raised === 'number'
            ? `$${project.raised.toLocaleString()}`
            : project.raised || '$0';

    return (
        <Link
            href={`/explore/${project.slug}`}
            className="group flex flex-col shrink-0 w-[300px] border border-agentbase-border bg-agentbase-card hover:bg-agentbase-cardHover transition-colors overflow-hidden"
            style={{ scrollSnapAlign: 'start' }}
        >
            {project.cover_image_url && (
                <div className="relative w-full h-40 overflow-hidden bg-agentbase-border/30">
                    {!imgLoaded && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <svg className="w-6 h-6 text-agentbase-muted animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25" />
                                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                        </div>
                    )}
                    <img
                        src={`${API_BASE}${project.cover_image_url}`}
                        alt={`${project.name} cover`}
                        className={`w-full h-full object-cover transition-opacity duration-300 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
                        onLoad={() => setImgLoaded(true)}
                    />
                </div>
            )}
            <div className="p-6 flex flex-col gap-4 flex-1">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 border border-agentbase-border flex items-center justify-center text-agentbase-muted group-hover:text-agentbase-cyan transition-colors shrink-0">
                        <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-base font-bold tracking-tight text-agentbase-text truncate">
                            {project.name}
                        </h3>
                        <p className="text-[11px] text-agentbase-muted uppercase tracking-widest font-mono mt-0.5">
                            {project.category}
                        </p>
                    </div>
                </div>

                <p className="text-sm text-agentbase-muted leading-relaxed line-clamp-2">
                    {project.summary}
                </p>

                <div className="flex items-center gap-3 pt-3 border-t border-agentbase-border mt-auto">
                    <span className="inline-flex px-2.5 py-1 bg-agentbase-badgeBg text-agentbase-badgeText text-[11px] font-mono font-bold tracking-wide">
                        {raised} raised
                    </span>
                    <span className="text-[11px] text-agentbase-muted">
                        {project.contributors} contributors
                    </span>
                </div>
            </div>
        </Link>
    );
}

export default function ProjectShowcase() {
    const scrollRef = useRef<HTMLDivElement>(null);
    const { data: projects = [], isLoading } = useSWR('showcase-projects', fetcher, {
        revalidateOnFocus: false,
        dedupingInterval: 60_000,
    });

    // Sort by raised descending and take top 6
    const top = [...projects]
        .sort((a, b) => (b.raised ?? 0) - (a.raised ?? 0))
        .slice(0, 6);

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
                        Top funded projects traced by the community
                    </p>
                </div>
                {top.length > 0 && (
                    <button
                        onClick={scrollRight}
                        className="shrink-0 w-12 h-12 rounded-full border border-agentbase-border bg-agentbase-card flex items-center justify-center hover:bg-agentbase-pillBg hover:text-agentbase-pillText hover:border-agentbase-pillBg transition-colors group"
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
                )}
            </div>

            <div
                ref={scrollRef}
                className="flex gap-5 overflow-x-auto px-8 pb-4 scrollbar-hide"
                style={{ scrollSnapType: 'x mandatory', scrollPaddingInline: '2rem', WebkitOverflowScrolling: 'touch' }}
            >
                {isLoading
                    ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
                    : top.map((project) => (
                          <ShowcaseCard key={project.slug} project={project} />
                      ))}
            </div>
        </section>
    );
}
