import { describe, expect, it } from "vitest";
import { createRng } from "@/lib/engine/rng";
import {
  TURTLE_DEFAULTS,
  buildBoard,
  isAdjacent,
  isReachable,
  pointIndex,
  samePoint,
  turtleEngine,
  type TurtleConfig,
  type TurtleState,
} from "@/lib/engine/turtle-traffic";

const cfg = (over: Partial<TurtleConfig> = {}): TurtleConfig => ({ ...TURTLE_DEFAULTS, ...over });

/** Move a turtle one square, by tapping it then tapping the destination. */
function step(state: TurtleState, id: number, to: { x: number; y: number }): TurtleState {
  const size = state.config.size;
  const turtle = state.turtles.find((t) => t.id === id)!;
  let s = state;
  if (s.selected !== id) s = turtleEngine.input(s, { kind: "select", index: pointIndex(turtle.at, size) });
  return turtleEngine.input(s, { kind: "select", index: pointIndex(to, size) });
}

/**
 * Drive every turtle home, one step at a time, re-planning after each move.
 *
 * A greedy "head towards home" driver deadlocks the moment another turtle sits
 * in the way — it sidesteps, then immediately steps back. So this does a real
 * breadth-first search around the rocks *and* the other turtles, and recomputes
 * after every move because the obstacles are moving too.
 */
function driveAllHome(state: TurtleState): TurtleState {
  let s = state;

  for (let guard = 0; guard < 400; guard++) {
    if (s.stage !== "playing") break;
    const pending = s.turtles.filter((t) => !t.arrived);
    if (pending.length === 0) break;

    let movedAny = false;
    for (const turtle of pending) {
      const next = firstStepHome(s, turtle.id);
      if (!next) continue;
      const before = turtle.at;
      const after = step(s, turtle.id, next);
      const moved = after.turtles.find((t) => t.id === turtle.id)!.at;
      if (!samePoint(before, moved)) {
        s = after;
        movedAny = true;
        if (s.stage !== "playing") return s;
      }
    }
    if (!movedAny) break;
  }
  return s;
}

/** The first square on a shortest path home, or null if none is open. */
function firstStepHome(state: TurtleState, id: number): { x: number; y: number } | null {
  const size = state.config.size;
  const turtle = state.turtles.find((t) => t.id === id)!;
  const blocked = new Set([
    ...state.rocks.map((r) => pointIndex(r, size)),
    ...state.turtles.filter((t) => t.id !== id && !t.arrived).map((t) => pointIndex(t.at, size)),
  ]);

  const start = pointIndex(turtle.at, size);
  const cameFrom = new Map<number, number>([[start, -1]]);
  const queue = [turtle.at];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (samePoint(current, turtle.home)) {
      // Walk the chain back to the square adjacent to the start.
      let node = pointIndex(current, size);
      let previous = cameFrom.get(node)!;
      while (previous !== start && previous !== -1) {
        node = previous;
        previous = cameFrom.get(node)!;
      }
      return previous === -1 ? null : { x: node % size, y: Math.floor(node / size) };
    }

    for (const d of [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ]) {
      const nextPoint = { x: current.x + d.x, y: current.y + d.y };
      if (nextPoint.x < 0 || nextPoint.y < 0 || nextPoint.x >= size || nextPoint.y >= size) continue;
      const index = pointIndex(nextPoint, size);
      if (blocked.has(index) || cameFrom.has(index)) continue;
      cameFrom.set(index, pointIndex(current, size));
      queue.push(nextPoint);
    }
  }
  return null;
}

describe("board generation", () => {
  it("always gives every turtle a route home", () => {
    // A walled-off turtle is not a hard puzzle, it is a broken one, and the
    // player cannot tell the difference from the inside.
    for (let seed = 0; seed < 200; seed++) {
      const rng = createRng(seed);
      const { turtles, rocks } = buildBoard(6, 4, 6, rng);
      for (const t of turtles) expect(isReachable(t.at, t.home, rocks, 6)).toBe(true);
    }
  });

  it("never starts a turtle on a rock or on its own home", () => {
    for (let seed = 0; seed < 120; seed++) {
      const rng = createRng(seed);
      const { turtles, rocks } = buildBoard(6, 4, 6, rng);
      for (const t of turtles) {
        expect(rocks.some((r) => samePoint(r, t.at))).toBe(false);
        expect(rocks.some((r) => samePoint(r, t.home))).toBe(false);
        expect(samePoint(t.at, t.home)).toBe(false);
      }
    }
  });

  it("never puts two turtles, or two homes, on one square", () => {
    for (let seed = 0; seed < 120; seed++) {
      const rng = createRng(seed);
      const { turtles } = buildBoard(6, 5, 5, rng);
      const starts = turtles.map((t) => pointIndex(t.at, 6));
      const homes = turtles.map((t) => pointIndex(t.home, 6));
      expect(new Set(starts).size).toBe(starts.length);
      expect(new Set(homes).size).toBe(homes.length);
    }
  });

  it("sends turtles across the board in both directions, so routes cross", () => {
    const { turtles } = buildBoard(6, 4, 4, createRng(9));
    const leftToRight = turtles.filter((t) => t.at.x < t.home.x).length;
    expect(leftToRight).toBeGreaterThan(0);
    expect(leftToRight).toBeLessThan(turtles.length);
  });

  it("reports an unreachable target as unreachable", () => {
    // A wall of rocks straight down the middle of a 3-wide board.
    const rocks = [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
    ];
    expect(isReachable({ x: 0, y: 0 }, { x: 2, y: 0 }, rocks, 3)).toBe(false);
    expect(isReachable({ x: 0, y: 0 }, { x: 0, y: 2 }, rocks, 3)).toBe(true);
  });
});

