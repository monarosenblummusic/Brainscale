"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGameEngine } from "@/hooks/useGameEngine";
import { useGameSettings, useLastLevel } from "@/lib/store/hooks";
import { GAME_BY_ID } from "@/lib/games";
import {
  MODALITY_LABEL,
  NBACK_DEFAULTS,
  isTarget,
  modeLabel,
  nbackEngine,
  trialsForLevel,
  trialMsForLevel,
  type Modality,
  type NBackConfig,
} from "@/lib/engine/nback";
import { POLICIES } from "@/lib/engine/adaptive";
import { playCue, playStimulus, waitForVoices, type AudioMode } from "@/lib/audio";
import { Countdown, Hud, PauseOverlay, PlayFrame, ResultScreen, Stage, StartGate, useCountdown } from "@/components/game-shell";
import { NBackGrid, ResponseButtons } from "@/components/games/nback-stimulus";
import { Kbd } from "@/components/ui";
import type { Session } from "@/lib/types";

const GAME = GAME_BY_ID["n-back"];

export interface NBackPrefs extends NBackConfig {
  audioMode: AudioMode;
  shapeRedundancy: boolean;
}

export const NBACK_PREFS: NBackPrefs = {
  ...NBACK_DEFAULTS,
  audioMode: "speech",
  shapeRedundancy: false,
};

