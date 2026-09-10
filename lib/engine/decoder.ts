import type { Session } from "@/lib/types";
import { createRng } from "./rng";
import type { BaseState, Engine, InputEvent } from "./types";

/**
 * Decoder — Rapid Visual Information Processing.
 *
 * Digits arrive at a fixed rate and the player presses when the last three form
 * a run that steps up by two. It is a vigilance task: any one judgement is
 * trivial, and the difficulty is entirely in sustaining it while the stream
 * refuses to pause.
 *
 * The classic RVIP uses digits 2-9 at 100 per minute with three target
 * sequences, which is exactly what Peak's Decoder runs.
 */

export const TARGET_SEQUENCES = [
  [2, 4, 6],
  [3, 5, 7],
  [4, 6, 8],
] as const;

/** Digits 2-9 — 0 and 1 are excluded, as in the original task. */
const DIGITS = [2, 3, 4, 5, 6, 7, 8, 9];

export interface DecoderConfig {
  /** Milliseconds per digit. 600 is the canonical 100 digits a minute. */
  intervalMs: number;
  /** Session length in seconds. */
  durationSec: number;
  /** Target sequences per minute. */
  targetsPerMinute: number;
  /**
   * How long after the third digit a response still counts, in digits. Two
   * digits is the usual allowance — long enough for a considered press, short
   * enough that it cannot be a delayed reaction to the next sequence.
   */
  responseDigits: number;
  adaptive: boolean;
}

export const DECODER_DEFAULTS: DecoderConfig = {
  intervalMs: 600,
  durationSec: 180,
  targetsPerMinute: 8,
  responseDigits: 2,
  adaptive: true,
};

export interface DecoderState extends BaseState {
  config: DecoderConfig;
  stream: number[];
  /** Indices at which a target sequence *completes*. */
  targets: number[];
  /** Target indices the player has already claimed. */
  claimed: number[];
  /** Target indices whose response window has closed unclaimed. */
  missed: number[];
  index: number;
  hits: number;
  falseAlarms: number;
  /** Set briefly so the UI can flash the outcome of a press. */
  lastPress: { at: number; outcome: "hit" | "falseAlarm" } | null;
  longestRun: number;
  currentRun: number;
}

function completesTarget(stream: number[], i: number): boolean {
  if (i < 2) return false;
  const run = [stream[i - 2]!, stream[i - 1]!, stream[i]!];
  return TARGET_SEQUENCES.some((t) => t[0] === run[0] && t[1] === run[1] && t[2] === run[2]);
}

/** Every index at which the stream completes a target sequence. */
export function findCompletions(stream: number[]): number[] {
  const out: number[] = [];
  for (let i = 2; i < stream.length; i++) if (completesTarget(stream, i)) out.push(i);
  return out;
}

/**
 * Build the stream with a controlled number of targets.
 *
 * Two rules make the score mean something. Targets are *placed* at a fixed rate
 * rather than left to chance, so a session's difficulty does not depend on the
 * draw. And a filler digit is rejected if it would complete a sequence in any
 * window it touches — including the two windows that reach *forward* into a
 * sequence planted after it. That forward case is the subtle one: a filler 2
 * sitting just before a planted 4-6-8 silently creates a 2-4-6 nobody planned.
 *
 * The returned target list is then read back off the finished stream rather
 * than assumed from the plan, so what the engine scores is by construction what
 * the player actually sees.
 */
export function generateStream(length: number, targetCount: number, seed: number) {
  const rng = createRng(seed);
  const slots: (number | null)[] = new Array(length).fill(null);

  // Sequences occupy three slots, so starts are kept at least three apart.
  const candidates = rng.shuffle(Array.from({ length: Math.max(0, length - 2) }, (_, i) => i));
  const starts: number[] = [];
  for (const start of candidates) {
    if (starts.length >= targetCount) break;
    if (starts.every((chosen) => Math.abs(chosen - start) >= 3)) starts.push(start);
  }

  for (const start of starts) {
    const seq = rng.pick(TARGET_SEQUENCES);
    for (let k = 0; k < 3; k++) slots[start + k] = seq[k]!;
  }

  const planned = new Set(starts.map((start) => start + 2));
  const isTargetTriple = (a: number, b: number, c: number) =>
    TARGET_SEQUENCES.some((t) => t[0] === a && t[1] === b && t[2] === c);

  /** Would putting `value` at `i` complete an unplanned sequence anywhere? */
  const creates = (i: number, value: number): boolean => {
    slots[i] = value;
    try {
      for (let j = i; j <= i + 2 && j < length; j++) {
        if (j < 2) continue;
        const a = slots[j - 2];
        const b = slots[j - 1];
        const c = slots[j];
        // `== null` rather than `=== null`: with noUncheckedIndexedAccess an
        // index read is also possibly undefined, and both mean "not yet filled".
        if (a == null || b == null || c == null) continue;
        if (isTargetTriple(a, b, c) && !planned.has(j)) return true;
      }
      return false;
    } finally {
      slots[i] = null;
    }
  };

  for (let i = 0; i < length; i++) {
    if (slots[i] !== null) continue;
    const options = rng.shuffle(DIGITS);
    slots[i] = options.find((value) => !creates(i, value)) ?? options[0]!;
  }

  const stream = slots as number[];
  return { stream, targets: findCompletions(stream) };
}

