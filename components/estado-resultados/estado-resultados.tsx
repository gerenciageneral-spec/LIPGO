"use client"

/**
 * Estado de Resultados — P&L por proyecto o de TODA la empresa (LIP).
 *
 * Consolida por periodo (quincena, mes o AÑO COMPLETO):
 *   - Ingresos: toneladas + turnos (vista) + producción/turnos/HE de Avimol
 *     (conciliación) + cargos fijos — cada fila con drill-down.
 *   - Costo de nomina: total liquidado + provisiones.
 *   - Utilidad bruta, gastos por categoria y utilidad neta.
 *
 * El PROYECTO se elige con un selector PROPIO del modulo (arranca en el
 * global pero no depende de el), con la opcion "Todos los proyectos (LIP)"
 * para ver el total de la empresa — el selector global no permite eso.
 *
 * Pestaña "Análisis Financiero": acuerdos de volúmenes por proyecto
 * (CONFIDENCIAL — vive solo en la BD), acordado vs real, déficit y $
 * adicionales a facturar. Ver lib/analisis-financiero-actions.ts.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Building2, CalendarRange, BarChart3, AlertTriangle } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { getAccessibleEmpresesFromPermisos } from "@/lib/orders-actions"
import { getAnalisisFinanciero } from "@/lib/analisis-financiero-actions"
import { useIngresos } from "./use-ingresos"
import SeccionIngresos from "./seccion-ingresos"
import { useCostoNomina } from "./use-costo-nomina"
import SeccionCostoNomina from "./seccion-costo-nomina"
import SeccionUtilidadBruta from "./seccion-utilidad-bruta"
import { useGastosPorCategoria } from "./use-gastos-por-categoria"
import SeccionGastos from "./seccion-gastos"
import SeccionUtilidadNeta from "./seccion-utilidad-neta"
import AnalisisFinanciero from "./analisis-financiero"

// -----------------------------------------------------------------------------
// Catalogos del selector de periodo
// -----------------------------------------------------------------------------

const MESES = [
  { value: 1, label: "Enero" },
  { value: 2, label: "Febrero" },
  { value: 3, label: "Marzo" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Mayo" },
  { value: 6, label: "Junio" },
  { value: 7, label: "Julio" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Septiembre" },
  { value: 10, label: "Octubre" },
  { value: 11, label: "Noviembre" },
  { value: 12, label: "Diciembre" },
] as const

type Quincena = "todo" | "q1" | "q2"

/** Mes 0 = "Todo el año". */
export function getPeriodoRango(
  anio: number,
  mes: number,
  quincena: Quincena,
): {
  desde: string
  hasta: string
  hastaExclusivo: string
  label: string
  /** Meses que cubre el periodo (0,5 quincena · 1 mes · 12 año). */
  meses: number
} {
  const pad = (n: number) => String(n).padStart(2, "0")

  // AÑO COMPLETO
  if (mes === 0) {
    return {
      desde: `${anio}-01-01`,
      hasta: `${anio}-12-31`,
      hastaExclusivo: `${anio + 1}-01-01`,
      label: `${anio} (año completo)`,
      meses: 12,
    }
  }

  const ultimoDia = new Date(anio, mes, 0).getDate()
  const desdeDia = quincena === "q2" ? 16 : 1
  const hastaDia = quincena === "q1" ? 15 : ultimoDia

  const desde = `${anio}-${pad(mes)}-${pad(desdeDia)}`
  const hasta = `${anio}-${pad(mes)}-${pad(hastaDia)}`

  const exclusivo = new Date(anio, mes - 1, hastaDia + 1)
  const hastaExclusivo = `${exclusivo.getFullYear()}-${pad(
    exclusivo.getMonth() + 1,
  )}-${pad(exclusivo.getDate())}`

  const mesLabel = MESES.find((m) => m.value === mes)?.label ?? ""
  const sufijo =
    quincena === "q1"
      ? " (Q1: 1-15)"
      : quincena === "q2"
        ? ` (Q2: 16-${ultimoDia})`
        : ""

  return {
    desde,
    hasta,
    hastaExclusivo,
    label: `${mesLabel} ${anio}${sufijo}`,
    meses: quincena === "todo" ? 1 : 0.5,
  }
}

