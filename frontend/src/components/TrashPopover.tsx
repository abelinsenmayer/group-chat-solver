import { getPersonAreaColor } from '../lib/person-colors'

type CardVerdict = { verdict: 'approved' | 'rejected'; shortReason: string | null }

type TrashedCard = {
  name: string
  verdicts: Record<string, CardVerdict>
}

type TrashPopoverProps = {
  cards: TrashedCard[]
  personIndexByName: Record<string, number>
}

export function TrashPopover({ cards, personIndexByName }: TrashPopoverProps) {
  return (
    <div data-testid="trash-popover" className="absolute left-full top-0 z-50 ml-2 w-48 max-h-[60vh] overflow-y-auto rounded-lg border border-secondary/30 bg-background p-3 shadow-lg">
      {cards.length === 0 ? (
        <p className="text-xs text-secondary/60">No rejected suggestions yet.</p>
      ) : (
        <ul className="space-y-2">
          {cards.map((card) => (
            <li key={card.name} className="border-b border-secondary/10 pb-2 last:border-b-0 last:pb-0">
              <p className="text-xs font-bold">{card.name}</p>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {Object.entries(card.verdicts).map(([personName, verdict]) => {
                  const color = getPersonAreaColor(personIndexByName[personName] ?? 0)
                  return (
                    <span
                      key={personName}
                      className="rounded-full border px-1.5 py-0.5 text-[9px] font-bold"
                      style={{ borderColor: color, color }}
                    >
                      {verdict.verdict === 'approved' ? '✓' : verdict.shortReason ?? 'Rejected'}
                    </span>
                  )
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
