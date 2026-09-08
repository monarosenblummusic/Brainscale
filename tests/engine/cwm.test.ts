import { describe, expect, it } from "vitest";
import { createRng } from "@/lib/engine/rng";
import {
  CWM_DEFAULTS,
  GRID_CELLS,
  buildItems,
  buildPattern,
  cwmEngine,
  isSymmetric,
  type CwmConfig,
  type CwmState,
} from "@/lib/engine/cwm";

const cfg = (over: Partial<CwmConfig> = {}): CwmConfig => ({ ...CWM_DEFAULTS, ...over });

/** Answer the symmetry prompt, then run out the highlight and blank stages. */
function passItem(state: CwmState, config: CwmConfig, sayCorrect: boolean): CwmState {
  let s = state;
  const item = s.items[s.itemIndex]!;
  const say = sayCorrect ? item.symmetric : !item.symmetric;
  s = cwmEngine.input(s, { kind: "answer", value: say ? "symmetric" : "asymmetric" });

  const after = s.elapsed + config.highlightMs + config.blankMs + 20;
  for (let t = s.elapsed; t <= after; t += 50) s = cwmEngine.tick(s, t);
  return s;
}

/** Play one whole block: every item, then the recall. */
function playBlock(state: CwmState, config: CwmConfig, opts: { recall: boolean; symmetry: boolean }): CwmState {
  let s = state;
  const cells = s.items.map((i) => i.cell);

  while (s.stage !== "recall") s = passItem(s, config, opts.symmetry);

  const answer = opts.recall ? cells : [...cells].reverse();
  const given = answer.length > 1 || opts.recall ? answer : [(cells[0]! + 1) % GRID_CELLS];
  for (const c of given) s = cwmEngine.input(s, { kind: "select", index: c });

  const until = s.reviewUntil + 60;
  for (let t = s.elapsed; t <= until; t += 50) s = cwmEngine.tick(s, t);
  return s;
}

describe("symmetry patterns", () => {
  it("builds genuinely symmetric patterns when asked", () => {
    const rng = createRng(1);
    for (let i = 0; i < 100; i++) expect(isSymmetric(buildPattern(true, rng))).toBe(true);
  });

  it("never labels an asymmetric pattern that is in fact symmetric", () => {
    // The important guarantee: a random fill is only usually asymmetric, and
    // an occasional symmetric one labelled "asymmetric" would be unanswerable.
    const rng = createRng(2);
    for (let i = 0; i < 300; i++) expect(isSymmetric(buildPattern(false, rng))).toBe(false);
  });

  it("produces 64 cells", () => {
    expect(buildPattern(true, createRng(3))).toHaveLength(64);
  });
});

describe("block items", () => {
  it("never reuses a grid cell within one block", () => {
    for (let seed = 0; seed < 50; seed++) {
      const items = buildItems(6, seed);
      expect(new Set(items.map((i) => i.cell)).size).toBe(6);
    }
  });

  it("keeps cells inside the 4x4 grid", () => {
    for (const item of buildItems(10, 7)) {
      expect(item.cell).toBeGreaterThanOrEqual(0);
      expect(item.cell).toBeLessThan(GRID_CELLS);
    }
  });

  it("makes one item per set-size level", () => {
    expect(buildItems(2, 1)).toHaveLength(2);
    expect(buildItems(5, 1)).toHaveLength(5);
  });
});

describe("stage progression", () => {
  it("runs pattern to highlight to blank to the next pattern", () => {
    const config = cfg({ startLevel: 2 });
    let s = cwmEngine.init(config, 10);
    expect(s.stage).toBe("pattern");

    s = cwmEngine.input(s, { kind: "answer", value: "symmetric" });
    expect(s.stage).toBe("highlight");

    s = cwmEngine.tick(s, s.stageStart + config.highlightMs + 10);
    expect(s.stage).toBe("blank");

    s = cwmEngine.tick(s, s.stageStart + config.blankMs + 10);
    expect(s.stage).toBe("pattern");
    expect(s.itemIndex).toBe(1);
  });

  it("moves to recall once every item has been shown", () => {
    const config = cfg({ startLevel: 2 });
    let s = cwmEngine.init(config, 11);
    s = passItem(s, config, true);
    s = passItem(s, config, true);
    expect(s.stage).toBe("recall");
    expect(s.phase).toBe("responding");
  });

  it("records an unanswered symmetry prompt as unanswered, not wrong", () => {
    const config = cfg({ startLevel: 2, symmetryMs: 1000 });
    let s = cwmEngine.init(config, 12);
    s = cwmEngine.tick(s, 1100);
    expect(s.symmetryAnswers).toEqual([null]);
    expect(s.symmetryCorrect).toBe(0);
    expect(s.symmetryTotal).toBe(1);
    expect(s.stage).toBe("highlight");
  });
});

