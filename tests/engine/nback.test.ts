import { describe, expect, it } from "vitest";
import {
  blockAccuracy,
  canPromote,
  channelAccuracy,
  falseAlarmRate,
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
  // One rule, everywhere: the score is the share of targets caught, so the
  // percentage always equals the fraction printed next to it.
  const silent = { hits: 0, misses: 6, falseAlarms: 0, correctRejections: 18, targets: 6 };
  const half = { hits: 3, misses: 3, falseAlarms: 0, correctRejections: 18, targets: 6 };
  const perfect = { hits: 6, misses: 0, falseAlarms: 0, correctRejections: 18, targets: 6 };
  const spam = { hits: 6, misses: 0, falseAlarms: 18, correctRejections: 0, targets: 6 };

  it("is exactly caught over targets", () => {
    expect(channelAccuracy(silent)).toBe(0);
    expect(channelAccuracy(half)).toBe(0.5);
    expect(channelAccuracy(perfect)).toBe(1);
    expect(channelAccuracy({ hits: 5, misses: 5, falseAlarms: 0, correctRejections: 0, targets: 10 })).toBe(0.5);
    expect(channelAccuracy({ hits: 1, misses: 23, falseAlarms: 0, correctRejections: 0, targets: 24 })).toBeCloseTo(
      1 / 24,
      6,
    );
  });

  it("does not let false alarms change the score", () => {
    // Otherwise the percentage would stop agreeing with the count beside it.
    const withFalseAlarms = { ...half, falseAlarms: 9, correctRejections: 9 };
    expect(channelAccuracy(withFalseAlarms)).toBe(channelAccuracy(half));
  });

  it("measures the false-alarm rate against the non-target trials", () => {
    expect(falseAlarmRate(silent)).toBe(0);
    expect(falseAlarmRate(spam)).toBe(1);
    expect(falseAlarmRate({ ...half, falseAlarms: 9, correctRejections: 9 })).toBe(0.5);
  });

  it("penalises misses and false alarms equally", () => {
    const miss = channelAccuracy({ hits: 0, misses: 1, falseAlarms: 0, correctRejections: 3, targets: 1 });
    expect(miss).toBe(0);
  });

  it("scores a silent player at zero", () => {
    const config = cfg({ n: 2, modalities: ["position"], trialMs: 1000 });
    let s = nbackEngine.init(config, 42);
    s = run(s, s.trials.length * s.trialMs + 200);

    expect(nbackEngine.isFinished(s)).toBe(true);
    expect(channelAccuracy(s.scores.position)).toBe(0);
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
    expect(blockAccuracy(s, "classic")).toBe(1);
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
    const s = nbackEngine.init(config, 11);
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

  it("demotes a silent block, which now scores zero", () => {
    const { state } = blockWith("silent", "standard");
    const r = nbackEngine.result(state);
    expect(r.accuracy).toBe(0);
    expect(r.direction).toBe("down");
    expect(r.nextLevel).toBe(2);
  });

  it("holds a spammed block rather than promoting it", () => {
    // Pressing on every trial catches every target, so the detection score is
    // a perfect 100%. The false-alarm cap is the only thing standing between
    // that and a free promotion, which is exactly its job.
    const { state } = blockWith("spam", "standard");
    const r = nbackEngine.result(state);
    expect(r.accuracy).toBe(1);
    expect(canPromote(state, "standard")).toBe(false);
    expect(r.heldByFalseAlarms).toBe(true);
    expect(r.direction).toBe("hold");
    expect(r.nextLevel).toBe(3);
  });

  it("promotes a clean block and reports no false-alarm hold", () => {
    const { state } = blockWith("perfect", "standard");
    const r = nbackEngine.result(state);
    expect(canPromote(state, "standard")).toBe(true);
    expect(r.heldByFalseAlarms).toBe(false);
    expect(r.direction).toBe("up");
  });

  it("does not promote a mediocre block under Brain Workshop mode", () => {
    // Regression, in its second form. Brain Workshop's 80/50 thresholds were
    // once paired with a formula that credited correct non-responses, so at
    // 3-back catching just 2 of 7 targets scored 83% and *promoted* the player.
    // The score is now the share caught, so the same block reads 2/7 = 29%.
    const config = cfg({ n: 3, modalities: ["position"], trialMs: 1000, policy: "classic" });
    let s = nbackEngine.init(config, 2024);
    const total = s.trials.length;
    let caught = 0;

    for (let i = 0; i < total; i++) {
      s = nbackEngine.tick(s, i * 1000 + 10);
      if (isTarget(s.trials, i, s.n, "position") && caught < 2) {
        s = nbackEngine.input(s, { kind: "respond", channel: "position" });
        caught++;
      }
    }
    s = nbackEngine.tick(s, total * 1000 + 10);

    const targets = s.scores.position.targets;
    expect(s.scores.position.hits).toBe(2);
    expect(s.scores.position.falseAlarms).toBe(0);
    expect(blockAccuracy(s, "classic")).toBeCloseTo(2 / targets, 5);
    expect(blockAccuracy(s, "classic")).toBeLessThan(0.5);
    expect(nbackEngine.result(s).direction).toBe("hold"); // 1 of 3 failing blocks
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
