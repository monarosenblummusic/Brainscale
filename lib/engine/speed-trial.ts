import type { GameId, Session } from "@/lib/types";
import { createRng, type Rng } from "./rng";
import type { BaseState, Engine, InputEvent } from "./types";

/**
 * Shared core for the speeded-choice games.
 *
 * Chalkboard Challenge, Spatial Speed Match and Agility are the same machine
 * with different questions: show a problem, offer a small set of answers, and
 * take the answer away if the clock beats you. Everything that differs — how a
 * problem is generated, how it is drawn — lives in the generator and the play
 * screen. Everything that is the same lives here: pacing, the response window,
 * the streak multiplier, and how a run ends.
 */

/** A problem is opaque to the engine; only the generator and the UI read `data`. */
export interface Problem<Data = unknown> {
  data: Data;
  /** Index into the play screen's option list. */
  answer: number;
}

export type ProblemGenerator<Data = unknown> = (
  rng: Rng,
  level: number,
  previous: Problem<Data> | null,
) => Problem<Data>;

export interface SpeedTrialConfig {
  gameId: Extract<GameId, "chalkboard" | "spatial-match" | "agility">;
  /** Session length in seconds. */
  durationSec: number;
  /** Time allowed for the first answer. */
  startMs: number;
  /** The floor the response window shortens towards. */
  minMs: number;
  /** Milliseconds shaved off the window per correct answer. */
  quickenMs: number;
  /** Milliseconds returned to the window per wrong or missed answer. */
  slowMs: number;
  /** Difficulty level to begin at; generators interpret it. */
  startLevel: number;
  maxLevel: number;
  /** Correct answers in a row before the difficulty steps up. */
  promoteStreak: number;
}

export const SPEED_TRIAL_DEFAULTS: Omit<SpeedTrialConfig, "gameId"> = {
  durationSec: 90,
  startMs: 5000,
  minMs: 1200,
  quickenMs: 90,
  slowMs: 350,
  startLevel: 1,
  maxLevel: 12,
  promoteStreak: 4,
};

/**
 * Lumosity's metered multiplier, which Chalkboard Challenge documents exactly:
 * the meter fills by one per correct trial, and at five the multiplier steps up
 * (to a maximum of ten) and the meter empties. A wrong answer empties a partly
 * filled meter; a wrong answer on an already-empty meter costs a multiplier.
 */
export const METER_SIZE = 5;
export const MAX_MULTIPLIER = 10;

export interface Meter {
  filled: number;
  multiplier: number;
}

export function advanceMeter(meter: Meter, correct: boolean): Meter {
  if (correct) {
    const filled = meter.filled + 1;
    if (filled >= METER_SIZE) {
      return { filled: 0, multiplier: Math.min(MAX_MULTIPLIER, meter.multiplier + 1) };
    }
    return { ...meter, filled };
  }
  if (meter.filled > 0) return { ...meter, filled: 0 };
  return { filled: 0, multiplier: Math.max(1, meter.multiplier - 1) };
}

export type TrialOutcome = "correct" | "wrong" | "timeout";

export interface SpeedTrialState<Data = unknown> extends BaseState {
  config: SpeedTrialConfig;
  level: number;
  problem: Problem<Data>;
  /** Session time at which the current problem appeared. */
  askedAt: number;
  /** Time allowed for the current problem. */
  windowMs: number;
  meter: Meter;
  score: number;
  correct: number;
  attempted: number;
  streak: number;
  bestStreak: number;
  /** Cumulative time spent on correct answers, for the average. */
  correctMs: number;
  lastOutcome: TrialOutcome | null;
  /** The answer index the player gave, so the UI can flash the right button. */
  lastAnswer: number | null;
}

export interface SpeedTrialResult {
  score: number;
  correct: number;
  attempted: number;
  accuracy: number;
  averageMs: number;
  level: number;
  bestStreak: number;
  multiplier: number;
}

/**
 * Build an engine for one speeded-choice game.
 *
 * Returning a fresh engine per game rather than one engine taking a generator
 * in its config keeps `Data` genuinely typed at the call site, and keeps the
 * generator — which closes over word lists and shape tables — out of the config
 * object that gets serialised into settings storage.
 */
