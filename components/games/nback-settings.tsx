"use client";

import { useGameSettings } from "@/lib/store/hooks";
import { NBACK_PREFS, type NBackPrefs } from "@/components/games/nback-play";
import { MODALITIES, MODALITY_LABEL, trialsForLevel, type Modality } from "@/lib/engine/nback";
import { POLICY_LIST } from "@/lib/engine/adaptive";
import { Field, Segmented, Slider, Toggle, cx } from "@/components/ui";

/** Named presets, because "dual" and "quad" are how players actually think. */
const PRESETS: { label: string; modalities: Modality[] }[] = [
  { label: "Dual", modalities: ["position", "audio"] },
  { label: "Triple", modalities: ["position", "audio", "color"] },
  { label: "Quad", modalities: ["position", "audio", "color", "shape"] },
];

export function NBackSettings() {
  const { settings, update, loaded } = useGameSettings<NBackPrefs>("n-back", NBACK_PREFS);
  if (!loaded) return <div className="h-64 animate-pulse rounded-xl bg-[var(--bg-subtle)]" />;

  const toggleModality = (m: Modality) => {
    const has = settings.modalities.includes(m);
    // At least one channel must stay on, or there is nothing to respond to.
    if (has && settings.modalities.length === 1) return;
    const next = has ? settings.modalities.filter((x) => x !== m) : [...settings.modalities, m];
    update({ modalities: MODALITIES.filter((x) => next.includes(x)) });
  };

  const presetMatch = PRESETS.find(
    (p) => p.modalities.length === settings.modalities.length && p.modalities.every((m) => settings.modalities.includes(m)),
  );

  return (
    <div className="flex flex-col gap-6">
      <Field label="Modalities" hint="What you have to keep track of at once. Each one adds a response key.">
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => update({ modalities: p.modalities })}
                className={cx(
                  "rounded-lg border px-3 py-1.5 text-[13px] font-medium transition",
                  presetMatch?.label === p.label
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {MODALITIES.map((m) => {
              const on = settings.modalities.includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggleModality(m)}
                  className={cx(
                    "flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left transition",
                    on
                      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                      : "border-[var(--border)] hover:border-[var(--border-strong)]",
                  )}
                >
                  <span className={cx("text-[13px] font-medium", on ? "text-[var(--accent)]" : "text-[var(--text)]")}>
                    {MODALITY_LABEL[m]}
                  </span>
                  <span className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">
                    key {settings.keys[m]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </Field>

      <Field
        label="Training mode"
        hint={POLICY_LIST.find((p) => p.id === settings.policy)?.description}
      >
        <Segmented
          label="Training mode"
          value={settings.policy}
          onChange={(policy) => update({ policy })}
          options={POLICY_LIST.map((p) => ({ value: p.id, label: p.name, title: p.description }))}
        />
      </Field>

      {settings.policy === "manual" ? (
        <Field label="N level" hint={`${trialsForLevel(settings.n)} trials per block at this level.`}>
          <Slider min={1} max={12} value={settings.n} onChange={(n) => update({ n })} format={(v) => `${v}-back`} />
        </Field>
      ) : null}

      <Field label="Trial time" hint="How long each stimulus stays on screen before the next arrives.">
        <Slider
          min={1500}
          max={5000}
          step={100}
          value={settings.trialMs}
          onChange={(trialMs) => update({ trialMs })}
          format={(v) => `${(v / 1000).toFixed(1)}s`}
        />
      </Field>

      <Field label="Audio channel" hint="Spoken letters keep the task verbal; tones work everywhere.">
        <Segmented
          label="Audio channel"
          value={settings.audioMode}
          onChange={(audioMode) => update({ audioMode })}
          options={[
            { value: "speech" as const, label: "Spoken letters" },
            { value: "tones" as const, label: "Tones" },
          ]}
        />
      </Field>

      <div className="flex flex-col gap-1 border-t border-[var(--border)] pt-4">
        <Toggle
          label="Per-trial feedback"
          hint="Flash correct or incorrect the moment you respond. Turn it off for a cleaner score."
          checked={settings.feedback}
          onChange={(feedback) => update({ feedback })}
        />
        <Toggle
          label="Dynamic pacing"
          hint="Shorten the trial as N rises, so each level is harder in two ways at once."
          checked={settings.dynamicPacing}
          onChange={(dynamicPacing) => update({ dynamicPacing })}
        />
        <Toggle
          label="Distinct shapes for colours"
          hint="Give every colour its own outline shape, so the colour channel does not depend on colour vision."
          checked={settings.shapeRedundancy}
          onChange={(shapeRedundancy) => update({ shapeRedundancy })}
        />
      </div>
    </div>
  );
}