export function NBackPlay() {
  const { settings, loaded } = useGameSettings<NBackPrefs>("n-back", NBACK_PREFS);
  const storedLevel = useLastLevel("n-back", NBACK_PREFS.n);
  const [level, setLevel] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const [lastSession, setLastSession] = useState<Session | null>(null);
  const [audioFallback, setAudioFallback] = useState(false);

  // The level to play is the one the adaptive policy left us on, unless the
  // player has pinned it manually.
  useEffect(() => {
    if (level !== null || storedLevel === null || !loaded) return;
    setLevel(settings.policy === "manual" ? settings.n : storedLevel);
  }, [level, storedLevel, loaded, settings.policy, settings.n]);

  const config: NBackConfig = { ...settings, n: level ?? settings.n };

  const onFinish = useCallback((session: Session) => setLastSession(session), []);
  const { state, status, start, pause, resume, reset, send } = useGameEngine(nbackEngine, config, { onFinish });

  /* --- Audio: fire once per trial, on the trial the engine is presenting --- */
  const lastSpokenRef = useRef(-1);
  useEffect(() => {
    if (!state || status !== "running") return;
    if (!config.modalities.includes("audio")) return;
    if (state.index === lastSpokenRef.current) return;

    lastSpokenRef.current = state.index;
    const stimulus = state.trials[state.index];
    if (!stimulus) return;
    const used = playStimulus(stimulus.audio, settings.audioMode);
    if (used !== settings.audioMode) setAudioFallback(true);
  }, [state, status, config.modalities, settings.audioMode]);

  useEffect(() => {
    if (settings.audioMode === "speech" && config.modalities.includes("audio")) {
      void waitForVoices().then((ok) => setAudioFallback(!ok));
    }
  }, [settings.audioMode, config.modalities]);

  /* ---------------------------- Keyboard ---------------------------------- */
  const beginCountdown = useCallback(() => {
    lastSpokenRef.current = -1;
    setCounting(true);
  }, []);

  const respond = useCallback(
    (m: Modality) => {
      if (status !== "running" || !state) return;
      if (state.responded[m]) return;
      send({ kind: "respond", channel: m });
      if (settings.feedback) {
        playCue(isTarget(state.trials, state.index, state.n, m) ? "correct" : "wrong");
      }
    },
    [status, state, send, settings.feedback],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;

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

      const key = e.key.toLowerCase();
      for (const m of config.modalities) {
        if (settings.keys[m] === key) {
          e.preventDefault();
          respond(m);
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, config.modalities, settings.keys, respond, pause, resume, beginCountdown]);

  const countdownValue = useCountdown(counting, 3, () => {
    setCounting(false);
    start();
  });

  const again = useCallback(() => {
    const next = lastSession?.metrics?.nextLevel;
    if (typeof next === "number") setLevel(next);
    setLastSession(null);
    reset();
    beginCountdown();
  }, [lastSession, reset, beginCountdown]);

  if (!loaded || level === null) {
    return (
      <PlayFrame>
        <div className="grid flex-1 place-items-center text-[13px] text-[var(--text-faint)]">Loading…</div>
      </PlayFrame>
    );
  }

  const trialCount = trialsForLevel(config.n);
  const pacing = trialMsForLevel(config, config.n);

  /* -------------------------------- Finished ------------------------------ */
  if (status === "finished" && state) {
    const r = nbackEngine.result(state);
    const verdictText =
      r.direction === "up"
        ? `Level up — next block is ${r.nextLevel}-back`
        : r.direction === "down"
          ? `Dropping back to ${r.nextLevel}-back`
          : `Holding at ${r.nextLevel}-back`;

    return (
      <PlayFrame>
        <Hud game={GAME} level={modeLabel(config)} />
        <ResultScreen
          game={GAME}
          headline={`${Math.round(r.accuracy * 100)}%`}
          sublabel={POLICIES[config.policy].id === "jaeggi" ? "weakest modality" : "average accuracy"}
          verdict={{ text: verdictText, tone: r.direction }}
          rows={[
            { label: "Level played", value: `${config.n}-back` },
            ...r.perModality.map((p) => ({
              label: MODALITY_LABEL[p.modality],
              value: `${Math.round(p.accuracy * 100)}%  ·  ${p.score.hits}/${p.score.targets} hits, ${p.score.falseAlarms} false`,
              tone: (p.accuracy >= 0.9 ? "good" : p.accuracy < 0.7 ? "bad" : "default") as "good" | "bad" | "default",
            })),
            { label: "Trials", value: String(trialCount) },
            { label: "Training mode", value: POLICIES[config.policy].name },
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
        <Hud game={GAME} level={modeLabel(config)} />
        <StartGate
          game={GAME}
          level={modeLabel(config)}
          onStart={beginCountdown}
          instructions={
            <>
              <p>
                Respond when the current stimulus matches the one{" "}
                <strong className="font-semibold text-[var(--text)]">{config.n} step{config.n === 1 ? "" : "s"}</strong>{" "}
                back.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2">
                {config.modalities.map((m) => (
                  <span key={m} className="flex items-center gap-1.5 text-[13px]">
                    <Kbd>{settings.keys[m]?.toUpperCase()}</Kbd>
                    <span className="text-[var(--text-muted)]">{MODALITY_LABEL[m]}</span>
                  </span>
                ))}
              </div>
              <p className="mt-4 text-[13px] text-[var(--text-faint)]">
                {trialCount} trials · {(pacing / 1000).toFixed(1)}s each · about{" "}
                {Math.round((trialCount * pacing) / 60000)} min
              </p>
              {audioFallback && config.modalities.includes("audio") ? (
                <p className="mt-3 rounded-lg bg-[var(--bg-subtle)] px-3 py-2 text-[12px] text-[var(--text-muted)]">
                  No speech voice available in this browser — the audio channel will use tones instead.
                </p>
              ) : null}
            </>
          }
        />
      </PlayFrame>
    );
  }

  /* -------------------------------- Playing ------------------------------- */
  const stimulus = state?.trials[state.index] ?? null;

  return (
    <PlayFrame>
      <Hud
        game={GAME}
        level={modeLabel(config)}
        progress={state ? { current: Math.min(state.index + 1, trialCount), total: trialCount } : undefined}
        onPause={status === "running" ? pause : undefined}
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
        {counting ? (
          <Countdown value={countdownValue} />
        ) : (
          <Stage>
            <NBackGrid
              stimulus={stimulus}
              visible={state?.stimulusVisible ?? false}
              modalities={config.modalities}
              shapeRedundancy={settings.shapeRedundancy}
            />
            <ResponseButtons
              modalities={config.modalities}
              keys={settings.keys}
              responded={state?.responded ?? {}}
              feedback={settings.feedback ? (state?.lastFeedback ?? {}) : {}}
              onRespond={respond}
              disabled={status !== "running"}
            />
          </Stage>
        )}

        {status === "paused" ? (
          <PauseOverlay
            game={GAME}
            onResume={resume}
            onRestart={() => {
              reset();
              beginCountdown();
            }}
          />
        ) : null}
      </div>
    </PlayFrame>
  );
}
