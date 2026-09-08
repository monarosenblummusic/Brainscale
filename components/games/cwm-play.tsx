"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGameEngine } from "@/hooks/useGameEngine";
import { useGameSettings } from "@/lib/store/hooks";
import { GAME_BY_ID } from "@/lib/games";
import {
  CWM_DEFAULTS,
  GRID_CELLS,
  GRID_SIZE,
  PATTERN_SIZE,
  cwmEngine,
  type CwmConfig,
  type CwmState,
} from "@/lib/engine/cwm";
import { playCue } from "@/lib/audio";
import {
  Countdown,
  Hud,
  PauseOverlay,
  PlayFrame,
  ResultScreen,
  Stage,
  StartGate,
} from "@/components/game-shell";
import { Button, cx } from "@/components/ui";

const GAME = GAME_BY_ID["complex-working-memory"];

function SymmetryPattern({ cells }: { cells: boolean[] }) {
  return (
    <div
      className="grid aspect-square w-full max-w-[min(72vw,20rem)] gap-px overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--border)]"
      style={{ gridTemplateColumns: `repeat(${PATTERN_SIZE}, minmax(0, 1fr))` }}
      role="img"
      aria-label="Pattern to judge for symmetry"
    >
      {cells.map((on, i) => (
        <div key={i} className={on ? "bg-[var(--text)]" : "bg-[var(--surface)]"} />
      ))}
    </div>
  );
}

