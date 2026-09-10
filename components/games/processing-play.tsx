"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGameEngine } from "@/hooks/useGameEngine";
import { useGameSettings } from "@/lib/store/hooks";
import { GAME_BY_ID } from "@/lib/games";
import { RSVP_DEFAULTS, passageAt, rsvpEngine, type RsvpConfig } from "@/lib/engine/rsvp";
import { playCue } from "@/lib/audio";
import { Countdown, Hud, PauseOverlay, PlayFrame, ResultScreen, StartGate } from "@/components/game-shell";
import { cx } from "@/components/ui";

const GAME = GAME_BY_ID["processing"];

export function ProcessingPlay() {
  const { settings, loaded } = useGameSettings<RsvpConfig>("processing", RSVP_DEFAULTS);
  const [counting, setCounting] = useState(false);

  const { state, status, start, pause, resume, reset, send } = useGameEngine(rsvpEngine, settings);

  const onCountdownDone = useCallback(() => {
    setCounting(false);
    start();
  }, [start]);

  const gradedRef = useRef(0);
  useEffect(() => {
    if (!state || state.answered === gradedRef.current) return;
    gradedRef.current = state.answered;
    if (state.lastCorrect !== null) playCue(state.lastCorrect ? "correct" : "wrong");
  }, [state]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (status === "ready") setCounting(true);
        else if (status === "running") pause();
        else if (status === "paused") resume();
        return;
      }
      if (e.key === "Escape" && status === "running") {
        e.preventDefault();
        pause();
        return;
      }
      if (status === "running" && state?.stage === "question" && /^[123]$/.test(e.key)) {
        e.preventDefault();
        send({ kind: "select", index: Number(e.key) - 1 });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, state?.stage, send, pause, resume]);

  const again = useCallback(() => {
    gradedRef.current = 0;
    reset();
    setCounting(true);
  }, [reset]);

  if (!loaded) {
    return (
      <PlayFrame>
        <div className="grid flex-1 place-items-center text-[13px] text-[var(--text-faint)]">Loading…</div>
      </PlayFrame>
    );
  }

  if (status === "finished" && state) {
    const r = rsvpEngine.result(state);
    return (
      <PlayFrame>
        <Hud game={GAME} level={GAME.name} />
        <ResultScreen
          game={GAME}
          headline={String(r.bestWpm)}
          sublabel="words a minute, read and understood"
          verdict={{
            text:
              r.bestWpm >= 400
                ? "Well past the speed of the inner voice"
                : r.bestWpm >= 300
                  ? "At the edge of where sounding words out stops working"
                  : "Keep going — the jump comes when you stop sounding them out",
            tone: r.bestWpm >= 300 ? "up" : "hold",
          }}
          rows={[
            { label: "Best rate understood", value: `${r.bestWpm} wpm`, tone: "good" },
            { label: "Questions correct", value: `${r.correct} of ${r.answered}` },
            { label: "Accuracy", value: `${Math.round(r.accuracy * 100)}%` },
            { label: "Ending rate", value: `${r.finalWpm} wpm` },
          ]}
          onAgain={again}
        />
      </PlayFrame>
    );
  }

  if (status === "ready" && !counting) {
    return (
      <PlayFrame>
        <Hud game={GAME} level={GAME.name} />
        <StartGate
          game={GAME}
          level={`${settings.startWpm} words a minute`}
          onStart={() => setCounting(true)}
          instructions={
            <>
              <p>A passage plays one word at a time, in place. Then a question about it.</p>
              <p className="mt-3 text-[13px] text-[var(--text-faint)]">
                Do not try to sound the words out — above about 300 a minute the inner voice cannot keep up,
                and letting go of it is the whole skill. Answer correctly and the next one runs faster.
              </p>
            </>
          }
        />
      </PlayFrame>
    );
  }

  const reading = state?.stage === "reading";
  const asking = state?.stage === "question";
  const reviewing = state?.stage === "review";
  const passage = state ? passageAt(state.order, state.passageIndex) : null;

  return (
    <PlayFrame>
      <Hud
        game={GAME}
        level={`${state?.wpm ?? settings.startWpm} wpm`}
        progress={state ? { current: state.passageIndex, total: settings.passages } : undefined}
        score={state ? `${state.correct} correct` : undefined}
        onPause={status === "running" ? pause : undefined}
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
        {counting ? (
          <Countdown onDone={onCountdownDone} />
        ) : state ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-7 p-5">
            {reading ? (
              <>
                {/* The word sits in one fixed spot: the point of the format is
                    that the eye never moves, so nothing may shift under it. */}
                <div className="grid h-28 w-full max-w-[min(94vw,34rem)] place-items-center">
                  <span
                    key={state.wordIndex}
                    className="text-center text-[clamp(1.75rem,8vw,3rem)] font-semibold tracking-tight"
                  >
                    {state.words[state.wordIndex] ?? ""}
                  </span>
                </div>
                <div className="h-1 w-full max-w-[min(94vw,34rem)] overflow-hidden rounded-full bg-[var(--bg-subtle)]">
                  <div
                    className="h-full bg-[var(--accent)] transition-[width] duration-100 ease-linear"
                    style={{ width: `${(state.wordIndex / Math.max(1, state.words.length - 1)) * 100}%` }}
                  />
                </div>
              </>
            ) : passage ? (
              <div className="w-full max-w-[min(94vw,34rem)]">
                <p className="text-center text-[17px] font-medium leading-snug">{passage.question}</p>

                <div className="mt-6 flex flex-col gap-2.5">
                  {passage.options.map((option, i) => {
                    const isAnswer = i === passage.answer;
                    const chosen = state.chosen === i;
                    return (
                      <button
                        key={option}
                        type="button"
                        disabled={!asking}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          send({ kind: "select", index: i });
                        }}
                        className={cx(
                          "flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left text-[15px] transition-all",
                          reviewing && isAnswer
                            ? "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]"
                            : reviewing && chosen
                              ? "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]"
                              : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]",
                        )}
                      >
                        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-[var(--bg-subtle)] text-[12px] font-semibold text-[var(--text-muted)]">
                          {i + 1}
                        </span>
                        {option}
                      </button>
                    );
                  })}
                </div>

                {reviewing ? (
                  <p className="mt-5 rounded-xl bg-[var(--bg-subtle)] p-4 text-[13px] leading-relaxed text-[var(--text-muted)]">
                    {passage.text}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {status === "paused" ? <PauseOverlay game={GAME} onResume={resume} onRestart={again} /> : null}
      </div>
    </PlayFrame>
  );
}
