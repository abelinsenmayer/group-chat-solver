import { useMemo } from 'react'
import { cn } from '../lib/utils'
import { PERSON_AREA_COLORS } from '../lib/person-colors'

export type LandingPageProps = {
  onStart: () => void
}

const BUBBLE_COUNT = 16

type BubbleDef = {
  color: string
  width: string
  height: string
  margin: string
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ]
}

function generateBubbles(): BubbleDef[] {
  return Array.from({ length: BUBBLE_COUNT }, () => {
    const color = PERSON_AREA_COLORS[Math.floor(Math.random() * PERSON_AREA_COLORS.length)]
    const [r, g, b] = hexToRgb(color)
    // const alpha = 0.35 + Math.random() * 0.2
    const alpha = 1.0
    const width = 3 + Math.random() * 4.5
    const height = 2 + Math.random() * 2.5
    const margin = Math.random() * 1.5

    return {
      color: `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`,
      width: `${width.toFixed(2)}rem`,
      height: `${height.toFixed(2)}rem`,
      margin: `${margin.toFixed(2)}rem`,
    }
  })
}

type ChatBubbleColumnProps = {
  side: 'left' | 'right'
  className?: string
}

function ChatBubbleColumn({ side, className }: ChatBubbleColumnProps) {
  const bubbles = useMemo(() => generateBubbles(), [])
  const isLeft = side === 'left'
  const alignClass = isLeft ? 'items-start pl-6 pr-2' : 'items-end pr-6 pl-2'
  const bubbleClass = isLeft ? 'bubble bubble-left' : 'bubble bubble-right'
  const animationClass = isLeft ? 'animate-bubble-scroll-up' : 'animate-bubble-scroll-down'

  return (
    <div
      className={cn('pointer-events-none relative overflow-hidden', className)}
      aria-hidden="true"
    >
      <div
        className={cn(
          'absolute left-0 top-0 h-[200%] w-full flex flex-col will-change-transform',
          animationClass,
        )}
        style={isLeft ? undefined : { transform: 'translateY(-50%)' }}
      >
        {[0, 1].map((i) => (
          <div
            key={i}
            className={cn('h-1/2 w-full flex flex-col justify-evenly', alignClass)}
          >
            {bubbles.map((bubble, index) => (
              <span
                key={`${i}-${index}`}
                className={bubbleClass}
                style={{
                  color: bubble.color,
                  width: bubble.width,
                  height: bubble.height,
                  marginLeft: isLeft ? bubble.margin : undefined,
                  marginRight: isLeft ? undefined : bubble.margin,
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function LandingPage({ onStart }: LandingPageProps) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <ChatBubbleColumn
        side="left"
        className="absolute left-0 top-0 hidden h-screen w-48 lg:block"
      />
      <ChatBubbleColumn
        side="right"
        className="absolute right-0 top-0 hidden h-screen w-48 lg:block"
      />
      <main className="relative z-10 mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-10 text-center sm:px-12 sm:py-16">
        <div className="">
          <p className="text-sm text-start text-secondary">Abe Linsenmayer&apos;s</p>
          <h1 className="text-3xl font-bold tracking-tight text-secondary sm:text-4xl">
            Group Chat &quot;Solver&quot;
          </h1>
        </div>
        <p className="mt-10 max-w-lg text-base text-secondary">
          Description goes here.
        </p>
        <button
          type="button"
          onClick={onStart}
          className="mt-10 rounded-md border-2 border-secondary px-5 py-2 font-bold text-secondary transition hover:bg-secondary hover:text-background focus-visible:outline-4 focus-visible:outline-primary"
        >
          Let&apos;s get started <span aria-hidden="true">→</span>
        </button>
      </main>
    </div>
  )
}
