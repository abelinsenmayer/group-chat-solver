type PersonPreferencesPopoverProps = {
  name: string
  preferences: string
  color: string
}

export function PersonPreferencesPopover({ name, preferences, color }: PersonPreferencesPopoverProps) {
  return (
    <div
      data-testid="person-preferences-popover"
      className="absolute bottom-full left-1/2 z-50 mb-2 w-48 -translate-x-1/2 rounded-lg border border-secondary/30 bg-background p-3 text-left shadow-lg"
    >
      <p className="text-xs font-bold" style={{ color }}>
        {name}
      </p>
      <p className="mt-0.5 text-xs text-secondary/80">“{preferences}”</p>
    </div>
  )
}
