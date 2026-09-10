"use client";

import { CHALKBOARD_DEFAULTS, chalkboardEngine, type ChalkboardData, type Expression } from "@/lib/engine/chalkboard";
import type { SpeedTrialState } from "@/lib/engine/speed-trial";
import { SpeedTrialPlay, type TrialOption } from "@/components/games/speed-trial-play";

const OPTIONS: TrialOption[] = [
  { label: "Left", hint: "←", keys: ["arrowleft", "a"], grow: 3 },
  { label: "Equal", hint: "=", keys: ["=", "arrowdown", "s"], grow: 2 },
  { label: "Right", hint: "→", keys: ["arrowright", "d"], grow: 3 },
];

function Side({ expression, side }: { expression: Expression; side: "left" | "right" }) {
  return (
    <div
      className="flex flex-1 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-8 sm:py-12"
      aria-label={`${side} expression: ${expression.left} ${expression.op} ${expression.right}`}
    >
      <span className="tnum whitespace-nowrap text-[clamp(1.5rem,7vw,2.5rem)] font-semibold tracking-tight">
        {expression.left} {expression.op} {expression.right}
      </span>
    </div>
  );
}

function Board({ state }: { state: SpeedTrialState<ChalkboardData> }) {
  const { a, b } = state.problem.data;
  return (
    <div key={state.attempted} className="anim-flash flex w-full max-w-[min(94vw,32rem)] items-stretch gap-2.5">
      <Side expression={a} side="left" />
      <span className="self-center text-[15px] font-medium text-[var(--text-faint)]">vs</span>
      <Side expression={b} side="right" />
    </div>
  );
}

export function ChalkboardPlay() {
  return (
    <SpeedTrialPlay<ChalkboardData>
      gameId="chalkboard"
      engine={chalkboardEngine}
      defaults={CHALKBOARD_DEFAULTS}
      options={OPTIONS}
      renderBoard={(state) => <Board state={state} />}
      instructions={
        <>
          <p>
            Two expressions. Tap the side with the{" "}
            <strong className="font-semibold text-[var(--text)]">greater</strong> value — or Equal if they
            match.
          </p>
          <p className="mt-3 text-[13px] text-[var(--text-faint)]">
            The two sides are always close, so you have to work one out and hold it while you do the other.
            Five in a row raises your multiplier.
          </p>
        </>
      }
    />
  );
}
