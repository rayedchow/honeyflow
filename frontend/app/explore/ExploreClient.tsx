"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import useSWR from "swr";
import { fetchProjects } from "@/lib/api";
import {
  trendingProjects,
  newProjects,
  type Project as StaticProject,
} from "@/lib/projects";
import { typeConfig } from "@/components/agentbase/TypeIcons";
import type { Project } from "@/lib/types";

const fetcher = () => fetchProjects().then((d) => d.projects);

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

// ── Project card (works with both API and static projects) ───────────────────

type CardProject = {
  slug: string;
  name: string;
  category: string;
  type: string;
  summary: string;
  raised?: number | string;
  contributors: number;
};

function ProjectCard({ project }: { project: CardProject }) {
  const typeKey = project.type as keyof typeof typeConfig;
  const { Icon } = typeConfig[typeKey] || typeConfig["repo"];
  const raised = typeof project.raised === "number"
    ? `$${project.raised.toLocaleString()}`
    : project.raised || "$0";

  return (
    <Link
      href={`/explore/${project.slug}`}
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
          {raised} raised
        </span>
        <span className="text-[11px] text-agentbase-muted">
          {project.contributors} contributors
        </span>
      </div>
    </Link>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ExploreClient({
  initialProjects = [],
}: {
  initialProjects?: Project[];
}) {
  const [typeFilter, setTypeFilter] = useState("all");
  const [sectorFilter, setSectorFilter] = useState("All Sectors");
  const [search, setSearch] = useState("");

  const { data: apiProjects = [], isLoading } = useSWR("projects", fetcher, {
    fallbackData: initialProjects,
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 30_000,
    keepPreviousData: true,
  });

  const loading = isLoading && apiProjects.length === 0;

  const typeOptions = [
    { value: "all", label: "All Types" },
    { value: "paper", label: "Research Paper" },
    { value: "repo", label: "GitHub Repo" },
    { value: "package", label: "Package" },
  ];

  const sectorOptions = allSectors.map((s) => ({ value: s, label: s }));

  // Combine static (demo) projects with API projects
  const allStaticProjects = [...trendingProjects, ...newProjects];

  const filterProjects = useCallback((list: CardProject[]) =>
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
    }), [typeFilter, sectorFilter, search]);

  const filteredApi = filterProjects(apiProjects);
  const filteredStatic = filterProjects(allStaticProjects);
  const noResults = filteredApi.length === 0 && filteredStatic.length === 0;

  return (
    <div className="px-8 pt-12 pb-20">
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

      {/* Traced Projects (from API) */}
      {(filteredApi.length > 0 || loading) && (
        <section className="mb-14">
          <div className="mb-5">
            <p className="text-[11px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-1.5">
              Traced by community
            </p>
            <h2 className="text-2xl font-bold tracking-tighter text-agentbase-text">
              Live Projects
            </h2>
          </div>
          {loading && filteredApi.length === 0 ? (
            <div className="flex items-center justify-center py-16 border border-agentbase-border bg-agentbase-card">
              <svg className="animate-spin h-5 w-5 text-agentbase-muted mr-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm text-agentbase-muted font-mono">Loading live projects...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredApi.map((project) => (
                <ProjectCard key={project.slug} project={project} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Static/Demo Projects */}
      {filteredStatic.length > 0 && (
        <section>
          <div className="mb-5">
            <p className="text-[11px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-1.5">
              Featured
            </p>
            <h2 className="text-2xl font-bold tracking-tighter text-agentbase-text">
              Demo Projects
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredStatic.map((project) => (
              <ProjectCard key={project.slug} project={project} />
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {noResults && !loading && (
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
