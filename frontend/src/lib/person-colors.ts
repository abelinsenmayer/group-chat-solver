export const PERSON_AREA_COLORS = [
  '#77BEF0',
  '#FFCB61',
  '#FF894F',
  '#EA5B6F',
  '#80d19d',
  '#b080d1',
  '#6984A9',
  '#263B6A',
] as const

export function getPersonAreaColor(index: number): string {
  return PERSON_AREA_COLORS[index % PERSON_AREA_COLORS.length]
}
