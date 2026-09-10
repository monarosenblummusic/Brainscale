import type { GameId, Session } from "@/lib/types";
import { createRng } from "./rng";
import type { BaseState, Engine, InputEvent } from "./types";

/**
 * Useful-field-of-view engine, shared by Double Decision and Hawkeye.
 *
 * The whole paradigm rests on the flash being too short to look around in. If
 * the player can saccade to the peripheral target the task stops measuring the
 * field of view and starts measuring eye speed, so the exposure ladder must
 * reach well under the ~200ms it takes to plan and execute a saccade. That is
 * why the floor here is 16ms rather than something comfortable.
 *
 * Double Decision adds a central discrimination task on top, which is what
 * forces the periphery to be taken in without looking at it: you cannot answer
 * the centre correctly if your eyes have left it.
 */

/** Radial positions the peripheral target can occupy, in degrees clockwise from up. */
export const SPOKES = 8;

/** Eccentricity rings, as a fraction of the field radius. */
export const RINGS = [0.42, 0.62, 0.82] as const;

export interface FlashFieldConfig {
  gameId: Extract<GameId, "double-decision" | "hawkeye">;
  /** Trials per session. */
  trials: number;
  /** Opening exposure. */
  startMs: number;
  /** The floor the ladder descends to — below a saccade, deliberately. */
  minMs: number;
  /** The ceiling it climbs back to after failures. */
  maxMs: number;
  /** Peripheral targets per flash. Double Decision uses one; Hawkeye several. */
  targets: number;
  /** Show a central shape that must also be identified. */
  centralTask: boolean;
  /** Scatter non-target marks around the periphery. */
  distractors: number;
  /** Correct trials in a row before the exposure shortens. */
  downAfter: number;
  /** Failures before it lengthens again. */
  upAfter: number;
}

export const DOUBLE_DECISION_DEFAULTS: FlashFieldConfig = {
  gameId: "double-decision",
  trials: 24,
  startMs: 500,
  minMs: 16,
  maxMs: 900,
  targets: 1,
  centralTask: true,
  distractors: 7,
  downAfter: 2,
  upAfter: 1,
};

export const HAWKEYE_DEFAULTS: FlashFieldConfig = {
  gameId: "hawkeye",
  trials: 24,
  startMs: 600,
  minMs: 24,
  maxMs: 1100,
  targets: 2,
  centralTask: false,
  distractors: 0,
  downAfter: 2,
  upAfter: 1,
};

/** The two shapes the central discrimination task chooses between. */
export const CENTRE_SHAPES = ["car", "truck"] as const;
export type CentreShape = (typeof CENTRE_SHAPES)[number];

export interface FieldMark {
  spoke: number;
  ring: number;
  isTarget: boolean;
}

export type FlashStage = "fixation" | "flash" | "mask" | "centre" | "locate" | "feedback";

export interface FlashFieldState extends BaseState {
  config: FlashFieldConfig;
  stage: FlashStage;
  /** Session time at which the current stage began. */
  stageStart: number;
  /** Current exposure in ms — the thing being trained. */
  exposureMs: number;
  /** Highest ring index in play; widens as the player succeeds. */
  ring: number;
  marks: FieldMark[];
  centre: CentreShape;
  /** What the player said the centre was. */
  centreAnswer: CentreShape | null;
  /** Spokes the player has marked this trial. */
  picked: number[];
  trial: number;
  correct: number;
  /** Best (lowest) exposure at which a trial was answered fully correctly. */
  bestMs: number;
  streak: number;
  failStreak: number;
  lastTrialCorrect: boolean | null;
}

const FIXATION_MS = 700;
const MASK_MS = 260;
const FEEDBACK_MS = 750;

/**
 * Place the targets and distractors.
 *
 * Targets sit on distinct spokes so two of them can never be reported with one
 * tap, and distractors avoid the target spokes for the same reason — a
 * distractor sharing a spoke with a target would make a correct answer
 * indistinguishable from a wrong one.
 */
export function buildMarks(
  seed: number,
  targets: number,
  distractors: number,
  maxRing: number,
): FieldMark[] {
  const rng = createRng(seed);
  const spokes = rng.shuffle(Array.from({ length: SPOKES }, (_, i) => i));

  const chosen = spokes.slice(0, Math.min(targets, SPOKES));
  const rest = spokes.slice(chosen.length);

  const marks: FieldMark[] = chosen.map((spoke) => ({
    spoke,
    // Targets sit at the outer edge of what the player has earned, which is
    // where the training pressure belongs.
    ring: maxRing,
    isTarget: true,
  }));

  for (const spoke of rest.slice(0, Math.max(0, Math.min(distractors, rest.length)))) {
    marks.push({ spoke, ring: rng.int(maxRing + 1), isTarget: false });
  }

  return marks;
}

export interface FlashFieldResult {
  trials: number;
  correct: number;
  accuracy: number;
  /** The headline: the shortest exposure the player handled cleanly. */
  bestMs: number;
  finalMs: number;
  ring: number;
}

function startTrial(state: FlashFieldState, atMs: number): FlashFieldState {
  return {
    ...state,
    stage: "fixation",
    stageStart: atMs,
    phase: "presenting",
    marks: buildMarks(state.seed + state.trial * 7919, state.config.targets, state.config.distractors, state.ring),
    centre: CENTRE_SHAPES[createRng(state.seed + state.trial * 104729).int(2)]!,
    centreAnswer: null,
    picked: [],
  };
}

