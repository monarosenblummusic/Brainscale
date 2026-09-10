"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGameEngine } from "@/hooks/useGameEngine";
import { useGameSettings } from "@/lib/store/hooks";
import { GAME_BY_ID } from "@/lib/games";
import { DECODER_DEFAULTS, TARGET_SEQUENCES, decoderEngine, type DecoderConfig } from "@/lib/engine/decoder";
import { playCue } from "@/lib/audio";
import { Countdown, Hud, PauseOverlay, PlayFrame, ResultScreen, StartGate } from "@/components/game-shell";
import { Kbd, cx } from "@/components/ui";

const GAME = GAME_BY_ID["decoder"];

export function DecoderPlay() {
  const { settings, loaded } = useGameSettings<DecoderConfig>("decoder", DECODER_DEFAULTS);
  const [counting, setCounting] = useState(false);

  const { state, status, start, pause, resume, reset, send } = useGameEngine(decoderEngine, settings);

  const onCountdownDone = useCallback(() => {
    setCounting(false);
    start();
  }, [start]);

  const pressedRef = useRef(0);
  useEffect(() => {
    if (!state?.lastPress || state.lastPress.at === pressedRef.current) return;
    pressedRef.current = state.lastPress.at;
    playCue(state.lastPress.outcome === "hit" ? "correct" : "wrong");
  }, [state]);

  const respond = useCallback(() => {
    if (status !== "running") return;
    send({ kind: "respond", channel: "target" });
  }, [status, send]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (status === "ready") setCounting(true);
        else if (status === "running") respond();
        else if (status === "paused") resume();
        return;
      }
      if (e.key === "Escape" && status === "running") {
        e.preventDefault();
        pause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, respond, pause, resume]);

  const again = useCallback(() => {
    pressedRef.current = 0;
    reset();
    setCounting(true);
  }, [reset]);

  if (!loaded) {
    return (
      <PlayFrame>
        <div className="grid flex-1 place-items-center text-[13px] text-[var(--text-faint)]">Loading…</div>
      </PlayFrame>
    );
  }

  if (status === "finished" && state) {
    const r = decoderEngine.result(state);
    return (
      <PlayFrame>
        <Hud game={GAME} level={GAME.name} />
        <ResultScreen
          game={GAME}
          headline={`${r.hits} / ${r.targets}`}
          sublabel={`sequences caught · ${Math.round(r.accuracy * 100)}%${r.falseAlarms > 0 ? ` · ${r.falseAlarms} false` : ""}`}
          verdict={{
            text:
              r.nextIntervalMs < r.intervalMs
                ? `Stream quickens to ${Math.round(60000 / r.nextIntervalMs)} digits a minute`
                : r.nextIntervalMs > r.intervalMs
                  ? `Stream eases to ${Math.round(60000 / r.nextIntervalMs)} digits a minute`
                  : `Holding at ${Math.round(60000 / r.intervalMs)} digits a minute`,
            tone: r.nextIntervalMs < r.intervalMs ? "up" : r.nextIntervalMs > r.intervalMs ? "down" : "hold",
          }}
          rows={[
            { label: "Caught", value: `${r.hits} of ${r.targets}`, tone: "good" },
            { label: "Missed", value: String(r.misses), tone: r.misses > 0 ? "bad" : "default" },
            { label: "False presses", value: String(r.falseAlarms), tone: r.falseAlarms > 0 ? "bad" : "default" },
            { label: "Longest unbroken run", value: String(r.longestRun) },
            { label: "Stream rate", value: `${Math.round(60000 / r.intervalMs)} digits/min` },
          ]}
          onAgain={again}
        />
      </PlayFrame>
    );
  }

  if (status === "ready" && !counting) {
    return (
      <PlayFrame>
        <Hud game={GAME} level={GAME.name} />
        <StartGate
          game={GAME}
          level={`${Math.round(60000 / settings.intervalMs)} digits a minute`}
          onStart={() => setCounting(true)}
          instructions={
            <>
              <p>
                Press when the last three digits form a run that climbs by two.
              </p>
              <div className="mt-4 flex justify-center gap-2">
                {TARGET_SEQUENCES.map((seq) => (
                  <span
                    key={seq.join()}
                    className="tnum rounded-lg bg-[var(--accent-soft)] px-3 py-1.5 text-[15px] font-semibold text-[var(--accent)]"
                  >
                    {seq.join(" ")}
                  </span>
                ))}
              </div>
              <p className="mt-4 text-[13px] text-[var(--text-faint)]">
                {settings.durationSec}s · press <Kbd>Space</Kbd> or tap · most digits are noise
              </p>
            </>
          }
        />
      </PlayFrame>
    );
  }

  const digit = state ? state.stream[state.index] : undefined;
  const recent = state ? state.stream.slice(Math.max(0, state.index - 2), state.index) : [];
  const flash = state?.lastPress && state.elapsed - state.lastPress.at < 320 ? state.lastPress.outcome : null;

  return (
    <PlayFrame>
      <Hud
        game={GAME}
        level={`${Math.round(60000 / settings.intervalMs)} digits/min`}
        progress={state ? { current: state.index, total: state.stream.length } : undefined}
        score={state ? `${state.hits} caught` : undefined}
        onPause={status === "running" ? pause : undefined}
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
        {counting ? (
          <Countdown onDone={onCountdownDone} />
        ) : state ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 p-5">
            {/* The two digits just gone, dimmed. They are the working memory the
                task is training, so showing them would defeat it — these are
                placeholders, not values. */}
            <div className="flex items-center gap-3" aria-hidden="true">
              {recent.map((_, i) => (
                <span key={i} className="size-2.5 rounded-full bg-[var(--border-strong)]" />
              ))}
            </div>

            <div
              key={state.index}
              className={cx(
                "anim-flash tnum grid size-40 place-items-center rounded-3xl border-2 text-[5.5rem] font-semibold leading-none transition-colors sm:size-48 sm:text-[7rem]",
                flash === "hit"
                  ? "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]"
                  : flash === "falseAlarm"
                    ? "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]"
                    : "border-[var(--border)] bg-[var(--surface)]",
              )}
              aria-live="off"
            >
              {digit ?? ""}
            </div>

            <button
              type="button"
              disabled={status !== "running"}
              onPointerDown={(e) => {
                e.preventDefault();
                respond();
              }}
              className="h-16 w-full max-w-[min(88vw,22rem)] rounded-2xl bg-[var(--accent)] text-[16px] font-semibold text-[var(--accent-text)] transition-transform active:scale-[0.98] disabled:opacity-40"
            >
              Sequence
            </button>

            <p className="text-[12px] text-[var(--text-faint)]">
              {TARGET_SEQUENCES.map((s) => s.join("-")).join("  ·  ")}
            </p>
          </div>
        ) : null}

        {status === "paused" ? <PauseOverlay game={GAME} onResume={resume} onRestart={again} /> : null}
      </div>
    </PlayFrame>
  );
}
