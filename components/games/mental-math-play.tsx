"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGameEngine } from "@/hooks/useGameEngine";
import { useGameSettings } from "@/lib/store/hooks";
import { GAME_BY_ID } from "@/lib/games";
import {
  MENTAL_MATH_DEFAULTS,
  OPERATION_LABEL,
  OPERATION_SYMBOL,
  mentalMathEngine,
  type MentalMathConfig,
} from "@/lib/engine/mental-math";
import { playCue } from "@/lib/audio";
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
import { Button, cx } from "@/components/ui";

const GAME = GAME_BY_ID["mental-math"];

export function MentalMathPlay() {
  const { settings, loaded } = useGameSettings<MentalMathConfig>("mental-math", MENTAL_MATH_DEFAULTS);
  const [counting, setCounting] = useState(false);

  const { state, status, start, pause, resume, reset, send } = useGameEngine(mentalMathEngine, settings);

  const beginCountdown = useCallback(() => setCounting(true), []);
  const countdownValue = useCountdown(counting, 3, () => {
    setCounting(false);
    start();
  });

  const gradedRef = useRef(0);
  useEffect(() => {
    if (!state || state.attempted === gradedRef.current) return;
    gradedRef.current = state.attempted;
    if (state.lastOutcome) playCue(state.lastOutcome === "correct" ? "correct" : "wrong");
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
      } else if (e.key === "Enter") {
        e.preventDefault();
        send({ kind: "submit" });
      } else if (e.key === "Backspace") {
        e.preventDefault();
        send({ kind: "clear" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, press, send, beginCountdown, pause, resume]);

  const again = useCallback(() => {
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
    const r = mentalMathEngine.result(state);
    const grew = r.leftDigits + r.rightDigits > settings.leftDigits + settings.rightDigits;
    const shrank = r.leftDigits + r.rightDigits < settings.leftDigits + settings.rightDigits;

    return (
      <PlayFrame>
        <Hud game={GAME} level={OPERATION_LABEL[settings.operation]} />
        <ResultScreen
          game={GAME}
          headline={String(r.solved)}
          sublabel={`of ${r.attempted} solved`}
          verdict={{
            text: grew
              ? `Difficulty rose to ${r.leftDigits}×${r.rightDigits} digits`
              : shrank
                ? `Eased to ${r.leftDigits}×${r.rightDigits} digits`
                : `Holding at ${r.leftDigits}×${r.rightDigits} digits`,
            tone: grew ? "up" : shrank ? "down" : "hold",
          }}
          rows={[
            { label: "Correct", value: String(r.solved), tone: "good" },
            { label: "Accuracy", value: `${Math.round(r.accuracy * 100)}%` },
            { label: "Average time", value: r.averageMs ? `${(r.averageMs / 1000).toFixed(1)}s` : "—" },
            { label: "Rate", value: `${r.perMinute.toFixed(1)} per minute` },
            { label: "Operand digits", value: `${r.leftDigits} × ${r.rightDigits}` },
          ]}
          onAgain={again}
          extra={
            state.history.some((h) => !h.correct) ? (
              <div className="mt-5 border-t border-[var(--border)] pt-4">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[var(--text-faint)]">
                  Missed
                </p>
                <div className="flex flex-col gap-1">
                  {state.history
                    .filter((h) => !h.correct)
                    .slice(0, 6)
                    .map((h, i) => (
                      <div key={i} className="tnum flex justify-between text-[13px]">
                        <span className="text-[var(--text-muted)]">
                          {h.problem.left} {OPERATION_SYMBOL[h.problem.operation]} {h.problem.right}
                        </span>
                        <span>
                          <span className="text-[var(--danger)] line-through">
                            {Number.isNaN(h.given) ? "skipped" : h.given}
                          </span>
                          <span className="ml-2 font-medium text-[var(--success)]">{h.problem.answer}</span>
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            ) : null
          }
        />
      </PlayFrame>
    );
  }

  if (status === "ready" && !counting) {
    return (
      <PlayFrame>
        <Hud game={GAME} level={OPERATION_LABEL[settings.operation]} />
        <StartGate
          game={GAME}
          level={`${OPERATION_LABEL[settings.operation]} · ${settings.leftDigits}×${settings.rightDigits}`}
          onStart={beginCountdown}
          instructions={
            <>
              <p>Solve as many as you can. Speed counts as well as accuracy.</p>
              <p className="mt-3 text-[13px] text-[var(--text-faint)]">
                {settings.durationSec > 0
                  ? `${settings.durationSec} seconds`
                  : `${settings.problemCount} problems`}{" "}
                · each operand has its own difficulty and they move independently
              </p>
            </>
          }
        />
      </PlayFrame>
    );
  }

  const remainingSec =
    settings.durationSec > 0 && state ? Math.max(0, Math.ceil(settings.durationSec - state.elapsed / 1000)) : null;

  return (
    <PlayFrame>
      <Hud
        game={GAME}
        level={`${state?.leftDigits ?? settings.leftDigits}×${state?.rightDigits ?? settings.rightDigits} digits`}
        progress={
          settings.durationSec === 0 && state
            ? { current: state.attempted, total: settings.problemCount }
            : undefined
        }
        score={
          state
            ? remainingSec !== null
              ? `${state.solved} · ${Math.floor(remainingSec / 60)}:${String(remainingSec % 60).padStart(2, "0")}`
              : `${state.solved} solved`
            : undefined
        }
        onPause={status === "running" ? pause : undefined}
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
        {counting ? (
          <Countdown value={countdownValue} />
        ) : state ? (
          <Stage>
            <div
              key={state.attempted}
              className="anim-flash tnum text-center text-[clamp(2.25rem,11vw,4rem)] font-semibold leading-none tracking-tight"
            >
              {state.problem.left} {OPERATION_SYMBOL[state.problem.operation]} {state.problem.right}
            </div>

            <div
              className={cx(
                "tnum grid h-[4.5rem] w-full max-w-[min(88vw,18rem)] place-items-center rounded-2xl border-2 text-[2.25rem] font-semibold transition-colors",
                state.lastOutcome === "correct" && state.entry === ""
                  ? "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]"
                  : state.lastOutcome === "wrong" && state.entry === ""
                    ? "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]"
                    : "border-[var(--border)] bg-[var(--surface)]",
              )}
              aria-live="polite"
              aria-label="Your answer"
            >
              {state.entry || (state.lastOutcome === "correct" ? "✓" : state.lastOutcome === "wrong" ? "✕" : "—")}
            </div>

            <div className="grid w-full max-w-[min(88vw,18rem)] grid-cols-3 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                <Key key={d} label={String(d)} onPress={() => press(d)} disabled={status !== "running"} />
              ))}
              <Key label="⌫" onPress={() => send({ kind: "clear" })} disabled={status !== "running"} muted />
              <Key label="0" onPress={() => press(0)} disabled={status !== "running"} />
              <Key label="↵" onPress={() => send({ kind: "submit" })} disabled={status !== "running"} accent />
            </div>

            <Button variant="ghost" size="sm" onClick={() => send({ kind: "skip" })} disabled={status !== "running"}>
              Skip
            </Button>
          </Stage>
        ) : null}

        {status === "paused" ? <PauseOverlay game={GAME} onResume={resume} onRestart={again} /> : null}
      </div>
    </PlayFrame>
  );
}

function Key({
  label,
  onPress,
  disabled,
  accent,
  muted,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={(e) => {
        e.preventDefault();
        onPress();
      }}
      className={cx(
        "tnum h-14 rounded-xl border text-[19px] font-semibold transition-all active:scale-95 disabled:opacity-40 sm:h-16",
        accent
          ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-text)]"
          : muted
            ? "border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-muted)]"
            : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]",
      )}
    >
      {label}
    </button>
  );
}
