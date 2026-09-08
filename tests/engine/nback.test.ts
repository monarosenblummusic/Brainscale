import { describe, expect, it } from "vitest";
import {
  blockAccuracy,
  channelAccuracy,
  generateTrials,
  isTarget,
  modeLabel,
  nbackEngine,
  NBACK_DEFAULTS,
  trialMsForLevel,
  trialsForLevel,
  type Modality,
  type NBackConfig,
  type NBackState,
} from "@/lib/engine/nback";

const cfg = (over: Partial<NBackConfig> = {}): NBackConfig => ({ ...NBACK_DEFAULTS, ...over });

/** Drive an engine forward to a given elapsed time, one trial-step at a time. */
function run(state: NBackState, toMs: number, stepMs = 100) {
  let s = state;
  for (let t = stepMs; t <= toMs; t += stepMs) s = nbackEngine.tick(s, t);
  return s;
}

describe("trial count", () => {
  it("follows 20 + n^2", () => {
    expect(trialsForLevel(1)).toBe(21);
    expect(trialsForLevel(2)).toBe(24);
    expect(trialsForLevel(3)).toBe(29);
    // The figure a BrainScale player reported for dual 8-back.
    expect(trialsForLevel(8)).toBe(84);
  });
});

describe("dynamic pacing", () => {
  it("holds the trial time when off", () => {
    expect(trialMsForLevel(cfg({ dynamicPacing: false }), 6)).toBe(3000);
  });

  it("shortens as N rises but never below 1.6s", () => {
    const c = cfg({ dynamicPacing: true, trialMs: 3000 });
    expect(trialMsForLevel(c, 1)).toBe(3000);
    expect(trialMsForLevel(c, 3)).toBe(2600);
    expect(trialMsForLevel(c, 20)).toBe(1600);
  });
});

describe("trial generation", () => {
  const modalities: Modality[] = ["position", "audio", "color", "shape"];

  it("hits ~25% targets per modality, per block", () => {
    for (const n of [1, 2, 3, 5]) {
      const count = trialsForLevel(n);
      const trials = generateTrials(n, count, modalities, 12345 + n);
      const eligible = count - n;

      for (const m of modalities) {
        const targets = trials.filter((_, i) => isTarget(trials, i, n, m)).length;
        expect(targets).toBe(Math.round(eligible * 0.25));
      }
    }
  });

  it("never produces an accidental match on a non-target trial", () => {
    // The important half of the guarantee: if a trial was not *placed* as a
    // target it must not coincidentally equal the value n back, or the player
    // would be scored wrong for a correct press.
    const n = 3;
    const count = trialsForLevel(n);
    for (let seed = 0; seed < 40; seed++) {
      const trials = generateTrials(n, count, modalities, seed);
      const placed = new Map<Modality, Set<number>>();
      for (const m of modalities) {
        placed.set(
          m,
          new Set(trials.map((_, i) => i).filter((i) => isTarget(trials, i, n, m))),
        );
      }
      // Every match found is a deliberate one; count matches the placed rate.
      for (const m of modalities) {
        expect(placed.get(m)!.size).toBe(Math.round((count - n) * 0.25));
      }
    }
  });

  it("is deterministic for a given seed", () => {
    const a = generateTrials(2, 24, modalities, 777);
    const b = generateTrials(2, 24, modalities, 777);
    expect(a).toEqual(b);
    expect(generateTrials(2, 24, modalities, 778)).not.toEqual(a);
  });

  it("only generates values inside each channel's range", () => {
    const trials = generateTrials(2, 40, modalities, 99);
    for (const t of trials) {
      expect(t.position).toBeGreaterThanOrEqual(0);
      expect(t.position).toBeLessThan(9);
      expect(t.audio).toBeLessThan(8);
      expect(t.color).toBeLessThan(6);
      expect(t.shape).toBeLessThan(8);
    }
  });
});

