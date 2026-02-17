import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Explore Projects - SourceFund",
  description: "Discover and fund projects across the open-source ecosystem.",
};

const trendingProjects = [
  {
    name: "Zero-Knowledge ML",
    category: "Research",
    summary:
      "ZK proofs for machine learning model inference verification on Ethereum. Enables trustless AI predictions.",
    raised: "$45,200",
    contributors: 38,
  },
  {
    name: "DePIN Mesh Network",
    category: "Infrastructure",
    summary:
      "Decentralized physical infrastructure for wireless mesh connectivity. Community-owned internet access.",
    raised: "$67,100",
    contributors: 124,
  },
  {
    name: "Agent Framework",
    category: "AI",
    summary:
      "Open-source framework for building autonomous on-chain AI agents with verifiable decision-making.",
    raised: "$52,300",
    contributors: 67,
  },
  {
    name: "Recursive STARK Verifier",
    category: "Cryptography",
    summary:
      "On-chain recursive proof verification enabling scalable rollup architectures with minimal gas costs.",
    raised: "$34,500",
    contributors: 21,
  },
  {
    name: "Solidity Fuzzer",
    category: "Security",
    summary:
      "Automated smart contract vulnerability detection and property-based fuzzing framework for EVM chains.",
    raised: "$23,800",
    contributors: 45,
  },
  {
    name: "OpenGraph Protocol",
    category: "Social",
    summary:
      "Open standard for decentralized social graph data, portable identity, and cross-platform interop.",
    raised: "$19,200",
    contributors: 53,
  },
];

const newProjects = [
  {
    name: "Cross-Chain Indexer",
    category: "Infrastructure",
    summary:
      "Real-time multi-chain data indexing and unified query engine for dApp developers.",
    raised: "$3,200",
    contributors: 8,
  },
  {
    name: "DAO Governance Kit",
    category: "Governance",
    summary:
      "Modular governance primitives and voting mechanisms for DAOs. Plug-and-play proposal lifecycle.",
    raised: "$1,800",
    contributors: 12,
  },
  {
    name: "FHE Analytics",
    category: "Privacy",
    summary:
      "Fully homomorphic encryption for private on-chain analytics. Query encrypted data without decrypting.",
    raised: "$5,100",
    contributors: 6,
  },
  {
    name: "MEV Shield",
    category: "Security",
    summary:
      "User-facing MEV protection middleware. Private transaction relay with fair ordering guarantees.",
    raised: "$2,400",
    contributors: 15,
  },
  {
    name: "Self-Sovereign ID",
    category: "Identity",
    summary:
      "Decentralized identity management with verifiable credentials and selective disclosure proofs.",
    raised: "$4,700",
    contributors: 19,
  },
  {
    name: "Audit AI",
    category: "Security",
    summary:
      "AI-powered smart contract auditing that detects vulnerabilities and suggests fixes automatically.",
    raised: "$890",
    contributors: 4,
  },
];

function ProjectCard({
  name,
  category,
  summary,
  raised,
  contributors,
}: {
  name: string;
  category: string;
  summary: string;
  raised: string;
  contributors: number;
}) {
  return (
    <a
      href="#"
      className="group backdrop-blur-sm bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 flex flex-col gap-3 transition-all hover:bg-white/[0.05] hover:border-white/[0.09]"
    >
      <p className="text-[10px] font-medium uppercase tracking-widest text-white/20">
        {category}
      </p>
      <h3 className="text-[17px] text-white font-medium tracking-tight group-hover:text-white">
        {name}
      </h3>
      <p className="text-[13px] text-white/35 leading-relaxed line-clamp-2">
        {summary}
      </p>
      <div className="flex items-center gap-3 mt-auto pt-3">
        <span className="inline-flex px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/[0.08] text-[11px] font-medium text-white/50">
          {raised} raised
        </span>
        <span className="text-[11px] text-white/20">
          {contributors} contributors
        </span>
      </div>
    </a>
  );
}

export default function ExplorePage() {
  return (
    <div className="pt-10 pb-20">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">
          Explore
        </h1>
        <p className="text-[15px] text-white/40">
          Discover and fund projects across the ecosystem
        </p>
      </div>

      {/* Search */}
      <div className="mb-12">
        <div className="backdrop-blur-sm bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 flex items-center gap-3 max-w-md">
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-white/25 flex-shrink-0"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search projects..."
            className="bg-transparent outline-none text-sm text-white placeholder-white/25 w-full"
          />
        </div>
      </div>

      {/* Trending */}
      <section className="mb-16">
        <div className="mb-6">
          <p className="text-[11px] font-medium uppercase tracking-widest text-white/25 mb-1.5">
            Popular right now
          </p>
          <h2 className="text-xl font-semibold tracking-tight text-white">
            Trending
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {trendingProjects.map((project) => (
            <ProjectCard key={project.name} {...project} />
          ))}
        </div>
      </section>

      {/* New Projects */}
      <section>
        <div className="mb-6">
          <p className="text-[11px] font-medium uppercase tracking-widest text-white/25 mb-1.5">
            Recently added
          </p>
          <h2 className="text-xl font-semibold tracking-tight text-white">
            New Projects
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {newProjects.map((project) => (
            <ProjectCard key={project.name} {...project} />
          ))}
        </div>
      </section>
    </div>
  );
}
