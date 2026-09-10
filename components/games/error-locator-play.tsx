"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGameEngine } from "@/hooks/useGameEngine";
import { useGameSettings } from "@/lib/store/hooks";
import { GAME_BY_ID } from "@/lib/games";
import {
  ERROR_LOCATOR_DEFAULTS,
  FAULT_LABEL,
  errorLocatorEngine,
  type ErrorLocatorConfig,
} from "@/lib/engine/error-locator";
import { playCue } from "@/lib/audio";
import { Countdown, Hud, PauseOverlay, PlayFrame, ResultScreen, StartGate } from "@/components/game-shell";
import { cx } from "@/components/ui";

const GAME = GAME_BY_ID["error-locator"];

export function ErrorLocatorPlay() {
  const { settings, loaded } = useGameSettings<ErrorLocatorConfig>("error-locator", ERROR_LOCATOR_DEFAULTS);
  const [counting, setCounting] = useState(false);

  const { state, status, start, pause, resume, reset, send } = useGameEngine(errorLocatorEngine, settings);

  const onCountdownDone = useCallback(() => {
    setCounting(false);
    start();
  }, [start]);

  const tappedRef = useRef(0);
  useEffect(() => {
    if (!state || state.tapped.length === tappedRef.current) return;
    const grew = state.tapped.length > tappedRef.current;
    tappedRef.current = state.tapped.length;
    if (!grew) return;
    const last = state.tapped[state.tapped.length - 1];
    if (last === undefined) return;
    playCue(state.tokens[last]?.fault ? "correct" : "wrong");
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
    tappedRef.current = 0;
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
    const r = errorLocatorEngine.result(state);
    return (
      <PlayFrame>
        <Hud game={GAME} level={GAME.name} />
        <ResultScreen
          game={GAME}
          headline={`${r.found} / ${r.planted}`}
          sublabel={`faults found${r.wrongTaps > 0 ? ` · ${r.wrongTaps} wrong taps` : ""}`}
          verdict={{
            text: `Reached ${r.level} faults per passage`,
            tone: r.level > settings.startFaults ? "up" : "hold",
          }}
          rows={[
            { label: "Found", value: `${r.found} of ${r.planted}`, tone: "good" },
            { label: "Missed", value: String(r.planted - r.found), tone: r.planted > r.found ? "bad" : "default" },
            { label: "Wrong taps", value: String(r.wrongTaps), tone: r.wrongTaps > 0 ? "bad" : "default" },
            { label: "Accuracy", value: `${Math.round(r.accuracy * 100)}%` },
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
          level={`${settings.startFaults} faults per passage`}
          onStart={() => setCounting(true)}
          instructions={
            <>
              <p>Tap every word that is wrong: a doubled word, a misspelling, or missing punctuation.</p>
              <p className="mt-3 text-[13px] text-[var(--text-faint)]">
                {settings.strikes} wrong taps end the passage. Reading for meaning works against you here —
                comprehension smooths right over a doubled word.
              </p>
            </>
          }
        />
      </PlayFrame>
    );
  }

  const hunting = state?.stage === "hunting";
  const reviewing = state?.stage === "review";
  const foundThisRound = state ? state.tapped.filter((i) => state.tokens[i]?.fault).length : 0;
  const wrongThisRound = state ? state.tapped.length - foundThisRound : 0;
  const secondsLeft = state && hunting
    ? Math.max(0, Math.ceil(settings.secondsPerRound - (state.elapsed - state.stageStart) / 1000))
    : 0;

  return (
    <PlayFrame>
      <Hud
        game={GAME}
        level={`Passage ${(state?.round ?? 0) + 1} of ${settings.rounds}`}
        progress={state ? { current: foundThisRound, total: state.faultsPlanted } : undefined}
        score={state ? `${"·".repeat(Math.max(0, settings.strikes - wrongThisRound))} ${secondsLeft}s` : undefined}
        onPause={status === "running" ? pause : undefined}
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
        {counting ? (
          <Countdown onDone={onCountdownDone} />
        ) : state ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-y-auto p-5">
            <p className="text-[13px] font-medium uppercase tracking-wider text-[var(--text-faint)]" aria-live="polite">
              {reviewing
                ? `${foundThisRound} of ${state.faultsPlanted} found`
                : `Find ${state.faultsPlanted} fault${state.faultsPlanted === 1 ? "" : "s"}`}
            </p>

            <p className="max-w-[min(94vw,40rem)] text-[clamp(1rem,3.6vw,1.25rem)] leading-[2]">
              {state.tokens.map((token, i) => {
                const tapped = state.tapped.includes(i);
                const isFault = token.fault !== null;
                const reveal = reviewing && isFault && !tapped;

                return (
                  <span key={i}>
                    <button
                      type="button"
                      disabled={!hunting}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        send({ kind: "select", index: i });
                      }}
                      title={reviewing && isFault ? FAULT_LABEL[token.fault!] : undefined}
                      className={cx(
                        "rounded px-0.5 transition-colors",
                        tapped && isFault
                          ? "bg-[var(--success-soft)] text-[var(--success)] underline decoration-[var(--success)] decoration-2 underline-offset-4"
                          : tapped
                            ? "bg-[var(--danger-soft)] text-[var(--danger)] line-through"
                            : reveal
                              ? "bg-[var(--warning)]/20 text-[var(--warning)] underline decoration-dotted underline-offset-4"
                              : hunting
                                ? "hover:bg-[var(--accent-soft)]"
                                : "",
                      )}
                    >
                      {token.text}
                    </button>{" "}
                  </span>
                );
              })}
            </p>

            {reviewing ? (
              <div className="flex flex-wrap justify-center gap-2 text-[12px]">
                {state.tokens
                  .map((t, i) => ({ t, i }))
                  .filter(({ t }) => t.fault)
                  .map(({ t, i }) => (
                    <span
                      key={i}
                      className={cx(
                        "rounded-md px-2 py-1",
                        state.tapped.includes(i)
                          ? "bg-[var(--success-soft)] text-[var(--success)]"
                          : "bg-[var(--bg-subtle)] text-[var(--text-muted)]",
                      )}
                    >
                      {FAULT_LABEL[t.fault!]}
                      {t.correction && t.correction !== "(remove)" ? ` → ${t.correction}` : ""}
                    </span>
                  ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {status === "paused" ? <PauseOverlay game={GAME} onResume={resume} onRestart={again} /> : null}
      </div>
    </PlayFrame>
  );
}