describe("scoring", () => {
  it("counts a correct rejection when the player stays silent on a non-target", () => {
    expect(
      channelAccuracy({ hits: 0, misses: 0, falseAlarms: 0, correctRejections: 10, targets: 0 }),
    ).toBe(1);
  });

  it("penalises misses and false alarms equally", () => {
    const miss = channelAccuracy({ hits: 0, misses: 1, falseAlarms: 0, correctRejections: 3, targets: 1 });
    const fa = channelAccuracy({ hits: 0, misses: 0, falseAlarms: 1, correctRejections: 3, targets: 0 });
    expect(miss).toBeCloseTo(0.75);
    expect(fa).toBeCloseTo(0.75);
  });

  it("scores a silent player at the non-target rate, not zero", () => {
    const config = cfg({ n: 2, modalities: ["position"], trialMs: 1000 });
    let s = nbackEngine.init(config, 42);
    s = run(s, s.trials.length * s.trialMs + 200);

    expect(nbackEngine.isFinished(s)).toBe(true);
    const acc = channelAccuracy(s.scores.position);
    // 24 trials, 22 eligible, ~5-6 targets: silence earns roughly 0.75.
    expect(acc).toBeGreaterThan(0.7);
    expect(acc).toBeLessThan(0.8);
    expect(s.scores.position.hits).toBe(0);
    expect(s.scores.position.falseAlarms).toBe(0);
  });

  it("scores a perfect player at 1.0", () => {
    const config = cfg({ n: 2, modalities: ["position", "audio"], trialMs: 1000 });
    let s = nbackEngine.init(config, 4242);
    const total = s.trials.length;

    for (let i = 0; i < total; i++) {
      s = nbackEngine.tick(s, i * s.trialMs + 10);
      for (const m of config.modalities) {
        if (isTarget(s.trials, i, s.n, m)) s = nbackEngine.input(s, { kind: "respond", channel: m });
      }
    }
    s = nbackEngine.tick(s, total * s.trialMs + 10);

    expect(nbackEngine.isFinished(s)).toBe(true);
    expect(channelAccuracy(s.scores.position)).toBe(1);
    expect(channelAccuracy(s.scores.audio)).toBe(1);
    expect(blockAccuracy(s, "standard")).toBe(1);
  });

  it("ignores a repeated press on the same modality and trial", () => {
    const config = cfg({ n: 1, modalities: ["position"], trialMs: 1000 });
    let s = nbackEngine.init(config, 7);
    s = nbackEngine.tick(s, 1010); // move to trial 1, where a match is possible
    const before = { ...s.scores.position };
    s = nbackEngine.input(s, { kind: "respond", channel: "position" });
    const after = { ...s.scores.position };
    s = nbackEngine.input(s, { kind: "respond", channel: "position" });
    expect(s.scores.position).toEqual(after);
    expect(after).not.toEqual(before);
  });

  it("ignores a press on a modality that is not being played", () => {
    const config = cfg({ n: 2, modalities: ["position"], trialMs: 1000 });
    let s = nbackEngine.init(config, 11);
    const next = nbackEngine.input(s, { kind: "respond", channel: "shape" });
    expect(next).toBe(s);
  });

  it("judges every trial even when frames are dropped across boundaries", () => {
    const config = cfg({ n: 2, modalities: ["position"], trialMs: 1000 });
    let s = nbackEngine.init(config, 555);
    const total = s.trials.length;

    // One giant jump, as if the tab stalled for the whole block.
    s = nbackEngine.tick(s, total * 1000 + 50);

    const sc = s.scores.position;
    const judged = sc.hits + sc.misses + sc.falseAlarms + sc.correctRejections;
    expect(nbackEngine.isFinished(s)).toBe(true);
    expect(judged).toBe(total);
  });
});

