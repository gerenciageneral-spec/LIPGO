"use client"

// Wrapper del BSC para el viewer genérico: trae ficha (sig_indicadores) + serie
// (indicador_historico) de un indicador del cuadro de mando y lo abre en 3D.

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { getBscIndicadorDetalle } from "@/lib/sig-actions"
import { IndicadorViewer, type IndicadorDatos, type SeriePunto } from "@/components/indicadores/indicador-viewer"
import type { KpiDef } from "@/lib/kpis-area"

export function BscIndicadorModal({
  codigo,
  def,
  actual,
  onClose,
}: {
  codigo: string
  def?: KpiDef
  actual: number | null
  onClose: () => void
}) {
  const anio = String(new Date().getFullYear())
  const [data, setData] = useState<{ ficha: any; serie: SeriePunto[] } | null>(null)
  useEffect(() => {
    let cancel = false
    getBscIndicadorDetalle(codigo, anio)
      .then((r) => !cancel && setData(r))
      .catch(() => !cancel && setData({ ficha: null, serie: [] }))
    return () => {
      cancel = true
    }
  }, [codigo, anio])

  if (data === null) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 backdrop-blur" onClick={onClose}>
        <div className="flex items-center gap-2 text-sky-200">
          <Loader2 className="h-6 w-6 animate-spin" /> Cargando indicador…
        </div>
      </div>
    )
  }

  const sig = data.ficha
  const unidad = def?.fmt === "pct" ? "%" : def?.fmt === "ton" ? "ton" : def?.fmt === "min" ? "min" : sig?.unidad ?? ""
  const datos: IndicadorDatos = {
    ficha: {
      codigo,
      nombre: sig?.nombre || def?.nombre || codigo,
      area: sig?.area || "BSC",
      numeral: null,
      definicion: sig?.interpretacion ?? null,
      formula: sig?.formula ?? null,
      interpretacion: sig?.interpretacion ?? null,
      fuente: sig?.fuente ?? null,
      periodicidad: sig?.periodicidad ?? null,
      responsable: sig?.responsable ?? null,
      unidad,
      meta: sig?.meta ?? def?.meta ?? null,
      sentido: sig?.sentido ?? (def?.higherBetter ? "mayor" : "menor"),
    },
    serie: data.serie,
    actual,
    periodo: anio,
    periodoAnterior: String(Number(anio) - 1),
    analisis: null,
  }

  return <IndicadorViewer datos={datos} onClose={onClose} />
}
