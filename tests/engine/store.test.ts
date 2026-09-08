import { describe, expect, it } from "vitest";
import { computeBests, computeStreak, dayKey, daysBetween } from "@/lib/store/repository";
import type { GameId, Session } from "@/lib/types";

function session(day: string, over: Partial<Session> = {}): Session {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return {
    id: `${day}-${Math.random()}`,
    gameId: "n-back" as GameId,
    mode: "Dual 2-back",
    // Midday, so the session never straddles a local-midnight boundary.
    startedAt: new Date(y, m - 1, d, 12, 0, 0).getTime(),
    durationMs: 60_000,
    level: 2,
    accuracy: 0.8,
    score: 80,
    seed: 1,
    metrics: {},
    ...over,
  };
}

describe("day keys", () => {
  it("formats a local calendar day", () => {
    expect(dayKey(new Date(2026, 8, 8, 23, 30))).toBe("2026-09-08");
    expect(dayKey(new Date(2026, 0, 1, 0, 1))).toBe("2026-01-01");
  });

  it("counts whole days between keys, across month and year ends", () => {
    expect(daysBetween("2026-09-08", "2026-09-09")).toBe(1);
    expect(daysBetween("2026-01-31", "2026-02-01")).toBe(1);
    expect(daysBetween("2025-12-31", "2026-01-01")).toBe(1);
    expect(daysBetween("2026-09-08", "2026-09-08")).toBe(0);
  });
});

describe("streaks", () => {
  it("is zero with no sessions", () => {
    expect(computeStreak([])).toEqual({ current: 0, longest: 0, lastDay: null });
  });

  it("counts consecutive days", () => {
    const s = computeStreak(
      [session("2026-09-06"), session("2026-09-07"), session("2026-09-08")],
      "2026-09-08",
    );
    expect(s.current).toBe(3);
    expect(s.longest).toBe(3);
  });

  it("counts a day once however many sessions it holds", () => {
    const s = computeStreak(
      [session("2026-09-08"), session("2026-09-08"), session("2026-09-08")],
      "2026-09-08",
    );
    expect(s.current).toBe(1);
  });

  it("survives today being empty, and breaks only after a full day missed", () => {
    // Trained yesterday but not yet today: the streak is still alive. Breaking
    // it at midnight would punish someone who trains each evening.
    const alive = computeStreak([session("2026-09-06"), session("2026-09-07")], "2026-09-08");
    expect(alive.current).toBe(2);

    const broken = computeStreak([session("2026-09-06"), session("2026-09-07")], "2026-09-09");
    expect(broken.current).toBe(0);
    expect(broken.longest).toBe(2);
  });

  it("remembers the longest run after a break", () => {
    const s = computeStreak(
      [
        session("2026-09-01"),
        session("2026-09-02"),
        session("2026-09-03"),
        session("2026-09-04"),
        // gap
        session("2026-09-08"),
      ],
      "2026-09-08",
    );
    expect(s.longest).toBe(4);
    expect(s.current).toBe(1);
    expect(s.lastDay).toBe("2026-09-08");
  });

  it("is unaffected by the order sessions arrive in", () => {
    const days = ["2026-09-08", "2026-09-06", "2026-09-07"].map((d) => session(d));
    expect(computeStreak(days, "2026-09-08").current).toBe(3);
  });
});

describe("personal bests", () => {
  it("keeps the highest level per exercise", () => {
    const bests = computeBests([
      session("2026-09-01", { gameId: "n-back", level: 3, score: 91 }),
      session("2026-09-02", { gameId: "n-back", level: 5, score: 72 }),
      session("2026-09-03", { gameId: "corsi", level: 6, score: 6 }),
    ]);
    expect(bests["n-back"]?.level).toBe(5);
    expect(bests.corsi?.level).toBe(6);
  });

  it("breaks a level tie on score", () => {
    const bests = computeBests([
      session("2026-09-01", { level: 4, score: 70 }),
      session("2026-09-02", { level: 4, score: 95 }),
    ]);
    expect(bests["n-back"]?.score).toBe(95);
  });

  it("prefers a higher level over a higher score", () => {
    // Reaching 5-back beats a tidy score at 3-back; the level is the achievement.
    const bests = computeBests([
      session("2026-09-01", { level: 3, score: 100 }),
      session("2026-09-02", { level: 5, score: 71 }),
    ]);
    expect(bests["n-back"]?.level).toBe(5);
    expect(bests["n-back"]?.score).toBe(71);
  });

  it("reports nothing for an exercise never played", () => {
    expect(computeBests([session("2026-09-01")]).pasat).toBeUndefined();
  });
});
