import type { Rng } from "./rng";
import { createSpeedTrialEngine, type Problem, type SpeedTrialConfig, SPEED_TRIAL_DEFAULTS } from "./speed-trial";

/**
 * Agility — is the statement true?
 *
 * Three families of claim, mixed in as the level rises. What makes it more than
 * arithmetic is that half the statements are phrased against the grain: a
 * negation sitting mid-sentence, or an ordering that reads naturally and is
 * false. Answering those means parsing what is written rather than what you
 * expected to see, which is the executive-control half of the exercise.
 */

export type StatementKind = "comparison" | "ordering" | "equation";

export interface AgilityData {
  text: string;
  kind: StatementKind;
  /** Set when the phrasing is deliberately working against the answer. */
  tricky: boolean;
}

export const AGILITY_FALSE = 0;
export const AGILITY_TRUE = 1;

const NAMES = ["A", "B", "C", "D", "E", "F"];

/** `a` and `b` are never equal, so "greater than" is always decidable. */
function twoDistinct(rng: Rng, span: number): [number, number] {
  const a = rng.range(1, span);
  let b = rng.range(1, span);
  let guard = 0;
  while (b === a && guard++ < 30) b = rng.range(1, span);
  return [a, b === a ? a + 1 : b];
}

function comparison(rng: Rng, level: number, wantTrue: boolean): AgilityData {
  const span = Math.min(9 + level * 6, 99);
  const [a, b] = twoDistinct(rng, span);
  const aBigger = a > b;

  // A negated comparison states the opposite relation and asks you to flip it.
  // It is the same fact, and reliably harder to answer under a clock.
  const negated = level >= 3 && rng.bool(0.4);

  if (!negated) {
    const claimsBigger = wantTrue ? aBigger : !aBigger;
    return {
      text: `${a} is ${claimsBigger ? "greater than" : "less than"} ${b}`,
      kind: "comparison",
      tricky: false,
    };
  }

  // "It is not the case that X is less than Y" is true exactly when X > Y.
  const claimsLess = wantTrue ? aBigger : !aBigger;
  return {
    text: `It is not true that ${a} is ${claimsLess ? "less than" : "greater than"} ${b}`,
    kind: "comparison",
    tricky: true,
  };
}

function ordering(rng: Rng, level: number, wantTrue: boolean): AgilityData {
  const count = level >= 6 ? 3 : 2;
  const names = rng.shuffle(NAMES).slice(0, count + 1);

  // Build a real ranking, then state a relation that either follows from it or
  // contradicts it. With three links the claim is transitive and has to be
  // chained rather than read off.
  const ranked = names.slice();
  const links = ranked.slice(0, -1).map((name, i) => `${name} is taller than ${ranked[i + 1]}`);

  const first = ranked[0]!;
  const last = ranked[ranked.length - 1]!;
  const claim = wantTrue ? `${first} is taller than ${last}` : `${last} is taller than ${first}`;

  return {
    text: `${links.join(", ")}. Therefore ${claim}.`,
    kind: "ordering",
    tricky: count > 2,
  };
}

function equation(rng: Rng, level: number, wantTrue: boolean): AgilityData {
  const span = Math.min(6 + level * 3, 40);
  const a = rng.range(2, span);
  const b = rng.range(2, span);
  const useMultiply = level >= 4 && rng.bool(0.4);
  const value = useMultiply ? a * b : a + b;
  const symbol = useMultiply ? "×" : "+";

  if (wantTrue) return { text: `${a} ${symbol} ${b} = ${value}`, kind: "equation", tricky: false };

  // Off by a little, not a lot: a wildly wrong total is rejected on sight and
  // measures nothing.
  const drift = rng.pick([-3, -2, -1, 1, 2, 3]);
  return { text: `${a} ${symbol} ${b} = ${value + drift}`, kind: "equation", tricky: false };
}

export function generateAgility(rng: Rng, level: number): Problem<AgilityData> {
  const wantTrue = rng.bool(0.5);

  const kinds: StatementKind[] = ["comparison", "equation"];
  if (level >= 2) kinds.push("ordering");

  const kind = rng.pick(kinds);
  const data =
    kind === "comparison"
      ? comparison(rng, level, wantTrue)
      : kind === "ordering"
        ? ordering(rng, level, wantTrue)
        : equation(rng, level, wantTrue);

  return { data, answer: wantTrue ? AGILITY_TRUE : AGILITY_FALSE };
}

export const AGILITY_DEFAULTS: SpeedTrialConfig = {
  ...SPEED_TRIAL_DEFAULTS,
  gameId: "agility",
  durationSec: 90,
  startMs: 7000,
  minMs: 2000,
  quickenMs: 110,
};

export const agilityEngine = createSpeedTrialEngine<AgilityData>((rng, level) => generateAgility(rng, level));
