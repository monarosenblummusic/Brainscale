"use client";

import Link from "next/link";
import type { Best, GameMeta } from "@/lib/types";
import { GameIcon, ChevronRight } from "@/components/ui/icons";
import { Badge } from "@/components/ui";

export function GameCard({ game, best }: { game: GameMeta; best?: Best }) {
  return (
    <Link
      href={`/games/${game.id}`}
      className="card-shine group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-[var(--border)] bg-gradient-to-b from-[var(--surface-raised)] to-[var(--surface)] p-5 shadow-[var(--shadow)] transition-all duration-300 hover:-translate-y-1 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-lg)]"
    >
      {/* Accent glow that blooms on hover, tinted per game. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background: `radial-gradient(260px 170px at 50% -40px, color-mix(in oklch, var(${game.accentVar}) 22%, transparent), transparent 70%)`,
        }}
      />

      <div className="relative flex items-start justify-between gap-3">
        <span
          className="grid size-11 shrink-0 place-items-center rounded-xl shadow-[inset_0_0_0_1px_var(--border-strong)] transition-transform duration-300 group-hover:scale-105"
          style={{
            background: `linear-gradient(135deg, color-mix(in oklch, var(${game.accentVar}) 30%, transparent), color-mix(in oklch, var(${game.accentVar}) 8%, transparent))`,
            color: `var(${game.accentVar})`,
          }}
        >
          <GameIcon name={game.icon} className="size-5" />
        </span>
        {best ? (
          <Badge tone="accent">
            Best {game.metricLabel.toLowerCase()} {best.level}
          </Badge>
        ) : (
          <Badge>~{game.minutes} min</Badge>
        )}
      </div>

      <div className="relative flex-1">
        <h3 className="text-[15px] font-semibold tracking-tight">{game.name}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">{game.tagline}</p>
      </div>

      <div className="relative flex items-center justify-between gap-2 pt-1">
        <div className="flex flex-wrap gap-1.5">
          {game.trains.slice(0, 2).map((t) => (
            <span key={t} className="rounded-md bg-[var(--bg-subtle)] px-2 py-0.5 text-[11px] text-[var(--text-faint)]">
              {t}
            </span>
          ))}
        </div>
        <ChevronRight className="size-4 shrink-0 text-[var(--text-faint)] transition-all group-hover:translate-x-0.5 group-hover:text-[var(--accent)]" />
      </div>
    </Link>
  );
}
