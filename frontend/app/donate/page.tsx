import type { Metadata } from "next";
import DonateClient from "./DonateClient";

export const metadata: Metadata = {
  title: "Donate — HoneyFlow",
  description:
    "Fund a project and watch the honey flow down through the full contribution graph.",
};

export default function DonatePage() {
  return (
    <main className="flex-col flex w-full flex-1">
      <DonateClient />
    </main>
  );
}
