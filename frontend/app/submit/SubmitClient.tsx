"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import EthIcon from "@/components/agentbase/EthIcon";

// ── Types ────────────────────────────────────────────────────────────────────

type Phase = "idle" | "uploading" | "parsing" | "tracing" | "attributing" | "complete";
type InputMode = "url" | "pdf";

interface GraphNode {
  id: string;
  label: string;
  ring: 0 | 1 | 2;
  x: number;
  y: number;
  parentId?: string;
  pct?: string;
}

interface GraphEdge {
  from: string;
  to: string;
  pct: string;
}

interface LogLine {
  time: string;
  text: string;
}

// ── Fake demo data ───────────────────────────────────────────────────────────

const DEMO_NODES: GraphNode[] = [
  { id: "source", label: "zkml-paper.pdf", ring: 0, x: 50, y: 50 },
  { id: "dep-1", label: "LibSnark", ring: 1, x: 50, y: 18, parentId: "source", pct: "28%" },
  { id: "dep-2", label: "Halo2", ring: 1, x: 82, y: 35, parentId: "source", pct: "24%" },
  { id: "dep-3", label: "PyTorch", ring: 1, x: 82, y: 65, parentId: "source", pct: "22%" },
  { id: "dep-4", label: "EZKL", ring: 1, x: 50, y: 82, parentId: "source", pct: "16%" },
  { id: "dep-5", label: "Circom", ring: 1, x: 18, y: 50, parentId: "source", pct: "10%" },
  { id: "con-1", label: "alice.eth", ring: 2, x: 38, y: 5, parentId: "dep-1" },
  { id: "con-2", label: "bob.eth", ring: 2, x: 62, y: 5, parentId: "dep-1" },
  { id: "con-3", label: "sean.eth", ring: 2, x: 95, y: 22, parentId: "dep-2" },
  { id: "con-4", label: "vitalik.eth", ring: 2, x: 95, y: 50, parentId: "dep-3" },
  { id: "con-5", label: "barry.eth", ring: 2, x: 95, y: 78, parentId: "dep-3" },
  { id: "con-6", label: "carol.eth", ring: 2, x: 62, y: 95, parentId: "dep-4" },
  { id: "con-7", label: "dave.eth", ring: 2, x: 38, y: 95, parentId: "dep-4" },
  { id: "con-8", label: "emily.eth", ring: 2, x: 5, y: 38, parentId: "dep-5" },
];

const DEMO_EDGES: GraphEdge[] = [
  { from: "source", to: "dep-1", pct: "28%" },
  { from: "source", to: "dep-2", pct: "24%" },
  { from: "source", to: "dep-3", pct: "22%" },
  { from: "source", to: "dep-4", pct: "16%" },
  { from: "source", to: "dep-5", pct: "10%" },
  { from: "dep-1", to: "con-1", pct: "15%" },
  { from: "dep-1", to: "con-2", pct: "13%" },
  { from: "dep-2", to: "con-3", pct: "24%" },
  { from: "dep-3", to: "con-4", pct: "12%" },
  { from: "dep-3", to: "con-5", pct: "10%" },
  { from: "dep-4", to: "con-6", pct: "9%" },
  { from: "dep-4", to: "con-7", pct: "7%" },
  { from: "dep-5", to: "con-8", pct: "10%" },
];

const DEMO_LOG: { delay: number; line: LogLine }[] = [
  { delay: 0, line: { time: "0.0s", text: "Starting analysis..." } },
  { delay: 800, line: { time: "0.4s", text: "Parsed source: zkml-paper.pdf" } },
  { delay: 1600, line: { time: "1.2s", text: "Found 5 direct references" } },
  { delay: 2400, line: { time: "1.8s", text: "Tracing: LibSnark → 2 contributors" } },
  { delay: 3000, line: { time: "2.3s", text: "Tracing: Halo2 → 1 contributor" } },
  { delay: 3500, line: { time: "2.8s", text: "Tracing: PyTorch → 2 contributors" } },
  { delay: 4000, line: { time: "3.2s", text: "Tracing: EZKL → 2 contributors" } },
  { delay: 4400, line: { time: "3.6s", text: "Tracing: Circom → 1 contributor" } },
  { delay: 5200, line: { time: "4.4s", text: "Calculating attribution percentages..." } },
  { delay: 6400, line: { time: "5.6s", text: "Attribution complete — 14 nodes mapped" } },
];

