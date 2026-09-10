import type { Rng } from "./rng";
import { createSpeedTrialEngine, type Problem, type SpeedTrialConfig, SPEED_TRIAL_DEFAULTS } from "./speed-trial";

/**
 * Spatial Speed Match — does this shape match the one immediately before it?
 *
 * Form, rotation and cell all have to agree. It is deliberately the shallowest
 * possible n-back: the thing you compare against is always the item that just
 * left the screen, so the load is on replacing what you hold quickly rather
 * than on holding much at all.
 */

export const MATCH_SHAPES = ["triangle", "square", "diamond", "hexagon", "arrow", "chevron"] as const;
export type MatchShape = (typeof MATCH_SHAPES)[number];

export const MATCH_GRID = 3;
export const MATCH_CELLS = MATCH_GRID * MATCH_GRID;

export interface SpatialData {
  shape: MatchShape;
  /** Quarter turns clockwise, 0-3. */
  rotation: number;
  /** Cell index into a 3x3 grid. */
  cell: number;
  /** True for the first stimulus of a run, which has nothing to compare to. */
  isFirst: boolean;
}

export const MATCH_NO = 0;
export const MATCH_YES = 1;

/**
 * Level controls how many attributes vary. Early on only the shape changes, so
 * the comparison is a single feature; later rotation and position join in and
 * a "no" can hinge on any one of the three.
 */
function attributesForLevel(level: number): { shapes: number; rotations: number; cells: number } {
  return {
    shapes: Math.min(MATCH_SHAPES.length, 2 + Math.floor(level / 2)),
    rotations: level >= 3 ? 4 : 1,
    cells: level >= 5 ? MATCH_CELLS : 1,
  };
}

export function generateSpatialMatch(
  rng: Rng,
  level: number,
  previous: Problem<SpatialData> | null,
): Problem<SpatialData> {
  const limits = attributesForLevel(level);
  const centre = Math.floor(MATCH_CELLS / 2);

  const draw = (): SpatialData => ({
    shape: MATCH_SHAPES[rng.int(limits.shapes)]!,
    rotation: rng.int(limits.rotations),
    cell: limits.cells === 1 ? centre : rng.int(limits.cells),
    isFirst: false,
  });

  if (!previous || previous.data.isFirst === undefined) {
    return { data: { ...draw(), isFirst: true }, answer: MATCH_NO };
  }

  const prior = previous.data;

  // A run of "yes" trials is as uninformative as a run of "no" trials, so the
  // match rate is pinned near half rather than left to chance.
  if (rng.bool(0.42)) {
    return { data: { ...prior, isFirst: false }, answer: MATCH_YES };
  }

  // A non-match has to differ somewhere the player can actually see, so pick
  // an attribute that is currently varying and change that one for certain.
  const varying: ("shape" | "rotation" | "cell")[] = ["shape"];
  if (limits.rotations > 1) varying.push("rotation");
  if (limits.cells > 1) varying.push("cell");

  const candidate = draw();
  const changed = rng.pick(varying);

  if (changed === "shape") {
    let shape = MATCH_SHAPES[rng.int(limits.shapes)]!;
    let guard = 0;
    while (shape === prior.shape && guard++ < 20) shape = MATCH_SHAPES[rng.int(limits.shapes)]!;
    return { data: { ...candidate, shape, isFirst: false }, answer: MATCH_NO };
  }

  if (changed === "rotation") {
    const rotation = (prior.rotation + rng.range(1, 3)) % 4;
    return { data: { ...candidate, shape: prior.shape, rotation, isFirst: false }, answer: MATCH_NO };
  }

  let cell = rng.int(limits.cells);
  let guard = 0;
  while (cell === prior.cell && guard++ < 20) cell = rng.int(limits.cells);
  return { data: { ...candidate, shape: prior.shape, rotation: prior.rotation, cell, isFirst: false }, answer: MATCH_NO };
}

export const SPATIAL_MATCH_DEFAULTS: SpeedTrialConfig = {
  ...SPEED_TRIAL_DEFAULTS,
  gameId: "spatial-match",
  durationSec: 60,
  startMs: 3500,
  minMs: 800,
  quickenMs: 60,
};

export const spatialMatchEngine = createSpeedTrialEngine<SpatialData>(generateSpatialMatch);
