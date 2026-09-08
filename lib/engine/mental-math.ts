import type { Session } from "@/lib/types";
import { createRng, type Rng } from "./rng";
import type { BaseState, Engine, InputEvent } from "./types";

/**
 * Mental Math.
 *
 * The design detail worth copying from BrainScale is that difficulty is *two*
 * numbers, one per operand, adapting independently. If three-digit multipliers
 * are what slows you down, that side stays put while the other keeps growing —
 * a single difficulty scalar would either stall you on your weak side or run
 * away on your strong one.
 */

export const OPERATIONS = ["add", "subtract", "multiply", "divide"] as const;
export type Operation = (typeof OPERATIONS)[number];
export type OperationMode = Operation | "mix";

export const OPERATION_SYMBOL: Record<Operation, string> = {
  add: "+",
  subtract: "−",
  multiply: "×",
  divide: "÷",
};

export const OPERATION_LABEL: Record<OperationMode, string> = {
  add: "Addition",
  subtract: "Subtraction",
  multiply: "Multiplication",
  divide: "Division",
  mix: "Mix",
};

export interface MentalMathConfig {
  operation: OperationMode;
  /** Digit count for the left operand. */
  leftDigits: number;
  /** Digit count for the right operand. */
  rightDigits: number;
  /** Session length in seconds; 0 means "fixed count" instead. */
  durationSec: number;
  /** Used when durationSec is 0. */
  problemCount: number;
  adaptive: boolean;
  /**
   * Answering faster than this is what earns a promotion. Accuracy alone would
   * let a slow, careful player climb until the problems were unanswerable.
   */
  fastMs: number;
}

export const MENTAL_MATH_DEFAULTS: MentalMathConfig = {
  operation: "mix",
  leftDigits: 2,
  rightDigits: 1,
  durationSec: 120,
  problemCount: 20,
  adaptive: true,
  fastMs: 6000,
};

export interface Problem {
  left: number;
  right: number;
  operation: Operation;
  answer: number;
}

export interface MentalMathState extends BaseState {
  config: MentalMathConfig;
  leftDigits: number;
  rightDigits: number;
  problem: Problem;
  entry: string;
  /** Session time at which the current problem appeared. */
  askedAt: number;
  solved: number;
  attempted: number;
  /** Total time spent on correctly answered problems, for the average. */
  correctMs: number;
  lastOutcome: "correct" | "wrong" | null;
  /** Consecutive correct-and-fast answers, driving promotion. */
  streak: number;
  history: { problem: Problem; given: number; correct: boolean; ms: number }[];
  bestLeftDigits: number;
  bestRightDigits: number;
}

function digitRange(digits: number): [number, number] {
  if (digits <= 1) return [2, 9];
  return [10 ** (digits - 1), 10 ** digits - 1];
}

/**
 * Generate a problem at the given operand sizes.
 *
 * Subtraction never goes negative and division is always exact. Both are
 * deliberate: a negative or fractional answer turns a fluency drill into a
 * question about notation, and the point here is arithmetic speed.
 */
export function generateProblem(
  operation: Operation,
  leftDigits: number,
  rightDigits: number,
  rng: Rng,
): Problem {
  const [lMin, lMax] = digitRange(leftDigits);
  const [rMin, rMax] = digitRange(rightDigits);

  if (operation === "divide") {
    // Build from the answer so the division comes out whole: pick the divisor
    // and the quotient, and multiply to get the dividend.
    const divisor = rng.range(Math.max(2, rMin), rMax);
    const quotient = rng.range(Math.max(2, lMin), lMax);
    return { left: divisor * quotient, right: divisor, operation, answer: quotient };
  }

  let left = rng.range(lMin, lMax);
  let right = rng.range(rMin, rMax);

  if (operation === "subtract" && right > left) [left, right] = [right, left];

  const answer =
    operation === "add" ? left + right : operation === "subtract" ? left - right : left * right;

  return { left, right, operation, answer };
}

export function pickOperation(mode: OperationMode, rng: Rng): Operation {
  return mode === "mix" ? rng.pick(OPERATIONS) : mode;
}

export function formatProblem(p: Problem): string {
  return `${p.left} ${OPERATION_SYMBOL[p.operation]} ${p.right}`;
}

export interface MentalMathResult {
  solved: number;
  attempted: number;
  accuracy: number;
  averageMs: number;
  leftDigits: number;
  rightDigits: number;
  perMinute: number;
}

const PROMOTE_STREAK = 4;
const DEMOTE_STREAK = 2;

