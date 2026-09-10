"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGameEngine } from "@/hooks/useGameEngine";
import { useGameSettings } from "@/lib/store/hooks";
import { GAME_BY_ID } from "@/lib/games";
import {
  PERILOUS_DEFAULTS,
  areAdjacent,
  cellIndex,
  expectedRoute,
  indexToCell,
  perilousEngine,
  type Cell,
  type PerilousConfig,
} from "@/lib/engine/perilous-path";
import { playCue } from "@/lib/audio";
import { Countdown, Hud, PauseOverlay, PlayFrame, ResultScreen, StartGate } from "@/components/game-shell";
import { cx } from "@/components/ui";

const GAME = GAME_BY_ID["perilous-path"];

const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;

export function PerilousPathPlay() {
  const { settings, loaded } = useGameSettings<PerilousConfig>("perilous-path", PERILOUS_DEFAULTS);
  const [counting, setCounting] = useState(false);

  const { state, status, start, pause, resume, reset, send } = useGameEngine(perilousEngine, settings);

  const onCountdownDone = useCallback(() => {
    setCounting(false);
    start();
  }, [start]);

  const gradedRef = useRef(0);
  useEffect(() => {
    if (!state || state.trials === gradedRef.current) return;
    gradedRef.current = state.trials;
    if (state.lastTrial) playCue(state.lastTrial === "cleared" ? "correct" : "wrong");
  }, [state]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (status === "ready") setCounting(true);
        else if (status === "running") pause();
        else if (status === "paused") resume();
      } else if (e.key === "Escape" && status === "running") {
        e.preventDefault();
        pause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, pause, resume]);

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
    const r = perilousEngine.result(state);
    return (
      <PlayFrame>
        <Hud game={GAME} level={GAME.name} />
        <ResultScreen
          game={GAME}
          headline={String(r.span)}
          sublabel="longest route walked"
          verdict={{
            text: settings.reverse ? "Reverse mode — one to two shorter than forward is normal" : "Try reverse mode next",
            tone: "hold",
          }}
          rows={[
            { label: "Longest route", value: `${r.span} squares`, tone: "good" },
            { label: "Routes cleared", value: `${r.cleared} of ${r.trials}` },
            { label: "Direction", value: settings.reverse ? "Reverse" : "Forward" },
            { label: "Grid", value: `${settings.size} × ${settings.size}` },
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
          level={`${settings.size}×${settings.size} · from ${settings.startLength}`}
          onStart={() => setCounting(true)}
          instructions={
            <>
              <p>
                Watch the route light up, and note where the hazards are. Then walk it back — one square at a
                time, never diagonally.
              </p>
              <p className="mt-3 text-[13px] text-[var(--text-faint)]">
                {settings.reverse ? "Reverse mode: start from the far end of the route. " : ""}
                One wrong square ends the attempt. Two failures at a length end the run.
              </p>
            </>
          }
        />
      </PlayFrame>
    );
  }

  const revealing = state?.stage === "reveal";
  const walking = state?.stage === "walk";
  const reviewing = state?.stage === "review";
  const route = state ? expectedRoute(state) : [];
  const head = state?.walked[state.walked.length - 1];
  const nextCell = state && walking ? route[state.walked.length] : undefined;

  return (
    <PlayFrame>
      <Hud
        game={GAME}
        level={`Route of ${state?.progress.level ?? settings.startLength}`}
        progress={state && walking ? { current: state.walked.length, total: route.length } : undefined}
        score={state ? `Best ${state.progress.best}` : undefined}
        onPause={status === "running" ? pause : undefined}
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
        {counting ? (
          <Countdown onDone={onCountdownDone} />
        ) : state ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 p-4">
            <p
              className={cx(
                "h-6 rounded-full px-3 py-1 text-[12px] font-medium uppercase tracking-wider",
                reviewing && state.lastTrial === "cleared"
                  ? "bg-[var(--success-soft)] text-[var(--success)]"
                  : reviewing
                    ? "bg-[var(--danger-soft)] text-[var(--danger)]"
                    : walking
                      ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "bg-[var(--bg-subtle)] text-[var(--text-faint)]",
              )}
              aria-live="polite"
            >
              {revealing
                ? "Watch the route"
                : walking
                  ? settings.reverse
                    ? "Walk it backwards"
                    : "Walk the route"
                  : state.lastTrial === "cleared"
                    ? "Cleared"
                    : "The route was"}
            </p>

            <div
              className="grid w-full max-w-[min(84vw,26rem)] gap-1.5"
              style={{ gridTemplateColumns: `repeat(${settings.size}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: settings.size * settings.size }, (_, index) => {
                const cell = indexToCell(index, settings.size);
                const lit = revealing && state.revealIndex >= 0 && same(cell, state.path[state.revealIndex]!);
                const revealedSoFar =
                  revealing && state.path.slice(0, state.revealIndex + 1).some((c) => same(c, cell));
                const isHazard = state.hazards.some((h) => same(h, cell));
                const walkedAt = state.walked.findIndex((c) => same(c, cell));
                const onRoute = route.some((c) => same(c, cell));
                const isFailure = state.failedAt && same(state.failedAt, cell);
                const reachable = walking && (!head ? same(cell, route[0]!) : areAdjacent(head, cell));

                // Hazards stay visible during the reveal and the review, and are
                // hidden while walking — that hidden stretch is the memory load.
                const showHazard = isHazard && (revealing || reviewing);

                return (
                  <button
                    key={index}
                    type="button"
                    disabled={!walking}
                    aria-label={`Square ${cell.x + 1}, ${cell.y + 1}`}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      send({ kind: "select", index });
                    }}
                    className={cx(
                      "relative grid aspect-square place-items-center rounded-lg border-2 text-[12px] font-semibold transition-all",
                      isFailure
                        ? "border-[var(--danger)] bg-[var(--danger)] text-white"
                        : showHazard
                          ? "border-[var(--danger)] bg-[var(--danger-soft)]"
                          : lit
                            ? "scale-105 border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-text)]"
                            : revealedSoFar
                              ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                              : walkedAt !== -1
                                ? "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]"
                                : reviewing && onRoute
                                  ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                                  : "border-[var(--border)] bg-[var(--surface)]",
                      reachable && walkedAt === -1 && "ring-2 ring-[var(--accent)]/25",
                    )}
                  >
                    {showHazard ? (
                      <span className="text-[var(--danger)]" aria-hidden="true">
                        ✕
                      </span>
                    ) : walkedAt !== -1 ? (
                      walkedAt + 1
                    ) : revealedSoFar && !lit ? (
                      state.path.findIndex((c) => same(c, cell)) + 1
                    ) : null}
                  </button>
                );
              })}
            </div>

            <p className="h-5 text-[13px] text-[var(--text-muted)]">
              {walking && nextCell ? `Square ${state.walked.length + 1} of ${route.length}` : ""}
            </p>
          </div>
        ) : null}

        {status === "paused" ? <PauseOverlay game={GAME} onResume={resume} onRestart={again} /> : null}
      </div>
    </PlayFrame>
  );
}
