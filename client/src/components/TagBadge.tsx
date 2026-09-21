interface Props {
  tag: string;
  auto?: boolean;
  onRemove?: () => void;
}

// Shared across GuestbookPage, GuestProfilePage, and GuestProfileCard so "a host said this" vs.
// "the system inferred this" always looks the same wherever tags render.
export function TagBadge({ tag, auto, onRemove }: Props) {
  const className = auto
    ? "inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600 dark:border-gray-600 dark:bg-gray-800/60 dark:text-gray-400"
    : "inline-flex items-center gap-1 rounded-full bg-accent-100 px-2 py-0.5 text-xs font-medium text-accent-700 dark:bg-accent-800/40 dark:text-accent-300";

  if (onRemove) {
    return (
      <button type="button" onClick={onRemove} title={auto ? "Automatically applied" : undefined} className={`${className} hover:opacity-75`}>
        {auto && <span aria-hidden>✨</span>}
        {tag} <span aria-hidden>×</span>
      </button>
    );
  }

  return (
    <span title={auto ? "Automatically applied" : undefined} className={className}>
      {auto && <span aria-hidden>✨</span>}
      {tag}
    </span>
  );
}
