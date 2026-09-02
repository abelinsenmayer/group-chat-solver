import { motion } from 'framer-motion'
import { useMemo } from 'react'

type PixelWigglyLineProps = {
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
  iconRadius?: number
}

type LegacyWigglyLineProps = {
  x1Pct: number
  y1Pct: number
  x2Pct: number
  y2Pct: number
  color: string
  iconRadiusPct?: number
}

type WigglyLineProps = PixelWigglyLineProps | LegacyWigglyLineProps

function generateWigglyPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  iconRadius: number,
  amplitude: number,
  phase: number,
): string {
  const dx = x2 - x1
  const dy = y2 - y1
  const length = Math.sqrt(dx * dx + dy * dy)
  if (length === 0) return `M ${x1} ${y1}`

  const nx = dx / length
  const ny = dy / length
  const startX = x1 + nx * iconRadius
  const startY = y1 + ny * iconRadius
  const px = -ny
  const py = nx
  const segments = 8
  const points: [number, number][] = [[startX, startY]]

  for (let i = 1; i <= segments; i++) {
    const t = i / segments
    const baseX = startX + (x2 - startX) * t
    const baseY = startY + (y2 - startY) * t
    const sineOffset = Math.sin((t * Math.PI * 2) + phase) * amplitude
    points.push(i < segments ? [baseX + px * sineOffset, baseY + py * sineOffset] : [x2, y2])
  }

  return points.reduce(
    (path, point, index) => `${path}${index === 0 ? 'M' : ' L'} ${point[0]} ${point[1]}`,
    '',
  )
}

export function WigglyLine(props: WigglyLineProps) {
  const pixelCoordinates = 'x1' in props
  const x1 = pixelCoordinates ? props.x1 : props.x1Pct
  const y1 = pixelCoordinates ? props.y1 : props.y1Pct
  const x2 = pixelCoordinates ? props.x2 : props.x2Pct
  const y2 = pixelCoordinates ? props.y2 : props.y2Pct
  const iconRadius = pixelCoordinates ? (props.iconRadius ?? 24) : (props.iconRadiusPct ?? 4)
  const amplitude = pixelCoordinates ? 4 : 0.8

  const pathVariants = useMemo(() => {
    const frames = 60
    return Array.from({ length: frames + 1 }, (_, index) =>
      generateWigglyPath(x1, y1, x2, y2, iconRadius, amplitude, (index / frames) * Math.PI * 2),
    )
  }, [x1, y1, x2, y2, iconRadius, amplitude])

  return (
    <motion.path
      d={pathVariants[0]}
      stroke={props.color}
      strokeWidth={pixelCoordinates ? 1.5 : 0.5}
      fill="none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, d: pathVariants }}
      transition={{
        opacity: { duration: 0.3 },
        d: { duration: 2, repeat: Infinity, ease: 'linear' },
      }}
    />
  )
}
