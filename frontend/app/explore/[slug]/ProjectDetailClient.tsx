"use client";

import { useState } from "react";
import Link from "next/link";
import { typeConfig } from "@/components/agentbase/TypeIcons";
import EthIcon from "@/components/agentbase/EthIcon";
import ForceGraph from "@/components/agentbase/ForceGraph";
import type { Project } from "@/lib/types";

export default function ProjectDetailClient({
  project,
  source,
}: {
  project: Project;
  source: "api" | "static";
}) {
  const [amount, setAmount] = useState("");
  const typeKey = project.type as keyof typeof typeConfig;
  const { Icon, label: typeLabel } = typeConfig[typeKey] || typeConfig["repo"];
  const canDonate = amount.trim().length > 0 && parseFloat(amount) > 0;

  const hasGraph =
    project.graph_data &&
    project.graph_data.nodes &&
    project.graph_data.nodes.length > 0;

  const raised = typeof project.raised === "number"
    ? `$${project.raised.toLocaleString()}`
    : `$${project.raised}`;

  return (
    <div className="px-8 py-8">
      {/* Breadcrumb */}
      <nav className="mb-6">
        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest">
          <Link
            href="/explore"
            className="text-agentbase-muted hover:text-agentbase-text transition-colors"
          >
            Explore
          </Link>
          <span className="text-agentbase-muted">/</span>
          <span className="text-agentbase-text font-bold">{project.name}</span>
        </div>
      </nav>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8 items-start">
        {/* ── Left column ──────────────────────────────────────────────── */}
        <div className="min-w-0">
          {/* Project header */}
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 border border-agentbase-border flex items-center justify-center text-agentbase-muted shrink-0">
              <Icon className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tighter text-agentbase-text">
                {project.name}
              </h1>
              <p className="text-[11px] text-agentbase-muted uppercase tracking-widest font-mono mt-0.5">
                {project.category}
              </p>
            </div>
          </div>

          {/* Contribution graph */}
          {hasGraph && (
            <section className="border border-agentbase-border bg-agentbase-card p-6 mb-8">
              <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-3">
                Dependency Graph
              </p>
              <ForceGraph graphData={project.graph_data} height={400} />
            </section>
          )}

          {/* About */}
          <section className="mb-8">
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-3">
              About
            </p>
            <div className="border border-agentbase-border bg-agentbase-card p-6">
              <p className="text-sm text-agentbase-muted leading-relaxed">
                {project.description}
              </p>
              {project.source_url && (
                <a
                  href={project.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-3 text-[11px] font-mono text-agentbase-accent hover:underline"
                >
                  {project.source_url}
                </a>
              )}
            </div>
          </section>

          {/* Dependencies */}
          {project.dependencies && project.dependencies.length > 0 && (
            <section className="mb-8">
              <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-3">
                Dependencies
              </p>
              <div className="border border-agentbase-border bg-agentbase-card divide-y divide-agentbase-border">
                {project.dependencies.map((dep, i) => (
                  <div key={`${dep}-${i}`} className="px-6 py-3 flex items-center gap-3">
                    <div className="w-7 h-7 border border-agentbase-border flex items-center justify-center text-agentbase-muted shrink-0">
                      <svg
                        viewBox="0 0 24 24"
                        width="14"
                        height="14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                        <line x1="12" y1="22.08" x2="12" y2="12" />
                      </svg>
                    </div>
                    <span className="text-sm font-medium text-agentbase-text">
                      {dep}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Top contributors */}
          {project.top_contributors && project.top_contributors.length > 0 && (
            <section className="mb-8">
              <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-3">
                Top Contributors
              </p>
              <div className="border border-agentbase-border bg-agentbase-card divide-y divide-agentbase-border">
                {project.top_contributors.map((c) => (
                  <div
                    key={c.name}
                    className="px-6 py-3 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 border border-agentbase-border flex items-center justify-center text-agentbase-muted shrink-0">
                        <svg
                          viewBox="0 0 24 24"
                          width="14"
                          height="14"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      </div>
                      <span className="text-sm font-medium text-agentbase-text">
                        {c.name}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono font-bold text-agentbase-muted">
                      {c.percentage}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* ── Right column (sticky sidebar) ────────────────────────────── */}
        <aside className="lg:sticky lg:top-[110px]">
          {/* Donate CTA */}
          <div className="border border-agentbase-border bg-agentbase-card p-5 mb-4">
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-3">
              Fund this project
            </p>
            <div className="flex items-center gap-2 border border-agentbase-border bg-agentbase-card px-3 py-2.5 mb-3">
              <EthIcon size={12} />
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="bg-transparent outline-none text-base font-bold text-agentbase-text placeholder-agentbase-placeholder w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-agentbase-muted flex-shrink-0">
                ETH
              </span>
            </div>
            <button
              disabled={!canDonate}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-agentbase-invertedBg text-agentbase-invertedText font-mono text-[10px] tracking-widest uppercase font-bold rounded-full hover:bg-agentbase-invertedHover transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <EthIcon size={10} />
              Donate {amount ? `${amount} ETH` : ""}
            </button>
            {canDonate && (
              <p className="mt-2 text-[10px] text-agentbase-muted text-center">
                Splits across {project.contributors} contributors
              </p>
            )}
          </div>

          {/* Stats grid */}
          <div className="border border-agentbase-border bg-agentbase-card">
            <div className="grid grid-cols-2">
              {[
                { label: "Raised", value: raised },
                { label: "Contributors", value: String(project.contributors) },
                {
                  label: "Dependencies",
                  value: String(project.dependencies?.length || 0),
                },
                { label: "Graph Depth", value: String(project.depth) },
              ].map((stat, i) => (
                <div
                  key={stat.label}
                  className={`p-4 ${i % 2 !== 0 ? "border-l border-agentbase-border" : ""} ${i < 2 ? "border-b border-agentbase-border" : ""}`}
                >
                  <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-0.5">
                    {stat.label}
                  </p>
                  <p className="text-lg font-bold tracking-tight text-agentbase-text">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-2 mt-4">
            <span className="bg-agentbase-badgeBg text-agentbase-badgeText text-[10px] font-bold tracking-widest uppercase px-3 py-1">
              {project.category}
            </span>
            <span className="bg-agentbase-badgeBg text-agentbase-badgeText text-[10px] font-bold tracking-widest uppercase px-3 py-1">
              {typeLabel}
            </span>
            {source === "api" && (
              <span className="bg-agentbase-accent/10 text-agentbase-accent text-[10px] font-bold tracking-widest uppercase px-3 py-1">
                Live
              </span>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
