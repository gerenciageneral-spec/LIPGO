"use client"

import { AlertTriangle } from "lucide-react"
import type { AtencionItem } from "@/components/lip-ai-assistant"

// Colores por severidad sobre fondo claro (las vistas de Inicio/submenú son claras).
const SEV: Record<AtencionItem["sev"], { bg: string; color: string; ring: string }> = {
  crit: { bg: "#fff1f0", color: "#c2362f", ring: "#f3b4ae" },
  warn: { bg: "#fff8e8", color: "#9a6b08", ring: "#efd08a" },
  info: { bg: "#e9fbff", color: "#0784a0", ring: "#a7e6f3" },
}

/**
 * Franja "Requiere tu atención hoy": muestra las tareas en riesgo o urgentes como
 * chips por severidad. Reubicada fuera de la tarjeta de LIPbot para que sea un
 * elemento propio y visible. Si no hay alertas, no renderiza nada.
 */
export function AtencionBanner({
  alertas,
  onAlerta,
  titulo,
}: {
  alertas?: AtencionItem[]
  onAlerta?: (a: AtencionItem) => void
  titulo?: string
}) {
  if (!alertas || alertas.length === 0) return null
  const hayCrit = alertas.some((a) => a.sev === "crit")
  return (
    <div
      className="rounded-2xl border p-3.5 sm:p-4"
      style={{
        borderColor: hayCrit ? "#f3c9c5" : "#f0dfa9",
        background: hayCrit
          ? "linear-gradient(180deg,#fff6f5,#ffffff)"
          : "linear-gradient(180deg,#fffaef,#ffffff)",
        boxShadow: "0 6px 20px rgba(20,42,68,.05)",
      }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-8 w-8 flex-none items-center justify-center rounded-xl"
          style={{ background: hayCrit ? "#ffe4e1" : "#fdefcb", color: hayCrit ? "#c2362f" : "#9a6b08" }}
        >
          <AlertTriangle className="h-[17px] w-[17px]" />
        </span>
        <div className="min-w-0">
          <div className="text-[13.5px] font-bold leading-tight text-foreground">
            {titulo ?? "Requiere tu atención hoy"}
          </div>
          <div className="text-[11.5px] text-muted-foreground">
            {alertas.length} pendiente{alertas.length !== 1 ? "s" : ""} · priorizadas por impacto
          </div>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {alertas.map((a, i) => (
          <button
            key={i}
            onClick={() => onAlerta?.(a)}
            className="rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition-transform hover:scale-[1.03]"
            style={{ background: SEV[a.sev].bg, color: SEV[a.sev].color, boxShadow: `inset 0 0 0 1px ${SEV[a.sev].ring}` }}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}
