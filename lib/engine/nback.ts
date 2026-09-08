import type { Session } from "@/lib/types";
import { createRng } from "./rng";
import { applyPolicy, POLICIES, type AdaptivePolicyId } from "./adaptive";
import type { BaseState, Engine, InputEvent } from "./types";

/* ----------------------------------------------------------- Configuration */

export const MODALITIES = ["position", "audio", "color", "shape"] as const;
export type Modality = (typeof MODALITIES)[number];

export const MODALITY_LABEL: Record<Modality, string> = {
  position: "Position",
  audio: "Audio",
  color: "Colour",
  shape: "Shape",
};

/** Brain Workshop's key layout, which BrainScale also uses. Rebindable. */
export const DEFAULT_KEYS: Record<Modality, string> = {
  position: "a",
  color: "f",
  shape: "j",
  audio: "l",
};

export const SHAPES = ["circle", "square", "triangle", "diamond", "hexagon", "star", "cross", "heart"] as const;
export type Shape = (typeof SHAPES)[number];

/** Six stimulus colours, chosen for colour-vision-deficiency separability. */
export const COLOR_VARS = ["--stim-1", "--stim-2", "--stim-3", "--stim-4", "--stim-5", "--stim-6"] as const;

export interface NBackConfig {
  n: number;
  modalities: Modality[];
  /** Milliseconds from one stimulus onset to the next. */
  trialMs: number;
  /** How long the stimulus stays visible within the trial. */
  stimulusMs: number;
  policy: AdaptivePolicyId;
  /** Show a correct/incorrect flash after each response. */
  feedback: boolean;
  /**
   * Shorten the trial as N rises, so a higher level is harder in two ways at
   * once. BrainScale advertises this as its "dynamic" setting.
   */
  dynamicPacing: boolean;
  keys: Record<Modality, string>;
}

export const NBACK_DEFAULTS: NBackConfig = {
  n: 2,
  modalities: ["position", "audio"],
  trialMs: 3000,
  stimulusMs: 500,
  policy: "standard",
  feedback: true,
  dynamicPacing: false,
  keys: { ...DEFAULT_KEYS },
};

/** The number of positions/colours/shapes/sounds each channel draws from. */
const CHANNEL_SIZE: Record<Modality, number> = { position: 9, audio: 8, color: 6, shape: 8 };

/**
 * Brain Workshop's session length, `20 + n²`. This is not arbitrary: as N rises
 * a block must get longer for the score to stay statistically meaningful, since
 * the first N trials of any block can never be targets.
 */
export function trialsForLevel(n: number): number {
  return 20 + n * n;
}

/** Trial pacing under dynamic mode: faster as N climbs, floored at 1.6s. */
export function trialMsForLevel(config: NBackConfig, n: number): number {
  if (!config.dynamicPacing) return config.trialMs;
  return Math.max(1600, config.trialMs - (n - 1) * 200);
}

export function modeLabel(config: NBackConfig): string {
  const count = config.modalities.length;
  const prefix = count === 1 ? MODALITY_LABEL[config.modalities[0]!] : count === 2 ? "Dual" : count === 3 ? "Triple" : "Quad";
  return `${prefix} ${config.n}-back`;
}

/* ------------------------------------------------------------------- State */

export interface TrialStimulus {
  position: number;
  audio: number;
  color: number;
  shape: number;
}

/** One modality's tally within a block. */
export interface ChannelScore {
  hits: number;
  misses: number;
  falseAlarms: number;
  correctRejections: number;
  targets: number;
}

export interface NBackState extends BaseState {
  n: number;
  trialMs: number;
  stimulusMs: number;
  policy: AdaptivePolicyId;
  trials: TrialStimulus[];
  /** Index of the trial currently being presented. */
  index: number;
  /** Which modalities the player has already answered for on this trial. */
  responded: Partial<Record<Modality, boolean>>;
  scores: Record<Modality, ChannelScore>;
  /** Feedback flash for the trial just judged. */
  lastFeedback: Partial<Record<Modality, "hit" | "falseAlarm">>;
  /** Set when the stimulus should be hidden but the trial has not yet ended. */
  stimulusVisible: boolean;
  modalities: Modality[];
}

