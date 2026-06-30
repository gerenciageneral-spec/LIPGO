"use client"

/**
 * Estado de Resultados (Paso 1: shell + selector de periodo).
 *
 * Modulo del subgrupo Facturacion que consolida en un P&L mensual:
 *   - Ingresos: facturacion de toneladas + facturacion de turnos.
 *   - Costo de nomina: total liquidado del mes + provisiones de
 *     prestaciones sociales + provisiones de seguridad social.
 *   - Utilidad bruta: ingresos - costo de nomina.
 *   - Gastos: agrupados por categoria desde el modulo de Dashboard Gastos.
 *   - Utilidad neta: utilidad bruta - total gastos (con valor y %).
 *
 * En este Paso 1 solo se cablean:
 *   - Header del modulo.
 *   - Selector de periodo (Mes/Año + Quincena toda/Q1/Q2).
 *   - Lectura del idEmpresa global (TopBar) y guard para cuando no hay
 *     empresa seleccionada.
 *   - Placeholders de las 5 secciones, listas para que cada paso siguiente
 *     las llene con su calculo real.
 */

import { useMemo, useState } from "react"
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
import { Building2, CalendarRange, BarChart3 } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { useIngresos } from "./use-ingresos"
import SeccionIngresos from "./seccion-ingresos"
import { useCostoNomina } from "./use-costo-nomina"
import SeccionCostoNomina from "./seccion-costo-nomina"
import SeccionUtilidadBruta from "./seccion-utilidad-bruta"
import { useGastosPorCategoria } from "./use-gastos-por-categoria"
import SeccionGastos from "./seccion-gastos"
import SeccionUtilidadNeta from "./seccion-utilidad-neta"

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

/**
 * Calcula el rango de fechas (YYYY-MM-DD) que cubre el periodo elegido.
 * Q1 = dia 1 a 15, Q2 = dia 16 al ultimo dia del mes, "todo" = mes
 * completo.
 *
 * Devuelve:
 *  - `desde` (inclusive)        -> usar con `gte`
 *  - `hasta` (inclusive)        -> usar con `lte` cuando la columna es DATE
 *  - `hastaExclusivo` (dia +1)  -> usar con `lt` cuando la columna es
 *                                  TIMESTAMP (evita perder registros con
 *                                  hora > 00:00 del ultimo dia).
 */
export function getPeriodoRango(
  anio: number,
  mes: number,
  quincena: Quincena,
): {
  desde: string
  hasta: string
  hastaExclusivo: string
  label: string
} {
  const ultimoDia = new Date(anio, mes, 0).getDate()
  const pad = (n: number) => String(n).padStart(2, "0")

  const desdeDia = quincena === "q2" ? 16 : 1
  const hastaDia = quincena === "q1" ? 15 : ultimoDia

  const desde = `${anio}-${pad(mes)}-${pad(desdeDia)}`
  const hasta = `${anio}-${pad(mes)}-${pad(hastaDia)}`

  // Siguiente dia despues de "hasta". Cruza meses/anios sin problema
  // porque `new Date(y, m-1, d+1)` normaliza solo.
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
  }
}

// -----------------------------------------------------------------------------
// Componente principal
// -----------------------------------------------------------------------------

