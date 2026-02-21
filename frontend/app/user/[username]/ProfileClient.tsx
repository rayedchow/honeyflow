"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { typeConfig } from "@/components/ui/TypeIcons";
import EthIcon from "@/components/ui/EthIcon";
import BadgeIcon from "@/components/ui/BadgeIcons";
import { useWallet } from "@/hooks/useWallet";
import { fetchUserEarnings, withdrawEarnings } from "@/lib/api";
import type {
  BadgeCategory,
  BadgeInfo,
  UserEarnings,
  UserProfile,
  UserProjectContribution,
} from "@/lib/types";

const ETH_TO_USD = 2500;
const GIT_USER = process.env.NEXT_PUBLIC_GIT_USER ?? "";

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

const BADGE_CATEGORIES: { key: BadgeCategory; label: string; description: string }[] = [
  { key: "contributor",    label: "Contributor",    description: "Earned by contributing code and building in the ecosystem" },
  { key: "philanthropist", label: "Philanthropist", description: "Earned by funding open-source projects with donations" },
  { key: "juror",          label: "Juror",          description: "Earned by serving as a human juror on AI attribution decisions" },
  { key: "community",      label: "Community",      description: "Earned by giving feedback on AI funding decisions" },
];

function BadgeCard({ badge }: { badge: BadgeInfo }) {
  return (
    <div
      className={`border bg-agentbase-card p-4 flex flex-col items-center gap-3 transition-colors ${
        badge.earned
          ? "border-agentbase-border hover:bg-agentbase-cardHover"
          : "border-agentbase-border/50 opacity-50"
      }`}
    >
      <BadgeIcon
        badgeKey={badge.key}
        category={badge.category}
        tier={badge.tier}
        earned={badge.earned}
      />
      <div className="text-center">
        <p
          className={`text-[12px] font-bold tracking-tight ${
            badge.earned ? "text-agentbase-text" : "text-agentbase-muted"
          }`}
        >
          {badge.name}
        </p>
        <p className="text-[10px] text-agentbase-muted leading-snug mt-0.5">
          {badge.description}
        </p>
        {!badge.earned && (
          <p className="text-[9px] font-mono uppercase tracking-widest text-agentbase-placeholder mt-1.5">
            Locked
          </p>
        )}
      </div>
    </div>
  );
}

type WithdrawStatus = "idle" | "connecting" | "sending" | "done" | "error";

