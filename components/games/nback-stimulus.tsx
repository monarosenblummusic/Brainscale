"use client";

import { COLOR_VARS, SHAPES, type Modality, type TrialStimulus } from "@/lib/engine/nback";
import { cx } from "@/components/ui";

/**
 * The 3x3 grid and the stimulus inside it.
 *
 * When colour is not one of the active modalities the square stays neutral —
 * showing a varying colour that the player is not being asked about would be a
 * distractor the paradigm does not call for.
 */
export function NBackGrid({
  stimulus,
  visible,
  modalities,
  shapeRedundancy,
}: {
  stimulus: TrialStimulus | null;
  visible: boolean;
  modalities: Modality[];
  shapeRedundancy: boolean;
}) {
  const showColor = modalities.includes("color");
  const showShape = modalities.includes("shape");
  const showPosition = modalities.includes("position");

  const fill = showColor && stimulus ? `var(${COLOR_VARS[stimulus.color % COLOR_VARS.length]})` : "var(--accent)";
  const shape = showShape && stimulus ? SHAPES[stimulus.shape % SHAPES.length]! : "square";

  // With position off there is nothing spatial to show, so the stimulus sits
  // in the centre cell and the grid lines come off.
  const activeCell = showPosition && stimulus ? stimulus.position : 4;

  return (
    <div
      className="grid aspect-square w-full max-w-[min(78vw,26rem)] grid-cols-3 gap-2 sm:gap-2.5"
      role="img"
      aria-label={visible ? "Stimulus shown" : "Blank"}
    >
      {Array.from({ length: 9 }, (_, i) => {
        const filled = visible && stimulus !== null && i === activeCell;
        return (
          <div
            key={i}
            className={cx(
              "relative rounded-xl transition-colors duration-100",
              showPosition
                ? "border border-[var(--border)] bg-[var(--surface)]"
                : "border-transparent bg-transparent",
            )}
          >
            {filled ? (
              <StimulusMark
                shape={showShape ? shape : "square"}
                color={fill}
                showShape={showShape || shapeRedundancy}
                colorIndex={stimulus.color}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function StimulusMark({
  shape,
  color,
  showShape,
  colorIndex,
}: {
  shape: string;
  color: string;
  showShape: boolean;
  colorIndex: number;
}) {
  // Shape redundancy: when the player has asked for it, colour is also carried
  // by a distinct outline shape, so a colour-blind player is not guessing.
  const glyph = showShape ? shape : REDUNDANT_SHAPES[colorIndex % REDUNDANT_SHAPES.length]!;

  return (
    <div className="anim-flash absolute inset-0 grid place-items-center p-[8%]">
      <ShapeSvg name={glyph} color={color} />
    </div>
  );
}

const REDUNDANT_SHAPES = ["circle", "square", "triangle", "diamond", "hexagon", "star"] as const;

export function ShapeSvg({ name, color, className = "size-full" }: { name: string; color: string; className?: string }) {
  const p = { viewBox: "0 0 100 100", className, "aria-hidden": true as const };
  switch (name) {
    case "circle":
      return <svg {...p}><circle cx="50" cy="50" r="46" fill={color} /></svg>;
    case "triangle":
      return <svg {...p}><path d="M50 6 96 92H4Z" fill={color} /></svg>;
    case "diamond":
      return <svg {...p}><path d="M50 3 97 50 50 97 3 50Z" fill={color} /></svg>;
    case "hexagon":
      return <svg {...p}><path d="M50 4 91 27v46L50 96 9 73V27Z" fill={color} /></svg>;
    case "star":
      return <svg {...p}><path d="m50 4 13 30 33 3-25 22 8 32-29-17-29 17 8-32L4 37l33-3Z" fill={color} /></svg>;
    case "cross":
      return <svg {...p}><path d="M36 4h28v32h32v28H64v32H36V64H4V36h32Z" fill={color} /></svg>;
    case "heart":
      return <svg {...p}><path d="M50 92C22 72 6 55 6 36a24 24 0 0 1 44-13A24 24 0 0 1 94 36c0 19-16 36-44 56Z" fill={color} /></svg>;
    default:
      return <svg {...p}><rect x="4" y="4" width="92" height="92" rx="12" fill={color} /></svg>;
  }
}

/* --------------------------------------------------------- Response buttons */

export function ResponseButtons({
  modalities,
  keys,
  responded,
  feedback,
  onRespond,
  disabled,
}: {
  modalities: Modality[];
  keys: Record<Modality, string>;
  responded: Partial<Record<Modality, boolean>>;
  feedback: Partial<Record<Modality, "hit" | "falseAlarm">>;
  onRespond: (m: Modality) => void;
  disabled: boolean;
}) {
  const LABEL: Record<Modality, string> = {
    position: "Position",
    audio: "Audio",
    color: "Colour",
    shape: "Shape",
  };

  return (
    <div
      className={cx(
        "grid w-full max-w-[min(92vw,32rem)] gap-2.5",
        modalities.length === 1 ? "grid-cols-1" : modalities.length === 3 ? "grid-cols-3" : "grid-cols-2",
      )}
    >
      {modalities.map((m) => {
        const fb = feedback[m];
        return (
          <button
            key={m}
            type="button"
            disabled={disabled}
            onPointerDown={(e) => {
              // Respond on press, not on click: the gap between pointerdown and
              // click is real time inside a 3-second trial.
              e.preventDefault();
              onRespond(m);
            }}
            className={cx(
              "flex h-[4.25rem] flex-col items-center justify-center gap-1 rounded-2xl border text-[13px] font-medium transition-all active:scale-[0.97] disabled:opacity-40 sm:h-[4.75rem]",
              fb === "hit"
                ? "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]"
                : fb === "falseAlarm"
                  ? "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]"
                  : responded[m]
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-subtle)]",
            )}
          >
            <span>{LABEL[m]}</span>
            <span className="text-[11px] uppercase tracking-wide opacity-60">{keys[m]}</span>
          </button>
        );
      })}
    </div>
  );
}
