"use client";

import { DOUBLE_DECISION_DEFAULTS } from "@/lib/engine/flash-field";
import { FlashFieldPlay } from "@/components/games/flash-field-play";

export function DoubleDecisionPlay() {
  return (
    <FlashFieldPlay
      gameId="double-decision"
      defaults={DOUBLE_DECISION_DEFAULTS}
      targetName="road sign"
      instructions={
        <>
          <p>
            Keep your eyes on the dot in the centre and{" "}
            <strong className="font-semibold text-[var(--text)]">do not look around</strong>.
          </p>
          <p className="mt-3">
            A vehicle flashes in the middle while a road sign flashes out at the edge, among plain circles.
            Say which vehicle it was, then tap where the sign appeared.
          </p>
          <p className="mt-3 text-[13px] text-[var(--text-faint)]">
            Both halves have to be right. That is deliberate — you cannot answer the centre if your eyes have
            left it, which is what forces the edge to be seen without looking at it.
          </p>
        </>
      }
    />
  );
}
