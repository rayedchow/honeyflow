"use client";

import { useState } from "react";

/* ── Hardcoded cycle start dates (a few days in the past) ────────────── */
const CYCLE_STARTS: Record<string, string> = {
  "zero-knowledge-ml":        "2026-02-17",
  "depin-mesh-network":       "2026-02-18",
  "agent-framework":          "2026-02-16",
  "recursive-stark-verifier": "2026-02-19",
  "solidity-fuzzer":          "2026-02-17",
  "opengraph-protocol":       "2026-02-18",
  "cross-chain-indexer":      "2026-02-16",
  "dao-governance-kit":       "2026-02-19",
  "fhe-analytics":            "2026-02-17",
  "mev-shield":               "2026-02-18",
  "self-sovereign-id":        "2026-02-16",
  "audit-ai":                 "2026-02-19",
};

/* ── Hardcoded initial sentiment counts ──────────────────────────────── */
const INITIAL_SENTIMENT: Record<string, { up: number; down: number }> = {
  "zero-knowledge-ml":        { up: 18, down: 7 },
  "depin-mesh-network":       { up: 24, down: 3 },
  "agent-framework":          { up: 12, down: 9 },
  "recursive-stark-verifier": { up: 31, down: 5 },
  "solidity-fuzzer":          { up: 15, down: 11 },
  "opengraph-protocol":       { up: 22, down: 4 },
  "cross-chain-indexer":      { up: 19, down: 6 },
  "dao-governance-kit":       { up: 27, down: 8 },
  "fhe-analytics":            { up: 14, down: 10 },
  "mev-shield":               { up: 20, down: 3 },
  "self-sovereign-id":        { up: 16, down: 7 },
  "audit-ai":                 { up: 25, down: 6 },
};

const DEFAULT_START = "2026-02-18";
const DEFAULT_SENTIMENT = { up: 15, down: 5 };

export default function FundingCycle({
  projectSlug,
}: {
  projectSlug: string;
  showUsd: boolean;
}) {
  /* ── Cycle progress ─────────────────────────────────────────────────── */
  const startStr = CYCLE_STARTS[projectSlug] || DEFAULT_START;
  const startDate = new Date(startStr + "T00:00:00");
  const now = new Date();
  const daysPassed = Math.min(
    7,
    Math.max(0, Math.floor((now.getTime() - startDate.getTime()) / 86_400_000))
  );
  const cycleComplete = daysPassed >= 7;
  const progressPct = (daysPassed / 7) * 100;
  const daysRemaining = 7 - daysPassed;

  /* ── Community sentiment (local state) ──────────────────────────────── */
  const base = INITIAL_SENTIMENT[projectSlug] || DEFAULT_SENTIMENT;
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const [counts, setCounts] = useState(base);

  function handleVote(next: "up" | "down") {
    setCounts((prev) => {
      const c = { ...prev };
      // Remove previous vote
      if (vote === "up") c.up--;
      if (vote === "down") c.down--;
      // Toggle off if same vote
      if (vote === next) {
        setVote(null);
        return c;
      }
      // Apply new vote
      c[next]++;
      setVote(next);
      return c;
    });
  }

  const totalVotes = counts.up + counts.down;
  const approvePct = totalVotes > 0 ? Math.round((counts.up / totalVotes) * 100) : 50;

  return (
    <div className="border border-agentbase-yellow/30 bg-agentbase-yellow/10 p-5 mb-4">
      {/* ── Funding Cycle Progress ─────────────────────────────────────── */}
      <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-1">
        Funding Cycle
      </p>

      {cycleComplete ? (
        <p className="text-sm font-bold font-mono text-agentbase-yellow mb-4">
          Cycle complete
        </p>
      ) : (
        <>
          <p className="text-sm font-bold font-mono text-agentbase-text mb-2">
            Day {daysPassed} of 7
          </p>
          {/* Progress bar */}
          <div className="w-full h-2 bg-agentbase-border rounded-full overflow-hidden mb-1">
            <div
              className="h-full bg-agentbase-yellow rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-[10px] font-mono text-agentbase-muted mb-4">
            {daysRemaining} day{daysRemaining !== 1 ? "s" : ""} remaining
          </p>
        </>
      )}

      {/* ── Community Sentiment ────────────────────────────────────────── */}
      <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-2">
        Do you approve the AI&apos;s funding decision?
      </p>

      <div className="flex items-center gap-2 mb-2">
        {/* Thumbs up */}
        <button
          onClick={() => handleVote("up")}
          className={`p-1.5 rounded transition-colors ${
            vote === "up"
              ? "bg-green-500/20 text-green-400"
              : "text-agentbase-muted hover:text-green-400"
          }`}
          aria-label="Approve"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 10v12" />
            <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
          </svg>
        </button>

        {/* Ratio bar */}
        <div className="flex-1 h-3 rounded-full overflow-hidden flex">
          <div
            className="h-full bg-green-500 transition-all"
            style={{ width: `${approvePct}%` }}
          />
          <div
            className="h-full bg-red-500/40 transition-all"
            style={{ width: `${100 - approvePct}%` }}
          />
        </div>

        {/* Thumbs down */}
        <button
          onClick={() => handleVote("down")}
          className={`p-1.5 rounded transition-colors ${
            vote === "down"
              ? "bg-red-500/20 text-red-400"
              : "text-agentbase-muted hover:text-red-400"
          }`}
          aria-label="Disapprove"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 14V2" />
            <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
          </svg>
        </button>
      </div>

      <p className="text-[10px] font-mono text-agentbase-muted text-center">
        {approvePct}% approve &middot; {totalVotes} votes
      </p>
    </div>
  );
}
