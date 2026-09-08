import { describe, expect, it } from "vitest";
import { QUOTES } from "@/data/quotes";
import { seedForDay } from "@/lib/engine/rng";
import {
  CRYPTOGRAM_DEFAULTS,
  buildPuzzle,
  conflictingNumbers,
  cryptogramEngine,
  isSolved,
  letterFor,
  pickQuote,
  toCells,
  type CryptogramConfig,
  type CryptogramState,
} from "@/lib/engine/cryptogram";

const cfg = (over: Partial<CryptogramConfig> = {}): CryptogramConfig => ({ ...CRYPTOGRAM_DEFAULTS, ...over });

/** Fill in every unrevealed cell correctly, as a player who solved it would. */
function solveFully(state: CryptogramState): CryptogramState {
  let s = state;
  const cells = toCells(s.puzzle);
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]!;
    if (!cell.isLetter || cell.number === null) continue;
    if (s.puzzle.revealed.includes(cell.number)) continue;
    if (s.guesses[cell.number]) continue;
    s = cryptogramEngine.input(s, { kind: "select", index: i });
    s = cryptogramEngine.input(s, { kind: "answer", value: cell.char });
  }
  return s;
}

describe("the quote bank", () => {
  it("has a usable number of quotes", () => {
    expect(QUOTES.length).toBeGreaterThan(100);
  });

  it("gives every quote an author", () => {
    for (const q of QUOTES) {
      expect(q.author.trim().length).toBeGreaterThan(0);
      expect(q.text.trim().length).toBeGreaterThan(0);
    }
  });

  it("keeps quotes inside a solvable length", () => {
    // Too short and letter frequencies say nothing; too long and it stops
    // being a single sitting.
    for (const q of QUOTES) {
      const letters = q.text.replace(/[^a-z]/gi, "").length;
      expect(letters).toBeGreaterThanOrEqual(20);
      expect(letters).toBeLessThanOrEqual(120);
    }
  });

  it("has no duplicates", () => {
    expect(new Set(QUOTES.map((q) => q.text)).size).toBe(QUOTES.length);
  });
});

describe("cipher construction", () => {
  it("is a bijection over the whole alphabet", () => {
    for (let seed = 0; seed < 50; seed++) {
      const puzzle = buildPuzzle(QUOTES[seed % QUOTES.length]!, "medium", seed);
      const values = Object.values(puzzle.cipher);
      expect(values).toHaveLength(26);
      expect(new Set(values).size).toBe(26);
      expect(Math.min(...values)).toBe(1);
      expect(Math.max(...values)).toBe(26);
    }
  });

  it("maps each number back to exactly one letter", () => {
    const puzzle = buildPuzzle(QUOTES[0]!, "medium", 1);
    for (const [letter, n] of Object.entries(puzzle.cipher)) {
      expect(letterFor(puzzle, n)).toBe(letter.toUpperCase());
    }
  });

  it("only reveals numbers that actually appear in the quote", () => {
    for (let seed = 0; seed < 60; seed++) {
      const puzzle = buildPuzzle(QUOTES[seed % QUOTES.length]!, "medium", seed);
      for (const n of puzzle.revealed) expect(puzzle.used).toContain(n);
    }
  });

  it("always leaves something to solve, at every difficulty", () => {
    // A reveal set covering every letter used would hand over the answer.
    for (const difficulty of ["easy", "medium", "hard"] as const) {
      for (let seed = 0; seed < QUOTES.length; seed++) {
        const puzzle = buildPuzzle(QUOTES[seed]!, difficulty, seed);
        expect(puzzle.revealed.length).toBeLessThan(puzzle.used.length);
      }
    }
  });

  it("reveals more on easy than on hard", () => {
    let easier = 0;
    for (let seed = 0; seed < 40; seed++) {
      const quote = QUOTES[seed]!;
      const easy = buildPuzzle(quote, "easy", seed).revealed.length;
      const hard = buildPuzzle(quote, "hard", seed).revealed.length;
      if (easy > hard) easier++;
    }
    expect(easier).toBeGreaterThan(35);
  });

  it("is deterministic for a given seed", () => {
    const a = buildPuzzle(QUOTES[3]!, "medium", 99);
    const b = buildPuzzle(QUOTES[3]!, "medium", 99);
    expect(a.cipher).toEqual(b.cipher);
    expect(a.revealed).toEqual(b.revealed);
  });
});

