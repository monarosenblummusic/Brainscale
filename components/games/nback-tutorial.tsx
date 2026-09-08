"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GAME_BY_ID } from "@/lib/games";
import { generateTrials, isTarget, type TrialStimulus } from "@/lib/engine/nback";
import { playCue, playStimulus, unlockAudio } from "@/lib/audio";
import { NBackGrid } from "@/components/games/nback-stimulus";
import { TutorialShell, type TutorialStep } from "@/components/games/tutorial-shell";
import { Button, Kbd, cx } from "@/components/ui";

const GAME = GAME_BY_ID["n-back"];

/**
 * A hand-stepped n-back drill.
 *
 * Deliberately not driven by the real engine: here the player advances trial by
 * trial at their own pace and can see the answer, which is the opposite of what
 * the engine is for. Reusing it would mean bolting a "wait for me" mode onto a
 * timing-critical state machine to serve a screen nobody plays twice.
 */
function ManualDrill({
  n,
  withAudio,
  onComplete,
}: {
  n: number;
  withAudio: boolean;
  onComplete?: (correct: number, total: number) => void;
}) {
  const [trials] = useState<TrialStimulus[]>(() =>
    generateTrials(n, 10, withAudio ? ["position", "audio"] : ["position"], 20260908),
  );
  const [index, setIndex] = useState(-1);
  const [answers, setAnswers] = useState<("correct" | "wrong" | "skipped")[]>([]);
  const [revealed, setRevealed] = useState(false);
  const doneRef = useRef(false);

  const started = index >= 0;
  const finished = index >= trials.length;
  const current = started && !finished ? trials[index]! : null;
  const canBeTarget = index >= n;

  useEffect(() => {
    if (!current || !withAudio) return;
    playStimulus(current.audio, "speech");
  }, [current, withAudio]);

  useEffect(() => {
    if (finished && !doneRef.current) {
      doneRef.current = true;
      const correct = answers.filter((a) => a === "correct").length;
      onComplete?.(correct, answers.length);
    }
  }, [finished, answers, onComplete]);

  const advance = useCallback(() => {
    setRevealed(false);
    setIndex((i) => i + 1);
  }, []);

  const answer = useCallback(
    (said: boolean) => {
      if (!current || revealed) return;
      const truth = isTarget(trials, index, n, "position");
      const correct = said === truth;
      playCue(correct ? "correct" : "wrong");
      setAnswers((a) => [...a, correct ? "correct" : "wrong"]);
      setRevealed(true);
    },
    [current, revealed, trials, index, n],
  );

  if (!started) {
    return (
      <div className="text-center">
        <Button
          variant="primary"
          size="lg"
          onClick={() => {
            unlockAudio();
            setIndex(0);
          }}
        >
          Begin the drill
        </Button>
      </div>
    );
  }

  if (finished) {
    const correct = answers.filter((a) => a === "correct").length;
    return (
      <div className="rounded-xl bg-[var(--bg-subtle)] p-5 text-center">
        <p className="tnum text-[22px] font-semibold">
          {correct} / {answers.length}
        </p>
        <p className="mt-1 text-[13px] text-[var(--text-muted)]">
          {correct === answers.length
            ? "Perfect. That is exactly the judgement the real task asks for, only faster."
            : "That is normal. The point is that you now know what the question is."}
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-4"
          onClick={() => {
            doneRef.current = false;
            setAnswers([]);
            setIndex(0);
            setRevealed(false);
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  const truth = isTarget(trials, index, n, "position");

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="flex w-full items-center justify-between text-[13px] text-[var(--text-muted)]">
        <span className="tnum">
          Trial {index + 1} of {trials.length}
        </span>
        {!canBeTarget ? (
          <span className="text-[var(--text-faint)]">Nothing {n} back yet — just watch</span>
        ) : null}
      </div>

      <NBackGrid
        stimulus={current}
        visible
        modalities={withAudio ? ["position", "audio"] : ["position"]}
        shapeRedundancy={false}
      />

      {revealed ? (
        <div
          className={cx(
            "w-full rounded-xl px-4 py-3 text-center text-[13.5px] font-medium",
            answers[answers.length - 1] === "correct"
              ? "bg-[var(--success-soft)] text-[var(--success)]"
              : "bg-[var(--danger-soft)] text-[var(--danger)]",
          )}
        >
          {truth
            ? `Match — this square is in the same place as ${n} trial${n === 1 ? "" : "s"} ago.`
            : `No match — ${n} trial${n === 1 ? "" : "s"} ago the square was elsewhere.`}
        </div>
      ) : null}

      <div className="flex w-full gap-2.5">
        {revealed ? (
          <Button variant="primary" size="lg" className="flex-1" onClick={advance} autoFocus>
            {index + 1 >= trials.length ? "See how you did" : "Next trial"}
          </Button>
        ) : canBeTarget ? (
          <>
            <Button variant="secondary" size="lg" className="flex-1" onClick={() => answer(false)}>
              No match
            </Button>
            <Button variant="primary" size="lg" className="flex-1" onClick={() => answer(true)}>
              Match
            </Button>
          </>
        ) : (
          <Button variant="primary" size="lg" className="flex-1" onClick={advance}>
            Next trial
          </Button>
        )}
      </div>
    </div>
  );
}

export function NBackTutorial() {
  const [drill1, setDrill1] = useState(false);

  const steps: TutorialStep[] = [
    {
      title: "The question the task asks",
      body: (
        <>
          <p>
            A square appears somewhere in a three-by-three grid, then disappears, then appears somewhere else.
            One every three seconds, on and on.
          </p>
          <p className="mt-3">
            Your job is not to remember the whole sequence. It is to answer one narrow question about every
            new square: <strong className="font-semibold">is this in the same place it was N steps ago?</strong>
          </p>
          <p className="mt-3 text-[var(--text-muted)]">
            At 2-back you compare each square with the one from two trials earlier. Not the previous one —
            the one before that.
          </p>
        </>
      ),
    },
    {
      title: "Why it is harder than it sounds",
      body: (
        <>
          <p>
            Because the answer changes every single trial, you cannot memorise a list and read it back. The
            window slides forward with each new item: the moment you answer, the thing you were comparing
            against becomes irrelevant and something new takes its place.
          </p>
          <p className="mt-3">
            That constant discarding and replacing is the whole exercise. It is why n-back is a
            working-memory task and not a memory test.
          </p>
        </>
      ),
    },
    {
      title: "Try it at 1-back",
      body: (
        <>
          <p>
            Start with the easiest possible version: compare each square with the one immediately before it.
            Take as long as you like — the real task gives you three seconds, but right now the clock is off.
          </p>
          <p className="mt-3 text-[var(--text-muted)]">
            The first trial has nothing before it, so there is nothing to judge yet.
          </p>
        </>
      ),
      demo: <ManualDrill n={1} withAudio={false} onComplete={() => setDrill1(true)} />,
      requirement: { met: drill1, label: "Finish the drill to continue" },
    },
    {
      title: "Now 2-back, with sound",
      body: (
        <>
          <p>
            This is the real thing. Two changes: you are comparing against two trials back rather than one,
            and a letter is spoken with each square.
          </p>
          <p className="mt-3">
            The two channels are judged <em>separately</em>. The square can match while the letter does not,
            and you would respond for position only. That independence is what makes it{" "}
            <strong className="font-semibold">dual</strong> n-back, and it is the part that takes practice.
          </p>
          <p className="mt-3 text-[13px] text-[var(--text-muted)]">
            If you hear nothing, your browser has no speech voice installed — switch the audio channel to
            tones in settings.
          </p>
        </>
      ),
      demo: <ManualDrill n={2} withAudio />,
    },
    {
      title: "In the real task",
      body: (
        <>
          <p>Three things change once you start training for real:</p>
          <ul className="mt-3 flex flex-col gap-2.5 text-[var(--text-muted)]">
            <li className="flex gap-3">
              <span className="text-[var(--accent)]">•</span>
              <span>
                <strong className="font-medium text-[var(--text)]">It does not wait.</strong> A new stimulus
                arrives every three seconds whether or not you have decided.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-[var(--accent)]">•</span>
              <span>
                <strong className="font-medium text-[var(--text)]">Silence is an answer.</strong> Not
                pressing on a non-match is scored as correct. You do not need to press anything to say
                &ldquo;no&rdquo;.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-[var(--accent)]">•</span>
              <span>
                <strong className="font-medium text-[var(--text)]">N follows you.</strong> Score 90% or more
                and the next block goes up a level; below 70% and it comes back down.
              </span>
            </li>
          </ul>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 rounded-xl bg-[var(--bg-subtle)] px-4 py-3">
            <span className="flex items-center gap-2 text-[13px]">
              <Kbd>A</Kbd> <span className="text-[var(--text-muted)]">position match</span>
            </span>
            <span className="flex items-center gap-2 text-[13px]">
              <Kbd>L</Kbd> <span className="text-[var(--text-muted)]">audio match</span>
            </span>
          </div>
          <p className="mt-4 text-[13px] text-[var(--text-faint)]">
            Expect 2-back to feel hard at first and 3-back to feel impossible. Both pass.
          </p>
        </>
      ),
    },
  ];

  return <TutorialShell game={GAME} steps={steps} />;
}
