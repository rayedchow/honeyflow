"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BrowserProvider, parseEther } from "ethers";

import EthIcon from "@/components/ui/EthIcon";
import ForceGraph from "@/components/viz/ForceGraph";
import { streamTrace, getVault, confirmDonate } from "@/lib/api";
import { useTraceStore } from "@/lib/trace-store";
import { useWallet } from "@/hooks/useWallet";
import type { GraphData } from "@/lib/types";

type TxStatus = "idle" | "connecting" | "sending" | "confirming" | "done" | "error";

function StreamingLog() {
  const lines = useTraceStore((state) => state.logLines);
  const phase = useTraceStore((state) => state.phase);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines.length]);

  const isActive = phase === "tracing";

  return (
    <div className="h-full scrollbar-hide p-4 pb-8 font-mono text-[11px]">
      {lines.length === 0 && phase === "idle" ? (
        <div className="h-full flex items-center justify-center">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-agentbase-muted mb-1">
              <span className="text-agentbase-tertiary">$</span>
              <span>Waiting for source...</span>
              <span className="w-1.5 h-3.5 bg-agentbase-muted/30 animate-pulse" />
            </div>
            <p className="text-[10px] text-agentbase-placeholder">
              Submit a URL to begin tracing
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          {lines.map((line, i) => (
            <div
              key={`${line.time}-${i}`}
              className="flex gap-2 leading-relaxed animate-[fadeInLine_0.3s_ease-out]"
            >
              <span className="text-agentbase-muted flex-shrink-0 w-10 text-right tabular-nums">
                [{line.time}]
              </span>
              <span className="text-agentbase-text break-all min-w-0">{line.text}</span>
            </div>
          ))}
          {isActive && (
            <div className="flex items-center gap-2 mt-1">
              <span className="w-10" />
              <span className="w-1.5 h-3.5 bg-agentbase-cyan/60 animate-pulse" />
            </div>
          )}
          {phase === "complete" && <div className="h-2" />}
          <div ref={endRef} />
        </div>
      )}
    </div>
  );
}

function GraphEmptyState() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="text-center">
        <div className="w-14 h-14 border border-agentbase-border flex items-center justify-center mx-auto mb-4">
          <svg
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-agentbase-muted"
          >
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
        </div>
        <p className="text-agentbase-muted text-[13px]">Contribution graph</p>
        <p className="text-agentbase-placeholder text-[11px] mt-1">Submit a source to begin</p>
      </div>
    </div>
  );
}

function GraphCanvas() {
  const phase = useTraceStore((state) => state.phase);
  const graphData = useTraceStore((state) => state.graphData);
  const error = useTraceStore((state) => state.error);

  return (
    <div className="relative flex items-center justify-center bg-agentbase-canvasBg h-[calc(100vh-94px)]">
      {phase === "idle" && graphData.nodes.length === 0 ? (
        <GraphEmptyState />
      ) : (
        <ForceGraph graphData={graphData} />
      )}

      {phase === "tracing" && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-agentbase-canvasBg border border-agentbase-border">
          <span className="w-1.5 h-1.5 rounded-full bg-agentbase-cyan animate-pulse" />
          <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-agentbase-muted">
            Tracing dependencies...
          </span>
        </div>
      )}

      {phase === "complete" && !error && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-agentbase-badgeBg border border-agentbase-border">
          <svg
            viewBox="0 0 24 24"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-agentbase-badgeText"
          >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-agentbase-badgeText">
            Analysis complete
          </span>
        </div>
      )}

      {error && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/30">
          <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-red-400">
            Error
          </span>
        </div>
      )}
    </div>
  );
}

