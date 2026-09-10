import { describe, expect, it } from "vitest";
import { createRng } from "@/lib/engine/rng";
import {
  advanceMeter,
  MAX_MULTIPLIER,
  METER_SIZE,
  type SpeedTrialConfig,
  type SpeedTrialResult,
  type SpeedTrialState,
} from "@/lib/engine/speed-trial";
import type { Engine } from "@/lib/engine/types";
import {
  CHALKBOARD_DEFAULTS,
  CHALK_EQUAL,
  CHALK_LEFT,
  CHALK_RIGHT,
  chalkboardEngine,
  generateChalkboard,
} from "@/lib/engine/chalkboard";
import {
  AGILITY_DEFAULTS,
  AGILITY_TRUE,
  agilityEngine,
  generateAgility,
} from "@/lib/engine/agility";
import {
  MATCH_NO,
  MATCH_YES,
  SPATIAL_MATCH_DEFAULTS,
  generateSpatialMatch,
  spatialMatchEngine,
} from "@/lib/engine/spatial-match";

describe("the metered multiplier", () => {
  // Lumosity documents this exactly for Chalkboard Challenge, so it is pinned.
  it("steps the multiplier up every five correct answers", () => {
    let meter = { filled: 0, multiplier: 1 };
    for (let i = 0; i < METER_SIZE; i++) meter = advanceMeter(meter, true);
    expect(meter).toEqual({ filled: 0, multiplier: 2 });
  });

  it("empties a partly filled meter on a wrong answer, without costing a multiplier", () => {
    let meter = { filled: 3, multiplier: 4 };
    meter = advanceMeter(meter, false);
    expect(meter).toEqual({ filled: 0, multiplier: 4 });
  });

  it("costs a multiplier only when the meter is already empty", () => {
    expect(advanceMeter({ filled: 0, multiplier: 4 }, false)).toEqual({ filled: 0, multiplier: 3 });
  });

  it("never falls below 1 or rises above 10", () => {
    expect(advanceMeter({ filled: 0, multiplier: 1 }, false).multiplier).toBe(1);
    let meter = { filled: METER_SIZE - 1, multiplier: MAX_MULTIPLIER };
    meter = advanceMeter(meter, true);
    expect(meter.multiplier).toBe(MAX_MULTIPLIER);
  });
});

describe("chalkboard problems", () => {
  it("labels the larger side correctly, every time", () => {
    for (let seed = 0; seed < 400; seed++) {
      const rng = createRng(seed);
      const { data, answer } = generateChalkboard(rng, 1 + (seed % 10));
      const expected =
        data.a.value === data.b.value ? CHALK_EQUAL : data.a.value > data.b.value ? CHALK_LEFT : CHALK_RIGHT;
      expect(answer).toBe(expected);
    }
  });

  it("keeps every expression a whole, non-negative number", () => {
    for (let seed = 0; seed < 400; seed++) {
      const { data } = generateChalkboard(createRng(seed), 1 + (seed % 12));
      for (const side of [data.a, data.b]) {
        expect(Number.isInteger(side.value)).toBe(true);
        expect(side.value).toBeGreaterThanOrEqual(0);
        if (side.op === "÷") expect(side.left % side.right).toBe(0);
        if (side.op === "−") expect(side.left).toBeGreaterThanOrEqual(side.right);
      }
    }
  });

  it("keeps the two sides close, so the answer cannot be eyeballed", () => {
    // The point of the game is the hold-and-compare, which only happens when
    // both sides are genuinely in contention.
    const gaps: number[] = [];
    for (let seed = 0; seed < 300; seed++) {
      const { data } = generateChalkboard(createRng(seed), 5);
      gaps.push(Math.abs(data.a.value - data.b.value));
    }
    const median = gaps.sort((x, y) => x - y)[Math.floor(gaps.length / 2)]!;
    expect(median).toBeLessThanOrEqual(8);
  });

  it("offers a genuine tie often enough for the Equal button to matter", () => {
    let ties = 0;
    for (let seed = 0; seed < 400; seed++) {
      if (generateChalkboard(createRng(seed), 4).answer === CHALK_EQUAL) ties++;
    }
    expect(ties).toBeGreaterThan(10);
    expect(ties).toBeLessThan(160);
  });
});

