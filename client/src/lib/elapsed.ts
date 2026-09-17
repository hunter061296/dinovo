// Matches the "1h 16m" style OpenTable uses for how long a table's been in its current status.
export function formatElapsed(sinceIso: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(sinceIso).getTime()) / 60000));
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}
