/** Inline SVG icons. No icon library — seven glyphs is not worth a dependency. */

const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function GameIcon({ name, className = "size-5" }: { name: string; className?: string }) {
  const common = { viewBox: "0 0 24 24", className, "aria-hidden": true as const, ...S };
  switch (name) {
    case "grid":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
        </svg>
      );
    case "layers":
      return (
        <svg {...common}>
          <path d="m12 2 9 5-9 5-9-5 9-5Z" />
          <path d="m3 12 9 5 9-5M3 17l9 5 9-5" />
        </svg>
      );
    case "sequence":
      return (
        <svg {...common}>
          <rect x="2" y="8" width="5" height="8" rx="1.5" />
          <rect x="9.5" y="8" width="5" height="8" rx="1.5" />
          <rect x="17" y="8" width="5" height="8" rx="1.5" />
        </svg>
      );
    case "blocks":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="6" height="6" rx="1.5" />
          <rect x="15" y="5" width="6" height="6" rx="1.5" />
          <rect x="5" y="14" width="6" height="6" rx="1.5" />
          <rect x="15" y="15" width="5" height="5" rx="1.5" />
        </svg>
      );
    case "pulse":
      return (
        <svg {...common}>
          <path d="M2 12h4l3-8 4 16 3-8h6" />
        </svg>
      );
    case "calculator":
      return (
        <svg {...common}>
          <rect x="4" y="2" width="16" height="20" rx="2" />
          <path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15v4M8 19h4" />
        </svg>
      );
    case "cipher":
      return (
        <svg {...common}>
          <path d="M4 7V5h16v2M9 19h6M12 5v14" />
          <circle cx="18.5" cy="16.5" r="2.5" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
  }
}

export function ChevronRight({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...S}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function FlameIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...S}>
      <path d="M12 2c1 4 4 5 4 9a4 4 0 0 1-8 0c0-1.5.5-2.5 1-3.5C9.5 9.5 8 11 8 13a4 4 0 0 0 8 0" />
      <path d="M12 22a6 6 0 0 0 6-6c0-4-3-6-4-10-1 2-2 3-3 4-2 2-5 3-5 6a6 6 0 0 0 6 6Z" />
    </svg>
  );
}
