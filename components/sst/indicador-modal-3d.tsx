"use client"

// Wrapper SST del viewer genérico de indicadores: trae los datos de
// sst_indicadores (LIP 100) por tipo + año y los mapea a `IndicadorDatos`.
// El render 3D vive en components/indicadores/indicador-viewer.tsx (reutilizable).

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { listIndicadores } from "@/lib/sst-plan-actions"
import type { IndicadorRow } from "@/lib/sst-evidencia-types"
import { fichaDe, MESES } from "@/components/sst/indicador-detalle"
import { IndicadorViewer, type IndicadorDatos } from "@/components/indicadores/indicador-viewer"

export function IndicadorModal3D({
  tipo,
  anio,
  onClose,
}: {
  tipo: string
  anio: string | number
  onClose: () => void
}) {
  const [rows, setRows] = useState<IndicadorRow[] | null>(null)
  useEffect(() => {
    let cancel = false
    listIndicadores(null).then((r) => !cancel && setRows(r)).catch(() => !cancel && setRows([]))
    return () => {
      cancel = true
    }
  }, [])

  const f = fichaDe(tipo)
  if (!f) return null

  if (rows === null) {
    return (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 backdrop-blur"
        onClick={onClose}
      >
        <div className="flex items-center gap-2 text-sky-200">
          <Loader2 className="h-6 w-6 animate-spin" /> Cargando indicador…
        </div>
      </div>
    )
  }

  const A = String(anio)
  const P = String(Number(anio) - 1)
  const anual = rows.find((r) => r.tipo === tipo && r.periodo === A) ?? null
  const prev = rows.find((r) => r.tipo === tipo && r.periodo === P) ?? null
  const mens: (number | null)[] = Array(12).fill(null)
  for (const r of rows) {
    if (r.tipo !== tipo) continue
    const m = String(r.periodo).match(new RegExp(`^${A}-(\\d{2})$`))
    if (m) mens[Number(m[1]) - 1] = r.valor
  }

  const datos: IndicadorDatos = {
    ficha: {
      codigo: f.tipo,
      nombre: f.nombre,
      area: "SG-SST",
      numeral: f.numeral ? `0312 · ${f.numeral}` : null,
      definicion: f.definicion,
      formula: f.formula,
      interpretacion: f.interpretacion,
      fuente: f.fuente,
      periodicidad: f.periodicidad,
      responsable: f.responsable,
      unidad: anual?.unidad ?? null,
      meta: anual?.meta ?? null,
      sentido: f.sentido,
    },
    serie: MESES.map((m, i) => ({ etiqueta: m, valor: mens[i] })),
    actual: anual?.valor ?? null,
    anterior: prev?.valor ?? null,
    periodo: A,
    periodoAnterior: P,
    analisis: anual?.observacion ?? null,
  }

  return <IndicadorViewer datos={datos} onClose={onClose} />
}
