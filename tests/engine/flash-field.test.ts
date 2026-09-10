import { describe, expect, it } from "vitest";
import {
  DOUBLE_DECISION_DEFAULTS,
  HAWKEYE_DEFAULTS,
  RINGS,
  SPOKES,
  buildMarks,
  flashFieldEngine,
  type FlashFieldConfig,
  type FlashFieldState,
} from "@/lib/engine/flash-field";

const dd = (over: Partial<FlashFieldConfig> = {}): FlashFieldConfig => ({ ...DOUBLE_DECISION_DEFAULTS, ...over });
const hawk = (over: Partial<FlashFieldConfig> = {}): FlashFieldConfig => ({ ...HAWKEYE_DEFAULTS, ...over });

/** Run the presentation stages out so the engine will accept an answer. */
function toResponse(state: FlashFieldState): FlashFieldState {
  let s = state;
  for (let t = s.elapsed; t < s.elapsed + 3000; t += 20) {
    s = flashFieldEngine.tick(s, t);
    if (s.stage === "centre" || s.stage === "locate") break;
  }
  return s;
}

/** Play one trial, answering correctly or not. */
function playTrial(state: FlashFieldState, correct: boolean): FlashFieldState {
  let s = toResponse(state);

  if (s.stage === "centre") {
    const answer = correct ? s.centre : s.centre === "car" ? "truck" : "car";
    s = flashFieldEngine.input(s, { kind: "answer", value: answer });
  }

  const targets = s.marks.filter((m) => m.isTarget).map((m) => m.spoke);
  const picks = correct ? targets : targets.map((t) => (t + 3) % SPOKES);
  for (const spoke of picks) s = flashFieldEngine.input(s, { kind: "select", index: spoke });

  for (let t = s.elapsed; t < s.elapsed + 1500; t += 25) {
    s = flashFieldEngine.tick(s, t);
    if (s.stage === "fixation" || s.phase === "finished") break;
  }
  return s;
}

describe("field layout", () => {
  it("never puts two targets on the same spoke", () => {
    // Two targets on one spoke could be reported with a single tap.
    for (let seed = 0; seed < 200; seed++) {
      const marks = buildMarks(seed, 3, 4, 2);
      const targets = marks.filter((m) => m.isTarget).map((m) => m.spoke);
      expect(new Set(targets).size).toBe(targets.length);
    }
  });

  it("never puts a distractor on a target spoke", () => {
    // Otherwise a correct tap and a wrong one would be indistinguishable.
    for (let seed = 0; seed < 200; seed++) {
      const marks = buildMarks(seed, 2, 6, 2);
      const targets = new Set(marks.filter((m) => m.isTarget).map((m) => m.spoke));
      for (const mark of marks.filter((m) => !m.isTarget)) expect(targets.has(mark.spoke)).toBe(false);
    }
  });

  it("puts targets at the outer edge of the earned field", () => {
    for (const ring of [0, 1, 2]) {
      for (const mark of buildMarks(7, 2, 3, ring).filter((m) => m.isTarget)) {
        expect(mark.ring).toBe(ring);
      }
    }
  });

  it("keeps every mark inside the field", () => {
    for (const mark of buildMarks(3, 2, 6, RINGS.length - 1)) {
      expect(mark.spoke).toBeGreaterThanOrEqual(0);
      expect(mark.spoke).toBeLessThan(SPOKES);
      expect(mark.ring).toBeLessThan(RINGS.length);
    }
  });

  it("cannot ask for more targets than there are spokes", () => {
    expect(buildMarks(1, 99, 0, 0).filter((m) => m.isTarget)).toHaveLength(SPOKES);
  });
});

describe("presentation", () => {
  it("runs fixation, flash and mask before accepting an answer", () => {
    let s = flashFieldEngine.init(dd(), 1);
    expect(s.stage).toBe("fixation");

    s = flashFieldEngine.tick(s, 800);
    expect(s.stage).toBe("flash");

    s = flashFieldEngine.tick(s, 800 + s.exposureMs + 5);
    expect(s.stage).toBe("mask");

    s = toResponse(s);
    expect(s.stage).toBe("centre");
  });

  it("skips the central question when the game has no central task", () => {
    const s = toResponse(flashFieldEngine.init(hawk(), 2));
    expect(s.stage).toBe("locate");
  });

  it("refuses input while the field is still on screen", () => {
    const s = flashFieldEngine.init(dd(), 3);
    expect(flashFieldEngine.input(s, { kind: "select", index: 0 })).toBe(s);
  });
});