export interface DecoderResult {
  hits: number;
  targets: number;
  misses: number;
  falseAlarms: number;
  /** Share of target sequences caught. */
  accuracy: number;
  longestRun: number;
  intervalMs: number;
  nextIntervalMs: number;
}

export const decoderEngine: Engine<DecoderConfig, DecoderState, DecoderResult> = {
  id: "decoder",

  init(config, seed) {
    const length = Math.max(9, Math.round((config.durationSec * 1000) / config.intervalMs));
    const targetCount = Math.max(1, Math.round((config.durationSec / 60) * config.targetsPerMinute));
    const { stream, targets } = generateStream(length, targetCount, seed);

    return {
      phase: "presenting",
      elapsed: 0,
      seed,
      config,
      stream,
      targets,
      claimed: [],
      missed: [],
      index: 0,
      hits: 0,
      falseAlarms: 0,
      lastPress: null,
      longestRun: 0,
      currentRun: 0,
    };
  },

  tick(state, elapsed) {
    if (state.phase === "finished") return state;

    const index = Math.floor(elapsed / state.config.intervalMs);
    if (index === state.index) return state.elapsed === elapsed ? state : { ...state, elapsed };

    // Any target whose window has now closed without a press is a miss. Swept
    // in a loop so a stalled frame cannot let one slip through unrecorded.
    const window = state.config.responseDigits;
    const missed = [...state.missed];
    let currentRun = state.currentRun;
    const longestRun = state.longestRun;

    for (const target of state.targets) {
      if (target + window >= index) break;
      if (state.claimed.includes(target) || missed.includes(target)) continue;
      missed.push(target);
      currentRun = 0;
    }

    if (index >= state.stream.length) {
      return { ...state, elapsed, index: state.stream.length, missed, currentRun, longestRun, phase: "finished" };
    }

    return { ...state, elapsed, index, missed, currentRun, longestRun };
  },

  input(state, event: InputEvent) {
    if (state.phase === "finished") return state;
    if (event.kind !== "respond" && event.kind !== "submit") return state;

    const window = state.config.responseDigits;

    // A press claims the most recent unclaimed target still inside its window.
    // Most recent rather than oldest: when two targets are both live, the one
    // the player just saw is the one they meant.
    const live = state.targets
      .filter((t) => t <= state.index && t + window >= state.index && !state.claimed.includes(t))
      .sort((a, b) => b - a);

    if (live.length === 0) {
      return {
        ...state,
        falseAlarms: state.falseAlarms + 1,
        currentRun: 0,
        lastPress: { at: state.elapsed, outcome: "falseAlarm" },
      };
    }

    const currentRun = state.currentRun + 1;
    return {
      ...state,
      claimed: [...state.claimed, live[0]!],
      hits: state.hits + 1,
      currentRun,
      longestRun: Math.max(state.longestRun, currentRun),
      lastPress: { at: state.elapsed, outcome: "hit" },
    };
  },

  isFinished(state) {
    return state.phase === "finished";
  },

  result(state) {
    const targets = state.targets.length;
    const accuracy = targets === 0 ? 0 : state.hits / targets;

    // Speed up only on a genuinely clean run: catching most sequences while
    // pressing at everything is not readiness for a faster stream.
    let nextIntervalMs = state.config.intervalMs;
    if (state.config.adaptive) {
      const clean = state.falseAlarms <= Math.max(2, targets * 0.25);
      if (accuracy >= 0.8 && clean) nextIntervalMs = Math.max(300, state.config.intervalMs - 50);
      else if (accuracy < 0.5) nextIntervalMs = Math.min(1000, state.config.intervalMs + 50);
    }

    return {
      hits: state.hits,
      targets,
      misses: targets - state.hits,
      falseAlarms: state.falseAlarms,
      accuracy,
      longestRun: state.longestRun,
      intervalMs: state.config.intervalMs,
      nextIntervalMs,
    };
  },

  toSession(state, config, startedAt): Omit<Session, "id"> {
    const r = decoderEngine.result(state);
    return {
      gameId: "decoder",
      mode: `${Math.round(60000 / config.intervalMs)} digits/min · ${config.durationSec}s`,
      startedAt,
      durationMs: state.elapsed,
      // Faster streams are harder, so the level counts digits per minute.
      level: Math.round(60000 / config.intervalMs),
      accuracy: r.accuracy,
      score: r.hits,
      seed: state.seed,
      metrics: {
        nextIntervalMs: r.nextIntervalMs,
        hits: r.hits,
        targets: r.targets,
        misses: r.misses,
        falseAlarms: r.falseAlarms,
        longestRun: r.longestRun,
        intervalMs: r.intervalMs,
      },
    };
  },
};