export const flashFieldEngine: Engine<FlashFieldConfig, FlashFieldState, FlashFieldResult> = {
  id: "flash-field",

  init(config, seed) {
    const base: FlashFieldState = {
      phase: "presenting",
      elapsed: 0,
      seed,
      config,
      stage: "fixation",
      stageStart: 0,
      exposureMs: config.startMs,
      ring: 0,
      marks: [],
      centre: "car",
      centreAnswer: null,
      picked: [],
      trial: 0,
      correct: 0,
      bestMs: Infinity,
      streak: 0,
      failStreak: 0,
      lastTrialCorrect: null,
    };
    return startTrial(base, 0);
  },

  tick(state, elapsed) {
    if (state.phase === "finished") return state;
    const into = elapsed - state.stageStart;

    switch (state.stage) {
      case "fixation":
        if (into < FIXATION_MS) return { ...state, elapsed };
        return { ...state, elapsed, stage: "flash", stageStart: elapsed };

      case "flash":
        if (into < state.exposureMs) return { ...state, elapsed };
        // A mask is essential, not decoration: without it the afterimage keeps
        // the display readable long past the exposure the score claims.
        return { ...state, elapsed, stage: "mask", stageStart: elapsed };

      case "mask": {
        if (into < MASK_MS) return { ...state, elapsed };
        const next = state.config.centralTask ? "centre" : "locate";
        return { ...state, elapsed, stage: next, stageStart: elapsed, phase: "responding" };
      }

      case "feedback": {
        if (into < FEEDBACK_MS) return { ...state, elapsed };
        if (state.trial >= state.config.trials) return { ...state, elapsed, phase: "finished" };
        return startTrial({ ...state, elapsed }, elapsed);
      }

      default:
        return state.elapsed === elapsed ? state : { ...state, elapsed };
    }
  },

  input(state, event: InputEvent) {
    if (state.stage === "centre" && event.kind === "answer") {
      const answer = String(event.value) as CentreShape;
      if (!CENTRE_SHAPES.includes(answer)) return state;
      return { ...state, centreAnswer: answer, stage: "locate", stageStart: state.elapsed };
    }

    if (state.stage === "locate" && event.kind === "select") {
      const spoke = event.index;
      if (spoke < 0 || spoke >= SPOKES) return state;

      // Tapping a chosen spoke again takes it back, so a slip is recoverable
      // without spending the trial.
      if (state.picked.includes(spoke)) {
        return { ...state, picked: state.picked.filter((s) => s !== spoke) };
      }
      if (state.picked.length >= state.config.targets) return state;

      const picked = [...state.picked, spoke];
      if (picked.length === state.config.targets) return grade({ ...state, picked });
      return { ...state, picked };
    }

    return state;
  },

  isFinished(state) {
    return state.phase === "finished";
  },

  result(state) {
    return {
      trials: state.trial,
      correct: state.correct,
      accuracy: state.trial === 0 ? 0 : state.correct / state.trial,
      bestMs: Number.isFinite(state.bestMs) ? state.bestMs : state.config.startMs,
      finalMs: state.exposureMs,
      ring: state.ring,
    };
  },

  toSession(state, config, startedAt): Omit<Session, "id"> {
    const r = flashFieldEngine.result(state);
    return {
      gameId: config.gameId,
      mode: `${config.targets} target${config.targets === 1 ? "" : "s"}${config.centralTask ? " + centre" : ""}`,
      startedAt,
      durationMs: state.elapsed,
      // Lower exposure is better, so the level is inverted into "how many steps
      // down the ladder you got" — otherwise every chart in the app would read
      // backwards for these two games.
      level: Math.max(1, Math.round(1000 / Math.max(1, r.bestMs))),
      accuracy: r.accuracy,
      score: r.bestMs,
      seed: state.seed,
      metrics: {
        bestMs: r.bestMs,
        finalMs: r.finalMs,
        ring: r.ring,
        correct: r.correct,
        trials: r.trials,
      },
    };
  },
};

function grade(state: FlashFieldState): FlashFieldState {
  const targetSpokes = state.marks.filter((m) => m.isTarget).map((m) => m.spoke).sort((a, b) => a - b);
  const picked = [...state.picked].sort((a, b) => a - b);

  const locatedAll =
    picked.length === targetSpokes.length && picked.every((s, i) => s === targetSpokes[i]);
  const centreOk = !state.config.centralTask || state.centreAnswer === state.centre;

  // Both halves have to be right. Crediting the periphery alone would let the
  // player simply look at the target, which is the one thing the task exists
  // to prevent.
  const correct = locatedAll && centreOk;

  const streak = correct ? state.streak + 1 : 0;
  const failStreak = correct ? 0 : state.failStreak + 1;

  const { downAfter, upAfter, minMs, maxMs } = state.config;
  let exposureMs = state.exposureMs;
  let ring = state.ring;

  if (correct && streak >= downAfter) {
    // At the floor there is no shorter flash to give, so difficulty moves
    // outward instead and the ladder resets to keep descending.
    if (exposureMs <= minMs && ring < RINGS.length - 1) {
      ring += 1;
      exposureMs = Math.min(maxMs, Math.round(exposureMs * 4));
    } else {
      exposureMs = Math.max(minMs, Math.round(exposureMs * 0.75));
    }
  } else if (!correct && failStreak >= upAfter) {
    exposureMs = Math.min(maxMs, Math.round(exposureMs * 1.5));
  }

  return {
    ...state,
    trial: state.trial + 1,
    correct: state.correct + (correct ? 1 : 0),
    bestMs: correct ? Math.min(state.bestMs, state.exposureMs) : state.bestMs,
    streak: correct && streak >= downAfter ? 0 : streak,
    failStreak: !correct && failStreak >= upAfter ? 0 : failStreak,
    exposureMs,
    ring,
    lastTrialCorrect: correct,
    stage: "feedback",
    phase: "feedback",
    stageStart: state.elapsed,
  };
}
