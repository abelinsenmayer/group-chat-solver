type ThoughtBubbleProps = {
  text: string
}

export function ThoughtBubble({ text }: ThoughtBubbleProps) {
  return (
    <div className="absolute -top-12 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full border border-secondary/30 bg-background px-4 py-1.5 text-sm shadow-md">
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
      <div className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-b border-r border-secondary/30 bg-background" />
      <style>{`
        @keyframes bounce-dot {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-3px); }
        }
      `}</style>
    </div>
  )
}
