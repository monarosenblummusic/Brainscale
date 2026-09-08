"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useGameEngine } from "@/hooks/useGameEngine";
import { useGameSettings } from "@/lib/store/hooks";
import { GAME_BY_ID } from "@/lib/games";
import { dayKey } from "@/lib/store/repository";
import { seedForDay } from "@/lib/engine/rng";
import {
  CRYPTOGRAM_DEFAULTS,
  conflictingNumbers,
  cryptogramEngine,
  toCells,
  type CryptogramConfig,
  type CryptogramState,
} from "@/lib/engine/cryptogram";
import { playCue } from "@/lib/audio";
import { Hud, PauseOverlay, PlayFrame, ResultScreen, StartGate } from "@/components/game-shell";
import { Button, cx } from "@/components/ui";

const GAME = GAME_BY_ID["cryptogram"];

export function CryptogramPlay() {
  const { settings, loaded } = useGameSettings<CryptogramConfig>("cryptogram", CRYPTOGRAM_DEFAULTS);

  // A daily puzzle is seeded from the date, so everyone gets the same one and
  // reloading does not reroll it.
  const seed = useMemo(
    () => (settings.daily ? seedForDay(dayKey(Date.now())) : undefined),
    [settings.daily],
  );

  const { state, status, start, pause, resume, reset, send } = useGameEngine(cryptogramEngine, settings, { seed });

  useEffect(() => {
    if (status === "finished") playCue("finish");
  }, [status]);

  const typeLetter = useCallback(
    (letter: string) => {
      if (status !== "running") return;
      send({ kind: "answer", value: letter });
    },
    [status, send],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey) return;
      if (e.key === "Escape" && status === "running") {
        e.preventDefault();
        pause();
        return;
      }
      if (status === "ready" && e.code === "Space") {
        e.preventDefault();
        start();
        return;
      }
      if (status !== "running") return;

      if (/^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault();
        typeLetter(e.key.toUpperCase());
      } else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        send({ kind: "clear" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, typeLetter, send, start, pause]);

  const again = useCallback(() => {
    reset();
    start();
  }, [reset, start]);

  if (!loaded) {
    return (
      <PlayFrame>
        <div className="grid flex-1 place-items-center text-[13px] text-[var(--text-faint)]">Loading…</div>
      </PlayFrame>
    );
  }

  if (status === "finished" && state) {
    const r = cryptogramEngine.result(state);
    return (
      <PlayFrame>
        <Hud game={GAME} level="Cryptogram" />
        <ResultScreen
          game={GAME}
          headline={String(r.score)}
          sublabel="points"
          verdict={{ text: r.solved ? "Solved" : "Unfinished", tone: r.solved ? "up" : "hold" }}
          rows={[
            { label: "Time", value: `${Math.floor(r.durationMs / 60000)}m ${Math.round((r.durationMs % 60000) / 1000)}s` },
            { label: "Hints used", value: String(r.hintsUsed), tone: r.hintsUsed === 0 ? "good" : "default" },
            { label: "Wrong letters tried", value: String(r.mistakes) },
            { label: "Difficulty", value: settings.difficulty },
          ]}
          onAgain={again}
          extra={
            <div className="mt-5 rounded-xl bg-[var(--bg-subtle)] p-4">
              <p className="text-[14px] italic leading-relaxed">&ldquo;{state.puzzle.quote.text}&rdquo;</p>
              <p className="mt-2 text-[13px] text-[var(--text-muted)]">— {state.puzzle.quote.author}</p>
            </div>
          }
        />
      </PlayFrame>
    );
  }

  if (status === "ready") {
    return (
      <PlayFrame>
        <Hud game={GAME} level="Cryptogram" />
        <StartGate
          game={GAME}
          level={settings.daily ? "Today's puzzle" : "New puzzle"}
          onStart={start}
          instructions={
            <>
              <p>
                Every letter has been replaced by a number, consistently throughout the quote. A few pairings
                are given. Work out the rest.
              </p>
              <p className="mt-3 text-[13px] text-[var(--text-faint)]">
                Untimed. Click a cell and type a letter · {settings.difficulty} difficulty
                {settings.daily ? " · the same puzzle for everyone today" : ""}
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
        level={settings.daily ? "Today's puzzle" : "Cryptogram"}
        score={state ? `${state.hintsUsed} hint${state.hintsUsed === 1 ? "" : "s"}` : undefined}
        onPause={status === "running" ? pause : undefined}
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
        {state ? <Puzzle state={state} onSelect={(i) => send({ kind: "select", index: i })} /> : null}

        {state ? (
          <div className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-3 py-3 sm:px-4">
            <LetterPad state={state} onLetter={typeLetter} />
            <div className="mt-2.5 flex items-center justify-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => send({ kind: "clear" })}>
                Erase
              </Button>
              <Button variant="secondary" size="sm" onClick={() => send({ kind: "skip" })}>
                Reveal this letter
              </Button>
            </div>
          </div>
        ) : null}

        {status === "paused" ? <PauseOverlay game={GAME} onResume={resume} onRestart={again} /> : null}
      </div>
    </PlayFrame>
  );
}

function Puzzle({ state, onSelect }: { state: CryptogramState; onSelect: (index: number) => void }) {
  const cells = toCells(state.puzzle);
  const conflicts = conflictingNumbers(state);
  const cursorNumber = cells[state.cursor]?.number ?? null;

  // Break into words so a word never wraps mid-way — reading word shapes is
  // most of how a cryptogram is actually solved.
  const words: { cell: (typeof cells)[number]; index: number }[][] = [[]];
  cells.forEach((cell, index) => {
    if (cell.char === " ") words.push([]);
    else words[words.length - 1]!.push({ cell, index });
  });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-x-3 gap-y-4">
        {words.map((word, wi) => (
          <div key={wi} className="flex gap-[3px]">
            {word.map(({ cell, index }) => {
              if (!cell.isLetter || cell.number === null) {
                return (
                  <span key={index} className="flex h-[52px] w-3 items-center justify-center pt-1 text-[17px] text-[var(--text-muted)]">
                    {cell.char}
                  </span>
                );
              }

              const given = state.puzzle.revealed.includes(cell.number);
              const guess = given ? cell.char : (state.guesses[cell.number] ?? "");
              const isCursor = index === state.cursor;
              const sameNumber = cursorNumber === cell.number && !isCursor;
              const conflicted = conflicts.has(cell.number);

              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => onSelect(index)}
                  disabled={given}
                  aria-label={`Number ${cell.number}${guess ? `, letter ${guess}` : ", empty"}`}
                  className={cx(
                    "flex h-[52px] w-[26px] flex-col items-center justify-end gap-0.5 rounded-md pb-0.5 transition-colors sm:w-[30px]",
                    isCursor && "bg-[var(--accent-soft)]",
                    sameNumber && "bg-[var(--bg-subtle)]",
                    !given && !isCursor && !sameNumber && "hover:bg-[var(--bg-subtle)]",
                  )}
                >
                  <span
                    className={cx(
                      "text-[17px] font-semibold leading-none sm:text-[19px]",
                      conflicted
                        ? "text-[var(--danger)]"
                        : given
                          ? "text-[var(--text-faint)]"
                          : guess
                            ? "text-[var(--text)]"
                            : "text-transparent",
                    )}
                  >
                    {guess || "·"}
                  </span>
                  <span
                    className={cx(
                      "h-[2px] w-full rounded-full",
                      isCursor ? "bg-[var(--accent)]" : conflicted ? "bg-[var(--danger)]" : "bg-[var(--border-strong)]",
                    )}
                  />
                  <span className="tnum text-[10px] leading-none text-[var(--text-faint)]">{cell.number}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <p className="mt-8 text-center text-[13px] text-[var(--text-faint)]">
        — {state.puzzle.quote.author}
      </p>
    </div>
  );
}

/**
 * The letter pad dims letters already assigned somewhere. That is bookkeeping,
 * not a hint — the same information is already visible in the grid, just
 * scattered across it.
 */
function LetterPad({ state, onLetter }: { state: CryptogramState; onLetter: (letter: string) => void }) {
  const used = new Set<string>([
    ...Object.values(state.guesses).filter(Boolean),
    ...state.puzzle.revealed.map((n) => {
      const entry = Object.entries(state.puzzle.cipher).find(([, v]) => v === n);
      return entry ? entry[0].toUpperCase() : "";
    }),
  ]);

  return (
    <div className="mx-auto grid max-w-2xl grid-cols-9 gap-1 sm:grid-cols-13">
      {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter) => (
        <button
          key={letter}
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            onLetter(letter);
          }}
          className={cx(
            "h-10 rounded-lg border text-[14px] font-semibold transition-all active:scale-95",
            used.has(letter)
              ? "border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-faint)]"
              : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]",
          )}
        >
          {letter}
        </button>
      ))}
    </div>
  );
}
