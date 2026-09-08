"use client";

import { useGameSettings } from "@/lib/store/hooks";
import { ISI_LADDER, PASAT_DEFAULTS, type PasatConfig } from "@/lib/engine/pasat";
import { Field, Segmented, Slider, Toggle } from "@/components/ui";

export function PasatSettings() {
  const { settings, update, loaded } = useGameSettings<PasatConfig>("pasat", PASAT_DEFAULTS);
  if (!loaded) return <div className="h-48 animate-pulse rounded-xl bg-[var(--bg-subtle)]" />;

  return (
    <div className="flex flex-col gap-6">
      <Field label="Pace" hint="The four intervals the standard protocol uses. Adaptive mode moves you between them.">
        <Segmented
          label="Pace"
          value={settings.isiLevel}
          onChange={(isiLevel) => update({ isiLevel })}
          options={ISI_LADDER.map((ms, i) => ({ value: i, label: `${(ms / 1000).toFixed(1)}s` }))}
        />
      </Field>

      <Field label="Digits per run" hint="The classic protocol uses 61 digits, giving 60 sums.">
        <Slider
          min={21}
          max={61}
          step={10}
          value={settings.digits}
          onChange={(digits) => update({ digits })}
          format={(v) => `${v - 1} sums`}
        />
      </Field>

      <div className="flex flex-col gap-1 border-t border-[var(--border)] pt-4">
        <Toggle
          label="Speak the digits"
          hint="The original test is auditory, and hearing is meaningfully harder than reading."
          checked={settings.audio}
          onChange={(audio) => update({ audio })}
        />
        <Toggle
          label="Show the digits"
          hint="Turn this off for the pure auditory version. Leave it on if your browser has no speech voice."
          checked={settings.visual}
          onChange={(visual) => update({ visual })}
        />
        <Toggle
          label="Adaptive pace"
          hint="Above 85% the pace quickens; below 50% it eases back."
          checked={settings.adaptive}
          onChange={(adaptive) => update({ adaptive })}
        />
      </div>
    </div>
  );
}
