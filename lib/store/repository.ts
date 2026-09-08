import type { Best, GameId, Session, Streak } from "@/lib/types";

/**
 * The persistence seam.
 *
 * Everything above this interface — pages, hooks, components — knows only these
 * three contracts. `indexeddb.ts` implements them in the browser today; a
 * `remote.ts` backed by Postgres and a session cookie would implement the same
 * three and drop in without a single caller changing.
 */
export interface SessionRepo {
  save(session: Session): Promise<void>;
  /** Newest first. `since` is an epoch-ms lower bound. */
  list(options?: { gameId?: GameId; since?: number; limit?: number }): Promise<Session[]>;
  clear(): Promise<void>;
}

export interface SettingsRepo {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  clear(): Promise<void>;
}

export interface ProfileRepo {
  streak(): Promise<Streak>;
  bests(): Promise<Partial<Record<GameId, Best>>>;
}

export interface Store {
  sessions: SessionRepo;
  settings: SettingsRepo;
  profile: ProfileRepo;
  /** Everything, as one JSON-serialisable blob, for export. */
  exportAll(): Promise<ExportBundle>;
  importAll(bundle: ExportBundle, mode: "merge" | "replace"): Promise<void>;
}

export interface ExportBundle {
  version: 1;
  exportedAt: number;
  sessions: Session[];
  settings: Record<string, unknown>;
}

/** yyyy-mm-dd in the viewer's own timezone — a "day" is a local calendar day. */
export function dayKey(at: number | Date): string {
  const d = at instanceof Date ? at : new Date(at);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number) as [number, number, number];
  const [by, bm, bd] = b.split("-").map(Number) as [number, number, number];
  const ms = Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad);
  return Math.round(ms / 86_400_000);
}

/**
 * Derive streak state from session timestamps.
 *
 * Kept as a free function rather than a method so it is unit-testable without a
 * database, and so a remote implementation computes streaks identically.
 */
export function computeStreak(sessions: Session[], today = dayKey(Date.now())): Streak {
  if (sessions.length === 0) return { current: 0, longest: 0, lastDay: null };

  const days = [...new Set(sessions.map((s) => dayKey(s.startedAt)))].sort();
  const lastDay = days[days.length - 1] ?? null;

  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    const gap = daysBetween(days[i - 1]!, days[i]!);
    run = gap === 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  // A streak survives today being empty — it only breaks once a full day is
  // missed, so training at 9am Monday and 9pm Tuesday still counts as two.
  let current = 0;
  if (lastDay) {
    const sinceLast = daysBetween(lastDay, today);
    if (sinceLast <= 1) {
      current = 1;
      for (let i = days.length - 1; i > 0; i--) {
        if (daysBetween(days[i - 1]!, days[i]!) === 1) current++;
        else break;
      }
    }
  }

  return { current, longest, lastDay };
}

export function computeBests(sessions: Session[]): Partial<Record<GameId, Best>> {
  const out: Partial<Record<GameId, Best>> = {};
  for (const s of sessions) {
    const prev = out[s.gameId];
    // Level first, score as the tiebreak: reaching 5-back beats a tidy score at 3-back.
    const better = !prev || s.level > prev.level || (s.level === prev.level && s.score > prev.score);
    if (better) out[s.gameId] = { level: s.level, score: s.score, accuracy: s.accuracy, at: s.startedAt };
  }
  return out;
}
