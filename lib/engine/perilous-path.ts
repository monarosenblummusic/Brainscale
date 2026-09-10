import type { Session } from "@/lib/types";
import { createRng, type Rng } from "./rng";
import { advanceSpan, initSpan, type SpanProgress } from "./adaptive";
import type { BaseState, Engine, InputEvent } from "./types";

/**
 * Perilous Path — memorise a route through a grid, then walk it back.
 *
 * Two things are held at once: where the route went, and where the hazards sit.
 * That second list is what separates this from a plain sequence-recall task —
 * remembering the path is not enough if you cannot also remember what to avoid,
 * and the hazards are placed adjacent to the route precisely so that a
 * half-remembered step lands on one.
 *
 * Reverse mode asks for the route from the far end, which turns following into
 * holding: you cannot walk it a step at a time if you have to start at the end.
 */

export interface PerilousConfig {
  /** Grid is `size` x `size`. */
  size: number;
  /** Route length to begin at, counted in squares including the start. */
  startLength: number;
  /** Hazards per route step, roughly. */
  hazardDensity: number;
  /** How long each route square stays lit during the reveal. */
  stepMs: number;
  /** Walk the route from its far end. */
  reverse: boolean;
  /** Failures at a length before the run ends. */
  attemptsPerLength: number;
}

export const PERILOUS_DEFAULTS: PerilousConfig = {
  size: 5,
  startLength: 4,
  hazardDensity: 0.6,
  stepMs: 550,
  reverse: false,
  attemptsPerLength: 2,
};

export interface Cell {
  x: number;
  y: number;
}

export const cellIndex = (cell: Cell, size: number) => cell.y * size + cell.x;
export const indexToCell = (index: number, size: number): Cell => ({
  x: index % size,
  y: Math.floor(index / size),
});

