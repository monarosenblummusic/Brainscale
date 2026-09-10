"use client";

import { useState } from "react";
import { GAME_SECTIONS, GAME_BY_ID, byCategory } from "@/lib/games";
import { useProfile, useSessions } from "@/lib/store/hooks";
import { dayKey } from "@/lib/store/repository";
import { GameCard } from "@/components/game-card";
import { ActivityHeatmap, GoalRing } from "@/components/charts";
import { Card, SectionTitle, Stat, ButtonLink } from "@/components/ui";
import { FlameIcon } from "@/components/ui/icons";

const DAILY_GOAL = 3;

export function Dashboard() {
  const { sessions } = useSessions();
  const { streak, bests } = useProfile();

  // Read the clock once, on mount, rather than on every render: a render is
  // supposed to be a pure function of its inputs, and "today" is not one.
  const [today] = useState(() => dayKey(Date.now()));
  const all = sessions ?? [];
  const todayCount = all.filter((s) => dayKey(s.startedAt) === today).length;
  const totalMinutes = Math.round(all.reduce((sum, s) => sum + s.durationMs, 0) / 60_000);
  const recent = all.slice(0, 5);

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 lg:py-12">
      <header className="mb-9">
        <h1 className="text-[27px] font-semibold tracking-tight sm:text-3xl">Train your working memory</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[var(--text-muted)]">
          Seven exercises drawn from cognitive research, each one adapting to how you actually perform. Short
          and frequent beats long and occasional — the streak is the point.
        </p>
      </header>

      {/* Progress strip */}
      <Card className="mb-9 p-5">
        <div className="flex flex-wrap items-center gap-x-10 gap-y-6">
          <div className="flex items-center gap-4">
            <GoalRing value={todayCount} goal={DAILY_GOAL} />
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-faint)]">Today</div>
              <div className="mt-0.5 text-[15px] font-medium">
                {todayCount >= DAILY_GOAL ? "Goal reached" : `${DAILY_GOAL - todayCount} to go`}
              </div>
              <div className="text-[13px] text-[var(--text-muted)]">{DAILY_GOAL} sessions daily</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <FlameIcon />
            </span>
            <Stat
              label="Streak"
              value={<span className="tnum">{streak?.current ?? 0}</span>}
              sub={`Longest ${streak?.longest ?? 0} days`}
            />
          </div>

          <Stat label="Sessions" value={<span className="tnum">{all.length}</span>} sub="All time" />
          <Stat label="Time trained" value={<span className="tnum">{totalMinutes}m</span>} sub="All time" />
        </div>

        {all.length > 0 ? (
          <div className="mt-6 border-t border-[var(--border)] pt-5">
            <ActivityHeatmap sessions={all} />
          </div>
        ) : null}
      </Card>

      {GAME_SECTIONS.map((section) => {
        const games = byCategory(section.category);
        if (games.length === 0) return null;
        return (
          <section key={section.category} className="mb-9">
            <SectionTitle hint={section.hint}>{section.title}</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {games.map((g) => (
                <GameCard key={g.id} game={g} best={bests?.[g.id]} />
              ))}
            </div>
          </section>
        );
      })}

      {recent.length > 0 ? (
        <section>
          <SectionTitle hint={<ButtonLink href="/stats" variant="ghost" size="sm">All statistics</ButtonLink>}>
            Recent sessions
          </SectionTitle>
          <Card className="divide-y divide-[var(--border)] overflow-hidden">
            {recent.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-medium">{GAME_BY_ID[s.gameId]?.name ?? s.gameId}</div>
                  <div className="truncate text-[13px] text-[var(--text-muted)]">{s.mode}</div>
                </div>
                <div className="flex shrink-0 items-center gap-6 text-right">
                  <div>
                    <div className="tnum text-[15px] font-semibold">{s.score}</div>
                    <div className="text-[11px] text-[var(--text-faint)]">
                      {GAME_BY_ID[s.gameId]?.metricLabel ?? "Score"}
                    </div>
                  </div>
                  <div className="tnum w-14 text-[13px] text-[var(--text-muted)]">
                    {Math.round(s.accuracy * 100)}%
                  </div>
                </div>
              </div>
            ))}
          </Card>
        </section>
      ) : null}
    </div>
  );
}
