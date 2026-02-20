import type { Metadata } from "next";
import SubmitClient from "./SubmitClient";

export const metadata: Metadata = {
  title: "Donate — HoneyFlow",
  description:
    "Fund a project and watch the honey flow down through the full contribution graph.",
};

export default function DonatePage() {
  return <SubmitClient />;
}
