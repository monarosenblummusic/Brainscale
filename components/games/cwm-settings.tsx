"use client";

import { useGameSettings } from "@/lib/store/hooks";
import { CWM_DEFAULTS, GRID_CELLS, type CwmConfig } from "@/lib/engine/cwm";
import { Field, Slider } from "@/components/ui";

export function CwmSettings() {
  const { settings, update, loaded } = useGameSettings<CwmConfig>("complex-working-memory", CWM_DEFAULTS);
  if (!loaded) return <div className="h-48 animate-pulse rounded-xl bg-[var(--bg-subtle)]" />;

  return (
    <div className="flex flex-col gap-6">
      <Field label="Starting set size" hint="Cells to remember in the first block. Two perfect blocks promote you, two failures demote you.">
        <Slider
          min={2}
          max={8}
          value={settings.startLevel}
          onChange={(startLevel) => update({ startLevel })}
          format={(v) => `${v} cells`}
        />
      </Field>

      <Field label="Blocks per session" hint="How many blocks before the session ends.">
        <Slider
          min={4}
          max={20}
          value={settings.trials}
          onChange={(trials) => update({ trials })}
          format={(v) => `${v}`}
        />
      </Field>

      <Field
        label="Time to judge symmetry"
        hint="The cap is what makes the secondary task interfere. Given unlimited time you would simply rehearse the list while 'deciding', and the exercise would collapse into a plain spatial span."
      >
        <Slider
          min={2000}
          max={12000}
          step={500}
          value={settings.symmetryMs}
          onChange={(symmetryMs) => update({ symmetryMs })}
          format={(v) => `${(v / 1000).toFixed(1)}s`}
        />
      </Field>

      <Field label="Cell highlight time" hint={`How long each of the ${GRID_CELLS} grid cells stays lit.`}>
        <Slider
          min={300}
          max={1500}
          step={50}
          value={settings.highlightMs}
          onChange={(highlightMs) => update({ highlightMs })}
          format={(v) => `${(v / 1000).toFixed(2)}s`}
        />
      </Field>

      <Field label="Blank between items" hint="The gap after a cell before the next pattern appears.">
        <Slider
          min={200}
          max={1200}
          step={50}
          value={settings.blankMs}
          onChange={(blankMs) => update({ blankMs })}
          format={(v) => `${(v / 1000).toFixed(2)}s`}
        />
      </Field>
    </div>
  );
}
