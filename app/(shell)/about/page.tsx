import type { Metadata } from "next";
import { GAMES } from "@/lib/games";
import { Card, SectionTitle } from "@/components/ui";

export const metadata: Metadata = {
  title: "About & the science",
  description:
    "What these exercises are, where they come from, and what the evidence does and does not support.",
};

export default function Page() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 lg:py-12">
      <h1 className="text-[26px] font-semibold tracking-tight sm:text-[30px]">About</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-[var(--text-muted)]">
        Every exercise here is a real paradigm from the cognitive-psychology literature, implemented to the
        published parameters rather than loosely inspired by them. Nothing is stored on a server: your
        sessions live in your own browser, and there is no account to make.
      </p>

      <section className="mt-9">
        <SectionTitle>Where each exercise comes from</SectionTitle>
        <Card className="divide-y divide-[var(--border)]">
          {GAMES.map((g) => (
            <div key={g.id} className="px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-[14px] font-semibold">{g.name}</h3>
                <span className="text-[12px] text-[var(--text-faint)]">{g.origin}</span>
              </div>
              <p className="mt-1 text-[13px] text-[var(--text-muted)]">{g.trains.join(" · ")}</p>
            </div>
          ))}
        </Card>
      </section>

      <section className="mt-9">
        <SectionTitle>An honest note on what training does</SectionTitle>
        <Card className="p-5">
          <p className="text-[14px] leading-relaxed text-[var(--text-muted)]">
            You will get better at these tasks. That much is not in question — practice reliably raises your
            n-back level and your span. Whether that improvement <em>transfers</em> to unrelated abilities is
            genuinely contested: the 2008 Jaeggi result reporting gains in fluid intelligence has had both
            replications and failures to replicate, and meta-analyses disagree with each other about how much
            of the effect survives once you account for control-group design.
          </p>
          <p className="mt-3 text-[14px] leading-relaxed text-[var(--text-muted)]">
            So train because the tasks are absorbing and the progress is measurable, and treat any broader
            claim with the scepticism it has earned. Nothing here will make you smarter by Tuesday.
          </p>
        </Card>
      </section>

      <section className="mt-9">
        <SectionTitle>Your data</SectionTitle>
        <Card className="p-5">
          <p className="text-[14px] leading-relaxed text-[var(--text-muted)]">
            Sessions and settings are held in your browser&rsquo;s IndexedDB, on this device only. Clearing
            site data erases them, and nothing syncs between devices. You can export everything as JSON, or
            delete it outright, from{" "}
            <a href="/settings" className="font-medium text-[var(--accent)] underline underline-offset-2">
              Settings
            </a>
            .
          </p>
        </Card>
      </section>
    </div>
  );
}
