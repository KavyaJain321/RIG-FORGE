'use client'

interface ActivityDay {
  date: string      // 'YYYY-MM-DD'
  wasActive: boolean
}

interface ActivityStripProps {
  activity: ActivityDay[]
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return DAY_LABELS[d.getDay() === 0 ? 6 : d.getDay() - 1] ?? ''
}

export default function ActivityStrip({ activity }: ActivityStripProps) {
  // Expect 7 entries oldest → newest
  const days = activity.slice(-7)

  return (
    <div className="flex items-end gap-1.5">
      {days.map((day, i) => (
        <div key={day.date ?? i} className="flex flex-col items-center gap-1">
          <div
            className={`w-7 h-7 rounded-sm transition-colors ${
              day.wasActive
                ? 'bg-accent/80 border border-accent'
                : 'bg-background-tertiary border border-border-default'
            }`}
            title={`${day.date}: ${day.wasActive ? 'Active' : 'Inactive'}`}
          />
          <span className="font-mono text-[9px] text-muted uppercase tracking-wide">
            {getDayLabel(day.date)}
          </span>
        </div>
      ))}
    </div>
  )
}
