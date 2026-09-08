"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGameEngine } from "@/hooks/useGameEngine";
import { useGameSettings } from "@/lib/store/hooks";
import { GAME_BY_ID } from "@/lib/games";
import { ISI_LADDER, PASAT_DEFAULTS, isiFor, pasatEngine, type PasatConfig } from "@/lib/engine/pasat";
import { playCue, speakNumber } from "@/lib/audio";
import {
  Countdown,
  Hud,
  PauseOverlay,
  PlayFrame,
  ResultScreen,
  Stage,
  StartGate,
  useCountdown,
} from "@/components/game-shell";
import { cx } from "@/components/ui";

const GAME = GAME_BY_ID["pasat"];

export function PasatPlay() {
  const { settings, loaded } = useGameSettings<PasatConfig>("pasat", PASAT_DEFAULTS);
  const [counting, setCounting] = useState(false);

  const { state, status, start, pause, resume, reset, send } = useGameEngine(pasatEngine, settings);

  const beginCountdown = useCallback(() => setCounting(true), []);
  const countdownValue = useCountdown(counting, 3, () => {
    setCounting(false);
    start();
  });

  /* Speak each digit exactly once, on the digit the engine has moved to. */
  const spokenRef = useRef(-1);
  useEffect(() => {
    if (!state || status !== "running" || !settings.audio) return;
    if (state.index === spokenRef.current) return;
    spokenRef.current = state.index;
    const digit = state.sequence[state.index];
    if (digit !== undefined) speakNumber(digit);
  }, [state, status, settings.audio]);

  /* Feedback cue per graded pair. */
  const gradedRef = useRef(0);
  useEffect(() => {
    if (!state || state.outcomes.length === gradedRef.current) return;
    gradedRef.current = state.outcomes.length;
    const last = state.outcomes[state.outcomes.length - 1];
    if (last === "correct") playCue("correct");
    else if (last === "wrong") playCue("wrong");
  }, [state]);

  const press = useCallback(
    (digit: number) => {
      if (status !== "running") return;
      send({ kind: "answer", value: String(digit) });
    },
    [status, send],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (status === "ready") beginCountdown();
        else if (status === "running") pause();
        else if (status === "paused") resume();
        return;
      }
      if (e.key === "Escape" && status === "running") {
        e.preventDefault();
        pause();
        return;
      }
      if (status !== "running") return;
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        press(Number(e.key));
      } else if (e.key === "Backspace") {
        e.preventDefault();
        send({ kind: "clear" });
      } else if (e.key === "Enter") {
        e.preventDefault();
        send({ kind: "submit" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, press, send, beginCountdown, pause, resume]);

  const again = useCallback(() => {
    spokenRef.current = -1;
    gradedRef.current = 0;
    reset();
    beginCountdown();
  }, [reset, beginCountdown]);

  if (!loaded) {
    return (
      <PlayFrame>
        <div className="grid flex-1 place-items-center text-[13px] text-[var(--text-faint)]">Loading…</div>
      </PlayFrame>
    );
  }

  if (status === "finished" && state) {
    const r = pasatEngine.result(state);
    const changed = r.nextIsiLevel !== settings.isiLevel;
    return (
      <PlayFrame>
        <Hud game={GAME} level="PASAT" />
        <ResultScreen
          game={GAME}
          headline={String(r.correct)}
          sublabel={`of ${r.total} sums`}
          verdict={{
            text: changed
              ? `Pace moves to ${(isiFor(r.nextIsiLevel) / 1000).toFixed(1)}s`
              : `Holding at ${(r.isi / 1000).toFixed(1)}s`,
            tone: r.nextIsiLevel > settings.isiLevel ? "up" : r.nextIsiLevel < settings.isiLevel ? "down" : "hold",
          }}
          rows={[
            { label: "Correct", value: String(r.correct), tone: "good" },
            { label: "Wrong", value: String(r.wrong), tone: r.wrong > 0 ? "bad" : "default" },
            { label: "Missed", value: String(r.missed), tone: r.missed > 0 ? "bad" : "default" },
            { label: "Longest unbroken run", value: String(r.longestRun) },
            { label: "Accuracy", value: `${Math.round(r.accuracy * 100)}%` },
            { label: "Pace", value: `${(r.isi / 1000).toFixed(1)}s between digits` },
          ]}
          onAgain={again}
        />
      </PlayFrame>
    );
  }

  if (status === "ready" && !counting) {
    return (
      <PlayFrame>
        <Hud game={GAME} level="PASAT" />
        <StartGate
          game={GAME}
          level={`${(isiFor(settings.isiLevel) / 1000).toFixed(1)}s pace`}
          onStart={beginCountdown}
          instructions={
            <>
              <p>
                Add each digit to the one <strong className="font-semibold text-[var(--text)]">immediately before it</strong>.
              </p>
              <p className="mt-3 rounded-lg bg-[var(--bg-subtle)] px-3 py-2.5 text-[13px] text-[var(--text-muted)]">
                Hearing 3, 5, 2, 4 you answer <span className="tnum font-medium">8</span>,{" "}
                <span className="tnum font-medium">7</span>, <span className="tnum font-medium">6</span> — never
                a running total.
              </p>
              <p className="mt-3 text-[13px] text-[var(--text-faint)]">
                {settings.digits} digits · {Math.round((settings.digits * isiFor(settings.isiLevel)) / 1000)}s ·
                the clock does not wait
              </p>
            </>
          }
        />
      </PlayFrame>
    );
  }

  const previous = state && state.index >= 1 ? state.sequence[state.index - 1] : undefined;
  const current = state ? state.sequence[state.index] : undefined;
  const answered = state?.answered ?? false;

  return (
    <PlayFrame>
      <Hud
        game={GAME}
        level={`${((state?.isi ?? 3000) / 1000).toFixed(1)}s pace`}
        progress={state ? { current: state.outcomes.length, total: Math.max(0, settings.digits - 1) } : undefined}
        score={state ? `${state.outcomes.filter((o) => o === "correct").length} correct` : undefined}
        onPause={status === "running" ? pause : undefined}
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
        {counting ? (
          <Countdown value={countdownValue} />
        ) : state ? (
          <Stage>
            {/* The two digits in play. The previous one is dimmed but shown in
                visual mode, because the task is to add these two — not to
                remember which two they were. */}
            <div className="flex items-center gap-4 sm:gap-6">
              <span
                className={cx(
                  "tnum grid size-16 place-items-center rounded-2xl border border-[var(--border)] text-[28px] font-semibold text-[var(--text-faint)] sm:size-20 sm:text-[34px]",
                  previous === undefined && "opacity-30",
                )}
              >
                {settings.visual && previous !== undefined ? previous : "·"}
              </span>
              <span className="text-[24px] text-[var(--text-faint)]">+</span>
              <span
                key={state.index}
                className={cx(
                  "anim-flash tnum grid size-20 place-items-center rounded-2xl border-2 border-[var(--accent)] bg-[var(--accent-soft)] text-[38px] font-semibold text-[var(--accent)] sm:size-24 sm:text-[46px]",
                )}
              >
                {settings.visual && current !== undefined ? current : "?"}
              </span>
            </div>

            {/* Answer display */}
            <div
              className={cx(
                "tnum grid h-16 w-32 place-items-center rounded-2xl border-2 text-[32px] font-semibold transition-colors",
                answered && state.lastOutcome === "correct"
                  ? "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]"
                  : answered && state.lastOutcome === "wrong"
                    ? "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]"
                    : "border-[var(--border)] bg-[var(--surface)]",
              )}
              aria-live="polite"
            >
              {state.entry || (state.index >= 1 ? "—" : "")}
            </div>

            {/* Keypad */}
            <div className="grid w-full max-w-[min(88vw,20rem)] grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d) => (
                <button
                  key={d}
                  type="button"
                  disabled={status !== "running"}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    press(d);
                  }}
                  className="tnum h-12 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[17px] font-semibold transition-all hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] active:scale-95 disabled:opacity-40 sm:h-14"
                >
                  {d}
                </button>
              ))}
            </div>
          </Stage>
        ) : null}

        {status === "paused" ? <PauseOverlay game={GAME} onResume={resume} onRestart={again} /> : null}
      </div>
    </PlayFrame>
  );
}

export { ISI_LADDER };
