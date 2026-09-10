"use client";

import { AGILITY_DEFAULTS, agilityEngine, type AgilityData } from "@/lib/engine/agility";
import type { SpeedTrialState } from "@/lib/engine/speed-trial";
import { SpeedTrialPlay, type TrialOption } from "@/components/games/speed-trial-play";

const OPTIONS: TrialOption[] = [
  { label: "False", hint: "←", keys: ["arrowleft", "a", "f"] },
  { label: "True", hint: "→", keys: ["arrowright", "d", "t"] },
];

function Board({ state }: { state: SpeedTrialState<AgilityData> }) {
  const { text, kind } = state.problem.data;
  return (
    <div
      key={state.attempted}
      className="anim-flash flex w-full max-w-[min(92vw,30rem)] items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-6 py-10 text-center sm:py-14"
    >
      <p
        className={
          kind === "equation"
            ? "tnum text-[clamp(1.75rem,8vw,2.75rem)] font-semibold tracking-tight"
            : "text-[clamp(1.05rem,4.4vw,1.5rem)] font-medium leading-snug"
        }
      >
        {text}
      </p>
    </div>
  );
}

export function AgilityPlay() {
  return (
    <SpeedTrialPlay<AgilityData>
      gameId="agility"
      engine={agilityEngine}
      defaults={AGILITY_DEFAULTS}
      options={OPTIONS}
      renderBoard={(state) => <Board state={state} />}
      instructions={
        <>
          <p>Decide whether each statement is true or false, before the bar empties.</p>
          <p className="mt-3 text-[13px] text-[var(--text-faint)]">
            Some are phrased to invite the wrong answer — watch for a negation in the middle of a sentence.
            Read what is written, not what you expect.
          </p>
        </>
      }
    />
  );
}
