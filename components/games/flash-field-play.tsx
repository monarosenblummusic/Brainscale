"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useGameEngine } from "@/hooks/useGameEngine";
import { useGameSettings } from "@/lib/store/hooks";
import { GAME_BY_ID } from "@/lib/games";
import {
  RINGS,
  SPOKES,
  flashFieldEngine,
  type FlashFieldConfig,
  type FlashFieldState,
} from "@/lib/engine/flash-field";
import { playCue } from "@/lib/audio";
import { Countdown, Hud, PauseOverlay, PlayFrame, ResultScreen, StartGate } from "@/components/game-shell";
import { Button, cx } from "@/components/ui";
import type { GameId } from "@/lib/types";

/** Polar placement, with 0 straight up and angles running clockwise. */
function position(spoke: number, ring: number) {
  const angle = (spoke / SPOKES) * Math.PI * 2 - Math.PI / 2;
  const radius = RINGS[ring] ?? RINGS[RINGS.length - 1]!;
  return { x: 50 + Math.cos(angle) * radius * 50, y: 50 + Math.sin(angle) * radius * 50 };
}

function CarGlyph({ kind }: { kind: string }) {
  return kind === "truck" ? (
    <svg viewBox="0 0 64 32" className="size-full" aria-hidden="true">
      <path d="M2 22V8h30v14zM32 22V12h12l8 6v4z" fill="var(--accent)" />
      <circle cx="14" cy="24" r="4" fill="var(--text)" />
      <circle cx="44" cy="24" r="4" fill="var(--text)" />
    </svg>
  ) : (
    <svg viewBox="0 0 64 32" className="size-full" aria-hidden="true">
      <path d="M4 22v-6l8-8h26l10 8h4v6z" fill="var(--accent)" />
      <circle cx="17" cy="24" r="4" fill="var(--text)" />
      <circle cx="45" cy="24" r="4" fill="var(--text)" />
    </svg>
  );
}

function BirdGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="size-full" aria-hidden="true">
      <path d="M2 12c6 0 7 5 14 5s10-7 14-8c0 8-6 15-14 15S4 20 2 12Z" fill="var(--accent)" />
    </svg>
  );
}

