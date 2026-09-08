import type { Session } from "@/lib/types";

/** What the player did, normalised across every game. */
export type InputEvent =
  | { kind: "respond"; channel: string }
  | { kind: "answer"; value: string | number }
  | { kind: "select"; index: number }
  | { kind: "submit" }
  | { kind: "clear" }
  | { kind: "skip" };

/** The visual phase a game is in — the shell renders chrome accordingly. */
export type Phase =
  | "idle"
  | "countdown"
  | "presenting"
  | "responding"
  | "feedback"
  | "paused"
  | "finished";

export interface BaseState {
  phase: Phase;
  /** Milliseconds elapsed within the session, excluding time spent paused. */
  elapsed: number;
  seed: number;
}

/**
 * A game engine: a pure state machine with no React, no DOM and no wall clock.
 *
 * `tick` and `input` must be pure functions of (state, argument) — the shell
 * calls them from a rAF loop and tests call them in a for-loop, and both must
 * produce identical results. Time enters only as the `elapsed` argument.
 */
export interface Engine<Config, State extends BaseState, Result> {
  id: string;
  init(config: Config, seed: number): State;
  /** `elapsed` is monotonic session time in ms, already excluding pauses. */
  tick(state: State, elapsed: number): State;
  input(state: State, event: InputEvent): State;
  isFinished(state: State): boolean;
  result(state: State): Result;
  /** Turn a finished state into the row that gets persisted. */
  toSession(state: State, config: Config, startedAt: number): Omit<Session, "id">;
}

/** Everything a game's play screen needs to render its HUD. */
export interface HudInfo {
  level: string;
  progress?: { current: number; total: number };
  score?: string;
  hint?: string;
}
