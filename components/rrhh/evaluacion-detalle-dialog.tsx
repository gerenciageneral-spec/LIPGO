"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { useToast } from "@/hooks/use-toast"
import { ClipboardList, Star } from "lucide-react"
import {
  getEvaluacionById,
  type EvaluacionDetalle,
} from "@/lib/evaluaciones-desempeno-actions"

interface EvaluacionDetalleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  evaluacionId: string | null
  colaboradorNombre?: string | null
  colaboradorCargo?: string | null
  evaluador?: string | null
}

/**
 * Dialogo standalone que muestra el detalle completo de UNA evaluacion.
 * Se usa desde la tabla global de historial del dashboard.
 * Incluye la seccion de Decisiones (P13-P16) en pantalla (NO en el PDF).
 */
export function EvaluacionDetalleDialog({
  open,
  onOpenChange,
  evaluacionId,
  colaboradorNombre,
  colaboradorCargo,
  evaluador,
}: EvaluacionDetalleDialogProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [detalle, setDetalle] = useState<EvaluacionDetalle | null>(null)

  useEffect(() => {
    if (!open || !evaluacionId) return
    const load = async () => {
      setLoading(true)
      setDetalle(null)
      const res = await getEvaluacionById(evaluacionId)
      setLoading(false)
      if (!res.success || !res.data) {
        toast({
          title: "No se pudo cargar el detalle",
          description: res.error || "Error desconocido",
          variant: "destructive",
        })
        onOpenChange(false)
        return
      }
      setDetalle(res.data)
    }
    load()
  }, [open, evaluacionId, toast, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-indigo-600" />
            Detalle de la Evaluacion
          </DialogTitle>
          <DialogDescription>
            {colaboradorNombre}
            {colaboradorCargo ? ` - ${colaboradorCargo}` : ""}
            {detalle ? ` - ${formatFechaHora(detalle.created_at)}` : ""}
            {evaluador ? ` - Evaluador: ${evaluador}` : ""}
          </DialogDescription>
        </DialogHeader>
        {loading || !detalle ? (
          <div className="flex items-center justify-center py-8">
            <Spinner className="h-6 w-6 text-muted-foreground" />
          </div>
        ) : (
          <DetalleBody detalle={detalle} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function DetalleBody({ detalle }: { detalle: EvaluacionDetalle }) {
  const rating = (label: string, score: number) => (
    <div className="flex items-center justify-between py-1.5 border-b last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <div className="flex">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={`h-3.5 w-3.5 ${i < score ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
            />
          ))}
        </div>
        <span className="text-sm font-medium w-8 text-right">{score}/5</span>
      </div>
    </div>
  )

  const textRow = (label: string, value: string | null) => (
    <div className="flex items-start justify-between py-1.5 border-b last:border-b-0 gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value || "-"}</span>
    </div>
  )

  const riesgo = detalle.porcentaje_riesgo ?? 0
  const riesgoClase =
    riesgo >= 60 ? "text-red-700" : riesgo >= 30 ? "text-amber-700" : "text-green-700"

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="rounded-lg border bg-muted/40 p-3 flex justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Puntaje total</div>
          <div className="text-xl font-bold">{detalle.puntaje_total ?? 0} / 60</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">% Riesgo</div>
          <div className={`text-xl font-bold ${riesgoClase}`}>{riesgo}%</div>
        </div>
      </div>

      <section>
        <h4 className="text-sm font-semibold mb-2">1. Seguridad</h4>
        <div className="rounded-md border px-3">
          {rating("Cumplimiento de normas de seguridad", detalle.p1_seguridad_normas)}
          {rating("Conducta segura en el puesto", detalle.p2_seguridad_conducta)}
        </div>
      </section>

      <section>
        <h4 className="text-sm font-semibold mb-2">2. Productividad</h4>
        <div className="rounded-md border px-3">
          {rating("Cumplimiento de metas", detalle.p3_productividad_metas)}
          {rating("Ritmo de trabajo", detalle.p4_productividad_ritmo)}
        </div>
      </section>

      <section>
        <h4 className="text-sm font-semibold mb-2">3. Calidad</h4>
        <div className="rounded-md border px-3">
          {rating("Cuidado de la mercancia", detalle.p5_calidad_mercancia)}
          {rating("Precision en la ejecucion", detalle.p6_calidad_precision)}
        </div>
      </section>

      <section>
        <h4 className="text-sm font-semibold mb-2">4. Disciplina</h4>
        <div className="rounded-md border px-3">
          {rating("Puntualidad", detalle.p7_disciplina_puntualidad)}
          {rating("Asistencia", detalle.p8_disciplina_asistencia)}
          {rating("Seguimiento de instrucciones", detalle.p9_disciplina_instrucciones)}
        </div>
      </section>

      <section>
        <h4 className="text-sm font-semibold mb-2">5. Actitud</h4>
        <div className="rounded-md border px-3">
          {rating("Trabajo en equipo", detalle.p10_actitud_equipo)}
          {rating("Disposicion", detalle.p11_actitud_disposicion)}
          {rating("Proactividad", detalle.p12_actitud_proactividad)}
        </div>
      </section>

      <section>
        <h4 className="text-sm font-semibold mb-2">6. Decisiones</h4>
        <div className="rounded-md border px-3">
          {textRow("Recomienda continuidad", detalle.p13_continuidad)}
          {textRow("Nivel de riesgo", detalle.p14_nivel_riesgo)}
          {textRow("Decision sugerida", detalle.p15_decision_sugerida)}
          {textRow("Lo recontrataria", detalle.p16_recontrataria)}
        </div>
      </section>

      {detalle.comentarios_adicionales && (
        <section>
          <h4 className="text-sm font-semibold mb-2">Comentarios adicionales</h4>
          <p className="text-sm whitespace-pre-wrap rounded-md border p-3 bg-muted/40">
            {detalle.comentarios_adicionales}
          </p>
        </section>
      )}

      {detalle.firma_coordinador && (
        <section>
          <h4 className="text-sm font-semibold mb-2">Firma del coordinador</h4>
          <div className="rounded-md border p-2 bg-white inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={detalle.firma_coordinador || "/placeholder.svg"}
              alt="Firma del coordinador"
              className="max-h-24"
            />
          </div>
        </section>
      )}
    </div>
  )
}

function formatFechaHora(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-CO", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso))
  } catch {
    return iso
  }
}
