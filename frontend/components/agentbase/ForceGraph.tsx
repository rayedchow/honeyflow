"use client";

import { useRef, useEffect, useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { GraphData } from "@/lib/types";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

/* ── colour by node type ─────────────────────────────────────────────── */
const NODE_COLORS: Record<string, string> = {
  REPO: "#FEC508",           // yellow accent
  PACKAGE: "#4ADE80",        // green
  BODY_OF_WORK: "#60A5FA",   // blue
  CONTRIBUTOR: "#A78BFA",    // purple
  PAPER: "#FEC508",          // yellow
  CITED_WORK: "#60A5FA",     // blue
  AUTHOR: "#A78BFA",         // purple
};

interface GraphPalette {
  link: string;
  label: string;
  nodeStroke: string;
}

const DEFAULT_PALETTE: GraphPalette = {
  // Light-mode friendly defaults (also readable in dark mode).
  link: "rgba(0,0,0,0.24)",
  label: "rgba(0,0,0,0.75)",
  nodeStroke: "rgba(0,0,0,0.22)",
};

function readPaletteFromCssVars(): GraphPalette {
  if (typeof window === "undefined") return DEFAULT_PALETTE;
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => {
    const value = styles.getPropertyValue(name).trim();
    return value || fallback;
  };
  return {
    link: read("--ab-edge-line-active", DEFAULT_PALETTE.link),
    label: read("--ab-text", DEFAULT_PALETTE.label),
    nodeStroke: read("--ab-border-strong", DEFAULT_PALETTE.nodeStroke),
  };
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
    const updatePalette = () => setPalette(readPaletteFromCssVars());
    updatePalette();

    const observer = new MutationObserver(updatePalette);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    return () => observer.disconnect();
  }, []);

  // Transform our edges -> links for the library
  const data = useMemo(() => ({
    nodes: graphData.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      type: n.type,
      metadata: n.metadata,
      val: n.type === "CONTRIBUTOR" || n.type === "AUTHOR" ? 2 : 4,
    })),
    links: graphData.edges.map((e) => ({
      source: e.source,
      target: e.target,
      weight: e.weight,
      label: e.label,
    })),
  }), [graphData]);

  const effectiveHeight = height || containerHeight;

  useEffect(() => {
    if (!fgRef.current || data.nodes.length === 0) return;
    const id = window.setTimeout(() => {
      fgRef.current?.zoomToFit(450, 60);
    }, 250);
    return () => window.clearTimeout(id);
  }, [data.nodes.length, data.links.length, containerWidth, effectiveHeight]);

  const nodeCanvasObject = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const label = node.label || node.id;
      const fontSize = Math.max(10 / globalScale, 1.5);
      const r = Math.sqrt(node.val || 4) * 3;

      // Draw node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = NODE_COLORS[node.type] || "#999";
      ctx.globalAlpha = 0.9;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = palette.nodeStroke;
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // Draw label
      if (globalScale > 0.8) {
        ctx.font = `${fontSize}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = palette.label;
        ctx.fillText(label, node.x, node.y + r + 2);
      }
    },
    [palette.label, palette.nodeStroke],
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
          const r = Math.sqrt(node.val || 4) * 3;
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 2, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        }}
        linkColor={() => palette.link}
        linkWidth={(link: any) => Math.max(1.0, link.weight * 2.2)}
        linkDirectionalParticles={1}
        linkDirectionalParticleWidth={2.0}
        linkDirectionalParticleColor={() => "rgba(254,197,8,0.4)"}
        cooldownTicks={120}
        enableZoomInteraction={true}
        enablePanInteraction={true}
      />
    </div>
  );
}
