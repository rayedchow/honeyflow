import type { Metadata } from "next";
import Footer from "@/components/agentbase/Footer";
import ExploreClient from "./ExploreClient";

export const metadata: Metadata = {
  title: "Explore — HoneyFlow",
  description: "Discover and fund projects across the open-source ecosystem.",
};

export default function ExplorePage() {
  return (
    <>
      <main className="flex-col flex w-full flex-1">
        <ExploreClient />
      </main>

      <Footer />
    </>
  );
}
