import { cn } from '../lib/utils'

type ThoughtBubbleProps = {
  text: string
  placement?: 'above' | 'below'
}

export function ThoughtBubble({ text, placement = 'above' }: ThoughtBubbleProps) {
  return (
    <div
      data-placement={placement}
      className={cn(
        'absolute left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full border border-secondary/30 bg-background px-4 py-1.5 text-sm shadow-md',
        placement === 'above' ? '-top-12' : 'top-[calc(100%+0.75rem)]',
      )}
    >
      <span>{text}</span>
      <span className="ml-1 inline-flex items-end gap-0.5">
        {[0, 0.15, 0.3].map((delay, i) => (
          <span
            key={i}
            data-testid="thought-dot"
            className="inline-block h-1 w-1 rounded-full bg-current"
            style={{
              animation: 'bounce-dot 1.0s infinite ease-in-out',
              animationDelay: `${delay}s`,
            }}
          />
        ))}
      </span>
      <div
        className={cn(
          'absolute left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-secondary/30 bg-background',
          placement === 'above' ? '-bottom-1 border-b border-r' : '-top-1 border-l border-t',
        )}
      />
      <style>{`
        @keyframes bounce-dot {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-3px); }
        }
      `}</style>
    </div>
  )
}
