import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Footer from "@/components/layout/Footer";
import ProfileClient from "./ProfileClient";

interface Props {
  params: Promise<{ username: string }>;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function fetchProfile(username: string) {
  try {
    const res = await fetch(
      `${API_BASE}/users/${encodeURIComponent(username)}`,
      { next: { revalidate: 60 } },
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `${username} — HoneyFlow`,
    description: `View ${username}'s contributions and funding on HoneyFlow`,
  };
}

export default async function UserProfilePage({ params }: Props) {
  const { username } = await params;
  const profile = await fetchProfile(username);
  if (!profile) notFound();

  return (
    <>
      <main className="flex-col flex w-full flex-1">
        <ProfileClient profile={profile} />
      </main>
      <Footer />
    </>
  );
}
