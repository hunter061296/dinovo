import { useEffect, useRef, useState } from "react";
import { ACCENT_OPTIONS, useTheme, type ThemeMode } from "../lib/ThemeContext";

const MODE_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function ThemeToggle() {
  const { mode, accent, setMode, setAccent } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Theme settings"
        className="rounded-md border border-gray-300 p-2 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 9a1 1 0 100 2h1a1 1 0 100-2h-1zM4.464 4.343a1 1 0 00-1.414 1.414l.707.707a1 1 0 001.414-1.414l-.707-.707zM3 9a1 1 0 000 2H2a1 1 0 100-2h1zm2.343 6.657a1 1 0 001.414 0l.707-.707a1 1 0 00-1.414-1.414l-.707.707a1 1 0 000 1.414zM10 16a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1z" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-56 rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-800">
          <p className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">Appearance</p>
          <div className="mb-3 flex rounded-md border border-gray-300 p-0.5 dark:border-gray-600">
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setMode(opt.value)}
                className={`flex-1 rounded px-2 py-1 text-xs font-medium ${
                  mode === opt.value
                    ? "bg-accent-600 text-white"
                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <p className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">Accent color</p>
          <div className="flex gap-2">
            {ACCENT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setAccent(opt.value)}
                aria-label={opt.label}
                title={opt.label}
                className={`h-7 w-7 rounded-full ring-offset-2 ring-offset-white dark:ring-offset-gray-800 ${
                  accent === opt.value ? "ring-2 ring-gray-400 dark:ring-gray-300" : ""
                }`}
                style={{ backgroundColor: opt.swatch }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
