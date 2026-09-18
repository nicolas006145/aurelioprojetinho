import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function useTheme() {
  const [theme, setTheme] = useState(
    () => localStorage.getItem("aurelio_theme") || "dark"
  );
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("aurelio_theme", theme);
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) };
}

export function ThemeToggle({ theme, toggle }) {
  return (
    <button
      data-testid="theme-toggle-button"
      onClick={toggle}
      className="grid place-items-center h-9 w-9 rounded-full border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--terracotta)] hover:border-[var(--border-accent)] transition-colors"
      aria-label="Alternar tema"
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
