"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

type Theme = "light" | "dark";
interface DarkModeCtx { theme: Theme; toggle: () => void }

const Ctx = createContext<DarkModeCtx>({ theme: "light", toggle: () => {} });

export function useDarkMode() { return useContext(Ctx); }

export function DarkModeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("outreach-theme") as Theme | null;
    if (stored === "dark") {
      setTheme("dark");
      document.documentElement.classList.add("dark");
    }
    setMounted(true);
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      localStorage.setItem("outreach-theme", next);
      if (next === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
      return next;
    });
  }, []);

  // Prevent flash of wrong theme
  if (!mounted) return <>{children}</>;

  return <Ctx.Provider value={{ theme, toggle }}>{children}</Ctx.Provider>;
}

export function DarkModeToggle() {
  const { theme, toggle } = useDarkMode();

  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
      className="fixed bottom-5 right-5 z-50 p-3 rounded-full shadow-lg print:hidden
        bg-white dark:bg-slate-800
        border border-gray-200 dark:border-slate-600
        hover:shadow-xl hover:scale-105
        active:scale-95
        transition-all duration-200"
    >
      {theme === "light" ? (
        <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      ) : (
        <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      )}
    </button>
  );
}