const NEIGHBOURS: Cell[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

export const areAdjacent = (a: Cell, b: Cell) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;

/**
 * Walk a self-avoiding random path of `length` squares.
 *
 * Self-avoiding matters: a route that crosses itself is ambiguous to retrace,
 * because the player arriving at a repeated square has no way to know which of
 * the two continuations was meant.
 */
export function buildPath(size: number, length: number, rng: Rng): Cell[] {
  for (let attempt = 0; attempt < 60; attempt++) {
    const path: Cell[] = [{ x: rng.int(size), y: rng.int(size) }];
    const used = new Set([cellIndex(path[0]!, size)]);

    while (path.length < length) {
      const head = path[path.length - 1]!;
      const options = rng
        .shuffle(NEIGHBOURS)
        .map((d) => ({ x: head.x + d.x, y: head.y + d.y }))
        .filter((c) => c.x >= 0 && c.y >= 0 && c.x < size && c.y < size && !used.has(cellIndex(c, size)));

      const next = options[0];
      if (!next) break; // painted into a corner; start over
      path.push(next);
      used.add(cellIndex(next, size));
    }

    if (path.length === length) return path;
  }

  // Fall back to a simple boustrophedon, which always exists and is still a
  // legitimate route — better than failing to produce a trial.
  const path: Cell[] = [];
  for (let i = 0; i < length; i++) {
    const y = Math.floor(i / size);
    const x = y % 2 === 0 ? i % size : size - 1 - (i % size);
    path.push({ x: Math.min(x, size - 1), y: Math.min(y, size - 1) });
  }
  return path.slice(0, length);
}

/**
 * Scatter hazards on squares that are not on the route.
 *
 * Weighted towards squares adjacent to the route: a hazard in a far corner is
 * never a live risk and teaches nothing, whereas one beside the path punishes
 * exactly the half-remembered step this exercise is about.
 */
export function buildHazards(size: number, path: Cell[], count: number, rng: Rng): Cell[] {
  const onPath = new Set(path.map((c) => cellIndex(c, size)));

  const adjacent = new Set<number>();
  for (const cell of path) {
    for (const d of NEIGHBOURS) {
      const c = { x: cell.x + d.x, y: cell.y + d.y };
      if (c.x < 0 || c.y < 0 || c.x >= size || c.y >= size) continue;
      const index = cellIndex(c, size);
      if (!onPath.has(index)) adjacent.add(index);
    }
  }

  const far: number[] = [];
  for (let i = 0; i < size * size; i++) {
    if (!onPath.has(i) && !adjacent.has(i)) far.push(i);
  }

  const pool = [...rng.shuffle([...adjacent]), ...rng.shuffle(far)];
  return pool.slice(0, Math.min(count, pool.length)).map((i) => indexToCell(i, size));
}

export type PerilousStage = "reveal" | "walk" | "review";

export interface PerilousState extends BaseState {
  config: PerilousConfig;
  progress: SpanProgress;
  path: Cell[];
  hazards: Cell[];
  /** Index of the route square currently lit during the reveal. */
  revealIndex: number;
  stage: PerilousStage;
  stageStart: number;
  /** Squares the player has walked, in order. */
  walked: Cell[];
  trials: number;
  cleared: number;
  lastTrial: "cleared" | "lost" | null;
  /** The square that ended the trial, so the UI can show what went wrong. */
  failedAt: Cell | null;
  reviewUntil: number;
}

const REVIEW_MS = 1500;

/** The route as the player must walk it. */
export function expectedRoute(state: PerilousState): Cell[] {
  return state.config.reverse ? [...state.path].reverse() : state.path;
}

function startTrial(state: PerilousState, atMs: number): PerilousState {
  const rng = createRng(state.seed + state.trials * 7919);
  const length = Math.min(state.progress.level, state.config.size * state.config.size);
  const path = buildPath(state.config.size, length, rng);
  const hazards = buildHazards(
    state.config.size,
    path,
    Math.round(length * state.config.hazardDensity),
    rng,
  );

  return {
    ...state,
    path,
    hazards,
    revealIndex: 0,
    stage: "reveal",
    stageStart: atMs,
    phase: "presenting",
    walked: [],
    lastTrial: null,
    failedAt: null,
  };
}

export interface PerilousResult {
  span: number;
  trials: number;
  cleared: number;
  accuracy: number;
}

export const perilousEngine: Engine<PerilousConfig, PerilousState, PerilousResult> = {
  id: "perilous-path",

  init(config, seed) {
    const base: PerilousState = {
      phase: "presenting",
      elapsed: 0,
      seed,
      config,
      progress: initSpan(config.startLength),
      path: [],
      hazards: [],
      revealIndex: 0,
      stage: "reveal",
      stageStart: 0,
      walked: [],
      trials: 0,
      cleared: 0,
      lastTrial: null,
      failedAt: null,
      reviewUntil: 0,
    };
    return startTrial(base, 0);
  },

  tick(state, elapsed) {
    if (state.phase === "finished") return state;

    if (state.stage === "reveal") {
      const index = Math.floor((elapsed - state.stageStart) / state.config.stepMs);
      if (index >= state.path.length) {
        return { ...state, elapsed, stage: "walk", stageStart: elapsed, phase: "responding", revealIndex: -1 };
      }
      return index === state.revealIndex && state.elapsed !== elapsed
        ? { ...state, elapsed }
        : { ...state, elapsed, revealIndex: index };
    }

    if (state.stage === "review") {
      if (elapsed < state.reviewUntil) return { ...state, elapsed };
      if (state.progress.done) return { ...state, elapsed, phase: "finished" };
      return startTrial({ ...state, elapsed }, elapsed);
    }

    return state.elapsed === elapsed ? state : { ...state, elapsed };
  },

  input(state, event: InputEvent) {
    if (state.stage !== "walk" || event.kind !== "select") return state;

    const size = state.config.size;
    const cell = indexToCell(event.index, size);
    const route = expectedRoute(state);
    const step = state.walked.length;

    // The first tap must be the start of the route; every later one must be a
    // single step from where the player already is. Enforcing adjacency here
    // rather than only in the grading keeps an impossible move from silently
    // counting as a wrong one.
    if (step > 0 && !areAdjacent(state.walked[step - 1]!, cell)) return state;

    const walked = [...state.walked, cell];

    const onHazard = state.hazards.some((h) => h.x === cell.x && h.y === cell.y);
    const onRoute = route[step]!.x === cell.x && route[step]!.y === cell.y;

    if (onHazard || !onRoute) return finish({ ...state, walked }, false, cell);
    if (walked.length === route.length) return finish({ ...state, walked }, true, null);

    return { ...state, walked };
  },

  isFinished(state) {
    return state.phase === "finished";
  },

  result(state) {
    return {
      span: state.progress.best,
      trials: state.trials,
      cleared: state.cleared,
      accuracy: state.trials === 0 ? 0 : state.cleared / state.trials,
    };
  },

  toSession(state, config, startedAt): Omit<Session, "id"> {
    const r = perilousEngine.result(state);
    return {
      gameId: "perilous-path",
      mode: `${config.size}×${config.size} · ${config.reverse ? "reverse" : "forward"}`,
      startedAt,
      durationMs: state.elapsed,
      level: r.span,
      accuracy: r.accuracy,
      score: r.span,
      seed: state.seed,
      metrics: {
        span: r.span,
        trials: r.trials,
        cleared: r.cleared,
        reverse: config.reverse ? 1 : 0,
        nextLevel: Math.max(config.startLength, r.span - 1),
      },
    };
  },
};

function finish(state: PerilousState, cleared: boolean, failedAt: Cell | null): PerilousState {
  const progress = advanceSpan(state.progress, cleared, {
    upAfter: 1,
    downAfter: state.config.attemptsPerLength,
    stopAfter: state.config.attemptsPerLength,
    min: 3,
    max: state.config.size * state.config.size,
  });

  return {
    ...state,
    progress,
    trials: state.trials + 1,
    cleared: state.cleared + (cleared ? 1 : 0),
    lastTrial: cleared ? "cleared" : "lost",
    failedAt,
    stage: "review",
    phase: "feedback",
    reviewUntil: state.elapsed + REVIEW_MS,
  };
}
