import type { Metadata } from "next";
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

  const apiProject = await fetchProjectFromApi(slug);
  if (apiProject) {
    return {
      title: `${apiProject.name} — HoneyFlow`,
      description: apiProject.summary,
    };
  }

  return { title: "Loading — HoneyFlow" };
}

export default async function ProjectPage({ params }: Props) {
  const { slug } = await params;

  const apiProject = await fetchProjectFromApi(slug);

  return (
    <>
      <main className="flex-col flex w-full flex-1">
        <ProjectDetailClient project={apiProject} slug={slug} source="api" />
      </main>
      <Footer />
    </>
  );
}
