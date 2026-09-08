import type { GameId, Session } from "@/lib/types";
import { createRng } from "./rng";
import { advanceSpan, initSpan, type SpanProgress } from "./adaptive";
import type { BaseState, Engine, InputEvent } from "./types";

/**
 * Shared core for the two span tasks.
 *
 * Memory Span and Corsi differ in what the items *are* — digits typed on a
 * keypad versus blocks tapped in a grid — and in nothing else that matters:
 * both present a sequence, both take it back forward or reversed, both grow on
 * success and stop after two failures at a length. One state machine, two
 * presentations.
 */

export type SpanDirection = "forward" | "reverse";

export interface SequenceConfig {
  gameId: Extract<GameId, "memory-span" | "corsi">;
  /** Distinct items to draw from: 10 digits, 9 Corsi blocks, 26 letters. */
  alphabet: number;
  startLength: number;
  direction: SpanDirection;
  /** How long each item is shown. */
  showMs: number;
  /** Blank gap between items — without it two repeats look like one. */
  gapMs: number;
  /** Trials at a length before the run ends. Corsi's convention is two. */
  attemptsPerLength: number;
  /** Repeats allowed within one sequence. Digits repeat; Corsi blocks do not. */
  allowRepeats: boolean;
}

export const MEMORY_SPAN_DEFAULTS: SequenceConfig = {
  gameId: "memory-span",
  alphabet: 10,
  startLength: 3,
  direction: "forward",
  showMs: 800,
  gapMs: 250,
  attemptsPerLength: 2,
  allowRepeats: true,
};

export const CORSI_DEFAULTS: SequenceConfig = {
  gameId: "corsi",
  alphabet: 9,
  startLength: 2,
  direction: "forward",
  showMs: 1000,
  gapMs: 500,
  attemptsPerLength: 2,
  allowRepeats: false,
};

export interface SequenceState extends BaseState {
  config: SequenceConfig;
  progress: SpanProgress;
  /** The sequence currently being presented or recalled. */
  sequence: number[];
  /** What the player has entered so far this trial. */
  entry: number[];
  /** Index of the item being shown; -1 between items, length when finished. */
  showIndex: number;
  /** Highlights the item mid-presentation. */
  showing: boolean;
  /** Wall time within the session at which presentation began. */
  presentStart: number;
  trialsPlayed: number;
  correctTrials: number;
  lastTrial: "correct" | "wrong" | null;
  /** Set briefly after a trial so the player sees the outcome before moving on. */
  feedbackUntil: number;
}

/**
 * Generate a sequence with no immediate repeats.
 *
 * Corsi forbids repeats outright — tapping the same block twice in a row is
 * ambiguous to watch. Digit span allows a digit to recur, but never back to
 * back for the same reason: two identical adjacent flashes are indistinguishable
 * from one long flash.
 */
export function generateSequence(length: number, alphabet: number, allowRepeats: boolean, seed: number): number[] {
  const rng = createRng(seed);
  const out: number[] = [];
  for (let i = 0; i < length; i++) {
    let value = rng.int(alphabet);
    let guard = 0;
    while (guard++ < 100) {
      const adjacent = out.length > 0 && out[out.length - 1] === value;
      const duplicate = !allowRepeats && out.includes(value);
      if (!adjacent && !duplicate) break;
      value = rng.int(alphabet);
    }
    out.push(value);
  }
  return out;
}

export function expectedAnswer(sequence: number[], direction: SpanDirection): number[] {
  return direction === "reverse" ? sequence.slice().reverse() : sequence;
}

/** Total presentation time for a sequence, so the UI can size a progress bar. */
export function presentationMs(length: number, config: SequenceConfig): number {
  return length * (config.showMs + config.gapMs);
}

const FEEDBACK_MS = 900;

function startTrial(state: SequenceState, atMs: number): SequenceState {
  const sequence = generateSequence(
    state.progress.level,
    state.config.alphabet,
    state.config.allowRepeats,
    state.seed + state.trialsPlayed * 7919,
  );
  return {
    ...state,
    phase: "presenting",
    sequence,
    entry: [],
    showIndex: 0,
    showing: true,
    presentStart: atMs,
    lastTrial: null,
    feedbackUntil: 0,
  };
}

