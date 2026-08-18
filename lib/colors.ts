export const TRACK_COLORS = [
  { wave: '#4ade8055', progress: '#4ade80' },
  { wave: '#60a5fa55', progress: '#60a5fa' },
  { wave: '#fbbf2455', progress: '#fbbf24' },
  { wave: '#f472b655', progress: '#f472b6' },
  { wave: '#a78bfa55', progress: '#a78bfa' },
]

export const SECTION_PRESETS = [
  { solid: '#4ade80', rgba: 'rgba(74,222,128,0.20)' },
  { solid: '#60a5fa', rgba: 'rgba(96,165,250,0.20)' },
  { solid: '#fbbf24', rgba: 'rgba(251,191,36,0.20)' },
  { solid: '#f472b6', rgba: 'rgba(244,114,182,0.20)' },
  { solid: '#a78bfa', rgba: 'rgba(167,139,250,0.20)' },
  { solid: '#f87171', rgba: 'rgba(248,113,113,0.20)' },
]

export const DEFAULT_SECTION_COLOR = SECTION_PRESETS[0].rgba

export function solidFromRgba(rgba: string): string {
  return SECTION_PRESETS.find((p) => p.rgba === rgba)?.solid ?? '#4ade80'
}
