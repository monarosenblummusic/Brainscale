import { describe, expect, it } from "vitest";
import { createRng } from "@/lib/engine/rng";
import {
  PERILOUS_DEFAULTS,
  areAdjacent,
  buildHazards,
  buildPath,
  cellIndex,
  expectedRoute,
  perilousEngine,
  type PerilousConfig,
  type PerilousState,
} from "@/lib/engine/perilous-path";

const cfg = (over: Partial<PerilousConfig> = {}): PerilousConfig => ({ ...PERILOUS_DEFAULTS, ...over });

/** Run the reveal out so the engine will accept steps. */
function toWalk(state: PerilousState): PerilousState {
  let s = state;
  const total = s.path.length * s.config.stepMs + 40;
  for (let t = s.stageStart; t <= s.stageStart + total; t += 50) s = perilousEngine.tick(s, t);
  return s;
}

/**
 * Walk one trial and stop at the moment it is graded, so `lastTrial` still
 * reports the outcome — ticking on into the review pause would start the next
 * trial and clear it.
 */
function walkTrial(state: PerilousState, mode: "clean" | "stray"): PerilousState {
  let s = state;
  if (s.stage === "review") s = settle(s);
  s = toWalk(s);
  const route = expectedRoute(s);

  for (let i = 0; i < route.length; i++) {
    const target = route[i]!;
    if (mode === "stray" && i === route.length - 1) {
      // Step somewhere adjacent to where we are that is not the route.
      const from = s.walked[s.walked.length - 1] ?? route[0]!;
      const options = [
        { x: from.x + 1, y: from.y },
        { x: from.x - 1, y: from.y },
        { x: from.x, y: from.y + 1 },
        { x: from.x, y: from.y - 1 },
      ].filter(
        (c) =>
          c.x >= 0 && c.y >= 0 && c.x < s.config.size && c.y < s.config.size &&
          !(c.x === target.x && c.y === target.y),
      );
      if (options[0]) s = perilousEngine.input(s, { kind: "select", index: cellIndex(options[0], s.config.size) });
      break;
    }
    s = perilousEngine.input(s, { kind: "select", index: cellIndex(target, s.config.size) });
  }

  return s;
}

/** Run the review pause out, so the next trial starts or the run ends. */
function settle(state: PerilousState): PerilousState {
  let s = state;
  for (let t = s.elapsed; t <= s.reviewUntil + 80; t += 50) s = perilousEngine.tick(s, t);
  return s;
}

describe("route building", () => {
  it("produces a connected route of the requested length", () => {
    for (let seed = 0; seed < 100; seed++) {
      const path = buildPath(5, 7, createRng(seed));
      expect(path).toHaveLength(7);
      for (let i = 1; i < path.length; i++) expect(areAdjacent(path[i - 1]!, path[i]!)).toBe(true);
    }
  });

  it("never crosses itself", () => {
    // A repeated square is ambiguous to retrace: arriving there, the player has
    // no way to know which continuation was meant.
    for (let seed = 0; seed < 100; seed++) {
      const path = buildPath(5, 9, createRng(seed));
      expect(new Set(path.map((c) => cellIndex(c, 5))).size).toBe(path.length);
    }
  });

  it("stays inside the grid", () => {
    for (const cell of buildPath(4, 10, createRng(3))) {
      expect(cell.x).toBeGreaterThanOrEqual(0);
      expect(cell.y).toBeGreaterThanOrEqual(0);
      expect(cell.x).toBeLessThan(4);
      expect(cell.y).toBeLessThan(4);
    }
  });

  it("still returns a route when the grid is nearly full", () => {
    const path = buildPath(3, 9, createRng(11));
    expect(path).toHaveLength(9);
  });
});

describe("hazards", () => {
  it("never sits on the route", () => {
    for (let seed = 0; seed < 100; seed++) {
      const rng = createRng(seed);
      const path = buildPath(5, 6, rng);
      const onPath = new Set(path.map((c) => cellIndex(c, 5)));
      for (const hazard of buildHazards(5, path, 5, rng)) {
        expect(onPath.has(cellIndex(hazard, 5))).toBe(false);
      }
    }
  });

  it("prefers squares beside the route, where a half-remembered step lands", () => {
    let adjacentCount = 0;
    let total = 0;
    for (let seed = 0; seed < 60; seed++) {
      const rng = createRng(seed);
      const path = buildPath(6, 6, rng);
      for (const hazard of buildHazards(6, path, 3, rng)) {
        total++;
        if (path.some((c) => areAdjacent(c, hazard))) adjacentCount++;
      }
    }
    expect(adjacentCount / total).toBeGreaterThan(0.85);
  });

  it("never asks for more hazards than there are free squares", () => {
    const rng = createRng(5);
    const path = buildPath(3, 8, rng);
    expect(buildHazards(3, path, 50, rng).length).toBeLessThanOrEqual(1);
  });
});

