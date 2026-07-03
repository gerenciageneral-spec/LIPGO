"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { getIndicadoresValores } from "@/lib/sig-actions"
import { AREA_KPIS, KPI_DEFS, formatKpi, kpiSev, type KpiSev } from "@/lib/kpis-area"
import type { GroupKey } from "@/lib/dashboard-data"

const SEV_COLOR: Record<KpiSev, string> = {
  good: "#12a06a",
  warn: "#c8871a",
  crit: "#d1443f",
  none: "#00b4cc",
}

interface ValorBsc {
  valor: number
  base?: string
}

function monthRange() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return { desde: `${y}-${m}-01`, hasta: `${y}-${m}-${day}` }
}

/**
 * KPIs del ÁREA leídos del BSC (getIndicadoresValores), por empresa y EN VIVO:
 * refresca al cambiar el selector de empresa/grupo y cada 3 min, para reflejar
 * cambios del Tablero BSC en cada submenú. Si el grupo no tiene indicadores
 * mapeados, no muestra nada.
 */
export function AreaKpis({ groupKey }: { groupKey: GroupKey }) {
  const { selectedEmpresaId } = useAuth()
  const [valores, setValores] = useState<Record<string, ValorBsc>>({})
  const [loading, setLoading] = useState(true)

  const keys = AREA_KPIS[groupKey] ?? []

  useEffect(() => {
    if (keys.length === 0 || !selectedEmpresaId) return
    let cancel = false
    const load = async () => {
      try {
        const { desde, hasta } = monthRange()
        const r = await getIndicadoresValores(selectedEmpresaId, desde, hasta)
        if (!cancel && r.success) setValores(r.valores as Record<string, ValorBsc>)
      } catch {
        // silencioso: si falla, no muestra KPIs
      } finally {
        if (!cancel) setLoading(false)
      }
    }
    setLoading(true)
    load()
    const interval = setInterval(load, 180000) // 3 min — refresco en vivo del BSC
    return () => {
      cancel = true
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupKey, selectedEmpresaId])

  if (keys.length === 0) return null

  return (
    <div>
      <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
        Indicadores del área
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal"
          style={{ color: "#7b57c9", background: "color-mix(in srgb, #7b57c9 14%, transparent)" }}
        >
          ✨ del Tablero BSC
        </span>
      </h2>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-3.5">
        {keys.map((k) => {
          const def = KPI_DEFS[k]
          if (!def) return null
          const v = valores[k]
          const sev = v ? kpiSev(def, v.valor) : "none"
          const color = SEV_COLOR[sev]
          return (
            <div key={k} className="rounded-2xl border border-border bg-card p-3.5">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
                <span
                  className="h-[7px] w-[7px] flex-none rounded-full"
                  style={{ background: v ? color : "var(--border)" }}
                />
                <span className="truncate">{def.nombre}</span>
              </div>
              <div
                className="mt-2 text-2xl font-extrabold tabular-nums tracking-tight"
                style={{ color: v ? color : "var(--muted-foreground)" }}
              >
                {loading && !v ? "…" : v ? formatKpi(def, v.valor) : "—"}
              </div>
              <div className="mt-1 truncate text-[10.5px] text-muted-foreground/80">
                {def.meta != null ? `meta ${formatKpi(def, def.meta)}` : v?.base || " "}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
