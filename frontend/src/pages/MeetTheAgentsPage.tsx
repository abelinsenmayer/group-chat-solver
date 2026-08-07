import { CircleUserRound } from 'lucide-react'
import { getPersonAreaColor } from '../lib/person-colors'
import type { Person } from '../lib/people-api'

type MeetTheAgentsPageProps = {
  people: Person[]
  onBack: () => void
  onNext: () => void
}

function AgentCard({ icon, name, description, nameColor, delay }: {
  icon: React.ReactNode
  name: string
  description: string
  nameColor?: string
  delay: number
}) {
  return (
    <div
      className="flex items-start gap-5 animate-fly-in opacity-0"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'forwards' }}
    >
      <div className="flex flex-col items-center shrink-0">
        {icon}
        <span className="mt-1 text-sm font-bold" style={nameColor ? { color: nameColor } : undefined}>{name}</span>
      </div>
      <div className="border-l-2 border-secondary pl-4 py-1">
        <p className="text-secondary text-sm leading-relaxed">{description}</p>
      </div>
    </div>
  )
}

export default function MeetTheAgentsPage({ people, onBack, onNext }: MeetTheAgentsPageProps) {
  const orchestratorColor = '#4A4A4A'

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10 sm:px-12 sm:py-16 bg-background text-secondary">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Meet the Agents</h1>
      <p className="mt-4 text-sm leading-relaxed">
        Here's some descriptive text about what each agent type does and what will happen next.
      </p>

      <section className="mt-10">
        <h2 className="text-xl font-bold">Orchestrator</h2>
        <div className="mt-6 space-y-8">
          <AgentCard
            icon={<CircleUserRound size={48} strokeWidth={1.5} color={orchestratorColor} />}
            name="Planner"
            description="Here's a description of what the orchestrator agent does. It coordinates the judges and synthesizes their evaluations into a final plan."
            nameColor={orchestratorColor}
            delay={150}
          />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-bold">Judges</h2>
        <div className="mt-6 space-y-8">
          {people.map((person, index) => {
            const color = getPersonAreaColor(index)
            return (
              <AgentCard
                key={person.name}
                icon={<CircleUserRound size={48} strokeWidth={1.5} color={color} />}
                name={person.name}
                description={person.preferences}
                nameColor={color}
                delay={300 + index * 150}
              />
            )
          })}
        </div>
      </section>

      <div className="mt-10 flex justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border-2 border-secondary px-4 py-2 font-bold transition hover:bg-secondary hover:text-background focus-visible:outline-4 focus-visible:outline-primary"
        >
          <span aria-hidden="true">←</span> Back
        </button>
        <button
          type="button"
          onClick={onNext}
          className="rounded-md border-2 border-secondary px-5 py-2 font-bold text-secondary transition hover:bg-secondary hover:text-background focus-visible:outline-4 focus-visible:outline-primary"
        >
          Next <span aria-hidden="true">→</span>
        </button>
      </div>
    </main>
  )
}
