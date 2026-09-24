import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { useAuth } from "../lib/AuthContext";
import type { Role } from "../lib/types";
import { DURATION, useMotionDuration } from "../lib/motion";
import { ThemeToggle } from "./ThemeToggle";
import { QuickSearch } from "./QuickSearch";
import { ModalCloseButton } from "./Modal";

const navItems: { to: string; label: string; roles: Role[] }[] = [
  { to: "/", label: "Dashboard", roles: ["ADMIN", "MANAGER", "HOST"] },
  { to: "/floor-plan", label: "Floor Plan", roles: ["ADMIN", "MANAGER", "HOST"] },
  { to: "/reservations", label: "Reservations", roles: ["ADMIN", "MANAGER", "HOST"] },
  { to: "/waitlist", label: "Waitlist", roles: ["ADMIN", "MANAGER", "HOST"] },
  { to: "/guests", label: "Guestbook", roles: ["ADMIN", "MANAGER", "HOST"] },
  { to: "/floor-plan/settings", label: "Availability Planning", roles: ["ADMIN", "MANAGER"] },
  { to: "/shifts", label: "Shifts & Pacing", roles: ["ADMIN", "MANAGER"] },
  { to: "/reports", label: "Reports", roles: ["ADMIN", "MANAGER"] },
  { to: "/users", label: "Users", roles: ["ADMIN"] },
];

function HamburgerIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
      <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10zm0 5.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
    </svg>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const backdropDuration = useMotionDuration(DURATION.fast);
  const panelDuration = useMotionDuration(DURATION.normal);

  if (!user) return null;

  const visibleItems = navItems.filter((item) => item.roles.includes(user.role));

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <HamburgerIcon />
          </button>
          <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">Dinovo</span>
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

      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              key="sidebar-backdrop"
              className="fixed inset-0 z-40 bg-black/30"
              onClick={() => setSidebarOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: backdropDuration, ease: "easeInOut" }}
            />
            <motion.nav
              key="sidebar-panel"
              aria-label="Main menu"
              className="fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl dark:bg-gray-800"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: panelDuration, ease: "easeOut" }}
            >
              <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-700">
                <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">Dinovo</span>
                <ModalCloseButton onClick={() => setSidebarOpen(false)} />
              </div>
              <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
                {visibleItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/" || item.to === "/floor-plan"}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      `rounded-md px-3 py-2.5 text-sm font-medium ${
                        isActive
                          ? "bg-accent-100 text-accent-700 dark:bg-accent-800/40 dark:text-accent-300"
                          : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </motion.nav>
          </>
        )}
      </AnimatePresence>

      <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <Outlet />
      </main>
    </div>
  );
}
