import type { Session } from "@/lib/types";
import { createRng, type Rng } from "./rng";
import { advanceSpan, initSpan, type SpanProgress } from "./adaptive";
import type { BaseState, Engine, InputEvent } from "./types";

/**
 * Complex Working Memory — the symmetry span task.
 *
 * The defining feature of a *complex* span is that memorising is interleaved
 * with an unrelated decision, so the player cannot quietly rehearse the list
 * between items. Remove the symmetry judgements and this collapses into an
 * ordinary spatial span; the interference is the exercise.
 *
 * Constants are BrainScale's own: an 8x8 pattern to judge, a 4x4 recall grid,
 * 650ms highlight, 500ms blank, promotion after two consecutive perfect trials
 * and demotion after two consecutive failures.
 */

export const PATTERN_SIZE = 8;
export const GRID_SIZE = 4;
export const GRID_CELLS = GRID_SIZE * GRID_SIZE;

export interface CwmConfig {
  startLevel: number;
  /** How long a remembered cell stays highlighted. */
  highlightMs: number;
  /** Blank between the highlight and the next symmetry pattern. */
  blankMs: number;
  /**
   * Time allowed for a symmetry judgement. The cap is what makes the secondary
   * task genuinely interfering: given unlimited time a player would simply
   * rehearse the list while "deciding".
   */
  symmetryMs: number;
  /** Blocks to play before the session ends. */
  trials: number;
}

export const CWM_DEFAULTS: CwmConfig = {
  startLevel: 2,
  highlightMs: 650,
  blankMs: 500,
  symmetryMs: 6000,
  trials: 10,
};

export type CwmStage = "pattern" | "highlight" | "blank" | "recall" | "review";

export interface CwmItem {
  /** 8x8 booleans, row-major. */
  pattern: boolean[];
  symmetric: boolean;
  /** Index into the 4x4 grid, 0..15. */
  cell: number;
}

export interface CwmState extends BaseState {
  config: CwmConfig;
  progress: SpanProgress;
  items: CwmItem[];
  /** Which item of the current block is on screen. */
  itemIndex: number;
  stage: CwmStage;
  /** Session time at which the current stage began. */
  stageStart: number;
  /** Symmetry answers given this block, aligned with `items`. */
  symmetryAnswers: (boolean | null)[];
  /** Cells clicked during recall, in order. */
  recall: number[];
  trialsPlayed: number;
  /** Cumulative tallies across the session. */
  recallCorrect: number;
  recallTotal: number;
  symmetryCorrect: number;
  symmetryTotal: number;
  lastTrial: { recallOk: boolean; symmetryOk: number; symmetryOf: number } | null;
  reviewUntil: number;
}

/* -------------------------------------------------------- Pattern building */

/**
 * Build an 8x8 pattern that is either vertically symmetric or reliably not.
 *
 * An asymmetric pattern is produced by starting from a symmetric one and
 * breaking it, rather than filling cells at random: a random fill is
 * *usually* asymmetric, but occasionally lands on a symmetric arrangement and
 * would then be labelled wrong.
 */
export function buildPattern(symmetric: boolean, rng: Rng): boolean[] {
  const half = PATTERN_SIZE / 2;
  const cells = new Array<boolean>(PATTERN_SIZE * PATTERN_SIZE).fill(false);

  for (let row = 0; row < PATTERN_SIZE; row++) {
    for (let col = 0; col < half; col++) {
      const on = rng.bool(0.42);
      cells[row * PATTERN_SIZE + col] = on;
      cells[row * PATTERN_SIZE + (PATTERN_SIZE - 1 - col)] = on;
    }
  }

  if (!symmetric) {
    // Flip a handful of cells on one side only. Several, not one, so the
    // asymmetry is visible at a glance rather than a spot-the-difference.
    const flips = rng.range(3, 6);
    for (let i = 0; i < flips; i++) {
      const row = rng.int(PATTERN_SIZE);
      const col = rng.int(half);
      const idx = row * PATTERN_SIZE + col;
      cells[idx] = !cells[idx];
    }
    // Guard against flips that happen to restore symmetry.
    if (isSymmetric(cells)) {
      const idx = rng.int(PATTERN_SIZE) * PATTERN_SIZE + rng.int(half);
      cells[idx] = !cells[idx];
    }
  }

  return cells;
}

