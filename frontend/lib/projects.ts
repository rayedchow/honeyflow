// ── Types ────────────────────────────────────────────────────────────────────

export type ProjectType = "paper" | "repo" | "package";

export interface Contributor {
  name: string;
  percentage: string;
}

export interface Project {
  name: string;
  slug: string;
  category: string;
  type: ProjectType;
  summary: string;
  raised: string;
  raisedNumeric: number;
  contributors: number;
  description: string;
  dependencies: string[];
  topContributors: Contributor[];
  depth: number;
}

// ── Slug utility ─────────────────────────────────────────────────────────────

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// ── Data ─────────────────────────────────────────────────────────────────────

export const trendingProjects: Project[] = [
  {
    name: "Zero-Knowledge ML",
    slug: "zero-knowledge-ml",
    category: "Research",
    type: "paper",
    summary:
      "ZK proofs for machine learning model inference verification on Ethereum. Enables trustless AI predictions.",
    raised: "$45,200",
    raisedNumeric: 45200,
    contributors: 38,
    description:
      "A research paper exploring the intersection of zero-knowledge proofs and machine learning. This work enables ML model inference to be verified on Ethereum without revealing model weights or input data. The approach uses recursive SNARKs to compress verification costs, making it practical for on-chain deployment. Contributors have built reference implementations in both Circom and Halo2.",
    dependencies: ["LibSnark", "Halo2", "PyTorch", "EZKL", "Circom"],
    topContributors: [
      { name: "alice.eth", percentage: "15%" },
      { name: "bob.eth", percentage: "13%" },
      { name: "sean.eth", percentage: "12%" },
      { name: "vitalik.eth", percentage: "10%" },
    ],
    depth: 3,
  },
  {
    name: "DePIN Mesh Network",
    slug: "depin-mesh-network",
    category: "Infrastructure",
    type: "repo",
    summary:
      "Decentralized physical infrastructure for wireless mesh connectivity. Community-owned internet access.",
    raised: "$67,100",
    raisedNumeric: 67100,
    contributors: 124,
    description:
      "An open-source repository building the physical layer for decentralized internet. Each node runs a lightweight mesh protocol that routes traffic through community-owned hardware. The project includes firmware for LoRa and WiFi radios, a token-incentive layer for node operators, and a coverage mapping dashboard. Over 200 nodes are live across 12 cities.",
    dependencies: ["libp2p", "Protocol Buffers", "FlatBuffers", "OpenWRT", "Rust Embedded"],
    topContributors: [
      { name: "meshdev.eth", percentage: "11%" },
      { name: "noderunner.eth", percentage: "9%" },
      { name: "rf-engineer.eth", percentage: "8%" },
      { name: "carol.eth", percentage: "7%" },
      { name: "dave.eth", percentage: "6%" },
    ],
    depth: 4,
  },
  {
    name: "Agent Framework",
    slug: "agent-framework",
    category: "AI",
    type: "repo",
    summary:
      "Open-source framework for building autonomous on-chain AI agents with verifiable decision-making.",
    raised: "$52,300",
    raisedNumeric: 52300,
    contributors: 67,
    description:
      "A modular framework for deploying AI agents that interact with smart contracts autonomously. Agents can read on-chain state, propose transactions, and execute multi-step workflows. Every decision is logged with a verifiable reasoning trace, enabling auditability and dispute resolution. The framework supports plugin architectures for custom tool integration.",
    dependencies: ["LangChain", "ethers.js", "OpenAI SDK", "Hardhat"],
    topContributors: [
      { name: "agentbuilder.eth", percentage: "18%" },
      { name: "llm-researcher.eth", percentage: "14%" },
      { name: "emily.eth", percentage: "9%" },
      { name: "frank.eth", percentage: "7%" },
    ],
    depth: 3,
  },
  {
    name: "Recursive STARK Verifier",
    slug: "recursive-stark-verifier",
    category: "Cryptography",
    type: "paper",
    summary:
      "On-chain recursive proof verification enabling scalable rollup architectures with minimal gas costs.",
    raised: "$34,500",
    raisedNumeric: 34500,
    contributors: 21,
    description:
      "A cryptographic construction for recursively verifying STARK proofs on-chain. This enables rollups to batch thousands of transactions into a single proof that can be verified in constant gas. The paper introduces a novel folding scheme that reduces verifier circuit size by 40% compared to prior art, making recursive verification practical on Ethereum L1.",
    dependencies: ["StarkWare", "Winterfell", "Plonky2", "Goldilocks Field"],
    topContributors: [
      { name: "cryptographer.eth", percentage: "22%" },
      { name: "prover.eth", percentage: "16%" },
      { name: "math-phd.eth", percentage: "12%" },
    ],
    depth: 2,
  },
  {
    name: "Solidity Fuzzer",
    slug: "solidity-fuzzer",
    category: "Security",
    type: "package",
    summary:
      "Automated smart contract vulnerability detection and property-based fuzzing framework for EVM chains.",
    raised: "$23,800",
    raisedNumeric: 23800,
    contributors: 45,
    description:
      "A property-based fuzzing framework purpose-built for Solidity smart contracts. It generates randomized transaction sequences, checks invariants after each state transition, and shrinks failing test cases to minimal reproductions. Integrates with Foundry and Hardhat. Has discovered 47 vulnerabilities across audited protocols in production.",
    dependencies: ["Foundry", "Solidity Compiler", "ethers.js", "HEVM", "Slither"],
    topContributors: [
      { name: "fuzzer.eth", percentage: "20%" },
      { name: "auditor.eth", percentage: "15%" },
      { name: "securitydev.eth", percentage: "11%" },
      { name: "barry.eth", percentage: "8%" },
    ],
    depth: 3,
  },
  {
    name: "OpenGraph Protocol",
    slug: "opengraph-protocol",
    category: "Social",
    type: "package",
    summary:
      "Open standard for decentralized social graph data, portable identity, and cross-platform interop.",
    raised: "$19,200",
    raisedNumeric: 19200,
    contributors: 53,
    description:
      "An open standard that defines how social graph data (follows, connections, reputation) can be stored on-chain and queried across platforms. Users own their social graph and can port it to any compatible application. The protocol includes a TypeScript SDK, a Solidity reference implementation, and indexer nodes that aggregate cross-chain social data.",
    dependencies: ["Ceramic", "IPFS", "The Graph", "Lens Protocol"],
    topContributors: [
      { name: "socialdev.eth", percentage: "14%" },
      { name: "protocol-eng.eth", percentage: "11%" },
      { name: "identity.eth", percentage: "9%" },
      { name: "graph-builder.eth", percentage: "8%" },
      { name: "alice.eth", percentage: "6%" },
    ],
    depth: 3,
  },
];

