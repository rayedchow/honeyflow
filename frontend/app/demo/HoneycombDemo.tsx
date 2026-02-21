"use client";

import { useRef, useEffect, useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

/* ── Dummy graph data ─────────────────────────────────────────────────── */

const NODES = [
  { id: "root", label: "HoneyFlow" },
  { id: "ethers", label: "ethers" },
  { id: "zustand", label: "zustand" },
  { id: "next", label: "next" },
  { id: "builder", label: "@builder" },
  { id: "bn", label: "bn.js" },
  { id: "hash", label: "hash.js" },
  { id: "react", label: "react" },
  { id: "usync", label: "use-sync-external-store" },
  { id: "webpack", label: "webpack" },
  { id: "turbo", label: "turbopack" },
  { id: "rdom", label: "react-dom" },
  { id: "reviewer", label: "@reviewer" },
  { id: "elliptic", label: "elliptic" },
  { id: "scheduler", label: "scheduler" },
];

const EDGES = [
  { source: "root", target: "ethers", weight: 0.3 },
  { source: "root", target: "zustand", weight: 0.25 },
  { source: "root", target: "next", weight: 0.3 },
  { source: "root", target: "builder", weight: 0.15 },
  { source: "ethers", target: "bn", weight: 0.5 },
  { source: "ethers", target: "hash", weight: 0.3 },
  { source: "ethers", target: "elliptic", weight: 0.2 },
  { source: "zustand", target: "react", weight: 0.6 },
  { source: "zustand", target: "usync", weight: 0.4 },
  { source: "next", target: "webpack", weight: 0.3 },
  { source: "next", target: "turbo", weight: 0.3 },
  { source: "next", target: "rdom", weight: 0.4 },
  { source: "builder", target: "reviewer", weight: 0.5 },
  { source: "rdom", target: "scheduler", weight: 0.5 },
  { source: "rdom", target: "react", weight: 0.5 },
];

/* ── BFS depth from root ──────────────────────────────────────────────── */

function computeDepths(
  nodes: { id: string }[],
  edges: { source: string; target: string }[],
  rootId: string,
): { depthMap: Map<string, number>; maxDepth: number } {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    adj.get(e.source)?.push(e.target);
    adj.get(e.target)?.push(e.source);
  }

  const depthMap = new Map<string, number>();
  const queue = [rootId];
  depthMap.set(rootId, 0);

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const d = depthMap.get(cur)!;
    for (const nb of adj.get(cur) || []) {
      if (!depthMap.has(nb)) {
        depthMap.set(nb, d + 1);
        queue.push(nb);
      }
    }
  }

  const max = Math.max(...depthMap.values(), 1);
  for (const n of nodes) {
    if (!depthMap.has(n.id)) depthMap.set(n.id, max + 1);
  }

  return { depthMap, maxDepth: max };
}

/* ── Yellow gradient from WhatWeDo palettes ───────────────────────────── */
// Deep to light: #FFCC4D → #FFD666 → #FFE599 → #FFF2CC → #FFF8D0
const HONEY_SHADES = ["#FFCC4D", "#FFD666", "#FFE599", "#FFF2CC", "#FFF8D0"];

function honeycombFill(depth: number, maxDepth: number): string {
  const t = maxDepth > 0 ? Math.min(depth / maxDepth, 1) : 0;
  const idx = Math.min(Math.floor(t * (HONEY_SHADES.length - 1)), HONEY_SHADES.length - 1);
  return HONEY_SHADES[idx];
}

// Stroke: slightly darker version
const HONEY_STROKES = ["#E6B330", "#E6BF4D", "#E6CF80", "#E6DCA8", "#E6E0B8"];

function honeycombStroke(depth: number, maxDepth: number): string {
  const t = maxDepth > 0 ? Math.min(depth / maxDepth, 1) : 0;
  const idx = Math.min(Math.floor(t * (HONEY_STROKES.length - 1)), HONEY_STROKES.length - 1);
  return HONEY_STROKES[idx];
}

/* ── Hex path helper ──────────────────────────────────────────────────── */

function hexPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    const hx = x + r * Math.cos(a);
    const hy = y + r * Math.sin(a);
    if (i === 0) ctx.moveTo(hx, hy);
    else ctx.lineTo(hx, hy);
  }
  ctx.closePath();
}

/* ── Component ────────────────────────────────────────────────────────── */

export default function HoneycombDemo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const [w, setW] = useState(800);
  const [h, setH] = useState(600);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setW(entry.contentRect.width);
        setH(entry.contentRect.height);
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const { data, depthMap, maxDepth } = useMemo(() => {
    const { depthMap, maxDepth } = computeDepths(NODES, EDGES, "root");
    return {
      data: {
        nodes: NODES.map((n) => ({
          ...n,
          val: n.id === "root" ? 8 : depthMap.get(n.id)! <= 1 ? 5 : 3,
        })),
        links: EDGES.map((e) => ({ ...e })),
      },
      depthMap,
      maxDepth,
    };
  }, []);

  useEffect(() => {
    if (!fgRef.current) return;
    const id = setTimeout(() => fgRef.current?.zoomToFit(400, 80), 300);
    return () => clearTimeout(id);
  }, []);

  const nodeCanvasObject = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const label: string = node.label || node.id;
      const r = Math.sqrt(node.val || 4) * 4;
      const depth = depthMap.get(node.id) ?? maxDepth;

      // Hexagon
      hexPath(ctx, node.x, node.y, r);
      ctx.fillStyle = honeycombFill(depth, maxDepth);
      ctx.fill();
      ctx.strokeStyle = honeycombStroke(depth, maxDepth);
      ctx.lineWidth = 1.5 / globalScale;
      ctx.stroke();

      // Label
      if (globalScale > 0.6) {
        const fontSize = Math.max(11 / globalScale, 2);
        ctx.font = `bold ${fontSize}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = depth <= 1 ? "rgba(80,50,0,0.85)" : "rgba(120,90,20,0.6)";
        ctx.fillText(label, node.x, node.y + r + 2);
      }
    },
    [depthMap, maxDepth],
  );

  return (
    <div ref={containerRef} className="w-full h-[calc(100vh-64px)]">
      <ForceGraph2D
        ref={fgRef}
        graphData={data}
        width={w}
        height={h}
        backgroundColor="transparent"
        nodeCanvasObject={nodeCanvasObject}
        nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
          const r = Math.sqrt(node.val || 4) * 4 + 3;
          hexPath(ctx, node.x, node.y, r);
          ctx.fillStyle = color;
          ctx.fill();
        }}
        linkColor={() => "rgba(230,190,70,0.15)"}
        linkWidth={() => 0.5}
        linkDirectionalParticles={0}
        cooldownTicks={120}
        enableZoomInteraction={true}
        enablePanInteraction={true}
      />
    </div>
  );
}
