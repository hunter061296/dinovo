export function PlaceholderPage({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400">
      <p className="text-lg font-medium">{title}</p>
      <p className="text-sm">Coming in {phase}.</p>
    </div>
  );
}
