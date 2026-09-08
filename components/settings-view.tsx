"use client";

import { useEffect, useRef, useState } from "react";
import { store, isPersistent } from "@/lib/store/indexeddb";
import type { ExportBundle } from "@/lib/store/repository";
import { useSessions } from "@/lib/store/hooks";
import { useTheme } from "@/components/ui/theme";
import { Button, Card, Field, SectionTitle, Segmented } from "@/components/ui";

type Notice = { tone: "ok" | "bad"; text: string } | null;

export function SettingsView() {
  const { theme, setTheme } = useTheme();
  const { sessions, refresh } = useSessions();
  const [notice, setNotice] = useState<Notice>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [persistent, setPersistent] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Only meaningful once a read has actually been attempted.
    if (sessions !== null) setPersistent(isPersistent());
  }, [sessions]);

  const exportData = async () => {
    try {
      const bundle = await store.exportAll();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `brainscale-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice({ tone: "ok", text: `Exported ${bundle.sessions.length} sessions.` });
    } catch {
      setNotice({ tone: "bad", text: "Export failed." });
    }
  };

  const importData = async (file: File) => {
    try {
      const bundle = JSON.parse(await file.text()) as ExportBundle;
      if (bundle.version !== 1 || !Array.isArray(bundle.sessions)) {
        setNotice({ tone: "bad", text: "That does not look like a BrainScale export." });
        return;
      }
      await store.importAll(bundle, "merge");
      refresh();
      setNotice({ tone: "ok", text: `Imported ${bundle.sessions.length} sessions.` });
    } catch {
      setNotice({ tone: "bad", text: "Could not read that file." });
    }
  };

  const resetAll = async () => {
    await store.sessions.clear();
    await store.settings.clear();
    refresh();
    setConfirmingReset(false);
    setNotice({ tone: "ok", text: "All data deleted." });
  };

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:px-8 lg:py-12">
      <h1 className="text-[26px] font-semibold tracking-tight sm:text-[30px]">Settings</h1>

      {notice ? (
        <div
          className={`mt-5 rounded-xl px-4 py-3 text-[13px] font-medium ${
            notice.tone === "ok"
              ? "bg-[var(--success-soft)] text-[var(--success)]"
              : "bg-[var(--danger-soft)] text-[var(--danger)]"
          }`}
          role="status"
        >
          {notice.text}
        </div>
      ) : null}

      <section className="mt-8">
        <SectionTitle>Appearance</SectionTitle>
        <Card className="p-5">
          <Field label="Theme" hint="System follows your device setting.">
            <Segmented
              label="Theme"
              value={theme}
              onChange={setTheme}
              options={[
                { value: "system" as const, label: "System" },
                { value: "light" as const, label: "Light" },
                { value: "dark" as const, label: "Dark" },
              ]}
            />
          </Field>
        </Card>
      </section>

      <section className="mt-8">
        <SectionTitle hint={sessions ? `${sessions.length} sessions` : undefined}>Your data</SectionTitle>
        <Card className="p-5">
          <p className="text-[14px] leading-relaxed text-[var(--text-muted)]">
            Everything is stored in this browser, on this device. Nothing is sent anywhere, and there is no
            account. Clearing site data will erase it, so export first if you want to keep it.
          </p>

          {!persistent ? (
            <p className="mt-4 rounded-lg bg-[var(--danger-soft)] px-3.5 py-2.5 text-[13px] text-[var(--danger)]">
              This browser is blocking persistent storage, so sessions will be lost when you close the tab.
              Private-browsing windows and blocked site data are the usual causes. Games still work.
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={exportData}>
              Export as JSON
            </Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              Import
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importData(file);
                e.target.value = "";
              }}
            />
          </div>
        </Card>
      </section>

      <section className="mt-8">
        <SectionTitle>Danger zone</SectionTitle>
        <Card className="border-[var(--danger)]/30 p-5">
          <p className="text-[14px] text-[var(--text-muted)]">
            Delete every session and every per-exercise setting. This cannot be undone.
          </p>
          <div className="mt-4 flex gap-2">
            {confirmingReset ? (
              <>
                <Button variant="danger" onClick={resetAll}>
                  Yes, delete everything
                </Button>
                <Button variant="ghost" onClick={() => setConfirmingReset(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button variant="secondary" onClick={() => setConfirmingReset(true)}>
                Delete all data
              </Button>
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}