describe("moving", () => {
  it("selects a turtle when tapped, and deselects on a second tap", () => {
    let s = turtleEngine.init(cfg(), 1);
    const turtle = s.turtles[0]!;
    s = turtleEngine.input(s, { kind: "select", index: pointIndex(turtle.at, s.config.size) });
    expect(s.selected).toBe(turtle.id);
    s = turtleEngine.input(s, { kind: "select", index: pointIndex(turtle.at, s.config.size) });
    expect(s.selected).toBeNull();
  });

  it("moves one square orthogonally", () => {
    let s = turtleEngine.init(cfg({ rocksPerTurtle: 0 }), 2);
    const turtle = s.turtles[0]!;
    const to = { x: turtle.at.x + 1, y: turtle.at.y };
    s = step(s, turtle.id, to);
    expect(s.turtles[0]!.at).toEqual(to);
    expect(s.moves).toBe(1);
  });

  it("refuses a jump of more than one square", () => {
    let s = turtleEngine.init(cfg({ rocksPerTurtle: 0 }), 3);
    const turtle = s.turtles[0]!;
    const far = { x: turtle.at.x + 2, y: turtle.at.y };
    const before = turtle.at;
    s = step(s, turtle.id, far);
    expect(s.turtles[0]!.at).toEqual(before);
    expect(s.moves).toBe(0);
  });

  it("refuses a move onto a rock", () => {
    let s = turtleEngine.init(cfg(), 4);
    const rock = s.rocks.find((r) => s.turtles.some((t) => isAdjacent(t.at, r)));
    if (!rock) return;
    const turtle = s.turtles.find((t) => isAdjacent(t.at, rock))!;
    const before = turtle.at;
    s = step(s, turtle.id, rock);
    expect(s.turtles.find((t) => t.id === turtle.id)!.at).toEqual(before);
  });

  it("refuses a move onto another turtle", () => {
    const config = cfg({ size: 4, startTurtles: 2, rocksPerTurtle: 0 });
    let s = turtleEngine.init(config, 5);
    // Walk one turtle next to another, then try to step onto it.
    const [a, b] = s.turtles;
    if (!a || !b) return;
    const adjacentToB = { x: b.at.x, y: b.at.y };
    const before = a.at;
    if (!isAdjacent(a.at, adjacentToB)) return;
    s = step(s, a.id, adjacentToB);
    expect(s.turtles.find((t) => t.id === a.id)!.at).toEqual(before);
  });

  it("ignores a destination tap when nothing is selected", () => {
    const s = turtleEngine.init(cfg({ rocksPerTurtle: 0 }), 6);
    const empty = { x: 2, y: 2 };
    const next = turtleEngine.input(s, { kind: "select", index: pointIndex(empty, s.config.size) });
    expect(next.moves).toBe(0);
  });

  it("marks a turtle arrived when it reaches its home and releases the selection", () => {
    let s = turtleEngine.init(cfg({ startTurtles: 2, rocksPerTurtle: 0 }), 7);
    s = driveAllHome(s);
    expect(s.turtles.every((t) => t.arrived)).toBe(true);
    expect(s.selected).toBeNull();
  });
});

describe("rounds", () => {
  it("ends the round the moment every turtle is home", () => {
    const config = cfg({ startTurtles: 2, rocksPerTurtle: 0, size: 5 });
    let s = turtleEngine.init(config, 10);
    s = driveAllHome(s);
    expect(s.stage).toBe("review");
    expect(s.lastRoundHome).toBe(2);
  });

  it("ends the round when the clock runs out", () => {
    const config = cfg({ secondsPerRound: 10 });
    let s = turtleEngine.init(config, 11);
    s = turtleEngine.tick(s, 10_000);
    expect(s.stage).toBe("review");
  });

  it("adds a turtle after a board is cleared", () => {
    const config = cfg({ startTurtles: 2, rocksPerTurtle: 0, size: 5 });
    let s = turtleEngine.init(config, 12);
    s = driveAllHome(s);
    expect(s.level).toBe(3);
  });

  it("finishes after the configured rounds", () => {
    const config = cfg({ rounds: 2, secondsPerRound: 5, rocksPerTurtle: 0 });
    let s = turtleEngine.init(config, 13);
    for (let round = 0; round < 2; round++) {
      s = turtleEngine.tick(s, s.stageStart + 5_000);
      for (let t = s.elapsed; t <= s.reviewUntil + 80; t += 50) s = turtleEngine.tick(s, t);
    }
    expect(turtleEngine.isFinished(s)).toBe(true);
  });

  it("writes a session row scored on turtles brought home", () => {
    const config = cfg({ startTurtles: 2, rocksPerTurtle: 0, size: 5 });
    let s = turtleEngine.init(config, 14);
    s = driveAllHome(s);
    const row = turtleEngine.toSession(s, config, 1_700_000_000_000);
    expect(row.gameId).toBe("turtle-traffic");
    expect(row.score).toBe(2);
    expect(row.accuracy).toBe(1);
  });
});