export const newProjects: Project[] = [
  {
    name: "Cross-Chain Indexer",
    slug: "cross-chain-indexer",
    category: "Infrastructure",
    type: "package",
    summary:
      "Real-time multi-chain data indexing and unified query engine for dApp developers.",
    raised: "$3,200",
    raisedNumeric: 3200,
    contributors: 8,
    description:
      "A unified indexing engine that aggregates on-chain data across Ethereum, Arbitrum, Optimism, Base, and Polygon into a single queryable API. Developers write subgraph-like mappings once and deploy across chains. The indexer handles reorgs, backfills, and real-time streaming with sub-second latency.",
    dependencies: ["The Graph", "ethers.js", "PostgreSQL", "Redis"],
    topContributors: [
      { name: "indexer.eth", percentage: "28%" },
      { name: "backend-dev.eth", percentage: "22%" },
      { name: "devops.eth", percentage: "15%" },
    ],
    depth: 2,
  },
  {
    name: "DAO Governance Kit",
    slug: "dao-governance-kit",
    category: "Governance",
    type: "package",
    summary:
      "Modular governance primitives and voting mechanisms for DAOs. Plug-and-play proposal lifecycle.",
    raised: "$1,800",
    raisedNumeric: 1800,
    contributors: 12,
    description:
      "A set of modular Solidity contracts and a TypeScript SDK for building custom DAO governance systems. Includes quadratic voting, conviction voting, optimistic governance, and timelock modules. Each primitive is composable and can be mixed into existing governance frameworks like Governor Bravo or Compound.",
    dependencies: ["OpenZeppelin", "Hardhat", "Compound Governor"],
    topContributors: [
      { name: "dao-builder.eth", percentage: "25%" },
      { name: "gov-researcher.eth", percentage: "18%" },
      { name: "sol-dev.eth", percentage: "14%" },
    ],
    depth: 2,
  },
  {
    name: "FHE Analytics",
    slug: "fhe-analytics",
    category: "Privacy",
    type: "paper",
    summary:
      "Fully homomorphic encryption for private on-chain analytics. Query encrypted data without decrypting.",
    raised: "$5,100",
    raisedNumeric: 5100,
    contributors: 6,
    description:
      "A research paper presenting a practical scheme for running analytics queries over fully homomorphic encrypted data stored on-chain. The work introduces optimized bootstrapping techniques that reduce computation overhead by 3x compared to TFHE baselines. Applications include private voting tallies, confidential DeFi analytics, and encrypted health data queries.",
    dependencies: ["TFHE-rs", "Concrete", "Zama", "Lattigo"],
    topContributors: [
      { name: "fhe-researcher.eth", percentage: "32%" },
      { name: "crypto-eng.eth", percentage: "24%" },
      { name: "math-dev.eth", percentage: "18%" },
    ],
    depth: 2,
  },
  {
    name: "MEV Shield",
    slug: "mev-shield",
    category: "Security",
    type: "package",
    summary:
      "User-facing MEV protection middleware. Private transaction relay with fair ordering guarantees.",
    raised: "$2,400",
    raisedNumeric: 2400,
    contributors: 15,
    description:
      "A middleware library that routes user transactions through private mempools with fair ordering guarantees. Integrates with popular wallets and dApp frontends via a drop-in provider. Protects against sandwich attacks, frontrunning, and other MEV extraction strategies. Includes a dashboard for monitoring protected transactions and savings estimates.",
    dependencies: ["Flashbots", "ethers.js", "MEV-Share", "Suave"],
    topContributors: [
      { name: "mev-dev.eth", percentage: "20%" },
      { name: "relay-builder.eth", percentage: "16%" },
      { name: "wallet-dev.eth", percentage: "12%" },
      { name: "searcher.eth", percentage: "10%" },
    ],
    depth: 3,
  },
  {
    name: "Self-Sovereign ID",
    slug: "self-sovereign-id",
    category: "Identity",
    type: "repo",
    summary:
      "Decentralized identity management with verifiable credentials and selective disclosure proofs.",
    raised: "$4,700",
    raisedNumeric: 4700,
    contributors: 19,
    description:
      "A decentralized identity system built on W3C DID and Verifiable Credentials standards. Users create self-sovereign identities anchored on Ethereum, issue and receive verifiable credentials, and present proofs with selective disclosure. The SDK supports BBS+ signatures for privacy-preserving attribute proofs, enabling KYC without revealing personal data.",
    dependencies: ["DID Core", "Verifiable Credentials", "BBS+ Signatures", "Ceramic", "IPFS"],
    topContributors: [
      { name: "identity-dev.eth", percentage: "19%" },
      { name: "did-researcher.eth", percentage: "15%" },
      { name: "privacy-eng.eth", percentage: "11%" },
      { name: "standards-dev.eth", percentage: "9%" },
    ],
    depth: 3,
  },
  {
    name: "Audit AI",
    slug: "audit-ai",
    category: "Security",
    type: "repo",
    summary:
      "AI-powered smart contract auditing that detects vulnerabilities and suggests fixes automatically.",
    raised: "$890",
    raisedNumeric: 890,
    contributors: 4,
    description:
      "An AI-powered auditing tool that scans Solidity contracts for vulnerabilities, generates detailed reports, and suggests code fixes. Uses a fine-tuned model trained on thousands of audit reports and known exploit patterns. Supports automated re-checks after fixes are applied. Early stage but has already caught critical bugs in two live protocols.",
    dependencies: ["Slither", "Mythril", "OpenAI SDK"],
    topContributors: [
      { name: "ai-auditor.eth", percentage: "35%" },
      { name: "ml-eng.eth", percentage: "30%" },
      { name: "security-researcher.eth", percentage: "20%" },
    ],
    depth: 2,
  },
];

export const allProjects: Project[] = [...trendingProjects, ...newProjects];

// ── Lookup helpers ───────────────────────────────────────────────────────────

export function getProjectBySlug(slug: string): Project | undefined {
  return allProjects.find((p) => p.slug === slug);
}

export function getAllSlugs(): string[] {
  return allProjects.map((p) => p.slug);
}

