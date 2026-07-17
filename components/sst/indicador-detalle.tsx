"use client"

// Vista/ficha de UN indicador del SG-SST (0312). Reutilizable: se abre desde el
// Tablero de indicadores y desde la Matriz 0312 (al tocar el numeral 3.3.x).
// Trae sus propios datos de sst_indicadores (LIP 100) por tipo + año.

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { SST_TOKENS } from "@/components/sst/sst-utils"
import { listIndicadores } from "@/lib/sst-plan-actions"
import type { IndicadorRow } from "@/lib/sst-evidencia-types"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"

export const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

export interface Ficha {
  tipo: string
  numeral?: string
  nombre: string
  definicion: string
  formula: string
  interpretacion: string
  fuente: string
  periodicidad: string
  responsable: string
  sentido: "menor" | "mayor"
  clase: "resultado" | "gestion"
}

export const FICHAS: Ficha[] = [
  { tipo: "frecuencia_at", numeral: "3.3.2", nombre: "Frecuencia de accidentalidad", clase: "resultado", sentido: "menor",
    definicion: "Relación entre el número de accidentes de trabajo y el número de trabajadores en el período.",
    formula: "(N.º de AT / N.º de trabajadores) × 100", interpretacion: "AT por cada 100 trabajadores.",
    fuente: "Registro de AT / investigaciones (LIPgo)", periodicidad: "Mensual", responsable: "Coordinador SST" },
  { tipo: "severidad_at", numeral: "3.3.1", nombre: "Severidad de accidentalidad", clase: "resultado", sentido: "menor",
    definicion: "Días perdidos por AT en relación con el número de trabajadores.",
    formula: "(N.º de días perdidos por AT / N.º de trabajadores) × 100", interpretacion: "Días perdidos por cada 100 trabajadores.",
    fuente: "Incapacidades por AT (LIPgo)", periodicidad: "Mensual", responsable: "Coordinador SST" },
  { tipo: "mortalidad_at", numeral: "3.3.3", nombre: "Mortalidad por AT/EL", clase: "resultado", sentido: "menor",
    definicion: "Proporción de accidentes de trabajo mortales frente al total de AT.",
    formula: "(N.º de AT mortales / N.º total de AT) × 100", interpretacion: "% de AT que fueron mortales.",
    fuente: "Registro de AT (LIPgo)", periodicidad: "Anual", responsable: "Coordinador SST" },
  { tipo: "prevalencia_el", numeral: "3.3.4", nombre: "Prevalencia de enfermedad laboral", clase: "resultado", sentido: "menor",
    definicion: "Número de casos de EL (nuevos y antiguos) en relación con los trabajadores.",
    formula: "(N.º de casos EL / N.º de trabajadores) × 100.000", interpretacion: "Casos de EL por cada 100.000 trabajadores.",
    fuente: "Diagnóstico EL / EPS-ARL", periodicidad: "Anual", responsable: "Coordinador SST" },
  { tipo: "incidencia_el", numeral: "3.3.5", nombre: "Incidencia de enfermedad laboral", clase: "resultado", sentido: "menor",
    definicion: "Número de casos NUEVOS de EL en relación con los trabajadores.",
    formula: "(N.º de casos nuevos EL / N.º de trabajadores) × 100.000", interpretacion: "Casos nuevos de EL por cada 100.000 trabajadores.",
    fuente: "Diagnóstico EL / EPS-ARL", periodicidad: "Anual", responsable: "Coordinador SST" },
  { tipo: "ausentismo", numeral: "3.3.6", nombre: "Ausentismo por causa médica", clase: "resultado", sentido: "menor",
    definicion: "Días de ausencia por causa médica frente a los días de trabajo programados.",
    formula: "(N.º de días de ausencia médica / N.º de días programados) × 100", interpretacion: "% de tiempo perdido por causa médica.",
    fuente: "Control diario / incapacidades (LIPgo)", periodicidad: "Mensual", responsable: "Coordinador SST" },
  { tipo: "investigaciones", nombre: "Cumplimiento de investigación de AT/incidentes", clase: "gestion", sentido: "mayor",
    definicion: "Investigaciones de AT/incidentes realizadas frente a las requeridas.",
    formula: "(Investigaciones realizadas / requeridas) × 100", interpretacion: "% de eventos investigados.",
    fuente: "Investigaciones (LIPgo)", periodicidad: "Mensual", responsable: "Coordinador SST" },
  { tipo: "rotacion_personal", nombre: "Índice de rotación de personal", clase: "gestion", sentido: "menor",
    definicion: "Retiros de personal frente al promedio de empleados.",
    formula: "(Retiros / promedio de empleados) × 100", interpretacion: "% de rotación del personal.",
    fuente: "Head Count / novedades (LIPgo)", periodicidad: "Mensual", responsable: "Coordinador SST" },
]
export const fichaDe = (t: string) => FICHAS.find((f) => f.tipo === t)

export function enMeta(valor: number | null, meta: number | null, sentido: "menor" | "mayor") {
  if (valor == null || meta == null) return null
  return sentido === "menor" ? valor <= meta : valor >= meta
}

