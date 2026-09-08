"use client";

import { useGameSettings } from "@/lib/store/hooks";
import type { SequenceConfig } from "@/lib/engine/sequence";
import { CORSI_DEFAULTS, MEMORY_SPAN_DEFAULTS } from "@/lib/engine/sequence";
import { Field, Segmented, Slider } from "@/components/ui";
import type { GameId } from "@/lib/types";

function SequenceSettings({
  gameId,
  defaults,
  showAlphabet,
}: {
  gameId: Extract<GameId, "memory-span" | "corsi">;
  defaults: SequenceConfig;
  showAlphabet: boolean;
}) {
  const { settings, update, loaded } = useGameSettings<SequenceConfig>(gameId, defaults);
  if (!loaded) return <div className="h-48 animate-pulse rounded-xl bg-[var(--bg-subtle)]" />;

  return (
    <div className="flex flex-col gap-6">
      <Field
        label="Direction"
        hint="Reverse turns storage into manipulation — you have to hold the sequence and re-read it backwards. Expect it to cost you a point or two of span."
      >
        <Segmented
          label="Direction"
          value={settings.direction}
          onChange={(direction) => update({ direction })}
          options={[
            { value: "forward" as const, label: "Forward" },
            { value: "reverse" as const, label: "Reverse" },
          ]}
        />
      </Field>

      {showAlphabet ? (
        <Field label="Items" hint="Letters are marginally harder than digits: there are more of them to confuse.">
          <Segmented
            label="Items"
            value={settings.alphabet}
            onChange={(alphabet) => update({ alphabet })}
            options={[
              { value: 10, label: "Digits" },
              { value: 26, label: "Letters" },
            ]}
          />
        </Field>
      ) : null}

      <Field label="Starting length" hint="Where each run begins. Start below your span so the first trials are warm-up.">
        <Slider
          min={2}
          max={9}
          value={settings.startLength}
          onChange={(startLength) => update({ startLength })}
          format={(v) => `${v} items`}
        />
      </Field>

      <Field label="Item display time" hint="How long each item stays visible.">
        <Slider
          min={300}
          max={1600}
          step={50}
          value={settings.showMs}
          onChange={(showMs) => update({ showMs })}
          format={(v) => `${(v / 1000).toFixed(2)}s`}
        />
      </Field>

      <Field label="Gap between items" hint="The blank between items. Too short and two items blur into one.">
        <Slider
          min={100}
          max={1000}
          step={50}
          value={settings.gapMs}
          onChange={(gapMs) => update({ gapMs })}
          format={(v) => `${(v / 1000).toFixed(2)}s`}
        />
      </Field>
    </div>
  );
}

export function MemorySpanSettings() {
  return <SequenceSettings gameId="memory-span" defaults={MEMORY_SPAN_DEFAULTS} showAlphabet />;
}

export function CorsiSettings() {
  return <SequenceSettings gameId="corsi" defaults={CORSI_DEFAULTS} showAlphabet={false} />;
}
