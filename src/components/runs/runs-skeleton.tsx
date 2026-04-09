function RunRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5 animate-pulse">
      <div className="h-2.5 w-2.5 rounded-full surface-2" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-3.5 w-24 rounded-lg surface-2" />
          <div className="h-4 w-12 rounded-lg surface-2" />
          <div className="h-4 w-16 rounded-lg surface-2" />
        </div>
        <div className="h-3 w-48 rounded-lg surface-2" />
      </div>
      <div className="h-3 w-20 rounded-lg surface-2" />
      <div className="h-3 w-16 rounded-lg surface-2" />
      <div className="h-4 w-4 rounded-lg surface-2" />
    </div>
  );
}

export function RunsListSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-5 w-24 rounded-lg surface-2 animate-pulse" />
          <div className="h-3.5 w-32 rounded-lg surface-2 animate-pulse" />
        </div>
        <div className="h-9 w-36 rounded-lg surface-2 animate-pulse" />
      </div>
      <div className="h-10 rounded-lg surface-2 animate-pulse" />
      <div className="h-8 rounded-lg surface-2 animate-pulse" />
      <div className="rounded-xl surface-1 border border-border overflow-hidden divide-y divide-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <RunRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
