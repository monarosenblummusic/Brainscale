"use client";

import Link from "next/link";
import type { Best, GameMeta } from "@/lib/types";
import { GameIcon, ChevronRight } from "@/components/ui/icons";
import { Badge } from "@/components/ui";

export function GameCard({ game, best }: { game: GameMeta; best?: Best }) {
  return (
    <Link
      href={`/games/${game.id}`}
      className="group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow)]"
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[3px] opacity-70 transition-opacity group-hover:opacity-100"
        style={{ background: `var(${game.accentVar})` }}
      />

      <div className="flex items-start justify-between gap-3">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-xl"
          style={{ background: `color-mix(in oklch, var(${game.accentVar}) 16%, transparent)`, color: `var(${game.accentVar})` }}
        >
          <GameIcon name={game.icon} />
        </span>
        {best ? (
          <Badge tone="accent">
            Best {game.metricLabel.toLowerCase()} {best.level}
          </Badge>
        ) : (
          <Badge>~{game.minutes} min</Badge>
        )}
      </div>

      <div className="flex-1">
        <h3 className="text-[15px] font-semibold tracking-tight">{game.name}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">{game.tagline}</p>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex flex-wrap gap-1.5">
          {game.trains.slice(0, 2).map((t) => (
            <span key={t} className="rounded-md bg-[var(--bg-subtle)] px-2 py-0.5 text-[11px] text-[var(--text-faint)]">
              {t}
            </span>
          ))}
        </div>
        <ChevronRight className="size-4 shrink-0 text-[var(--text-faint)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--accent)]" />
      </div>
    </Link>
  );
}
