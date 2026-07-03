"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { BookOpenCheck, ShieldCheck, ArrowRight, Loader2, CheckCircle2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { usePortal } from "@/components/portal/portal-provider"
import { getReglamentoCheck, confirmarReglamentoLeido } from "@/lib/portal-actions"

// El visor usa pdfjs (APIs de navegador), por eso se carga solo en cliente.
const ReglamentoPdfViewer = dynamic(() => import("@/components/portal/reglamento-pdf-viewer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[60vh] items-center justify-center rounded-lg border bg-muted/30 text-muted-foreground">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
      Preparando visor...
    </div>
  ),
})

const PDF_FILE = "/documentos/reglamento-interno-trabajo.pdf"
const FECHA_SUBIDO = "26/06/2026"

export function ReglamentoInterno() {
  const { colaborador } = usePortal()
  const { toast } = useToast()

  const [open, setOpen] = useState(false)
  const [reachedEnd, setReachedEnd] = useState(false)
  const [checked, setChecked] = useState(false)
  const [saving, setSaving] = useState(false)
  // Estado de confirmacion previa: null = cargando, true = ya confirmado,
  // false = nunca confirmado.
  const [yaConfirmado, setYaConfirmado] = useState<boolean | null>(null)

  const identificacion = colaborador?.identificacion ?? ""

  // Al montar, consultar si el colaborador ya confirmo el reglamento.
  useEffect(() => {
    if (!identificacion) return
    let cancelled = false
    ;(async () => {
      const res = await getReglamentoCheck(identificacion)
      if (cancelled) return
      setYaConfirmado(res.confirmado)
    })()
    return () => {
      cancelled = true
    }
  }, [identificacion])

  const handleConfirm = async (value: boolean) => {
    setChecked(value)
    if (!value || yaConfirmado || saving) return
    setSaving(true)
    const res = await confirmarReglamentoLeido(identificacion)
    setSaving(false)
    if (res.success) {
      setYaConfirmado(true)
      toast({
        title: "Confirmacion registrada",
        description: "Gracias por leer el Reglamento Interno de Trabajo.",
      })
      setOpen(false)
    } else {
      setChecked(false)
      toast({
        title: "No se pudo guardar",
        description: res.error || "Intenta nuevamente.",
        variant: "destructive",
      })
    }
  }

  return (
    <section aria-labelledby="reglamento-heading">
      <h2 id="reglamento-heading" className="sr-only">
        Reglamento Interno de Trabajo
      </h2>

      {/* Boton grande y llamativo */}
      <Card className="overflow-hidden border-primary/30 bg-primary/5">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <BookOpenCheck className="h-6 w-6" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-base font-semibold leading-tight text-balance">
                Reglamento Interno de Trabajo
              </p>
              <p className="text-sm text-muted-foreground">Subido el {FECHA_SUBIDO}</p>
              {yaConfirmado ? (
                <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  Leido y comprendido
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  Lee el documento completo y confirma tu lectura.
                </p>
              )}
            </div>
          </div>
          <Button
            size="lg"
            className="w-full shrink-0 gap-2 sm:w-auto"
            onClick={() => setOpen(true)}
          >
            {yaConfirmado ? "Ver reglamento" : "Leer reglamento"}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        </CardContent>
      </Card>

      {/* Dialogo con el documento embebido */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[92vh] max-w-3xl flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
              Reglamento Interno de Trabajo
            </DialogTitle>
            <DialogDescription>
              Subido el {FECHA_SUBIDO}. Desplazate hasta el final para habilitar la confirmacion de
              lectura.
            </DialogDescription>
          </DialogHeader>

          <ReglamentoPdfViewer file={PDF_FILE} onReachedEnd={() => setReachedEnd(true)} />

          {/* La confirmacion solo aparece cuando se completa el scroll. */}
          {yaConfirmado ? (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
              Ya confirmaste la lectura de este reglamento.
            </div>
          ) : reachedEnd ? (
            <label
              htmlFor="reglamento-check"
              className="flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-3"
            >
              <Checkbox
                id="reglamento-check"
                checked={checked}
                disabled={saving}
                onCheckedChange={(v) => handleConfirm(v === true)}
                className="mt-0.5"
              />
              <span className="text-sm leading-snug">
                He leido y comprendido el Reglamento Interno de Trabajo.
                {saving && (
                  <span className="ml-2 inline-flex items-center gap-1 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Guardando...
                  </span>
                )}
              </span>
            </label>
          ) : (
            <p className="rounded-lg border border-dashed bg-muted/40 p-3 text-center text-xs text-muted-foreground">
              Desplazate hasta el final del documento para habilitar la confirmacion de lectura.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
