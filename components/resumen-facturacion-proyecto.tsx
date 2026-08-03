"use client"

/**
 * Resumen de Facturación por Proyecto — página de CONSULTA (solo lectura).
 *
 * Por proyecto: cuánto se espera facturar (acuerdo de volúmenes,
 * `getAnalisisFinanciero`) contra a quién se factura DE VERDAD hoy
 * (`getControlFacturacion`, la fuente canónica — ya trae la regla de owner/
 * transportadora de Avimol: Zamudio/Terceros se facturan directo, las placas
 * propias van cubiertas por el fijo de Cargos Fijos). Mismo motor que Cuadro
 * de Control y Análisis Financiero, así los tres cuadran entre sí.
 *
 * No tiene edición: es un layout de referencia rápida, pedido por gerencia
 * 2026-08-02 después de revisar el desglose de Avimol.
 */

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { KpiCard } from "@/components/orders/dashboard-pedidos/kpi-card"
import { Target, DollarSign, TrendingUp, Scale } from "lucide-react"
import { getAccessibleEmpresesFromPermisos } from "@/lib/orders-actions"
import { getControlFacturacion, type ResumenOwner } from "@/lib/facturacion-control-actions"
import { getAnalisisFinanciero } from "@/lib/analisis-financiero-actions"

const money = (n: number) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO")
const moneyS = (n: number) => (n < 0 ? "−" : "") + "$" + Math.abs(Math.round(Number(n) || 0)).toLocaleString("es-CO")
const ton = (n: number) => (Number(n) || 0).toLocaleString("es-CO", { maximumFractionDigits: 1 })

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

function periodoDe(anio: number, mes: number) {
  const pad = (n: number) => String(n).padStart(2, "0")
  if (mes === 0) {
    return { desde: `${anio}-01-01`, hasta: `${anio}-12-31`, meses: 12, label: `${anio} (año completo)` }
  }
  const ultimoDia = new Date(anio, mes, 0).getDate()
  const mesLabel = MESES.find((m) => m.value === mes)?.label ?? ""
  return { desde: `${anio}-${pad(mes)}-01`, hasta: `${anio}-${pad(mes)}-${pad(ultimoDia)}`, meses: 1, label: `${mesLabel} ${anio}` }
}

// ---------------------------------------------------------------------------
// Tarjeta de un proyecto
// ---------------------------------------------------------------------------

function ProyectoResumen({
  id,
  nombre,
  desde,
  hasta,
  meses,
}: {
  id: number
  nombre: string
  desde: string
  hasta: string
  meses: number
}) {
  const cuadro = useSWR(["resumen-facturacion:cuadro", id, desde, hasta], () =>
    getControlFacturacion(id, { desde, hasta }),
  )
  const analisis = useSWR(["resumen-facturacion:analisis", id, desde, hasta], () =>
    getAnalisisFinanciero([id], desde, hasta, meses),
  )

  if (cuadro.isLoading || analisis.isLoading) {
    return <Skeleton className="h-72 w-full" />
  }
  if (!cuadro.data?.success || !cuadro.data.data) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{nombre}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-red-600">{cuadro.data?.message || "No se pudo cargar."}</CardContent>
      </Card>
    )
  }

  const c = cuadro.data.data
  const proyectoAcuerdo = analisis.data?.success ? (analisis.data.data?.proyectos[0] ?? null) : null
  const esperado = proyectoAcuerdo?.totalFacturaAcordada ?? null
  const real = c.totales.valor_a_facturar
  const diferencia = esperado !== null ? real - esperado : null

  const filas: ResumenOwner[] = [...c.porOwner].sort((x, y) => {
    if (x.bloque !== y.bloque) return x.bloque === "operacion" ? -1 : 1
    return y.valor_a_facturar - x.valor_a_facturar
  })

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{nombre}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Esperado (acuerdo)" value={esperado !== null ? money(esperado) : "—"} icon={Target} />
          <KpiCard label="Real facturado" value={money(real)} icon={DollarSign} />
          <KpiCard
            label="Diferencia (real − esperado)"
            value={diferencia !== null ? moneyS(diferencia) : "—"}
            icon={TrendingUp}
            variant={diferencia === null ? "primary" : diferencia < 0 ? "danger" : "success"}
          />
          <KpiCard
            label="Cumplimiento de volumen"
            value={proyectoAcuerdo?.cumplimientoPct != null ? `${proyectoAcuerdo.cumplimientoPct}%` : "—"}
            icon={Scale}
          />
        </div>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="text-[11px]">
                <TableHead>Operación</TableHead>
                <TableHead>Facturado a</TableHead>
                <TableHead className="text-right">Toneladas</TableHead>
                <TableHead className="text-right">Valor real</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((f, i) => {
                const cubierto = f.valor_a_facturar === 0 && f.toneladas > 0
                return (
                  <TableRow key={i} className={cubierto ? "text-muted-foreground" : ""}>
                    <TableCell className="text-xs">{f.operacion}</TableCell>
                    <TableCell className="text-xs">
                      {f.owner}
                      {cubierto && " (cubierto por fijo)"}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {f.unidad === "t" ? `${ton(f.toneladas)} t` : `${ton(f.toneladas)} ${f.unidad}`}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{money(f.valor_a_facturar)}</TableCell>
                  </TableRow>
                )
              })}
              <TableRow className="border-t-2 font-semibold">
                <TableCell colSpan={3} className="text-xs">
                  TOTAL FACTURADO
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">{money(real)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export default function ResumenFacturacionProyecto() {
  const [empresas, setEmpresas] = useState<Array<{ id: number; nombre: string }>>([])
  useEffect(() => {
    getAccessibleEmpresesFromPermisos()
      .then(setEmpresas)
      .catch(() => setEmpresas([]))
  }, [])

  const hoy = useMemo(() => new Date(), [])
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [mes, setMes] = useState(hoy.getMonth() + 1) // 0 = todo el año
  const periodo = useMemo(() => periodoDe(anio, mes), [anio, mes])
  const anios = useMemo(() => {
    const base = hoy.getFullYear()
    const list: number[] = []
    for (let y = base - 2; y <= base + 1; y++) list.push(y)
    return list
  }, [hoy])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Resumen de Facturación por Proyecto</h2>
          <p className="text-sm text-muted-foreground">
            Consulta rápida: lo esperado según el acuerdo de volúmenes contra a quién se factura de verdad, proyecto
            por proyecto.
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
            <SelectTrigger className="w-[160px]">
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
          <Select value={String(anio)} onValueChange={(v) => setAnio(Number(v))}>
            <SelectTrigger className="w-[100px]">
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
      </div>

      {empresas.length === 0 ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        empresas.map((e) => (
          <ProyectoResumen key={e.id} id={e.id} nombre={e.nombre} desde={periodo.desde} hasta={periodo.hasta} meses={periodo.meses} />
        ))
      )}
    </div>
  )
}
