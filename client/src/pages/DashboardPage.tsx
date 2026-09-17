import { useAuth } from "../lib/AuthContext";

export function DashboardPage() {
  const { user } = useAuth();
  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900">Welcome, {user?.name}</h1>
      <p className="mt-1 text-sm text-gray-500">
        You're signed in as <span className="font-medium">{user?.role}</span>. The reservation book, floor plan,
        waitlist, and reports will show up here as each phase is built.
      </p>
    </div>
  );
}
