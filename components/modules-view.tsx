"use client"

import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { groups, type GroupKey, type Module } from "@/lib/dashboard-data"
import { ArrowLeft, ArrowRight } from "lucide-react"
import type { AtencionItem } from "@/components/lip-ai-assistant"
import { AtencionBanner } from "@/components/atencion-banner"
import { TINT } from "@/components/module-cards"
import { AreaKpis, type ValorBsc } from "@/components/area-kpis"
import { PedidosKpiStrip } from "@/components/orders/pedidos-kpi-strip"
import { DespachoKpiStrip } from "@/components/orders/despacho-kpi-strip"
import { VehiculosNoProcesadosCard } from "@/components/vehiculos-no-procesados-card"
import { useAuth } from "@/components/auth-provider"
import { getIndicadoresValores } from "@/lib/sig-actions"
import { AREA_KPIS, KPI_DEFS, formatKpi, kpiSev } from "@/lib/kpis-area"

interface ModulesViewProps {
  groupKey: GroupKey
  onBack: () => void
  onSelectModule: (moduleName: string) => void
  /** Navegación robusta (grupo + módulo) para el asistente IA. */
  onNavigate?: (moduleName: string) => void
  /** Abrir un módulo principal (grupo) para el asistente IA. */
  onOpenGroup?: (key: string) => void
}

const TEAL = "#00b4cc"

function monthRange() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return { desde: `${y}-${m}-01`, hasta: `${y}-${m}-${day}` }
}

/**
 * Deriva las "tareas del día" del submódulo a partir de SUS PROPIOS KPIs del
 * BSC: los indicadores del área que están por debajo de meta (crit/warn) se
 * convierten en focos de atención. Así cada submódulo muestra tareas distintas
 * y siempre alineadas con los KPIs que se ven arriba. Crit primero.
 */
function alertasDesdeKpis(groupKey: GroupKey, valores: Record<string, ValorBsc>): AtencionItem[] {
  const keys = AREA_KPIS[groupKey] ?? []
  const items = keys
    .map((k) => {
      const def = KPI_DEFS[k]
      const v = valores[k]
      if (!def || !v) return null
      const sev = kpiSev(def, v.valor)
      if (sev !== "crit" && sev !== "warn") return null
      const metaTxt = def.meta != null ? ` · meta ${formatKpi(def, def.meta)}` : ""
      return {
        label: `${def.nombre}: ${formatKpi(def, v.valor)}${metaTxt}`,
        sev: sev === "crit" ? ("crit" as const) : ("warn" as const),
      }
    })
    .filter((x): x is { label: string; sev: "crit" | "warn" } => x !== null)
  // Crit primero, luego warn.
  return items.sort((a, b) => (a.sev === "crit" ? -1 : 1) - (b.sev === "crit" ? -1 : 1))
}

// Tarjeta de submódulo VIVA: mismo lenguaje que el launcher de Inicio. Toma el
// color de dominio del grupo (`--tint`) y, en hover, florece — glow del color,
// leve lift, el tile del ícono se enciende a degradado y aparece una flecha de
// "abrir". Coherente, distintiva y con affordance clara de que es clickeable.
function ModuleCard({
  module,
  onSelect,
  tint,
}: {
  module: Module
  onSelect: (name: string) => void
  tint: string
}) {
  const Icon = module.icon
  return (
    <button
      onClick={() => onSelect(module.name)}
      className="mod-card"
      style={{ "--tint": tint } as CSSProperties}
    >
      <span className="mod-ico">
        <Icon className="h-[17px] w-[17px]" />
      </span>
      <span className="mod-name">{module.label ?? module.name}</span>
      <ArrowRight className="mod-arrow h-4 w-4" />
    </button>
  )
}

