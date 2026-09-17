import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import type { Role } from "../lib/types";

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
  if (!user) return null;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <span className="text-lg font-semibold text-gray-900">Dinovo</span>
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
                      isActive ? "bg-indigo-100 text-indigo-700" : "text-gray-600 hover:bg-gray-100"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <span>
            {user.name} <span className="text-gray-400">({user.role})</span>
          </span>
          <button
            onClick={logout}
            className="rounded-md border border-gray-300 px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-100"
          >
            Log out
          </button>
        </div>
      </header>
      <main className="flex-1 p-4 sm:p-6">
        <Outlet />
      </main>
    </div>
  );
}
