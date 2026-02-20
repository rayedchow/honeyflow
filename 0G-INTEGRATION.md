# 0G Compute Network Integration

HoneyFlow uses the [0G Serving Broker SDK](https://www.npmjs.com/package/@0glabs/0g-serving-broker) (v0.7.1) for decentralized AI inference, replacing the previous Gemini API integration.

## Architecture

```
Python Backend (FastAPI)        Next.js Frontend
┌─────────────────────┐    POST /api/inference     ┌──────────────────────┐
│ services/llm.py     │ ──────────────────────────> │ app/api/inference/   │
│ (sends action+params│                             │ route.ts             │
│  to inference API)  │ <────────────── JSON ────── │                      │
└─────────────────────┘                             └──────────┬───────────┘
                                                               │
                                                    ┌──────────▼───────────┐
                                                    │ lib/0g/              │
                                                    │  broker.ts  (wallet) │
                                                    │  prompts.ts (templ.) │
                                                    │  inference.ts (call) │
                                                    └──────────┬───────────┘
                                                               │
                                                    ┌──────────▼───────────┐
                                                    │ 0G Compute Network   │
                                                    │ (testnet)            │
                                                    │ llama-3.3-70b, etc.  │
                                                    └──────────────────────┘
```

## Setup

1. **Install deps** (already done):
   ```bash
   cd frontend && pnpm add @0glabs/0g-serving-broker ethers openai crypto-js
   ```

2. **Set private key** in `frontend/.env.local`:
   ```
   PRIVATE_KEY=your_64_hex_char_private_key
   ```

3. **Test connectivity**:
   ```bash
   node frontend/scripts/test-0g.mjs
   ```

4. **Run both servers**:
   ```bash
   # Terminal 1: Next.js (serves the inference API at :3000)
   cd frontend && pnpm dev

   # Terminal 2: FastAPI backend (calls inference API)
   cd backend && python run.py
   ```

## How it works

- **`lib/0g/broker.ts`** — Singleton that initializes the 0G wallet, creates a ledger (3 OG min), selects a provider, and caches the connection.
- **`lib/0g/prompts.ts`** — All attribution prompt templates (analyze_repo, split_direct_vs_deps, rank_dependency_importance, analyze_package, rank_citation_influence, analyze_paper).
- **`lib/0g/inference.ts`** — Handles per-request auth headers, calls the OpenAI-compatible endpoint, settles fees, and parses JSON responses.
- **`app/api/inference/route.ts`** — `POST` endpoint accepting `{ action, params }`, returns `{ result }`.
- **`backend/app/services/llm.py`** — Python side sends structured data to the Next.js API instead of calling Gemini directly. All heuristic fallbacks are preserved.

## Supported actions

| Action | Description |
|--------|-------------|
| `analyze_repo` | Classify repo purpose, tech stack, type |
| `split_direct_vs_deps` | Fraction of value from custom code vs dependencies |
| `rank_dependency_importance` | Rate each dependency's criticality (0-1) |
| `analyze_package` | Classify package purpose and type |
| `rank_citation_influence` | Rank paper citations by intellectual influence |
| `analyze_paper` | Classify paper contribution and research area |

## Cost

- Ledger creation: 3 OG (one-time)
- Provider funding: 1 OG per provider (one-time)
- Per-request: token-based pricing from the provider (see `listService()` output)
- Testnet faucet: https://faucet.0g.ai (0.1 OG/day)