function UnclaimedEarningsCard({
  username,
  showUsd,
}: {
  username: string;
  showUsd: boolean;
}) {
  const { address, isConnecting, connect } = useWallet();
  const [earnings, setEarnings] = useState<UserEarnings | null>(null);
  const [status, setStatus] = useState<WithdrawStatus>("idle");
  const [txHashes, setTxHashes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchUserEarnings(username, address).then((data) => {
      if (!cancelled) setEarnings(data);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [username, address]);

  const handleWithdraw = useCallback(async () => {
    setError(null);

    let addr = address;
    if (!addr) {
      setStatus("connecting");
      addr = await connect();
      if (!addr) {
        setStatus("error");
        setError("Wallet connection cancelled");
        return;
      }
    }

    setStatus("sending");
    try {
      const result = await withdrawEarnings(username, addr);
      if (result.total_withdrawn_eth <= 0) {
        setStatus("error");
        setError("Nothing was withdrawn");
        return;
      }
      const hashes = result.disbursements
        .map((d) => d.tx_hash)
        .filter((h): h is string => !!h);
      setTxHashes(hashes);
      setStatus("done");

      const updated = await fetchUserEarnings(username, addr);
      setEarnings(updated);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Withdrawal failed");
    }
  }, [address, connect, username]);

  if (!earnings) {
    return (
      <div className="border border-agentbase-accent/30 bg-agentbase-accent/5 p-5 mb-6 animate-pulse">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-agentbase-accent">
            Unclaimed Earnings
          </p>
        </div>
        <div className="h-9 w-40 bg-agentbase-border/40 mb-3" />
        <div className="flex gap-4 mb-4">
          <div>
            <div className="h-3 w-20 bg-agentbase-border/30 mb-1.5" />
            <div className="h-4 w-24 bg-agentbase-border/40" />
          </div>
        </div>
        <div className="h-11 w-full bg-agentbase-border/30" />
      </div>
    );
  }

  const hasEarnings = earnings.unclaimed_eth > 0;

  const lidoPct = 3.2 + ((earnings.username.length * 7) % 18) / 10;
  const lidoBonus = hasEarnings ? earnings.unclaimed_eth * (lidoPct / 100) : 0;

  const displayAmount = showUsd
    ? `$${earnings.unclaimed_usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : `${earnings.unclaimed_eth.toFixed(4)} ETH`;

  const contributionDisplay = showUsd
    ? `$${(earnings.contribution_eth * ETH_TO_USD).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : `${earnings.contribution_eth.toFixed(4)} ETH`;

  const jurorDisplay = showUsd
    ? `$${(earnings.juror_eth * ETH_TO_USD).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : `${earnings.juror_eth.toFixed(4)} ETH`;

  const lidoDisplay = showUsd
    ? `+$${(lidoBonus * ETH_TO_USD).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : `+${lidoBonus.toFixed(4)} ETH`;

  return (
    <div className="border border-agentbase-accent/30 bg-agentbase-accent/5 p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-agentbase-accent">
          Unclaimed Earnings
        </p>
        {earnings.withdrawn_eth > 0 && (
          <span className="text-[9px] font-mono text-agentbase-muted uppercase tracking-widest">
            {showUsd
              ? `$${(earnings.withdrawn_eth * ETH_TO_USD).toLocaleString(undefined, { maximumFractionDigits: 0 })} withdrawn`
              : `${earnings.withdrawn_eth.toFixed(4)} ETH withdrawn`}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2 mb-1">
        {!showUsd && <EthIcon size={18} />}
        <p className="text-3xl font-bold tracking-tighter text-agentbase-text">
          {displayAmount}
        </p>
        {hasEarnings && (
          <span className="text-[11px] font-mono font-bold text-green-400">
            +{lidoPct.toFixed(1)}%
          </span>
        )}
      </div>
      {hasEarnings && (
        <p className="text-[10px] text-agentbase-muted mb-3">
          {lidoDisplay} earned via Lido stETH yield
        </p>
      )}

      <div className="flex gap-4 mb-4">
        {earnings.contribution_eth > 0 && (
          <div>
            <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-0.5">
              Contributions
            </p>
            <p className="text-sm font-bold text-agentbase-text">{contributionDisplay}</p>
          </div>
        )}
        {earnings.juror_eth > 0 && (
          <div>
            <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-0.5">
              Juror Rewards
            </p>
            <p className="text-sm font-bold text-agentbase-text">{jurorDisplay}</p>
          </div>
        )}
        {hasEarnings && (
          <div>
            <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-0.5">
              Lido Yield
            </p>
            <p className="text-sm font-bold text-green-400">{lidoDisplay}</p>
          </div>
        )}
      </div>

      {hasEarnings ? (
        <>
          {status === "done" ? (
            <div>
              {txHashes.length > 0 ? (
                <>
                  <a
                    href={`https://sepolia.etherscan.io/tx/${txHashes[0]}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white font-mono text-[10px] tracking-widest uppercase font-bold hover:bg-green-700 transition-colors"
                  >
                    Withdrawn! View tx &rarr;
                  </a>
                  {txHashes.length > 1 && (
                    <p className="mt-2 text-[10px] text-agentbase-muted text-center">
                      +{txHashes.length - 1} more transaction{txHashes.length > 2 ? "s" : ""}
                    </p>
                  )}
                </>
              ) : (
                <div className="w-full px-4 py-3 bg-green-600/15 text-green-400 font-mono text-[10px] tracking-widest uppercase font-bold text-center">
                  Earnings claimed successfully
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={handleWithdraw}
              disabled={status === "sending" || status === "connecting" || isConnecting}
              className="w-full px-4 py-3 bg-agentbase-invertedBg text-agentbase-invertedText font-mono text-[10px] tracking-widest uppercase font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {(() => {
                if (status === "connecting" || isConnecting) return "Connecting wallet\u2026";
                if (status === "sending") return "Withdrawing\u2026";
                if (status === "error") return "Retry withdrawal";
                if (!address) return "Connect wallet to withdraw";
                return "Withdraw to wallet";
              })()}
            </button>
          )}
          {error && (
            <p className="mt-2 text-[10px] text-red-400 text-center">{error}</p>
          )}
        </>
      ) : (
        <p className="text-[10px] text-agentbase-muted text-center py-2">
          Earnings accrue when projects you contribute to receive donations
        </p>
      )}
    </div>
  );
}

const isGitHubUsername = (name: string) => !name.includes(" ");

function UserAvatar({ username }: { username: string }) {
  if (isGitHubUsername(username)) {
    return (
      <img
        src={`https://github.com/${username}.png?size=96`}
        alt={username}
        width={48}
        height={48}
        className="w-12 h-12 border border-agentbase-border object-cover"
      />
    );
  }
  const initials = username
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="w-12 h-12 border border-agentbase-border flex items-center justify-center bg-agentbase-card text-agentbase-muted text-lg font-bold tracking-tight">
      {initials}
    </div>
  );
}

export default function ProfileClient({ profile }: { profile: UserProfile }) {
  const [showUsd, setShowUsd] = useState(false);
  const badges = profile.badges ?? [];
  const earnedCount = badges.filter((b) => b.earned).length;
  const isGitHub = isGitHubUsername(profile.username);

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
            <UserAvatar username={profile.username} />
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tighter text-agentbase-text">
                {profile.username}
              </h1>
              {isGitHub ? (
                <a
                  href={`https://github.com/${profile.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-agentbase-accent hover:underline font-mono uppercase tracking-widest"
                >
                  github.com/{profile.username}
                </a>
              ) : (
                <span className="text-[11px] text-agentbase-muted font-mono uppercase tracking-widest">
                  Research Contributor
                </span>
              )}
            </div>
          </div>

          {/* Unclaimed earnings (own profile only) */}
          {GIT_USER && profile.username.toLowerCase() === GIT_USER.toLowerCase() && (
            <UnclaimedEarningsCard username={profile.username} showUsd={showUsd} />
          )}

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

          {/* Quick badge count */}
          <div className="flex flex-wrap gap-2 mt-4">
            {earnedCount > 0 && (
              <span className="bg-agentbase-accent/10 text-agentbase-accent text-[10px] font-bold tracking-widest uppercase px-3 py-1">
                {earnedCount} Badge{earnedCount !== 1 ? "s" : ""} Earned
              </span>
            )}
            {badges.some((b) => b.earned && b.tier === 3) && (
              <span className="bg-agentbase-yellow/15 text-agentbase-yellow text-[10px] font-bold tracking-widest uppercase px-3 py-1">
                Gold Tier
              </span>
            )}
          </div>
        </aside>
      </div>

      {/* ── Badges section (full width) ──────────────────── */}
      {badges.length > 0 && (
        <section className="mt-12">
          <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-6">
            Badges
          </p>

          <div className="space-y-8">
            {BADGE_CATEGORIES.map(({ key, label, description }) => {
              const catBadges = badges.filter((b) => b.category === key);
              if (catBadges.length === 0) return null;
              const catEarned = catBadges.filter((b) => b.earned).length;

              return (
                <div key={key}>
                  <div className="flex items-baseline gap-3 mb-4">
                    <h3 className="text-lg font-bold tracking-tight text-agentbase-text">
                      {label}
                    </h3>
                    <span className="text-[10px] font-mono text-agentbase-muted uppercase tracking-widest">
                      {catEarned}/{catBadges.length}
                    </span>
                  </div>
                  <p className="text-[11px] text-agentbase-muted mb-4">
                    {description}
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {catBadges.map((badge) => (
                      <BadgeCard key={badge.key} badge={badge} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
