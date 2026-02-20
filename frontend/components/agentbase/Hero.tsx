'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import EthIcon from './EthIcon';

type Phase = 'idle' | 'exit' | 'squish' | 'enter';

const STAGGER = 15;
const BOUNCE = 'cubic-bezier(0.25, 1, 0.5, 1)';

function Inner({ phase, i, children }: { phase: Phase; i: number; children: React.ReactNode }) {
    const out = phase === 'exit' || phase === 'squish';
    const style: React.CSSProperties = out
        ? {
            transform: 'scale(0.3)',
            opacity: 0,
            transition: phase === 'exit'
                ? `transform 0.1s ease-in ${i * STAGGER}ms, opacity 0.08s ease-in ${i * STAGGER}ms`
                : 'none',
        }
        : phase === 'enter'
            ? {
                transform: 'scale(1)',
                opacity: 1,
                transition: `transform 0.2s ${BOUNCE} ${i * STAGGER}ms, opacity 0.1s ease-out ${i * STAGGER}ms`,
            }
            : {};
    return <div style={style}>{children}</div>;
}

function FundCard({ phase }: { phase: Phase }) {
    return (
        <div className="px-8 py-5 flex items-center gap-6">
            <Inner phase={phase} i={0}>
                <div className="flex items-center gap-6">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#FACC15" stroke="none" className="shrink-0">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 6v12M8 10l4-4 4 4M8 14l4 4 4-4" fill="none" stroke="#000" strokeWidth="1.5" />
                    </svg>
                    <span className="font-mono text-white text-sm tracking-[0.2em] font-bold whitespace-nowrap">
                        FUND ANY PROJECT
                    </span>
                </div>
            </Inner>
        </div>
    );
}

function MapCard({ phase }: { phase: Phase }) {
    return (
        <div className="p-6 flex flex-col gap-6">
            <Inner phase={phase} i={0}>
                <div>
                    <h3 className="font-mono text-white text-xl font-bold tracking-wider mb-2">
                        MAP THE GRAPH
                    </h3>
                    <p className="font-mono text-white/60 text-sm tracking-wide">
                        Every commit, dependency, and upstream paper, fully traced
                    </p>
                </div>
            </Inner>
            <Inner phase={phase} i={1}>
                <div className="bg-white rounded-lg px-5 py-3 flex items-center gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                        <polyline points="16 18 22 12 16 6" />
                        <polyline points="8 6 2 12 8 18" />
                    </svg>
                    <span className="font-mono text-black text-sm font-bold tracking-wide">
                        Contribution Graph
                    </span>
                </div>
            </Inner>
        </div>
    );
}

function FlowCard({ phase }: { phase: Phase }) {
    return (
        <div className="p-6 flex flex-col gap-4">
            <Inner phase={phase} i={0}>
                <div className="self-start bg-agentbase-cyan rounded-lg px-4 py-2">
                    <span className="font-mono text-black text-sm font-bold tracking-wider">
                        THE HONEY FLOWS DOWN
                    </span>
                </div>
            </Inner>
            <Inner phase={phase} i={1}>
                <div className="bg-agentbase-cyan rounded-lg px-4 py-4">
                    <p className="font-mono text-black text-sm leading-relaxed">
                        Funding propagates recursively through the full contribution graph. Every contributor gets their share, directly to their wallet.
                    </p>
                </div>
            </Inner>
            <Inner phase={phase} i={2}>
                <div className="flex items-center gap-2 pt-1">
                    <span className="text-white text-lg leading-none">•</span>
                    <span className="font-mono text-white text-sm font-bold tracking-wider">
                        NO MIDDLEMEN. ON-CHAIN.
                    </span>
                </div>
            </Inner>
        </div>
    );
}

const WORDS = ['the maintainer', 'the repo', 'the top', 'one person'];

function sharedPrefix(a: string, b: string) {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    return i;
}

function TypingWord() {
    const [text, setText] = useState('');
    const [wordIdx, setWordIdx] = useState(0);
    const [typing, setTyping] = useState(true);
    const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const word = WORDS[wordIdx];
        const nextWord = WORDS[(wordIdx + 1) % WORDS.length];
        const deleteTo = sharedPrefix(word, nextWord);

        if (typing) {
            if (text.length < word.length) {
                typingTimeout.current = setTimeout(() => {
                    setText(word.slice(0, text.length + 1));
                }, 100);
            } else {
                typingTimeout.current = setTimeout(() => {
                    setTyping(false);
                }, 2000);
            }
        } else {
            if (text.length > deleteTo) {
                typingTimeout.current = setTimeout(() => {
                    setText(text.slice(0, -1));
                }, 60);
            } else {
                setWordIdx((wordIdx + 1) % WORDS.length);
                setTyping(true);
            }
        }

        return () => {
            if (typingTimeout.current) clearTimeout(typingTimeout.current);
        };
    }, [text, typing, wordIdx]);

    return (
        <span className="text-yellow-400 relative inline-block">
            {text}
            <span className="w-[3px] h-[0.8em] bg-yellow-400 inline-block align-middle animate-pulse ml-[1px]" />
        </span>
    );
}