describe("recall grading", () => {
  it("requires the cells in the order they appeared", () => {
    const config = cfg({ startLevel: 3 });
    let s = cwmEngine.init(config, 20);
    s = playBlock(s, config, { recall: true, symmetry: true });
    expect(s.lastTrial?.recallOk).toBe(true);
    expect(s.recallCorrect).toBe(1);
  });

  it("rejects the right cells in the wrong order", () => {
    const config = cfg({ startLevel: 3 });
    let s = cwmEngine.init(config, 21);
    s = playBlock(s, config, { recall: false, symmetry: true });
    expect(s.lastTrial?.recallOk).toBe(false);
    expect(s.recallCorrect).toBe(0);
  });

  it("lets a mis-tapped cell be untapped before the block is graded", () => {
    const config = cfg({ startLevel: 3 });
    let s = cwmEngine.init(config, 22);
    while (s.stage !== "recall") s = passItem(s, config, true);

    const wrong = (s.items[0]!.cell + 5) % GRID_CELLS;
    s = cwmEngine.input(s, { kind: "select", index: wrong });
    expect(s.recall).toEqual([wrong]);
    s = cwmEngine.input(s, { kind: "select", index: wrong });
    expect(s.recall).toEqual([]);
    expect(s.stage).toBe("recall");
  });
});

describe("2-up / 2-down promotion", () => {
  it("promotes only after two consecutive perfect blocks", () => {
    const config = cfg({ startLevel: 2, trials: 10 });
    let s = cwmEngine.init(config, 30);

    s = playBlock(s, config, { recall: true, symmetry: true });
    expect(s.progress.level).toBe(2);
    expect(s.progress.successStreak).toBe(1);

    s = playBlock(s, config, { recall: true, symmetry: true });
    expect(s.progress.level).toBe(3);
  });

  it("demotes after two consecutive failures", () => {
    const config = cfg({ startLevel: 4, trials: 10 });
    let s = cwmEngine.init(config, 31);
    s = playBlock(s, config, { recall: false, symmetry: true });
    expect(s.progress.level).toBe(4);
    s = playBlock(s, config, { recall: false, symmetry: true });
    expect(s.progress.level).toBe(3);
  });

  it("treats a missed symmetry judgement as failing the block", () => {
    // Perfect recall is not enough: the interference task has to be kept up
    // with too, or the exercise degrades into a plain spatial span.
    const config = cfg({ startLevel: 2, trials: 10 });
    let s = cwmEngine.init(config, 32);
    s = playBlock(s, config, { recall: true, symmetry: false });
    expect(s.lastTrial?.recallOk).toBe(true);
    expect(s.progress.successStreak).toBe(0);
    expect(s.progress.level).toBe(2);
  });

  it("does not stop at a ceiling — it keeps training for the configured blocks", () => {
    const config = cfg({ startLevel: 2, trials: 4 });
    let s = cwmEngine.init(config, 33);
    for (let i = 0; i < 3; i++) s = playBlock(s, config, { recall: false, symmetry: false });
    expect(cwmEngine.isFinished(s)).toBe(false);
    s = playBlock(s, config, { recall: false, symmetry: false });
    expect(cwmEngine.isFinished(s)).toBe(true);
  });
});

describe("result", () => {
  it("weights recall above the interference task", () => {
    const config = cfg({ startLevel: 2, trials: 2 });
    let s = cwmEngine.init(config, 40);
    s = playBlock(s, config, { recall: true, symmetry: true });
    s = playBlock(s, config, { recall: true, symmetry: true });

    const r = cwmEngine.result(s);
    expect(r.recallAccuracy).toBe(1);
    expect(r.symmetryAccuracy).toBe(1);
    expect(r.accuracy).toBe(1);
    expect(r.best).toBe(2);
  });

  it("writes a session row naming the best set size", () => {
    const config = cfg({ startLevel: 2, trials: 2 });
    let s = cwmEngine.init(config, 41);
    s = playBlock(s, config, { recall: true, symmetry: true });
    s = playBlock(s, config, { recall: true, symmetry: true });

    const row = cwmEngine.toSession(s, config, 1_700_000_000_000);
    expect(row.gameId).toBe("complex-working-memory");
    expect(row.level).toBe(2);
    expect(row.metrics.bestSetSize).toBe(2);
    expect(row.mode).toContain("set size");
  });
});
