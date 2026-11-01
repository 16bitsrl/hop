import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";
const KEY = "hop-theme";
const listeners = new Set<() => void>();

export function getTheme(): Theme {
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : "system";
}

function apply(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function setTheme(theme: Theme) {
  localStorage.setItem(KEY, theme);
  apply(theme);
  listeners.forEach((l) => l());
}

matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => apply(getTheme()));

export function useTheme(): [Theme, (t: Theme) => void] {
  const theme = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getTheme,
    () => "system" as Theme,
  );
  return [theme, setTheme];
}
