interface ContributionBarProps {
  value: number
  label?: string
  showPercentage?: boolean
}

export default function ContributionBar({
  value,
  label,
  showPercentage = true,
}: ContributionBarProps) {
  const clamped = Math.min(100, Math.max(0, value))
  const fillGlow = clamped > 80 ? 'forge-glow' : ''
  const textGlow = clamped > 50 ? 'forge-text-glow' : ''

  return (
    <div className="w-full">
      {(label || showPercentage) && (
        <div className="flex justify-between mb-1">
          {label && (
            <span className="font-mono text-[10px] text-muted uppercase tracking-widest">
              {label}
            </span>
          )}
          {showPercentage && (
            <span className={`font-mono text-[10px] text-accent ${textGlow}`}>
              {clamped}%
            </span>
          )}
        </div>
      )}
      <div className="w-full h-1.5 bg-background-tertiary">
        <div
          className={`h-full bg-accent transition-all duration-500 ${fillGlow}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}