describe("agility statements", () => {
  it("labels every statement correctly", () => {
    for (let seed = 0; seed < 500; seed++) {
      const level = 1 + (seed % 8);
      const { data, answer } = generateAgility(createRng(seed), level);

      if (data.kind === "equation") {
        const m = data.text.match(/^(\d+) ([+×]) (\d+) = (-?\d+)$/);
        expect(m).not.toBeNull();
        const [, a, op, b, stated] = m!;
        const real = op === "×" ? Number(a) * Number(b) : Number(a) + Number(b);
        expect(answer === AGILITY_TRUE).toBe(real === Number(stated));
        continue;
      }

      if (data.kind === "comparison") {
        const negated = data.text.startsWith("It is not true that");
        const m = data.text.match(/(\d+) is (greater than|less than) (\d+)/);
        expect(m).not.toBeNull();
        const [, a, relation, b] = m!;
        let claim = relation === "greater than" ? Number(a) > Number(b) : Number(a) < Number(b);
        if (negated) claim = !claim;
        expect(answer === AGILITY_TRUE).toBe(claim);
      }
    }
  });

  it("resolves orderings transitively", () => {
    for (let seed = 0; seed < 300; seed++) {
      const { data, answer } = generateAgility(createRng(seed), 7);
      if (data.kind !== "ordering") continue;

      const [premise, conclusion] = data.text.split(". Therefore ");
      const ranks = new Map<string, number>();
      for (const link of premise!.split(", ")) {
        const [, taller, shorter] = link.match(/^(\w+) is taller than (\w+)$/)!;
        if (!ranks.has(taller!)) ranks.set(taller!, ranks.size);
        if (!ranks.has(shorter!)) ranks.set(shorter!, ranks.size);
      }
      const [, x, y] = conclusion!.replace(".", "").match(/^(\w+) is taller than (\w+)$/)!;
      // Names were introduced in descending height order, so a lower index is taller.
      expect(answer === AGILITY_TRUE).toBe(ranks.get(x!)! < ranks.get(y!)!);
    }
  });

  it("balances true and false roughly evenly", () => {
    let trues = 0;
    for (let seed = 0; seed < 400; seed++) {
      if (generateAgility(createRng(seed), 5).answer === AGILITY_TRUE) trues++;
    }
    expect(trues).toBeGreaterThan(140);
    expect(trues).toBeLessThan(260);
  });
});

describe("spatial speed match", () => {
  it("marks the first stimulus of a run as having nothing to compare against", () => {
    const first = generateSpatialMatch(createRng(1), 5, null);
    expect(first.data.isFirst).toBe(true);
    expect(first.answer).toBe(MATCH_NO);
  });

  it("a match repeats shape, rotation and cell exactly", () => {
    for (let seed = 0; seed < 300; seed++) {
      const rng = createRng(seed);
      const first = generateSpatialMatch(rng, 8, null);
      const second = generateSpatialMatch(rng, 8, first);
      if (second.answer !== MATCH_YES) continue;
      expect(second.data.shape).toBe(first.data.shape);
      expect(second.data.rotation).toBe(first.data.rotation);
      expect(second.data.cell).toBe(first.data.cell);
    }
  });

  it("a non-match always differs in something visible", () => {
    for (let seed = 0; seed < 300; seed++) {
      const rng = createRng(seed);
      const first = generateSpatialMatch(rng, 8, null);
      const second = generateSpatialMatch(rng, 8, first);
      if (second.answer !== MATCH_NO) continue;
      const same =
        second.data.shape === first.data.shape &&
        second.data.rotation === first.data.rotation &&
        second.data.cell === first.data.cell;
      expect(same).toBe(false);
    }
  });

  it("only varies rotation and position once the level earns it", () => {
    for (let seed = 0; seed < 60; seed++) {
      const easy = generateSpatialMatch(createRng(seed), 1, null);
      expect(easy.data.rotation).toBe(0);
      expect(easy.data.cell).toBe(4); // the centre of a 3x3 grid
    }
  });
});

