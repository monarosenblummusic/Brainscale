"use client";

import {
  MATCH_CELLS,
  MATCH_GRID,
  SPATIAL_MATCH_DEFAULTS,
  spatialMatchEngine,
  type SpatialData,
} from "@/lib/engine/spatial-match";
import type { SpeedTrialState } from "@/lib/engine/speed-trial";
import { SpeedTrialPlay, type TrialOption } from "@/components/games/speed-trial-play";

const OPTIONS: TrialOption[] = [
  { label: "No match", hint: "←", keys: ["arrowleft", "a", "n"] },
  { label: "Match", hint: "→", keys: ["arrowright", "d", "y", "l"] },
];

const PATHS: Record<string, string> = {
  triangle: "M50 12 88 82H12Z",
  square: "M16 16h68v68H16Z",
  diamond: "M50 8 92 50 50 92 8 50Z",
  hexagon: "M50 8 88 29v42L50 92 12 71V29Z",
  arrow: "M50 10 84 50H64v40H36V50H16Z",
  chevron: "M20 20 50 50 20 80h22l30-30-30-30Z",
};

function Board({ state }: { state: SpeedTrialState<SpatialData> }) {
  const { shape, rotation, cell, isFirst } = state.problem.data;

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="h-5 text-[13px] text-[var(--text-muted)]" aria-live="polite">
        {isFirst ? "First shape — nothing to compare yet" : "Same as the one before?"}
      </p>
      <div
        key={state.attempted}
        className="anim-flash grid aspect-square w-full max-w-[min(72vw,20rem)] gap-2"
        style={{ gridTemplateColumns: `repeat(${MATCH_GRID}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: MATCH_CELLS }, (_, i) => (
          <div
            key={i}
            className="grid place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] p-[12%]"
          >
            {i === cell ? (
              <svg
                viewBox="0 0 100 100"
                className="size-full"
                style={{ transform: `rotate(${rotation * 90}deg)` }}
                role="img"
                aria-label={`${shape}, rotated ${rotation * 90} degrees`}
              >
                <path d={PATHS[shape] ?? PATHS.square!} fill="var(--accent)" />
              </svg>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SpatialMatchPlay() {
  return (
    <SpeedTrialPlay<SpatialData>
      gameId="spatial-match"
      engine={spatialMatchEngine}
      defaults={SPATIAL_MATCH_DEFAULTS}
      options={OPTIONS}
      renderBoard={(state) => <Board state={state} />}
      instructions={
        <>
          <p>
            Does this shape match the one shown{" "}
            <strong className="font-semibold text-[var(--text)]">immediately before it</strong>? Form,
            rotation and position all have to agree.
          </p>
          <p className="mt-3 text-[13px] text-[var(--text-faint)]">
            Early on only the shape changes. Rotation and position start varying as you climb.
          </p>
        </>
      }
    />
  );
}
