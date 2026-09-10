"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGameEngine } from "@/hooks/useGameEngine";
import { useGameSettings } from "@/lib/store/hooks";
import { GAME_BY_ID } from "@/lib/games";
import {
  TURTLE_DEFAULTS,
  indexToPoint,
  isAdjacent,
  pointIndex,
  samePoint,
  turtleEngine,
  type TurtleConfig,
} from "@/lib/engine/turtle-traffic";
import { playCue } from "@/lib/audio";
import { Countdown, Hud, PauseOverlay, PlayFrame, ResultScreen, StartGate } from "@/components/game-shell";
import { cx } from "@/components/ui";

const GAME = GAME_BY_ID["turtle-traffic"];

/** One hue per turtle, so a turtle and its home are unmistakably a pair. */
const HUES = ["--stim-1", "--stim-2", "--stim-3", "--stim-4", "--stim-5"] as const;

export function TurtleTrafficPlay() {
  const { settings, loaded } = useGameSettings<TurtleConfig>("turtle-traffic", TURTLE_DEFAULTS);
  const [counting, setCounting] = useState(false);

  const { state, status, start, pause, resume, reset, send } = useGameEngine(turtleEngine, settings);

  const onCountdownDone = useCallback(() => {
    setCounting(false);
    start();
  }, [start]);

  const arrivedRef = useRef(0);
  useEffect(() => {
    if (!state) return;
    const home = state.turtles.filter((t) => t.arrived).length;
    if (home === arrivedRef.current) return;
    if (home > arrivedRef.current) playCue("correct");
    arrivedRef.current = home;
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
    arrivedRef.current = 0;
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
    const r = turtleEngine.result(state);
    return (
      <PlayFrame>
        <Hud game={GAME} level={GAME.name} />
        <ResultScreen
          game={GAME}
          headline={`${r.home} / ${r.total}`}
          sublabel="turtles brought home"
          verdict={{
            text: `Reached ${r.level} turtles at once`,
            tone: r.level > settings.startTurtles ? "up" : "hold",
          }}
          rows={[
            { label: "Turtles home", value: `${r.home} of ${r.total}`, tone: "good" },
            { label: "Accuracy", value: `${Math.round(r.accuracy * 100)}%` },
            { label: "Moves made", value: String(r.moves) },
            { label: "Most turtles at once", value: String(r.level) },
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
          level={`${settings.startTurtles} turtles to start`}
          onStart={() => setCounting(true)}
          instructions={
            <>
              <p>
                Tap a turtle to pick it up, then tap an adjacent square to move it. Every turtle has a
                matching home in its own colour.
              </p>
              <p className="mt-3 text-[13px] text-[var(--text-faint)]">
                One square at a time, never diagonally, never through rocks or another turtle. Their routes
                cross, so the order you move them in matters. {settings.secondsPerRound}s a board.
              </p>
            </>
          }
        />
      </PlayFrame>
    );
  }

  const playing = state?.stage === "playing";
  const reviewing = state?.stage === "review";
  const selected = state?.turtles.find((t) => t.id === state.selected) ?? null;
  const secondsLeft = state && playing
    ? Math.max(0, Math.ceil(settings.secondsPerRound - (state.elapsed - state.stageStart) / 1000))
    : 0;
  const home = state?.turtles.filter((t) => t.arrived).length ?? 0;

  return (
    <PlayFrame>
      <Hud
        game={GAME}
        level={`Board ${(state?.round ?? 0) + 1} of ${settings.rounds}`}
        progress={state ? { current: home, total: state.turtles.length } : undefined}
        score={`${secondsLeft}s`}
        onPause={status === "running" ? pause : undefined}
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
        {counting ? (
          <Countdown onDone={onCountdownDone} />
        ) : state ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 p-4">
            <p className="h-5 text-[13px] text-[var(--text-muted)]" aria-live="polite">
              {reviewing
                ? `${home} of ${state.turtles.length} home`
                : selected
                  ? "Now tap where it should step"
                  : "Tap a turtle to move it"}
            </p>

            <div
              className="grid w-full max-w-[min(88vw,28rem)] gap-1.5"
              style={{ gridTemplateColumns: `repeat(${settings.size}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: settings.size * settings.size }, (_, index) => {
                const point = indexToPoint(index, settings.size);
                const turtle = state.turtles.find((t) => samePoint(t.at, point));
                const homeOf = state.turtles.find((t) => samePoint(t.home, point));
                const isRock = state.rocks.some((r) => samePoint(r, point));
                const isSelected = turtle && turtle.id === state.selected;
                const reachable =
                  playing &&
                  selected &&
                  isAdjacent(selected.at, point) &&
                  !isRock &&
                  !state.turtles.some((t) => t.id !== selected.id && !t.arrived && samePoint(t.at, point));

                const hue = turtle ? HUES[turtle.id % HUES.length]! : homeOf ? HUES[homeOf.id % HUES.length]! : null;

                return (
                  <button
                    key={index}
                    type="button"
                    disabled={!playing}
                    aria-label={
                      turtle
                        ? `Turtle ${turtle.id + 1}`
                        : homeOf
                          ? `Home ${homeOf.id + 1}`
                          : isRock
                            ? "Rock"
                            : `Square ${point.x + 1}, ${point.y + 1}`
                    }
                    onPointerDown={(e) => {
                      e.preventDefault();
                      send({ kind: "select", index });
                    }}
                    className={cx(
                      "relative grid aspect-square place-items-center rounded-lg border-2 transition-all",
                      isRock
                        ? "border-[var(--border-strong)] bg-[var(--border-strong)]"
                        : "border-[var(--border)] bg-[var(--surface)]",
                      isSelected && "scale-105 ring-2 ring-[var(--accent)]",
                      reachable && "ring-2 ring-[var(--accent)]/30",
                    )}
                    style={
                      homeOf && !turtle
                        ? { borderColor: `var(${hue})`, borderStyle: "dashed", background: `color-mix(in oklch, var(${hue}) 12%, transparent)` }
                        : undefined
                    }
                  >
                    {isRock ? null : turtle ? (
                      <span
                        className={cx(
                          "grid size-[78%] place-items-center rounded-full text-[11px] font-bold",
                          turtle.arrived && "opacity-70",
                        )}
                        style={{ background: `var(${hue})`, color: "var(--accent-text)" }}
                      >
                        {turtle.arrived ? "✓" : turtle.id + 1}
                      </span>
                    ) : homeOf ? (
                      <span className="text-[11px] font-semibold" style={{ color: `var(${hue})` }}>
                        {homeOf.id + 1}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <p className="h-5 text-[12px] text-[var(--text-faint)]">
              {playing ? `${state.turtles.length - home} still out` : ""}
            </p>
          </div>
        ) : null}

        {status === "paused" ? <PauseOverlay game={GAME} onResume={resume} onRestart={again} /> : null}
      </div>
    </PlayFrame>
  );
}