export const mentalMathEngine: Engine<MentalMathConfig, MentalMathState, MentalMathResult> = {
  id: "mental-math",

  init(config, seed) {
    const rng = createRng(seed);
    const operation = pickOperation(config.operation, rng);
    return {
      phase: "responding",
      elapsed: 0,
      seed,
      config,
      leftDigits: config.leftDigits,
      rightDigits: config.rightDigits,
      problem: generateProblem(operation, config.leftDigits, config.rightDigits, rng),
      entry: "",
      askedAt: 0,
      solved: 0,
      attempted: 0,
      correctMs: 0,
      lastOutcome: null,
      streak: 0,
      history: [],
      bestLeftDigits: config.leftDigits,
      bestRightDigits: config.rightDigits,
    };
  },

  tick(state, elapsed) {
    if (state.phase === "finished") return state;

    const timeUp = state.config.durationSec > 0 && elapsed >= state.config.durationSec * 1000;
    const countUp = state.config.durationSec === 0 && state.attempted >= state.config.problemCount;
    if (timeUp || countUp) return { ...state, elapsed, phase: "finished" };

    return state.elapsed === elapsed ? state : { ...state, elapsed };
  },

  input(state, event: InputEvent) {
    if (state.phase === "finished") return state;

    if (event.kind === "clear") {
      return { ...state, entry: state.entry.slice(0, -1) };
    }

    if (event.kind === "answer") {
      const ch = String(event.value);
      if (!/^\d$/.test(ch)) return state;
      // Answers are bounded by the operand sizes; a runaway entry is a
      // mis-key, not an answer.
      if (state.entry.length >= 8) return state;
      return { ...state, entry: state.entry + ch };
    }

    if (event.kind === "submit" && state.entry.length > 0) return grade(state);
    if (event.kind === "skip") return next(grade({ ...state, entry: "" }, true));

    return state;
  },

  isFinished(state) {
    return state.phase === "finished";
  },

  result(state) {
    const accuracy = state.attempted === 0 ? 0 : state.solved / state.attempted;
    const averageMs = state.solved === 0 ? 0 : state.correctMs / state.solved;
    const minutes = state.elapsed / 60_000;
    return {
      solved: state.solved,
      attempted: state.attempted,
      accuracy,
      averageMs,
      leftDigits: state.leftDigits,
      rightDigits: state.rightDigits,
      perMinute: minutes > 0 ? state.solved / minutes : 0,
    };
  },

  toSession(state, config, startedAt): Omit<Session, "id"> {
    const r = mentalMathEngine.result(state);
    return {
      gameId: "mental-math",
      mode: `${OPERATION_LABEL[config.operation]} · ${r.leftDigits}×${r.rightDigits} digits`,
      startedAt,
      durationMs: state.elapsed,
      // A single comparable number for the level chart: total digits in play.
      level: r.leftDigits + r.rightDigits,
      accuracy: r.accuracy,
      score: r.solved,
      seed: state.seed,
      metrics: {
        nextLevel: r.leftDigits + r.rightDigits,
        leftDigits: r.leftDigits,
        rightDigits: r.rightDigits,
        solved: r.solved,
        attempted: r.attempted,
        averageMs: Math.round(r.averageMs),
        perMinute: Math.round(r.perMinute * 10) / 10,
        operation: config.operation,
      },
    };
  },
};

function grade(state: MentalMathState, skipped = false): MentalMathState {
  const ms = state.elapsed - state.askedAt;
  const given = skipped ? NaN : Number(state.entry);
  const correct = !skipped && given === state.problem.answer;

  // Promotion needs correct *and* quick. Accuracy alone would let a slow,
  // careful player climb until the problems stopped being solvable in the time.
  const fast = correct && ms <= state.config.fastMs;
  const streak = fast ? state.streak + 1 : correct ? state.streak : Math.min(0, state.streak) - 1;

  const graded: MentalMathState = {
    ...state,
    solved: state.solved + (correct ? 1 : 0),
    attempted: state.attempted + 1,
    correctMs: state.correctMs + (correct ? ms : 0),
    lastOutcome: correct ? "correct" : "wrong",
    streak,
    history: [...state.history, { problem: state.problem, given, correct, ms }],
  };

  return next(adaptDifficulty(graded));
}

/**
 * Move the two operand sizes independently.
 *
 * Which side grows alternates, so difficulty spreads across both operands
 * rather than piling onto the left one; and the smaller side is favoured, which
 * keeps the two within a digit of each other instead of drifting to 5x1.
 */
function adaptDifficulty(state: MentalMathState): MentalMathState {
  if (!state.config.adaptive) return state;

  if (state.streak >= PROMOTE_STREAK) {
    const growRight = state.rightDigits < state.leftDigits;
    const leftDigits = Math.min(5, state.leftDigits + (growRight ? 0 : 1));
    const rightDigits = Math.min(5, state.rightDigits + (growRight ? 1 : 0));
    return {
      ...state,
      leftDigits,
      rightDigits,
      streak: 0,
      bestLeftDigits: Math.max(state.bestLeftDigits, leftDigits),
      bestRightDigits: Math.max(state.bestRightDigits, rightDigits),
    };
  }

  if (state.streak <= -DEMOTE_STREAK) {
    const shrinkLeft = state.leftDigits > state.rightDigits;
    return {
      ...state,
      leftDigits: Math.max(1, state.leftDigits - (shrinkLeft ? 1 : 0)),
      rightDigits: Math.max(1, state.rightDigits - (shrinkLeft ? 0 : 1)),
      streak: 0,
    };
  }

  return state;
}

function next(state: MentalMathState): MentalMathState {
  const rng = createRng(state.seed + state.attempted * 2654435761);
  const operation = pickOperation(state.config.operation, rng);
  return {
    ...state,
    problem: generateProblem(operation, state.leftDigits, state.rightDigits, rng),
    entry: "",
    askedAt: state.elapsed,
  };
}
