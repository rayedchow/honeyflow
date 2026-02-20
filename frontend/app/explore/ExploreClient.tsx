"use client";

import { useState } from "react";

type ProjectType = "paper" | "repo" | "package";

interface Project {
  name: string;
  category: string;
  type: ProjectType;
  summary: string;
  raised: string;
  contributors: number;
}

const trendingProjects: Project[] = [
  {
    name: "Zero-Knowledge ML",
    category: "Research",
    type: "paper",
    summary:
      "ZK proofs for machine learning model inference verification on Ethereum. Enables trustless AI predictions.",
    raised: "$45,200",
    contributors: 38,
  },
  {
    name: "DePIN Mesh Network",
    category: "Infrastructure",
    type: "repo",
    summary:
      "Decentralized physical infrastructure for wireless mesh connectivity. Community-owned internet access.",
    raised: "$67,100",
    contributors: 124,
  },
  {
    name: "Agent Framework",
    category: "AI",
    type: "repo",
    summary:
      "Open-source framework for building autonomous on-chain AI agents with verifiable decision-making.",
    raised: "$52,300",
    contributors: 67,
  },
  {
    name: "Recursive STARK Verifier",
    category: "Cryptography",
    type: "paper",
    summary:
      "On-chain recursive proof verification enabling scalable rollup architectures with minimal gas costs.",
    raised: "$34,500",
    contributors: 21,
  },
  {
    name: "Solidity Fuzzer",
    category: "Security",
    type: "package",
    summary:
      "Automated smart contract vulnerability detection and property-based fuzzing framework for EVM chains.",
    raised: "$23,800",
    contributors: 45,
  },
  {
    name: "OpenGraph Protocol",
    category: "Social",
    type: "package",
    summary:
      "Open standard for decentralized social graph data, portable identity, and cross-platform interop.",
    raised: "$19,200",
    contributors: 53,
  },
];

const newProjects: Project[] = [
  {
    name: "Cross-Chain Indexer",
    category: "Infrastructure",
    type: "package",
    summary:
      "Real-time multi-chain data indexing and unified query engine for dApp developers.",
    raised: "$3,200",
    contributors: 8,
  },
  {
    name: "DAO Governance Kit",
    category: "Governance",
    type: "package",
    summary:
      "Modular governance primitives and voting mechanisms for DAOs. Plug-and-play proposal lifecycle.",
    raised: "$1,800",
    contributors: 12,
  },
  {
    name: "FHE Analytics",
    category: "Privacy",
    type: "paper",
    summary:
      "Fully homomorphic encryption for private on-chain analytics. Query encrypted data without decrypting.",
    raised: "$5,100",
    contributors: 6,
  },
  {
    name: "MEV Shield",
    category: "Security",
    type: "package",
    summary:
      "User-facing MEV protection middleware. Private transaction relay with fair ordering guarantees.",
    raised: "$2,400",
    contributors: 15,
  },
  {
    name: "Self-Sovereign ID",
    category: "Identity",
    type: "repo",
    summary:
      "Decentralized identity management with verifiable credentials and selective disclosure proofs.",
    raised: "$4,700",
    contributors: 19,
  },
  {
    name: "Audit AI",
    category: "Security",
    type: "repo",
    summary:
      "AI-powered smart contract auditing that detects vulnerabilities and suggests fixes automatically.",
    raised: "$890",
    contributors: 4,
  },
];

// ── Type icons ────────────────────────────────────────────────────────────────

function PaperIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  );
}

function RepoIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 98 96"
      fill="currentColor"
      className={className}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"
      />
    </svg>
  );
}

function PackageIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

const typeConfig: Record<
  ProjectType,
  { label: string; Icon: React.FC<{ className?: string }> }
> = {
  paper: { label: "Research Paper", Icon: PaperIcon },
  repo: { label: "GitHub Repo", Icon: RepoIcon },
  package: { label: "Package", Icon: PackageIcon },
};

const allSectors = [
  "All Sectors",
  "Research",
  "Infrastructure",
  "AI",
  "Cryptography",
  "Security",
  "Social",
  "Governance",
  "Privacy",
  "Identity",
];

// ── Dropdown ──────────────────────────────────────────────────────────────────

function FilterDropdown({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <div className="relative">
      <label className="sr-only">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-agentbase-card border border-agentbase-border px-4 pr-9 py-2.5 text-[13px] text-agentbase-muted outline-none cursor-pointer hover:bg-agentbase-cardHover transition-colors"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-agentbase-muted">
        <svg
          viewBox="0 0 24 24"
          width="13"
          height="13"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
    </div>
  );
}

