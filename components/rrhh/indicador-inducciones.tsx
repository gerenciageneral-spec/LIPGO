"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { CalendarClock, CheckCircle2, ListChecks, AlertCircle } from "lucide-react"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import {
  getIndicadorInducciones,
  type IndicadorInducciones,
} from "@/lib/inducciones-actions"

const AHORA = new Date()
const ANIOS = Array.from({ length: 4 }, (_, i) => AHORA.getFullYear() - 1 + i)

const chartConfig = {
  programadas: { label: "Programadas", color: "var(--chart-2)" },
  ejecutadas: { label: "Ejecutadas", color: "var(--chart-3)" },
} satisfies ChartConfig

interface Props {
  idempresa: number | null
}

export function IndicadorInduccionesTab({ idempresa }: Props) {
  const [anio, setAnio] = useState(String(AHORA.getFullYear()))
  const [data, setData] = useState<IndicadorInducciones | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const res = await getIndicadorInducciones(parseInt(anio, 10), idempresa)
      if (!cancelled) {
        setData(res.success ? res.data : null)
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [anio, idempresa])

  const cumplimiento =
    data && data.totalProgramadas > 0
      ? Math.round((data.totalEjecutadas / data.totalProgramadas) * 100)
      : 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Inducciones programadas vs. ejecutadas, mes a mes.
        </p>
        <Select value={anio} onValueChange={setAnio}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ANIOS.map((a) => (
              <SelectItem key={a} value={String(a)}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
          <Skeleton className="h-72 w-full" />
        </div>
      ) : !data ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No se pudo cargar el indicador.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Tarjetas resumen */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard
              icon={<ListChecks className="h-5 w-5 text-[var(--chart-2)]" />}
              label="Programadas"
              value={data.totalProgramadas}
            />
            <SummaryCard
              icon={<CheckCircle2 className="h-5 w-5 text-[var(--chart-3)]" />}
              label="Ejecutadas"
              value={data.totalEjecutadas}
            />
            <SummaryCard
              icon={<CalendarClock className="h-5 w-5 text-primary" />}
              label="Cumplimiento"
              value={`${cumplimiento}%`}
            />
            <SummaryCard
              icon={<AlertCircle className="h-5 w-5 text-muted-foreground" />}
              label="Sin programar"
              value={data.sinProgramar}
            />
          </div>

          {/* Grafico de barras */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Detalle mensual {data.anio}</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-72 w-full">
                <BarChart accessibilityLayer data={data.meses} margin={{ top: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="programadas" fill="var(--color-programadas)" radius={4} />
                  <Bar dataKey="ejecutadas" fill="var(--color-ejecutadas)" radius={4} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Tabla mensual */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Tabla mensual</CardTitle>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Mes</TableHead>
                    <TableHead className="text-center">Programadas</TableHead>
                    <TableHead className="text-center">Ejecutadas</TableHead>
                    <TableHead className="text-center">Pendientes</TableHead>
                    <TableHead className="text-center">Cumplimiento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.meses.map((m) => {
                    const pend = m.programadas - m.ejecutadas
                    const pct =
                      m.programadas > 0
                        ? Math.round((m.ejecutadas / m.programadas) * 100)
                        : 0
                    return (
                      <TableRow key={m.mes}>
                        <TableCell className="font-medium">{m.label}</TableCell>
                        <TableCell className="text-center">{m.programadas}</TableCell>
                        <TableCell className="text-center">{m.ejecutadas}</TableCell>
                        <TableCell className="text-center">{pend}</TableCell>
                        <TableCell className="text-center">
                          {m.programadas > 0 ? (
                            <Badge
                              variant="outline"
                              className={
                                pct === 100
                                  ? "border-transparent bg-[color-mix(in_oklch,var(--chart-3)_18%,transparent)] text-[var(--chart-3)]"
                                  : "text-muted-foreground"
                              }
                            >
                              {pct}%
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: number | string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          {icon}
        </span>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}
