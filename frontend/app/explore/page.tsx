import type { Metadata } from "next";
import ExploreClient from "./ExploreClient";

export const metadata: Metadata = {
  title: "Explore Projects - SourceFund",
  description: "Discover and fund projects across the open-source ecosystem.",
};

export default function ExplorePage() {
  return <ExploreClient />;
}
