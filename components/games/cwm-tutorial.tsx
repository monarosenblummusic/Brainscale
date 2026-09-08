"use client";

import { useState } from "react";
import { GAME_BY_ID } from "@/lib/games";
import { createRng } from "@/lib/engine/rng";
import { GRID_CELLS, GRID_SIZE, PATTERN_SIZE, buildPattern } from "@/lib/engine/cwm";
import { playCue } from "@/lib/audio";
import { TutorialShell, type TutorialStep } from "@/components/games/tutorial-shell";
import { Button, cx } from "@/components/ui";

const GAME = GAME_BY_ID["complex-working-memory"];

/** A single symmetry judgement, answerable at leisure. */
function SymmetryDemo({ onAnswered }: { onAnswered?: () => void }) {
  const [round, setRound] = useState(0);
  const [answer, setAnswer] = useState<boolean | null>(null);

  const symmetric = round % 2 === 0;
  const cells = buildPattern(symmetric, createRng(20260908 + round));
  const correct = answer !== null && answer === symmetric;

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="grid aspect-square w-full max-w-[16rem] gap-px overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--border)]"
        style={{ gridTemplateColumns: `repeat(${PATTERN_SIZE}, minmax(0, 1fr))` }}
      >
        {cells.map((on, i) => (
          <div key={i} className={on ? "bg-[var(--text)]" : "bg-[var(--surface)]"} />
        ))}
      </div>

      {answer === null ? (
        <div className="flex w-full max-w-[16rem] gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => {
              setAnswer(false);
              playCue(!symmetric ? "correct" : "wrong");
              onAnswered?.();
            }}
          >
            Not symmetric
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={() => {
              setAnswer(true);
              playCue(symmetric ? "correct" : "wrong");
              onAnswered?.();
            }}
          >
            Symmetric
          </Button>
        </div>
      ) : (
        <div className="flex w-full max-w-[16rem] flex-col gap-2">
          <p
            className={cx(
              "rounded-lg px-3 py-2 text-center text-[13px] font-medium",
              correct ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--danger-soft)] text-[var(--danger)]",
            )}
          >
            {correct ? "Correct" : symmetric ? "It was symmetric" : "It was not symmetric"}
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              setRound((r) => r + 1);
              setAnswer(null);
            }}
          >
            Another pattern
          </Button>
        </div>
      )}
    </div>
  );
}

/** Show two cells in sequence, then take them back. */
function RecallDemo({ onComplete }: { onComplete?: () => void }) {
  const [cells] = useState(() => {
    const rng = createRng(31415);
    const a = rng.int(GRID_CELLS);
    let b = rng.int(GRID_CELLS);
    while (b === a) b = rng.int(GRID_CELLS);
    return [a, b];
  });
  const [step, setStep] = useState<"idle" | "show0" | "show1" | "answer" | "done">("idle");
  const [entry, setEntry] = useState<number[]>([]);

  const show = () => {
    setEntry([]);
    setStep("show0");
    setTimeout(() => setStep("show1"), 1150);
    setTimeout(() => setStep("answer"), 2300);
  };

  const lit = step === "show0" ? cells[0] : step === "show1" ? cells[1] : undefined;
  const correct = entry.length === 2 && entry[0] === cells[0] && entry[1] === cells[1];

  const tap = (i: number) => {
    if (step !== "answer") return;
    const next = [...entry, i];
    setEntry(next);
    if (next.length === 2) {
      setStep("done");
      playCue(next[0] === cells[0] && next[1] === cells[1] ? "correct" : "wrong");
      onComplete?.();
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="grid aspect-square w-full max-w-[16rem] gap-2"
        style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: GRID_CELLS }, (_, i) => {
          const order = entry.indexOf(i);
          const reveal = step === "done" ? cells.indexOf(i) : -1;
          return (
            <button
              key={i}
              type="button"
              disabled={step !== "answer"}
              aria-label={`Cell ${i + 1}`}
              onClick={() => tap(i)}
              className={cx(
                "grid place-items-center rounded-lg border-2 transition-all duration-100",
                lit === i
                  ? "scale-105 border-[var(--accent)] bg-[var(--accent)]"
                  : order !== -1
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                    : reveal !== -1
                      ? "border-[var(--success)] bg-[var(--success-soft)]"
                      : "border-[var(--border)] bg-[var(--surface)]",
              )}
            >
              {order !== -1 ? (
                <span className="tnum text-[12px] font-semibold text-[var(--accent)]">{order + 1}</span>
              ) : reveal !== -1 ? (
                <span className="tnum text-[12px] font-semibold text-[var(--success)]">{reveal + 1}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <p className="h-5 text-[13px] text-[var(--text-muted)]" aria-live="polite">
        {step === "answer"
          ? "Tap the two cells, in order"
          : step === "done"
            ? correct
              ? "Correct"
              : "The green cells show the order"
            : step === "idle"
              ? ""
              : "Watch"}
      </p>

      <Button variant={step === "idle" ? "primary" : "secondary"} onClick={show} disabled={step === "show0" || step === "show1"}>
        {step === "idle" ? "Show two cells" : "Try again"}
      </Button>
    </div>
  );
}

export function CwmTutorial() {
  const [judged, setJudged] = useState(false);
  const [recalled, setRecalled] = useState(false);

  const steps: TutorialStep[] = [
    {
      title: "Two tasks, alternating",
      body: (
        <>
          <p>
            This exercise interleaves two unrelated jobs. First you judge whether a pattern is symmetric
            about its vertical axis. Then a cell lights up and you have to remember it. Then another pattern,
            another cell, and so on.
          </p>
          <p className="mt-3">
            At the end of the block you recall the cells — in order.
          </p>
        </>
      ),
    },
    {
      title: "The symmetry judgement",
      body: (
        <>
          <p>
            Mirror the left half onto the right. If they match, it is symmetric. There is a time limit in the
            real task, so judge quickly rather than perfectly.
          </p>
          <p className="mt-3 text-[var(--text-muted)]">Try a couple.</p>
        </>
      ),
      demo: <SymmetryDemo onAnswered={() => setJudged(true)} />,
      requirement: { met: judged, label: "Judge one pattern to continue" },
    },
    {
      title: "The cells to remember",
      body: (
        <>
          <p>
            Between judgements, a cell in the four-by-four grid lights briefly. Remember which cell, and
            where it came in the order.
          </p>
          <p className="mt-3 text-[var(--text-muted)]">Two cells here. The real task starts at two and grows.</p>
        </>
      ),
      demo: <RecallDemo onComplete={() => setRecalled(true)} />,
      requirement: { met: recalled, label: "Recall one pair to continue" },
    },
    {
      title: "Why the interference matters",
      body: (
        <>
          <p>
            Doing either job alone is easy. Doing them alternately is not, and that is the entire point: the
            symmetry judgements occupy exactly the machinery you would otherwise use to rehearse the list of
            cells.
          </p>
          <p className="mt-3">
            This is why it is called a <em>complex</em> span. A simple span measures how much you can hold; a
            complex span measures how much you can hold <strong className="font-semibold">while something
            else is going on</strong>, which is closer to how the capacity actually gets used.
          </p>
          <p className="mt-4 text-[13px] text-[var(--text-faint)]">
            Both halves count. A block only promotes you if you recall every cell in order{" "}
            <em>and</em> got every symmetry judgement right. Two perfect blocks in a row move you up; two
            failed blocks move you down.
          </p>
        </>
      ),
    },
  ];

  return <TutorialShell game={GAME} steps={steps} />;
}
