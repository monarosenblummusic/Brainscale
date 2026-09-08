"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: "system",
  setTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

/** Applied before paint by an inline script so there is no light-mode flash. */
export const themeScript = `
(function(){try{
  var t=localStorage.getItem('brainscale-theme')||'system';
  if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);
}catch(e){}})();
`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("brainscale-theme") as Theme | null;
      if (stored) setThemeState(stored);
    } catch {
      /* storage blocked — stay on system */
    }
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem("brainscale-theme", next);
    } catch {
      /* ignore */
    }
    const root = document.documentElement;
    if (next === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", next);
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const order: Theme[] = ["system", "light", "dark"];
  const label = { system: "System theme", light: "Light theme", dark: "Dark theme" }[theme];

  return (
    <button
      type="button"
      onClick={() => setTheme(order[(order.indexOf(theme) + 1) % order.length]!)}
      className="grid size-9 place-items-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]"
      title={label}
      aria-label={label}
    >
      {theme === "dark" ? (
        <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      ) : theme === "light" ? (
        <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="4" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 18v3" />
        </svg>
      )}
    </button>
  );
}