export default function EstadoResultados() {
  const { selectedEmpresaId, selectedEmpresaNombre } = useAuth()

  // Por defecto el periodo arranca en el mes actual completo.
  const hoy = useMemo(() => new Date(), [])
  const [anio, setAnio] = useState<number>(hoy.getFullYear())
  const [mes, setMes] = useState<number>(hoy.getMonth() + 1)
  const [quincena, setQuincena] = useState<Quincena>("todo")

  // Anios disponibles: ultimo 5 + actual + siguiente.
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

  // Hook de ingresos: se rehidrata cuando cambia empresa o periodo.
  // Si idEmpresa es null el hook no dispara fetch (key=null en SWR).
  const ingresos = useIngresos({
    idEmpresa: selectedEmpresaId,
    desde: periodo.desde,
    hasta: periodo.hasta,
    hastaExclusivo: periodo.hastaExclusivo,
  })

  // Hook de costo de nomina: total liquidado + provisiones de
  // prestaciones sociales y seguridad social. `pagonomina.fecha` es DATE
  // por lo que `hasta` inclusive con `lte` es suficiente.
  const costoNomina = useCostoNomina({
    idEmpresa: selectedEmpresaId,
    desde: periodo.desde,
    hasta: periodo.hasta,
  })

  // Hook de gastos: agrega por categoria en cliente. La tabla `gastos`
  // usa `id_empresa` (snake_case) y `fecha` (DATE).
  const gastos = useGastosPorCategoria({
    idEmpresa: selectedEmpresaId,
    desde: periodo.desde,
    hasta: periodo.hasta,
  })

  // Si no hay empresa activa, no podemos consultar nada multi-tenant.
  if (selectedEmpresaId == null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Estado de Resultados
          </CardTitle>
          <CardDescription>
            Selecciona una empresa en la barra superior para ver su estado
            de resultados.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ----------------------------------------------------------------- */}
      {/* Header del modulo                                                  */}
      {/* ----------------------------------------------------------------- */}
      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Estado de Resultados
              </CardTitle>
              <CardDescription>
                Consolida ingresos, costo de nomina con provisiones, gastos
                por categoria y utilidad neta del periodo.
              </CardDescription>
            </div>

            {/* Chip informativo de empresa activa */}
            <div
              className="flex items-center gap-2 self-start rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs"
              title="Empresa activa (cambia desde la barra superior)"
            >
              <Building2 className="h-3.5 w-3.5 text-primary" aria-hidden />
              <span className="font-semibold text-primary tabular-nums">
                #{selectedEmpresaId}
              </span>
              {selectedEmpresaNombre && (
                <>
                  <span className="text-primary/40">|</span>
                  <span className="max-w-[160px] truncate font-medium text-foreground/80">
                    {selectedEmpresaNombre}
                  </span>
                </>
              )}
            </div>
          </div>
        </CardHeader>

        {/* ----------------------------------------------------------------- */}
        {/* Selector de periodo: Mes + Anio + Quincena                        */}
        {/* ----------------------------------------------------------------- */}
        <CardContent>
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Mes
              </label>
              <Select
                value={String(mes)}
                onValueChange={(v) => setMes(Number(v))}
              >
                <SelectTrigger className="h-9 w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MESES.map((m) => (
                    <SelectItem key={m.value} value={String(m.value)}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Año
              </label>
              <Select
                value={String(anio)}
                onValueChange={(v) => setAnio(Number(v))}
              >
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

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Quincena
              </label>
              {/*
                Toggle de 3 estados (todo / Q1 / Q2). Al ser obligatorio
                un valor, si el usuario intenta deselectar caemos a "todo".
              */}
              <ToggleGroup
                type="single"
                value={quincena}
                onValueChange={(v) =>
                  setQuincena((v as Quincena) || "todo")
                }
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

            <div className="ml-auto flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <CalendarRange className="h-3.5 w-3.5" aria-hidden />
              <span>
                Periodo:{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {periodo.desde}
                </span>
                {" → "}
                <span className="font-semibold text-foreground tabular-nums">
                  {periodo.hasta}
                </span>
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ----------------------------------------------------------------- */}
      {/* Placeholders de las 5 secciones                                    */}
      {/* En los pasos 2-5 estos cards se reemplazaran por contenido real.   */}
      {/* ----------------------------------------------------------------- */}
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
        // Loading "real": cualquiera de las dos fuentes en vuelo. Asi el
        // usuario no ve un valor calculado a medias.
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
        utilidadBruta={
          (ingresos.data?.total ?? 0) -
          (costoNomina.data?.costoTotal ?? 0)
        }
        totalGastos={gastos.data?.total ?? 0}
        // Cualquiera de las 3 fuentes en vuelo => loading. Asi nunca
        // mostramos un calculo final a medio cocinar.
        isLoading={
          ingresos.isLoading || costoNomina.isLoading || gastos.isLoading
        }
      />
    </div>
  )
}
