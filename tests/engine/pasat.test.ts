import { describe, expect, it } from "vitest";
import {
  ISI_LADDER,
  PASAT_DEFAULTS,
  generateDigits,
  isiFor,
  pasatEngine,
  type PasatConfig,
  type PasatState,
} from "@/lib/engine/pasat";

const cfg = (over: Partial<PasatConfig> = {}): PasatConfig => ({ ...PASAT_DEFAULTS, ...over });

/** Type an answer digit by digit. */
function answer(state: PasatState, value: number): PasatState {
  let s = state;
  for (const ch of String(value)) s = pasatEngine.input(s, { kind: "answer", value: ch });
  return s;
}

/** Advance to the digit at `index`. */
function toIndex(state: PasatState, index: number): PasatState {
  return pasatEngine.tick(state, index * state.isi + 10);
}

describe("digit generation", () => {
  it("stays within 1..9", () => {
    for (const d of generateDigits(200, 1)) {
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(9);
    }
  });

  it("never repeats a digit back to back", () => {
    // A repeat would make the next sum derivable by doubling the last one,
    // handing over a free item.
    for (let seed = 0; seed < 40; seed++) {
      const digits = generateDigits(100, seed);
      for (let i = 1; i < digits.length; i++) expect(digits[i]).not.toBe(digits[i - 1]);
    }
  });

  it("is deterministic per seed", () => {
    expect(generateDigits(30, 9)).toEqual(generateDigits(30, 9));
  });
});

describe("the ISI ladder", () => {
  it("exposes the four standard intervals", () => {
    expect([...ISI_LADDER]).toEqual([3000, 2400, 2000, 1600]);
  });

  it("clamps out-of-range levels", () => {
    expect(isiFor(-3)).toBe(3000);
    expect(isiFor(99)).toBe(1600);
  });
});

describe("the sum is of the last two digits, not a running total", () => {
  it("accepts the pairwise sum", () => {
    const config = cfg({ digits: 6 });
    let s = pasatEngine.init(config, 100);
    s = toIndex(s, 1);

    const expected = s.sequence[0]! + s.sequence[1]!;
    s = answer(s, expected);
    expect(s.lastOutcome).toBe("correct");
  });

  it("rejects a running total", () => {
    const config = cfg({ digits: 8 });
    let s = pasatEngine.init(config, 101);

    s = toIndex(s, 1);
    s = answer(s, s.sequence[0]! + s.sequence[1]!);
    expect(s.lastOutcome).toBe("correct");

    s = toIndex(s, 2);
    const runningTotal = s.sequence[0]! + s.sequence[1]! + s.sequence[2]!;
    const pairwise = s.sequence[1]! + s.sequence[2]!;
    // Guard: only meaningful when the two differ, which they always do here
    // since digits are >= 1.
    expect(runningTotal).not.toBe(pairwise);

    s = answer(s, runningTotal);
    expect(s.lastOutcome).toBe("wrong");
  });

  it("has no question on the very first digit", () => {
    const config = cfg({ digits: 5 });
    const s = pasatEngine.init(config, 102);
    expect(s.index).toBe(0);
    expect(pasatEngine.input(s, { kind: "answer", value: "7" })).toBe(s);
  });
});

describe("two-digit answers", () => {
  it("waits for a second keystroke after a leading 1", () => {
    // Sums run 3..17, so a leading "1" can only ever be the start of a
    // two-digit answer; treating it as complete would fail every teen sum.
    const config = cfg({ digits: 40 });
    let s = pasatEngine.init(config, 103);

    let found = false;
    for (let i = 1; i < 39 && !found; i++) {
      s = toIndex(s, i);
      const expected = s.sequence[i]! + s.sequence[i - 1]!;
      if (expected < 10) continue;
      found = true;

      s = pasatEngine.input(s, { kind: "answer", value: "1" });
      expect(s.answered).toBe(false);
      expect(s.entry).toBe("1");

      s = pasatEngine.input(s, { kind: "answer", value: String(expected % 10) });
      expect(s.lastOutcome).toBe("correct");
    }
    expect(found).toBe(true);
  });

  it("treats any other leading digit as a complete answer", () => {
    const config = cfg({ digits: 40 });
    let s = pasatEngine.init(config, 104);

    let found = false;
    for (let i = 1; i < 39 && !found; i++) {
      s = toIndex(s, i);
      const expected = s.sequence[i]! + s.sequence[i - 1]!;
      if (expected >= 10) continue;
      found = true;
      s = pasatEngine.input(s, { kind: "answer", value: String(expected) });
      expect(s.answered).toBe(true);
      expect(s.lastOutcome).toBe("correct");
    }
    expect(found).toBe(true);
  });

  it("ignores a second answer for the same pair", () => {
    const config = cfg({ digits: 10 });
    let s = pasatEngine.init(config, 105);
    s = toIndex(s, 1);
    s = answer(s, s.sequence[0]! + s.sequence[1]!);
    const outcomes = s.outcomes.length;
    s = pasatEngine.input(s, { kind: "answer", value: "9" });
    expect(s.outcomes.length).toBe(outcomes);
  });
});

