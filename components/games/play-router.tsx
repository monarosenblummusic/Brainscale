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

const SCREENS: Partial<Record<GameId, React.ComponentType>> = {
  "n-back": dynamic(() => import("@/components/games/nback-play").then((m) => m.NBackPlay), { loading }),
};

export function PlayRouter({ gameId }: { gameId: GameId }) {
  const Screen = SCREENS[gameId];
  return Screen ? <Screen /> : null;
}
