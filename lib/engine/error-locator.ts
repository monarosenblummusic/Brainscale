import type { Session } from "@/lib/types";
import { createRng, type Rng } from "./rng";
import { PASSAGES } from "@/data/passages";
import type { BaseState, Engine, InputEvent } from "./types";

/**
 * Error Locator — find every fault planted in the passage.
 *
 * Reading for meaning works against you here. Comprehension smooths over
 * exactly the kind of small surface breakage being hunted — a doubled word is
 * famously near-invisible to a reader following the sense — so the exercise is
 * really about reading the surface instead of the meaning.
 */

export type FaultKind = "doubled" | "misspelling" | "punctuation";

export const FAULT_LABEL: Record<FaultKind, string> = {
  doubled: "Doubled word",
  misspelling: "Misspelling",
  punctuation: "Punctuation",
};

export interface Token {
  /** The text as displayed, faults included. */
  text: string;
  /** Set when this token is one of the planted faults. */
  fault: FaultKind | null;
  /** What it should have said, shown in the review. */
  correction?: string;
}

export interface ErrorLocatorConfig {
  /** Passages per session. */
  rounds: number;
  /** Faults planted per passage at the opening level. */
  startFaults: number;
  maxFaults: number;
  /** Seconds allowed per passage. */
  secondsPerRound: number;
  /** Wrong taps allowed before the round ends. */
  strikes: number;
}

export const ERROR_LOCATOR_DEFAULTS: ErrorLocatorConfig = {
  rounds: 4,
  startFaults: 3,
  maxFaults: 7,
  secondsPerRound: 60,
  strikes: 3,
};

/** Letter swaps that produce a plausible typo rather than obvious noise. */
const NEIGHBOUR_KEYS: Record<string, string> = {
  a: "s", b: "n", c: "v", d: "f", e: "r", f: "g", g: "h", h: "j", i: "o", j: "k",
  k: "l", l: "k", m: "n", n: "m", o: "p", p: "o", r: "t", s: "d", t: "y", u: "i",
  v: "b", w: "e", y: "u",
};

function misspell(word: string, rng: Rng): string | null {
  const letters = word.split("");
  // Only touch interior letters: a wrong first letter is spotted instantly and
  // a wrong last one often reads as a different valid word.
  const positions = letters
    .map((ch, i) => ({ ch: ch.toLowerCase(), i }))
    .filter(({ ch, i }) => i > 0 && i < letters.length - 1 && NEIGHBOUR_KEYS[ch]);

  if (positions.length === 0) return null;
  const { ch, i } = rng.pick(positions);
  letters[i] = NEIGHBOUR_KEYS[ch]!;
  return letters.join("");
}

/**
 * Plant `count` faults in a passage, returning the tokens as displayed.
 *
 * Faults never land adjacent to one another: two touching faults are hard to
 * attribute to a single tap, and the player would be marked wrong for finding
 * something that is genuinely there.
 */
export function buildTokens(passageIndex: number, count: number, seed: number): Token[] {
  const rng = createRng(seed);
  const passage = PASSAGES[passageIndex % PASSAGES.length]!;
  const words = passage.text.split(/\s+/);

  const tokens: Token[] = words.map((text) => ({ text, fault: null }));

  // Candidates: interior words long enough to carry a fault.
  const candidates = tokens
    .map((t, i) => ({ t, i }))
    .filter(({ t, i }) => i > 0 && i < tokens.length - 1 && t.text.replace(/[^A-Za-z]/g, "").length >= 4)
    .map(({ i }) => i);

  const chosen: number[] = [];
  for (const index of rng.shuffle(candidates)) {
    if (chosen.length >= count) break;
    if (chosen.some((c) => Math.abs(c - index) < 2)) continue;
    chosen.push(index);
  }

  // Descending, because planting a doubled word splices a token in and shifts
  // every index above it. Working downwards means the positions still to be
  // used are never the ones that moved.
  for (const index of chosen.sort((a, b) => b - a)) {
    const token = tokens[index]!;
    const bare = token.text.replace(/[^A-Za-z]/g, "");
    const kinds: FaultKind[] = ["doubled", "misspelling"];
    if (/[,.]$/.test(token.text)) kinds.push("punctuation");

    const kind = rng.pick(kinds);

    if (kind === "punctuation") {
      // Strip the mark that belongs there. A missing full stop is the classic
      // fault a reader glides straight over.
      tokens[index] = {
        text: token.text.replace(/[,.]$/, ""),
        fault: "punctuation",
        correction: token.text,
      };
      continue;
    }

    if (kind === "misspelling") {
      const wrong = misspell(bare, rng);
      if (wrong) {
        tokens[index] = {
          text: token.text.replace(bare, wrong),
          fault: "misspelling",
          correction: token.text,
        };
        continue;
      }
    }

    // Doubled word. The *second* occurrence is the fault, and it is the one
    // that keeps any trailing punctuation — putting the bare copy second would
    // strand the comma in the middle of the pair ("storm, storm").
    tokens[index] = { ...token, fault: "doubled", correction: "(remove)" };
    tokens.splice(index, 0, { text: bare, fault: null });
  }

  return tokens;
}

