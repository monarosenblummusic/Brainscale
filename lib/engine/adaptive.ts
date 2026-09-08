/**
 * Level-adjustment policies.
 *
 * BrainScale offers a choice of training modes rather than one fixed rule, and
 * the thresholds differ meaningfully between them, so these are data selectable
 * at play time rather than a hard-coded `if`.
 */
export type AdaptivePolicyId = "standard" | "jaeggi" | "classic" | "manual";

/**
 * How the per-modality scores combine into one block score.
 *
 * BrainScale takes the weakest modality. Its own forum records the switch: a
 * single miss at dual 2-back used to score 92% and now scores 83%, which is
 * exactly the difference between averaging the two modalities (11/12) and
 * reporting the worse one (5/6), given the 6 matches per modality their match
 * rate produces at 24 trials.
 */
export type Aggregation = "min" | "pooled";

export interface AdaptivePolicy {
  id: AdaptivePolicyId;
  name: string;
  description: string;
  /** Share of targets caught (0..1) at or above which the level rises. */
  up: number;
  /** Share below which the level falls. */
  down: number;
  /** Consecutive sub-`down` blocks required before the level actually falls. */
  downStreak: number;
  aggregate: Aggregation;
  /**
   * False alarms are not subtracted from the score — the score is exactly the
   * fraction of targets you caught, so it always matches the count shown beside
   * it. But pressing everything would otherwise catch every target and promote
   * you, so a block with a false-alarm rate above this cap can hold or fall,
   * never rise.
   */
  maxFalseAlarmRate: number;
  /** Short phrase naming how the modalities were combined, for the results screen. */
  scoreLabel: string;
}

export const POLICIES: Record<AdaptivePolicyId, AdaptivePolicy> = {
  standard: {
    id: "standard",
    name: "Standard",
    description:
      "BrainScale's progression: catch 90% of the targets to advance, below 70% drops you back, and you are scored on your weakest modality.",
    up: 0.9,
    down: 0.7,
    downStreak: 1,
    aggregate: "min",
    maxFalseAlarmRate: 0.2,
    scoreLabel: "weakest modality",
  },
  jaeggi: {
    id: "jaeggi",
    name: "Jaeggi",
    description: "The 2008 protocol: same as Standard but stricter on the way down — below 75% drops you back.",
    up: 0.9,
    down: 0.75,
    downStreak: 1,
    aggregate: "min",
    maxFalseAlarmRate: 0.15,
    scoreLabel: "weakest modality",
  },
  classic: {
    id: "classic",
    name: "Brain Workshop",
    description: "More forgiving: 80% to advance, and three blocks below 50% before dropping.",
    up: 0.8,
    down: 0.5,
    downStreak: 3,
    aggregate: "pooled",
    maxFalseAlarmRate: 0.25,
    scoreLabel: "all modalities pooled",
  },
  manual: {
    id: "manual",
    name: "Manual",
    description: "The level never moves on its own. You choose it.",
    up: Infinity,
    down: -Infinity,
    downStreak: 1,
    aggregate: "pooled",
    maxFalseAlarmRate: 1,
    scoreLabel: "all modalities pooled",
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
