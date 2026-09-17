import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import type { Role } from "../lib/types";

export function ProtectedRoute({ roles }: { roles?: Role[] }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 text-gray-500 dark:bg-gray-900 dark:text-gray-400">
        Loading...
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 bg-gray-50 text-gray-600 dark:bg-gray-900 dark:text-gray-300">
        <p className="text-lg font-medium">Not authorized</p>
        <p className="text-sm">You don't have permission to view this page.</p>
      </div>
    );
  }
  return <Outlet />;
}
