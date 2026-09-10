import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard";

export const metadata: Metadata = {
  title: "BrainScale — Dual N-Back and brain training",
  description:
    "Seventeen science-backed exercises for working memory, attention, processing speed and reasoning. Free, no account needed, works offline.",
};

export default function Page() {
  return <Dashboard />;
}