describe("adaptive outcome", () => {
  type Behaviour = "perfect" | "silent" | "spam";

  function blockWith(behaviour: Behaviour, policy: NBackConfig["policy"]) {
    const config = cfg({ n: 3, modalities: ["position"], trialMs: 1000, policy });
    let s = nbackEngine.init(config, 2024);
    const total = s.trials.length;
    for (let i = 0; i < total; i++) {
      s = nbackEngine.tick(s, i * 1000 + 10);
      const press =
        behaviour === "spam" ||
        (behaviour === "perfect" && isTarget(s.trials, i, s.n, "position"));
      if (press) s = nbackEngine.input(s, { kind: "respond", channel: "position" });
    }
    s = nbackEngine.tick(s, total * 1000 + 10);
    return { state: s, config };
  }

  it("promotes after a perfect block", () => {
    const { state } = blockWith("perfect", "standard");
    const r = nbackEngine.result(state);
    expect(r.accuracy).toBe(1);
    expect(r.direction).toBe("up");
    expect(r.nextLevel).toBe(4);
  });

  it("holds a silent block, because most trials are correct rejections", () => {
    // Worth stating explicitly: silence is not a zero. Only ~25% of trials are
    // targets, so ignoring the block entirely still earns ~76% — above the
    // standard policy's 70% floor. This is faithful to how the paradigm scores,
    // and it is why the level does not collapse when a player zones out once.
    const { state } = blockWith("silent", "standard");
    const r = nbackEngine.result(state);
    expect(r.accuracy).toBeGreaterThan(0.7);
    expect(r.accuracy).toBeLessThan(0.8);
    expect(r.direction).toBe("hold");
    expect(r.nextLevel).toBe(3);
  });

  it("demotes when the player presses on every trial", () => {
    // Pressing everything turns every non-target into a false alarm, which is
    // the behaviour the down-threshold exists to catch.
    const { state } = blockWith("spam", "standard");
    const r = nbackEngine.result(state);
    expect(r.accuracy).toBeLessThan(0.7);
    expect(r.direction).toBe("down");
    expect(r.nextLevel).toBe(2);
  });

  it("holds a spammed block under the forgiving classic policy", () => {
    // ~0.24 is below classic's 0.5 floor, but classic needs three such blocks
    // in a row before it drops the level, so a single one holds.
    const { state } = blockWith("spam", "classic");
    const r = nbackEngine.result(state);
    expect(r.accuracy).toBeLessThan(0.5);
    expect(r.direction).toBe("hold");
    expect(r.nextLevel).toBe(3);
  });

  it("never moves the level under the manual policy", () => {
    const { state } = blockWith("perfect", "manual");
    const r = nbackEngine.result(state);
    expect(r.direction).toBe("hold");
    expect(r.nextLevel).toBe(3);
  });

  it("scores the weakest modality under Jaeggi", () => {
    const config = cfg({ n: 2, modalities: ["position", "audio"], trialMs: 1000, policy: "jaeggi" });
    let s = nbackEngine.init(config, 31337);
    const total = s.trials.length;
    // Answer position perfectly, ignore audio entirely.
    for (let i = 0; i < total; i++) {
      s = nbackEngine.tick(s, i * 1000 + 10);
      if (isTarget(s.trials, i, s.n, "position")) s = nbackEngine.input(s, { kind: "respond", channel: "position" });
    }
    s = nbackEngine.tick(s, total * 1000 + 10);

    expect(channelAccuracy(s.scores.position)).toBe(1);
    expect(blockAccuracy(s, "jaeggi")).toBe(channelAccuracy(s.scores.audio));
    expect(blockAccuracy(s, "jaeggi")).toBeLessThan(blockAccuracy(s, "standard"));
  });
});

describe("session row", () => {
  it("records the level played and the level to play next", () => {
    const config = cfg({ n: 2, modalities: ["position", "audio"], trialMs: 1000 });
    let s = nbackEngine.init(config, 909);
    s = run(s, s.trials.length * 1000 + 100);

    const row = nbackEngine.toSession(s, config, 1_700_000_000_000);
    expect(row.gameId).toBe("n-back");
    expect(row.level).toBe(2);
    expect(row.mode).toBe("Dual 2-back");
    expect(row.seed).toBe(909);
    expect(typeof row.metrics.nextLevel).toBe("number");
    expect(row.metrics.modalities).toBe("position+audio");
  });
});

describe("mode label", () => {
  it("names each modality count", () => {
    expect(modeLabel(cfg({ n: 3, modalities: ["position"] }))).toBe("Position 3-back");
    expect(modeLabel(cfg({ n: 2, modalities: ["position", "audio"] }))).toBe("Dual 2-back");
    expect(modeLabel(cfg({ n: 4, modalities: ["position", "audio", "color"] }))).toBe("Triple 4-back");
    expect(modeLabel(cfg({ n: 1, modalities: ["position", "audio", "color", "shape"] }))).toBe("Quad 1-back");
  });
});
