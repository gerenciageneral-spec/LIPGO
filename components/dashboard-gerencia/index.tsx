"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { Loader2, AlertCircle } from "lucide-react"
import { ExecutiveHeader } from "./executive-header"
import { SubNav, type GerenciaSection } from "./sub-nav"
import { KpiRow } from "./kpi-row"
import { OperacionVivoRow } from "./operacion-vivo-row"
import { AnaliticaAlertasRow } from "./analitica-alertas-row"
import { CoberturaNacionalSection } from "./cobertura-nacional-section"
import { ObjetivosEstrategicosSection } from "./objetivos-estrategicos-section"
import { SatisfaccionClienteSection } from "./satisfaccion-cliente-section"
import {
  getGerenciaDashboardData,
  type DashboardGerenciaPayload,
} from "@/lib/dashboard-gerencia-actions"
import { useAuth } from "@/components/auth-provider"

/**
 * Frecuencia de auto-refresh en ms. El centro de control necesita datos
 * recientes pero las consultas agrupan 5+ tablas; 60s es el punto dulce
 * entre frescura y carga al backend.
 */
const REFRESH_MS = 60_000

/**
 * Dashboard Gerencia — shell principal con fetch + auto-refresh.
 *
 * Ciclo 5:
 *  - Consulta un unico endpoint server-side (`getGerenciaDashboardData`)
 *    que a su vez hace fetch en paralelo a todas las fuentes.
 *  - Mantiene la data previa mientras carga la siguiente actualizacion
 *    (refresco "silencioso"), evitando flicker.
 *  - Expone estado de loading / error y un indicador visual sutil.
 *
 * Ciclo LIPGO:
 *  - Migrado al tema claro de la marca (#F4F7FC fondo, #ffffff cards,
 *    #5bc0de primary, #343a40 texto, #dee2e6 bordes).
 */
