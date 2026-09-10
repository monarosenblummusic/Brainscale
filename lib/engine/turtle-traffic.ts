import type { Session } from "@/lib/types";
import { createRng, type Rng } from "./rng";
import type { BaseState, Engine, InputEvent } from "./types";

/**
 * Turtle Traffic — get several turtles home at once.
 *
 * Each turtle moves only when sent, so the work is deciding who to move and
 * when while keeping the others in mind. Routes are generated to cross, because
 * a board where every turtle has an independent lane is just several easy
 * puzzles side by side; the switching cost only appears when dealing with one
 * turtle can block another.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Turtle {
  id: number;
  at: Point;
  home: Point;
  /** Set once the turtle has reached its home and stops taking input. */
  arrived: boolean;
}

export interface TurtleConfig {
  size: number;
  /** Turtles in the first round. */
  startTurtles: number;
  maxTurtles: number;
  /** Rocks scattered as obstacles, per turtle. */
  rocksPerTurtle: number;
  /** Seconds allowed per round. */
  secondsPerRound: number;
  rounds: number;
}

export const TURTLE_DEFAULTS: TurtleConfig = {
  size: 6,
  startTurtles: 2,
  maxTurtles: 5,
  rocksPerTurtle: 1.5,
  secondsPerRound: 45,
  rounds: 5,
};

export const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
export const pointIndex = (p: Point, size: number) => p.y * size + p.x;
export const indexToPoint = (i: number, size: number): Point => ({ x: i % size, y: Math.floor(i / size) });
export const isAdjacent = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;

/**
 * Is `home` reachable from `at`, given the rocks? Breadth-first, ignoring other
 * turtles — they move, rocks do not.
 *
 * Every generated board is checked with this. A board where a turtle is walled
 * off is not a hard puzzle, it is a broken one, and the player has no way to
 * tell the difference from the inside.
 */
export function isReachable(at: Point, home: Point, rocks: Point[], size: number): boolean {
  const blocked = new Set(rocks.map((r) => pointIndex(r, size)));
  const seen = new Set([pointIndex(at, size)]);
  const queue: Point[] = [at];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (samePoint(current, home)) return true;

    for (const d of [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ]) {
      const next = { x: current.x + d.x, y: current.y + d.y };
      if (next.x < 0 || next.y < 0 || next.x >= size || next.y >= size) continue;
      const index = pointIndex(next, size);
      if (blocked.has(index) || seen.has(index)) continue;
      seen.add(index);
      queue.push(next);
    }
  }
  return false;
}

export interface Board {
  turtles: Turtle[];
  rocks: Point[];
}

/**
 * Lay out a solvable board.
 *
 * Turtles start on one side and their homes sit generally opposite, which is
 * what makes the routes cross. The layout is retried until every turtle can
 * actually reach its home.
 */
export function buildBoard(size: number, count: number, rockCount: number, rng: Rng): Board {
  for (let attempt = 0; attempt < 80; attempt++) {
    const taken = new Set<number>();
    const take = (candidates: Point[]): Point | null => {
      for (const p of rng.shuffle(candidates)) {
        const index = pointIndex(p, size);
        if (!taken.has(index)) {
          taken.add(index);
          return p;
        }
      }
      return null;
    };

    const leftColumn: Point[] = [];
    const rightColumn: Point[] = [];
    for (let y = 0; y < size; y++) {
      leftColumn.push({ x: 0, y });
      rightColumn.push({ x: size - 1, y });
    }

    const turtles: Turtle[] = [];
    let failed = false;
    for (let i = 0; i < count; i++) {
      // Alternate which side a turtle starts on, so the traffic runs both ways
      // and the crossings are genuine rather than a single convoy.
      const fromLeft = i % 2 === 0;
      const at = take(fromLeft ? leftColumn : rightColumn);
      const home = take(fromLeft ? rightColumn : leftColumn);
      if (!at || !home) {
        failed = true;
        break;
      }
      turtles.push({ id: i, at, home, arrived: false });
    }
    if (failed) continue;

    const interior: Point[] = [];
    for (let y = 0; y < size; y++) {
      for (let x = 1; x < size - 1; x++) {
        if (!taken.has(pointIndex({ x, y }, size))) interior.push({ x, y });
      }
    }
    const rocks = rng.shuffle(interior).slice(0, Math.min(rockCount, interior.length));

    if (turtles.every((t) => isReachable(t.at, t.home, rocks, size))) return { turtles, rocks };
  }

  // Fall back to a rock-free board, which is always solvable.
  const turtles: Turtle[] = [];
  for (let i = 0; i < count && i < size; i++) {
    turtles.push({ id: i, at: { x: 0, y: i }, home: { x: size - 1, y: i }, arrived: false });
  }
  return { turtles, rocks: [] };
}

export type TurtleStage = "playing" | "review";

export interface TurtleState extends BaseState {
  config: TurtleConfig;
  round: number;
  turtles: Turtle[];
  rocks: Point[];
  /** The turtle awaiting a destination, or null. */
  selected: number | null;
  stage: TurtleStage;
  stageStart: number;
  moves: number;
  homeTotal: number;
  turtleTotal: number;
  lastRoundHome: number;
  level: number;
  reviewUntil: number;
}

