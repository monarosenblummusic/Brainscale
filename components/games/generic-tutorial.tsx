"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GAME_BY_ID } from "@/lib/games";
import { generateSequence } from "@/lib/engine/sequence";
import { playCue } from "@/lib/audio";
import { CORSI_BLOCKS } from "@/components/games/corsi-play";
import { TutorialShell, type TutorialStep } from "@/components/games/tutorial-shell";
import { Button, cx } from "@/components/ui";

/**
 * A self-paced span demo: present a short sequence, then take it back.
 *
 * Like the n-back tutorial this deliberately does not use the real engine — the
 * player needs to replay the presentation on demand and see the answer, neither
 * of which the scored task allows.
 */
function SpanDemo({
  length,
  alphabet,
  reverse,
  variant,
  onComplete,
}: {
  length: number;
  alphabet: number;
  reverse: boolean;
  variant: "digits" | "blocks";
  onComplete?: () => void;
}) {
  const [sequence] = useState(() => generateSequence(length, alphabet, variant === "digits", 20260908 + length));
  const [showIndex, setShowIndex] = useState(-1);
  const [phase, setPhase] = useState<"idle" | "showing" | "answering" | "done">("idle");
  const [entry, setEntry] = useState<number[]>([]);
  const [correct, setCorrect] = useState<boolean | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  const present = useCallback(() => {
    clearTimers();
    setEntry([]);
    setCorrect(null);
    setPhase("showing");

    const showMs = 800;
    const gapMs = 400;
    sequence.forEach((_, i) => {
      timers.current.push(setTimeout(() => setShowIndex(i), i * (showMs + gapMs)));
      timers.current.push(setTimeout(() => setShowIndex(-1), i * (showMs + gapMs) + showMs));
    });
    timers.current.push(
      setTimeout(() => {
        setShowIndex(-1);
        setPhase("answering");
      }, sequence.length * (showMs + gapMs)),
    );
  }, [sequence]);

  const select = (value: number) => {
    if (phase !== "answering") return;
    const next = [...entry, value];
    setEntry(next);
    if (next.length === sequence.length) {
      const expected = reverse ? [...sequence].reverse() : sequence;
      const ok = next.every((v, i) => v === expected[i]);
      setCorrect(ok);
      setPhase("done");
      playCue(ok ? "correct" : "wrong");
      onComplete?.();
    }
  };

  const expected = reverse ? [...sequence].reverse() : sequence;
  const label = (v: number) => (variant === "digits" ? String(v) : `Block ${v + 1}`);

  return (
    <div className="flex flex-col items-center gap-5">
      {variant === "digits" ? (
        <div className="grid h-28 w-full max-w-sm place-items-center rounded-2xl border border-[var(--border)] bg-[var(--bg-subtle)]">
          {showIndex >= 0 ? (
            <span key={showIndex} className="anim-flash tnum text-[3.5rem] font-semibold leading-none">
              {sequence[showIndex]}
            </span>
          ) : phase === "answering" ? (
            <span className="tnum text-[2rem] font-semibold">
              {entry.length === 0 ? (
                <span className="text-[14px] font-normal text-[var(--text-faint)]">
                  Type the {length} digits{reverse ? ", in reverse" : ""}
                </span>
              ) : (
                entry.join(" ")
              )}
            </span>
          ) : phase === "done" ? (
            <span className={cx("text-[15px] font-medium", correct ? "text-[var(--success)]" : "text-[var(--danger)]")}>
              {correct ? "Correct" : `The answer was ${expected.join(" ")}`}
            </span>
          ) : (
            <span className="text-[14px] text-[var(--text-faint)]">Press play to see the sequence</span>
          )}
        </div>
      ) : (
        <div className="relative aspect-[4/3] w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-subtle)]">
          {CORSI_BLOCKS.map((b, i) => {
            const isLit = showIndex >= 0 && sequence[showIndex] === i;
            const order = entry.indexOf(i);
            return (
              <button
                key={i}
                type="button"
                disabled={phase !== "answering"}
                aria-label={`Block ${i + 1}`}
                onClick={() => select(i)}
                style={{ left: `${b.x}%`, top: `${b.y}%` }}
                className={cx(
                  "absolute grid size-[17%] min-h-11 min-w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-xl border-2 transition-all duration-100",
                  isLit
                    ? "scale-110 border-[var(--accent)] bg-[var(--accent)]"
                    : order !== -1
                      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                      : "border-[var(--border-strong)] bg-[var(--surface)]",
                  phase === "answering" && order === -1 && "hover:border-[var(--accent)]",
                )}
              >
                {order !== -1 ? (
                  <span className="tnum text-[13px] font-semibold text-[var(--accent)]">{order + 1}</span>
                ) : null}
              </button>
            );
          })}
          {phase === "done" ? (
            <div
              className={cx(
                "absolute inset-x-0 bottom-2 mx-auto w-fit rounded-lg px-3 py-1.5 text-[13px] font-medium",
                correct ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--danger-soft)] text-[var(--danger)]",
              )}
            >
              {correct ? "Correct" : `The order was ${expected.map((v) => v + 1).join(" → ")}`}
            </div>
          ) : null}
        </div>
      )}

      {variant === "digits" && phase === "answering" ? (
        <div className="grid w-full max-w-sm grid-cols-5 gap-2">
          {Array.from({ length: 10 }, (_, i) => (i + 1) % 10).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => select(v)}
              className="tnum h-12 rounded-xl border border-[var(--border)] bg-[var(--surface)] font-semibold transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
            >
              {label(v)}
            </button>
          ))}
        </div>
      ) : null}

      <Button variant={phase === "idle" ? "primary" : "secondary"} onClick={present} disabled={phase === "showing"}>
        {phase === "idle" ? "Show the sequence" : phase === "showing" ? "Watching…" : "Show it again"}
      </Button>
    </div>
  );
}

