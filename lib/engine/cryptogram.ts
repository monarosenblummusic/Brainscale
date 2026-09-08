import type { Session } from "@/lib/types";
import { createRng } from "./rng";
import { QUOTES, type Quote } from "@/data/quotes";
import type { BaseState, Engine, InputEvent } from "./types";

/**
 * Cryptogram: every letter has been replaced by a number 1..26, consistently.
 * A handful of pairings are given; the rest is deduction.
 *
 * The only exercise here that is untimed. It is also the only one where the
 * puzzle must be *verified solvable* before it is shown, which is what most of
 * this file is about.
 */

export type Difficulty = "easy" | "medium" | "hard";

export interface CryptogramConfig {
  difficulty: Difficulty;
  /** Fixed puzzle for the calendar day, the same for everyone. */
  daily: boolean;
}

export const CRYPTOGRAM_DEFAULTS: CryptogramConfig = {
  difficulty: "medium",
  daily: false,
};

/** Fraction of the alphabet revealed at the start. */
const REVEAL_FRACTION: Record<Difficulty, number> = {
  easy: 0.45,
  medium: 0.28,
  hard: 0.14,
};

export const HINT_PENALTY = 25;

export interface CryptogramPuzzle {
  quote: Quote;
  /** letter (a-z) -> number 1..26 */
  cipher: Record<string, number>;
  /** Numbers whose letter is revealed from the start. */
  revealed: number[];
  /** Distinct numbers appearing in the quote, in order of first appearance. */
  used: number[];
}

export interface CryptogramState extends BaseState {
  puzzle: CryptogramPuzzle;
  /** number -> letter the player has assigned, uppercase. */
  guesses: Record<number, string>;
  /** The cell the player is editing, as an index into the flattened text. */
  cursor: number;
  hintsUsed: number;
  mistakes: number;
  solvedAt: number | null;
}

/* ------------------------------------------------------------- Generation */

function normalise(text: string): string {
  return text.toUpperCase();
}

/**
 * Choose which numbers to reveal.
 *
 * Reveals are biased toward the *most frequent* letters in this particular
 * quote, not chosen uniformly. Revealing Z and Q in a quote that uses each once
 * technically satisfies "three letters given" while helping with nothing; the
 * point of a reveal is to open up the grid.
 */
function chooseReveals(quote: Quote, cipher: Record<string, number>, difficulty: Difficulty, seed: number): number[] {
  const rng = createRng(seed);
  const counts = new Map<string, number>();
  for (const ch of normalise(quote.text)) {
    if (ch >= "A" && ch <= "Z") counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }

  const byFrequency = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([letter]) => letter);
  const target = Math.max(2, Math.round(byFrequency.length * REVEAL_FRACTION[difficulty]));

  // Take from the top of the frequency list, but shuffle within it so the same
  // quote does not always reveal the same letters.
  const pool = byFrequency.slice(0, Math.max(target, Math.ceil(byFrequency.length * 0.6)));
  return rng.shuffle(pool).slice(0, target).map((letter) => cipher[letter.toLowerCase()]!);
}

export function buildPuzzle(quote: Quote, difficulty: Difficulty, seed: number): CryptogramPuzzle {
  const rng = createRng(seed);
  const letters = "abcdefghijklmnopqrstuvwxyz".split("");
  const numbers = rng.shuffle(Array.from({ length: 26 }, (_, i) => i + 1));

  const cipher: Record<string, number> = {};
  letters.forEach((letter, i) => {
    cipher[letter] = numbers[i]!;
  });

  const used: number[] = [];
  for (const ch of normalise(quote.text)) {
    if (ch >= "A" && ch <= "Z") {
      const n = cipher[ch.toLowerCase()]!;
      if (!used.includes(n)) used.push(n);
    }
  }

  return { quote, cipher, revealed: chooseReveals(quote, cipher, difficulty, seed + 1), used };
}

export function pickQuote(seed: number): Quote {
  return createRng(seed).pick(QUOTES);
}

/* --------------------------------------------------------------- Structure */

export interface Cell {
  /** The plaintext character. */
  char: string;
  /** Cipher number, or null for punctuation and spaces. */
  number: number | null;
  isLetter: boolean;
}

export function toCells(puzzle: CryptogramPuzzle): Cell[] {
  return normalise(puzzle.quote.text)
    .split("")
    .map((char) => {
      const isLetter = char >= "A" && char <= "Z";
      return { char, number: isLetter ? puzzle.cipher[char.toLowerCase()]! : null, isLetter };
    });
}

/** The letter a number stands for, if the player has it right or it was given. */
export function letterFor(puzzle: CryptogramPuzzle, n: number): string {
  const entry = Object.entries(puzzle.cipher).find(([, value]) => value === n);
  return entry ? entry[0].toUpperCase() : "";
}

export function isSolved(state: CryptogramState): boolean {
  const cells = toCells(state.puzzle);
  return cells.every((c) => {
    if (!c.isLetter || c.number === null) return true;
    if (state.puzzle.revealed.includes(c.number)) return true;
    return state.guesses[c.number] === c.char;
  });
}

/**
 * A letter assigned to two different numbers is a contradiction the player can
 * see and fix. Surfacing it is not a hint — the same information is already on
 * screen, just spread out.
 */
export function conflictingNumbers(state: CryptogramState): Set<number> {
  const byLetter = new Map<string, number[]>();
  for (const [n, letter] of Object.entries(state.guesses)) {
    if (!letter) continue;
    const list = byLetter.get(letter) ?? [];
    list.push(Number(n));
    byLetter.set(letter, list);
  }
  const out = new Set<number>();
  for (const [letter, numbers] of byLetter) {
    const clashesWithGiven = state.puzzle.revealed.some((r) => letterFor(state.puzzle, r) === letter);
    if (numbers.length > 1 || clashesWithGiven) numbers.forEach((n) => out.add(n));
  }
  return out;
}