describe("the shared speed-trial engine", () => {
  const play = <Data,>(
    engine: Engine<SpeedTrialConfig, SpeedTrialState<Data>, SpeedTrialResult>,
    config: SpeedTrialConfig,
    answers: "correct" | "wrong",
    trials: number,
  ) => {
    let s = engine.init(config, 4242);
    for (let i = 0; i < trials; i++) {
      const pick = answers === "correct" ? s.problem.answer : (s.problem.answer + 1) % 3;
      s = engine.tick(s, s.askedAt + 300);
      s = engine.input(s, { kind: "select", index: pick });
    }
    return s;
  };

  it("scores ten points times the multiplier in force", () => {
    const s = play(chalkboardEngine, CHALKBOARD_DEFAULTS, "correct", 4);
    expect(s.correct).toBe(4);
    expect(s.score).toBe(40); // four trials at the opening multiplier of 1
  });

  it("pays the raised multiplier only from the trial after it is earned", () => {
    const s = play(chalkboardEngine, CHALKBOARD_DEFAULTS, "correct", 6);
    // Five at x1 earns x2; the sixth is the first to be paid at the new rate.
    expect(s.score).toBe(50 + 20);
    expect(s.meter.multiplier).toBe(2);
  });

  it("shortens the response window as you get them right and lengthens it when you do not", () => {
    const quick = play(chalkboardEngine, CHALKBOARD_DEFAULTS, "correct", 5);
    expect(quick.windowMs).toBe(CHALKBOARD_DEFAULTS.startMs - 5 * CHALKBOARD_DEFAULTS.quickenMs);

    const slow = play(chalkboardEngine, CHALKBOARD_DEFAULTS, "wrong", 3);
    expect(slow.windowMs).toBe(CHALKBOARD_DEFAULTS.startMs);
  });

  it("never lets the window fall below its floor", () => {
    const s = play(chalkboardEngine, CHALKBOARD_DEFAULTS, "correct", 200);
    expect(s.windowMs).toBeGreaterThanOrEqual(CHALKBOARD_DEFAULTS.minMs);
  });

  it("counts a lapsed window as an attempt, not a free pass", () => {
    let s = chalkboardEngine.init(CHALKBOARD_DEFAULTS, 7);
    s = chalkboardEngine.tick(s, s.windowMs + 10);
    expect(s.attempted).toBe(1);
    expect(s.correct).toBe(0);
    expect(s.lastOutcome).toBe("timeout");
  });

  it("raises the difficulty on a run of correct answers", () => {
    const s = play(agilityEngine, AGILITY_DEFAULTS, "correct", AGILITY_DEFAULTS.promoteStreak);
    expect(s.level).toBe(AGILITY_DEFAULTS.startLevel + 1);
  });

  it("ends when the clock runs out", () => {
    let s = spatialMatchEngine.init(SPATIAL_MATCH_DEFAULTS, 11);
    s = spatialMatchEngine.tick(s, SPATIAL_MATCH_DEFAULTS.durationSec * 1000);
    expect(spatialMatchEngine.isFinished(s)).toBe(true);
  });

  it("writes a session row under the right game id", () => {
    const s = play(chalkboardEngine, CHALKBOARD_DEFAULTS, "correct", 3);
    const row = chalkboardEngine.toSession(s, CHALKBOARD_DEFAULTS, 1_700_000_000_000);
    expect(row.gameId).toBe("chalkboard");
    expect(row.score).toBe(30);
    expect(row.accuracy).toBe(1);
  });
});