describe("the exposure ladder", () => {
  it("shortens the flash after a run of clean trials", () => {
    const config = dd({ downAfter: 2 });
    let s = flashFieldEngine.init(config, 10);
    const opening = s.exposureMs;

    s = playTrial(s, true);
    expect(s.exposureMs).toBe(opening); // one is not yet a run
    s = playTrial(s, true);
    expect(s.exposureMs).toBeLessThan(opening);
  });

  it("lengthens it again after a miss", () => {
    const config = dd({ upAfter: 1 });
    let s = flashFieldEngine.init(config, 11);
    s = playTrial(s, true);
    s = playTrial(s, true);
    const shortened = s.exposureMs;
    s = playTrial(s, false);
    expect(s.exposureMs).toBeGreaterThan(shortened);
  });

  it("descends below the ~200ms a saccade needs, which is the point of the task", () => {
    const config = dd({ downAfter: 1, trials: 200 });
    let s = flashFieldEngine.init(config, 12);
    for (let i = 0; i < 20 && !flashFieldEngine.isFinished(s); i++) s = playTrial(s, true);
    expect(s.exposureMs).toBeLessThan(200);
  });

  it("never goes below the configured floor", () => {
    const config = dd({ downAfter: 1, trials: 200, minMs: 16 });
    let s = flashFieldEngine.init(config, 13);
    for (let i = 0; i < 60 && !flashFieldEngine.isFinished(s); i++) s = playTrial(s, true);
    expect(s.exposureMs).toBeGreaterThanOrEqual(16);
  });

  it("widens the field once the flash cannot get any shorter", () => {
    const config = dd({ downAfter: 1, trials: 200, minMs: 100, startMs: 140 });
    let s = flashFieldEngine.init(config, 14);
    for (let i = 0; i < 40 && s.ring === 0 && !flashFieldEngine.isFinished(s); i++) s = playTrial(s, true);
    expect(s.ring).toBeGreaterThan(0);
  });
});

describe("grading", () => {
  it("requires both halves of the dual task", () => {
    // Getting the periphery right while missing the centre means the eyes left
    // the middle, which is exactly what the exercise forbids.
    let s = toResponse(flashFieldEngine.init(dd(), 20));
    s = flashFieldEngine.input(s, { kind: "answer", value: s.centre === "car" ? "truck" : "car" });
    for (const spoke of s.marks.filter((m) => m.isTarget).map((m) => m.spoke)) {
      s = flashFieldEngine.input(s, { kind: "select", index: spoke });
    }
    expect(s.lastTrialCorrect).toBe(false);
  });

  it("credits a trial where both halves are right", () => {
    const s = playTrial(flashFieldEngine.init(dd(), 21), true);
    expect(s.lastTrialCorrect).toBe(true);
    expect(s.correct).toBe(1);
  });

  it("requires every bird in Hawkeye, not just one", () => {
    const config = hawk({ targets: 3 });
    let s = toResponse(flashFieldEngine.init(config, 22));
    const targets = s.marks.filter((m) => m.isTarget).map((m) => m.spoke);
    s = flashFieldEngine.input(s, { kind: "select", index: targets[0]! });
    s = flashFieldEngine.input(s, { kind: "select", index: targets[1]! });
    s = flashFieldEngine.input(s, { kind: "select", index: (targets[2]! + 4) % SPOKES });
    expect(s.lastTrialCorrect).toBe(false);
  });

  it("lets a mis-tap be taken back before the trial is graded", () => {
    const config = hawk({ targets: 2 });
    let s = toResponse(flashFieldEngine.init(config, 23));
    s = flashFieldEngine.input(s, { kind: "select", index: 0 });
    expect(s.picked).toEqual([0]);
    s = flashFieldEngine.input(s, { kind: "select", index: 0 });
    expect(s.picked).toEqual([]);
    expect(s.lastTrialCorrect).toBeNull();
  });
});

describe("result", () => {
  it("reports the shortest exposure answered cleanly", () => {
    const config = dd({ downAfter: 1, trials: 6 });
    let s = flashFieldEngine.init(config, 30);
    while (!flashFieldEngine.isFinished(s)) s = playTrial(s, true);

    const r = flashFieldEngine.result(s);
    expect(r.correct).toBe(6);
    expect(r.bestMs).toBeLessThan(config.startMs);
    expect(r.accuracy).toBe(1);
  });

  it("records a level where higher means faster, so the charts read the right way", () => {
    const config = dd({ downAfter: 1, trials: 4 });
    let fast = flashFieldEngine.init(config, 31);
    while (!flashFieldEngine.isFinished(fast)) fast = playTrial(fast, true);

    let slow = flashFieldEngine.init(config, 31);
    while (!flashFieldEngine.isFinished(slow)) slow = playTrial(slow, false);

    const fastRow = flashFieldEngine.toSession(fast, config, 0);
    const slowRow = flashFieldEngine.toSession(slow, config, 0);
    expect(fastRow.level).toBeGreaterThan(slowRow.level);
    expect(fastRow.gameId).toBe("double-decision");
  });

  it("ends after the configured number of trials", () => {
    const config = hawk({ trials: 3 });
    let s = flashFieldEngine.init(config, 32);
    let guard = 0;
    while (!flashFieldEngine.isFinished(s) && guard++ < 20) s = playTrial(s, true);
    expect(s.trial).toBe(3);
  });
});
