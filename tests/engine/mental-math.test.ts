import { describe, expect, it } from "vitest";
import { createRng } from "@/lib/engine/rng";
import {
  MENTAL_MATH_DEFAULTS,
  OPERATIONS,
  formatProblem,
  generateProblem,
  mentalMathEngine,
  pickOperation,
  type MentalMathConfig,
  type MentalMathState,
  type Operation,
} from "@/lib/engine/mental-math";

const cfg = (over: Partial<MentalMathConfig> = {}): MentalMathConfig => ({ ...MENTAL_MATH_DEFAULTS, ...over });

/** Answer the current problem; `elapsedMs` is how long it "took". */
function answer(state: MentalMathState, value: number, elapsedMs = 1000): MentalMathState {
  let s = mentalMathEngine.tick(state, state.askedAt + elapsedMs);
  for (const ch of String(value)) s = mentalMathEngine.input(s, { kind: "answer", value: ch });
  return mentalMathEngine.input(s, { kind: "submit" });
}

const solve = (s: MentalMathState, ms = 1000) => answer(s, s.problem.answer, ms);

describe("problem generation", () => {
  it("respects the digit count on each operand independently", () => {
    const rng = createRng(1);
    for (let i = 0; i < 200; i++) {
      const p = generateProblem("add", 3, 1, rng);
      expect(p.left).toBeGreaterThanOrEqual(100);
      expect(p.left).toBeLessThanOrEqual(999);
      expect(p.right).toBeGreaterThanOrEqual(2);
      expect(p.right).toBeLessThanOrEqual(9);
    }
  });

  it("never produces a negative subtraction", () => {
    const rng = createRng(2);
    for (let i = 0; i < 300; i++) {
      const p = generateProblem("subtract", 1, 3, rng);
      expect(p.answer).toBeGreaterThanOrEqual(0);
      expect(p.left).toBeGreaterThanOrEqual(p.right);
    }
  });

  it("always produces an exact division", () => {
    // Built from the answer rather than filtered, so this holds by
    // construction rather than by luck.
    const rng = createRng(3);
    for (let i = 0; i < 300; i++) {
      const p = generateProblem("divide", 2, 1, rng);
      expect(Number.isInteger(p.answer)).toBe(true);
      expect(p.left % p.right).toBe(0);
      expect(p.right * p.answer).toBe(p.left);
    }
  });

  it("never divides by zero or one", () => {
    const rng = createRng(4);
    for (let i = 0; i < 200; i++) {
      expect(generateProblem("divide", 2, 1, rng).right).toBeGreaterThanOrEqual(2);
    }
  });

  it("computes the answer correctly for every operation", () => {
    const rng = createRng(5);
    for (const op of OPERATIONS) {
      for (let i = 0; i < 60; i++) {
        const p = generateProblem(op, 2, 2, rng);
        const expected =
          op === "add" ? p.left + p.right
          : op === "subtract" ? p.left - p.right
          : op === "multiply" ? p.left * p.right
          : p.left / p.right;
        expect(p.answer).toBe(expected);
      }
    }
  });

  it("renders a readable problem", () => {
    expect(formatProblem({ left: 12, right: 4, operation: "divide", answer: 3 })).toBe("12 ÷ 4");
    expect(formatProblem({ left: 7, right: 8, operation: "multiply", answer: 56 })).toBe("7 × 8");
  });
});

describe("mix mode", () => {
  it("draws from all four operations", () => {
    const rng = createRng(6);
    const seen = new Set<Operation>();
    for (let i = 0; i < 400; i++) seen.add(pickOperation("mix", rng));
    expect(seen.size).toBe(4);
  });

  it("returns the fixed operation otherwise", () => {
    const rng = createRng(7);
    for (let i = 0; i < 20; i++) expect(pickOperation("multiply", rng)).toBe("multiply");
  });
});

describe("answering", () => {
  it("counts a correct answer", () => {
    const config = cfg({ adaptive: false });
    let s = mentalMathEngine.init(config, 10);
    s = solve(s);
    expect(s.solved).toBe(1);
    expect(s.attempted).toBe(1);
    expect(s.lastOutcome).toBe("correct");
  });

  it("counts a wrong answer and moves on", () => {
    const config = cfg({ adaptive: false });
    let s = mentalMathEngine.init(config, 11);
    const first = s.problem;
    s = answer(s, s.problem.answer + 1);
    expect(s.solved).toBe(0);
    expect(s.attempted).toBe(1);
    expect(s.problem).not.toEqual(first);
  });

  it("builds a multi-digit entry and backspaces", () => {
    const config = cfg();
    let s = mentalMathEngine.init(config, 12);
    s = mentalMathEngine.input(s, { kind: "answer", value: "4" });
    s = mentalMathEngine.input(s, { kind: "answer", value: "2" });
    expect(s.entry).toBe("42");
    s = mentalMathEngine.input(s, { kind: "clear" });
    expect(s.entry).toBe("4");
  });

  it("rejects non-digits", () => {
    const config = cfg();
    const s = mentalMathEngine.init(config, 13);
    expect(mentalMathEngine.input(s, { kind: "answer", value: "x" })).toBe(s);
  });

  it("records a skip as attempted but not solved", () => {
    const config = cfg({ adaptive: false });
    let s = mentalMathEngine.init(config, 14);
    s = mentalMathEngine.input(s, { kind: "skip" });
    expect(s.attempted).toBe(1);
    expect(s.solved).toBe(0);
  });
});

