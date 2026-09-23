import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Toaster } from "sonner";
import { useAuth } from "../lib/AuthContext";
import type { Role } from "../lib/types";
import { ThemeToggle } from "./ThemeToggle";
import { QuickSearch } from "./QuickSearch";
import { SocketToasts } from "./SocketToasts";

// Mirrors the dark-mode resolution ThemeContext applies to <html> (mode === "dark", or "system"
// matching the OS), so toast styling follows the app's manual light/dark/system toggle rather
// than only the OS preference sonner's own theme="system" would use.
function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const observer = new MutationObserver(() => setIsDark(document.documentElement.classList.contains("dark")));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

const navItems: { to: string; label: string; roles: Role[] }[] = [
  { to: "/", label: "Dashboard", roles: ["ADMIN", "MANAGER", "HOST"] },
  { to: "/floor-plan", label: "Floor Plan", roles: ["ADMIN", "MANAGER", "HOST"] },
  { to: "/reservations", label: "Reservations", roles: ["ADMIN", "MANAGER", "HOST"] },
  { to: "/waitlist", label: "Waitlist", roles: ["ADMIN", "MANAGER", "HOST"] },
  { to: "/guests", label: "Guestbook", roles: ["ADMIN", "MANAGER", "HOST"] },
  { to: "/shifts", label: "Shifts & Pacing", roles: ["ADMIN", "MANAGER"] },
  { to: "/reports", label: "Reports", roles: ["ADMIN", "MANAGER"] },
  { to: "/users", label: "Users", roles: ["ADMIN"] },
];

export function Layout() {
  const { user, logout } = useAuth();
  const isDark = useIsDarkMode();
  if (!user) return null;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 dark:bg-gray-900">
      <SocketToasts />
      {/* Ambient background-event notifications (see SocketToasts) — short-lived, bottom-right,
          out of the way of the tablet-width layout's main content. */}
      <Toaster position="bottom-right" theme={isDark ? "dark" : "light"} duration={4000} />
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800 sm:px-6">
        <div className="flex items-center gap-6">
          <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">Dinovo</span>
          <nav className="flex flex-wrap gap-1">
            {navItems
              .filter((item) => item.roles.includes(user.role))
              .map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    `rounded-md px-3 py-2 text-sm font-medium ${
                      isActive
                        ? "bg-accent-100 text-accent-700 dark:bg-accent-800/40 dark:text-accent-300"
                        : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
          </nav>
        </div>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
          <QuickSearch />
          <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
            <span className="whitespace-nowrap">
              {user.name} <span className="text-gray-400 dark:text-gray-500">({user.role})</span>
            </span>
            <ThemeToggle />
            <button
              onClick={logout}
              className="whitespace-nowrap rounded-md border border-gray-300 px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 p-4 sm:p-6">
        <Outlet />
      </main>
    </div>
  );
}
