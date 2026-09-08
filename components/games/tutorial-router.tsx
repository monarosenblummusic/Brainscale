"use client";

import dynamic from "next/dynamic";
import type { GameId } from "@/lib/types";

const loading = () => <div className="p-8 text-[13px] text-[var(--text-faint)]">Loading…</div>;

const TUTORIALS: Partial<Record<GameId, React.ComponentType>> = {
  "n-back": dynamic(() => import("@/components/games/nback-tutorial").then((m) => m.NBackTutorial), { loading }),
  "memory-span": dynamic(() => import("@/components/games/generic-tutorial").then((m) => m.MemorySpanTutorial), { loading }),
  corsi: dynamic(() => import("@/components/games/generic-tutorial").then((m) => m.CorsiTutorial), { loading }),
};

export function TutorialRouter({ gameId }: { gameId: GameId }) {
  const Tutorial = TUTORIALS[gameId];
  return Tutorial ? <Tutorial /> : null;
}