describe("every quote yields a completable puzzle", () => {
  it("can be filled in and recognised as solved", () => {
    for (let i = 0; i < QUOTES.length; i++) {
      let s = cryptogramEngine.init(cfg(), i);
      expect(isSolved(s)).toBe(false);
      s = solveFully(s);
      expect(isSolved(s)).toBe(true);
      expect(cryptogramEngine.isFinished(s)).toBe(true);
      expect(cryptogramEngine.result(s).solved).toBe(true);
    }
  });

  it("starts the cursor on a cell the player can actually edit", () => {
    for (let seed = 0; seed < 60; seed++) {
      const s = cryptogramEngine.init(cfg(), seed);
      const cell = toCells(s.puzzle)[s.cursor];
      expect(cell?.isLetter).toBe(true);
      expect(s.puzzle.revealed).not.toContain(cell!.number);
    }
  });
});

describe("cell structure", () => {
  it("marks punctuation and spaces as non-letters with no number", () => {
    const s = cryptogramEngine.init(cfg(), 5);
    for (const cell of toCells(s.puzzle)) {
      if (/[A-Z]/.test(cell.char)) {
        expect(cell.isLetter).toBe(true);
        expect(cell.number).not.toBeNull();
      } else {
        expect(cell.isLetter).toBe(false);
        expect(cell.number).toBeNull();
      }
    }
  });

  it("gives the same letter the same number everywhere in the quote", () => {
    const s = cryptogramEngine.init(cfg(), 6);
    const seen = new Map<string, number>();
    for (const cell of toCells(s.puzzle)) {
      if (!cell.isLetter || cell.number === null) continue;
      const previous = seen.get(cell.char);
      if (previous !== undefined) expect(cell.number).toBe(previous);
      seen.set(cell.char, cell.number);
    }
  });
});

describe("input", () => {
  it("refuses to edit a revealed cell", () => {
    const s = cryptogramEngine.init(cfg(), 7);
    const cells = toCells(s.puzzle);
    const revealedIndex = cells.findIndex((c) => c.isLetter && s.puzzle.revealed.includes(c.number!));
    expect(revealedIndex).toBeGreaterThanOrEqual(0);
    expect(cryptogramEngine.input(s, { kind: "select", index: revealedIndex })).toBe(s);
  });

  it("applies a guess to every cell carrying that number", () => {
    let s = cryptogramEngine.init(cfg(), 8);
    const cell = toCells(s.puzzle)[s.cursor]!;
    s = cryptogramEngine.input(s, { kind: "answer", value: "Q" });
    expect(s.guesses[cell.number!]).toBe("Q");
  });

  it("counts a wrong letter as a mistake", () => {
    let s = cryptogramEngine.init(cfg(), 9);
    const cell = toCells(s.puzzle)[s.cursor]!;
    const wrong = cell.char === "Z" ? "Y" : "Z";
    s = cryptogramEngine.input(s, { kind: "answer", value: wrong });
    expect(s.mistakes).toBe(1);
  });

  it("does not count a correct letter as a mistake", () => {
    let s = cryptogramEngine.init(cfg(), 10);
    const cell = toCells(s.puzzle)[s.cursor]!;
    s = cryptogramEngine.input(s, { kind: "answer", value: cell.char });
    expect(s.mistakes).toBe(0);
  });

  it("clears a guess", () => {
    let s = cryptogramEngine.init(cfg(), 11);
    const first = s.cursor;
    const cell = toCells(s.puzzle)[first]!;
    s = cryptogramEngine.input(s, { kind: "answer", value: "X" });
    s = cryptogramEngine.input(s, { kind: "select", index: first });
    s = cryptogramEngine.input(s, { kind: "clear" });
    expect(s.guesses[cell.number!]).toBeUndefined();
  });

  it("moves the cursor past cells that are already filled", () => {
    let s = cryptogramEngine.init(cfg(), 12);
    const before = s.cursor;
    s = cryptogramEngine.input(s, { kind: "answer", value: "A" });
    expect(s.cursor).not.toBe(before);
    const cell = toCells(s.puzzle)[s.cursor]!;
    expect(s.guesses[cell.number!]).toBeUndefined();
    expect(s.puzzle.revealed).not.toContain(cell.number);
  });

  it("rejects anything that is not a single letter", () => {
    const s = cryptogramEngine.init(cfg(), 13);
    expect(cryptogramEngine.input(s, { kind: "answer", value: "4" })).toBe(s);
    expect(cryptogramEngine.input(s, { kind: "answer", value: "AB" })).toBe(s);
  });
});