function emptyScore(): ChannelScore {
  return { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0, targets: 0 };
}

/* ------------------------------------------------------------- Generation */

/**
 * Build a block with a controlled proportion of targets per modality.
 *
 * Sampling each trial independently would leave the target count to chance: a
 * block could land with two targets or fifteen, and the score would say more
 * about the draw than the player. So targets are *placed* first at a fixed
 * rate, then the non-target trials are filled with values chosen to avoid
 * accidentally matching N back.
 */
export function generateTrials(
  n: number,
  count: number,
  modalities: Modality[],
  seed: number,
  targetRate = 0.25,
): TrialStimulus[] {
  const rng = createRng(seed);
  const trials: TrialStimulus[] = Array.from({ length: count }, () => ({
    position: 0,
    audio: 0,
    color: 0,
    shape: 0,
  }));

  // Only trials at index >= n can be targets.
  const eligible = Array.from({ length: Math.max(0, count - n) }, (_, i) => i + n);
  const targetCount = Math.round(eligible.length * targetRate);

  for (const modality of MODALITIES) {
    const size = CHANNEL_SIZE[modality];
    const active = modalities.includes(modality);
    const targets = new Set(active ? rng.shuffle(eligible).slice(0, targetCount) : []);

    for (let i = 0; i < count; i++) {
      const prior = i >= n ? trials[i - n]![modality] : -1;

      if (targets.has(i)) {
        trials[i]![modality] = prior;
        continue;
      }

      // A non-target must not coincidentally equal the value N back, or the
      // player would be marked wrong for a response that was in fact correct.
      let value = rng.int(size);
      if (prior >= 0 && size > 1) {
        while (value === prior) value = rng.int(size);
      }
      trials[i]![modality] = value;
    }
  }

  return trials;
}

export function isTarget(trials: TrialStimulus[], index: number, n: number, modality: Modality): boolean {
  if (index < n) return false;
  return trials[index]![modality] === trials[index - n]![modality];
}

/* ------------------------------------------------------------------ Scoring */

/**
 * Per-modality accuracy over every trial that could be judged.
 *
 * Correct rejections count. Staying silent on a non-target is a real decision
 * and the dominant one — around three quarters of trials — so a scheme that
 * ignored it would let a player who never pressed anything score zero rather
 * than the 75% they actually earned.
 */
export function channelAccuracy(score: ChannelScore): number {
  const judged = score.hits + score.misses + score.falseAlarms + score.correctRejections;
  if (judged === 0) return 1;
  return (score.hits + score.correctRejections) / judged;
}