export function FlashFieldPlay({
  gameId,
  defaults,
  instructions,
  targetName,
}: {
  gameId: Extract<GameId, "double-decision" | "hawkeye">;
  defaults: FlashFieldConfig;
  instructions: ReactNode;
  targetName: string;
}) {
  const game = GAME_BY_ID[gameId];
  const { settings, loaded } = useGameSettings<FlashFieldConfig>(gameId, defaults);
  const [counting, setCounting] = useState(false);

  const { state, status, start, pause, resume, reset, send } = useGameEngine(flashFieldEngine, settings);

  const onCountdownDone = useCallback(() => {
    setCounting(false);
    start();
  }, [start]);

  const gradedRef = useRef(0);
  useEffect(() => {
    if (!state || state.trial === gradedRef.current) return;
    gradedRef.current = state.trial;
    if (state.lastTrialCorrect !== null) playCue(state.lastTrialCorrect ? "correct" : "wrong");
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
    const r = flashFieldEngine.result(state);
    return (
      <PlayFrame>
        <Hud game={game} level={game.name} />
        <ResultScreen
          game={game}
          headline={`${r.bestMs}ms`}
          sublabel="shortest flash you handled"
          verdict={{
            text:
              r.bestMs <= 100
                ? "Below the time it takes to move your eyes — that is the whole point"
                : "Keep your eyes on the centre and it will come down",
            tone: r.bestMs <= 100 ? "up" : "hold",
          }}
          rows={[
            { label: "Shortest clean flash", value: `${r.bestMs} ms`, tone: "good" },
            { label: "Trials correct", value: `${r.correct} of ${r.trials}` },
            { label: "Accuracy", value: `${Math.round(r.accuracy * 100)}%` },
            { label: "Field width reached", value: `Ring ${r.ring + 1} of ${RINGS.length}` },
            { label: "Ending flash", value: `${r.finalMs} ms` },
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
        <StartGate game={game} level={`${settings.trials} flashes`} onStart={() => setCounting(true)} instructions={instructions} />
      </PlayFrame>
    );
  }

  const showField = state?.stage === "flash";
  const showMask = state?.stage === "mask";
  const locating = state?.stage === "locate";
  const asking = state?.stage === "centre";
  const reviewing = state?.stage === "feedback";
  const targets = state?.marks.filter((m) => m.isTarget) ?? [];

  return (
    <PlayFrame>
      <Hud
        game={game}
        level={`${state?.exposureMs ?? settings.startMs} ms`}
        progress={state ? { current: state.trial, total: settings.trials } : undefined}
        score={state ? `${state.correct} correct` : undefined}
        onPause={status === "running" ? pause : undefined}
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
        {counting ? (
          <Countdown onDone={onCountdownDone} />
        ) : state ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 p-4">
            <p className="h-5 text-[13px] font-medium uppercase tracking-wider text-[var(--text-faint)]" aria-live="polite">
              {state.stage === "fixation"
                ? "Eyes on the centre"
                : asking
                  ? "What was in the middle?"
                  : locating
                    ? `Where ${settings.targets === 1 ? "was it" : "were they"}?`
                    : reviewing
                      ? state.lastTrialCorrect
                        ? "Correct"
                        : "Not quite"
                      : ""}
            </p>

            {/* The field. Everything is absolutely placed on one square so a
                mark never shifts between the flash and the response. */}
            <div className="relative aspect-square w-full max-w-[min(88vw,30rem)] rounded-full border border-[var(--border)] bg-[var(--surface)]">
              {/* Fixation mark — always present, so the eye has an anchor. */}
              <span
                className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--text-faint)]"
                aria-hidden="true"
              />

              {/* Central discrimination stimulus */}
              {settings.centralTask && showField ? (
                <div className="absolute left-1/2 top-1/2 h-[14%] w-[26%] -translate-x-1/2 -translate-y-1/2">
                  <CarGlyph kind={state.centre} />
                </div>
              ) : null}

              {settings.centralTask && showMask ? (
                <div
                  className="absolute left-1/2 top-1/2 h-[16%] w-[28%] -translate-x-1/2 -translate-y-1/2 rounded bg-[var(--border-strong)]"
                  aria-hidden="true"
                />
              ) : null}

              {/* Peripheral marks */}
              {state.marks.map((mark, i) => {
                const { x, y } = position(mark.spoke, mark.ring);
                const visible = showField || (showMask && true);
                if (!visible) return null;
                return (
                  <div
                    key={i}
                    className="absolute size-[11%] -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${x}%`, top: `${y}%` }}
                  >
                    {showMask ? (
                      <span className="block size-full rounded bg-[var(--border-strong)]" aria-hidden="true" />
                    ) : mark.isTarget ? (
                      gameId === "hawkeye" ? (
                        <BirdGlyph />
                      ) : (
                        <span className="grid size-full place-items-center rounded-full bg-[var(--accent)] text-[10px] font-bold text-[var(--accent-text)]">
                          66
                        </span>
                      )
                    ) : (
                      <span className="block size-full rounded-full border-2 border-[var(--text-faint)]" aria-hidden="true" />
                    )}
                  </div>
                );
              })}

              {/* Response spokes */}
              {locating || reviewing
                ? Array.from({ length: SPOKES }, (_, spoke) => {
                    const { x, y } = position(spoke, state.ring);
                    const chosen = state.picked.includes(spoke);
                    const wasTarget = targets.some((t) => t.spoke === spoke);
                    return (
                      <button
                        key={spoke}
                        type="button"
                        disabled={!locating}
                        aria-label={`Position ${spoke + 1}`}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          send({ kind: "select", index: spoke });
                        }}
                        style={{ left: `${x}%`, top: `${y}%` }}
                        className={cx(
                          "absolute size-[13%] min-h-11 min-w-11 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-all",
                          reviewing && wasTarget
                            ? "border-[var(--success)] bg-[var(--success-soft)]"
                            : chosen
                              ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                              : "border-[var(--border-strong)] bg-[var(--bg-subtle)]",
                          locating && !chosen && "hover:border-[var(--accent)] active:scale-95",
                        )}
                      />
                    );
                  })
                : null}
            </div>

            {/* Central question */}
            <div className="flex h-16 items-center gap-2.5">
              {asking ? (
                <>
                  <Button variant="secondary" size="lg" onClick={() => send({ kind: "answer", value: "car" })}>
                    Car
                  </Button>
                  <Button variant="secondary" size="lg" onClick={() => send({ kind: "answer", value: "truck" })}>
                    Truck
                  </Button>
                </>
              ) : locating ? (
                <p className="text-[13px] text-[var(--text-faint)]">
                  Tap {settings.targets === 1 ? "the position" : `all ${settings.targets} positions`} where you saw
                  the {targetName}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {status === "paused" ? <PauseOverlay game={game} onResume={resume} onRestart={again} /> : null}
      </div>
    </PlayFrame>
  );
}
