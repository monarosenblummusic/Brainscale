"use client";

import { MEMORY_SPAN_DEFAULTS, type SequenceConfig } from "@/lib/engine/sequence";
import { SequencePlay, type SequenceBoardProps } from "@/components/games/sequence-play";
import { cx } from "@/components/ui";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function itemLabel(value: number, alphabet: number): string {
  return alphabet === 26 ? LETTERS[value]! : String(value);
}

/** The stimulus display and the keypad the answer is entered on. */
function Board({ state, onSelect, locked }: SequenceBoardProps) {
  const { config } = state;
  const presenting = state.phase === "presenting";
  const current = presenting && state.showing ? state.sequence[state.showIndex] : undefined;

  return (
    <div className="flex w-full max-w-[min(92vw,26rem)] flex-col items-center gap-6">
      {/* Stimulus window. Fixed height so the keypad never shifts. */}
      <div className="grid h-32 w-full place-items-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] sm:h-40">
        {current !== undefined ? (
          <span key={`${state.showIndex}-${current}`} className="anim-flash tnum text-[clamp(3rem,16vw,5rem)] font-semibold leading-none">
            {itemLabel(current, config.alphabet)}
          </span>
        ) : state.phase === "responding" ? (
          <span className="tnum flex flex-wrap items-center justify-center gap-2 px-4 text-[clamp(1.5rem,8vw,2.5rem)] font-semibold leading-none">
            {state.entry.length === 0 ? (
              <span className="text-[15px] font-normal text-[var(--text-faint)]">
                Enter {state.sequence.length} {config.alphabet === 26 ? "letters" : "digits"}
                {config.direction === "reverse" ? ", in reverse" : ""}
              </span>
            ) : (
              state.entry.map((v, i) => <span key={i}>{itemLabel(v, config.alphabet)}</span>)
            )}
          </span>
        ) : null}
      </div>

      {/* Keypad */}
      <div
        className={cx(
          "grid w-full gap-2",
          config.alphabet === 26 ? "grid-cols-6 sm:grid-cols-7" : "grid-cols-3",
        )}
      >
        {Array.from({ length: config.alphabet }, (_, i) => {
          // A ten-digit keypad reads 1-9 then 0, like a phone, not 0-9.
          const value = config.alphabet === 10 ? (i + 1) % 10 : i;
          return (
            <button
              key={value}
              type="button"
              disabled={locked}
              onPointerDown={(e) => {
                e.preventDefault();
                onSelect(value);
              }}
              className={cx(
                "tnum rounded-xl border border-[var(--border)] bg-[var(--surface)] font-semibold transition-all active:scale-[0.97] disabled:opacity-30",
                config.alphabet === 26 ? "h-11 text-[15px]" : "h-14 text-[20px] sm:h-16 sm:text-[22px]",
                !locked && "hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]",
              )}
            >
              {itemLabel(value, config.alphabet)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function MemorySpanPlay() {
  return (
    <SequencePlay
      gameId="memory-span"
      defaults={MEMORY_SPAN_DEFAULTS}
      renderBoard={(p) => <Board {...p} />}
      instructions={(config: SequenceConfig) => (
        <>
          <p>
            {config.alphabet === 26 ? "Letters" : "Digits"} appear one at a time. Type them back
            {config.direction === "reverse" ? (
              <>
                {" "}
                in <strong className="font-semibold text-[var(--text)]">reverse</strong> order.
              </>
            ) : (
              " in the same order."
            )}
          </p>
          <p className="mt-3 text-[13px] text-[var(--text-faint)]">
            Each success adds one item. Two failures at the same length end the run.
          </p>
        </>
      )}
    />
  );
}
