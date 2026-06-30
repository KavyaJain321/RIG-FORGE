export default function ProjectRowSkeleton() {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center px-4 sm:px-6 lg:gap-6 py-3 lg:py-0 lg:min-h-[64px] bg-background-secondary border-b border-border-default forge-shimmer">
      {/* Identity */}
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-3 w-2/3 max-w-[12rem] bg-background-tertiary" />
        <div className="h-2 w-full max-w-[18rem] bg-background-tertiary" />
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 lg:contents">
        {/* Progress */}
        <div className="w-full lg:w-48 shrink-0 space-y-2">
          <div className="h-2 w-16 bg-background-tertiary" />
          <div className="h-1.5 w-full bg-background-tertiary" />
          <div className="h-2 w-20 bg-background-tertiary" />
        </div>
        {/* Members */}
        <div className="lg:w-32 shrink-0 flex gap-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-6 w-6 rounded-full bg-background-tertiary" />
          ))}
        </div>
        {/* Deadline */}
        <div className="lg:w-32 shrink-0 space-y-1.5">
          <div className="h-2 w-14 bg-background-tertiary" />
          <div className="h-3 w-24 bg-background-tertiary" />
        </div>
        {/* Status */}
        <div className="lg:w-28 shrink-0">
          <div className="h-5 w-20 bg-background-tertiary" />
        </div>
      </div>
      {/* Actions placeholder (desktop only) */}
      <div className="hidden lg:block lg:w-20 shrink-0" />
    </div>
  )
}
