"use client";

import dynamic from "next/dynamic";
import type { GameId } from "@/lib/types";

/**
 * Play screens are loaded on demand. Each carries its own engine, and a player
 * opening one game has no reason to download the other six.
 */
const loading = () => (
  <div className="grid h-dvh place-items-center text-[13px] text-[var(--text-faint)]">Loading…</div>
);

const SCREENS: Record<GameId, React.ComponentType> = {
  "n-back": dynamic(() => import("@/components/games/nback-play").then((m) => m.NBackPlay), { loading }),
  "memory-span": dynamic(() => import("@/components/games/memory-span-play").then((m) => m.MemorySpanPlay), { loading }),
  corsi: dynamic(() => import("@/components/games/corsi-play").then((m) => m.CorsiPlay), { loading }),
  "complex-working-memory": dynamic(() => import("@/components/games/cwm-play").then((m) => m.CwmPlay), { loading }),
  pasat: dynamic(() => import("@/components/games/pasat-play").then((m) => m.PasatPlay), { loading }),
  "mental-math": dynamic(() => import("@/components/games/mental-math-play").then((m) => m.MentalMathPlay), { loading }),
  cryptogram: dynamic(() => import("@/components/games/cryptogram-play").then((m) => m.CryptogramPlay), { loading }),
  chalkboard: dynamic(() => import("@/components/games/chalkboard-play").then((m) => m.ChalkboardPlay), { loading }),
  "spatial-match": dynamic(() => import("@/components/games/spatial-match-play").then((m) => m.SpatialMatchPlay), { loading }),
  agility: dynamic(() => import("@/components/games/agility-play").then((m) => m.AgilityPlay), { loading }),
  "double-decision": dynamic(() => import("@/components/games/double-decision-play").then((m) => m.DoubleDecisionPlay), { loading }),
  hawkeye: dynamic(() => import("@/components/games/hawkeye-play").then((m) => m.HawkeyePlay), { loading }),
  decoder: dynamic(() => import("@/components/games/decoder-play").then((m) => m.DecoderPlay), { loading }),
  "perilous-path": dynamic(() => import("@/components/games/perilous-path-play").then((m) => m.PerilousPathPlay), { loading }),
  processing: dynamic(() => import("@/components/games/processing-play").then((m) => m.ProcessingPlay), { loading }),
  "error-locator": dynamic(() => import("@/components/games/error-locator-play").then((m) => m.ErrorLocatorPlay), { loading }),
  "turtle-traffic": dynamic(() => import("@/components/games/turtle-traffic-play").then((m) => m.TurtleTrafficPlay), { loading }),
};

export function PlayRouter({ gameId }: { gameId: GameId }) {
  const Screen = SCREENS[gameId];
  return <Screen />;
}
