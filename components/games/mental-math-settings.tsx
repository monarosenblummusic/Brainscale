"use client";

import { useGameSettings } from "@/lib/store/hooks";
import { MENTAL_MATH_DEFAULTS, OPERATION_LABEL, type MentalMathConfig } from "@/lib/engine/mental-math";
import { Field, Segmented, Slider, Toggle } from "@/components/ui";

export function MentalMathSettings() {
  const { settings, update, loaded } = useGameSettings<MentalMathConfig>("mental-math", MENTAL_MATH_DEFAULTS);
  if (!loaded) return <div className="h-48 animate-pulse rounded-xl bg-[var(--bg-subtle)]" />;

  return (
    <div className="flex flex-col gap-6">
      <Field label="Operation" hint="Mix shuffles all four so you cannot anticipate the next one.">
        <Segmented
          label="Operation"
          value={settings.operation}
          onChange={(operation) => update({ operation })}
          options={(["mix", "add", "subtract", "multiply", "divide"] as const).map((op) => ({
            value: op,
            label: op === "mix" ? "Mix" : OPERATION_LABEL[op].slice(0, 3),
            title: OPERATION_LABEL[op],
          }))}
        />
      </Field>

      <Field label="Session" hint="A timed round, or a fixed number of problems.">
        <Segmented
          label="Session"
          value={settings.durationSec}
          onChange={(durationSec) => update({ durationSec })}
          options={[
            { value: 60, label: "60s" },
            { value: 120, label: "2 min" },
            { value: 300, label: "5 min" },
            { value: 0, label: "Fixed count" },
          ]}
        />
      </Field>

      {settings.durationSec === 0 ? (
        <Field label="Problems" hint="How many before the session ends.">
          <Slider
            min={10}
            max={50}
            step={5}
            value={settings.problemCount}
            onChange={(problemCount) => update({ problemCount })}
          />
        </Field>
      ) : null}

      <Field label="Left operand digits" hint="Starting size. Adapts on its own unless you turn that off.">
        <Slider min={1} max={5} value={settings.leftDigits} onChange={(leftDigits) => update({ leftDigits })} />
      </Field>

      <Field label="Right operand digits" hint="Tracked separately, so your weak side does not hold the other back.">
        <Slider min={1} max={5} value={settings.rightDigits} onChange={(rightDigits) => update({ rightDigits })} />
      </Field>

      <Field
        label="Fast answer threshold"
        hint="Answers quicker than this count toward promotion. Accuracy alone would let a slow, careful player climb until nothing was solvable in the time."
      >
        <Slider
          min={2000}
          max={15000}
          step={500}
          value={settings.fastMs}
          onChange={(fastMs) => update({ fastMs })}
          format={(v) => `${(v / 1000).toFixed(1)}s`}
        />
      </Field>

      <div className="border-t border-[var(--border)] pt-4">
        <Toggle
          label="Adaptive difficulty"
          hint="Grow the operands after four fast, correct answers; shrink after two failures."
          checked={settings.adaptive}
          onChange={(adaptive) => update({ adaptive })}
        />
      </div>
    </div>
  );
}