// ── Project card ──────────────────────────────────────────────────────────────

function ProjectCard({ project }: { project: Project }) {
  const { Icon } = typeConfig[project.type];
  return (
    <a
      href="#"
      className="group border border-agentbase-border bg-agentbase-card p-6 flex flex-col gap-4 hover:bg-agentbase-cardHover transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 border border-agentbase-border flex items-center justify-center text-agentbase-muted group-hover:text-agentbase-cyan transition-colors shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-bold tracking-tight text-agentbase-text truncate">
            {project.name}
          </h3>
          <p className="text-[11px] text-agentbase-muted uppercase tracking-widest font-mono mt-0.5">
            {project.category}
          </p>
        </div>
      </div>

      <p className="text-sm text-agentbase-muted leading-relaxed line-clamp-2">
        {project.summary}
      </p>

      <div className="flex items-center gap-3 pt-3 border-t border-agentbase-border">
        <span className="inline-flex px-2.5 py-1 bg-agentbase-badgeBg text-agentbase-badgeText text-[11px] font-mono font-bold tracking-wide">
          {project.raised} raised
        </span>
        <span className="text-[11px] text-agentbase-muted">
          {project.contributors} contributors
        </span>
      </div>
    </a>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ExploreClient() {
  const [typeFilter, setTypeFilter] = useState("all");
  const [sectorFilter, setSectorFilter] = useState("All Sectors");
  const [search, setSearch] = useState("");

  const typeOptions = [
    { value: "all", label: "All Types" },
    { value: "paper", label: "Research Paper" },
    { value: "repo", label: "GitHub Repo" },
    { value: "package", label: "Package" },
  ];

  const sectorOptions = allSectors.map((s) => ({ value: s, label: s }));

  const filterProjects = (list: Project[]) =>
    list.filter((p) => {
      const matchesType = typeFilter === "all" || p.type === typeFilter;
      const matchesSector =
        sectorFilter === "All Sectors" || p.category === sectorFilter;
      const matchesSearch =
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.category.toLowerCase().includes(search.toLowerCase()) ||
        p.summary.toLowerCase().includes(search.toLowerCase());
      return matchesType && matchesSector && matchesSearch;
    });

  const filteredTrending = filterProjects(trendingProjects);
  const filteredNew = filterProjects(newProjects);
  const noResults = filteredTrending.length === 0 && filteredNew.length === 0;

  return (
    <div className="px-8 py-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tighter text-agentbase-text mb-3">
          Explore
        </h1>
        <p className="text-lg text-agentbase-muted">
          Discover and fund projects across the ecosystem
        </p>
      </div>

      {/* Search + Dropdowns */}
      <div className="flex flex-wrap gap-3 mb-12 border-b border-agentbase-border pb-8">
        {/* Search */}
        <div className="border border-agentbase-border bg-agentbase-card px-4 py-2.5 flex items-center gap-3 w-full sm:w-64">
          <svg
            viewBox="0 0 24 24"
            width="15"
            height="15"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-agentbase-muted shrink-0"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent outline-none text-sm text-agentbase-text placeholder-agentbase-placeholder w-full"
          />
        </div>

        <FilterDropdown
          label="Filter by type"
          value={typeFilter}
          onChange={setTypeFilter}
          options={typeOptions}
        />

        <FilterDropdown
          label="Filter by sector"
          value={sectorFilter}
          onChange={setSectorFilter}
          options={sectorOptions}
        />
      </div>

      {/* Trending */}
      {filteredTrending.length > 0 && (
        <section className="mb-14">
          <div className="mb-5">
            <p className="text-[11px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-1.5">
              Popular right now
            </p>
            <h2 className="text-2xl font-bold tracking-tighter text-agentbase-text">
              Trending
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTrending.map((project) => (
              <ProjectCard key={project.name} project={project} />
            ))}
          </div>
        </section>
      )}

      {/* New Projects */}
      {filteredNew.length > 0 && (
        <section>
          <div className="mb-5">
            <p className="text-[11px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-1.5">
              Recently added
            </p>
            <h2 className="text-2xl font-bold tracking-tighter text-agentbase-text">
              New Projects
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredNew.map((project) => (
              <ProjectCard key={project.name} project={project} />
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {noResults && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-12 h-12 border border-agentbase-border flex items-center justify-center mb-4">
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-agentbase-muted"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <p className="text-agentbase-text text-[15px] font-bold mb-1">
            No projects found
          </p>
          <p className="text-agentbase-muted text-[13px]">
            Try a different filter or search term
          </p>
        </div>
      )}
    </div>
  );
}