describe("pacing and misses", () => {
  it("records a miss when the interval passes unanswered", () => {
    const config = cfg({ digits: 6 });
    let s = pasatEngine.init(config, 106);
    s = toIndex(s, 1);
    s = toIndex(s, 2);
    expect(s.outcomes).toEqual(["missed"]);
  });

  it("distinguishes a miss from a wrong answer", () => {
    const config = cfg({ digits: 8 });
    let s = pasatEngine.init(config, 107);
    s = toIndex(s, 1);
    s = answer(s, 99);
    s = toIndex(s, 2);
    s = toIndex(s, 3);
    expect(s.outcomes[0]).toBe("wrong");
    expect(s.outcomes[1]).toBe("missed");
  });

  it("produces exactly one sum per pair over a whole run", () => {
    // The classic protocol is 61 digits and 60 sums; every pair must be
    // accounted for exactly once whatever the player does.
    const config = cfg({ digits: 61 });
    let s = pasatEngine.init(config, 108);
    s = pasatEngine.tick(s, 61 * s.isi + 50);
    expect(pasatEngine.isFinished(s)).toBe(true);
    expect(s.outcomes).toHaveLength(60);
    expect(s.outcomes.every((o) => o === "missed")).toBe(true);
  });

  it("accounts for every pair when the clock jumps several intervals", () => {
    const config = cfg({ digits: 20 });
    let s = pasatEngine.init(config, 109);
    s = pasatEngine.tick(s, 5 * s.isi + 10);
    expect(s.outcomes).toHaveLength(4);
    expect(s.index).toBe(5);
  });
});

describe("scoring", () => {
  it("tracks the longest unbroken run of correct sums", () => {
    const config = cfg({ digits: 10 });
    let s = pasatEngine.init(config, 110);
    for (let i = 1; i <= 4; i++) {
      s = toIndex(s, i);
      s = answer(s, s.sequence[i]! + s.sequence[i - 1]!);
    }
    s = toIndex(s, 5);
    s = answer(s, 99); // break the run
    for (let i = 6; i <= 7; i++) {
      s = toIndex(s, i);
      s = answer(s, s.sequence[i]! + s.sequence[i - 1]!);
    }
    expect(s.longestRun).toBe(4);
  });

  it("quickens the pace after a strong run", () => {
    const config = cfg({ digits: 12, isiLevel: 0, adaptive: true });
    let s = pasatEngine.init(config, 111);
    for (let i = 1; i < 12; i++) {
      s = toIndex(s, i);
      s = answer(s, s.sequence[i]! + s.sequence[i - 1]!);
    }
    s = pasatEngine.tick(s, 12 * s.isi + 10);

    const r = pasatEngine.result(s);
    expect(r.accuracy).toBe(1);
    expect(r.nextIsiLevel).toBe(1);
  });

  it("eases the pace after a poor run", () => {
    const config = cfg({ digits: 12, isiLevel: 2, adaptive: true });
    let s = pasatEngine.init(config, 112);
    s = pasatEngine.tick(s, 12 * s.isi + 10);
    const r = pasatEngine.result(s);
    expect(r.accuracy).toBe(0);
    expect(r.nextIsiLevel).toBe(1);
  });

  it("holds the pace when adaptation is off", () => {
    const config = cfg({ digits: 12, isiLevel: 1, adaptive: false });
    let s = pasatEngine.init(config, 113);
    s = pasatEngine.tick(s, 12 * s.isi + 10);
    expect(pasatEngine.result(s).nextIsiLevel).toBe(1);
  });

  it("writes a session row scored on correct sums", () => {
    const config = cfg({ digits: 12, isiLevel: 0 });
    let s = pasatEngine.init(config, 114);
    for (let i = 1; i < 12; i++) {
      s = toIndex(s, i);
      s = answer(s, s.sequence[i]! + s.sequence[i - 1]!);
    }
    s = pasatEngine.tick(s, 12 * s.isi + 10);

    const row = pasatEngine.toSession(s, config, 1_700_000_000_000);
    expect(row.gameId).toBe("pasat");
    expect(row.score).toBe(11);
    expect(row.level).toBe(1);
    expect(row.metrics.isiMs).toBe(3000);
    expect(row.mode).toBe("3.0s pace · 12 digits");
  });
});