const money = (n: number) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO")

// -----------------------------------------------------------------------------
// Componente principal
// -----------------------------------------------------------------------------

export default function EstadoResultados() {
  const { selectedEmpresaId } = useAuth()

  // ---------------------------------------------------------------------------
  // Selector de PROYECTO propio del modulo. Arranca en el global cuando
  // resuelve, pero no lo pisa si el usuario ya eligio a mano. La opcion
  // "todos" suma todos los proyectos accesibles (total LIP).
  // ---------------------------------------------------------------------------
  const [empresas, setEmpresas] = useState<Array<{ id: number; nombre: string }>>([])
  const [alcance, setAlcance] = useState<number | "todos" | null>(null)
  const eleccionManual = useRef(false)

  useEffect(() => {
    getAccessibleEmpresesFromPermisos()
      .then((list) => {
        setEmpresas(list)
        setAlcance((prev) => prev ?? selectedEmpresaId ?? list[0]?.id ?? null)
      })
      .catch(() => setEmpresas([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (selectedEmpresaId && !eleccionManual.current) setAlcance(selectedEmpresaId)
  }, [selectedEmpresaId])

  const ids = useMemo(() => {
    if (alcance === "todos") return empresas.map((e) => e.id)
    return alcance ? [Number(alcance)] : []
  }, [alcance, empresas])

  const alcanceLabel =
    alcance === "todos"
      ? "Todos los proyectos (LIP)"
      : (empresas.find((e) => e.id === alcance)?.nombre ?? (alcance ? `Empresa ${alcance}` : "—"))

  // Por defecto el periodo arranca en el mes actual completo.
  const hoy = useMemo(() => new Date(), [])
  const [anio, setAnio] = useState<number>(hoy.getFullYear())
  const [mes, setMes] = useState<number>(hoy.getMonth() + 1) // 0 = año completo
  const [quincena, setQuincena] = useState<Quincena>("todo")

  const anios = useMemo(() => {
    const base = hoy.getFullYear()
    const list: number[] = []
    for (let y = base - 5; y <= base + 1; y++) list.push(y)
    return list
  }, [hoy])

  const periodo = useMemo(
    () => getPeriodoRango(anio, mes, quincena),
    [anio, mes, quincena],
  )

  const ingresos = useIngresos({
    ids,
    desde: periodo.desde,
    hasta: periodo.hasta,
    hastaExclusivo: periodo.hastaExclusivo,
  })

  const costoNomina = useCostoNomina({
    ids,
    desde: periodo.desde,
    hasta: periodo.hasta,
  })

  const gastos = useGastosPorCategoria({
    ids,
    desde: periodo.desde,
    hasta: periodo.hasta,
  })

  // Analisis financiero del periodo (acuerdos de volumenes): alimenta la
  // pestaña 2 y el aviso de deficit en la pestaña 1.
  const analisis = useSWR(
    ids.length > 0 ? ["estado-resultados:analisis", ids.join(","), periodo.desde, periodo.hasta] : null,
    () => getAnalisisFinanciero(ids, periodo.desde, periodo.hasta, periodo.meses),
    { revalidateOnFocus: false, keepPreviousData: true },
  )
  const totalAFacturarAdicional = analisis.data?.success
    ? (analisis.data.data?.proyectos ?? []).reduce((a, p) => a + p.totalAFacturarAdicional, 0)
    : 0

  if (ids.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Estado de Resultados
          </CardTitle>
          <CardDescription>Cargando proyectos accesibles…</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header + selectores */}
      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Estado de Resultados
              </CardTitle>
              <CardDescription>
                Consolida ingresos, costo de nomina con provisiones, gastos por
                categoria y utilidad neta del periodo.
              </CardDescription>
            </div>

            {/* Selector de PROYECTO propio (independiente del global) */}
            <div className="flex items-center gap-2 self-start">
              <Building2 className="h-4 w-4 text-primary" aria-hidden />
              <Select
                value={alcance === null ? "" : String(alcance)}
                onValueChange={(v) => {
                  eleccionManual.current = true
                  setAlcance(v === "todos" ? "todos" : Number(v))
                }}
              >
                <SelectTrigger className="h-9 w-[240px] font-medium">
                  <SelectValue placeholder="Proyecto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los proyectos (LIP)</SelectItem>
                  {empresas.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>
                      {e.nombre} (ID {e.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        {/* Selector de periodo: Mes (o Año completo) + Año + Quincena */}
        <CardContent>
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Mes</label>
              <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
                <SelectTrigger className="h-9 w-[170px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Todo el año</SelectItem>
                  {MESES.map((m) => (
                    <SelectItem key={m.value} value={String(m.value)}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Año</label>
              <Select value={String(anio)} onValueChange={(v) => setAnio(Number(v))}>
                <SelectTrigger className="h-9 w-[110px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {anios.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {mes !== 0 && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Quincena</label>
                <ToggleGroup
                  type="single"
                  value={quincena}
                  onValueChange={(v) => setQuincena((v as Quincena) || "todo")}
                  className="h-9"
                >
                  <ToggleGroupItem value="todo" className="px-3 text-xs">
                    Todo el mes
                  </ToggleGroupItem>
                  <ToggleGroupItem value="q1" className="px-3 text-xs">
                    Q1 (1-15)
                  </ToggleGroupItem>
                  <ToggleGroupItem value="q2" className="px-3 text-xs">
                    Q2 (16-fin)
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            )}

            <div className="ml-auto flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <CalendarRange className="h-3.5 w-3.5" aria-hidden />
              <span>
                {alcanceLabel} ·{" "}
                <span className="font-semibold text-foreground tabular-nums">{periodo.desde}</span>
                {" → "}
                <span className="font-semibold text-foreground tabular-nums">{periodo.hasta}</span>
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="pyl">
        <TabsList>
          <TabsTrigger value="pyl">Estado de Resultados</TabsTrigger>
          <TabsTrigger value="analisis">Análisis Financiero</TabsTrigger>
        </TabsList>

        <TabsContent value="pyl" className="mt-4 flex flex-col gap-4">
          {/* Aviso de deficit de volumen: si hay que facturar algo adicional,
              el P&L lo dice de frente — impacta directo la utilidad. */}
          {totalAFacturarAdicional > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-400 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span className="text-amber-900 dark:text-amber-200">
                Volumen por debajo del acuerdo en este periodo:{" "}
                <span className="font-semibold">{money(totalAFacturarAdicional)} por facturar al cliente</span>
                {" — ver la pestaña Análisis Financiero."}
              </span>
            </div>
          )}

          <SeccionIngresos
            data={ingresos.data}
            isLoading={ingresos.isLoading}
            error={ingresos.error}
            periodoLabel={periodo.label}
          />
          <SeccionCostoNomina
            data={costoNomina.data}
            isLoading={costoNomina.isLoading}
            error={costoNomina.error}
            periodoLabel={periodo.label}
          />
          <SeccionUtilidadBruta
            totalIngresos={ingresos.data?.total ?? 0}
            costoTotalNomina={costoNomina.data?.costoTotal ?? 0}
            isLoading={ingresos.isLoading || costoNomina.isLoading}
          />
          <SeccionGastos
            data={gastos.data}
            isLoading={gastos.isLoading}
            error={gastos.error}
            periodoLabel={periodo.label}
          />
          <SeccionUtilidadNeta
            totalIngresos={ingresos.data?.total ?? 0}
            utilidadBruta={(ingresos.data?.total ?? 0) - (costoNomina.data?.costoTotal ?? 0)}
            totalGastos={gastos.data?.total ?? 0}
            isLoading={ingresos.isLoading || costoNomina.isLoading || gastos.isLoading}
          />
        </TabsContent>

        <TabsContent value="analisis" className="mt-4">
          <AnalisisFinanciero
            data={analisis.data?.success ? (analisis.data.data ?? null) : null}
            error={analisis.data && !analisis.data.success ? analisis.data.message : undefined}
            isLoading={analisis.isLoading}
            periodoLabel={periodo.label}
            refrescar={() => analisis.mutate()}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
