import type { Session } from "@/lib/types";
import { createRng } from "./rng";
import type { BaseState, Engine, InputEvent } from "./types";

/**
 * PASAT — Paced Auditory Serial Addition Test (Gronwall, 1977).
 *
 * Digits arrive at a fixed rhythm and each must be added to the digit
 * immediately before it. The universal error is to keep a running total; the
 * task deliberately punishes that, because holding "the previous digit" while
 * simultaneously reporting a sum is the interference being measured.
 *
 * The clock does not wait. That is not incidental — an unpaced version measures
 * arithmetic, and a paced one measures processing speed under load.
 */

/** The four standard inter-stimulus intervals, in the order they are stepped. */
export const ISI_LADDER = [3000, 2400, 2000, 1600] as const;

export interface PasatConfig {
  /** Index into ISI_LADDER. */
  isiLevel: number;
  /** Digits presented. The classic protocol uses 61, giving 60 sums. */
  digits: number;
  /** Speak each digit. The original test is auditory. */
  audio: boolean;
  /** Also show it. Off by default — reading is easier than hearing. */
  visual: boolean;
  adaptive: boolean;
}

export const PASAT_DEFAULTS: PasatConfig = {
  isiLevel: 0,
  digits: 61,
  audio: true,
  visual: true,
  adaptive: true,
};

export function isiFor(level: number): number {
  return ISI_LADDER[Math.min(Math.max(level, 0), ISI_LADDER.length - 1)]!;
}

export interface PasatState extends BaseState {
  config: PasatConfig;
  isi: number;
  sequence: number[];
  /** Index of the digit currently presented. */
  index: number;
  /** Answer typed for the current pair, as digits. */
  entry: string;
  /** Per-pair outcome, index i is the sum of digits i and i+1. */
  outcomes: ("correct" | "wrong" | "missed")[];
  /** Set once the current pair has been answered, to lock out a second try. */
  answered: boolean;
  lastOutcome: "correct" | "wrong" | "missed" | null;
  /** Longest unbroken run of correct sums — the "dyad" measure. */
  longestRun: number;
  currentRun: number;
}

/**
 * Digits 1..9, with no pair summing to a giveaway and no immediate repeats.
 *
 * Repeats are excluded because a repeated digit makes the next sum trivially
 * derivable from the previous one (double it), which hands the player a free
 * item at exactly the moment the task is meant to be hardest.
 */
export function generateDigits(count: number, seed: number): number[] {
  const rng = createRng(seed);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    let d = rng.range(1, 9);
    let guard = 0;
    while (guard++ < 50 && out.length > 0 && d === out[out.length - 1]) d = rng.range(1, 9);
    out.push(d);
  }
  return out;
}

export interface PasatResult {
  correct: number;
  wrong: number;
  missed: number;
  total: number;
  accuracy: number;
  longestRun: number;
  isi: number;
  nextIsiLevel: number;
}

export const pasatEngine: Engine<PasatConfig, PasatState, PasatResult> = {
  id: "pasat",

  init(config, seed) {
    return {
      phase: "presenting",
      elapsed: 0,
      seed,
      config,
      isi: isiFor(config.isiLevel),
      sequence: generateDigits(config.digits, seed),
      index: 0,
      entry: "",
      outcomes: [],
      answered: false,
      lastOutcome: null,
      longestRun: 0,
      currentRun: 0,
    };
  },

  tick(state, elapsed) {
    if (state.phase === "finished") return state;

    const index = Math.floor(elapsed / state.isi);
    if (index === state.index) return state.elapsed === elapsed ? state : { ...state, elapsed };

    // The interval expired. Every pair that went by without an answer is a
    // miss — scored separately from a wrong answer, because failing to keep up
    // and failing to add are different failures.
    let next: PasatState = { ...state, elapsed };
    for (let i = state.index; i < Math.min(index, state.sequence.length); i++) {
      // Pair i is (digit i-1, digit i), so it only exists from i >= 1.
      if (i >= 1 && next.outcomes.length === i - 1) next = record(next, "missed");
    }

    if (index >= state.sequence.length) {
      return { ...next, phase: "finished", index: state.sequence.length };
    }

    return { ...next, index, entry: "", answered: false };
  },

  input(state, event: InputEvent) {
    if (state.phase === "finished") return state;

    if (event.kind === "clear") return { ...state, entry: "" };

    if (event.kind === "answer") {
      const digit = String(event.value);
      if (!/^\d$/.test(digit)) return state;
      if (state.answered || state.index < 1) return state;

      const entry = state.entry + digit;
      const expected = state.sequence[state.index]! + state.sequence[state.index - 1]!;

      // Sums run 3..18, so one digit can only be a complete answer below 10.
      // Waiting for a second keystroke on "1" would eat the trial; waiting on
      // "9" would be pointless. Decide by whether the entry can still grow.
      const couldExtend = entry.length === 1 && Number(entry) === 1;
      if (couldExtend) return { ...state, entry };

      const value = Number(entry);
      return { ...record({ ...state, entry }, value === expected ? "correct" : "wrong"), answered: true };
    }

    if (event.kind === "submit" && state.entry.length > 0 && !state.answered && state.index >= 1) {
      const expected = state.sequence[state.index]! + state.sequence[state.index - 1]!;
      return { ...record(state, Number(state.entry) === expected ? "correct" : "wrong"), answered: true };
    }

    return state;
  },

  isFinished(state) {
    return state.phase === "finished";
  },

  result(state) {
    const correct = state.outcomes.filter((o) => o === "correct").length;
    const wrong = state.outcomes.filter((o) => o === "wrong").length;
    const missed = state.outcomes.filter((o) => o === "missed").length;
    const total = state.outcomes.length;
    const accuracy = total === 0 ? 0 : correct / total;

    // The pace only quickens on a genuinely strong run, and eases at the point
    // where the player is clearly behind rather than merely struggling.
    let nextIsiLevel = state.config.isiLevel;
    if (state.config.adaptive) {
      if (accuracy >= 0.85) nextIsiLevel = Math.min(ISI_LADDER.length - 1, nextIsiLevel + 1);
      else if (accuracy < 0.5) nextIsiLevel = Math.max(0, nextIsiLevel - 1);
    }

    return { correct, wrong, missed, total, accuracy, longestRun: state.longestRun, isi: state.isi, nextIsiLevel };
  },

  toSession(state, config, startedAt): Omit<Session, "id"> {
    const r = pasatEngine.result(state);
    return {
      gameId: "pasat",
      mode: `${(r.isi / 1000).toFixed(1)}s pace · ${config.digits} digits`,
      startedAt,
      durationMs: state.sequence.length * state.isi,
      // Level is the pace, counted up so that "higher is harder" holds on the
      // stats chart the way it does for every other exercise.
      level: config.isiLevel + 1,
      accuracy: r.accuracy,
      score: r.correct,
      seed: state.seed,
      metrics: {
        nextLevel: r.nextIsiLevel + 1,
        nextIsiLevel: r.nextIsiLevel,
        isiMs: r.isi,
        correct: r.correct,
        wrong: r.wrong,
        missed: r.missed,
        longestRun: r.longestRun,
      },
    };
  },
};

function record(state: PasatState, outcome: "correct" | "wrong" | "missed"): PasatState {
  const currentRun = outcome === "correct" ? state.currentRun + 1 : 0;
  return {
    ...state,
    outcomes: [...state.outcomes, outcome],
    lastOutcome: outcome,
    currentRun,
    longestRun: Math.max(state.longestRun, currentRun),
  };
}
