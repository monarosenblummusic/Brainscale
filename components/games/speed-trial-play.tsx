"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useGameEngine } from "@/hooks/useGameEngine";
import { useGameSettings } from "@/lib/store/hooks";
import { GAME_BY_ID } from "@/lib/games";
import {
  METER_SIZE,
  type SpeedTrialConfig,
  type SpeedTrialResult,
  type SpeedTrialState,
} from "@/lib/engine/speed-trial";
import type { Engine } from "@/lib/engine/types";
import { playCue } from "@/lib/audio";
import {
  Countdown,
  Hud,
  PauseOverlay,
  PlayFrame,
  ResultScreen,
  Stage,
  StartGate,
} from "@/components/game-shell";
import { cx } from "@/components/ui";
import type { GameId } from "@/lib/types";

/** One answer button. `hint` is the keyboard shortcut shown beneath the label. */
export interface TrialOption {
  label: ReactNode;
  hint?: string;
  /** Keys that select this option, lowercase. */
  keys: string[];
  /** Widen this button relative to the others. */
  grow?: number;
}

/**
 * The play screen every speeded-choice game shares.
 *
 * The board — the part that differs between Chalkboard, Spatial Speed Match and
 * Agility — is injected. Everything else is common: the shrinking response bar,
 * the multiplier meter, keyboard and touch answering, and the results.
 */
export function SpeedTrialPlay<Data>({
  gameId,
  engine,
  defaults,
  options,
  renderBoard,
  instructions,
}: {
  gameId: Extract<GameId, "chalkboard" | "spatial-match" | "agility">;
  engine: Engine<SpeedTrialConfig, SpeedTrialState<Data>, SpeedTrialResult>;
  defaults: SpeedTrialConfig;
  options: TrialOption[];
  renderBoard: (state: SpeedTrialState<Data>) => ReactNode;
  instructions: ReactNode;
}) {
  const game = GAME_BY_ID[gameId];
  const { settings, loaded } = useGameSettings<SpeedTrialConfig>(gameId, defaults);
  const [counting, setCounting] = useState(false);

  const { state, status, start, pause, resume, reset, send } = useGameEngine(engine, settings);

  const onCountdownDone = useCallback(() => {
    setCounting(false);
    start();
  }, [start]);

  const gradedRef = useRef(0);
  useEffect(() => {
    if (!state || state.attempted === gradedRef.current) return;
    gradedRef.current = state.attempted;
    if (state.lastOutcome) playCue(state.lastOutcome === "correct" ? "correct" : "wrong");
  }, [state]);

  const choose = useCallback(
    (index: number) => {
      if (status !== "running") return;
      send({ kind: "select", index });
    },
    [status, send],
  );

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
      if (status !== "running") return;

      const key = e.key.toLowerCase();
      const index = options.findIndex((o) => o.keys.includes(key));
      if (index !== -1) {
        e.preventDefault();
        choose(index);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, options, choose, pause, resume]);

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
    const r = engine.result(state);
    return (
      <PlayFrame>
        <Hud game={game} level={game.name} />
        <ResultScreen
          game={game}
          headline={r.score.toLocaleString()}
          sublabel={`points · ${r.correct}/${r.attempted} correct`}
          verdict={{
            text: `Reached level ${r.level} at ×${r.multiplier}`,
            tone: r.level > settings.startLevel ? "up" : "hold",
          }}
          rows={[
            { label: "Correct", value: `${r.correct} of ${r.attempted}`, tone: "good" },
            { label: "Accuracy", value: `${Math.round(r.accuracy * 100)}%` },
            { label: "Average answer time", value: r.averageMs ? `${(r.averageMs / 1000).toFixed(2)}s` : "—" },
            { label: "Best streak", value: String(r.bestStreak) },
            { label: "Difficulty reached", value: `Level ${r.level}` },
          ]}
          onAgain={again}
        />
      </PlayFrame>
    );
  }

  if (status === "ready" && !counting) {
    return (
      <PlayFrame>
        <Hud game={game} level={game.name} />
        <StartGate
          game={game}
          level={`${settings.durationSec} seconds`}
          onStart={() => setCounting(true)}
          instructions={instructions}
        />
      </PlayFrame>
    );
  }

  const remaining = state ? Math.max(0, settings.durationSec - state.elapsed / 1000) : settings.durationSec;
  const windowLeft = state ? Math.max(0, 1 - (state.elapsed - state.askedAt) / state.windowMs) : 1;

  return (
    <PlayFrame>
      <Hud
        game={game}
        level={`Level ${state?.level ?? settings.startLevel}`}
        score={state ? `${state.score.toLocaleString()} · ×${state.meter.multiplier}` : undefined}
        onPause={status === "running" ? pause : undefined}
        right={
          <span className="tnum text-[13px] tabular-nums text-[var(--text-muted)]">
            {Math.ceil(remaining)}s
          </span>
        }
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
        {counting ? (
          <Countdown onDone={onCountdownDone} />
        ) : state ? (
          <Stage>
            {/* Multiplier meter */}
            <div className="flex items-center gap-1.5" aria-label={`Multiplier ${state.meter.multiplier}`}>
              {Array.from({ length: METER_SIZE }, (_, i) => (
                <span
                  key={i}
                  className={cx(
                    "h-1.5 w-6 rounded-full transition-colors",
                    i < state.meter.filled ? "bg-[var(--accent)]" : "bg-[var(--border-strong)]",
                  )}
                />
              ))}
              <span className="tnum ml-2 text-[13px] font-semibold text-[var(--accent)]">
                ×{state.meter.multiplier}
              </span>
            </div>

            <div className="flex w-full flex-1 items-center justify-center">{renderBoard(state)}</div>

            {/* Response window */}
            <div className="h-1 w-full max-w-[min(92vw,30rem)] overflow-hidden rounded-full bg-[var(--bg-subtle)]">
              <div
                className={cx(
                  "h-full transition-[width] duration-100 ease-linear",
                  windowLeft < 0.25 ? "bg-[var(--danger)]" : "bg-[var(--warning)]",
                )}
                style={{ width: `${windowLeft * 100}%` }}
              />
            </div>

            <div className="flex w-full max-w-[min(92vw,30rem)] gap-2.5">
              {options.map((option, i) => {
                const judged = state.lastAnswer === i && state.attempted > 0;
                const tone =
                  judged && state.lastOutcome === "correct"
                    ? "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]"
                    : judged && state.lastOutcome === "wrong"
                      ? "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]"
                      : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]";
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={status !== "running"}
                    style={{ flexGrow: option.grow ?? 1 }}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      choose(i);
                    }}
                    className={cx(
                      "flex h-16 flex-col items-center justify-center gap-0.5 rounded-2xl border text-[15px] font-semibold transition-all active:scale-[0.98] disabled:opacity-40 sm:h-[4.5rem]",
                      tone,
                    )}
                  >
                    <span>{option.label}</span>
                    {option.hint ? (
                      <span className="text-[11px] font-normal uppercase tracking-wide opacity-55">
                        {option.hint}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </Stage>
        ) : null}

        {status === "paused" ? <PauseOverlay game={game} onResume={resume} onRestart={again} /> : null}
      </div>
    </PlayFrame>
  );
}
