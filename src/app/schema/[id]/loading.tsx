export default function SchemaLoading() {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#0a0a0a] text-zinc-100">
      {/* Header skeleton */}
      <header className="flex h-14 flex-shrink-0 items-center justify-between gap-3 border-b border-zinc-800/80 bg-[#0a0a0a]/90 px-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 animate-pulse rounded-lg border border-zinc-800 bg-zinc-900/60" />
          <div className="h-7 w-7 animate-pulse rounded-lg bg-zinc-800" />
          <div className="h-3.5 w-40 animate-pulse rounded bg-zinc-800" />
        </div>
        <div className="hidden items-center gap-3 md:flex">
          <div className="h-6 w-28 animate-pulse rounded-full bg-zinc-900" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-16 animate-pulse rounded-lg bg-zinc-800" />
          <div className="h-8 w-20 animate-pulse rounded-lg bg-zinc-900" />
        </div>
      </header>

      {/* Split editor / canvas skeleton */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-2/5 flex-col border-r border-zinc-800/80 bg-[#0d1117] p-4">
          <div className="mb-4 flex items-center justify-between">
            <div className="h-3 w-14 animate-pulse rounded bg-zinc-800" />
            <div className="h-7 w-24 animate-pulse rounded-md bg-zinc-800/70" />
          </div>
          <div className="flex-1 space-y-2.5">
            {[
              'w-3/4',
              'w-1/2',
              'w-2/3',
              'w-full',
              'w-4/5',
              'w-1/3',
              'w-2/3',
              'w-3/5',
              'w-1/2',
              'w-5/6',
            ].map((width, index) => (
              <div
                key={index}
                className={`h-2.5 animate-pulse rounded bg-zinc-800/70 ${width}`}
              />
            ))}
          </div>
        </div>

        <div className="relative flex-1 bg-[#070b14] p-8">
          <div className="absolute right-4 top-4 flex gap-2">
            <div className="h-8 w-28 animate-pulse rounded-lg bg-zinc-900/90" />
            <div className="h-8 w-20 animate-pulse rounded-lg bg-zinc-900/90" />
          </div>

          <div className="grid h-full grid-cols-2 gap-6 content-center">
            {[0, 1, 2, 3].map((item) => (
              <div
                key={item}
                className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4"
              >
                <div className="h-3 w-24 animate-pulse rounded bg-zinc-800" />
                <div className="space-y-2">
                  <div className="h-2 w-full animate-pulse rounded bg-zinc-800/60" />
                  <div className="h-2 w-4/5 animate-pulse rounded bg-zinc-800/60" />
                  <div className="h-2 w-2/3 animate-pulse rounded bg-zinc-800/60" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
