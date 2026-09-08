"use client";

import { useGameSettings } from "@/lib/store/hooks";
import { CRYPTOGRAM_DEFAULTS, type CryptogramConfig } from "@/lib/engine/cryptogram";
import { Field, Segmented, Toggle } from "@/components/ui";

export function CryptogramSettings() {
  const { settings, update, loaded } = useGameSettings<CryptogramConfig>("cryptogram", CRYPTOGRAM_DEFAULTS);
  if (!loaded) return <div className="h-32 animate-pulse rounded-xl bg-[var(--bg-subtle)]" />;

  return (
    <div className="flex flex-col gap-6">
      <Field label="Difficulty" hint="How many letter–number pairings are given to start you off.">
        <Segmented
          label="Difficulty"
          value={settings.difficulty}
          onChange={(difficulty) => update({ difficulty })}
          options={[
            { value: "easy" as const, label: "Easy", title: "About 45% of letters given" },
            { value: "medium" as const, label: "Medium", title: "About 28% of letters given" },
            { value: "hard" as const, label: "Hard", title: "About 14% of letters given" },
          ]}
        />
      </Field>

      <div className="border-t border-[var(--border)] pt-4">
        <Toggle
          label="Daily puzzle"
          hint="One puzzle per day, the same for everyone, chosen by the date. Turn it off for an endless run of new ones."
          checked={settings.daily}
          onChange={(daily) => update({ daily })}
        />
      </div>
    </div>
  );
}
