"use client"

// ENVIAR EL CIERRE DIARIO DE PRODUCCIÓN POR WHATSAPP
//
// Panel de pruebas: se elige el día, se revisan las cifras, se descarga el PDF
// para verlo, y se manda al número de pruebas.
//
// Descargar ANTES de enviar es lo que evita mandarle a alguien un PDF que
// nadie ha mirado. Cada envío se cobra y no se puede retirar.

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { AlertTriangle, Download, FileText, Loader2, Send } from "lucide-react"
import {
  enviarResumenProduccion,
  getCifrasProduccionDia,
  getPdfResumenProduccion,
} from "@/lib/reporte-produccion-actions"
import { utcDateStr } from "@/lib/paros-produccion"

/** El mismo número que se viene usando para todas las pruebas de WhatsApp. */
const TELEFONO_PRUEBAS = "3202343157"

type Cifras = NonNullable<Awaited<ReturnType<typeof getCifrasProduccionDia>>["data"]>

const num = (n: number) => Math.round(n).toLocaleString("es-CO")

function fmtMin(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`
}

export default function EnviarCierreDia() {
  const { toast } = useToast()
  const [fecha, setFecha] = useState(utcDateStr())
  const [cifras, setCifras] = useState<Cifras | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [bajando, setBajando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [telefono, setTelefono] = useState(TELEFONO_PRUEBAS)

  const cargar = useCallback(async () => {
    setCargando(true)
    const r = await getCifrasProduccionDia(fecha)
    if (r.success && r.data) {
      setCifras(r.data)
      setError(null)
    } else {
      setCifras(null)
      setError(r.message ?? "No se pudieron leer las cifras.")
    }
    setCargando(false)
  }, [fecha])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function descargar() {
    setBajando(true)
    const r = await getPdfResumenProduccion(fecha)
    setBajando(false)
    if (!r.success || !r.pdf) {
      toast({ title: "No se pudo generar", description: r.message, variant: "destructive" })
      return
    }
    // El PDF viaja en base64 porque un server action no devuelve binario.
    const bytes = Uint8Array.from(atob(r.pdf), (c) => c.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }))
    const a = document.createElement("a")
    a.href = url
    a.download = r.nombre ?? "cierre.pdf"
    a.click()
    URL.revokeObjectURL(url)
  }

  async function enviar() {
    const ok = window.confirm(
      `Se va a enviar el cierre del ${fecha} a ${telefono}.\n\n` +
        "El mensaje se cobra y no se puede retirar. ¿Continuar?",
    )
    if (!ok) return

    setEnviando(true)
    const r = await enviarResumenProduccion({ telefono, fecha })
    setEnviando(false)
    if (!r.success) {
      toast({ title: "No se pudo enviar", description: r.message, variant: "destructive" })
      return
    }
    toast({ title: "Enviado", description: "Revisa el WhatsApp del número de pruebas." })
  }

  const sinProduccion = cifras != null && cifras.totalBultos === 0

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <p className="text-sm font-medium">Cierre diario por WhatsApp</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Manda un PDF con las cifras del día. Las mismas que ves en este dashboard, calculadas
          igual. Conviene <strong>descargarlo primero</strong> para revisarlo: cada envío se cobra y
          no se puede retirar.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-end gap-3 border-b border-border px-4 py-3">
          <div>
            <Label className="text-xs">Día</Label>
            <Input
              type="date"
              value={fecha}
              max={utcDateStr()}
              onChange={(e) => setFecha(e.target.value)}
              className="mt-1 h-9 w-[10rem] text-sm"
            />
          </div>
          <div className="flex-1">
            <Label className="text-xs">Enviar a</Label>
            <Input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className="mt-1 h-9 max-w-[12rem] text-sm"
            />
          </div>
          <Button
            variant="outline"
            onClick={descargar}
            disabled={bajando || cargando || sinProduccion}
            className="h-9 gap-1.5"
          >
            {bajando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Ver el PDF
          </Button>
          <Button
            onClick={enviar}
            disabled={enviando || cargando || sinProduccion}
            className="h-9 gap-1.5"
          >
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar
          </Button>
        </div>

        <div className="p-4">
          {cargando ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium text-amber-900">
                <AlertTriangle className="h-4 w-4" />
                No se pudieron leer las cifras
              </p>
              <p className="mt-1 text-[11px] text-amber-900">{error}</p>
            </div>
          ) : sinProduccion ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium text-amber-900">
                <AlertTriangle className="h-4 w-4" />
                Ese día no registra producción
              </p>
              {/* Se bloquea el envío en vez de mandar un PDF en ceros: el
                  mensaje se cobra igual y no diría nada que no diga su
                  ausencia. */}
              <p className="mt-1 text-[11px] text-amber-900">
                No se envía un cierre sin producción. Elige otro día.
              </p>
            </div>
          ) : cifras ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { e: "Total bultos", v: num(cifras.totalBultos), s: `meta ${num(cifras.metaDia)}` },
                  { e: "Cumplimiento", v: `${cifras.cumplimientoPct.toFixed(0)}%`, s: "de la meta" },
                  { e: "OEE", v: `${cifras.oee.toFixed(0)}%`, s: cifras.oee >= 80 ? "excelente" : cifras.oee >= 60 ? "aceptable" : "crítico" },
                  { e: "Paros", v: fmtMin(cifras.parosMinutos), s: `${cifras.parosTotal} franjas` },
                ].map((c) => (
                  <div key={c.e} className="rounded-lg border border-border p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {c.e}
                    </p>
                    <p className="mt-0.5 text-xl font-bold">{c.v}</p>
                    <p className="text-[10px] text-muted-foreground">{c.s}</p>
                  </div>
                ))}
              </div>

              <p className="mt-3 text-[11px] text-muted-foreground">
                Jornada {cifras.ventanaDesde}–{cifras.ventanaHasta} ·{" "}
                {cifras.origenVentana === "tolva"
                  ? "según el Horario de Tolva"
                  : cifras.origenVentana === "turnos"
                    ? "según los turnos programados"
                    : "con el horario por defecto"}{" "}
                · {cifras.porProducto.length} producto(s)
              </p>

              <div className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-[11px] text-muted-foreground">
                  El PDF lleva estas cifras más el desglose por producto, la producción hora a
                  hora y el detalle de los paros con sus categorías.
                </p>
              </div>
            </>
          ) : null}
        </div>
      </section>
    </div>
  )
}