const NODE_SCHEDULE: { id: string; at: number }[] = [
  { id: "source", at: 600 },
  { id: "dep-1", at: 1800 },
  { id: "dep-2", at: 2200 },
  { id: "dep-3", at: 2600 },
  { id: "dep-4", at: 3000 },
  { id: "dep-5", at: 3400 },
  { id: "con-1", at: 3800 },
  { id: "con-2", at: 4000 },
  { id: "con-3", at: 4200 },
  { id: "con-4", at: 4400 },
  { id: "con-5", at: 4600 },
  { id: "con-6", at: 4800 },
  { id: "con-7", at: 5000 },
  { id: "con-8", at: 5200 },
];

const EDGE_SCHEDULE: { from: string; to: string; at: number }[] = [
  { from: "source", to: "dep-1", at: 1900 },
  { from: "source", to: "dep-2", at: 2300 },
  { from: "source", to: "dep-3", at: 2700 },
  { from: "source", to: "dep-4", at: 3100 },
  { from: "source", to: "dep-5", at: 3500 },
  { from: "dep-1", to: "con-1", at: 3900 },
  { from: "dep-1", to: "con-2", at: 4100 },
  { from: "dep-2", to: "con-3", at: 4300 },
  { from: "dep-3", to: "con-4", at: 4500 },
  { from: "dep-3", to: "con-5", at: 4700 },
  { from: "dep-4", to: "con-6", at: 4900 },
  { from: "dep-4", to: "con-7", at: 5100 },
  { from: "dep-5", to: "con-8", at: 5300 },
];

const PHASE_SCHEDULE: { phase: Phase; at: number }[] = [
  { phase: "uploading", at: 0 },
  { phase: "parsing", at: 400 },
  { phase: "tracing", at: 1600 },
  { phase: "attributing", at: 5000 },
  { phase: "complete", at: 6400 },
];

const PHASE_LABELS: Record<Phase, string> = {
  idle: "",
  uploading: "Uploading...",
  parsing: "Parsing source...",
  tracing: "Tracing dependencies...",
  attributing: "Calculating attributions...",
  complete: "Analysis complete",
};

// ── Contribution Graph ───────────────────────────────────────────────────────

