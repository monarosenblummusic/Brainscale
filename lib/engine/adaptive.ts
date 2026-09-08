/**
 * Level-adjustment policies.
 *
 * BrainScale offers a choice of training modes rather than one fixed rule, and
 * the thresholds differ meaningfully between them — the Jaeggi protocol is
 * stricter than Brain Workshop's default, and which one you train under changes
 * how fast you climb. So these are data, selectable at play time, not a
 * hard-coded `if`.
 */
export type AdaptivePolicyId = "standard" | "jaeggi" | "classic" | "manual";

/**
 * How a block's percentage is computed.
 *
 * This is not cosmetic — the two rules put the "did nothing at all" baseline in
 * completely different places, so a threshold only means what it says when it
 * is paired with the rule it was written for.
 *
 *  - `all-trials`      (TP + TN) / (TP + TN + FP + FN). Counts correct
 *    non-responses. Because only ~25% of trials are targets, ignoring a block
 *    entirely still scores ~75%, so the meaningful range is 75-100%.
 *  - `responses-only`  TP / (TP + FP + FN). Correct non-responses are excluded,
 *    so the score is the share of targets caught, penalised by false alarms.
 *    Doing nothing scores 0 and pressing everything scores ~25%.
 */
export type ScoringRule = "all-trials" | "responses-only";

/** How the per-modality scores combine into one block score. */
export type Aggregation = "mean" | "min" | "pooled";

export interface AdaptivePolicy {
  id: AdaptivePolicyId;
  name: string;
  description: string;
  /** Accuracy (0..1) at or above which the level rises. */
  up: number;
  /** Accuracy below which the level falls. */
  down: number;
  /** Consecutive sub-`down` blocks required before the level actually falls. */
  downStreak: number;
  scoring: ScoringRule;
  aggregate: Aggregation;
  /** Short phrase naming the rule, for the results screen. */
  scoreLabel: string;
}

export const POLICIES: Record<AdaptivePolicyId, AdaptivePolicy> = {
  standard: {
    id: "standard",
    name: "Standard",
    description:
      "90% to advance, below 70% to drop back. Correct non-responses count, so the scale effectively runs from 75% upward.",
    up: 0.9,
    down: 0.7,
    downStreak: 1,
    scoring: "all-trials",
    aggregate: "mean",
    scoreLabel: "average of modalities",
  },
  jaeggi: {
    id: "jaeggi",
    name: "Jaeggi",
    description:
      "The 2008 protocol: 90% up, below 75% down, scored on your weakest modality. Correct non-responses count.",
    up: 0.9,
    down: 0.75,
    downStreak: 1,
    scoring: "all-trials",
    aggregate: "min",
    scoreLabel: "weakest modality",
  },
  classic: {
    id: "classic",
    name: "Brain Workshop",
    description:
      "Scores only the targets you catch, so it starts at zero rather than 75%. 80% to advance, three blocks below 50% to drop.",
    up: 0.8,
    down: 0.5,
    downStreak: 3,
    scoring: "responses-only",
    aggregate: "pooled",
    scoreLabel: "share of targets caught",
  },
  manual: {
    id: "manual",
    name: "Manual",
    description: "The level never moves on its own. You choose it.",
    up: Infinity,
    down: -Infinity,
    downStreak: 1,
    scoring: "responses-only",
    aggregate: "pooled",
    scoreLabel: "share of targets caught",
  },
};

export const POLICY_LIST = Object.values(POLICIES);

export interface LevelChange {
  level: number;
  direction: "up" | "down" | "hold";
  /** Consecutive failing blocks after this one — carried into the next block. */
  failStreak: number;
}

export function applyPolicy(
  policy: AdaptivePolicy,
  currentLevel: number,
  accuracy: number,
  failStreak = 0,
  bounds: { min: number; max: number } = { min: 1, max: 20 },
): LevelChange {
  if (policy.id === "manual") return { level: currentLevel, direction: "hold", failStreak: 0 };

  if (accuracy >= policy.up) {
    return { level: Math.min(bounds.max, currentLevel + 1), direction: "up", failStreak: 0 };
  }

  if (accuracy < policy.down) {
    const streak = failStreak + 1;
    if (streak >= policy.downStreak) {
      return { level: Math.max(bounds.min, currentLevel - 1), direction: "down", failStreak: 0 };
    }
    return { level: currentLevel, direction: "hold", failStreak: streak };
  }

  return { level: currentLevel, direction: "hold", failStreak: 0 };
}

/**
 * Span-task progression (Memory Span, Corsi, CWM): advance on success, retreat
 * after N consecutive failures at the same length. Distinct from the accuracy
 * policies above because a span trial is pass/fail, not a percentage.
 */
export interface SpanProgress {
  level: number;
  successStreak: number;
  failStreak: number;
  /** Highest level ever completed successfully — this is the reported span. */
  best: number;
  /** Set once the run should stop. */
  done: boolean;
}

export function initSpan(level: number): SpanProgress {
  return { level, successStreak: 0, failStreak: 0, best: 0, done: false };
}

export function advanceSpan(
  p: SpanProgress,
  passed: boolean,
  opts: { upAfter?: number; downAfter?: number; stopAfter?: number; min?: number; max?: number } = {},
): SpanProgress {
  const { upAfter = 1, downAfter = 2, stopAfter = 2, min = 2, max = 20 } = opts;

  if (passed) {
    const successStreak = p.successStreak + 1;
    const best = Math.max(p.best, p.level);
    if (successStreak >= upAfter) {
      return { level: Math.min(max, p.level + 1), successStreak: 0, failStreak: 0, best, done: false };
    }
    return { ...p, successStreak, failStreak: 0, best };
  }

  const failStreak = p.failStreak + 1;
  // `stopAfter` ends the run outright (Corsi/Memory Span report a span);
  // `downAfter` only steps the level back (CWM trains continuously).
  if (stopAfter > 0 && failStreak >= stopAfter) {
    return { ...p, failStreak, successStreak: 0, done: true };
  }
  if (failStreak >= downAfter) {
    return { level: Math.max(min, p.level - 1), successStreak: 0, failStreak: 0, best: p.best, done: false };
  }
  return { ...p, failStreak, successStreak: 0 };
}