export function createSpeedTrialEngine<Data>(
  generate: ProblemGenerator<Data>,
): Engine<SpeedTrialConfig, SpeedTrialState<Data>, SpeedTrialResult> {
  const engine: Engine<SpeedTrialConfig, SpeedTrialState<Data>, SpeedTrialResult> = {
    id: "speed-trial",

    init(config, seed) {
      const rng = createRng(seed);
      return {
        phase: "responding",
        elapsed: 0,
        seed,
        config,
        level: config.startLevel,
        problem: generate(rng, config.startLevel, null),
        askedAt: 0,
        windowMs: config.startMs,
        meter: { filled: 0, multiplier: 1 },
        score: 0,
        correct: 0,
        attempted: 0,
        streak: 0,
        bestStreak: 0,
        correctMs: 0,
        lastOutcome: null,
        lastAnswer: null,
      };
    },

    tick(state, elapsed) {
      if (state.phase === "finished") return state;

      if (elapsed >= state.config.durationSec * 1000) {
        return { ...state, elapsed, phase: "finished" };
      }

      // Letting the window lapse is a real answer, and it has to cost the same
      // as a wrong one — otherwise waiting out a hard problem would be free.
      if (elapsed - state.askedAt >= state.windowMs) {
        return next(grade({ ...state, elapsed }, null, "timeout"));
      }

      return state.elapsed === elapsed ? state : { ...state, elapsed };
    },

    input(state, event: InputEvent) {
      if (state.phase === "finished") return state;
      if (event.kind !== "select") return state;

      const outcome = event.index === state.problem.answer ? "correct" : "wrong";
      return next(grade(state, event.index, outcome));
    },

    isFinished(state) {
      return state.phase === "finished";
    },

    result(state) {
      return {
        score: state.score,
        correct: state.correct,
        attempted: state.attempted,
        accuracy: state.attempted === 0 ? 0 : state.correct / state.attempted,
        averageMs: state.correct === 0 ? 0 : state.correctMs / state.correct,
        level: state.level,
        bestStreak: state.bestStreak,
        multiplier: state.meter.multiplier,
      };
    },

    toSession(state, config, startedAt): Omit<Session, "id"> {
      const r = engine.result(state);
      return {
        gameId: config.gameId,
        mode: `${config.durationSec}s · level ${r.level}`,
        startedAt,
        durationMs: state.elapsed,
        level: r.level,
        accuracy: r.accuracy,
        score: r.score,
        seed: state.seed,
        metrics: {
          nextLevel: r.level,
          correct: r.correct,
          attempted: r.attempted,
          averageMs: Math.round(r.averageMs),
          bestStreak: r.bestStreak,
          multiplier: r.multiplier,
          windowMs: Math.round(state.windowMs),
        },
      };
    },
  };

  function grade(
    state: SpeedTrialState<Data>,
    answer: number | null,
    outcome: TrialOutcome,
  ): SpeedTrialState<Data> {
    const correct = outcome === "correct";
    const ms = state.elapsed - state.askedAt;
    const meter = advanceMeter(state.meter, correct);
    const streak = correct ? state.streak + 1 : 0;

    // The multiplier in force is the one before the meter rolled over, so a
    // trial is never paid at a rate the player had not yet earned.
    const points = correct ? 10 * state.meter.multiplier : 0;

    const { minMs, startMs, quickenMs, slowMs, maxLevel, promoteStreak } = state.config;
    const windowMs = correct
      ? Math.max(minMs, state.windowMs - quickenMs)
      : Math.min(startMs, state.windowMs + slowMs);

    // Two dials move together: the clock tightens on every correct answer, and
    // the problems themselves get harder on a run of them.
    const level =
      correct && streak > 0 && streak % promoteStreak === 0
        ? Math.min(maxLevel, state.level + 1)
        : !correct && state.streak === 0
          ? Math.max(1, state.level - (outcome === "timeout" ? 1 : 0))
          : state.level;

    return {
      ...state,
      meter,
      windowMs,
      level,
      score: state.score + points,
      correct: state.correct + (correct ? 1 : 0),
      attempted: state.attempted + 1,
      correctMs: state.correctMs + (correct ? ms : 0),
      streak,
      bestStreak: Math.max(state.bestStreak, streak),
      lastOutcome: outcome,
      lastAnswer: answer,
    };
  }

  function next(state: SpeedTrialState<Data>): SpeedTrialState<Data> {
    // Seeded per trial rather than from one long-lived generator, so a session
    // replays identically from its seed however the player answered.
    const rng = createRng(state.seed + state.attempted * 2654435761);
    return {
      ...state,
      problem: generate(rng, state.level, state.problem),
      askedAt: state.elapsed,
    };
  }

  return engine;
}
