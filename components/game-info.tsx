"use client";

import { useMemo, type ReactNode } from "react";
import type { GameMeta } from "@/lib/types";
import { useProfile, useSessions } from "@/lib/store/hooks";
import { ButtonLink, Card, SectionTitle, Stat } from "@/components/ui";
import { GameIcon } from "@/components/ui/icons";
import { ProgressLine } from "@/components/charts";

/**
 * The info page every exercise shares: what it is, how it works, where it came
 * from, your history with it, and the way in. BrainScale routes info → tutorial
 * → training, and keeping that shape means a player who knows one game already
 * knows how to approach the next.
 */
export function GameInfo({ game, settings }: { game: GameMeta; settings?: ReactNode }) {
  const { sessions } = useSessions({ gameId: game.id, limit: 60 });
  const { bests } = useProfile();
  const best = bests?.[game.id];

  const levels = useMemo(() => (sessions ?? []).slice().reverse().map((s) => s.level), [sessions]);
  const played = sessions?.length ?? 0;

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 lg:py-12">
      <header className="mb-8">
        <div className="flex items-start gap-4">
          <span
            className="grid size-12 shrink-0 place-items-center rounded-2xl"
            style={{ background: `color-mix(in oklch, var(${game.accentVar}) 16%, transparent)`, color: `var(${game.accentVar})` }}
          >
            <GameIcon name={game.icon} className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-[26px] font-semibold tracking-tight sm:text-[30px]">{game.name}</h1>
            <p className="mt-1 text-[15px] text-[var(--text-muted)]">{game.tagline}</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {game.trains.map((t) => (
            <span key={t} className="rounded-lg bg-[var(--bg-subtle)] px-2.5 py-1 text-[12px] text-[var(--text-muted)]">
              {t}
            </span>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-2.5">
          <ButtonLink href={`/play/${game.id}`} variant="primary" size="lg">
            {played > 0 ? "Continue training" : "Start training"}
          </ButtonLink>
          {game.hasTutorial ? (
            <ButtonLink href={`/games/${game.id}/tutorial`} variant="secondary" size="lg">
              Interactive tutorial
            </ButtonLink>
          ) : null}
        </div>
      </header>

      {played > 0 ? (
        <Card className="mb-8 p-5">
          <div className="flex flex-wrap items-center gap-x-10 gap-y-5">
            <Stat label="Sessions" value={played} />
            <Stat label={`Best ${game.metricLabel.toLowerCase()}`} value={best?.level ?? "—"} />
            <Stat
              label="Last accuracy"
              value={sessions?.[0] ? `${Math.round(sessions[0].accuracy * 100)}%` : "—"}
            />
          </div>
          {levels.length > 1 ? (
            <div className="mt-5 border-t border-[var(--border)] pt-4">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[var(--text-faint)]">
                {game.metricLabel} over time
              </p>
              <ProgressLine values={levels} label={game.metricLabel} height={96} />
            </div>
          ) : null}
        </Card>
      ) : null}

      <section className="mb-8">
        <SectionTitle>How it works</SectionTitle>
        <Card className="p-5">
          <ol className="flex flex-col gap-3.5">
            {game.how.map((step, i) => (
              <li key={step} className="flex gap-3.5">
                <span className="tnum mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-[12px] font-semibold text-[var(--accent)]">
                  {i + 1}
                </span>
                <span className="text-[14px] leading-relaxed text-[var(--text)]">{step}</span>
              </li>
            ))}
          </ol>
        </Card>
      </section>

      {settings ? (
        <section className="mb-8">
          <SectionTitle hint="Saved automatically">Settings</SectionTitle>
          <Card className="p-5">{settings}</Card>
        </section>
      ) : null}

      <section>
        <SectionTitle>About this exercise</SectionTitle>
        <Card className="p-5">
          <p className="text-[14px] leading-relaxed text-[var(--text-muted)]">{game.about}</p>
          <p className="mt-4 border-t border-[var(--border)] pt-4 text-[13px] text-[var(--text-faint)]">
            <span className="font-medium text-[var(--text-muted)]">Origin:</span> {game.origin}
          </p>
        </Card>
      </section>
    </div>
  );
}
