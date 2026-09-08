"use client";

import { CORSI_DEFAULTS, type SequenceConfig } from "@/lib/engine/sequence";
import { SequencePlay, type SequenceBoardProps } from "@/components/games/sequence-play";
import { cx } from "@/components/ui";

/**
 * Corsi's nine blocks, in the irregular arrangement the test is defined with.
 *
 * The irregularity is the point: on a tidy 3x3 grid a player can recode the
 * sequence verbally ("top-left, middle, bottom-right") and solve a spatial task
 * with verbal memory, which is exactly what Corsi exists to avoid. Coordinates
 * are percentages of the board, matching the classic board layout.
 */
export const CORSI_BLOCKS: { x: number; y: number }[] = [
  { x: 16, y: 20 },
  { x: 48, y: 8 },
  { x: 80, y: 22 },
  { x: 10, y: 52 },
  { x: 38, y: 40 },
  { x: 68, y: 52 },
  { x: 22, y: 82 },
  { x: 52, y: 70 },
  { x: 84, y: 84 },
];

function Board({ state, onSelect, locked }: SequenceBoardProps) {
  const lit = state.phase === "presenting" && state.showing ? state.sequence[state.showIndex] : undefined;

  return (
    <div className="relative aspect-[4/3] w-full max-w-[min(92vw,32rem)] rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
      {CORSI_BLOCKS.map((block, i) => {
        const isLit = lit === i;
        const order = state.entry.indexOf(i);
        const tapped = order !== -1;

        return (
          <button
            key={i}
            type="button"
            disabled={locked}
            aria-label={`Block ${i + 1}`}
            onPointerDown={(e) => {
              e.preventDefault();
              onSelect(i);
            }}
            style={{ left: `${block.x}%`, top: `${block.y}%` }}
            className={cx(
              "absolute grid size-[17%] min-h-11 min-w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-xl border-2 transition-all duration-100 disabled:cursor-default",
              isLit
                ? "scale-110 border-[var(--accent)] bg-[var(--accent)] shadow-[var(--shadow-lg)]"
                : tapped
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                  : "border-[var(--border-strong)] bg-[var(--bg-subtle)]",
              !locked && !tapped && "hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] active:scale-95",
            )}
          >
            {tapped ? (
              <span className="tnum text-[13px] font-semibold text-[var(--accent)]">{order + 1}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function CorsiPlay() {
  return (
    <SequencePlay
      gameId="corsi"
      defaults={CORSI_DEFAULTS}
      renderBoard={(p) => <Board {...p} />}
      instructions={(config: SequenceConfig) => (
        <>
          <p>
            Blocks light up one after another. Tap them back
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
            The blocks are deliberately scattered — a tidy grid would let you describe the path in words
            instead of remembering it spatially.
          </p>
        </>
      )}
    />
  );
}
