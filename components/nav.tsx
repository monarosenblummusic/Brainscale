"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CASUAL_GAMES, TRAINING_GAMES } from "@/lib/games";
import { GameIcon } from "@/components/ui/icons";
import { ThemeToggle } from "@/components/ui/theme";
import { cx } from "@/components/ui";

const LINKS = [
  { href: "/", label: "Dashboard", icon: "home" },
  { href: "/stats", label: "Statistics", icon: "chart" },
  { href: "/settings", label: "Settings", icon: "cog" },
];

function NavIcon({ name }: { name: string }) {
  const p = { viewBox: "0 0 24 24", className: "size-[18px]", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  if (name === "home") return <svg {...p}><path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><path d="M9 22V12h6v10" /></svg>;
  if (name === "chart") return <svg {...p}><path d="M3 3v18h18" /><path d="m7 14 4-4 3 3 5-6" /></svg>;
  return <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></svg>;
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
      <span className="grid size-8 place-items-center rounded-lg bg-[var(--accent)] text-[var(--accent-text)]">
        <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 5a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8A3 3 0 0 0 12 19a3 3 0 0 0 4-5.2A3 3 0 0 0 15 8a3 3 0 0 0-3-3Z" />
          <path d="M12 5v14" />
        </svg>
      </span>
      <span className="text-[15px]">BrainScale</span>
    </Link>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const item = (href: string, label: string, icon: React.ReactNode, active: boolean) => (
    <Link
      key={href}
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] transition",
        active
          ? "bg-[var(--accent-soft)] font-medium text-[var(--accent)]"
          : "text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]",
      )}
    >
      {icon}
      {label}
    </Link>
  );

  return (
    <nav className="flex flex-col gap-6">
      <div className="flex flex-col gap-0.5">
        {LINKS.map((l) => item(l.href, l.label, <NavIcon name={l.icon} />, isActive(l.href)))}
      </div>

      <div className="flex flex-col gap-0.5">
        <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
          Brain training
        </p>
        {TRAINING_GAMES.map((g) =>
          item(`/games/${g.id}`, g.name, <GameIcon name={g.icon} className="size-[18px]" />, isActive(`/games/${g.id}`)),
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
          Brain games
        </p>
        {CASUAL_GAMES.map((g) =>
          item(`/games/${g.id}`, g.name, <GameIcon name={g.icon} className="size-[18px]" />, isActive(`/games/${g.id}`)),
        )}
      </div>
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-[var(--border)] bg-[var(--surface)] px-4 py-5 lg:flex">
        <div className="mb-7 flex items-center justify-between pl-1">
          <Brand />
          <ThemeToggle />
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavList />
        </div>
        <Link href="/about" className="px-3 pt-4 text-xs text-[var(--text-faint)] transition hover:text-[var(--text-muted)]">
          About & science
        </Link>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)]/85 px-4 py-3 backdrop-blur-md lg:hidden">
        <Brand />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="grid size-9 place-items-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--bg-subtle)]"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {open ? <path d="M18 6 6 18M6 6l12 12" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
            </svg>
          </button>
        </div>
      </header>

      {open ? (
        <div className="fixed inset-x-0 top-[57px] bottom-0 z-30 overflow-y-auto border-b border-[var(--border)] bg-[var(--surface)] px-4 py-5 lg:hidden">
          <NavList onNavigate={() => setOpen(false)} />
        </div>
      ) : null}

      <main className="min-w-0">{children}</main>
    </div>
  );
}