export function ModulesView({ groupKey, onBack, onSelectModule }: ModulesViewProps) {
  const { selectedEmpresaId } = useAuth()
  const [valores, setValores] = useState<Record<string, ValorBsc>>({})
  const [loading, setLoading] = useState(true)

  const group = groups.find((g) => g.key === groupKey)

  // UNA sola lectura del BSC por empresa/grupo (+ refresco cada 3 min). Alimenta
  // los KPIs del área Y las tareas del día del submódulo, así siempre coinciden.
  useEffect(() => {
    const keys = AREA_KPIS[groupKey] ?? []
    if (keys.length === 0 || !selectedEmpresaId) {
      setValores({})
      setLoading(false)
      return
    }
    let cancel = false
    const load = async () => {
      try {
        const { desde, hasta } = monthRange()
        const r = await getIndicadoresValores(selectedEmpresaId, desde, hasta)
        if (!cancel && r.success) setValores(r.valores as Record<string, ValorBsc>)
      } catch {
        // silencioso
      } finally {
        if (!cancel) setLoading(false)
      }
    }
    setLoading(true)
    load()
    const interval = setInterval(load, 180000)
    return () => {
      cancel = true
      clearInterval(interval)
    }
  }, [groupKey, selectedEmpresaId])

  // Tareas del día = KPIs del área bajo meta (crit/warn). Se muestran en el banner.
  const alertas = useMemo(() => alertasDesdeKpis(groupKey, valores), [groupKey, valores])

  if (!group) return null

  const GroupIcon = group.icon
  const tint = TINT[groupKey] ?? TEAL
  // Suma módulos directos + de subgrupos. (Antes daba 0 cuando `modules: []`
  // existía junto a subgrupos, porque el array vacío se tomaba como válido.)
  const totalModules =
    (group.modules?.length ?? 0) + (group.subgroups?.reduce((acc, sg) => acc + sg.modules.length, 0) ?? 0)

  return (
    <div className="space-y-5" style={{ "--tint": tint } as CSSProperties}>
      <style>{`
        .mod-card{ position:relative; display:flex; align-items:center; gap:11px; border-radius:14px;
          background:var(--card,#fff); border:1px solid #e7edf4; padding:11px 12px; text-align:left; cursor:pointer; overflow:hidden;
          transition:transform .16s ease, box-shadow .16s ease, border-color .16s ease; }
        /* Hairline de color que se enciende en hover */
        .mod-card::before{ content:""; position:absolute; inset:0; border-radius:14px; padding:1.2px; pointer-events:none;
          background:linear-gradient(135deg, color-mix(in srgb, var(--tint) 68%, transparent), transparent 60%);
          -webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite:xor; mask-composite:exclude;
          opacity:0; transition:opacity .16s; }
        .mod-card:hover{ transform:translateY(-2px); border-color:transparent;
          box-shadow:0 12px 26px color-mix(in srgb, var(--tint) 22%, transparent), 0 4px 10px rgba(20,42,68,.05); }
        .mod-card:hover::before{ opacity:1; }
        .mod-ico{ position:relative; z-index:1; width:34px; height:34px; flex:none; border-radius:10px;
          display:flex; align-items:center; justify-content:center;
          background:color-mix(in srgb, var(--tint) 14%, #fff); color:var(--tint);
          box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--tint) 20%, transparent);
          transition:transform .16s, background .16s, color .16s, box-shadow .16s; }
        .mod-card:hover .mod-ico{ transform:scale(1.06); color:#fff;
          background:linear-gradient(135deg, var(--tint), color-mix(in srgb, var(--tint) 62%, #000));
          box-shadow:0 6px 14px color-mix(in srgb, var(--tint) 40%, transparent); }
        .mod-name{ position:relative; z-index:1; flex:1; min-width:0; font-size:13px; font-weight:700;
          line-height:1.15; color:#132a44; letter-spacing:-.01em; }
        .mod-arrow{ position:relative; z-index:1; flex:none; color:var(--tint); opacity:0;
          transform:translateX(-5px); transition:opacity .16s, transform .16s; }
        .mod-card:hover .mod-arrow{ opacity:1; transform:none; }
        @media (prefers-reduced-motion:reduce){ .mod-card, .mod-card *{ transition:none !important; } .mod-card:hover{ transform:none } }
      `}</style>
      {/* Header compacto */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          aria-label="Volver"
          className="flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-accent"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span
          className="flex h-11 w-11 flex-none items-center justify-center rounded-xl"
          style={{
            background: `color-mix(in srgb, ${tint} 15%, #fff)`,
            color: tint,
            boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${tint} 22%, transparent)`,
          }}
        >
          <GroupIcon className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight text-foreground sm:text-2xl">{group.title}</h1>
          <p className="text-[13px] text-muted-foreground">
            Selecciona un módulo para continuar · {totalModules} módulo{totalModules !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Atención del día — tareas en riesgo/urgentes del área (KPIs bajo meta) */}
      <AtencionBanner alertas={alertas} />

      {/* Indicadores del área leídos del BSC (por empresa, en vivo) */}
      <AreaKpis groupKey={groupKey} valores={valores} loading={loading} />

      {/* KPIs de gestión del cliente alineados a los objetivos del área:
          Pedidos → cumplimiento de entregas (vencidos, por vencer).
          Despacho → operativo del día + eficiencia y vehículos por cerrar. */}
      {groupKey === "pedidos" && <PedidosKpiStrip />}
      {groupKey === "despachos" && (
        <>
          <DespachoKpiStrip />
          <VehiculosNoProcesadosCard />
        </>
      )}

      {/* Módulos directos */}
      {group.modules && group.modules.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {group.modules.map((m) => (
            <ModuleCard key={m.name} module={m} onSelect={onSelectModule} tint={tint} />
          ))}
        </div>
      )}

      {/* Subgrupos */}
      {group.subgroups &&
        group.subgroups.map((sg) => (
          <div key={sg.title} className="space-y-2.5">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{sg.title}</h2>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {sg.modules.map((m) => (
                <ModuleCard key={m.name} module={m} onSelect={onSelectModule} tint={tint} />
              ))}
            </div>
          </div>
        ))}
    </div>
  )
}