export function MemorySpanTutorial() {
  const [done, setDone] = useState(false);
  const game = GAME_BY_ID["memory-span"];

  const steps: TutorialStep[] = [
    {
      title: "Watch, then repeat",
      body: (
        <>
          <p>
            Digits appear one at a time. When the sequence ends, type it back in the same order. That is the
            whole task.
          </p>
          <p className="mt-3 text-[var(--text-muted)]">
            Try four digits. You can replay the sequence as many times as you like here — the real task shows
            it once.
          </p>
        </>
      ),
      demo: <SpanDemo length={4} alphabet={10} reverse={false} variant="digits" onComplete={() => setDone(true)} />,
      requirement: { met: done, label: "Finish one sequence to continue" },
    },
    {
      title: "Reverse is a different task",
      body: (
        <>
          <p>
            In reverse mode you type the sequence backwards. This sounds like a small change and is not: you
            can no longer answer as the digits arrive, so the whole sequence has to be held and then re-read
            from the other end.
          </p>
          <p className="mt-3 text-[var(--text-muted)]">
            Most people score one to two items lower in reverse. That gap is the difference between storing
            information and manipulating it.
          </p>
        </>
      ),
      demo: <SpanDemo length={4} alphabet={10} reverse variant="digits" />,
    },
    {
      title: "How the run ends",
      body: (
        <>
          <p>Each correct sequence adds one digit. The run ends after two failures at the same length.</p>
          <p className="mt-3">
            Your score is the <strong className="font-semibold">longest sequence you got right</strong>, not
            how many you attempted. Most adults land between five and nine forward.
          </p>
          <p className="mt-3 text-[13px] text-[var(--text-faint)]">
            Chunking is not cheating — reading 4 7 1 9 as &ldquo;forty-seven, nineteen&rdquo; is a real
            strategy and it is how people push past seven.
          </p>
        </>
      ),
    },
  ];

  return <TutorialShell game={game} steps={steps} />;
}

export function CorsiTutorial() {
  const [done, setDone] = useState(false);
  const game = GAME_BY_ID["corsi"];

  const steps: TutorialStep[] = [
    {
      title: "Watch the blocks, tap them back",
      body: (
        <>
          <p>
            Blocks light up one after another. When the sequence ends, tap them in the same order.
          </p>
          <p className="mt-3 text-[var(--text-muted)]">
            Try three. Replay it as often as you like — the real task shows each sequence once.
          </p>
        </>
      ),
      demo: <SpanDemo length={3} alphabet={9} reverse={false} variant="blocks" onComplete={() => setDone(true)} />,
      requirement: { met: done, label: "Finish one sequence to continue" },
    },
    {
      title: "Why the blocks are scattered",
      body: (
        <>
          <p>
            The arrangement is deliberately irregular. On a neat three-by-three grid you could describe the
            path in words — &ldquo;top-left, centre, bottom-right&rdquo; — and solve a spatial problem with
            verbal memory.
          </p>
          <p className="mt-3">
            Scattering the blocks makes that description unwieldy enough that you fall back on remembering the
            <em> shape</em> of the path instead. That is the capacity this test is aimed at.
          </p>
        </>
      ),
    },
    {
      title: "How the run ends",
      body: (
        <>
          <p>Each correct sequence adds one block. Two failures at the same length end the run.</p>
          <p className="mt-3">
            Your block span is the longest sequence you reproduced correctly. Five to seven is the typical
            adult range — and it usually runs a little lower than digit span, which is expected rather than a
            sign of anything.
          </p>
        </>
      ),
    },
  ];

  return <TutorialShell game={game} steps={steps} />;
}
