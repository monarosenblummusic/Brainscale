/**
 * Seeded PRNG (mulberry32). Deterministic and tiny.
 *
 * Every session stores the seed it was generated from, which buys three things:
 * engine tests that assert on exact sequences, a daily cryptogram that is the
 * same puzzle for everyone, and the ability to replay a session exactly.
 */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, max). */
  int(max: number): number;
  /** Integer in [min, max], inclusive both ends. */
  range(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  /** Fisher-Yates, returning a new array. */
  shuffle<T>(items: readonly T[]): T[];
  bool(probability?: number): boolean;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;

  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (max: number) => Math.floor(next() * max);

  return {
    next,
    int,
    range: (min, max) => min + int(max - min + 1),
    pick: <T,>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error("pick() on an empty array");
      return items[int(items.length)]!;
    },
    shuffle: <T,>(items: readonly T[]): T[] => {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
    bool: (probability = 0.5) => next() < probability,
  };
}

export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

/** Stable seed for a calendar day, so a daily puzzle is the same for everyone. */
export function seedForDay(day: string): number {
  let h = 2166136261;
  for (let i = 0; i < day.length; i++) {
    h ^= day.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
