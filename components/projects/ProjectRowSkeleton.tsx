export default function ProjectRowSkeleton() {
  return (
    <div className="flex items-center px-6 gap-6 min-h-[64px] bg-background-secondary border-b border-border-default forge-shimmer">
      {/* Identity */}
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-3 w-48 bg-background-tertiary" />
        <div className="h-2 w-72 bg-background-tertiary" />
      </div>
      {/* Progress */}
      <div className="w-48 shrink-0 space-y-2">
        <div className="h-2 w-16 bg-background-tertiary" />
        <div className="h-1.5 w-full bg-background-tertiary" />
        <div className="h-2 w-20 bg-background-tertiary" />
      </div>
      {/* Members */}
      <div className="w-32 shrink-0 flex gap-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-6 w-6 rounded-full bg-background-tertiary" />
        ))}
      </div>
      {/* Deadline */}
      <div className="w-32 shrink-0 space-y-1.5">
        <div className="h-2 w-14 bg-background-tertiary" />
        <div className="h-3 w-24 bg-background-tertiary" />
      </div>
      {/* Status */}
      <div className="w-28 shrink-0">
        <div className="h-5 w-20 bg-background-tertiary" />
      </div>
      {/* Actions placeholder */}
      <div className="w-20 shrink-0" />
    </div>
  )
}
