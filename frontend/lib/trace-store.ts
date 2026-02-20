import { create } from "zustand";

import type { GraphData, Project } from "@/lib/types";

export type TracePhase = "idle" | "tracing" | "complete";

export interface LogLine {
  time: string;
  text: string;
}

const EMPTY_GRAPH: GraphData = { nodes: [], edges: [] };

interface TraceState {
  phase: TracePhase;
  logLines: LogLine[];
  graphData: GraphData;
  result: Project | null;
  error: string | null;
  startedAtMs: number;
  begin: () => void;
  addLog: (text: string) => void;
  setGraphData: (graph: GraphData) => void;
  setResult: (project: Project) => void;
  setError: (message: string) => void;
  setPhase: (phase: TracePhase) => void;
  reset: () => void;
}

export const useTraceStore = create<TraceState>((set, get) => ({
  phase: "idle",
  logLines: [],
  graphData: EMPTY_GRAPH,
  result: null,
  error: null,
  startedAtMs: 0,

  begin: () =>
    set({
      phase: "tracing",
      logLines: [],
      graphData: EMPTY_GRAPH,
      result: null,
      error: null,
      startedAtMs: Date.now(),
    }),

  addLog: (text: string) => {
    const startedAtMs = get().startedAtMs || Date.now();
    const elapsed = ((Date.now() - startedAtMs) / 1000).toFixed(1);
    set((state) => ({
      logLines: [...state.logLines, { time: `${elapsed}s`, text }],
    }));
  },

  setGraphData: (graph: GraphData) =>
    set({
      graphData: graph,
    }),

  setResult: (project: Project) =>
    set({
      result: project,
      phase: "complete",
    }),

  setError: (message: string) =>
    set({
      error: message,
      phase: "complete",
    }),

  setPhase: (phase: TracePhase) => set({ phase }),

  reset: () =>
    set({
      phase: "idle",
      logLines: [],
      graphData: EMPTY_GRAPH,
      result: null,
      error: null,
      startedAtMs: 0,
    }),
}));
