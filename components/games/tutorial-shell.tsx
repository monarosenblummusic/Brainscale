"use client";

import { useState, type ReactNode } from "react";
import type { GameMeta } from "@/lib/types";
import { Button, ButtonLink, Card, cx } from "@/components/ui";

export interface TutorialStep {
  title: string;
  body: ReactNode;
  /** Rendered beside the text — a live, interactive demo of the step. */
  demo?: ReactNode;
  /** Blocks Next until satisfied, so a player cannot skip past a drill. */
  requirement?: { met: boolean; label: string };
}

/**
 * A stepped tutorial with a working demo at each stage. BrainScale's own n-back
 * tutorial is interactive rather than a wall of text, and for a task this
 * counter-intuitive that is the right call — reading what "2-back" means does
 * not produce the same understanding as doing one.
 */
export function TutorialShell({ game, steps }: { game: GameMeta; steps: TutorialStep[] }) {
  const [index, setIndex] = useState(0);
  const step = steps[index]!;
  const isLast = index === steps.length - 1;
  const blocked = step.requirement ? !step.requirement.met : false;

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 lg:py-12">
      <header className="mb-6">
        <p className="text-[13px] font-medium uppercase tracking-wider text-[var(--text-faint)]">
          {game.name} tutorial
        </p>
        <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight">{step.title}</h1>
      </header>

      <div className="mb-6 flex gap-1.5" role="progressbar" aria-valuenow={index + 1} aria-valuemin={1} aria-valuemax={steps.length}>
        {steps.map((s, i) => (
          <span
            key={s.title}
            className={cx(
              "h-1 flex-1 rounded-full transition-colors",
              i <= index ? "bg-[var(--accent)]" : "bg-[var(--bg-subtle)]",
            )}
          />
        ))}
      </div>

      <Card className="p-5 sm:p-6">
        <div className="text-[14.5px] leading-relaxed text-[var(--text)]">{step.body}</div>
        {step.demo ? <div className="mt-6">{step.demo}</div> : null}
      </Card>

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
          Back
        </Button>

        <div className="flex items-center gap-3">
          {blocked && step.requirement ? (
            <span className="text-[13px] text-[var(--text-faint)]">{step.requirement.label}</span>
          ) : null}
          {isLast ? (
            <ButtonLink href={`/play/${game.id}`} variant="primary" size="lg">
              Start training
            </ButtonLink>
          ) : (
            <Button variant="primary" size="lg" onClick={() => setIndex((i) => i + 1)} disabled={blocked}>
              Next
            </Button>
          )}
        </div>
      </div>

      <p className="mt-6 text-center text-[13px] text-[var(--text-faint)]">
        <ButtonLink href={`/games/${game.id}`} variant="ghost" size="sm">
          Skip to {game.name}
        </ButtonLink>
      </p>
    </div>
  );
}
