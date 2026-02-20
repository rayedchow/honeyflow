'use client';

import React, { useEffect, useRef, useState } from 'react';

const PALETTES = [
    ['#FFD0D0', '#FFAAAA', '#FF8787', '#FF7C7F'],
    ['#FFF2CC', '#FFE599', '#FFD666', '#FFCC4D'],
    ['#D0F0D0', '#AADCAA', '#87C987', '#7CBF7C'],
    ['#FFF8D0', '#FFEDA0', '#FFE170', '#FFD740'],
    ['#E4D0FF', '#D0AAFF', '#B887FF', '#B07CFF'],
    ['#FFD0EB', '#FFAADD', '#FF87CA', '#FF7CC4'],
];

const GRAY_SHADES = ['#D8D8D8', '#C4C4C4', '#ABABAB', '#9E9E9E'];

function hexToRgb(c: string) {
    const v = parseInt(c.slice(1), 16);
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

type WaveFn = (col: number, row: number, t: number) => number;

const WAVES: WaveFn[] = [
    (col, row, t) => {
        return Math.sin((col + row) * 0.2 + t * 0.9) * 0.5
             + Math.cos(col * 0.3 - t * 0.7) * 0.5;
    },
    (col, row, t) => {
        const dist = Math.sqrt(col * col + row * row);
        return Math.sin(dist * 0.3 - t * 1.2) * 0.6
             + Math.cos(dist * 0.12 + t * 0.5) * 0.4;
    },
    (col, row, t) => {
        return Math.sin(row * 0.35 + t * 0.6) * Math.cos(col * 0.08 + t * 0.3)
             + Math.sin(col * 0.12 + t * 0.9) * 0.3;
    },
    (col, row, t) => {
        const check = Math.sin(col * 0.5) * Math.sin(row * 0.5);
        const morph = Math.sin(t * 0.7) * 0.5;
        return check * (1 + morph) + Math.sin((col - row) * 0.15 + t * 0.8) * 0.3;
    },
    (col, row, t) => {
        return Math.sin(col * 0.4 + t * 0.8) * 0.7
             + Math.cos(row * 0.1 + col * 0.05 + t * 0.5) * 0.3;
    },
    (col, row, t) => {
        return (Math.sin(col * 0.3 + t * 0.6) + Math.sin(row * 0.3 - t * 0.4)) * 0.5
             + Math.cos((col + row) * 0.2 + t * 1.1) * 0.3;
    },
];

const SQUARE_SIZE = 6;
const SQUARE_GAP = 3;
const CELL = SQUARE_SIZE + SQUARE_GAP;

function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
}

function PixelPattern({ colorIndex, hovered }: { colorIndex: number; hovered: boolean }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animRef = useRef<number>(0);
    const colorMixRef = useRef(0);
    const hoveredRef = useRef(hovered);
    hoveredRef.current = hovered;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const palette = PALETTES[colorIndex % PALETTES.length].map(hexToRgb);
        const grays = GRAY_SHADES.map(hexToRgb);
        const waveFn = WAVES[colorIndex % WAVES.length];

        let cols = 0;
        let rows = 0;

        const resize = () => {
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            ctx.scale(dpr, dpr);
            cols = Math.ceil(rect.width / CELL);
            rows = Math.ceil(rect.height / CELL);
        };

        resize();
        window.addEventListener('resize', resize);

        const animate = (time: number) => {
            const t = time * 0.001;
            const rect = canvas.getBoundingClientRect();
            ctx.clearRect(0, 0, rect.width, rect.height);

            const target = hoveredRef.current ? 1 : 0;
            colorMixRef.current += (target - colorMixRef.current) * 0.08;
            const mix = colorMixRef.current;

            for (let row = 0; row < rows; row++) {
                for (let col = 0; col < cols; col++) {
                    const x = col * CELL;
                    const y = row * CELL;

                    const wave = waveFn(col, row, t);

                    const norm = Math.max(0, Math.min(1, (wave + 1) / 2));
                    const shadeIdx = Math.min(3, Math.floor(norm * 3.99));

                    const gray = grays[shadeIdx];
                    const clr = palette[shadeIdx];

                    const r = Math.round(lerp(gray.r, clr.r, mix));
                    const g = Math.round(lerp(gray.g, clr.g, mix));
                    const b = Math.round(lerp(gray.b, clr.b, mix));

                    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                    ctx.fillRect(x, y, SQUARE_SIZE, SQUARE_SIZE);
                }
            }

            animRef.current = requestAnimationFrame(animate);
        };

        animRef.current = requestAnimationFrame(animate);

        return () => {
            cancelAnimationFrame(animRef.current);
            window.removeEventListener('resize', resize);
        };
    }, [colorIndex]);

    return (
        <div className="w-full h-24 overflow-hidden bg-agentbase-canvasBg">
            <canvas
                ref={canvasRef}
                style={{ width: '100%', height: '100%' }}
            />
        </div>
    );
}

function FeatureCard({ title, description, colorIndex }: { title: string; description: string; colorIndex: number }) {
    const [hovered, setHovered] = useState(false);

    return (
        <div
            className="flex flex-col border border-agentbase-border bg-agentbase-card shadow-sm overflow-hidden"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <PixelPattern colorIndex={colorIndex} hovered={hovered} />
            <div className="px-6 pt-5 pb-6 flex flex-col flex-1">
                <h3 className="text-lg font-bold tracking-tight text-agentbase-text mb-2">{title}</h3>
                <p className="text-sm text-agentbase-muted leading-relaxed">
                    {description}
                </p>
            </div>
        </div>
    );
}

export default function Testimonials() {
    return (
        <section className="w-full py-12 bg-agentbase-bg relative border-b border-agentbase-border">
            <div className="px-8">

                <div className="mb-8 flex flex-col items-start">
                    <div className="inline-block bg-agentbase-badgeBg text-agentbase-badgeText text-[10px] font-bold tracking-widest uppercase px-3 py-1 rounded-full mb-3">
                        FEATURES
                    </div>
                    <h2 className="text-4xl md:text-5xl font-bold tracking-tighter text-agentbase-text mb-4">
                        What we do
                    </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                    <FeatureCard
                        title="Contribution Graphs"
                        description="Maps every commit, PR, and dependency to find who actually built it."
                        colorIndex={0}
                    />

                    <FeatureCard
                        title="Recursive Distribution"
                        description="ETH flows through the full contribution graph. Weighted, proportional, on-chain."
                        colorIndex={1}
                    />

                    <FeatureCard
                        title="Distilled Human Judgement"
                        description="Staked jurors answer attribution questions that train the funding model."
                        colorIndex={2}
                    />
                </div>
            </div>
        </section>
    );
}
