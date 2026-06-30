import type { CicloPHVA, EstadoCumple, Valoracion } from "@/lib/sst-types"

// Tokens de marca exactos del modulo SST 0312 (no cambiar).
export const SST_TOKENS = {
  navy: "#0D3B6E",
  teal: "#00B4CC",
  light: "#E6F4F8",
  ink: "#0A2540",
  ok: "#1E8449",
  warn: "#E0A800",
  bad: "#C0392B",
  grey: "#e5edf2",
} as const

// Colores por ciclo PHVA.
export const CICLO_COLOR: Record<CicloPHVA, string> = {
  PLANEAR: "#0D3B6E",
  HACER: "#00838f",
  VERIFICAR: "#5e35b1",
  ACTUAR: "#1E8449",
}

export const CICLO_LABEL: Record<CicloPHVA, string> = {
  PLANEAR: "Planear",
  HACER: "Hacer",
  VERIFICAR: "Verificar",
  ACTUAR: "Actuar",
}

// Color del aro/barra segun el porcentaje (cortes Art. 28).
export function colorPct(pct: number): string {
  if (pct > 85) return SST_TOKENS.ok
  if (pct >= 60) return SST_TOKENS.warn
  return SST_TOKENS.bad
}

export const VALORACION_LABEL: Record<Valoracion, string> = {
  aceptable: "ACEPTABLE",
  moderadamente_aceptable: "MODERADAMENTE ACEPTABLE",
  critico: "CRÍTICO",
}

export function valoracionColor(v: Valoracion | null): string {
  if (v === "aceptable") return SST_TOKENS.ok
  if (v === "moderadamente_aceptable") return SST_TOKENS.warn
  return SST_TOKENS.bad
}

export const ESTADO_LABEL: Record<EstadoCumple, string> = {
  cumple: "Cumple",
  no_cumple: "No cumple",
  no_aplica: "No aplica",
}

export function estadoColor(estado: EstadoCumple | null): string {
  if (estado === "cumple") return SST_TOKENS.ok
  if (estado === "no_cumple") return SST_TOKENS.bad
  return "#8896a5" // gris para no_aplica / sin responder
}

export function fmtPct(n: number): string {
  return `${(Math.round(n * 10) / 10).toFixed(1)}%`
}
