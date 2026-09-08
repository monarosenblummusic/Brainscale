"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { GAMES, GAME_BY_ID } from "@/lib/games";
import { useProfile, useSessions } from "@/lib/store/hooks";
import { dayKey } from "@/lib/store/repository";
import { ActivityHeatmap, ProgressLine } from "@/components/charts";
import { Badge, ButtonLink, Card, SectionTitle, Stat, cx } from "@/components/ui";
import { GameIcon } from "@/components/ui/icons";
import type { GameId, Session } from "@/lib/types";

export function StatsView() {
  const { sessions } = useSessions();
  const { streak, bests } = useProfile();
  const [filter, setFilter] = useState<GameId | "all">("all");

  const all = useMemo(() => sessions ?? [], [sessions]);
  const filtered = filter === "all" ? all : all.filter((s) => s.gameId === filter);

  const totals = useMemo(() => {
    const minutes = Math.round(all.reduce((sum, s) => sum + s.durationMs, 0) / 60_000);
    const days = new Set(all.map((s) => dayKey(s.startedAt))).size;
    return { minutes, days };
  }, [all]);

  if (sessions === null) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 lg:py-12">
        <div className="h-64 animate-pulse rounded-2xl bg-[var(--bg-subtle)]" />
      </div>
    );
  }

  if (all.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 lg:py-12">
        <h1 className="text-[26px] font-semibold tracking-tight sm:text-[30px]">Statistics</h1>
        <Card className="mt-8 p-10 text-center">
          <p className="text-[15px] font-medium">Nothing to show yet</p>
          <p className="mx-auto mt-2 max-w-sm text-[14px] text-[var(--text-muted)]">
            Finish a session and it will appear here — level over time, streaks, and your best in each
            exercise.
          </p>
          <ButtonLink href="/" variant="primary" className="mt-5">
            Pick an exercise
          </ButtonLink>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 lg:py-12">
      <h1 className="text-[26px] font-semibold tracking-tight sm:text-[30px]">Statistics</h1>

      <Card className="mt-7 p-5">
        <div className="flex flex-wrap gap-x-10 gap-y-5">
          <Stat label="Sessions" value={all.length} />
          <Stat label="Days trained" value={totals.days} />
          <Stat label="Time" value={`${totals.minutes}m`} />
          <Stat label="Current streak" value={streak?.current ?? 0} sub={`Longest ${streak?.longest ?? 0}`} />
        </div>
        <div className="mt-6 border-t border-[var(--border)] pt-5">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-[var(--text-faint)]">
            Last 26 weeks
          </p>
          <ActivityHeatmap sessions={all} />
        </div>
      </Card>

      <div className="mt-9">
        <SectionTitle>Per exercise</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          {GAMES.map((game) => {
            const rows = all.filter((s) => s.gameId === game.id);
            if (rows.length === 0) return null;
            const levels = rows.slice().reverse().map((s) => s.level);
            const best = bests?.[game.id];
            const lastAccuracy = rows[0] ? Math.round(rows[0].accuracy * 100) : 0;

            return (
              <Card key={game.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/games/${game.id}`} className="flex items-center gap-2.5 hover:opacity-80">
                    <span
                      className="grid size-8 place-items-center rounded-lg"
                      style={{
                        background: `color-mix(in oklch, var(${game.accentVar}) 16%, transparent)`,
                        color: `var(${game.accentVar})`,
                      }}
                    >
                      <GameIcon name={game.icon} className="size-[17px]" />
                    </span>
                    <span className="text-[14px] font-semibold">{game.name}</span>
                  </Link>
                  <Badge tone="accent">
                    {game.metricLabel} {best?.level ?? "—"}
                  </Badge>
                </div>

                <div className="mt-4 flex gap-8">
                  <Stat label="Sessions" value={rows.length} />
                  <Stat label="Last" value={`${lastAccuracy}%`} />
                </div>

                <div className="mt-4">
                  <ProgressLine values={levels} label={game.metricLabel} height={72} />
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="mt-9">
        <SectionTitle
          hint={
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as GameId | "all")}
              aria-label="Filter sessions by exercise"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[13px] text-[var(--text)]"
            >
              <option value="all">All exercises</option>
              {GAMES.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          }
        >
          Session history
        </SectionTitle>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-[var(--border)] text-[11px] uppercase tracking-wider text-[var(--text-faint)]">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Exercise</th>
                  <th className="px-4 py-2.5 font-medium">Mode</th>
                  <th className="px-4 py-2.5 text-right font-medium">Level</th>
                  <th className="px-4 py-2.5 text-right font-medium">Score</th>
                  <th className="px-4 py-2.5 text-right font-medium">Accuracy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filtered.slice(0, 100).map((s) => (
                  <Row key={s.id} session={s} />
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > 100 ? (
            <p className="border-t border-[var(--border)] px-4 py-3 text-[12px] text-[var(--text-faint)]">
              Showing the 100 most recent of {filtered.length}. Export from Settings for the full history.
            </p>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

function Row({ session }: { session: Session }) {
  const game = GAME_BY_ID[session.gameId];
  const accuracy = Math.round(session.accuracy * 100);

  return (
    <tr className="transition-colors hover:bg-[var(--bg-subtle)]">
      <td className="tnum whitespace-nowrap px-4 py-2.5 text-[var(--text-muted)]">
        {new Date(session.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
      </td>
      <td className="whitespace-nowrap px-4 py-2.5 font-medium">{game?.name ?? session.gameId}</td>
      <td className="px-4 py-2.5 text-[var(--text-muted)]">{session.mode}</td>
      <td className="tnum px-4 py-2.5 text-right">{session.level}</td>
      <td className="tnum px-4 py-2.5 text-right font-medium">{session.score}</td>
      <td
        className={cx(
          "tnum px-4 py-2.5 text-right",
          accuracy >= 90 ? "text-[var(--success)]" : accuracy < 70 ? "text-[var(--text-muted)]" : "",
        )}
      >
        {accuracy}%
      </td>
    </tr>
  );
}