export default function DashboardGerencia() {
  const { selectedEmpresaId } = useAuth()
  const [section, setSection] = useState<GerenciaSection>("operaciones")
  const [payload, setPayload] = useState<DashboardGerenciaPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const mounted = useRef(true)

  const load = useCallback(async (silent: boolean) => {
    if (silent) setRefreshing(true)
    try {
      const res = await getGerenciaDashboardData(selectedEmpresaId ?? undefined)
      if (!mounted.current) return
      if (res.success && res.data) {
        setPayload(res.data)
        setError(null)
      } else {
        setError(res.error || "Error al cargar datos")
      }
    } catch (e) {
      if (mounted.current) setError("No se pudo conectar al servidor")
    } finally {
      if (mounted.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [selectedEmpresaId])

  useEffect(() => {
    mounted.current = true
    // Primera carga — visible
    load(false)
    // Auto-refresh silencioso
    const id = setInterval(() => load(true), REFRESH_MS)
    return () => {
      mounted.current = false
      clearInterval(id)
    }
  }, [load])

  return (
    <div className="relative min-h-[calc(100vh-4rem)] w-full overflow-hidden rounded-xl">
      {/* Fondo base LIPGO (F4F7FC) */}
      <div className="absolute inset-0 bg-background" aria-hidden="true" />

      {/* Capa de luz ambiental — washes sutiles en cian LIPGO */}
      <div
        className="absolute inset-0 opacity-80 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(1200px 600px at 0% 0%, rgba(91,192,222,0.10), transparent 60%)," +
            "radial-gradient(900px 500px at 100% 0%, rgba(13,202,240,0.07), transparent 55%)," +
            "radial-gradient(1000px 600px at 50% 100%, rgba(25,135,84,0.05), transparent 60%)",
        }}
      />

      {/* Grilla sutil tipo HUD — lineas gris claro sobre fondo claro */}
      <div
        className="absolute inset-0 opacity-[0.5] pointer-events-none"
        aria-hidden="true"
        style={{
          backgroundImage:
            "linear-gradient(rgba(52,58,64,0.04) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(52,58,64,0.04) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Contenido */}
      <div className="relative z-10 flex flex-col gap-4 p-4 md:p-6">
        <ExecutiveHeader />

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <SubNav active={section} onChange={setSection} />
          <RefreshIndicator
            refreshing={refreshing}
            generatedAt={payload?.generatedAt}
          />
        </div>

        <section className="flex-1 flex flex-col gap-4">
          {section === "operaciones" &&
            (loading && !payload ? (
              <InitialSkeleton />
            ) : error && !payload ? (
              <ErrorState message={error} onRetry={() => load(false)} />
            ) : (
              <>
                <KpiRow data={payload?.kpis} loading={refreshing} />
                <OperacionVivoRow
                  recibo={payload?.recibo}
                  almacen={payload?.almacen}
                  rutas={payload?.rutas}
                />
                <AnaliticaAlertasRow
                  productividad={payload?.productividadSemanal}
                  pickingPacking={payload?.pickingPacking}
                />
              </>
            ))}

          {section === "cobertura" && (
            <div
              key="cobertura"
              className="animate-in fade-in slide-in-from-bottom-2 duration-500"
            >
              <CoberturaNacionalSection />
            </div>
          )}
          {section === "objetivos" && (
            <div
              key="objetivos"
              className="animate-in fade-in slide-in-from-bottom-2 duration-500"
            >
              <ObjetivosEstrategicosSection />
            </div>
          )}
          {section === "satisfaccion" && (
            <div
              key="satisfaccion"
              className="animate-in fade-in slide-in-from-bottom-2 duration-500"
            >
              <SatisfaccionClienteSection />
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------------- */
/* UI auxiliares                                                          */
/* --------------------------------------------------------------------- */

function RefreshIndicator({
  refreshing,
  generatedAt,
}: {
  refreshing: boolean
  generatedAt?: string
}) {
  const label = generatedAt
    ? new Date(generatedAt).toLocaleTimeString("es-CO", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
    : "--:--:--"

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border shadow-sm">
      {refreshing ? (
        <Loader2 className="h-3 w-3 text-[#5bc0de] animate-spin" />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
      )}
      <span className="text-[11px] tracking-wider text-muted-foreground uppercase">
        {refreshing ? "Actualizando" : "En vivo"}
      </span>
      <span className="text-[11px] font-mono text-muted-foreground/80">· {label}</span>
    </div>
  )
}

function InitialSkeleton() {
  // Tres bloques tipo skeleton para mantener altura estable mientras carga.
  return (
    <div className="flex flex-col gap-4 animate-pulse" aria-label="Cargando dashboard">
      <div
        className="grid gap-3 md:gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}
      >
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="h-32 rounded-2xl border border-border bg-card/60"
          />
        ))}
      </div>
      <div className="grid gap-3 md:gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-72 rounded-2xl border border-border bg-card/60"
          />
        ))}
      </div>
      <div className="grid gap-3 md:gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-80 rounded-2xl border border-border bg-card/60"
          />
        ))}
      </div>
    </div>
  )
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className="rounded-2xl border border-rose-300 bg-rose-50 p-10 shadow-sm">
      <div className="mx-auto flex max-w-xl flex-col items-center text-center gap-3">
        <div className="h-14 w-14 rounded-2xl bg-rose-100 border border-rose-300 flex items-center justify-center">
          <AlertCircle className="h-6 w-6 text-rose-600" />
        </div>
        <h2 className="text-lg md:text-xl font-bold text-foreground">
          No se pudieron cargar los datos
        </h2>
        <p className="text-sm text-muted-foreground">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 px-4 py-2 rounded-lg bg-[#5bc0de] hover:bg-[#48b1d0] text-white text-sm font-semibold transition-colors shadow-sm"
        >
          Reintentar
        </button>
      </div>
    </div>
  )
}
