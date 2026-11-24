export default function DashboardLoading() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0a0a0a] text-zinc-100">
      {/* Sidebar skeleton */}
      <aside className="hidden w-64 flex-shrink-0 flex-col border-r border-zinc-800/80 bg-[#0a0a0a]/90 sm:flex">
        <div className="flex h-16 items-center gap-2.5 border-b border-zinc-800/80 px-4">
          <div className="h-8 w-8 animate-pulse rounded-lg bg-zinc-800" />
          <div className="h-3.5 w-20 animate-pulse rounded bg-zinc-800" />
        </div>

        <div className="border-b border-zinc-800/60 p-3">
          <div className="flex items-center gap-2 rounded-lg border border-zinc-800/50 bg-zinc-900/60 px-2 py-1.5">
            <div className="h-7 w-7 animate-pulse rounded-full bg-zinc-800" />
            <div className="flex-1 space-y-1.5">
              <div className="h-2.5 w-24 animate-pulse rounded bg-zinc-800" />
              <div className="h-2 w-32 animate-pulse rounded bg-zinc-800/70" />
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-2 px-3 py-4">
          <div className="mb-3 h-2.5 w-16 animate-pulse rounded bg-zinc-800" />
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="flex items-center gap-2 px-2.5 py-1.5">
              <div className="h-3.5 w-3.5 animate-pulse rounded bg-zinc-800" />
              <div className="h-2.5 w-28 animate-pulse rounded bg-zinc-800/80" />
            </div>
          ))}
        </div>

        <div className="border-t border-zinc-800/80 p-3">
          <div className="h-8 w-full animate-pulse rounded-lg bg-zinc-800" />
        </div>
      </aside>

      {/* Main content skeleton */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#0a0a0a]">
        <header className="flex h-16 flex-shrink-0 items-center justify-between gap-4 border-b border-zinc-800/80 px-6">
          <div className="flex items-center gap-2">
            <div className="h-3.5 w-3.5 animate-pulse rounded bg-zinc-800" />
            <div className="h-2.5 w-24 animate-pulse rounded bg-zinc-800" />
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden h-8 w-64 animate-pulse rounded-lg bg-zinc-900 md:block" />
            <div className="h-8 w-16 animate-pulse rounded-lg bg-zinc-900" />
            <div className="h-8 w-8 animate-pulse rounded-lg bg-zinc-900" />
          </div>
        </header>

        <div className="flex-1 space-y-8 overflow-hidden p-6">
          <section className="space-y-3">
            <div className="h-2.5 w-24 animate-pulse rounded bg-zinc-800" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {[0, 1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="flex flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40"
                >
                  <div className="flex-1 space-y-3 p-4">
                    <div className="flex items-start justify-between">
                      <div className="h-10 w-10 animate-pulse rounded-xl bg-zinc-800" />
                      <div className="h-5 w-14 animate-pulse rounded bg-zinc-800/80" />
                    </div>
                    <div className="space-y-2">
                      <div className="h-3 w-32 animate-pulse rounded bg-zinc-800" />
                      <div className="h-2.5 w-24 animate-pulse rounded bg-zinc-800/70" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-zinc-800/60 bg-zinc-950/40 px-4 py-2.5">
                    <div className="h-2.5 w-24 animate-pulse rounded bg-zinc-800/70" />
                    <div className="h-2.5 w-10 animate-pulse rounded bg-zinc-800/70" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
