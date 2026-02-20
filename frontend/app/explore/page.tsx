import type { Metadata } from "next";
import Footer from "@/components/agentbase/Footer";
import ExploreClient from "./ExploreClient";

export const metadata: Metadata = {
  title: "Explore — HoneyFlow",
  description: "Discover and fund projects across the open-source ecosystem.",
};

export const revalidate = 60;

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function getProjects() {
  try {
    const res = await fetch(`${API_BASE}/projects`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.projects ?? [];
  } catch {
    return [];
  }
}

export default async function ExplorePage() {
  const initialProjects = await getProjects();

  return (
    <>
      <main className="flex-col flex w-full flex-1">
        <ExploreClient initialProjects={initialProjects} />
      </main>

      <Footer />
    </>
  );
}
