"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { streamJuryQuestions, submitJuryAnswers } from "@/lib/api";
import { useWallet } from "@/hooks/useWallet";
import type {
  JuryQuestion,
  JuryCodeSample,
  JuryPeer,
  SubmitJuryAnswer,
  SubmitJuryAnswersResponse,
} from "@/lib/types";

type SubmitState = "idle" | "submitting" | "done";

type LocalAnswer = {
  percentage: number;
  confidence: number;
};

const QUESTION_COUNT = 5;

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

/* ------------------------------------------------------------------ */
/* Visual bar for a single peer in the comparison list                */
/* ------------------------------------------------------------------ */

function PeerBar({ peer, maxPct }: { peer: JuryPeer; maxPct: number }) {
  const barWidth = maxPct > 0 ? (peer.ai_pct / maxPct) * 100 : 0;
  const isSubject = peer.is_subject;

  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="shrink-0">
        <Link
          href={`/user/${encodeURIComponent(peer.name)}`}
          className={`block whitespace-nowrap text-sm hover:text-agentbase-yellow transition-colors ${
            isSubject
              ? "font-semibold text-agentbase-text"
              : "text-agentbase-text"
          }`}
        >
          {peer.name}
        </Link>
        {peer.detail && (
          <span className="block whitespace-nowrap text-[11px] text-agentbase-muted/70">
            {peer.detail}
          </span>
        )}
      </div>

      <div className="flex-1 h-1.5 bg-agentbase-border overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${
            isSubject ? "bg-agentbase-yellow" : "bg-agentbase-muted/40"
          }`}
          style={{ width: `${Math.max(barWidth, 1)}%` }}
        />
      </div>

      <span
        className={`w-14 shrink-0 text-right text-sm font-mono tabular-nums ${
          isSubject
            ? "font-semibold text-agentbase-text"
            : "text-agentbase-text"
        }`}
      >
        {peer.ai_pct.toFixed(1)}%
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Code diff block for a single file                                  */
/* ------------------------------------------------------------------ */

function DiffLine({ line }: { line: string }) {
  let cls = "text-agentbase-muted";
  if (line.startsWith("+") && !line.startsWith("+++")) {
    cls = "text-green-400 bg-green-400/10";
  } else if (line.startsWith("-") && !line.startsWith("---")) {
    cls = "text-red-400 bg-red-400/10";
  } else if (line.startsWith("@@")) {
    cls = "text-agentbase-muted/60 italic";
  }
  return <span className={cls}>{line}{"\n"}</span>;
}

function CodeSampleCard({ sample }: { sample: JuryCodeSample }) {
  return (
    <div className="border border-agentbase-border overflow-hidden">
      {sample.filename && (
        <div className="px-3 py-1.5 bg-agentbase-border/20 border-b border-agentbase-border flex items-center justify-between">
          <span className="text-xs font-mono text-agentbase-muted truncate">
            {sample.filename}
          </span>
          {sample.commit_url && (
            <a
              href={sample.commit_url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-[10px] text-agentbase-text hover:underline ml-2"
            >
              View commit
            </a>
          )}
        </div>
      )}
      {sample.patch && (
        <pre className="px-3 py-2 text-xs font-mono leading-relaxed overflow-x-auto max-h-48 overflow-y-auto whitespace-pre">
          {sample.patch.split("\n").map((line, i) => (
            <DiffLine key={i} line={line} />
          ))}
        </pre>
      )}
      {sample.commit_message && (
        <div className="px-3 py-2 border-t border-agentbase-border">
          <p className="text-xs text-agentbase-text">
            &ldquo;{sample.commit_message}&rdquo;
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                     */
/* ------------------------------------------------------------------ */

export default function JuryClient() {
  const [questions, setQuestions] = useState<JuryQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, LocalAnswer>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [progressPct, setProgressPct] = useState(0);
  const [progressMsg, setProgressMsg] = useState("Finding questions for you...");
  const [error, setError] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [result, setResult] = useState<SubmitJuryAnswersResponse | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const {
    address: walletAddress,
    isConnecting: walletConnecting,
    connect: connectWallet,
  } = useWallet();

  /* ── Load questions via SSE stream ──────────────── */

  const initAnswers = useCallback((qs: JuryQuestion[]) => {
    const initial: Record<string, LocalAnswer> = {};
    for (const q of qs) {
      initial[q.question_id] = {
        percentage: roundToTenth(q.edge.ai_percentage),
        confidence: 0.7,
      };
    }
    setAnswers(initial);
  }, []);

  const loadQuestions = useCallback(() => {
    // Abort any in-flight stream
    abortRef.current?.abort();

    setLoading(true);
    setProgressPct(0);
    setProgressMsg("Finding questions for you...");
    setError(null);
    setQuestions([]);
    setAnswers({});
    setCurrentIdx(0);
    setSubmitState("idle");
    setResult(null);

    let initialized = false;

    const controller = streamJuryQuestions(QUESTION_COUNT, {
      onProgress: (data) => {
        if (typeof data === "object" && data !== null) {
          const d = data as { pct?: number; msg?: string };
          if (d.pct !== undefined) setProgressPct(d.pct);
          if (d.msg) setProgressMsg(d.msg);
        } else if (typeof data === "string") {
          setProgressMsg(data);
        }
      },
      onQuestions: (qs) => {
        setQuestions(qs);
        if (!initialized) {
          initialized = true;
          initAnswers(qs);
          setCurrentIdx(0);
          setLoading(false);
        }
      },
      onDone: () => {
        setLoading(false);
      },
      onError: (msg) => {
        setError(msg);
        setLoading(false);
      },
    });

    abortRef.current = controller;
  }, [initAnswers]);

  useEffect(() => {
    loadQuestions();
    return () => abortRef.current?.abort();
  }, [loadQuestions]);

  /* ── Derived state ────────────────────────────── */

  const current = questions[currentIdx];

  const currentAnswer = useMemo(() => {
    if (!current) return { percentage: 50, confidence: 0.7 };
    return answers[current.question_id] ?? { percentage: 50, confidence: 0.7 };
  }, [answers, current]);

  const setCurrentAnswer = useCallback(
    (patch: Partial<LocalAnswer>) => {
      if (!current) return;
      setAnswers((prev) => ({
        ...prev,
        [current.question_id]: {
          ...(prev[current.question_id] ?? { percentage: 50, confidence: 0.7 }),
          ...patch,
        },
      }));
    },
    [current],
  );

  const isLastQuestion = currentIdx >= questions.length - 1;

  const maxPeerPct = useMemo(() => {
    if (!current) return 100;
    return Math.max(...current.peers.map((p) => p.ai_pct), 1);
  }, [current]);

  /* ── Submit ────────────────────────────────────── */

  const handleSubmit = useCallback(async () => {
    if (!questions.length) return;
    setError(null);

    let wallet = walletAddress;
    if (!wallet) {
      wallet = await connectWallet();
      if (!wallet) {
        setError("Connect your wallet first to submit your answers and earn rewards.");
        return;
      }
    }

    const payload: SubmitJuryAnswer[] = questions.map((q) => {
      const answer = answers[q.question_id] ?? {
        percentage: q.edge.ai_percentage,
        confidence: 0.7,
      };
      return {
        question_id: q.question_id,
        project_id: q.project_id,
        edge_source: q.edge.source_id,
        edge_target: q.edge.target_id,
        human_percentage: roundToTenth(answer.percentage),
        confidence: Math.max(0, Math.min(1, answer.confidence)),
      };
    });

    try {
      setSubmitState("submitting");
      const response = await submitJuryAnswers(wallet, payload);
      setResult(response);
      setSubmitState("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to submit answers");
      setSubmitState("idle");
    }
  }, [answers, connectWallet, questions, walletAddress]);

  /* ── Render ────────────────────────────────────── */

  return (
    <div className="max-w-4xl mx-auto px-8 py-8">

      {/* Breadcrumb */}
      <nav className="mb-6">
        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest">
          <Link
            href="/"
            className="text-agentbase-muted hover:text-agentbase-text transition-colors"
          >
            Home
          </Link>
          <span className="text-agentbase-muted">/</span>
          <span className="text-agentbase-text font-bold">Jury</span>
        </div>
      </nav>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tighter text-agentbase-text mb-2">
          Be a Human Juror
        </h1>
        <p className="text-agentbase-text text-sm leading-relaxed">
          Help us make open-source attribution fairer. Answer {QUESTION_COUNT} quick
          questions about who built what — earn ETH for your time.
        </p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="border border-agentbase-border bg-agentbase-card p-10">
          <div className="max-w-sm mx-auto">
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-3">
              Loading questions
            </p>
            <div className="h-1.5 bg-agentbase-border overflow-hidden mb-3">
              <div
                className="h-full bg-agentbase-yellow transition-all duration-500 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-sm text-agentbase-text text-center">{progressMsg}</p>
          </div>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-400 mb-6">
          {error}
        </div>
      )}

      {/* ── Done state ──────────────────────────── */}
      {!loading && submitState === "done" && result && (
        <div className="border border-agentbase-border bg-agentbase-card p-10 text-center">
          <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-agentbase-yellow mb-4">
            Session Complete
          </p>
          <h2 className="text-2xl font-bold tracking-tighter text-agentbase-text mb-3">
            Thanks for helping!
          </h2>
          <p className="text-agentbase-text text-sm mb-1">
            {result.accepted} answer{result.accepted !== 1 ? "s" : ""} accepted
          </p>
          <p className="text-agentbase-text text-sm mb-6">
            Estimated reward: <span className="text-agentbase-yellow font-bold">{result.reward_eth} ETH</span>
          </p>

          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={() => void loadQuestions()}
              className="px-6 py-2.5 bg-agentbase-invertedBg text-agentbase-invertedText rounded-full text-[10px] font-mono font-bold uppercase tracking-widest hover:bg-agentbase-invertedHover transition-colors"
            >
              Answer more questions
            </button>
            <Link
              href="/explore"
              className="px-6 py-2.5 border border-agentbase-border text-agentbase-text rounded-full text-[10px] font-mono font-bold uppercase tracking-widest hover:bg-agentbase-cardHover transition-colors"
            >
              Explore projects
            </Link>
          </div>
        </div>
      )}

      {/* ── Question card ───────────────────────── */}
      {!loading && submitState !== "done" && current && (
        <div className="border border-agentbase-border bg-agentbase-card overflow-hidden">

          {/* ·· Progress header ·· */}
          <div className="px-6 py-4 border-b border-agentbase-border">
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-agentbase-text">
              Question {currentIdx + 1} of {questions.length}
            </p>
          </div>

          {/* ·· Project overview ·· */}
          <div className="px-6 py-5 border-b border-agentbase-border">
            <div className="flex items-start justify-between gap-4 mb-2">
              <h3 className="text-lg font-bold text-agentbase-text">
                {current.project_name}
              </h3>
              <Link
                href={`/explore/${current.project_slug}`}
                className="shrink-0 text-[11px] font-mono text-agentbase-text hover:underline"
              >
                View project &rarr;
              </Link>
            </div>
            <p className="text-sm text-agentbase-text leading-relaxed">
              {current.project_description}
            </p>
          </div>

          {/* ·· The question ·· */}
          <div className="px-6 py-6 border-b border-agentbase-border">
            <h2 className="text-xl font-bold tracking-tight text-agentbase-text leading-snug">
              {current.prompt}
            </h2>
            {current.subject_summary && (
              <p className="mt-2 text-sm text-agentbase-text">
                <Link href={`/user/${encodeURIComponent(current.subject_name)}`} className="font-semibold hover:text-agentbase-yellow transition-colors">{current.subject_name}</Link>: {current.subject_summary}
              </p>
            )}
          </div>

          {/* ·· Code samples ·· */}
          {current.code_samples && current.code_samples.length > 0 && (
            <div className="px-6 py-5 border-b border-agentbase-border">
              <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-3">
                Recent work by <Link href={`/user/${encodeURIComponent(current.subject_name)}`} className="hover:text-agentbase-yellow transition-colors">{current.subject_name}</Link>
              </p>
              <div className="space-y-3">
                {current.code_samples
                  .filter((s) => s.patch || s.commit_message)
                  .map((sample, idx) => (
                    <CodeSampleCard
                      key={`${current.question_id}-code-${idx}`}
                      sample={sample}
                    />
                  ))}
              </div>
            </div>
          )}

          {/* ·· Comparison ·· */}
          {current.peers.length > 0 && (
            <div className="px-6 py-5 border-b border-agentbase-border">
              <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-3">
                {current.edge.question_type === "contributor"
                  ? "All contributors (AI estimate)"
                  : current.edge.question_type === "citation"
                    ? "All references (AI estimate)"
                    : "All dependencies (AI estimate)"}
              </p>
              <div>
                {current.peers.map((peer) => (
                  <PeerBar
                    key={peer.name}
                    peer={peer}
                    maxPct={maxPeerPct}
                  />
                ))}
              </div>
              {current.total_peers > current.peers.length && (
                <p className="text-xs text-agentbase-text mt-2">
                  + {current.total_peers - current.peers.length} more
                </p>
              )}
            </div>
          )}

          {/* ·· Your answer ·· */}
          <div className="px-6 py-6 border-b border-agentbase-border">
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-4">
              Your estimate for <Link href={`/user/${encodeURIComponent(current.subject_name)}`} className="text-agentbase-text hover:text-agentbase-yellow transition-colors">{current.subject_name}</Link>
            </p>

            <div className="flex items-center gap-4">
              <input
                type="range"
                min={0}
                max={100}
                step={0.1}
                value={currentAnswer.percentage}
                onChange={(e) =>
                  setCurrentAnswer({ percentage: Number(e.target.value) })
                }
                className="flex-1 h-2 accent-agentbase-yellow cursor-pointer"
              />
              <div className="flex items-baseline gap-1">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={currentAnswer.percentage}
                  onChange={(e) =>
                    setCurrentAnswer({
                      percentage: Math.max(
                        0,
                        Math.min(100, Number(e.target.value || 0)),
                      ),
                    })
                  }
                  className="w-20 border border-agentbase-border bg-transparent px-2 py-1.5 text-base font-bold text-agentbase-text text-center tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-sm font-mono text-agentbase-text">%</span>
              </div>
            </div>

            <div className="mt-5">
              <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-2">
                Confidence
              </p>
              <div className="flex gap-2">
                {[
                  { label: "Not sure", value: 0.4 },
                  { label: "Somewhat sure", value: 0.7 },
                  { label: "Very sure", value: 1.0 },
                ].map((option) => (
                  <button
                    key={option.label}
                    onClick={() => setCurrentAnswer({ confidence: option.value })}
                    className={`px-4 py-2 text-[11px] font-mono uppercase tracking-wider border transition-colors ${
                      Math.abs(currentAnswer.confidence - option.value) < 0.01
                        ? "border-agentbase-yellow text-agentbase-yellow bg-agentbase-yellow/10 font-bold"
                        : "border-agentbase-border text-agentbase-text hover:bg-agentbase-cardHover"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ·· Links ·· */}
          {current.links.length > 0 && (
            <div className="px-6 py-4 border-b border-agentbase-border">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {current.links.map((link, idx) => (
                  <a
                    key={`${current.question_id}-link-${idx}`}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-mono !text-agentbase-text no-underline hover:underline"
                  >
                    {link.label} &rarr;
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* ·· Navigation ·· */}
          <div className="px-6 py-4 flex items-center justify-between">
            <button
              onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
              disabled={currentIdx === 0}
              className="px-5 py-2.5 border border-agentbase-border text-agentbase-text text-[10px] font-mono font-bold uppercase tracking-widest hover:bg-agentbase-cardHover disabled:opacity-30 transition-colors"
            >
              Back
            </button>

            {isLastQuestion ? (
              <button
                onClick={() => void handleSubmit()}
                disabled={submitState === "submitting" || walletConnecting}
                className="px-6 py-2.5 bg-agentbase-invertedBg text-agentbase-invertedText rounded-full text-[10px] font-mono font-bold uppercase tracking-widest hover:bg-agentbase-invertedHover transition-colors disabled:opacity-40"
              >
                {walletConnecting
                  ? "Connecting..."
                  : submitState === "submitting"
                    ? "Submitting..."
                    : "Submit all answers"}
              </button>
            ) : (
              <button
                onClick={() =>
                  setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))
                }
                className="px-6 py-2.5 bg-agentbase-invertedBg text-agentbase-invertedText rounded-full text-[10px] font-mono font-bold uppercase tracking-widest hover:bg-agentbase-invertedHover transition-colors"
              >
                Next
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Empty state ─────────────────────────── */}
      {!loading && !current && !error && submitState !== "done" && (
        <div className="border border-agentbase-border bg-agentbase-card p-10 text-center">
          <p className="text-sm text-agentbase-text mb-4">
            No questions available right now. Try again after more projects are traced.
          </p>
          <button
            onClick={() => void loadQuestions()}
            className="px-5 py-2.5 border border-agentbase-border text-agentbase-text text-[10px] font-mono font-bold uppercase tracking-widest hover:bg-agentbase-cardHover transition-colors"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
