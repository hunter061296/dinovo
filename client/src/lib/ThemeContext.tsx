import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type AccentColor = "indigo" | "blue" | "emerald" | "rose" | "amber";

export const ACCENT_OPTIONS: { value: AccentColor; label: string; swatch: string }[] = [
  { value: "indigo", label: "Indigo", swatch: "#4f46e5" },
  { value: "blue", label: "Blue", swatch: "#2563eb" },
  { value: "emerald", label: "Emerald", swatch: "#059669" },
  { value: "rose", label: "Rose", swatch: "#e11d48" },
  { value: "amber", label: "Amber", swatch: "#d97706" },
];

const MODE_KEY = "dinovo_theme_mode";
const ACCENT_KEY = "dinovo_theme_accent";

interface ThemeContextValue {
  mode: ThemeMode;
  accent: AccentColor;
  setMode: (mode: ThemeMode) => void;
  setAccent: (accent: AccentColor) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function readStoredMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(MODE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // localStorage can throw in private-browsing/blocked-storage contexts — fall back silently.
  }
  return "system";
}

function readStoredAccent(): AccentColor {
  try {
    const stored = localStorage.getItem(ACCENT_KEY);
    if (ACCENT_OPTIONS.some((o) => o.value === stored)) return stored as AccentColor;
  } catch {
    // Same as above.
  }
  return "indigo";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode);
  const [accent, setAccentState] = useState<AccentColor>(readStoredAccent);

  // Resolves "system" against the OS preference and keeps it live if that preference changes
  // while the app is open (e.g. the device switches to dark mode automatically at sunset).
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const isDark = mode === "dark" || (mode === "system" && media.matches);
      document.documentElement.classList.toggle("dark", isDark);
    };
    apply();
    if (mode === "system") {
      media.addEventListener("change", apply);
      return () => media.removeEventListener("change", apply);
    }
  }, [mode]);

  useEffect(() => {
    document.documentElement.dataset.accent = accent;
  }, [accent]);

  function setMode(next: ThemeMode) {
    setModeState(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      // Preference just won't persist across reloads — not worth failing over.
    }
  }

  function setAccent(next: AccentColor) {
    setAccentState(next);
    try {
      localStorage.setItem(ACCENT_KEY, next);
    } catch {
      // Same as above.
    }
  }

  return <ThemeContext.Provider value={{ mode, accent, setMode, setAccent }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