describe("conflicts", () => {
  it("flags the same letter assigned to two numbers", () => {
    let s = cryptogramEngine.init(cfg(), 14);
    const cells = toCells(s.puzzle);
    const editable = cells
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.isLetter && !s.puzzle.revealed.includes(c.number!));

    const first = editable[0]!;
    const second = editable.find(({ c }) => c.number !== first.c.number)!;

    s = cryptogramEngine.input(s, { kind: "select", index: first.i });
    s = cryptogramEngine.input(s, { kind: "answer", value: "Q" });
    s = cryptogramEngine.input(s, { kind: "select", index: second.i });
    s = cryptogramEngine.input(s, { kind: "answer", value: "Q" });

    const conflicts = conflictingNumbers(s);
    expect(conflicts.has(first.c.number!)).toBe(true);
    expect(conflicts.has(second.c.number!)).toBe(true);
  });

  it("reports nothing when every assignment is distinct", () => {
    const s = cryptogramEngine.init(cfg(), 15);
    expect(conflictingNumbers(s).size).toBe(0);
  });
});

describe("hints and scoring", () => {
  it("a hint fills the cell correctly and is counted", () => {
    let s = cryptogramEngine.init(cfg(), 16);
    const cell = toCells(s.puzzle)[s.cursor]!;
    s = cryptogramEngine.input(s, { kind: "skip" });
    expect(s.guesses[cell.number!]).toBe(cell.char);
    expect(s.hintsUsed).toBe(1);
    expect(s.mistakes).toBe(0);
  });

  it("scores a fast unaided solve above a slow hinted one", () => {
    let fast = cryptogramEngine.init(cfg(), 17);
    fast = cryptogramEngine.tick(fast, 20_000);
    fast = solveFully(fast);

    let slow = cryptogramEngine.init(cfg(), 17);
    slow = cryptogramEngine.input(slow, { kind: "skip" });
    slow = cryptogramEngine.input(slow, { kind: "skip" });
    slow = cryptogramEngine.tick(slow, 300_000);
    slow = solveFully(slow);

    expect(cryptogramEngine.result(fast).score).toBeGreaterThan(cryptogramEngine.result(slow).score);
  });

  it("never scores below zero", () => {
    let s = cryptogramEngine.init(cfg({ difficulty: "hard" }), 18);
    s = cryptogramEngine.tick(s, 3_600_000);
    for (let i = 0; i < 40; i++) s = cryptogramEngine.input(s, { kind: "skip" });
    expect(cryptogramEngine.result(s).score).toBeGreaterThanOrEqual(0);
  });

  it("writes a session row naming the author", () => {
    let s = cryptogramEngine.init(cfg(), 19);
    s = solveFully(s);
    const row = cryptogramEngine.toSession(s, cfg(), 1_700_000_000_000);
    expect(row.gameId).toBe("cryptogram");
    expect(row.metrics.solved).toBe(1);
    expect(row.metrics.author).toBe(s.puzzle.quote.author);
    expect(row.accuracy).toBe(1);
  });
});

describe("the daily puzzle", () => {
  it("is the same for everyone on the same day", () => {
    const seed = seedForDay("2026-09-08");
    expect(pickQuote(seed)).toEqual(pickQuote(seedForDay("2026-09-08")));
    expect(buildPuzzle(pickQuote(seed), "medium", seed).cipher).toEqual(
      buildPuzzle(pickQuote(seed), "medium", seed).cipher,
    );
  });

  it("differs from one day to the next", () => {
    const days = ["2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12"];
    const quotes = days.map((d) => pickQuote(seedForDay(d)).text);
    expect(new Set(quotes).size).toBeGreaterThan(1);
  });
});