export function blockAccuracy(state: NBackState, policy: AdaptivePolicyId): number {
  const values = state.modalities.map((m) => channelAccuracy(state.scores[m]));
  if (values.length === 0) return 0;
  // Jaeggi scores the weakest modality, so a strong visual channel cannot
  // carry a neglected auditory one. Every other policy averages.
  if (policy === "jaeggi") return Math.min(...values);
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/* ------------------------------------------------------------------ Engine */

export interface NBackResult {
  accuracy: number;
  perModality: { modality: Modality; accuracy: number; score: ChannelScore }[];
  nextLevel: number;
  direction: "up" | "down" | "hold";
}

/**
 * Judge the trial at `index`: every modality with no response so far becomes
 * either a miss (it was a target) or a correct rejection (it was not).
 *
 * `responded` applies only to the trial the player was actually looking at, so
 * a swept-over trial (see `tick`) is judged as pure non-response.
 */
function closeTrial(state: NBackState, index: number, responded: Partial<Record<Modality, boolean>>): NBackState {
  const scores = { ...state.scores };

  for (const modality of state.modalities) {
    if (responded[modality]) continue; // already scored at the moment of the press
    const target = isTarget(state.trials, index, state.n, modality);
    const prev = scores[modality];
    scores[modality] = target
      ? { ...prev, misses: prev.misses + 1, targets: prev.targets + 1 }
      : { ...prev, correctRejections: prev.correctRejections + 1 };
  }

  return { ...state, scores };
}

export const nbackEngine: Engine<NBackConfig, NBackState, NBackResult> = {
  id: "n-back",

  init(config, seed) {
    const count = trialsForLevel(config.n);
    const trialMs = trialMsForLevel(config, config.n);
    return {
      phase: "presenting",
      elapsed: 0,
      seed,
      n: config.n,
      trialMs,
      stimulusMs: Math.min(config.stimulusMs, trialMs - 200),
      policy: config.policy,
      trials: generateTrials(config.n, count, config.modalities, seed),
      index: 0,
      responded: {},
      scores: {
        position: emptyScore(),
        audio: emptyScore(),
        color: emptyScore(),
        shape: emptyScore(),
      },
      lastFeedback: {},
      stimulusVisible: true,
      modalities: config.modalities,
    };
  },

  tick(state, elapsed) {
    if (state.phase === "finished") return state;

    const trialIndex = Math.floor(elapsed / state.trialMs);
    const withinTrial = elapsed - trialIndex * state.trialMs;
    const visible = withinTrial < state.stimulusMs;

    if (trialIndex === state.index) {
      if (visible === state.stimulusVisible) return state;
      return { ...state, elapsed, stimulusVisible: visible };
    }

    // Crossed at least one trial boundary. Normally exactly one, but a stalled
    // frame can span several, and every trial in between still has to be
    // judged — otherwise those trials silently vanish from the denominator.
    let next: NBackState = { ...state, elapsed };
    const lastToClose = Math.min(trialIndex, state.trials.length) - 1;
    for (let i = state.index; i <= lastToClose; i++) {
      next = closeTrial(next, i, i === state.index ? state.responded : {});
    }

    if (trialIndex >= state.trials.length) {
      return { ...next, phase: "finished", stimulusVisible: false };
    }

    return {
      ...next,
      index: trialIndex,
      responded: {},
      lastFeedback: {},
      stimulusVisible: visible,
    };
  },

  input(state, event: InputEvent) {
    if (event.kind !== "respond" || state.phase === "finished") return state;

    const modality = event.channel as Modality;
    if (!state.modalities.includes(modality)) return state;
    // One response per modality per trial. A second press is neither a second
    // hit nor a false alarm; it is the same decision, pressed twice.
    if (state.responded[modality]) return state;

    const target = isTarget(state.trials, state.index, state.n, modality);
    const prev = state.scores[modality];

    return {
      ...state,
      responded: { ...state.responded, [modality]: true },
      scores: {
        ...state.scores,
        [modality]: target
          ? { ...prev, hits: prev.hits + 1, targets: prev.targets + 1 }
          : { ...prev, falseAlarms: prev.falseAlarms + 1 },
      },
      lastFeedback: { ...state.lastFeedback, [modality]: target ? "hit" : "falseAlarm" },
    };
  },

  isFinished(state) {
    return state.phase === "finished";
  },

  result(state) {
    const perModality = state.modalities.map((m) => ({
      modality: m,
      accuracy: channelAccuracy(state.scores[m]),
      score: state.scores[m],
    }));
    const accuracy = blockAccuracy(state, state.policy);
    const change = applyPolicy(POLICIES[state.policy], state.n, accuracy, 0, { min: 1, max: 20 });
    return { accuracy, perModality, nextLevel: change.level, direction: change.direction };
  },

  toSession(state, config, startedAt): Omit<Session, "id"> {
    const { accuracy, nextLevel, direction } = nbackEngine.result(state);

    const metrics: Record<string, number | string> = {
      nextLevel,
      direction,
      trials: state.trials.length,
      trialMs: state.trialMs,
      policy: config.policy,
      modalities: state.modalities.join("+"),
    };
    for (const m of state.modalities) {
      const s = state.scores[m];
      metrics[`${m}Accuracy`] = Math.round(channelAccuracy(s) * 1000) / 1000;
      metrics[`${m}Hits`] = s.hits;
      metrics[`${m}Misses`] = s.misses;
      metrics[`${m}FalseAlarms`] = s.falseAlarms;
    }

    return {
      gameId: "n-back",
      mode: modeLabel({ ...config, n: state.n }),
      startedAt,
      durationMs: state.trials.length * state.trialMs,
      level: state.n,
      accuracy,
      score: Math.round(accuracy * 100),
      seed: state.seed,
      metrics,
    };
  },
};

