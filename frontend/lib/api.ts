import type {
  DonationsResponse,
  JuryQuestion,
  Project,
  ProjectListResponse,
  SubmitJuryAnswer,
  SubmitJuryAnswersResponse,
  UserEarnings,
  UserProfile,
  WithdrawResponse,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function fetchProjects(search?: string): Promise<ProjectListResponse> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const url = `${API_BASE}/projects${params.toString() ? `?${params}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch projects: ${res.status}`);
  return res.json();
}

export async function fetchProject(slug: string): Promise<Project> {
  const res = await fetch(`${API_BASE}/projects/${slug}`);
  if (!res.ok) throw new Error(`Failed to fetch project: ${res.status}`);
  return res.json();
}

export interface StreamCallbacks {
  onLog: (message: string) => void;
  onGraph: (data: { nodes: unknown[]; edges: unknown[] }) => void;
  onResult: (project: Project) => void;
  onError: (message: string) => void;
  onDone: () => void;
}

export interface TraceOptions {
  type?: string | null;
  depth?: number;
  maxChildren?: number;
}

export function streamTrace(
  url: string,
  opts: TraceOptions | null,
  callbacks: StreamCallbacks,
): AbortController {
  const controller = new AbortController();
  const params = new URLSearchParams({ url });
  if (opts?.type) params.set("type", opts.type);
  if (opts?.depth) params.set("depth", String(opts.depth));
  if (opts?.maxChildren) params.set("max_children", String(opts.maxChildren));

  const endpoint = `${API_BASE}/stream/trace?${params}`;

  fetch(endpoint, { signal: controller.signal })
    .then(async (res) => {
      if (!res.ok) {
        callbacks.onError(`Server returned ${res.status}`);
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) {
        callbacks.onError("No response body");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";
      let currentData = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            currentData = line.slice(6);
          } else if (line === "" && currentEvent) {
            // Empty line = end of event
            try {
              switch (currentEvent) {
                case "log":
                  callbacks.onLog(JSON.parse(currentData));
                  break;
                case "graph":
                  callbacks.onGraph(JSON.parse(currentData));
                  break;
                case "result":
                  callbacks.onResult(JSON.parse(currentData));
                  break;
                case "error":
                  callbacks.onError(JSON.parse(currentData));
                  break;
                case "done":
                  callbacks.onDone();
                  break;
              }
            } catch {
              // If JSON parse fails for log, treat as raw string
              if (currentEvent === "log") {
                callbacks.onLog(currentData);
              }
            }
            currentEvent = "";
            currentData = "";
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        callbacks.onError(err.message);
      }
    });

  return controller;
}

/* ── Users ────────────────────────────────────────────── */

export async function fetchUserProfile(username: string): Promise<UserProfile> {
  const res = await fetch(`${API_BASE}/users/${encodeURIComponent(username)}`);
  if (!res.ok) throw new Error(`Failed to fetch user profile: ${res.status}`);
  return res.json();
}

export async function fetchUserEarnings(
  username: string,
  wallet?: string | null,
): Promise<UserEarnings> {
  const params = new URLSearchParams();
  if (wallet) params.set("wallet", wallet);
  const qs = params.toString() ? `?${params}` : "";
  const res = await fetch(
    `${API_BASE}/users/${encodeURIComponent(username)}/earnings${qs}`,
  );
  if (!res.ok) throw new Error(`Failed to fetch earnings: ${res.status}`);
  return res.json();
}

export async function withdrawEarnings(
  username: string,
  toAddress: string,
): Promise<WithdrawResponse> {
  const res = await fetch(
    `${API_BASE}/users/${encodeURIComponent(username)}/withdraw`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_address: toAddress }),
    },
  );
  if (!res.ok) throw new Error(`Withdrawal failed: ${res.status}`);
  return res.json();
}

/* ── Donations ─────────────────────────────────────────── */

export async function fetchDonations(projectId: string): Promise<DonationsResponse> {
  const res = await fetch(`${API_BASE}/donations/${projectId}`);
  if (!res.ok) throw new Error(`Failed to fetch donations: ${res.status}`);
  return res.json();
}

/* ── Vault / Donate ─────────────────────────────────────── */

export async function getVault(
  projectId: string,
): Promise<{ wallet_address: string }> {
  const res = await fetch(`${API_BASE}/get_vault`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: projectId }),
  });
  if (!res.ok) throw new Error(`Failed to get vault: ${res.status}`);
  return res.json();
}

export async function confirmDonate(
  projectId: string,
  donatorWallet: string,
  amountEth: number,
  txHash?: string,
): Promise<{ confirmed: boolean; transaction_hash: string | null }> {
  const res = await fetch(`${API_BASE}/confirm_donate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_id: projectId,
      donator_wallet: donatorWallet,
      amount_eth: amountEth,
      tx_hash: txHash,
    }),
  });
  if (!res.ok) throw new Error(`Failed to confirm donation: ${res.status}`);
  return res.json();
}

/* ── Jury ─────────────────────────────────────────────────────── */

export async function fetchJuryQuestions(count = 5): Promise<JuryQuestion[]> {
  const params = new URLSearchParams({ count: String(count) });
  const res = await fetch(`${API_BASE}/jury/questions?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to fetch jury questions: ${res.status}`);
  const data = await res.json();
  return data.questions ?? [];
}

export interface JuryStreamCallbacks {
  onProgress: (data: unknown) => void;
  onQuestions: (questions: JuryQuestion[]) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

export function streamJuryQuestions(
  count: number,
  callbacks: JuryStreamCallbacks,
): AbortController {
  const controller = new AbortController();
  const params = new URLSearchParams({ count: String(count) });

  fetch(`${API_BASE}/jury/questions/stream?${params}`, {
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        callbacks.onError(`Server returned ${res.status}`);
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) {
        callbacks.onError("No response body");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";
      let currentData = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            currentData = line.slice(6);
          } else if (line === "" && currentEvent) {
            try {
              switch (currentEvent) {
                case "progress":
                  callbacks.onProgress(JSON.parse(currentData));
                  break;
                case "questions":
                  callbacks.onQuestions(
                    JSON.parse(currentData).questions ?? [],
                  );
                  break;
                case "done":
                  callbacks.onDone();
                  break;
                case "error":
                  callbacks.onError(JSON.parse(currentData));
                  break;
              }
            } catch {
              if (currentEvent === "progress") {
                callbacks.onProgress(currentData);
              }
            }
            currentEvent = "";
            currentData = "";
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        callbacks.onError(err.message);
      }
    });

  return controller;
}

export async function submitJuryAnswers(
  walletAddress: string,
  answers: SubmitJuryAnswer[],
): Promise<SubmitJuryAnswersResponse> {
  const res = await fetch(`${API_BASE}/jury/answers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet_address: walletAddress,
      answers,
    }),
  });
  if (!res.ok) throw new Error(`Failed to submit jury answers: ${res.status}`);
  return res.json();
}
