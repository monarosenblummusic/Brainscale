"use client";

import Link from "next/link";
import { type ComponentProps, type ReactNode, useId } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ Button */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all " +
  "disabled:pointer-events-none disabled:opacity-45 active:scale-[0.98] select-none";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--accent)] text-[var(--accent-text)] shadow-[var(--shadow-sm)] hover:bg-[var(--accent-hover)]",
  secondary:
    "bg-[var(--surface)] text-[var(--text)] border border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-subtle)]",
  ghost: "text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]",
  danger: "bg-[var(--danger)] text-white hover:opacity-90",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-[15px]",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={cx(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], className)} {...props} />;
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={cx(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], className)} {...props} />;
}

/* -------------------------------------------------------------------- Card */

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]",
        className,
      )}
      {...props}
    />
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4">
      <h2 className="text-[15px] font-semibold tracking-tight">{children}</h2>
      {hint ? <span className="text-[13px] text-[var(--text-faint)]">{hint}</span> : null}
    </div>
  );
}

/* ------------------------------------------------------------- Form pieces */

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-[var(--text)]">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-[var(--text-faint)]">{hint}</span> : null}
    </label>
  );
}

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; title?: string }[];
  label?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex w-full gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-1"
    >
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            "flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition",
            o.value === value
              ? "bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-sm)]"
              : "text-[var(--text-muted)] hover:text-[var(--text)]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  format,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-[var(--border)] accent-[var(--accent)]"
      />
      <span className="tnum w-16 shrink-0 text-right text-[13px] text-[var(--text-muted)]">
        {format ? format(value) : value}
      </span>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <label htmlFor={id} className="cursor-pointer">
        <span className="block text-[13px] font-medium">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-[var(--text-faint)]">{hint}</span> : null}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors",
          checked ? "bg-[var(--accent)]" : "bg-[var(--border-strong)]",
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------- Misc */

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-faint)]">{label}</div>
      <div className="tnum mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {sub ? <div className="mt-0.5 text-[13px] text-[var(--text-muted)]">{sub}</div> : null}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "success" }) {
  const tones = {
    neutral: "bg-[var(--bg-subtle)] text-[var(--text-muted)]",
    accent: "bg-[var(--accent-soft)] text-[var(--accent)]",
    success: "bg-[var(--success-soft)] text-[var(--success)]",
  };
  return (
    <span className={cx("inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium", tones[tone])}>
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-1.5 font-sans text-[11px] font-semibold text-[var(--text-muted)] shadow-[0_1px_0_var(--border-strong)]">
      {children}
    </kbd>
  );
}
