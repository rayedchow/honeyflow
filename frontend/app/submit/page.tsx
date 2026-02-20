import type { Metadata } from "next";
import SubmitClient from "./SubmitClient";

export const metadata: Metadata = {
  title: "Submit & Analyze - SourceFund",
  description:
    "Upload a research paper or GitHub repo to trace every contribution and map the attribution graph.",
};

export default function SubmitPage() {
  return <SubmitClient />;
}