export type LocatorStage = "hunting" | "review";

export interface ErrorLocatorState extends BaseState {
  config: ErrorLocatorConfig;
  order: number[];
  round: number;
  tokens: Token[];
  /** Token indices the player has tapped. */
  tapped: number[];
  stage: LocatorStage;
  stageStart: number;
  faultsPlanted: number;
  found: number;
  missed: number;
  wrongTaps: number;
  level: number;
  reviewUntil: number;
}

const REVIEW_MS = 2200;

function startRound(state: ErrorLocatorState, atMs: number): ErrorLocatorState {
  const passageIndex = state.order[state.round % state.order.length] ?? 0;
  const count = Math.min(state.config.maxFaults, state.level);
  const tokens = buildTokens(passageIndex, count, state.seed + state.round * 7919);

  return {
    ...state,
    tokens,
    tapped: [],
    stage: "hunting",
    stageStart: atMs,
    phase: "responding",
    faultsPlanted: tokens.filter((t) => t.fault).length,
  };
}

export interface ErrorLocatorResult {
  found: number;
  planted: number;
  wrongTaps: number;
  accuracy: number;
  level: number;
}

export const errorLocatorEngine: Engine<ErrorLocatorConfig, ErrorLocatorState, ErrorLocatorResult> = {
  id: "error-locator",

  init(config, seed) {
    const rng = createRng(seed);
    const base: ErrorLocatorState = {
      phase: "responding",
      elapsed: 0,
      seed,
      config,
      order: rng.shuffle(PASSAGES.map((_, i) => i)),
      round: 0,
      tokens: [],
      tapped: [],
      stage: "hunting",
      stageStart: 0,
      faultsPlanted: 0,
      found: 0,
      missed: 0,
      wrongTaps: 0,
      level: config.startFaults,
      reviewUntil: 0,
    };
    return startRound(base, 0);
  },

  tick(state, elapsed) {
    if (state.phase === "finished") return state;

    if (state.stage === "hunting") {
      if (elapsed - state.stageStart >= state.config.secondsPerRound * 1000) return endRound({ ...state, elapsed });
      return state.elapsed === elapsed ? state : { ...state, elapsed };
    }

    if (state.stage === "review") {
      if (elapsed < state.reviewUntil) return { ...state, elapsed };
      if (state.round + 1 >= state.config.rounds) return { ...state, elapsed, phase: "finished" };
      return startRound({ ...state, elapsed, round: state.round + 1 }, elapsed);
    }

    return state.elapsed === elapsed ? state : { ...state, elapsed };
  },

  input(state, event: InputEvent) {
    if (state.stage !== "hunting" || event.kind !== "select") return state;

    const index = event.index;
    const token = state.tokens[index];
    if (!token || state.tapped.includes(index)) return state;

    const tapped = [...state.tapped, index];
    const correct = token.fault !== null;

    const next: ErrorLocatorState = {
      ...state,
      tapped,
      found: state.found + (correct ? 1 : 0),
      wrongTaps: state.wrongTaps + (correct ? 0 : 1),
    };

    const foundThisRound = tapped.filter((i) => state.tokens[i]?.fault).length;
    const wrongThisRound = tapped.length - foundThisRound;

    // The round ends either when every fault is found or when the player has
    // spent their strikes — guessing word by word should not be a strategy.
    if (foundThisRound >= state.faultsPlanted || wrongThisRound >= state.config.strikes) {
      return endRound(next);
    }
    return next;
  },

  isFinished(state) {
    return state.phase === "finished";
  },

  result(state) {
    const planted = state.found + state.missed;
    return {
      found: state.found,
      planted,
      wrongTaps: state.wrongTaps,
      accuracy: planted === 0 ? 0 : state.found / planted,
      level: state.level,
    };
  },

  toSession(state, config, startedAt): Omit<Session, "id"> {
    const r = errorLocatorEngine.result(state);
    return {
      gameId: "error-locator",
      mode: `${config.rounds} passages · ${r.level} faults each`,
      startedAt,
      durationMs: state.elapsed,
      level: r.level,
      accuracy: r.accuracy,
      score: r.found,
      seed: state.seed,
      metrics: {
        found: r.found,
        planted: r.planted,
        wrongTaps: r.wrongTaps,
        nextLevel: r.level,
      },
    };
  },
};

function endRound(state: ErrorLocatorState): ErrorLocatorState {
  const foundThisRound = state.tapped.filter((i) => state.tokens[i]?.fault).length;
  const missedThisRound = state.faultsPlanted - foundThisRound;
  const wrongThisRound = state.tapped.length - foundThisRound;

  // A clean sweep plants one more next time; a round that ran out of strikes
  // eases back.
  const level =
    missedThisRound === 0 && wrongThisRound === 0
      ? Math.min(state.config.maxFaults, state.level + 1)
      : wrongThisRound >= state.config.strikes
        ? Math.max(2, state.level - 1)
        : state.level;

  return {
    ...state,
    missed: state.missed + missedThisRound,
    level,
    stage: "review",
    phase: "feedback",
    reviewUntil: state.elapsed + REVIEW_MS,
  };
}
