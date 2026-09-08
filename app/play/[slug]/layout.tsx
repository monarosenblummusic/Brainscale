/**
 * The play environment deliberately has no shell: no sidebar, no top bar, no
 * links out. Everything competing with the stimulus for attention is removed,
 * and the only way out is the explicit exit control in the HUD.
 */
export default function PlayLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-[var(--bg)]">{children}</div>;
}
