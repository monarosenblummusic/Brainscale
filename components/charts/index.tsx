"use client";

import { useMemo } from "react";
import { dayKey } from "@/lib/store/repository";
import type { Session } from "@/lib/types";

/* ------------------------------------------------------- Activity heatmap */

/**
 * A calendar heat strip of the last `weeks` weeks, GitHub-style. Rendered as
 * inline SVG so it inherits theme tokens and needs no chart library.
 */
export function ActivityHeatmap({ sessions, weeks = 26 }: { sessions: Session[]; weeks?: number }) {
  const { cells, max } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sessions) counts.set(dayKey(s.startedAt), (counts.get(dayKey(s.startedAt)) ?? 0) + 1);

    // End on the Saturday of the current week so columns are whole weeks.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setDate(end.getDate() + (6 - end.getDay()));

    const out: { key: string; count: number; date: Date; inFuture: boolean }[] = [];
    const total = weeks * 7;
    for (let i = total - 1; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(d.getDate() - i);
      const key = dayKey(d);
      out.push({ key, count: counts.get(key) ?? 0, date: d, inFuture: d > today });
    }
    return { cells: out, max: Math.max(1, ...counts.values()) };
  }, [sessions, weeks]);

  const size = 11;
  const gap = 3;
  const w = weeks * (size + gap) - gap;
  const h = 7 * (size + gap) - gap;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        className="min-w-full"
        role="img"
        aria-label={`Training activity over the last ${weeks} weeks`}
      >
        {cells.map((c, i) => {
          const col = Math.floor(i / 7);
          const row = i % 7;
          const intensity = c.count === 0 ? 0 : 0.25 + 0.75 * Math.min(1, c.count / max);
          return (
            <rect
              key={c.key}
              x={col * (size + gap)}
              y={row * (size + gap)}
              width={size}
              height={size}
              rx={2.5}
              fill={c.count === 0 ? "var(--bg-subtle)" : "var(--accent)"}
              opacity={c.inFuture ? 0.25 : c.count === 0 ? 1 : intensity}
            >
              <title>{`${c.key}: ${c.count} session${c.count === 1 ? "" : "s"}`}</title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}

/* ----------------------------------------------------------- Progress line */

/**
 * Level (or any single metric) over time. Points are evenly spaced by index
 * rather than by timestamp — sessions are what the player did, and spacing by
 * clock time would compress a busy week into an unreadable smear.
 */
export function ProgressLine({
  values,
  label,
  height = 120,
}: {
  values: number[];
  label: string;
  height?: number;
}) {
  if (values.length < 2) {
    return (
      <div
        className="grid place-items-center rounded-xl border border-dashed border-[var(--border)] text-[13px] text-[var(--text-faint)]"
        style={{ height }}
      >
        Play at least twice to see a trend
      </div>
    );
  }

  const w = 600;
  const pad = 8;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (values.length - 1)) * (w - pad * 2);
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);

  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(values.length - 1).toFixed(1)},${height} L${x(0).toFixed(1)},${height} Z`;
  const last = values[values.length - 1]!;

  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      className="w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label={`${label}: ${values.length} sessions, from ${values[0]} to ${last}`}
      style={{ height }}
    >
      <defs>
        <linearGradient id="pl-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#pl-fill)" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(values.length - 1)} cy={y(last)} r="3.5" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
    </svg>
  );
}

/* ------------------------------------------------------------- Goal ring */

export function GoalRing({ value, goal, size = 64 }: { value: number; goal: number; size?: number }) {
  const pct = Math.min(1, goal === 0 ? 0 : value / goal);
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${value} of ${goal} sessions today`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-subtle)" strokeWidth="5" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={pct >= 1 ? "var(--success)" : "var(--accent)"}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${(c * pct).toFixed(2)} ${c.toFixed(2)}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        className="tnum"
        fontSize={size * 0.28}
        fontWeight="600"
        fill="var(--text)"
      >
        {value}
      </text>
    </svg>
  );
}