describe("independent per-operand adaptation", () => {
  it("grows one side at a time, favouring the smaller", () => {
    const config = cfg({ adaptive: true, leftDigits: 2, rightDigits: 1, fastMs: 6000 });
    let s = mentalMathEngine.init(config, 20);
    expect([s.leftDigits, s.rightDigits]).toEqual([2, 1]);

    // Four fast, correct answers promote — and the smaller side grows first.
    for (let i = 0; i < 4; i++) s = solve(s, 1000);
    expect([s.leftDigits, s.rightDigits]).toEqual([2, 2]);

    for (let i = 0; i < 4; i++) s = solve(s, 1000);
    expect([s.leftDigits, s.rightDigits]).toEqual([3, 2]);
  });

  it("does not promote on slow answers, however accurate", () => {
    const config = cfg({ adaptive: true, leftDigits: 2, rightDigits: 2, fastMs: 3000 });
    let s = mentalMathEngine.init(config, 21);
    for (let i = 0; i < 8; i++) s = solve(s, 9000);
    expect([s.leftDigits, s.rightDigits]).toEqual([2, 2]);
    expect(s.solved).toBe(8);
  });

  it("shrinks the larger side after consecutive failures", () => {
    const config = cfg({ adaptive: true, leftDigits: 3, rightDigits: 1 });
    let s = mentalMathEngine.init(config, 22);
    s = answer(s, s.problem.answer + 1);
    s = answer(s, s.problem.answer + 1);
    expect([s.leftDigits, s.rightDigits]).toEqual([2, 1]);
  });

  it("never shrinks below one digit", () => {
    const config = cfg({ adaptive: true, leftDigits: 1, rightDigits: 1 });
    let s = mentalMathEngine.init(config, 23);
    for (let i = 0; i < 10; i++) s = answer(s, s.problem.answer + 1);
    expect([s.leftDigits, s.rightDigits]).toEqual([1, 1]);
  });

  it("holds the level entirely when adaptation is off", () => {
    const config = cfg({ adaptive: false, leftDigits: 2, rightDigits: 1 });
    let s = mentalMathEngine.init(config, 24);
    for (let i = 0; i < 12; i++) s = solve(s, 500);
    expect([s.leftDigits, s.rightDigits]).toEqual([2, 1]);
  });
});

describe("session end", () => {
  it("ends when the timer runs out", () => {
    const config = cfg({ durationSec: 10 });
    let s = mentalMathEngine.init(config, 30);
    s = mentalMathEngine.tick(s, 9_000);
    expect(mentalMathEngine.isFinished(s)).toBe(false);
    s = mentalMathEngine.tick(s, 10_000);
    expect(mentalMathEngine.isFinished(s)).toBe(true);
  });

  it("ends after the problem count in fixed-count mode", () => {
    const config = cfg({ durationSec: 0, problemCount: 3, adaptive: false });
    let s = mentalMathEngine.init(config, 31);
    for (let i = 0; i < 3; i++) s = solve(s, 300);
    s = mentalMathEngine.tick(s, s.elapsed + 10);
    expect(mentalMathEngine.isFinished(s)).toBe(true);
    expect(s.attempted).toBe(3);
  });
});

describe("result and session row", () => {
  it("averages only the time spent on correct answers", () => {
    const config = cfg({ adaptive: false, durationSec: 0, problemCount: 10 });
    let s = mentalMathEngine.init(config, 40);
    s = solve(s, 2000);
    s = answer(s, s.problem.answer + 1, 9000); // wrong, slow
    s = solve(s, 4000);

    const r = mentalMathEngine.result(s);
    expect(r.solved).toBe(2);
    expect(r.attempted).toBe(3);
    expect(r.averageMs).toBe(3000);
  });

  it("writes a row scored on problems solved", () => {
    const config = cfg({ adaptive: false, operation: "multiply", leftDigits: 2, rightDigits: 1 });
    let s = mentalMathEngine.init(config, 41);
    s = solve(s, 1000);
    s = solve(s, 1000);

    const row = mentalMathEngine.toSession(s, config, 1_700_000_000_000);
    expect(row.gameId).toBe("mental-math");
    expect(row.score).toBe(2);
    expect(row.level).toBe(3);
    expect(row.mode).toBe("Multiplication · 2×1 digits");
  });
});