function ContributionGraph({
  visibleNodes,
  visibleEdges,
  phase,
}: {
  visibleNodes: Set<string>;
  visibleEdges: Set<string>;
  phase: Phase;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [lines, setLines] = useState<
    { from: string; to: string; x1: number; y1: number; x2: number; y2: number; pct: string }[]
  >([]);

  const updateLines = useCallback(() => {
    if (!containerRef.current) return;
    const cRect = containerRef.current.getBoundingClientRect();

    const getCenter = (id: string) => {
      const el = document.getElementById("cg-" + id);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2 - cRect.left, y: r.top + r.height / 2 - cRect.top };
    };

    const newLines = DEMO_EDGES.map((e) => {
      const p1 = getCenter(e.from);
      const p2 = getCenter(e.to);
      if (!p1 || !p2) return { from: e.from, to: e.to, x1: 0, y1: 0, x2: 0, y2: 0, pct: e.pct };
      return { from: e.from, to: e.to, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, pct: e.pct };
    });
    setLines(newLines);
  }, []);

  useEffect(() => {
    updateLines();
    window.addEventListener("resize", updateLines);
    return () => window.removeEventListener("resize", updateLines);
  }, [updateLines, visibleNodes]);

  const isEmpty = phase === "idle";

  return (
    <div
      className="relative w-full border border-agentbase-border bg-agentbase-card overflow-hidden"
      style={{ height: 520 }}
    >
      {isEmpty && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="w-14 h-14 border border-agentbase-border flex items-center justify-center mx-auto mb-4">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-agentbase-muted">
                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            </div>
            <p className="text-agentbase-muted text-[14px]">
              Submit a source to see the contribution graph
            </p>
          </div>
        </div>
      )}

      {!isEmpty && (
        <div ref={containerRef} className="absolute inset-4">
          {/* SVG edges */}
          <svg ref={svgRef} className="absolute inset-0 w-full h-full pointer-events-none z-0">
            <defs>
              <filter id="edgeGlow">
                <feGaussianBlur stdDeviation="1.5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            {lines.map((l) => {
              const key = `${l.from}-${l.to}`;
              const isVisible = visibleEdges.has(key);
              return (
                <g key={key}>
                  <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="var(--ab-edge-line)" strokeWidth="1" />
                  <line
                    x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
                    stroke="var(--ab-edge-line-active)"
                    strokeWidth="1.5"
                    filter="url(#edgeGlow)"
                    strokeDasharray="500"
                    strokeDashoffset={isVisible ? "0" : "500"}
                    style={{ transition: "stroke-dashoffset 0.6s ease-out", opacity: isVisible ? 1 : 0 }}
                  />
                  {isVisible && (
                    <text
                      x={(l.x1 + l.x2) / 2}
                      y={(l.y1 + l.y2) / 2 - 6}
                      textAnchor="middle"
                      className="fill-agentbase-muted text-[9px]"
                      style={{ fontFamily: "monospace", transition: "opacity 0.4s", opacity: phase === "attributing" || phase === "complete" ? 1 : 0 }}
                    >
                      {l.pct}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Nodes */}
          {DEMO_NODES.map((node) => {
            const isVisible = visibleNodes.has(node.id);
            const isSource = node.ring === 0;
            const isContributor = node.ring === 2;

            const size = isSource ? "w-16 h-16" : isContributor ? "w-11 h-11" : "w-13 h-13";
            const iconSize = isSource ? "w-6 h-6" : isContributor ? "w-3.5 h-3.5" : "w-4 h-4";

            return (
              <div
                key={node.id}
                id={"cg-" + node.id}
                className={`absolute -translate-x-1/2 -translate-y-1/2 ${size} flex items-center justify-center z-10`}
                style={{
                  left: `${node.x}%`,
                  top: `${node.y}%`,
                  opacity: isVisible ? 1 : 0,
                  transform: `translate(-50%, -50%) scale(${isVisible ? 1 : 0.6})`,
                  transition: "opacity 0.4s ease-out, transform 0.4s ease-out, box-shadow 0.4s, border-color 0.4s, background 0.4s",
                  background: isVisible ? "var(--ab-node-bg)" : "var(--ab-node-bg-inactive)",
                  border: `1px solid ${isVisible ? "var(--ab-node-border)" : "var(--ab-node-border-inactive)"}`,
                  boxShadow: isVisible
                    ? isSource
                      ? "0 0 24px var(--ab-accent-glow), 0 0 48px rgba(254,197,8,0.05)"
                      : "0 0 12px var(--ab-glass-shadow-sm)"
                    : "none",
                }}
              >
                {/* Label */}
                <span
                  className="absolute -top-7 px-2 py-0.5 bg-agentbase-canvasBg border border-agentbase-border text-[9px] font-mono font-bold text-agentbase-muted whitespace-nowrap tracking-wide"
                  style={{
                    opacity: isVisible ? 1 : 0,
                    transform: `translateY(${isVisible ? 0 : 4}px)`,
                    transition: "opacity 0.3s 0.2s, transform 0.3s 0.2s",
                  }}
                >
                  {node.label}
                </span>

                {/* Icon */}
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`${iconSize} transition-colors duration-300`}
                  style={{ stroke: isVisible ? "var(--ab-node-stroke)" : "var(--ab-node-stroke-inactive)" }}
                >
                  {isSource ? (
                    <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>
                  ) : isContributor ? (
                    <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>
                  ) : (
                    <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></>
                  )}
                </svg>
              </div>
            );
          })}
        </div>
      )}

      {/* Phase label */}
      {phase !== "idle" && phase !== "complete" && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-agentbase-canvasBg border border-agentbase-border">
          <span className="w-1.5 h-1.5 rounded-full bg-agentbase-cyan animate-pulse" />
          <span className="text-[11px] font-mono font-bold tracking-wider uppercase text-agentbase-muted">{PHASE_LABELS[phase]}</span>
        </div>
      )}

      {phase === "complete" && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-agentbase-cyanGlow border border-agentbase-cyan/30">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-agentbase-accentText">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span className="text-[11px] font-mono font-bold tracking-wider uppercase text-agentbase-accentText">Analysis complete</span>
        </div>
      )}
    </div>
  );
}

// ── Processing Log ───────────────────────────────────────────────────────────

