import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { Section } from "../../lib/tables";
import { ModalBackdrop, ModalCloseButton, ModalPanel } from "../Modal";

interface Props {
  sections: Section[];
  onClose: () => void;
}

export function SectionManagerModal({ sections, onClose }: Props) {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["sections"] });
    queryClient.invalidateQueries({ queryKey: ["tables"] });
  };

  const createSection = useMutation({
    mutationFn: (name: string) => api.post("/sections", { name, position: sections.length }),
    onSuccess: () => {
      invalidate();
      setNewName("");
      setError(null);
    },
    onError: (err: any) => setError(err.response?.data?.error || "Failed to create section"),
  });

  const renameSection = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.patch(`/sections/${id}`, { name }),
    onSuccess: invalidate,
    onError: (err: any) => setError(err.response?.data?.error || "Failed to rename section"),
  });

  const deleteSection = useMutation({
    mutationFn: (id: string) => api.delete(`/sections/${id}`),
    onSuccess: invalidate,
  });

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    createSection.mutate(newName.trim());
  }

  return (
    <ModalBackdrop>
      <ModalPanel className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg dark:bg-gray-800">
        <div className="mb-4 flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Manage sections</h2>
          <ModalCloseButton onClick={onClose} />
        </div>

        {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{error}</div>}

        <ul className="mb-4 flex flex-col gap-2">
          {sections.length === 0 && (
            <li className="text-sm text-gray-400 dark:text-gray-500">No sections yet — tables show under "All tables".</li>
          )}
          {sections.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <input
                value={renaming[s.id] ?? s.name}
                onChange={(e) => setRenaming({ ...renaming, [s.id]: e.target.value })}
                onBlur={() => {
                  const name = renaming[s.id];
                  if (name && name.trim() && name.trim() !== s.name) {
                    renameSection.mutate({ id: s.id, name: name.trim() });
                  }
                }}
                className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
              <button
                onClick={() => {
                  if (confirm(`Delete section "${s.name}"? Its tables move to "All tables".`)) {
                    deleteSection.mutate(s.id);
                  }
                }}
                className="text-xs font-medium text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>

        <form onSubmit={handleCreate} className="mb-5 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New section name..."
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
          <button
            type="submit"
            disabled={createSection.isPending}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Add
          </button>
        </form>

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700"
          >
            Done
          </button>
        </div>
      </ModalPanel>
    </ModalBackdrop>
  );
}
