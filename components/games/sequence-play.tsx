"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useGameEngine } from "@/hooks/useGameEngine";
import { useGameSettings } from "@/lib/store/hooks";
import { GAME_BY_ID } from "@/lib/games";
import {
  expectedAnswer,
  presentationMs,
  sequenceEngine,
  type SequenceConfig,
  type SequenceState,
} from "@/lib/engine/sequence";
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
import { Button, cx } from "@/components/ui";
import type { GameId, Session } from "@/lib/types";

/**
 * Shared play screen for the two span tasks. The board is the only difference,
 * so it is injected — everything around it (phases, feedback, spans, results)
 * is identical between digits and blocks.
 */
export interface SequenceBoardProps {
  state: SequenceState;
  onSelect: (index: number) => void;
  /** True while items are being shown and input must be refused. */
  locked: boolean;
}

export function SequencePlay({
  gameId,
  defaults,
  renderBoard,
  instructions,
}: {
  gameId: Extract<GameId, "memory-span" | "corsi">;
  defaults: SequenceConfig;
  renderBoard: (props: SequenceBoardProps) => ReactNode;
  instructions: (config: SequenceConfig) => ReactNode;
}) {
  const game = GAME_BY_ID[gameId];
  const { settings, loaded } = useGameSettings<SequenceConfig>(gameId, defaults);
  const [counting, setCounting] = useState(false);
  const [, setLastSession] = useState<Session | null>(null);

  const onFinish = useCallback((s: Session) => setLastSession(s), []);
  const { state, status, start, pause, resume, reset, send } = useGameEngine(sequenceEngine, settings, { onFinish });

  const beginCountdown = useCallback(() => setCounting(true), []);
  const onCountdownDone = useCallback(() => {
    setCounting(false);
    start();
  }, [start]);

  /* Feedback cue on each graded trial, once per trial. */
  const gradedRef = useRef(0);
  useEffect(() => {
    if (!state || state.trialsPlayed === gradedRef.current) return;
    gradedRef.current = state.trialsPlayed;
    if (state.lastTrial) playCue(state.lastTrial === "correct" ? "correct" : "wrong");
  }, [state]);

  const locked = !state || state.phase !== "responding" || status !== "running";

  const select = useCallback(
    (index: number) => {
      if (locked) return;
      send({ kind: "select", index });
    },
    [locked, send],
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
      if (locked) return;

      if (e.key === "Backspace") {
        e.preventDefault();
        send({ kind: "clear" });
        return;
      }
      // Digits map straight onto the keypad; 0 is item 9 on a ten-item alphabet.
      if (/^[0-9]$/.test(e.key)) {
        const digit = Number(e.key);
        if (digit < settings.alphabet) {
          e.preventDefault();
          select(digit);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, locked, send, select, settings.alphabet, beginCountdown, pause, resume]);

  const again = useCallback(() => {
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

  /* -------------------------------- Finished ------------------------------ */
  if (status === "finished" && state) {
    const r = sequenceEngine.result(state);
    const normal = gameId === "corsi" ? "Typical adult range is 5 to 7" : "Typical adult range is 5 to 9";
    return (
      <PlayFrame>
        <Hud game={game} level={`${game.name} · ${settings.direction}`} />
        <ResultScreen
          game={game}
          headline={String(r.span)}
          sublabel={game.metricLabel.toLowerCase()}
          verdict={{ text: normal, tone: "hold" }}
          rows={[
            { label: "Longest correct sequence", value: `${r.span} items` },
            { label: "Trials", value: `${r.correctTrials} of ${r.trialsPlayed} correct` },
            { label: "Direction", value: settings.direction === "reverse" ? "Reverse" : "Forward" },
            { label: "Accuracy", value: `${Math.round(r.accuracy * 100)}%` },
          ]}
          onAgain={again}
        />
      </PlayFrame>
    );
  }

  /* ---------------------------------- Ready ------------------------------- */
  if (status === "ready" && !counting) {
    return (
      <PlayFrame>
        <Hud game={game} level={game.name} />
        <StartGate
          game={game}
          level={`${settings.direction === "reverse" ? "Reverse" : "Forward"} · from ${settings.startLength}`}
          onStart={beginCountdown}
          instructions={instructions(settings)}
        />
      </PlayFrame>
    );
  }

  /* -------------------------------- Playing ------------------------------- */
  const phaseLabel =
    state?.phase === "presenting" ? "Watch" : state?.phase === "responding" ? "Your turn" : "";

  return (
    <PlayFrame>
      <Hud
        game={game}
        level={`Length ${state?.progress.level ?? settings.startLength}`}
        progress={
          state?.phase === "responding"
            ? { current: state.entry.length, total: state.sequence.length }
            : undefined
        }
        score={state ? `Best ${state.progress.best}` : undefined}
        onPause={status === "running" ? pause : undefined}
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
        {counting ? (
          <Countdown onDone={onCountdownDone} />
        ) : state ? (
          <Stage>
            <div className="flex h-7 items-center">
              <span
                className={cx(
                  "rounded-full px-3 py-1 text-[12px] font-medium uppercase tracking-wider transition-colors",
                  state.phase === "responding"
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "bg-[var(--bg-subtle)] text-[var(--text-faint)]",
                )}
                aria-live="polite"
              >
                {state.lastTrial && state.phase === "feedback"
                  ? state.lastTrial === "correct"
                    ? "Correct"
                    : `Was ${expectedAnswer(state.sequence, state.config.direction).map((v) => v + 1).join(" ")}`
                  : phaseLabel}
              </span>
            </div>

            {renderBoard({ state, onSelect: select, locked })}

            <div className="flex h-10 items-center gap-2">
              {state.phase === "responding" && state.entry.length > 0 ? (
                <Button variant="ghost" size="sm" onClick={() => send({ kind: "clear" })}>
                  Clear
                </Button>
              ) : state.phase === "presenting" ? (
                <PresentationDots
                  total={state.sequence.length}
                  index={state.showIndex}
                  totalMs={presentationMs(state.sequence.length, state.config)}
                />
              ) : null}
            </div>
          </Stage>
        ) : null}

        {status === "paused" ? (
          <PauseOverlay game={game} onResume={resume} onRestart={again} />
        ) : null}
      </div>
    </PlayFrame>
  );
}

function PresentationDots({ total, index, totalMs }: { total: number; index: number; totalMs: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true" title={`${total} items, ${(totalMs / 1000).toFixed(1)}s`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cx(
            "size-1.5 rounded-full transition-colors",
            i <= index ? "bg-[var(--accent)]" : "bg-[var(--border-strong)]",
          )}
        />
      ))}
    </div>
  );
}
