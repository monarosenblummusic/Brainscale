import type { Session } from "@/lib/types";
import { createRng } from "./rng";
import { PASSAGES, type Passage } from "@/data/passages";
import type { BaseState, Engine, InputEvent } from "./types";

/**
 * Processing — rapid serial visual presentation.
 *
 * Words appear one at a time in a fixed spot, which removes eye movement from
 * reading entirely and leaves only recognition. Past roughly 300 words a minute
 * the inner voice most people read with cannot keep up, and the only way
 * through is to take meaning straight from the word.
 *
 * The comprehension question is not decoration: without it the exercise
 * degrades into watching words go by, and speed with no retention is not
 * reading. So the rate only rises when the question is answered correctly.
 */

export interface RsvpConfig {
  /** Opening rate in words per minute. */
  startWpm: number;
  /** Passages per session. */
  passages: number;
  /** Words per minute added after a correct answer. */
  stepWpm: number;
  /** Words per minute removed after a wrong one. */
  dropWpm: number;
  maxWpm: number;
  minWpm: number;
  /**
   * Hold longer on words ending a clause. Natural reading pauses at
   * punctuation, and removing that entirely hurts comprehension for reasons
   * unrelated to speed.
   */
  punctuationPause: boolean;
}

export const RSVP_DEFAULTS: RsvpConfig = {
  startWpm: 250,
  passages: 5,
  stepWpm: 40,
  dropWpm: 60,
  maxWpm: 900,
  minWpm: 120,
  punctuationPause: true,
};

export type RsvpStage = "reading" | "question" | "review";

export interface RsvpState extends BaseState {
  config: RsvpConfig;
  /** Passage order for this session. */
  order: number[];
  passageIndex: number;
  words: string[];
  /** Index of the word on screen; equals words.length once the passage ends. */
  wordIndex: number;
  stage: RsvpStage;
  stageStart: number;
  wpm: number;
  /** Best rate at which a question was answered correctly. */
  bestWpm: number;
  answered: number;
  correct: number;
  lastCorrect: boolean | null;
  chosen: number | null;
  reviewUntil: number;
}

const REVIEW_MS = 1600;

/**
 * The passage for a given position in the shuffled order. Wraps both the order
 * and the bank, so a session longer than the bank simply cycles rather than
 * running off the end.
 */
export function passageAt(order: number[], index: number): Passage {
  const pick = order[index % Math.max(1, order.length)] ?? 0;
  return PASSAGES[pick % PASSAGES.length]!;
}

export const passageFor = (state: RsvpState): Passage => passageAt(state.order, state.passageIndex);

/** Milliseconds a given word is held for, at a given rate. */
export function wordDuration(word: string, wpm: number, punctuationPause: boolean): number {
  const base = 60000 / wpm;
  if (!punctuationPause) return base;
  // A clause boundary gets roughly half a beat more, a sentence boundary a full
  // one. These are the pauses a reader takes anyway.
  if (/[.!?]$/.test(word)) return base * 2;
  if (/[,;:]$/.test(word)) return base * 1.5;
  return base;
}

/** Cumulative onset time of each word, so the engine can seek rather than step. */
export function wordSchedule(words: string[], wpm: number, punctuationPause: boolean): number[] {
  const onsets: number[] = [];
  let t = 0;
  for (const word of words) {
    onsets.push(t);
    t += wordDuration(word, wpm, punctuationPause);
  }
  onsets.push(t); // the end of the last word
  return onsets;
}

function startPassage(state: RsvpState, atMs: number): RsvpState {
  const passage = passageAt(state.order, state.passageIndex);
  return {
    ...state,
    words: passage.text.split(/\s+/),
    wordIndex: 0,
    stage: "reading",
    stageStart: atMs,
    phase: "presenting",
    chosen: null,
    lastCorrect: null,
  };
}

export interface RsvpResult {
  correct: number;
  answered: number;
  accuracy: number;
  bestWpm: number;
  finalWpm: number;
}

export const rsvpEngine: Engine<RsvpConfig, RsvpState, RsvpResult> = {
  id: "processing",

  init(config, seed) {
    const rng = createRng(seed);
    const order = rng.shuffle(PASSAGES.map((_, i) => i));

    const base: RsvpState = {
      phase: "presenting",
      elapsed: 0,
      seed,
      config,
      order,
      passageIndex: 0,
      words: [],
      wordIndex: 0,
      stage: "reading",
      stageStart: 0,
      wpm: config.startWpm,
      bestWpm: 0,
      answered: 0,
      correct: 0,
      lastCorrect: null,
      chosen: null,
      reviewUntil: 0,
    };
    return startPassage(base, 0);
  },

  tick(state, elapsed) {
    if (state.phase === "finished") return state;

    if (state.stage === "reading") {
      const onsets = wordSchedule(state.words, state.wpm, state.config.punctuationPause);
      const into = elapsed - state.stageStart;

      let index = state.wordIndex;
      while (index < state.words.length && into >= onsets[index + 1]!) index++;

      if (index >= state.words.length && into >= onsets[state.words.length]!) {
        return { ...state, elapsed, stage: "question", stageStart: elapsed, phase: "responding" };
      }
      return index === state.wordIndex ? { ...state, elapsed } : { ...state, elapsed, wordIndex: index };
    }

    if (state.stage === "review") {
      if (elapsed < state.reviewUntil) return { ...state, elapsed };
      if (state.passageIndex + 1 >= state.config.passages) return { ...state, elapsed, phase: "finished" };
      return startPassage({ ...state, elapsed, passageIndex: state.passageIndex + 1 }, elapsed);
    }

    return state.elapsed === elapsed ? state : { ...state, elapsed };
  },

  input(state, event: InputEvent) {
    if (state.stage !== "question" || event.kind !== "select") return state;

    const passage = passageAt(state.order, state.passageIndex);
    const correct = event.index === passage.answer;

    const { stepWpm, dropWpm, maxWpm, minWpm } = state.config;
    const wpm = correct ? Math.min(maxWpm, state.wpm + stepWpm) : Math.max(minWpm, state.wpm - dropWpm);

    return {
      ...state,
      chosen: event.index,
      lastCorrect: correct,
      answered: state.answered + 1,
      correct: state.correct + (correct ? 1 : 0),
      // The rate credited is the one just read at, not the one about to be set.
      bestWpm: correct ? Math.max(state.bestWpm, state.wpm) : state.bestWpm,
      wpm,
      stage: "review",
      phase: "feedback",
      reviewUntil: state.elapsed + REVIEW_MS,
    };
  },

  isFinished(state) {
    return state.phase === "finished";
  },

  result(state) {
    return {
      correct: state.correct,
      answered: state.answered,
      accuracy: state.answered === 0 ? 0 : state.correct / state.answered,
      bestWpm: state.bestWpm,
      finalWpm: state.wpm,
    };
  },

  toSession(state, config, startedAt): Omit<Session, "id"> {
    const r = rsvpEngine.result(state);
    return {
      gameId: "processing",
      mode: `${config.passages} passages · from ${config.startWpm} wpm`,
      startedAt,
      durationMs: state.elapsed,
      level: r.bestWpm,
      accuracy: r.accuracy,
      score: r.bestWpm,
      seed: state.seed,
      metrics: {
        bestWpm: r.bestWpm,
        finalWpm: r.finalWpm,
        correct: r.correct,
        answered: r.answered,
        nextLevel: r.finalWpm,
      },
    };
  },
};
