import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProjectBySlug } from "@/lib/projects";
import Footer from "@/components/layout/Footer";
import ProjectDetailClient from "./ProjectDetailClient";

interface Props {
  params: Promise<{ slug: string }>;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function fetchProjectFromApi(slug: string) {
  try {
    const res = await fetch(`${API_BASE}/projects/${slug}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  // Try API first, then static
  const apiProject = await fetchProjectFromApi(slug);
  if (apiProject) {
    return {
      title: `${apiProject.name} — HoneyFlow`,
      description: apiProject.summary,
    };
  }

  const staticProject = getProjectBySlug(slug);
  if (staticProject) {
    return {
      title: `${staticProject.name} — HoneyFlow`,
      description: staticProject.summary,
    };
  }

  return { title: "Not Found — HoneyFlow" };
}

export default async function ProjectPage({ params }: Props) {
  const { slug } = await params;

  // Try API first
  const apiProject = await fetchProjectFromApi(slug);
  if (apiProject) {
    return (
      <>
        <main className="flex-col flex w-full flex-1">
          <ProjectDetailClient project={apiProject} source="api" />
        </main>
        <Footer />
      </>
    );
  }

  // Fall back to static data
  const staticProject = getProjectBySlug(slug);
  if (!staticProject) notFound();

  // Convert static project to API-compatible shape
  const project = {
    id: 0,
    slug: staticProject.slug,
    name: staticProject.name,
    category: staticProject.category,
    type: staticProject.type,
    summary: staticProject.summary,
    description: staticProject.description,
    source_url: "",
    raised: staticProject.raisedNumeric,
    contributors: staticProject.contributors,
    depth: staticProject.depth,
    graph_data: { nodes: [], edges: [] },
    attribution: {},
    dependencies: staticProject.dependencies,
    top_contributors: staticProject.topContributors,
    cover_image_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return (
    <>
      <main className="flex-col flex w-full flex-1">
        <ProjectDetailClient project={project} source="static" />
      </main>
      <Footer />
    </>
  );
}