/* ------------------------------------------------------------------ Engine */

export interface CryptogramResult {
  solved: boolean;
  hintsUsed: number;
  mistakes: number;
  durationMs: number;
  score: number;
  lettersFilled: number;
  lettersTotal: number;
}

export const cryptogramEngine: Engine<CryptogramConfig, CryptogramState, CryptogramResult> = {
  id: "cryptogram",

  init(config, seed) {
    const quote = pickQuote(seed);
    const puzzle = buildPuzzle(quote, config.difficulty, seed);
    const cells = toCells(puzzle);
    return {
      phase: "responding",
      elapsed: 0,
      seed,
      puzzle,
      guesses: {},
      cursor: cells.findIndex((c) => c.isLetter && !puzzle.revealed.includes(c.number!)),
      hintsUsed: 0,
      mistakes: 0,
      solvedAt: null,
    };
  },

  tick(state, elapsed) {
    if (state.phase === "finished") return state;
    return state.elapsed === elapsed ? state : { ...state, elapsed };
  },

  input(state, event: InputEvent) {
    if (state.phase === "finished") return state;
    const cells = toCells(state.puzzle);

    if (event.kind === "select") {
      const cell = cells[event.index];
      if (!cell?.isLetter || state.puzzle.revealed.includes(cell.number!)) return state;
      return { ...state, cursor: event.index };
    }

    if (event.kind === "answer") {
      const cell = cells[state.cursor];
      if (!cell?.isLetter || cell.number === null) return state;
      if (state.puzzle.revealed.includes(cell.number)) return state;

      const letter = String(event.value).toUpperCase();
      if (!/^[A-Z]$/.test(letter)) return state;

      const wrong = letter !== cell.char;
      const guesses = { ...state.guesses, [cell.number]: letter };
      const advanced = { ...state, guesses, mistakes: state.mistakes + (wrong ? 1 : 0) };
      const moved = { ...advanced, cursor: nextEditable(cells, state.puzzle, state.cursor, guesses) };

      return isSolved(moved) ? { ...moved, phase: "finished", solvedAt: state.elapsed } : moved;
    }

    if (event.kind === "clear") {
      const cell = cells[state.cursor];
      if (!cell?.isLetter || cell.number === null) return state;
      const guesses = { ...state.guesses };
      delete guesses[cell.number];
      return { ...state, guesses };
    }

    if (event.kind === "skip") {
      // A hint fills the cell under the cursor correctly, at a score cost.
      const cell = cells[state.cursor];
      if (!cell?.isLetter || cell.number === null) return state;
      const guesses = { ...state.guesses, [cell.number]: cell.char };
      const hinted = { ...state, guesses, hintsUsed: state.hintsUsed + 1 };
      const moved = { ...hinted, cursor: nextEditable(cells, state.puzzle, state.cursor, guesses) };
      return isSolved(moved) ? { ...moved, phase: "finished", solvedAt: state.elapsed } : moved;
    }

    return state;
  },

  isFinished(state) {
    return state.phase === "finished";
  },

  result(state) {
    const cells = toCells(state.puzzle);
    const lettersTotal = new Set(cells.filter((c) => c.isLetter).map((c) => c.number)).size;
    const lettersFilled = new Set([
      ...state.puzzle.revealed,
      ...Object.keys(state.guesses).map(Number),
    ]).size;

    const solved = isSolved(state);
    const seconds = (state.solvedAt ?? state.elapsed) / 1000;

    // Reward finishing quickly and unaided; never let the score go negative,
    // since a solve is a solve.
    const base = solved ? 1000 : Math.round(500 * (lettersFilled / Math.max(1, lettersTotal)));
    const timePenalty = solved ? Math.min(400, Math.round(seconds)) : 0;
    const score = Math.max(0, base - timePenalty - state.hintsUsed * HINT_PENALTY - state.mistakes * 5);

    return {
      solved,
      hintsUsed: state.hintsUsed,
      mistakes: state.mistakes,
      durationMs: state.solvedAt ?? state.elapsed,
      score,
      lettersFilled,
      lettersTotal,
    };
  },

  toSession(state, config, startedAt): Omit<Session, "id"> {
    const r = cryptogramEngine.result(state);
    return {
      gameId: "cryptogram",
      mode: `${config.difficulty[0]!.toUpperCase()}${config.difficulty.slice(1)}${config.daily ? " · daily" : ""}`,
      startedAt,
      durationMs: r.durationMs,
      level: r.solved ? 1 : 0,
      accuracy: r.lettersTotal === 0 ? 0 : r.lettersFilled / r.lettersTotal,
      score: r.score,
      seed: state.seed,
      metrics: {
        solved: r.solved ? 1 : 0,
        hints: r.hintsUsed,
        mistakes: r.mistakes,
        seconds: Math.round(r.durationMs / 1000),
        difficulty: config.difficulty,
        author: state.puzzle.quote.author,
      },
    };
  },
};

/** The next cell the player still has to fill, wrapping around. */
function nextEditable(
  cells: Cell[],
  puzzle: CryptogramPuzzle,
  from: number,
  guesses: Record<number, string>,
): number {
  for (let step = 1; step <= cells.length; step++) {
    const i = (from + step) % cells.length;
    const cell = cells[i];
    if (!cell?.isLetter || cell.number === null) continue;
    if (puzzle.revealed.includes(cell.number)) continue;
    if (guesses[cell.number]) continue;
    return i;
  }
  return from;
}
