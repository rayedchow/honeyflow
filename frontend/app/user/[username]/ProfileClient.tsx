"use client";

import { useState } from "react";
import Link from "next/link";
import { typeConfig } from "@/components/ui/TypeIcons";
import EthIcon from "@/components/ui/EthIcon";
import type { UserProfile, UserProjectContribution } from "@/lib/types";

const ETH_TO_USD = 2500;

function fmtCurrency(usd: number, showUsd: boolean) {
  if (showUsd) return `$${usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return `${(usd / ETH_TO_USD).toFixed(4)} ETH`;
}

function ContributionRow({
  project,
  showUsd,
}: {
  project: UserProjectContribution;
  showUsd: boolean;
}) {
  const typeKey = project.type as keyof typeof typeConfig;
  const { Icon } = typeConfig[typeKey] || typeConfig["repo"];
  const raised = showUsd
    ? `$${project.raised_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : `${project.raised_eth.toFixed(4)} ETH`;
  const share = showUsd
    ? `$${project.share_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : `${project.share_eth.toFixed(4)} ETH`;

  return (
    <Link
      href={`/explore/${project.slug}`}
      className="group grid grid-cols-[1fr_auto_auto_auto] md:grid-cols-[1fr_100px_120px_120px] items-center gap-4 px-6 py-4 hover:bg-agentbase-cardHover transition-colors"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 border border-agentbase-border flex items-center justify-center text-agentbase-muted group-hover:text-agentbase-text transition-colors shrink-0">
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold tracking-tight text-agentbase-text truncate">
            {project.name}
          </p>
          <p className="text-[10px] text-agentbase-muted uppercase tracking-widest font-mono">
            {project.category}
          </p>
        </div>
      </div>

      <span className="text-[12px] font-mono font-bold text-agentbase-yellow text-right">
        {project.percentage.toFixed(1)}%
      </span>

      <span className="text-[12px] font-mono font-bold text-agentbase-muted text-right hidden md:block">
        {raised}
      </span>

      <span className="text-[12px] font-mono font-bold text-agentbase-text text-right">
        {share}
      </span>
    </Link>
  );
}

export default function ProfileClient({ profile }: { profile: UserProfile }) {
  const [showUsd, setShowUsd] = useState(false);

  const totalShare = showUsd
    ? `$${profile.total_attributed_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : `${profile.total_attributed_eth.toFixed(4)} ETH`;

  const totalRaisedUsd = profile.projects.reduce((acc, p) => acc + p.raised_usd, 0);
  const totalRaised = showUsd
    ? `$${totalRaisedUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : `${(totalRaisedUsd / ETH_TO_USD).toFixed(4)} ETH`;

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
          <span className="text-agentbase-text font-bold">{profile.username}</span>
        </div>
      </nav>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8 items-start">
        {/* ── Left column ──────────────────────────────────── */}
        <div className="min-w-0">
          {/* User header */}
          <div className="flex items-center gap-4 mb-8">
            <img
              src={`https://github.com/${profile.username}.png?size=96`}
              alt={profile.username}
              width={48}
              height={48}
              className="w-12 h-12 border border-agentbase-border object-cover"
            />
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tighter text-agentbase-text">
                {profile.username}
              </h1>
              <a
                href={`https://github.com/${profile.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-agentbase-accent hover:underline font-mono uppercase tracking-widest"
              >
                github.com/{profile.username}
              </a>
            </div>
          </div>

          {/* Contributions table */}
          <section>
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-3">
              Contributions
            </p>

            <div className="border border-agentbase-border bg-agentbase-card">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_auto_auto_auto] md:grid-cols-[1fr_100px_120px_120px] gap-4 px-6 py-3 border-b border-agentbase-border">
                <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-agentbase-muted">
                  Project
                </span>
                <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-agentbase-muted text-right">
                  Share
                </span>
                <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-agentbase-muted text-right hidden md:block">
                  Raised
                </span>
                <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-agentbase-muted text-right">
                  Attributed
                </span>
              </div>

              {/* Rows */}
              <div className="divide-y divide-agentbase-border">
                {profile.projects.map((p) => (
                  <ContributionRow
                    key={p.slug}
                    project={p}
                    showUsd={showUsd}
                  />
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* ── Right column (sticky sidebar) ────────────────── */}
        <aside className="lg:sticky lg:top-[110px]">
          {/* ETH / USD toggle */}
          <div className="flex items-center justify-end mb-3">
            <div className="flex border border-agentbase-border font-mono text-[10px] font-bold uppercase tracking-widest">
              <button
                onClick={() => setShowUsd(false)}
                className={`px-3 py-1 transition-colors ${
                  !showUsd
                    ? "bg-agentbase-invertedBg text-agentbase-invertedText"
                    : "text-agentbase-muted hover:text-agentbase-text"
                }`}
              >
                ETH
              </button>
              <button
                onClick={() => setShowUsd(true)}
                className={`px-3 py-1 transition-colors ${
                  showUsd
                    ? "bg-agentbase-invertedBg text-agentbase-invertedText"
                    : "text-agentbase-muted hover:text-agentbase-text"
                }`}
              >
                USD
              </button>
            </div>
          </div>

          {/* Funding summary card */}
          <div className="border border-agentbase-border bg-agentbase-card p-5 mb-4">
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-4">
              Funding Summary
            </p>
            <div className="flex items-baseline gap-2 mb-1">
              {!showUsd && <EthIcon size={14} />}
              <p className="text-3xl font-bold tracking-tighter text-agentbase-text">
                {totalShare}
              </p>
            </div>
            <p className="text-[11px] text-agentbase-muted">
              total attributed across all projects
            </p>
          </div>

          {/* Stats grid */}
          <div className="border border-agentbase-border bg-agentbase-card">
            <div className="grid grid-cols-2">
              {[
                { label: "Projects", value: String(profile.total_projects) },
                { label: "Total Raised", value: totalRaised },
                {
                  label: "Avg Share",
                  value:
                    profile.projects.length > 0
                      ? `${(profile.projects.reduce((a, p) => a + p.percentage, 0) / profile.projects.length).toFixed(1)}%`
                      : "0%",
                },
                {
                  label: "Top Share",
                  value:
                    profile.projects.length > 0
                      ? `${Math.max(...profile.projects.map((p) => p.percentage)).toFixed(1)}%`
                      : "0%",
                },
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
              Contributor
            </span>
            {profile.total_projects >= 3 && (
              <span className="bg-agentbase-accent/10 text-agentbase-accent text-[10px] font-bold tracking-widest uppercase px-3 py-1">
                Multi-Project
              </span>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
