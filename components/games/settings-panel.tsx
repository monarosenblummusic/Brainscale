"use client";

import dynamic from "next/dynamic";
import type { GameId } from "@/lib/types";

const skeleton = () => <div className="h-40 animate-pulse rounded-xl bg-[var(--bg-subtle)]" />;

const PANELS: Partial<Record<GameId, React.ComponentType>> = {
  "n-back": dynamic(() => import("@/components/games/nback-settings").then((m) => m.NBackSettings), { loading: skeleton }),
  "memory-span": dynamic(() => import("@/components/games/memory-span-settings").then((m) => m.MemorySpanSettings), { loading: skeleton }),
  corsi: dynamic(() => import("@/components/games/corsi-settings").then((m) => m.CorsiSettings), { loading: skeleton }),
  "complex-working-memory": dynamic(() => import("@/components/games/cwm-settings").then((m) => m.CwmSettings), { loading: skeleton }),
  pasat: dynamic(() => import("@/components/games/pasat-settings").then((m) => m.PasatSettings), { loading: skeleton }),
  "mental-math": dynamic(() => import("@/components/games/mental-math-settings").then((m) => m.MentalMathSettings), { loading: skeleton }),
  cryptogram: dynamic(() => import("@/components/games/cryptogram-settings").then((m) => m.CryptogramSettings), { loading: skeleton }),
};

export function GameSettingsPanel({ gameId }: { gameId: GameId }) {
  const Panel = PANELS[gameId];
  return Panel ? <Panel /> : null;
}