export function isSymmetric(cells: boolean[]): boolean {
  const half = PATTERN_SIZE / 2;
  for (let row = 0; row < PATTERN_SIZE; row++) {
    for (let col = 0; col < half; col++) {
      if (cells[row * PATTERN_SIZE + col] !== cells[row * PATTERN_SIZE + (PATTERN_SIZE - 1 - col)]) {
        return false;
      }
    }
  }
  return true;
}

export function buildItems(level: number, seed: number): CwmItem[] {
  const rng = createRng(seed);
  const used: number[] = [];
  return Array.from({ length: level }, () => {
    const symmetric = rng.bool(0.5);
    // No cell twice in one block: recalling "the same cell, twice" is
    // ambiguous to click back and is not what the task measures.
    let cell = rng.int(GRID_CELLS);
    let guard = 0;
    while (used.includes(cell) && guard++ < 100) cell = rng.int(GRID_CELLS);
    used.push(cell);
    return { pattern: buildPattern(symmetric, rng), symmetric, cell };
  });
}

/* ------------------------------------------------------------------ Engine */

export interface CwmResult {
  level: number;
  best: number;
  trialsPlayed: number;
  recallAccuracy: number;
  symmetryAccuracy: number;
  accuracy: number;
}

const REVIEW_MS = 1400;

function startBlock(state: CwmState, atMs: number): CwmState {
  return {
    ...state,
    stage: "pattern",
    stageStart: atMs,
    items: buildItems(state.progress.level, state.seed + state.trialsPlayed * 104729),
    itemIndex: 0,
    symmetryAnswers: [],
    recall: [],
    phase: "presenting",
  };
}

