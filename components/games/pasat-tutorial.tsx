"use client";

import { useCallback, useRef, useState } from "react";
import { GAME_BY_ID } from "@/lib/games";
import { generateDigits } from "@/lib/engine/pasat";
import { playCue, speakNumber, unlockAudio } from "@/lib/audio";
import { TutorialShell, type TutorialStep } from "@/components/games/tutorial-shell";
import { Button, cx } from "@/components/ui";

const GAME = GAME_BY_ID["pasat"];

/**
 * A self-paced PASAT drill: the digits advance only when the player answers,
 * so the arithmetic rule can be learned before the clock is introduced.
 */
function PacedDemo({ paced, onComplete }: { paced: boolean; onComplete?: () => void }) {
  const [digits] = useState(() => generateDigits(9, 20260908));
  const [index, setIndex] = useState(0);
  const [entry, setEntry] = useState("");
  const [outcomes, setOutcomes] = useState<("correct" | "wrong")[]>([]);
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setRunning(false);
  }, []);

  const begin = () => {
    unlockAudio();
    setIndex(0);
    setEntry("");
    setOutcomes([]);
    setRunning(true);
    speakNumber(digits[0]!);

    if (paced) {
      timer.current = setInterval(() => {
        setIndex((i) => {
          const next = i + 1;
          if (next >= digits.length) {
            stop();
            onComplete?.();
            return i;
          }
          speakNumber(digits[next]!);
          setEntry("");
          return next;
        });
      }, 3000);
    }
  };

  const answer = (value: number) => {
    if (!running || index < 1) return;
    const next = entry + String(value);
    const expected = digits[index]! + digits[index - 1]!;

    if (next.length === 1 && next === "1") {
      setEntry(next);
      return;
    }

    const ok = Number(next) === expected;
    setOutcomes((o) => [...o, ok ? "correct" : "wrong"]);
    playCue(ok ? "correct" : "wrong");
    setEntry("");

    if (!paced) {
      const nextIndex = index + 1;
      if (nextIndex >= digits.length) {
        stop();
        onComplete?.();
      } else {
        setIndex(nextIndex);
        speakNumber(digits[nextIndex]!);
      }
    }
  };

  const correct = outcomes.filter((o) => o === "correct").length;

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="flex items-center gap-4">
        <span className="tnum grid size-14 place-items-center rounded-xl border border-[var(--border)] text-[24px] font-semibold text-[var(--text-faint)]">
          {index >= 1 ? digits[index - 1] : "·"}
        </span>
        <span className="text-[20px] text-[var(--text-faint)]">+</span>
        <span
          key={index}
          className="anim-flash tnum grid size-16 place-items-center rounded-xl border-2 border-[var(--accent)] bg-[var(--accent-soft)] text-[30px] font-semibold text-[var(--accent)]"
        >
          {running ? digits[index] : "?"}
        </span>
        <span className="text-[20px] text-[var(--text-faint)]">=</span>
        <span className="tnum grid size-16 place-items-center rounded-xl border border-[var(--border)] text-[26px] font-semibold">
          {entry || "—"}
        </span>
      </div>

      {running ? (
        <div className="grid w-full max-w-[18rem] grid-cols-5 gap-1.5">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => answer(d)}
              disabled={index < 1}
              className="tnum h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] font-semibold transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-30"
            >
              {d}
            </button>
          ))}
        </div>
      ) : null}

      <p className="h-5 text-[13px] text-[var(--text-muted)]" aria-live="polite">
        {running
          ? index === 0
            ? "No sum yet — wait for the second digit"
            : `${correct} of ${outcomes.length} correct`
          : outcomes.length > 0
            ? `Finished: ${correct} of ${outcomes.length} correct`
            : ""}
      </p>

      <Button variant={outcomes.length === 0 ? "primary" : "secondary"} onClick={begin} disabled={running}>
        {outcomes.length === 0 ? (paced ? "Start the paced run" : "Start the drill") : "Try again"}
      </Button>

      {running && paced ? (
        <p className="text-[12px] text-[var(--warning)]">A new digit arrives every 3 seconds whether or not you have answered</p>
      ) : null}
    </div>
  );
}

export function PasatTutorial() {
  const [drilled, setDrilled] = useState(false);

  const steps: TutorialStep[] = [
    {
      title: "Add each digit to the one before it",
      body: (
        <>
          <p>
            Digits arrive one at a time. Each time a new one appears, add it to the digit immediately before
            it and give that sum.
          </p>
          <div className="mt-4 rounded-xl bg-[var(--bg-subtle)] p-4">
            <p className="text-[13px] font-medium text-[var(--text-muted)]">Digits 3, 5, 2, 4 give:</p>
            <p className="tnum mt-2 text-[15px]">
              3 + 5 = <strong className="font-semibold">8</strong> · 5 + 2 ={" "}
              <strong className="font-semibold">7</strong> · 2 + 4 ={" "}
              <strong className="font-semibold">6</strong>
            </p>
          </div>
          <p className="mt-4 text-[var(--danger)]">
            Not 3, 8, 10, 14. A running total is the mistake everyone makes first.
          </p>
        </>
      ),
    },
    {
      title: "Try it without a clock",
      body: (
        <>
          <p>
            Here the next digit waits for you. Get the rule into your hands before the pacing goes on — the
            first digit has nothing before it, so there is no sum for it.
          </p>
        </>
      ),
      demo: <PacedDemo paced={false} onComplete={() => setDrilled(true)} />,
      requirement: { met: drilled, label: "Finish the drill to continue" },
    },
    {
      title: "Now with the clock",
      body: (
        <>
          <p>
            Same digits, but now one arrives every three seconds whether you are ready or not. This is the
            real task.
          </p>
          <p className="mt-3 text-[var(--text-muted)]">
            Notice what happens when you fall behind: the digit you needed is already gone, and the honest
            move is to drop that sum and rejoin on the next one. Chasing a missed answer costs you the two
            after it.
          </p>
        </>
      ),
      demo: <PacedDemo paced />,
    },
    {
      title: "What it feels like, and why",
      body: (
        <>
          <p>
            PASAT is reliably the most unpleasant task in any cognitive battery — it is used in research
            partly <em>because</em> it induces stress. If you find it disproportionately hard, that is the
            task working, not you failing.
          </p>
          <p className="mt-3">
            The pace adapts: above 85% accuracy the interval shortens, below 50% it lengthens. The four
            standard intervals are 3.0, 2.4, 2.0 and 1.6 seconds.
          </p>
          <p className="mt-4 text-[13px] text-[var(--text-faint)]">
            Short runs are enough. A few minutes of this is a genuine workout, and nobody benefits from
            grinding it.
          </p>
        </>
      ),
    },
  ];

  return <TutorialShell game={GAME} steps={steps} />;
}
