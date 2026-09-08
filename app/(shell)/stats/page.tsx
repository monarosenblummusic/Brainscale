import type { Metadata } from "next";
import { StatsView } from "@/components/stats-view";

export const metadata: Metadata = {
  title: "Statistics",
  description: "Your training history: streaks, best levels and progress over time for every exercise.",
};

export default function Page() {
  return <StatsView />;
}
