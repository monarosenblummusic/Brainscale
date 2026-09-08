"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Button, ButtonLink, cx } from "@/components/ui";
import type { GameMeta } from "@/lib/types";

/* --------------------------------------------------------------- PlayFrame */

/**
 * The frame every play screen sits in. Holds the page in a fixed viewport so
 * a stimulus never moves under the player, and suppresses document scroll for
 * as long as a session is live.
 */
export function PlayFrame({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.body.dataset.playing = "true";
    return () => {
      delete document.body.dataset.playing;
    };
  }, []);

  return <div className="flex h-dvh flex-col overflow-hidden">{children}</div>;
}

/* --------------------------------------------------------------------- HUD */

export function Hud({
  game,
  level,
  progress,
  score,
  onPause,
  right,
}: {
  game: GameMeta;
  level: string;
  progress?: { current: number; total: number };
  score?: string;
  onPause?: () => void;
  right?: ReactNode;
}) {
  const pct = progress && progress.total > 0 ? (progress.current / progress.total) * 100 : null;

  return (
    <header className="relative shrink-0 border-b border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link
          href={`/games/${game.id}`}
          className="grid size-9 shrink-0 place-items-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]"
          aria-label={`Leave ${game.name}`}
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-[14px] font-semibold tracking-tight">{level}</span>
            {progress ? (
              <span className="tnum shrink-0 text-[13px] text-[var(--text-faint)]">
                {progress.current} / {progress.total}
              </span>
            ) : null}
          </div>
        </div>

        {score ? (
          <div className="tnum shrink-0 text-[14px] font-medium text-[var(--text-muted)]" aria-live="off">
            {score}
          </div>
        ) : null}

        {right}

        {onPause ? (
          <Button variant="ghost" size="sm" onClick={onPause} aria-label="Pause session">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 4v16M18 4v16" />
            </svg>
          </Button>
        ) : null}
      </div>

      {pct !== null ? (
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--bg-subtle)]">
          <div
            className="h-full bg-[var(--accent)] transition-[width] duration-200 ease-linear"
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
    </header>
  );
}

/* --------------------------------------------------------------- Stage */

/** The centred area a stimulus is drawn in. */
export function Stage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("flex min-h-0 flex-1 flex-col items-center justify-center gap-6 p-4 sm:p-6", className)}>
      {children}
    </div>
  );
}

/* ----------------------------------------------------------- Countdown */

export function Countdown({ value }: { value: number }) {
  return (
    <div className="grid flex-1 place-items-center">
      <div key={value} className="anim-flash tnum text-[clamp(4rem,20vw,9rem)] font-light tabular-nums text-[var(--accent)]">
        {value > 0 ? value : "Go"}
      </div>
    </div>
  );
}

/** Counts 3-2-1 then calls `onDone`. Kept out of engines: it is pure chrome. */
export function useCountdown(active: boolean, from: number, onDone: () => void) {
  const [value, setValue] = useState(from);

  useEffect(() => {
    if (!active) {
      setValue(from);
      return;
    }
    setValue(from);
    let n = from;
    const id = setInterval(() => {
      n -= 1;
      setValue(n);
      if (n < 0) {
        clearInterval(id);
        onDone();
      }
    }, 700);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, from]);

  return value;
}

/* ----------------------------------------------------------- Pause menu */

export function PauseOverlay({
  game,
  onResume,
  onRestart,
}: {
  game: GameMeta;
  onResume: () => void;
  onRestart: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-[var(--bg)]/85 p-6 backdrop-blur-sm">
      <div className="anim-fade-up w-full max-w-xs rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center shadow-[var(--shadow-lg)]">
        <h2 className="text-[17px] font-semibold tracking-tight">Paused</h2>
        <p className="mt-1 text-[13px] text-[var(--text-muted)]">
          The clock is stopped. Nothing counts against you.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button variant="primary" size="lg" onClick={onResume} autoFocus>
            Resume
          </Button>
          <Button variant="secondary" onClick={onRestart}>
            Restart session
          </Button>
          <ButtonLink variant="ghost" href={`/games/${game.id}`}>
            Leave
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- Result card */

export interface ResultRow {
  label: string;
  value: string;
  tone?: "default" | "good" | "bad";
}

export function ResultScreen({
  game,
  headline,
  sublabel,
  rows,
  verdict,
  onAgain,
  extra,
}: {
  game: GameMeta;
  headline: string;
  sublabel: string;
  rows: ResultRow[];
  verdict?: { text: string; tone: "up" | "down" | "hold" };
  onAgain: () => void;
  extra?: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-5">
      <div className="anim-fade-up w-full max-w-md">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-lg)] sm:p-8">
          <p className="text-[13px] font-medium uppercase tracking-wider text-[var(--text-faint)]">
            {game.name} · complete
          </p>

          <div className="mt-3 flex items-baseline gap-3">
            <span className="tnum text-[44px] font-semibold leading-none tracking-tight">{headline}</span>
            <span className="text-[15px] text-[var(--text-muted)]">{sublabel}</span>
          </div>

          {verdict ? (
            <div
              className={cx(
                "mt-4 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[13px] font-medium",
                verdict.tone === "up" && "bg-[var(--success-soft)] text-[var(--success)]",
                verdict.tone === "down" && "bg-[var(--danger-soft)] text-[var(--danger)]",
                verdict.tone === "hold" && "bg-[var(--bg-subtle)] text-[var(--text-muted)]",
              )}
            >
              <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {verdict.tone === "up" ? (
                  <path d="M12 19V5M5 12l7-7 7 7" />
                ) : verdict.tone === "down" ? (
                  <path d="M12 5v14M5 12l7 7 7-7" />
                ) : (
                  <path d="M5 12h14" />
                )}
              </svg>
              {verdict.text}
            </div>
          ) : null}

          <dl className="mt-6 divide-y divide-[var(--border)]">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-[13px] text-[var(--text-muted)]">{r.label}</dt>
                <dd
                  className={cx(
                    "tnum text-[14px] font-medium",
                    r.tone === "good" && "text-[var(--success)]",
                    r.tone === "bad" && "text-[var(--danger)]",
                  )}
                >
                  {r.value}
                </dd>
              </div>
            ))}
          </dl>

          {extra}

          <div className="mt-6 flex gap-2">
            <Button variant="primary" size="lg" className="flex-1" onClick={onAgain} autoFocus>
              Train again
            </Button>
            <ButtonLink variant="secondary" size="lg" href={`/games/${game.id}`}>
              Done
            </ButtonLink>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Start gate */

export function StartGate({
  game,
  level,
  instructions,
  onStart,
  children,
}: {
  game: GameMeta;
  level: string;
  instructions: ReactNode;
  onStart: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-5">
      <div className="w-full max-w-md text-center">
        <p className="text-[13px] font-medium uppercase tracking-wider text-[var(--text-faint)]">{game.name}</p>
        <h1 className="mt-2 text-[28px] font-semibold tracking-tight">{level}</h1>
        <div className="mt-4 text-[14px] leading-relaxed text-[var(--text-muted)]">{instructions}</div>
        {children}
        <Button variant="primary" size="lg" className="mt-7 w-full" onClick={onStart} autoFocus>
          Start
        </Button>
        <p className="mt-3 text-[12px] text-[var(--text-faint)]">
          Press <kbd className="font-sans font-semibold">Space</kbd> to start or pause
        </p>
      </div>
    </div>
  );
}