function ProcessingLog({ lines }: { lines: LogLine[] }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines.length]);

  if (lines.length === 0) return null;

  return (
    <div className="border border-agentbase-border bg-agentbase-card p-4 max-h-48 overflow-y-auto">
      <div className="space-y-1">
        {lines.map((l, i) => (
          <div
            key={i}
            className="flex gap-3 text-[11px] font-mono leading-relaxed"
            style={{ animation: "fadeInLine 0.3s ease-out" }}
          >
            <span className="text-agentbase-muted flex-shrink-0 w-10 text-right">[{l.time}]</span>
            <span className="text-agentbase-textMuted">{l.text}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function SubmitClient() {
  const [inputMode, setInputMode] = useState<InputMode>("url");
  const [url, setUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [amount, setAmount] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [visibleNodes, setVisibleNodes] = useState<Set<string>>(new Set());
  const [visibleEdges, setVisibleEdges] = useState<Set<string>>(new Set());
  const [logLines, setLogLines] = useState<LogLine[]>([]);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const hasSource =
    (inputMode === "url" && url.trim().length > 0) || (inputMode === "pdf" && fileName.length > 0);
  const canAnalyze = phase === "idle" && hasSource;
  const canDonate = phase === "complete" && amount.trim().length > 0 && parseFloat(amount) > 0;

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const handleAnalyze = useCallback(() => {
    if (!canAnalyze) return;
    clearTimers();
    setVisibleNodes(new Set());
    setVisibleEdges(new Set());
    setLogLines([]);

    PHASE_SCHEDULE.forEach(({ phase: p, at }) => {
      timersRef.current.push(setTimeout(() => setPhase(p), at));
    });

    NODE_SCHEDULE.forEach(({ id, at }) => {
      timersRef.current.push(
        setTimeout(() => setVisibleNodes((prev) => new Set(prev).add(id)), at)
      );
    });

    EDGE_SCHEDULE.forEach(({ from, to, at }) => {
      timersRef.current.push(
        setTimeout(() => setVisibleEdges((prev) => new Set(prev).add(`${from}-${to}`)), at)
      );
    });

    DEMO_LOG.forEach(({ delay, line }) => {
      timersRef.current.push(
        setTimeout(() => setLogLines((prev) => [...prev, line]), delay)
      );
    });
  }, [canAnalyze, clearTimers]);

  const handleReset = useCallback(() => {
    clearTimers();
    setPhase("idle");
    setVisibleNodes(new Set());
    setVisibleEdges(new Set());
    setLogLines([]);
    setUrl("");
    setFileName("");
    setAmount("");
  }, [clearTimers]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (phase !== "idle") return;
      const file = e.dataTransfer.files[0];
      if (file && file.type === "application/pdf") {
        setFileName(file.name);
        setInputMode("pdf");
      }
    },
    [phase]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        setFileName(file.name);
      }
    },
    []
  );

  useEffect(() => {
    return clearTimers;
  }, [clearTimers]);

  const isProcessing = phase !== "idle" && phase !== "complete";

  return (
    <div className="px-8 py-12">
      {/* Header */}
      <div className="mb-8">
        <p className="text-[11px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-1.5">
          Fund open source
        </p>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tighter text-agentbase-text mb-3">
          Donate
        </h1>
        <p className="text-lg text-agentbase-muted">
          Trace every contribution, then push funding all the way down
        </p>
      </div>

      {/* Source input */}
      <div className="border border-agentbase-border bg-agentbase-card p-6 mb-6">
        <p className="text-[11px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-4">
          Step 1 — Choose a source
        </p>

        {/* Mode toggle */}
        <div className="flex items-center gap-0 border border-agentbase-border w-fit mb-5">
          <button
            onClick={() => phase === "idle" && setInputMode("url")}
            className={`px-4 py-2 text-[11px] font-mono font-bold uppercase tracking-widest transition-colors ${
              inputMode === "url"
                ? "bg-agentbase-invertedBg text-agentbase-invertedText"
                : "bg-agentbase-bg text-agentbase-muted hover:text-agentbase-text"
            }`}
          >
            GitHub URL
          </button>
          <button
            onClick={() => phase === "idle" && setInputMode("pdf")}
            className={`px-4 py-2 text-[11px] font-mono font-bold uppercase tracking-widest transition-colors border-l border-agentbase-border ${
              inputMode === "pdf"
                ? "bg-agentbase-invertedBg text-agentbase-invertedText"
                : "bg-agentbase-bg text-agentbase-muted hover:text-agentbase-text"
            }`}
          >
            Research Paper
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          {inputMode === "url" ? (
            <div className="flex-1 border border-agentbase-border bg-agentbase-card px-4 py-3 flex items-center gap-3">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-agentbase-muted flex-shrink-0">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              <input
                type="text"
                placeholder="https://github.com/org/repo"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={phase !== "idle"}
                className="bg-transparent outline-none text-sm text-agentbase-text placeholder-agentbase-placeholder w-full disabled:opacity-50"
              />
            </div>
          ) : (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="flex-1 border border-dashed border-agentbase-borderStrong px-6 py-5 flex items-center justify-center gap-3 cursor-pointer hover:border-agentbase-text hover:bg-agentbase-surface transition-colors"
              onClick={() => phase === "idle" && document.getElementById("pdf-input")?.click()}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-agentbase-muted">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              {fileName ? (
                <span className="text-sm text-agentbase-text font-medium">{fileName}</span>
              ) : (
                <span className="text-sm text-agentbase-muted">
                  Drop a PDF or click to browse
                </span>
              )}
              <input
                id="pdf-input"
                type="file"
                accept=".pdf"
                onChange={handleFileInput}
                disabled={phase !== "idle"}
                className="hidden"
              />
            </div>
          )}

          {phase === "idle" ? (
            <button
              onClick={handleAnalyze}
              disabled={!canAnalyze}
              className="px-6 py-3 text-[11px] font-mono font-bold uppercase tracking-widest bg-agentbase-invertedBg text-agentbase-invertedText hover:bg-agentbase-invertedHover transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
            >
              Trace Graph
            </button>
          ) : (
            <button
              onClick={handleReset}
              className="px-6 py-3 text-[11px] font-mono font-bold uppercase tracking-widest border border-agentbase-border text-agentbase-muted hover:text-agentbase-text hover:border-agentbase-text transition-colors flex-shrink-0"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Graph + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-0">
        <ContributionGraph visibleNodes={visibleNodes} visibleEdges={visibleEdges} phase={phase} />

        <div className="flex flex-col border border-agentbase-border lg:border-l-0">
          {/* Stats (only when complete) */}
          {phase === "complete" && (
            <div className="p-5 grid grid-cols-2 gap-4 border-b border-agentbase-border">
              <div>
                <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-1">Dependencies</p>
                <p className="text-2xl font-bold tracking-tight text-agentbase-text">5</p>
              </div>
              <div>
                <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-1">Contributors</p>
                <p className="text-2xl font-bold tracking-tight text-agentbase-text">8</p>
              </div>
              <div>
                <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-1">Nodes Mapped</p>
                <p className="text-2xl font-bold tracking-tight text-agentbase-text">14</p>
              </div>
              <div>
                <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-1">Depth</p>
                <p className="text-2xl font-bold tracking-tight text-agentbase-text">2</p>
              </div>
            </div>
          )}

          {/* Donation amount (when graph is complete) */}
          {phase === "complete" && (
            <div className="p-5 border-b border-agentbase-border">
              <p className="text-[11px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-3">
                Step 2 — Set amount
              </p>
              <div className="flex items-center gap-3 border border-agentbase-border px-4 py-3">
                <EthIcon size={14} />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="bg-transparent outline-none text-lg font-bold text-agentbase-text placeholder-agentbase-placeholder w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-agentbase-muted flex-shrink-0">ETH</span>
              </div>
              <button
                disabled={!canDonate}
                className="mt-4 w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-agentbase-invertedBg text-agentbase-invertedText font-mono text-xs tracking-widest uppercase font-bold rounded-full hover:bg-agentbase-invertedHover transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <EthIcon size={12} />
                Donate {amount ? `${amount} ETH` : ""}
              </button>
              {canDonate && (
                <p className="mt-3 text-[11px] text-agentbase-muted text-center">
                  Funds will split across {8} contributors automatically
                </p>
              )}
            </div>
          )}

          {/* Processing log */}
          {logLines.length > 0 && (
            <div className="flex-1">
              <ProcessingLog lines={logLines} />
            </div>
          )}

          {/* Placeholder when idle */}
          {phase === "idle" && (
            <div className="p-5 flex-1 flex items-center justify-center">
              <p className="text-[13px] text-agentbase-muted text-center">
                Trace a source to see the contribution graph and donate
              </p>
            </div>
          )}

          {/* Processing indicator */}
          {isProcessing && logLines.length === 0 && (
            <div className="p-5 flex-1 flex items-center justify-center">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-agentbase-cyan animate-pulse" />
                <p className="text-[13px] text-agentbase-muted">Processing...</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Inline keyframes */}
      <style jsx>{`
        @keyframes fadeInLine {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