function RecallGrid({
  highlighted,
  recall,
  onSelect,
  interactive,
  reveal,
}: {
  highlighted?: number;
  recall: number[];
  onSelect: (i: number) => void;
  interactive: boolean;
  reveal?: number[];
}) {
  return (
    <div
      className="grid aspect-square w-full max-w-[min(72vw,20rem)] gap-2"
      style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: GRID_CELLS }, (_, i) => {
        const lit = highlighted === i;
        const order = recall.indexOf(i);
        const revealOrder = reveal?.indexOf(i) ?? -1;

        return (
          <button
            key={i}
            type="button"
            disabled={!interactive}
            aria-label={`Cell ${i + 1}`}
            onPointerDown={(e) => {
              e.preventDefault();
              onSelect(i);
            }}
            className={cx(
              "grid place-items-center rounded-xl border-2 transition-all duration-100 disabled:cursor-default",
              lit
                ? "scale-105 border-[var(--accent)] bg-[var(--accent)] shadow-[var(--shadow)]"
                : order !== -1
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                  : revealOrder !== -1
                    ? "border-[var(--success)] bg-[var(--success-soft)]"
                    : "border-[var(--border)] bg-[var(--surface)]",
              interactive && order === -1 && "hover:border-[var(--accent)] active:scale-95",
            )}
          >
            {order !== -1 ? (
              <span className="tnum text-[14px] font-semibold text-[var(--accent)]">{order + 1}</span>
            ) : revealOrder !== -1 ? (
              <span className="tnum text-[14px] font-semibold text-[var(--success)]">{revealOrder + 1}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function CwmPlay() {
  const { settings, loaded } = useGameSettings<CwmConfig>("complex-working-memory", CWM_DEFAULTS);
  const [counting, setCounting] = useState(false);

  const { state, status, start, pause, resume, reset, send } = useGameEngine(cwmEngine, settings);

  const beginCountdown = useCallback(() => setCounting(true), []);
  const onCountdownDone = useCallback(() => {
    setCounting(false);
    start();
  }, [start]);

  const gradedRef = useRef(0);
  useEffect(() => {
    if (!state || state.trialsPlayed === gradedRef.current) return;
    gradedRef.current = state.trialsPlayed;
    if (state.lastTrial) playCue(state.lastTrial.recallOk ? "correct" : "wrong");
  }, [state]);

  const judge = useCallback(
    (symmetric: boolean) => {
      if (!state || state.stage !== "pattern" || status !== "running") return;
      send({ kind: "answer", value: symmetric ? "symmetric" : "asymmetric" });
    },
    [state, status, send],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (status === "ready") beginCountdown();
        else if (status === "running") pause();
        else if (status === "paused") resume();
        return;
      }
      if (e.key === "Escape" && status === "running") {
        e.preventDefault();
        pause();
        return;
      }
      if (status !== "running" || state?.stage !== "pattern") return;
      const key = e.key.toLowerCase();
      if (key === "y" || key === "arrowleft") {
        e.preventDefault();
        judge(true);
      } else if (key === "n" || key === "arrowright") {
        e.preventDefault();
        judge(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, state?.stage, judge, beginCountdown, pause, resume]);

  const again = useCallback(() => {
    reset();
    beginCountdown();
  }, [reset, beginCountdown]);

  if (!loaded) {
    return (
      <PlayFrame>
        <div className="grid flex-1 place-items-center text-[13px] text-[var(--text-faint)]">Loading…</div>
      </PlayFrame>
    );
  }

  if (status === "finished" && state) {
    const r = cwmEngine.result(state);
    return (
      <PlayFrame>
        <Hud game={GAME} level="Complex Working Memory" />
        <ResultScreen
          game={GAME}
          headline={String(r.best)}
          sublabel="set size"
          verdict={{
            text: `Next session starts at set size ${state.progress.level}`,
            tone: state.progress.level > settings.startLevel ? "up" : state.progress.level < settings.startLevel ? "down" : "hold",
          }}
          rows={[
            { label: "Best set size", value: String(r.best) },
            {
              label: "Blocks recalled perfectly",
              value: `${state.recallCorrect} of ${state.recallTotal}`,
              tone: r.recallAccuracy >= 0.5 ? "good" : "default",
            },
            {
              label: "Symmetry judgements",
              value: `${state.symmetryCorrect} of ${state.symmetryTotal}`,
              tone: r.symmetryAccuracy >= 0.85 ? "good" : r.symmetryAccuracy < 0.6 ? "bad" : "default",
            },
            { label: "Overall", value: `${Math.round(r.accuracy * 100)}%` },
          ]}
          onAgain={again}
        />
      </PlayFrame>
    );
  }

  if (status === "ready" && !counting) {
    return (
      <PlayFrame>
        <Hud game={GAME} level="Complex Working Memory" />
        <StartGate
          game={GAME}
          level={`Set size ${settings.startLevel}`}
          onStart={beginCountdown}
          instructions={
            <>
              <p>
                Judge each pattern symmetric or not, then remember the cell that lights up. Both, alternating,
                until the block ends — then recall the cells in order.
              </p>
              <p className="mt-3 text-[13px] text-[var(--text-faint)]">
                {settings.trials} blocks · press <strong>Y</strong> or <strong>N</strong> for symmetry
              </p>
            </>
          }
        />
      </PlayFrame>
    );
  }

  return (
    <PlayFrame>
      <Hud
        game={GAME}
        level={`Set size ${state?.progress.level ?? settings.startLevel}`}
        progress={state ? { current: state.trialsPlayed, total: settings.trials } : undefined}
        score={state ? `Best ${state.progress.best}` : undefined}
        onPause={status === "running" ? pause : undefined}
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
        {counting ? <Countdown onDone={onCountdownDone} /> : state ? <CwmStage state={state} onJudge={judge} onSelect={(i) => send({ kind: "select", index: i })} running={status === "running"} /> : null}

        {status === "paused" ? <PauseOverlay game={GAME} onResume={resume} onRestart={again} /> : null}
      </div>
    </PlayFrame>
  );
}

function CwmStage({
  state,
  onJudge,
  onSelect,
  running,
}: {
  state: CwmState;
  onJudge: (symmetric: boolean) => void;
  onSelect: (index: number) => void;
  running: boolean;
}) {
  const item = state.items[state.itemIndex];

  if (state.stage === "pattern" && item) {
    const remaining = Math.max(0, state.config.symmetryMs - (state.elapsed - state.stageStart));
    return (
      <Stage>
        <p className="text-[13px] font-medium uppercase tracking-wider text-[var(--text-faint)]">
          Is this symmetric?
        </p>
        <SymmetryPattern cells={item.pattern} />
        <div className="flex w-full max-w-[min(72vw,20rem)] gap-2.5">
          <Button variant="secondary" size="lg" className="flex-1" onClick={() => onJudge(false)} disabled={!running}>
            No <span className="ml-1 text-[11px] opacity-60">N</span>
          </Button>
          <Button variant="primary" size="lg" className="flex-1" onClick={() => onJudge(true)} disabled={!running}>
            Yes <span className="ml-1 text-[11px] opacity-60">Y</span>
          </Button>
        </div>
        <div className="h-1 w-full max-w-[min(72vw,20rem)] overflow-hidden rounded-full bg-[var(--bg-subtle)]">
          <div
            className="h-full bg-[var(--warning)]"
            style={{ width: `${(remaining / state.config.symmetryMs) * 100}%` }}
          />
        </div>
      </Stage>
    );
  }

  if (state.stage === "highlight" || state.stage === "blank") {
    return (
      <Stage>
        <p className="text-[13px] font-medium uppercase tracking-wider text-[var(--text-faint)]">
          Remember this cell
        </p>
        <RecallGrid
          highlighted={state.stage === "highlight" ? item?.cell : undefined}
          recall={[]}
          onSelect={() => {}}
          interactive={false}
        />
        <div className="h-[52px]" />
      </Stage>
    );
  }

  if (state.stage === "recall") {
    return (
      <Stage>
        <p className="text-[13px] font-medium uppercase tracking-wider text-[var(--accent)]">
          Tap the cells in order
        </p>
        <RecallGrid recall={state.recall} onSelect={onSelect} interactive={running} />
        <div className="flex h-[52px] items-center">
          {state.recall.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => onSelect(state.recall[state.recall.length - 1]!)}>
              Undo last
            </Button>
          ) : (
            <span className="text-[13px] text-[var(--text-faint)]">
              {state.items.length} cells · tap again to undo
            </span>
          )}
        </div>
      </Stage>
    );
  }

  // Review: show the correct order so a failed block still teaches something.
  return (
    <Stage>
      <p
        className={cx(
          "text-[13px] font-medium uppercase tracking-wider",
          state.lastTrial?.recallOk ? "text-[var(--success)]" : "text-[var(--danger)]",
        )}
        aria-live="polite"
      >
        {state.lastTrial?.recallOk ? "Correct order" : "The order was"}
      </p>
      <RecallGrid recall={[]} reveal={state.items.map((i) => i.cell)} onSelect={() => {}} interactive={false} />
      <div className="flex h-[52px] items-center text-[13px] text-[var(--text-muted)]">
        {state.lastTrial
          ? `Symmetry ${state.lastTrial.symmetryOk} of ${state.lastTrial.symmetryOf}`
          : null}
      </div>
    </Stage>
  );
}
