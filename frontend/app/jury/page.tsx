import type { Metadata } from "next";

import Footer from "@/components/layout/Footer";
import JuryClient from "./JuryClient";

export const metadata: Metadata = {
  title: "Human Jury — HoneyFlow",
  description:
    "Review randomized attribution questions, provide human judgment, and improve contribution graph quality.",
};

export default function JuryPage() {
  return (
    <>
      <main className="flex-col flex w-full flex-1">
        <JuryClient />
      </main>
      <Footer />
    </>
  );
}