export function IndicadorDetalle({ tipo, anio }: { tipo: string; anio: string | number }) {
  const [rows, setRows] = useState<IndicadorRow[] | null>(null)
  useEffect(() => {
    let cancel = false
    listIndicadores(null)
      .then((r) => {
        if (!cancel) setRows(r)
      })
      .catch(() => {
        if (!cancel) setRows([])
      })
    return () => {
      cancel = true
    }
  }, [])

  const f = fichaDe(tipo)
  const A = String(anio)
  const P = String(Number(anio) - 1)

  if (!f) return null
  if (rows === null) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Cargando indicador…
      </div>
    )
  }

  const anual = rows.find((r) => r.tipo === tipo && r.periodo === A) ?? null
  const prev = rows.find((r) => r.tipo === tipo && r.periodo === P) ?? null
  const mens: (number | null)[] = Array(12).fill(null)
  for (const r of rows) {
    if (r.tipo !== tipo) continue
    const m = String(r.periodo).match(new RegExp(`^${A}-(\\d{2})$`))
    if (m) mens[Number(m[1]) - 1] = r.valor
  }
  const valor = anual?.valor ?? null
  const meta = anual?.meta ?? null
  const ok = enMeta(valor, meta, f.sentido)
  const color = ok == null ? SST_TOKENS.grey : ok ? SST_TOKENS.ok : SST_TOKENS.bad
  const delta = valor != null && prev?.valor != null ? Math.round((valor - prev.valor) * 10) / 10 : null
  const chart = mens.map((v, i) => ({ mes: MESES[i], valor: v }))

  return (
    <div className="space-y-4 text-sm">
      {/* Encabezado: valor consolidado + meta + semáforo */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="text-4xl font-extrabold tabular-nums" style={{ color }}>
            {valor ?? "—"}
          </span>
          <span className="ml-2 text-sm text-muted-foreground">
            {anual?.unidad || ""} · consolidado {A} · meta {meta ?? "—"}
          </span>
        </div>
        <span className="rounded-full px-3 py-1 text-xs font-semibold text-white" style={{ backgroundColor: color }}>
          {ok == null ? "sin meta" : ok ? "En meta" : "Fuera de meta"}
        </span>
      </div>

      {/* Tendencia mensual con meta */}
      <div className="h-56 rounded-lg border p-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chart} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={38} />
            <Tooltip formatter={(v: any) => [v, f.nombre]} />
            {meta != null && (
              <ReferenceLine y={meta} stroke={SST_TOKENS.bad} strokeDasharray="4 4" label={{ value: `Meta ${meta}`, fontSize: 10, position: "right", fill: SST_TOKENS.bad }} />
            )}
            <Line type="monotone" dataKey="valor" stroke={SST_TOKENS.navy} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Comparativo interanual */}
      {prev?.valor != null && (
        <div className="flex items-center gap-4 rounded-lg border p-3">
          <div className="text-center">
            <div className="text-xs text-muted-foreground">{P}</div>
            <div className="text-lg font-bold tabular-nums">{prev.valor}</div>
          </div>
          <div className="text-2xl text-muted-foreground">→</div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">{A}</div>
            <div className="text-lg font-bold tabular-nums" style={{ color }}>
              {valor ?? "—"}
            </div>
          </div>
          {delta != null && (
            <div
              className="ml-auto rounded-md px-2 py-1 text-xs font-semibold text-white"
              style={{ backgroundColor: (f.sentido === "menor" ? delta < 0 : delta > 0) ? SST_TOKENS.ok : delta === 0 ? SST_TOKENS.grey : SST_TOKENS.bad }}
            >
              {delta > 0 ? "+" : ""}
              {delta} vs {P} {(f.sentido === "menor" ? delta < 0 : delta > 0) ? "· mejora" : delta === 0 ? "· igual" : "· empeora"}
            </div>
          )}
        </div>
      )}

      {/* Ficha técnica (exigencia de la norma) */}
      <div className="rounded-lg border p-3" style={{ backgroundColor: SST_TOKENS.light }}>
        <div className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: SST_TOKENS.ink }}>
          Ficha técnica {f.numeral ? `· numeral ${f.numeral}` : ""}
        </div>
        <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          <FT l="Definición" v={f.definicion} full />
          <FT l="Fórmula" v={f.formula} />
          <FT l="Interpretación" v={f.interpretacion} />
          <FT l="Fuente" v={f.fuente} />
          <FT l="Periodicidad" v={f.periodicidad} />
          <FT l="Responsable" v={f.responsable} />
          <FT l="Meta" v={`${meta ?? "—"} (${f.sentido === "menor" ? "menor es mejor" : "mayor es mejor"})`} />
        </div>
      </div>

      {anual?.observacion && (
        <div className="rounded-lg border bg-white p-3">
          <span className="font-semibold text-foreground">Análisis:</span> {anual.observacion}
        </div>
      )}
    </div>
  )
}

function FT({ l, v, full }: { l: string; v: string; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <span className="font-semibold text-foreground">{l}: </span>
      <span className="text-muted-foreground">{v}</span>
    </div>
  )
}
