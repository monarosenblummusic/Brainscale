/** Identifiers for the seven exercises. Used as storage keys and route slugs. */
export type GameId =
  // Research paradigms
  | "n-back"
  | "complex-working-memory"
  | "memory-span"
  | "corsi"
  | "pasat"
  | "mental-math"
  // Processing speed and attention
  | "decoder"
  | "chalkboard"
  | "perilous-path"
  | "double-decision"
  | "processing"
  | "hawkeye"
  | "spatial-match"
  // Logical agility and executive control
  | "agility"
  | "error-locator"
  | "turtle-traffic"
  // Untimed puzzles
  | "cryptogram";

export type GameCategory = "training" | "speed" | "logic" | "game";

export interface GameMeta {
  id: GameId;
  name: string;
  /** Shown on cards and the info page header. */
  tagline: string;
  category: GameCategory;
  /** What cognitive faculty the exercise targets. */
  trains: string[];
  /** Longer description for the info page. */
  about: string;
  /** How the exercise works, as ordered steps. */
  how: string[];
  /** Provenance — every exercise here is a real paradigm, and saying so matters. */
  origin: string;
  /** Primary metric shown on cards, stats and the results screen. */
  metricLabel: string;
  /** Emoji-free inline SVG icon key. */
  icon: string;
  accentVar: string;
  hasTutorial: boolean;
  /** Typical session length in minutes, for the dashboard. */
  minutes: number;
}

/** A single completed play-through, persisted for stats. */
export interface Session {
  id: string;
  gameId: GameId;
  /** Human-readable mode, e.g. "Dual 3-back" or "Multiplication". */
  mode: string;
  startedAt: number;
  durationMs: number;
  /** Difficulty reached — n for n-back, span for Corsi, etc. */
  level: number;
  /** 0..1 */
  accuracy: number;
  /** Game-specific headline number (span, correct answers, score). */
  score: number;
  /** Seed the session was generated from, so it can be replayed exactly. */
  seed: number;
  /** Free-form per-game extras (per-modality accuracy, ISI, operand digits…). */
  metrics: Record<string, number | string>;
}

export interface Streak {
  current: number;
  longest: number;
  /** yyyy-mm-dd of the most recent day with at least one session. */
  lastDay: string | null;
}

export interface Best {
  level: number;
  score: number;
  accuracy: number;
  at: number;
}
