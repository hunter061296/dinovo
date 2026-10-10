import { useEffect, useRef, useState } from "react";
import { MiniCalendar } from "./reservations/MiniCalendar";

export function todayLocalISODate() {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

function shiftDate(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

function formatDateHeading(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

interface Props {
  date: string; // YYYY-MM-DD
  onChange: (date: string) => void;
}

// Prev/next day arrows + a clickable date label opening a MiniCalendar popover — shared by the
// Floor Plan and Reservation Book so browsing a date works identically on both.
export function DateSwitcher({ date, onChange }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(shiftDate(date, -1))}
        aria-label="Previous day"
        className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 010 1.06L8.06 11l4.73 4.71a.75.75 0 11-1.06 1.06l-5.25-5.25a.75.75 0 010-1.06l5.25-5.25a.75.75 0 011.06 0z" clipRule="evenodd" />
        </svg>
      </button>

      <div ref={pickerRef} className="relative">
        <button
          onClick={() => setPickerOpen((o) => !o)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          {date === todayLocalISODate() ? "Today" : formatDateHeading(date)}
        </button>
        {pickerOpen && (
          <div className="absolute left-1/2 top-full z-10 mt-1 w-64 -translate-x-1/2 rounded-md border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-600 dark:bg-gray-700">
            <MiniCalendar
              selected={date}
              onSelect={(d) => {
                onChange(d);
                setPickerOpen(false);
              }}
            />
          </div>
        )}
      </div>

      <button
        onClick={() => onChange(shiftDate(date, 1))}
        aria-label="Next day"
        className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 010-1.06L11.94 9 7.21 4.29a.75.75 0 111.06-1.06l5.25 5.25a.75.75 0 010 1.06l-5.25 5.25a.75.75 0 01-1.06 0z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
}
