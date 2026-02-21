"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { fetchJuryQuestions, submitJuryAnswers } from "@/lib/api";
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
          className={`block whitespace-nowrap text-sm hover:text-agentbase-accent transition-colors ${
            isSubject
              ? "font-semibold text-agentbase-text"
              : "text-agentbase-muted"
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

      <div className="flex-1 h-4 bg-agentbase-border/30 rounded-sm overflow-hidden">
        <div
          className={`h-full rounded-sm transition-all duration-300 ${
            isSubject ? "bg-agentbase-accent" : "bg-agentbase-muted/40"
          }`}
          style={{ width: `${Math.max(barWidth, 1)}%` }}
        />
      </div>

      <span
        className={`w-14 shrink-0 text-right text-sm tabular-nums ${
          isSubject
            ? "font-semibold text-agentbase-text"
            : "text-agentbase-muted"
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
    <div className="border border-agentbase-border rounded overflow-hidden">
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
              className="shrink-0 text-[10px] text-agentbase-accent hover:underline ml-2"
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
          <p className="text-xs text-agentbase-muted">
            &ldquo;{sample.commit_message}&rdquo;
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dot indicators for question progress                               */
/* ------------------------------------------------------------------ */

function ProgressDots({
  total,
  current,
  onSelect,
}: {
  total: number;
  current: number;
  onSelect: (idx: number) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <button
          key={i}
          onClick={() => onSelect(i)}
          className={`w-2 h-2 rounded-full transition-colors ${
            i === current
              ? "bg-agentbase-accent"
              : i < current
                ? "bg-agentbase-muted"
                : "bg-agentbase-border"
          }`}
          aria-label={`Go to question ${i + 1}`}
        />
      ))}
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
  const [error, setError] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [result, setResult] = useState<SubmitJuryAnswersResponse | null>(null);

  const {
    address: walletAddress,
    isConnecting: walletConnecting,
    connect: connectWallet,
  } = useWallet();

  /* ── Load questions ────────────────────────────── */

  const loadIdRef = useRef(0);

  const loadQuestions = useCallback(async () => {
    const id = ++loadIdRef.current;
    setLoading(true);
    setError(null);
    setSubmitState("idle");
    setResult(null);

    try {
      const next = await fetchJuryQuestions(QUESTION_COUNT);
      if (loadIdRef.current !== id) return;

      setQuestions(next);
      setCurrentIdx(0);

      const initial: Record<string, LocalAnswer> = {};
      for (const q of next) {
        initial[q.question_id] = {
          percentage: roundToTenth(q.edge.ai_percentage),
          confidence: 0.7,
        };
      }
      setAnswers(initial);
    } catch (e: unknown) {
      if (loadIdRef.current !== id) return;
      setError(e instanceof Error ? e.message : "Failed to load questions");
      setQuestions([]);
      setAnswers({});
    } finally {
      if (loadIdRef.current === id) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQuestions();
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
    <div className="max-w-3xl mx-auto px-6 py-10">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-agentbase-text mb-2">
          Be a Human Juror
        </h1>
        <p className="text-agentbase-muted text-sm leading-relaxed">
          Help us make open-source attribution fairer. Answer {QUESTION_COUNT} quick
          questions about who built what — earn ETH for your time.
        </p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="border border-agentbase-border bg-agentbase-card rounded-lg p-10 text-center text-sm text-agentbase-muted">
          Finding questions for you...
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="border border-red-500/40 bg-red-500/10 rounded-lg p-4 text-sm text-red-400 mb-6">
          {error}
        </div>
      )}

      {/* ── Done state ──────────────────────────── */}
      {!loading && submitState === "done" && result && (
        <div className="border border-agentbase-border bg-agentbase-card rounded-lg p-10 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-agentbase-text mb-3">
            Thanks for helping!
          </h2>
          <p className="text-agentbase-muted text-sm mb-1">
            {result.accepted} answer{result.accepted !== 1 ? "s" : ""} accepted
          </p>
          <p className="text-agentbase-muted text-sm mb-6">
            Estimated reward: <span className="text-agentbase-text font-medium">{result.reward_eth} ETH</span>
          </p>

          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={() => void loadQuestions()}
              className="px-6 py-2.5 bg-agentbase-invertedBg text-agentbase-invertedText rounded-full text-sm font-semibold hover:bg-agentbase-invertedHover transition-colors"
            >
              Answer more questions
            </button>
            <Link
              href="/explore"
              className="px-6 py-2.5 border border-agentbase-border text-agentbase-text rounded-full text-sm font-semibold hover:bg-agentbase-cardHover transition-colors"
            >
              Explore projects
            </Link>
          </div>
        </div>
      )}

      {/* ── Question card ───────────────────────── */}
      {!loading && submitState !== "done" && current && (
        <div className="border border-agentbase-border bg-agentbase-card rounded-lg overflow-hidden">

          {/* ·· Progress bar ·· */}
          <div className="px-6 py-4 border-b border-agentbase-border flex items-center justify-between">
            <p className="text-xs text-agentbase-muted font-medium">
              Question {currentIdx + 1} of {questions.length}
            </p>
            <ProgressDots
              total={questions.length}
              current={currentIdx}
              onSelect={setCurrentIdx}
            />
          </div>

          {/* ·· Project overview ·· */}
          <div className="px-6 py-5 border-b border-agentbase-border">
            <div className="flex items-start justify-between gap-4 mb-2">
              <h3 className="text-lg font-bold text-agentbase-text">
                {current.project_name}
              </h3>
              <Link
                href={`/explore/${current.project_slug}`}
                className="shrink-0 text-xs text-agentbase-accent hover:underline"
              >
                View project
              </Link>
            </div>
            <p className="text-sm text-agentbase-muted leading-relaxed">
              {current.project_description}
            </p>
          </div>

          {/* ·· The question ·· */}
          <div className="px-6 py-6 border-b border-agentbase-border">
            <h2 className="text-xl font-bold tracking-tight text-agentbase-text leading-snug">
              {current.prompt}
            </h2>
            {current.subject_summary && (
              <p className="mt-2 text-sm text-agentbase-muted">
                <Link href={`/user/${encodeURIComponent(current.subject_name)}`} className="hover:text-agentbase-accent transition-colors">{current.subject_name}</Link>: <span className="text-agentbase-text">{current.subject_summary}</span>
              </p>
            )}
          </div>

          {/* ·· Code samples ·· */}
          {current.code_samples && current.code_samples.length > 0 && (
            <div className="px-6 py-5 border-b border-agentbase-border">
              <p className="text-xs text-agentbase-muted font-medium mb-3">
                Recent work by <Link href={`/user/${encodeURIComponent(current.subject_name)}`} className="hover:text-agentbase-accent transition-colors">{current.subject_name}</Link>
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
              <p className="text-xs text-agentbase-muted font-medium mb-3">
                {current.edge.question_type === "contributor"
                  ? "All contributors (current AI estimate)"
                  : current.edge.question_type === "citation"
                    ? "All references (current AI estimate)"
                    : "All dependencies (current AI estimate)"}
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
                <p className="text-xs text-agentbase-muted mt-2">
                  + {current.total_peers - current.peers.length} more
                </p>
              )}
            </div>
          )}

          {/* ·· Your answer ·· */}
          <div className="px-6 py-6 border-b border-agentbase-border">
            <p className="text-xs text-agentbase-muted font-medium mb-4">
              Your estimate for <Link href={`/user/${encodeURIComponent(current.subject_name)}`} className="text-agentbase-text font-semibold hover:text-agentbase-accent transition-colors">{current.subject_name}</Link>
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
                className="flex-1 h-2 accent-agentbase-accent cursor-pointer"
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
                  className="w-20 border border-agentbase-border bg-transparent rounded px-2 py-1.5 text-base font-semibold text-agentbase-text text-center tabular-nums"
                />
                <span className="text-sm text-agentbase-muted">%</span>
              </div>
            </div>

            <div className="mt-5">
              <p className="text-xs text-agentbase-muted font-medium mb-2">
                How sure are you?
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
                    className={`px-4 py-2 text-sm rounded-full border transition-colors ${
                      Math.abs(currentAnswer.confidence - option.value) < 0.01
                        ? "border-agentbase-accent text-agentbase-accent bg-agentbase-accent/10 font-medium"
                        : "border-agentbase-border text-agentbase-muted hover:bg-agentbase-cardHover"
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
                    className="text-xs text-agentbase-accent hover:underline"
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
              className="px-4 py-2 border border-agentbase-border text-agentbase-text text-sm rounded-full hover:bg-agentbase-cardHover disabled:opacity-30 transition-colors"
            >
              Back
            </button>

            {isLastQuestion ? (
              <button
                onClick={() => void handleSubmit()}
                disabled={submitState === "submitting" || walletConnecting}
                className="px-6 py-2.5 bg-agentbase-invertedBg text-agentbase-invertedText rounded-full text-sm font-semibold hover:bg-agentbase-invertedHover transition-colors disabled:opacity-40"
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
                className="px-6 py-2.5 bg-agentbase-invertedBg text-agentbase-invertedText rounded-full text-sm font-semibold hover:bg-agentbase-invertedHover transition-colors"
              >
                Next
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Empty state ─────────────────────────── */}
      {!loading && !current && !error && submitState !== "done" && (
        <div className="border border-agentbase-border bg-agentbase-card rounded-lg p-10 text-center">
          <p className="text-sm text-agentbase-muted mb-4">
            No questions available right now. Try again after more projects are traced.
          </p>
          <button
            onClick={() => void loadQuestions()}
            className="px-5 py-2.5 border border-agentbase-border text-agentbase-text rounded-full text-sm font-semibold hover:bg-agentbase-cardHover transition-colors"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