const REVIEW_MS = 1600;

function startRound(state: TurtleState, atMs: number): TurtleState {
  const rng = createRng(state.seed + state.round * 7919);
  const count = Math.min(state.config.maxTurtles, state.level);
  const board = buildBoard(state.config.size, count, Math.round(count * state.config.rocksPerTurtle), rng);

  return {
    ...state,
    turtles: board.turtles,
    rocks: board.rocks,
    selected: null,
    stage: "playing",
    stageStart: atMs,
    phase: "responding",
    turtleTotal: state.turtleTotal + board.turtles.length,
  };
}

export interface TurtleResult {
  home: number;
  total: number;
  accuracy: number;
  moves: number;
  level: number;
}

export const turtleEngine: Engine<TurtleConfig, TurtleState, TurtleResult> = {
  id: "turtle-traffic",

  init(config, seed) {
    const base: TurtleState = {
      phase: "responding",
      elapsed: 0,
      seed,
      config,
      round: 0,
      turtles: [],
      rocks: [],
      selected: null,
      stage: "playing",
      stageStart: 0,
      moves: 0,
      homeTotal: 0,
      turtleTotal: 0,
      lastRoundHome: 0,
      level: config.startTurtles,
      reviewUntil: 0,
    };
    return startRound(base, 0);
  },

  tick(state, elapsed) {
    if (state.phase === "finished") return state;

    if (state.stage === "playing") {
      if (elapsed - state.stageStart >= state.config.secondsPerRound * 1000) return endRound({ ...state, elapsed });
      return state.elapsed === elapsed ? state : { ...state, elapsed };
    }

    if (state.stage === "review") {
      if (elapsed < state.reviewUntil) return { ...state, elapsed };
      if (state.round + 1 >= state.config.rounds) return { ...state, elapsed, phase: "finished" };
      return startRound({ ...state, elapsed, round: state.round + 1 }, elapsed);
    }

    return state.elapsed === elapsed ? state : { ...state, elapsed };
  },

  input(state, event: InputEvent) {
    if (state.stage !== "playing" || event.kind !== "select") return state;

    const size = state.config.size;
    const target = indexToPoint(event.index, size);

    // Tapping a turtle selects it; tapping it again deselects.
    const onTurtle = state.turtles.find((t) => !t.arrived && samePoint(t.at, target));
    if (onTurtle) {
      return { ...state, selected: state.selected === onTurtle.id ? null : onTurtle.id };
    }

    if (state.selected === null) return state;
    const turtle = state.turtles.find((t) => t.id === state.selected);
    if (!turtle || turtle.arrived) return state;

    // One square at a time, orthogonally, and never onto a rock or another
    // turtle. Refusing the move outright rather than penalising it keeps a
    // mis-tap from costing a round.
    if (!isAdjacent(turtle.at, target)) return state;
    if (state.rocks.some((r) => samePoint(r, target))) return state;
    if (state.turtles.some((t) => t.id !== turtle.id && !t.arrived && samePoint(t.at, target))) return state;

    const arrived = samePoint(target, turtle.home);
    const turtles = state.turtles.map((t) => (t.id === turtle.id ? { ...t, at: target, arrived } : t));

    const next: TurtleState = {
      ...state,
      turtles,
      moves: state.moves + 1,
      // An arrived turtle releases the selection, since it takes no more input.
      selected: arrived ? null : state.selected,
    };

    return turtles.every((t) => t.arrived) ? endRound(next) : next;
  },

  isFinished(state) {
    return state.phase === "finished";
  },

  result(state) {
    return {
      home: state.homeTotal,
      total: state.turtleTotal,
      accuracy: state.turtleTotal === 0 ? 0 : state.homeTotal / state.turtleTotal,
      moves: state.moves,
      level: state.level,
    };
  },

  toSession(state, config, startedAt): Omit<Session, "id"> {
    const r = turtleEngine.result(state);
    return {
      gameId: "turtle-traffic",
      mode: `${config.size}×${config.size} · up to ${r.level} turtles`,
      startedAt,
      durationMs: state.elapsed,
      level: r.level,
      accuracy: r.accuracy,
      score: r.home,
      seed: state.seed,
      metrics: {
        home: r.home,
        total: r.total,
        moves: r.moves,
        nextLevel: r.level,
      },
    };
  },
};

function endRound(state: TurtleState): TurtleState {
  const home = state.turtles.filter((t) => t.arrived).length;
  const complete = home === state.turtles.length;

  return {
    ...state,
    homeTotal: state.homeTotal + home,
    lastRoundHome: home,
    // A whole board home adds a turtle next round; leaving any behind eases off.
    level: complete
      ? Math.min(state.config.maxTurtles, state.level + 1)
      : Math.max(2, state.level - (home === 0 ? 1 : 0)),
    selected: null,
    stage: "review",
    phase: "feedback",
    reviewUntil: state.elapsed + REVIEW_MS,
  };
}