export const sequenceEngine: Engine<SequenceConfig, SequenceState, SequenceResult> = {
  id: "sequence",

  init(config, seed) {
    const base: SequenceState = {
      phase: "presenting",
      elapsed: 0,
      seed,
      config,
      progress: initSpan(config.startLength),
      sequence: [],
      entry: [],
      showIndex: 0,
      showing: true,
      presentStart: 0,
      trialsPlayed: 0,
      correctTrials: 0,
      lastTrial: null,
      feedbackUntil: 0,
    };
    return startTrial(base, 0);
  },

  tick(state, elapsed) {
    if (state.phase === "finished") return state;

    // Feedback pause between trials.
    if (state.phase === "feedback") {
      if (elapsed < state.feedbackUntil) return state.elapsed === elapsed ? state : { ...state, elapsed };
      if (state.progress.done) return { ...state, elapsed, phase: "finished" };
      return startTrial({ ...state, elapsed }, elapsed);
    }

    if (state.phase !== "presenting") {
      return state.elapsed === elapsed ? state : { ...state, elapsed };
    }

    const { showMs, gapMs } = state.config;
    const slot = showMs + gapMs;
    const into = elapsed - state.presentStart;
    const index = Math.floor(into / slot);

    if (index >= state.sequence.length) {
      return { ...state, elapsed, phase: "responding", showIndex: -1, showing: false };
    }

    const showing = into - index * slot < showMs;
    if (index === state.showIndex && showing === state.showing) {
      return { ...state, elapsed };
    }
    return { ...state, elapsed, showIndex: index, showing };
  },

  input(state, event: InputEvent) {
    if (state.phase !== "responding") return state;

    if (event.kind === "clear") return { ...state, entry: [] };

    if (event.kind === "select") {
      if (state.entry.length >= state.sequence.length) return state;
      const entry = [...state.entry, event.index];
      // Auto-submit on the final item: an explicit confirm step adds a keypress
      // to every trial and nothing to the measurement.
      if (entry.length === state.sequence.length) return grade({ ...state, entry });
      return { ...state, entry };
    }

    if (event.kind === "submit" && state.entry.length > 0) return grade(state);

    return state;
  },

  isFinished(state) {
    return state.phase === "finished";
  },

  result(state) {
    return {
      span: state.progress.best,
      trialsPlayed: state.trialsPlayed,
      correctTrials: state.correctTrials,
      accuracy: state.trialsPlayed === 0 ? 0 : state.correctTrials / state.trialsPlayed,
    };
  },

  toSession(state, config, startedAt): Omit<Session, "id"> {
    const r = sequenceEngine.result(state);
    const label = config.gameId === "corsi" ? "Corsi" : config.alphabet === 26 ? "Letters" : "Digits";
    return {
      gameId: config.gameId,
      mode: `${label} · ${config.direction === "reverse" ? "reverse" : "forward"}`,
      startedAt,
      durationMs: state.elapsed,
      level: r.span,
      accuracy: r.accuracy,
      score: r.span,
      seed: state.seed,
      metrics: {
        span: r.span,
        trials: r.trialsPlayed,
        correct: r.correctTrials,
        direction: config.direction,
        // A span run ends by design, so the next session restarts a couple of
        // levels below the span reached rather than resuming at the wall.
        nextLevel: Math.max(config.startLength, r.span - 1),
      },
    };
  },
};

export interface SequenceResult {
  span: number;
  trialsPlayed: number;
  correctTrials: number;
  accuracy: number;
}

function grade(state: SequenceState): SequenceState {
  const expected = expectedAnswer(state.sequence, state.config.direction);
  const passed =
    state.entry.length === expected.length && state.entry.every((v, i) => v === expected[i]);

  const progress = advanceSpan(state.progress, passed, {
    upAfter: 1,
    downAfter: state.config.attemptsPerLength,
    stopAfter: state.config.attemptsPerLength,
    min: 2,
  });

  return {
    ...state,
    phase: "feedback",
    progress,
    trialsPlayed: state.trialsPlayed + 1,
    correctTrials: state.correctTrials + (passed ? 1 : 0),
    lastTrial: passed ? "correct" : "wrong",
    feedbackUntil: state.elapsed + FEEDBACK_MS,
  };
}
