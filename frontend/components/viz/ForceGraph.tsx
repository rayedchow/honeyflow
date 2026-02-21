"use client";

import { useRef, useEffect, useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { forceRadial, forceCollide } from "d3-force-3d";
import type { GraphData } from "@/lib/types";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

/* ── BFS depth from root ──────────────────────────────────────────────── */

function computeDepths(
  nodes: { id: string }[],
  edges: { source: string; target: string }[],
): { depthMap: Map<string, number>; maxDepth: number } {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    adj.get(e.source)?.push(e.target);
    adj.get(e.target)?.push(e.source);
  }

  // Find the root: prefer REPO/PAPER type, otherwise first node
  const rootId = nodes[0]?.id ?? "";
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

/* ── Honeycomb yellow gradient ────────────────────────────────────────── */
// Deep amber at center → pale yellow at edges
const HONEY_SHADES_LIGHT = ["#FFCC4D", "#FFD666", "#FFE599", "#FFF2CC", "#FFF8D0"];
const HONEY_STROKES_LIGHT = ["#E6B330", "#E6BF4D", "#E6CF80", "#E6DCA8", "#E6E0B8"];

const HONEY_SHADES_DARK = ["#B8860B", "#9A7209", "#7D5E08", "#604A06", "#443605"];
const HONEY_STROKES_DARK = ["#D4A017", "#C49315", "#A67C12", "#88660F", "#6B500C"];

function honeycombFill(depth: number, maxDepth: number, isDark: boolean): string {
  const shades = isDark ? HONEY_SHADES_DARK : HONEY_SHADES_LIGHT;
  const t = maxDepth > 0 ? Math.min(depth / maxDepth, 1) : 0;
  const idx = Math.min(
    Math.floor(t * (shades.length - 1)),
    shades.length - 1,
  );
  return shades[idx];
}

function honeycombStroke(depth: number, maxDepth: number, isDark: boolean): string {
  const strokes = isDark ? HONEY_STROKES_DARK : HONEY_STROKES_LIGHT;
  const t = maxDepth > 0 ? Math.min(depth / maxDepth, 1) : 0;
  const idx = Math.min(
    Math.floor(t * (strokes.length - 1)),
    strokes.length - 1,
  );
  return strokes[idx];
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

interface GraphPalette {
  label: string;
}

const DEFAULT_PALETTE: GraphPalette = {
  label: "rgba(0,0,0,0.75)",
};

function readPaletteFromCssVars(): GraphPalette {
  if (typeof window === "undefined") return DEFAULT_PALETTE;
  const styles = getComputedStyle(document.documentElement);
  const value = styles.getPropertyValue("--ab-text").trim();
  return { label: value || DEFAULT_PALETTE.label };
}

interface ForceGraphProps {
  graphData: GraphData;
  width?: number;
  height?: number;
}

export default function ForceGraph({
  graphData,
  width,
  height,
}: ForceGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const [containerWidth, setContainerWidth] = useState(width || 600);
  const [containerHeight, setContainerHeight] = useState(height || 400);
  const [palette, setPalette] = useState<GraphPalette>(DEFAULT_PALETTE);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (!width) setContainerWidth(entry.contentRect.width);
        if (!height) setContainerHeight(entry.contentRect.height);
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [width, height]);

  useEffect(() => {
    const update = () => {
      setPalette(readPaletteFromCssVars());
      setIsDark(document.documentElement.classList.contains("dark"));
    };
    update();

    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    return () => observer.disconnect();
  }, []);

  // Transform edges -> links, compute BFS depths for honeycomb coloring
  const RING_SPACING = 70;

  const { data, depthMap, maxDepth } = useMemo(() => {
    // Build set of valid node IDs so we can drop orphan edges
    const nodeIds = new Set(graphData.nodes.map((n) => n.id));

    const safeEdges = graphData.edges.filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
    );

    const { depthMap, maxDepth } = computeDepths(
      graphData.nodes,
      safeEdges,
    );

    // Seed initial positions on target rings for fast convergence
    const nodes = graphData.nodes.map((n) => {
      const depth = depthMap.get(n.id) ?? maxDepth;
      const angle = Math.random() * 2 * Math.PI;
      const radius = depth * RING_SPACING;
      return {
        id: n.id,
        label: n.label,
        type: n.type,
        metadata: n.metadata,
        val: n.type === "CONTRIBUTOR" || n.type === "AUTHOR" ? 2 : 4,
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle),
      };
    });
    const links = safeEdges.map((e) => ({
      source: e.source,
      target: e.target,
      weight: e.weight,
      label: e.label,
    }));
    return { data: { nodes, links }, depthMap, maxDepth };
  }, [graphData]);

  const effectiveHeight = height || containerHeight;

  // Configure radial layout forces
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || data.nodes.length === 0) return;

    // Radial force: push each node to its BFS-depth ring
    fg.d3Force(
      "radial",
      forceRadial(
        (node: any) => {
          const depth = depthMap.get(node.id) ?? maxDepth;
          return depth * RING_SPACING;
        },
        0,
        0,
      ).strength(0.8),
    );

    // Collision prevention
    fg.d3Force(
      "collision",
      forceCollide((node: any) => {
        return Math.sqrt(node.val || 4) * 4 + 4;
      }).iterations(3),
    );

    // Weaken charge so nodes don't repel wildly
    fg.d3Force("charge")?.strength(-20);

    // Remove center force (radial replaces it)
    fg.d3Force("center", null);

    // Moderate link tension
    fg.d3Force("link")?.distance(50).strength(0.2);

    fg.d3ReheatSimulation();

    // Zoom to fit after settling
    const id = window.setTimeout(() => {
      fg.zoomToFit(450, 60);
    }, 600);
    return () => window.clearTimeout(id);
  }, [data, depthMap, maxDepth]);

  const nodeCanvasObject = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const label: string = node.label || node.id;
      const r = Math.sqrt(node.val || 4) * 4;
      const depth = depthMap.get(node.id) ?? maxDepth;

      // Hexagon fill + stroke by depth
      hexPath(ctx, node.x, node.y, r);
      ctx.fillStyle = honeycombFill(depth, maxDepth, isDark);
      ctx.fill();
      ctx.strokeStyle = honeycombStroke(depth, maxDepth, isDark);
      ctx.lineWidth = 1.5 / globalScale;
      ctx.stroke();

      // Label
      if (globalScale > 0.6) {
        const fontSize = Math.max(11 / globalScale, 2);
        ctx.font = `bold ${fontSize}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = isDark
          ? (depth <= 1 ? "rgba(234,234,234,0.9)" : "rgba(200,200,200,0.6)")
          : (depth <= 1 ? "rgba(80,50,0,0.85)" : "rgba(120,90,20,0.6)");
        ctx.fillText(label, node.x, node.y + r + 2);
      }
    },
    [depthMap, maxDepth, isDark],
  );

  return (
    <div ref={containerRef} style={{ width: "100%", height: height || "100%" }}>
      <ForceGraph2D
        ref={fgRef}
        graphData={data}
        width={containerWidth}
        height={effectiveHeight}
        backgroundColor="transparent"
        nodeCanvasObject={nodeCanvasObject}
        nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
          const r = Math.sqrt(node.val || 4) * 4 + 3;
          hexPath(ctx, node.x, node.y, r);
          ctx.fillStyle = color;
          ctx.fill();
        }}
        linkColor={() => isDark ? "rgba(200,200,200,0.25)" : "rgba(120,120,120,0.35)"}
        linkWidth={() => 0.5}
        linkDirectionalParticles={0}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        warmupTicks={100}
        cooldownTicks={200}
        enableZoomInteraction={true}
        enablePanInteraction={true}
      />
    </div>
  );
}
