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

// ── Demo data ────────────────────────────────────────────────────────────────

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
    <div className="relative w-full h-full bg-agentbase-canvasBg overflow-hidden">
      {isEmpty && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="w-14 h-14 border border-agentbase-border flex items-center justify-center mx-auto mb-4">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-agentbase-muted">
                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            </div>
            <p className="text-agentbase-muted text-[13px]">Contribution graph</p>
            <p className="text-agentbase-placeholder text-[11px] mt-1">Submit a source to begin</p>
          </div>
        </div>
      )}

      {!isEmpty && (
        <div ref={containerRef} className="absolute inset-6">
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

      {phase !== "idle" && phase !== "complete" && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-agentbase-canvasBg border border-agentbase-border">
          <span className="w-1.5 h-1.5 rounded-full bg-agentbase-cyan animate-pulse" />
          <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-agentbase-muted">{PHASE_LABELS[phase]}</span>
        </div>
      )}

      {phase === "complete" && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-agentbase-badgeBg border border-agentbase-border">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-agentbase-badgeText">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-agentbase-badgeText">Analysis complete</span>
        </div>
      )}
    </div>
  );
}

// ── Streaming Log ────────────────────────────────────────────────────────────

function StreamingLog({ lines, phase }: { lines: LogLine[]; phase: Phase }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines.length]);

  const isActive = phase !== "idle" && phase !== "complete";

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide p-4 font-mono text-[11px]">
      {lines.length === 0 && phase === "idle" ? (
        <div className="h-full flex items-center justify-center">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-agentbase-muted mb-1">
              <span className="text-agentbase-tertiary">$</span>
              <span>Waiting for source...</span>
              <span className="w-1.5 h-3.5 bg-agentbase-muted/30 animate-pulse" />
            </div>
            <p className="text-[10px] text-agentbase-placeholder">Submit a source to begin tracing</p>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          {lines.map((l, i) => (
            <div
              key={i}
              className="flex gap-2 leading-relaxed animate-[fadeInLine_0.3s_ease-out]"
            >
              <span className="text-agentbase-muted flex-shrink-0 w-10 text-right tabular-nums">[{l.time}]</span>
              <span className="text-agentbase-text">{l.text}</span>
            </div>
          ))}
          {isActive && (
            <div className="flex items-center gap-2 mt-1">
              <span className="w-10" />
              <span className="w-1.5 h-3.5 bg-agentbase-cyan/60 animate-pulse" />
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function DonateClient() {
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

  return (
    <section className="relative w-full flex items-stretch flex-1">
      <div className="z-10 w-full grid grid-cols-1 lg:grid-cols-[3fr_1fr] items-stretch">

        {/* ── Left: Canvas (3/4) ──────────────────────────────────────── */}
        <div className="relative flex items-center justify-center bg-agentbase-canvasBg">
          <ContributionGraph visibleNodes={visibleNodes} visibleEdges={visibleEdges} phase={phase} />
        </div>

        {/* ── Right: Input + Trace (1/4) ──────────────────────────────── */}
        <div className="flex flex-col lg:border-l border-agentbase-border">

          {/* Source input */}
          <div className="p-5 border-b border-agentbase-border">
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-3">
              Source
            </p>

            {/* Mode toggle */}
            <div className="flex items-center gap-0 mb-3">
              <button
                onClick={() => phase === "idle" && setInputMode("url")}
                className={`flex-1 px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-widest border transition-colors ${
                  inputMode === "url"
                    ? "bg-agentbase-invertedBg text-agentbase-invertedText border-agentbase-invertedBg"
                    : "bg-agentbase-card text-agentbase-muted border-agentbase-border hover:text-agentbase-text"
                }`}
              >
                GitHub URL
              </button>
              <button
                onClick={() => phase === "idle" && setInputMode("pdf")}
                className={`flex-1 px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-widest border border-l-0 transition-colors ${
                  inputMode === "pdf"
                    ? "bg-agentbase-invertedBg text-agentbase-invertedText border-agentbase-invertedBg"
                    : "bg-agentbase-card text-agentbase-muted border-agentbase-border hover:text-agentbase-text"
                }`}
              >
                Paper
              </button>
            </div>

            {inputMode === "url" ? (
              <div className="border border-agentbase-border bg-agentbase-card px-3 py-2.5 flex items-center gap-2 mb-3">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-agentbase-muted flex-shrink-0">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                <input
                  type="text"
                  placeholder="https://github.com/org/repo"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={phase !== "idle"}
                  className="bg-transparent outline-none text-[13px] text-agentbase-text placeholder-agentbase-placeholder w-full disabled:opacity-50"
                />
              </div>
            ) : (
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                className="border border-dashed border-agentbase-borderStrong px-4 py-4 flex items-center justify-center gap-2 cursor-pointer hover:border-agentbase-text hover:bg-agentbase-surface transition-colors mb-3"
                onClick={() => phase === "idle" && document.getElementById("pdf-input")?.click()}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-agentbase-muted">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                {fileName ? (
                  <span className="text-[12px] text-agentbase-text font-medium">{fileName}</span>
                ) : (
                  <span className="text-[12px] text-agentbase-muted">Drop PDF or browse</span>
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
                className="w-full px-4 py-2.5 text-[10px] font-mono font-bold uppercase tracking-widest bg-agentbase-invertedBg text-agentbase-invertedText hover:bg-agentbase-invertedHover transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Trace Graph
              </button>
            ) : (
              <button
                onClick={handleReset}
                className="w-full px-4 py-2.5 text-[10px] font-mono font-bold uppercase tracking-widest border border-agentbase-border text-agentbase-muted hover:text-agentbase-text hover:border-agentbase-text transition-colors"
              >
                Reset
              </button>
            )}
          </div>

          {/* Trace output */}
          <div className="flex flex-col flex-1 min-h-0">
            <StreamingLog lines={logLines} phase={phase} />
          </div>

          {/* Stats + Donate CTA (appears on complete) */}
          <div
            className="overflow-hidden shrink-0"
            style={{
              maxHeight: phase === "complete" ? 400 : 0,
              opacity: phase === "complete" ? 1 : 0,
              transition: "max-height 0.5s ease-out, opacity 0.4s ease-out 0.1s",
            }}
          >
            {/* Stats */}
            <div className="grid grid-cols-2 border-t border-agentbase-border">
              {[
                { label: "Deps", value: "5" },
                { label: "Contributors", value: "8" },
                { label: "Nodes", value: "14" },
                { label: "Depth", value: "2" },
              ].map((stat, i) => (
                <div key={stat.label} className={`p-3 ${i % 2 !== 0 ? "border-l border-agentbase-border" : ""} ${i < 2 ? "border-b border-agentbase-border" : ""}`}>
                  <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-0.5">{stat.label}</p>
                  <p className="text-lg font-bold tracking-tight text-agentbase-text">{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Donate */}
            <div className="p-5 border-t border-agentbase-border">
              <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-2">
                Set amount
              </p>
              <div className="flex items-center gap-2 border border-agentbase-border bg-agentbase-card px-3 py-2.5">
                <EthIcon size={12} />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="bg-transparent outline-none text-base font-bold text-agentbase-text placeholder-agentbase-placeholder w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-agentbase-muted flex-shrink-0">ETH</span>
              </div>
              <button
                disabled={!canDonate}
                className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-agentbase-invertedBg text-agentbase-invertedText font-mono text-[10px] tracking-widest uppercase font-bold rounded-full hover:bg-agentbase-invertedHover transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <EthIcon size={10} />
                Donate {amount ? `${amount} ETH` : ""}
              </button>
              {canDonate && (
                <p className="mt-2 text-[10px] text-agentbase-muted text-center">
                  Splits across 8 contributors
                </p>
              )}
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