export const cwmEngine: Engine<CwmConfig, CwmState, CwmResult> = {
  id: "complex-working-memory",

  init(config, seed) {
    const base: CwmState = {
      phase: "presenting",
      elapsed: 0,
      seed,
      config,
      progress: initSpan(config.startLevel),
      items: [],
      itemIndex: 0,
      stage: "pattern",
      stageStart: 0,
      symmetryAnswers: [],
      recall: [],
      trialsPlayed: 0,
      recallCorrect: 0,
      recallTotal: 0,
      symmetryCorrect: 0,
      symmetryTotal: 0,
      lastTrial: null,
      reviewUntil: 0,
    };
    return startBlock(base, 0);
  },

  tick(state, elapsed) {
    if (state.phase === "finished") return state;
    const into = elapsed - state.stageStart;

    switch (state.stage) {
      case "pattern": {
        // A judgement that runs out of time is recorded as unanswered rather
        // than as wrong: the player did not get it wrong, they ran out of clock.
        if (into < state.config.symmetryMs) return { ...state, elapsed };
        return answerSymmetry({ ...state, elapsed }, null, elapsed);
      }
      case "highlight": {
        if (into < state.config.highlightMs) return { ...state, elapsed };
        return { ...state, elapsed, stage: "blank", stageStart: elapsed };
      }
      case "blank": {
        if (into < state.config.blankMs) return { ...state, elapsed };
        const next = state.itemIndex + 1;
        if (next >= state.items.length) {
          return { ...state, elapsed, stage: "recall", stageStart: elapsed, phase: "responding" };
        }
        return { ...state, elapsed, itemIndex: next, stage: "pattern", stageStart: elapsed };
      }
      case "review": {
        if (elapsed < state.reviewUntil) return { ...state, elapsed };
        if (state.progress.done || state.trialsPlayed >= state.config.trials) {
          return { ...state, elapsed, phase: "finished" };
        }
        return startBlock({ ...state, elapsed }, elapsed);
      }
      default:
        return state.elapsed === elapsed ? state : { ...state, elapsed };
    }
  },

  input(state, event: InputEvent) {
    if (state.stage === "pattern" && event.kind === "answer") {
      return answerSymmetry(state, event.value === "symmetric", state.elapsed);
    }

    if (state.stage === "recall") {
      if (event.kind === "clear") return { ...state, recall: [] };
      if (event.kind === "select") {
        if (state.recall.includes(event.index)) {
          return { ...state, recall: state.recall.filter((c) => c !== event.index) };
        }
        if (state.recall.length >= state.items.length) return state;
        const recall = [...state.recall, event.index];
        if (recall.length === state.items.length) return gradeBlock({ ...state, recall });
        return { ...state, recall };
      }
      if (event.kind === "submit" && state.recall.length > 0) return gradeBlock(state);
    }

    return state;
  },

  isFinished(state) {
    return state.phase === "finished";
  },

  result(state) {
    const recallAccuracy = state.recallTotal === 0 ? 0 : state.recallCorrect / state.recallTotal;
    const symmetryAccuracy = state.symmetryTotal === 0 ? 1 : state.symmetryCorrect / state.symmetryTotal;
    return {
      level: state.progress.level,
      best: state.progress.best,
      trialsPlayed: state.trialsPlayed,
      recallAccuracy,
      symmetryAccuracy,
      // Recall is the measure; symmetry is the interference. Weighting them
      // equally would let a player who ignored the list score respectably.
      accuracy: recallAccuracy * 0.75 + symmetryAccuracy * 0.25,
    };
  },

  toSession(state, config, startedAt): Omit<Session, "id"> {
    const r = cwmEngine.result(state);
    return {
      gameId: "complex-working-memory",
      mode: `Symmetry span · set size ${r.best || config.startLevel}`,
      startedAt,
      durationMs: state.elapsed,
      level: r.best || config.startLevel,
      accuracy: r.accuracy,
      score: r.best,
      seed: state.seed,
      metrics: {
        nextLevel: state.progress.level,
        blocks: r.trialsPlayed,
        recallAccuracy: Math.round(r.recallAccuracy * 1000) / 1000,
        symmetryAccuracy: Math.round(r.symmetryAccuracy * 1000) / 1000,
        bestSetSize: r.best,
      },
    };
  },
};

function answerSymmetry(state: CwmState, said: boolean | null, atMs: number): CwmState {
  const item = state.items[state.itemIndex];
  if (!item) return state;

  const correct = said !== null && said === item.symmetric;
  return {
    ...state,
    symmetryAnswers: [...state.symmetryAnswers, said],
    symmetryCorrect: state.symmetryCorrect + (correct ? 1 : 0),
    symmetryTotal: state.symmetryTotal + 1,
    stage: "highlight",
    stageStart: atMs,
  };
}

function gradeBlock(state: CwmState): CwmState {
  const expected = state.items.map((i) => i.cell);
  const recallOk =
    state.recall.length === expected.length && state.recall.every((c, i) => c === expected[i]);

  const symmetryOk = state.symmetryAnswers.filter((a, i) => a !== null && a === state.items[i]?.symmetric).length;

  // Promotion needs a perfect block: the whole list, in order, and the
  // interference task kept up with. Two in a row up, two failures down.
  const passed = recallOk && symmetryOk === state.items.length;

  const trialsPlayed = state.trialsPlayed + 1;
  const progress = advanceSpan(state.progress, passed, {
    upAfter: 2,
    downAfter: 2,
    stopAfter: 0, // CWM trains continuously; it does not stop at a ceiling.
    min: 2,
    max: GRID_CELLS,
  });

  return {
    ...state,
    progress: { ...progress, done: trialsPlayed >= state.config.trials },
    trialsPlayed,
    recallCorrect: state.recallCorrect + (recallOk ? 1 : 0),
    recallTotal: state.recallTotal + 1,
    lastTrial: { recallOk, symmetryOk, symmetryOf: state.items.length },
    stage: "review",
    phase: "feedback",
    reviewUntil: state.elapsed + REVIEW_MS,
  };
}
