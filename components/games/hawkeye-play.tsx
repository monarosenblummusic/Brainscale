"use client";

import { HAWKEYE_DEFAULTS } from "@/lib/engine/flash-field";
import { FlashFieldPlay } from "@/components/games/flash-field-play";

export function HawkeyePlay() {
  return (
    <FlashFieldPlay
      gameId="hawkeye"
      defaults={HAWKEYE_DEFAULTS}
      targetName="birds"
      instructions={
        <>
          <p>Keep your eyes on the centre dot. Birds flash across the field, then vanish.</p>
          <p className="mt-3">Tap every place you saw one.</p>
          <p className="mt-3 text-[13px] text-[var(--text-faint)]">
            The flash is far too short to search in, so do not try — let the whole field land at once.
          </p>
        </>
      }
    />
  );
}
