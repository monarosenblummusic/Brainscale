"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BaseState, Engine, InputEvent } from "@/lib/engine/types";
import { randomSeed } from "@/lib/engine/rng";
import { store } from "@/lib/store/indexeddb";
import { playCue, stopSpeech, unlockAudio } from "@/lib/audio";
import type { Session } from "@/lib/types";

export type RunStatus = "ready" | "running" | "paused" | "finished";

/**
 * The single bridge between a pure engine and React.
 *
 * Timing is derived from `performance.now()` rather than accumulated from
 * frame deltas: a dropped frame or a backgrounded tab would otherwise let the
 * session clock drift away from real time, and for PASAT and n-back the
 * interval *is* the difficulty.
 */
export function useGameEngine<C, S extends BaseState, R>(
  engine: Engine<C, S, R>,
  config: C,
  options: { seed?: number; onFinish?: (session: Session) => void } = {},
) {
  const { seed: fixedSeed, onFinish } = options;

  const [state, setState] = useState<S | null>(null);
  const [status, setStatus] = useState<RunStatus>("ready");

  const stateRef = useRef<S | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const originRef = useRef(0);
  const pausedAtRef = useRef(0);
  const pausedTotalRef = useRef(0);
  const savedRef = useRef(false);
  const configRef = useRef(config);
  configRef.current = config;

  const commit = useCallback((next: S) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const finish = useCallback(
    (final: S) => {
      stopLoop();
      stopSpeech();
      setStatus("finished");
      playCue("finish");

      if (savedRef.current) return;
      savedRef.current = true;

      const row = engine.toSession(final, configRef.current, startedAtRef.current);
      const session: Session = { ...row, id: `${row.gameId}-${startedAtRef.current}-${row.seed}` };
      void store.sessions.save(session).then(() => onFinish?.(session));
    },
    [engine, onFinish, stopLoop],
  );

  const loop = useCallback(() => {
    const current = stateRef.current;
    if (!current) return;

    const elapsed = performance.now() - originRef.current - pausedTotalRef.current;
    const next = engine.tick(current, elapsed);
    if (next !== current) commit(next);

    if (engine.isFinished(next)) {
      finish(next);
      return;
    }
    rafRef.current = requestAnimationFrame(loop);
  }, [engine, commit, finish]);

  const start = useCallback(() => {
    unlockAudio();
    const seed = fixedSeed ?? randomSeed();
    const initial = engine.init(configRef.current, seed);

    savedRef.current = false;
    startedAtRef.current = Date.now();
    originRef.current = performance.now();
    pausedTotalRef.current = 0;
    pausedAtRef.current = 0;

    commit(initial);
    setStatus("running");
    playCue("start");

    stopLoop();
    rafRef.current = requestAnimationFrame(loop);
  }, [engine, fixedSeed, commit, loop, stopLoop]);

  const pause = useCallback(() => {
    if (status !== "running") return;
    stopLoop();
    stopSpeech();
    pausedAtRef.current = performance.now();
    setStatus("paused");
  }, [status, stopLoop]);

  const resume = useCallback(() => {
    if (status !== "paused") return;
    pausedTotalRef.current += performance.now() - pausedAtRef.current;
    setStatus("running");
    rafRef.current = requestAnimationFrame(loop);
  }, [status, loop]);

  const reset = useCallback(() => {
    stopLoop();
    stopSpeech();
    stateRef.current = null;
    setState(null);
    setStatus("ready");
    savedRef.current = false;
  }, [stopLoop]);

  const send = useCallback(
    (event: InputEvent) => {
      const current = stateRef.current;
      if (!current || status !== "running") return;
      const next = engine.input(current, event);
      if (next !== current) commit(next);
      if (engine.isFinished(next)) finish(next);
    },
    [engine, status, commit, finish],
  );

  // Leaving the tab mid-trial would otherwise score every missed stimulus as a
  // silent non-response, so a hidden tab pauses rather than keeps running.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) pause();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [pause]);

  useEffect(() => {
    return () => {
      stopLoop();
      stopSpeech();
    };
  }, [stopLoop]);

  return {
    state,
    status,
    start,
    pause,
    resume,
    reset,
    send,
    result: state && engine.isFinished(state) ? engine.result(state) : null,
  };
}
