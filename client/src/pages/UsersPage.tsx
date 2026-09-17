import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { AuthUser, Role } from "../lib/types";

interface UserRow extends AuthUser {
  isActive: boolean;
  createdAt: string;
}

export function UsersPage() {
  const queryClient = useQueryClient();
  const { data: users, isLoading, isError } = useQuery<UserRow[]>({
    queryKey: ["users"],
    queryFn: () => api.get("/users").then((res) => res.data),
  });

  const [form, setForm] = useState({ name: "", email: "", password: "", role: "HOST" as Role });
  const [formError, setFormError] = useState<string | null>(null);

  const createUser = useMutation({
    mutationFn: () => api.post("/users", form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setForm({ name: "", email: "", password: "", role: "HOST" });
      setFormError(null);
    },
    onError: (err: any) => setFormError(err.response?.data?.error || "Failed to create user"),
  });

  const toggleActive = useMutation({
    mutationFn: (u: UserRow) => api.patch(`/users/${u.id}`, { isActive: !u.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createUser.mutate();
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Users</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Create and manage Manager and Host accounts.</p>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 p-4 sm:grid-cols-2">
        {formError && <div className="col-span-full rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{formError}</div>}
        <label className="text-sm">
          <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Name</span>
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Email</span>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Temporary password</span>
          <input
            type="text"
            required
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Role</span>
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
            className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          >
            <option value="HOST">Host</option>
            <option value="MANAGER">Manager</option>
            <option value="ADMIN">Admin</option>
          </select>
        </label>
        <div className="col-span-full">
          <button
            type="submit"
            disabled={createUser.isPending}
            className="rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
          >
            {createUser.isPending ? "Creating..." : "Create user"}
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        {isLoading && <div className="p-4 text-sm text-gray-500 dark:text-gray-400">Loading users...</div>}
        {isError && <div className="p-4 text-sm text-red-600 dark:text-red-400">Failed to load users.</div>}
        {users && (
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-500 dark:bg-gray-900 dark:text-gray-400">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-gray-100 dark:border-gray-700">
                  <td className="px-4 py-2">{u.name}</td>
                  <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{u.email}</td>
                  <td className="px-4 py-2">{u.role}</td>
                  <td className="px-4 py-2">
                    <span className={u.isActive ? "text-green-600 dark:text-green-400" : "text-gray-400 dark:text-gray-500"}>
                      {u.isActive ? "Active" : "Deactivated"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => toggleActive.mutate(u)}
                      className="text-xs font-medium text-accent-600 hover:underline"
                    >
                      {u.isActive ? "Deactivate" : "Reactivate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