describe("walking the route", () => {
  it("accepts the route in order and clears the trial", () => {
    const s = walkTrial(perilousEngine.init(cfg(), 10), "clean");
    expect(s.lastTrial).toBe("cleared");
    expect(s.cleared).toBe(1);
  });

  it("ends the trial the moment a step leaves the route", () => {
    const s = walkTrial(perilousEngine.init(cfg({ startLength: 5 }), 11), "stray");
    expect(s.lastTrial).toBe("lost");
    expect(s.cleared).toBe(0);
  });

  it("refuses a step that is not adjacent to where you are", () => {
    let s = toWalk(perilousEngine.init(cfg(), 12));
    const route = expectedRoute(s);
    s = perilousEngine.input(s, { kind: "select", index: cellIndex(route[0]!, s.config.size) });

    const far = { x: (route[0]!.x + 2) % s.config.size, y: (route[0]!.y + 2) % s.config.size };
    const before = s.walked.length;
    s = perilousEngine.input(s, { kind: "select", index: cellIndex(far, s.config.size) });
    expect(s.walked).toHaveLength(before);
    expect(s.lastTrial).toBeNull();
  });

  it("ignores taps while the route is still being revealed", () => {
    const s = perilousEngine.init(cfg(), 13);
    expect(s.stage).toBe("reveal");
    expect(perilousEngine.input(s, { kind: "select", index: 0 })).toBe(s);
  });

  it("walks the route from the far end in reverse mode", () => {
    const s = perilousEngine.init(cfg({ reverse: true }), 14);
    const route = expectedRoute(s);
    expect(route[0]).toEqual(s.path[s.path.length - 1]);
    expect(walkTrial(s, "clean").lastTrial).toBe("cleared");
  });

  it("stepping onto a hazard loses the trial even when the route said so", () => {
    // Hazards never sit on the route, so this is a guard against a future
    // generator change silently making them coincide.
    let s = toWalk(perilousEngine.init(cfg(), 15));
    const hazard = s.hazards.find((h) => areAdjacent(h, expectedRoute(s)[0]!));
    if (!hazard) return;
    s = perilousEngine.input(s, { kind: "select", index: cellIndex(expectedRoute(s)[0]!, s.config.size) });
    s = perilousEngine.input(s, { kind: "select", index: cellIndex(hazard, s.config.size) });
    expect(s.lastTrial).toBe("lost");
  });
});

describe("progression", () => {
  it("lengthens the route after every clean run", () => {
    const config = cfg({ startLength: 4 });
    let s = perilousEngine.init(config, 20);
    expect(s.path).toHaveLength(4);

    s = settle(walkTrial(s, "clean"));
    expect(s.progress.level).toBe(5);
    expect(s.path).toHaveLength(5);
  });

  it("ends the run after two failures at the same length", () => {
    const config = cfg({ startLength: 5, attemptsPerLength: 2 });
    let s = perilousEngine.init(config, 21);
    s = settle(walkTrial(s, "stray"));
    expect(perilousEngine.isFinished(s)).toBe(false);
    s = settle(walkTrial(s, "stray"));
    expect(perilousEngine.isFinished(s)).toBe(true);
  });

  it("reports the longest route actually completed", () => {
    const config = cfg({ startLength: 4 });
    let s = perilousEngine.init(config, 22);
    s = settle(walkTrial(s, "clean")); // cleared 4
    s = settle(walkTrial(s, "clean")); // cleared 5
    s = settle(walkTrial(s, "stray"));
    s = walkTrial(s, "stray");

    const r = perilousEngine.result(s);
    expect(r.span).toBe(5);
    expect(r.cleared).toBe(2);
    expect(r.trials).toBe(4);
  });

  it("writes a session row naming the grid and direction", () => {
    const config = cfg({ reverse: true, size: 5 });
    const s = walkTrial(perilousEngine.init(config, 23), "clean");
    const row = perilousEngine.toSession(s, config, 1_700_000_000_000);
    expect(row.gameId).toBe("perilous-path");
    expect(row.mode).toBe("5×5 · reverse");
    expect(row.level).toBe(4);
  });
});
