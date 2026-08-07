import { motion } from 'framer-motion'
import { useMemo } from 'react'

type WigglyLineProps = {
  x1Pct: number
  y1Pct: number
  x2Pct: number
  y2Pct: number
  color: string
  iconRadiusPct?: number
}

function generateWigglyPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  iconRadiusPct: number,
  phase: number,
): string {
  const dx = x2 - x1
  const dy = y2 - y1
  const length = Math.sqrt(dx * dx + dy * dy)
  if (length === 0) return `M ${x1} ${y1}`

  // Normalize direction
  const nx = dx / length
  const ny = dy / length

  // Offset start by icon radius
  const startX = x1 + nx * iconRadiusPct
  const startY = y1 + ny * iconRadiusPct

  // Perpendicular direction
  const px = -ny
  const py = nx

  // Build path with sine wave segments
  const segments = 8
  const amplitude = 0.8 // percent units
  const points: [number, number][] = [[startX, startY]]

  for (let i = 1; i <= segments; i++) {
    const t = i / segments
    const baseX = startX + (x2 - startX) * t
    const baseY = startY + (y2 - startY) * t
    const sineOffset = Math.sin((t * Math.PI * 2) + phase) * amplitude
    if (i < segments) {
      points.push([baseX + px * sineOffset, baseY + py * sineOffset])
    } else {
      points.push([x2, y2])
    }
  }

  let path = `M ${points[0][0]} ${points[0][1]}`
  for (let i = 1; i < points.length; i++) {
    path += ` L ${points[i][0]} ${points[i][1]}`
  }
  return path
}

export function WigglyLine({ x1Pct, y1Pct, x2Pct, y2Pct, color, iconRadiusPct = 4 }: WigglyLineProps) {
  const pathVariants = useMemo(() => {
    const frames = 60
    const paths: string[] = []
    for (let i = 0; i <= frames; i++) {
      const phase = (i / frames) * Math.PI * 2
      paths.push(generateWigglyPath(x1Pct, y1Pct, x2Pct, y2Pct, iconRadiusPct, phase))
    }
    return paths
  }, [x1Pct, y1Pct, x2Pct, y2Pct, iconRadiusPct])

  return (
    <motion.path
      d={pathVariants[0]}
      stroke={color}
      strokeWidth={0.5}
      fill="none"
      initial={{ opacity: 0 }}
      animate={{
        opacity: 1,
        d: pathVariants,
      }}
      transition={{
        opacity: { duration: 0.3 },
        d: { duration: 2, repeat: Infinity, ease: 'linear' },
      }}
    />
  )
}