export default function DonateClient() {
  const [url, setUrl] = useState("");
  const [depth, setDepth] = useState(3);
  const [maxChildren, setMaxChildren] = useState(10);
  const abortRef = useRef<AbortController | null>(null);

  const [amount, setAmount] = useState("");
  const { address: walletAddress, isConnecting: walletConnecting, connect: connectWallet } = useWallet();
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const phase = useTraceStore((state) => state.phase);
  const graphData = useTraceStore((state) => state.graphData);
  const result = useTraceStore((state) => state.result);
  const error = useTraceStore((state) => state.error);

  const begin = useTraceStore((state) => state.begin);
  const addLog = useTraceStore((state) => state.addLog);
  const setGraphData = useTraceStore((state) => state.setGraphData);
  const setResult = useTraceStore((state) => state.setResult);
  const setError = useTraceStore((state) => state.setError);
  const setPhase = useTraceStore((state) => state.setPhase);
  const reset = useTraceStore((state) => state.reset);

  const hasSource = url.trim().length > 0;
  const canAnalyze = phase === "idle" && hasSource && depth >= 1 && maxChildren >= 1;
  const canDonate = phase === "complete" && amount.trim().length > 0 && parseFloat(amount) > 0;

  const handleAnalyze = useCallback(() => {
    if (!canAnalyze) return;

    begin();

    const controller = streamTrace(url, { depth, maxChildren }, {
      onLog: (message) => addLog(message),
      onGraph: (data) => {
        const graph = data as GraphData;
        setGraphData(graph);
        addLog(`Graph received: ${graph.nodes.length} nodes, ${graph.edges.length} edges`);
      },
      onResult: (project) => {
        setResult(project);
        addLog("Trace complete - saved to explore");
      },
      onError: (message) => {
        setError(message);
        addLog(`Error: ${message}`);
      },
      onDone: () => {
        if (useTraceStore.getState().phase !== "complete") {
          setPhase("complete");
        }
      },
    });

    abortRef.current = controller;
  }, [addLog, begin, canAnalyze, setError, setGraphData, setPhase, setResult, url]);

  const handleReset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    reset();
    setUrl("");
    setAmount("");
    setTxStatus("idle");
    setTxHash(null);
    setTxError(null);
  }, [reset]);

  const handleDonate = useCallback(async () => {
    if (!result || !canDonate) return;

    setTxError(null);
    setTxHash(null);

    try {
      let addr = walletAddress;
      if (!addr) {
        setTxStatus("connecting");
        addr = await connectWallet();
        if (!addr) {
          setTxStatus("error");
          setTxError("Wallet connection rejected");
          return;
        }
      }

      setTxStatus("sending");
      const { wallet_address: vaultAddress } = await getVault(result.slug);

      const provider = new BrowserProvider(window.ethereum!);
      const signer = await provider.getSigner();
      const tx = await signer.sendTransaction({
        to: vaultAddress,
        value: parseEther(amount),
      });

      setTxHash(tx.hash);
      setTxStatus("confirming");

      const confirmation = await confirmDonate(result.slug, addr, parseFloat(amount));
      if (confirmation.confirmed) {
        setTxStatus("done");
      } else {
        setTxStatus("done");
      }
    } catch (err: unknown) {
      setTxStatus("error");
      setTxError(err instanceof Error ? err.message : "Transaction failed");
    }
  }, [result, canDonate, walletAddress, connectWallet, amount]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const stats = result
    ? [
        { label: "Deps", value: String(result.dependencies.length) },
        { label: "Contributors", value: String(result.contributors) },
        { label: "Nodes", value: String(result.graph_data.nodes.length) },
        { label: "Depth", value: String(result.depth) },
      ]
    : [
        { label: "Deps", value: "N/A" },
        { label: "Contributors", value: "N/A" },
        { label: "Nodes", value: String(graphData.nodes.length || "N/A") },
        { label: "Depth", value: "N/A" },
      ];

  return (
    <section className="relative w-full flex items-stretch flex-1">
      <div className="z-10 w-full grid grid-cols-1 lg:grid-cols-[3fr_1fr] items-stretch">
        <GraphCanvas />

        <div className="flex flex-col border-agentbase-border sticky top-[94px] h-[calc(100vh-94px)]">
          <div className="p-5 border-b border-agentbase-border">
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-3">
              Source
            </p>

            <div className="border border-agentbase-border bg-agentbase-card px-3 py-2.5 flex items-center gap-2 mb-3">
              <svg
                viewBox="0 0 24 24"
                width="13"
                height="13"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-agentbase-muted flex-shrink-0"
              >
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

            <p className="text-[9px] text-agentbase-placeholder mb-3">
              GitHub, npm, PyPI, or arXiv URLs supported
            </p>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="text-[9px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-1 block">
                  Depth
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={depth || ""}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, "");
                    if (raw === "") { setDepth(0); return; }
                    setDepth(Math.min(parseInt(raw, 10), 10));
                  }}
                  onBlur={() => { if (depth < 1) setDepth(1); }}
                  placeholder="1"
                  disabled={phase !== "idle"}
                  className="w-full border border-agentbase-border bg-agentbase-card px-2 py-1.5 text-[12px] font-mono text-agentbase-text outline-none disabled:opacity-50 placeholder-agentbase-placeholder"
                />
              </div>
              <div>
                <label className="text-[9px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-1 block">
                  Max Children
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={maxChildren || ""}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, "");
                    if (raw === "") { setMaxChildren(0); return; }
                    setMaxChildren(Math.min(parseInt(raw, 10), 50));
                  }}
                  onBlur={() => { if (maxChildren < 1) setMaxChildren(1); }}
                  placeholder="1"
                  disabled={phase !== "idle"}
                  className="w-full border border-agentbase-border bg-agentbase-card px-2 py-1.5 text-[12px] font-mono text-agentbase-text outline-none disabled:opacity-50 placeholder-agentbase-placeholder"
                />
              </div>
            </div>

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

          <div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-y-auto">
            <StreamingLog />
          </div>

          <div
            className="overflow-hidden shrink-0"
            style={{
              maxHeight: phase === "complete" ? 500 : 0,
              opacity: phase === "complete" ? 1 : 0,
              transition: "max-height 0.5s ease-out, opacity 0.4s ease-out 0.1s",
            }}
          >
            <div className="grid grid-cols-2 border-t border-agentbase-border">
              {stats.map((stat, i) => (
                <div
                  key={stat.label}
                  className={`p-3 ${i % 2 !== 0 ? "border-l border-agentbase-border" : ""} ${i < 2 ? "border-b border-agentbase-border" : ""}`}
                >
                  <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-0.5">
                    {stat.label}
                  </p>
                  <p className="text-lg font-bold tracking-tight text-agentbase-text">{stat.value}</p>
                </div>
              ))}
            </div>

            {result && (
              <div className="px-5 py-5 border-t border-agentbase-border">
                <Link
                  href={`/explore/${result.slug}`}
                  className="block w-full text-center px-4 py-2.5 text-[10px] font-mono font-bold uppercase tracking-widest border border-agentbase-border text-agentbase-muted hover:text-agentbase-text hover:border-agentbase-text transition-colors"
                >
                  View on Explore
                </Link>
              </div>
            )}

          </div>
        </div>
      </div>
    </section>
  );
}