const CARDS = [FundCard, MapCard, FlowCard];

function AnimatedCards() {
    const [index, setIndex] = useState(0);
    const [phase, setPhase] = useState<Phase>('idle');
    const [containerHeight, setContainerHeight] = useState<number | null>(null);
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
    const heightsRef = useRef<number[]>([]);
    const measureRef = useRef<HTMLDivElement>(null);
    const [transitioning, setTransitioning] = useState(false);
    const indexRef = useRef(0);

    const t = (ms: number, fn: () => void) => {
        timers.current.push(setTimeout(fn, ms));
    };

    const measureHeights = useCallback(() => {
        if (!measureRef.current) return;
        const container = measureRef.current;
        const heights: number[] = [];
        for (let i = 0; i < container.children.length; i++) {
            const child = container.children[i] as HTMLElement;
            heights.push(child.offsetHeight);
        }
        heightsRef.current = heights;
        if (containerHeight === null && heights.length > 0) {
            setContainerHeight(heights[0]);
        }
    }, [containerHeight]);

    useEffect(() => {
        measureHeights();
        window.addEventListener('resize', measureHeights);
        return () => window.removeEventListener('resize', measureHeights);
    }, [measureHeights]);

    useEffect(() => {
        const interval = setInterval(() => {
            const nextIdx = (indexRef.current + 1) % CARDS.length;
            const nextHeight = heightsRef.current[nextIdx];

            setPhase('exit');

            t(150, () => {
                setTransitioning(true);
                if (nextHeight) setContainerHeight(nextHeight);
            });

            t(200, () => {
                setPhase('squish');
                indexRef.current = nextIdx;
                setIndex(nextIdx);
            });

            t(350, () => {
                setPhase('enter');
            });

            t(800, () => {
                setPhase('idle');
                setTransitioning(false);
            });
        }, 3000);

        return () => {
            clearInterval(interval);
            timers.current.forEach(id => clearTimeout(id));
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const Card = CARDS[index];

    return (
        <div className="flex items-center justify-center w-full max-w-[400px]">
            <div
                ref={measureRef}
                aria-hidden
                style={{
                    position: 'absolute',
                    visibility: 'hidden',
                    pointerEvents: 'none',
                    width: '100%',
                    maxWidth: '400px',
                }}
            >
                {CARDS.map((MeasureCard, i) => (
                    <div key={i} className="hero-card-box rounded-2xl">
                        <MeasureCard phase="idle" />
                    </div>
                ))}
            </div>

            <div
                className="w-full hero-card-box rounded-2xl overflow-hidden"
                style={{
                    height: containerHeight ? `${containerHeight}px` : 'auto',
                    transition: transitioning
                        ? `height 0.5s ${BOUNCE}`
                        : 'none',
                    willChange: 'height',
                }}
            >
                <Card phase={phase} />
            </div>
        </div>
    );
}

export default function Hero() {
    return (
        <section className="relative w-full flex items-stretch border-b border-agentbase-border">

            <div className="z-10 w-full grid grid-cols-1 lg:grid-cols-2 items-stretch">
                <div className="flex flex-col items-start justify-center space-y-5 max-w-xl px-8 py-12">
                    <h1 className="text-3xl md:text-4xl font-sans lg:text-5xl font-bold tracking-tight leading-[1.1] text-agentbase-text">
                        Funding stops at <br />
                        <TypingWord />. <br />
                        We push it all <br className="hidden md:block" />
                        the way down.
                    </h1>
                    <p className="text-base text-agentbase-muted font-medium leading-relaxed max-w-lg">
                        HoneyFlow maps every commit, dependency, and upstream paper into a contribution graph, then distributes funding recursively to everyone who actually built it.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
                        <Link
                            href="/sign-up"
                            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-black text-white font-mono text-xs tracking-widest uppercase font-bold rounded-full hover:bg-gray-800 transition-colors"
                        >
                            <EthIcon size={12} />
                            Donate
                        </Link>
                        <Link
                            href="/docs"
                            className="px-6 py-3 bg-transparent text-black border border-black border-2 font-mono text-xs tracking-widest uppercase font-bold rounded-full hover:bg-gray-50 transition-colors"
                        >
                            View Docs →
                        </Link>
                    </div>
                </div>

                <div className="w-full relative flex items-center justify-center px-8 py-12 lg:border-l border-agentbase-border">
                    <AnimatedCards />
                </div>

            </div>
        </section>
    );
}
