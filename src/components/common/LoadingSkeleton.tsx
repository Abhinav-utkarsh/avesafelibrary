export function PageLoadingSkeleton({ label = 'Loading workspace...' }: { label?: string }) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4">
        <div className="h-5 w-40 rounded-md bg-slate-200 dark:bg-slate-800 animate-pulse mx-auto" />
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-3">
          <div className="h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
          <div className="h-4 w-1/2 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
          <div className="h-10 w-full rounded-xl bg-slate-100 dark:bg-slate-800/70 animate-pulse mt-4" />
        </div>
        <p className="text-center text-xs text-slate-500 dark:text-slate-400">{label}</p>
      </div>
    </div>
  );
}
