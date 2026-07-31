export type CirclePoint = { xPercent: number; yPercent: number }

export function computeCirclePositions(
  count: number,
  options?: { radius?: number; startAngleDeg?: number },
): CirclePoint[] {
  if (count <= 0) return []

  const radius = options?.radius ?? 42
  const angleStep = 360 / count
  const startAngleDeg = options?.startAngleDeg ?? -90 + angleStep / 2

  return Array.from({ length: count }, (_, index) => {
    const angleRad = ((startAngleDeg + angleStep * index) * Math.PI) / 180
    return {
      xPercent: 50 + radius * Math.cos(angleRad),
      yPercent: 50 + radius * Math.sin(angleRad),
    }
  })
}
