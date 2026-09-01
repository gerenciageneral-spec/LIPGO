"use client"

import { useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Loader2, CheckCircle2, XCircle, RotateCcw, Trophy, PenLine, ArrowLeft } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { usePortal } from "@/components/portal/portal-provider"
import { SignaturePad, type SignaturePadHandle } from "@/components/rrhh/signature-pad"
import { registrarIntentoEvaluacion, type InduccionPortal } from "@/lib/inducciones-actions"

interface Resultado {
  puntaje: number
  total: number
  aprobado: boolean
}

/**
 * Quiz de evaluacion de induccion (portal del trabajador).
 * - Pinta cada pregunta con RadioGroup. En 'vf' las opciones son
 *   Verdadero/Falso; en 'mcq' se listan las opciones {a,b,c}.
 * - Valida que TODAS esten respondidas antes de enviar.
 * - Al enviar llama registrarIntentoEvaluacion (la calificacion ocurre solo
 *   en el servidor; la respuesta_correcta nunca llega al cliente).
 */
export function EvaluacionQuiz({ induccion }: { induccion: InduccionPortal }) {
  const { colaborador } = usePortal()
  const { toast } = useToast()
  const { evaluacion, preguntas } = induccion

  const [respuestas, setRespuestas] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const firmaRef = useRef<SignaturePadHandle>(null)

  const totalPreguntas = preguntas.length
  const respondidas = useMemo(
    () => preguntas.filter((p) => respuestas[p.id] != null && respuestas[p.id] !== "").length,
    [preguntas, respuestas],
  )

  const handleSelect = (preguntaId: string, valor: string) => {
    setRespuestas((prev) => ({ ...prev, [preguntaId]: valor }))
  }

  const handleSubmit = async () => {
    if (!evaluacion) return
    if (!colaborador?.colaborador_id) {
      toast({ title: "Sesión no válida", description: "Vuelve a iniciar sesión.", variant: "destructive" })
      return
    }
    if (respondidas < totalPreguntas) {
      toast({
        title: "Faltan preguntas por responder",
        description: `Has respondido ${respondidas} de ${totalPreguntas}.`,
        variant: "destructive",
      })
      return
    }
    // La firma digital es obligatoria para finalizar.
    if (firmaRef.current?.isEmpty()) {
      toast({
        title: "Firma requerida",
        description: "Firma en el recuadro para finalizar la inducción.",
        variant: "destructive",
      })
      return
    }

    setSubmitting(true)

    // 1) Subir la firma al bucket de firmas (mismo endpoint que asistencia).
    let firmaUrl: string | null = null
    try {
      const blob = await firmaRef.current?.toBlob()
      if (blob) {
        const fd = new FormData()
        fd.append("file", new File([blob], "firma.png", { type: "image/png" }))
        const resp = await fetch("/api/capacitaciones/upload-firma", { method: "POST", body: fd })
        const json = await resp.json()
        if (!resp.ok || !json.success) throw new Error(json.error || "Error al subir la firma")
        firmaUrl = json.url
      }
    } catch (err: any) {
      setSubmitting(false)
      toast({ title: "Error con la firma", description: err?.message, variant: "destructive" })
      return
    }

    // 2) Calificar y registrar el intento (incluye la firma).
    const res = await registrarIntentoEvaluacion({
      evaluacionId: evaluacion.id,
      headcountId: colaborador.colaborador_id,
      respuestas: preguntas.map((p) => ({ pregunta_id: p.id, respuesta: respuestas[p.id] })),
      firmaUrl,
    })
    setSubmitting(false)

    if (!res.success) {
      toast({ title: "Error al enviar", description: res.error, variant: "destructive" })
      return
    }

    setResultado({ puntaje: res.puntaje ?? 0, total: res.total ?? totalPreguntas, aprobado: !!res.aprobado })
    toast({
      title: res.aprobado ? "¡Inducción aprobada!" : "Evaluación enviada",
      description: `Obtuviste ${res.puntaje}/${res.total} respuestas correctas.`,
    })
  }

  const reintentar = () => {
    setResultado(null)
    setRespuestas({})
  }

  // Pantalla de resultado.
  if (resultado) {
    const aprobado = resultado.aprobado
    return (
      <Card className={aprobado ? "border-green-300" : "border-amber-300"}>
        <CardContent className="flex flex-col items-center text-center gap-3 py-8">
          <div
            className={`rounded-full p-3 ${aprobado ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}
          >
            {aprobado ? <Trophy className="h-8 w-8" /> : <XCircle className="h-8 w-8" />}
          </div>
          <h2 className="text-xl font-bold">
            {aprobado ? "¡Felicidades, aprobaste!" : "No alcanzaste el puntaje mínimo"}
          </h2>
          <p className="text-muted-foreground">
            Obtuviste <span className="font-semibold text-foreground">{resultado.puntaje}</span> de{" "}
            <span className="font-semibold text-foreground">{resultado.total}</span> respuestas correctas.
          </p>
          {!aprobado && (
            <p className="text-sm text-muted-foreground">
              Repasa el material y vuelve a intentarlo cuando estés listo.
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            {!aprobado && (
              <Button onClick={reintentar} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Reintentar evaluación
              </Button>
            )}
            <Button asChild variant={aprobado ? "default" : "outline"} className="gap-2">
              <Link href="/portal/inducciones">
                <ArrowLeft className="h-4 w-4" />
                Volver a mis inducciones
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{evaluacion?.titulo || "Evaluación"}</CardTitle>
          <Badge variant="secondary">
            {respondidas}/{totalPreguntas} respondidas
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {preguntas.map((p, idx) => {
          const opciones =
            p.tipo === "vf"
              ? [
                  { key: "Verdadero", label: "Verdadero" },
                  { key: "Falso", label: "Falso" },
                ]
              : Object.entries(p.opciones || {}).map(([key, label]) => ({ key, label: String(label) }))

          return (
            <div key={p.id} className="space-y-3">
              <p className="font-medium text-pretty">
                <span className="text-primary font-semibold mr-1">{idx + 1}.</span>
                {p.enunciado}
              </p>
              <RadioGroup
                value={respuestas[p.id] ?? ""}
                onValueChange={(v) => handleSelect(p.id, v)}
                className="space-y-2"
              >
                {opciones.map((op) => {
                  const selected = respuestas[p.id] === op.key
                  return (
                    <Label
                      key={op.key}
                      htmlFor={`${p.id}-${op.key}`}
                      className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                        selected ? "border-primary bg-primary/5" : "hover:bg-accent/50"
                      }`}
                    >
                      <RadioGroupItem value={op.key} id={`${p.id}-${op.key}`} />
                      {p.tipo === "mcq" && (
                        <span className="uppercase text-xs font-semibold text-muted-foreground w-4">
                          {op.key}
                        </span>
                      )}
                      <span className="text-sm">{op.label}</span>
                    </Label>
                  )
                })}
              </RadioGroup>
            </div>
          )
        })}

        {/* Firma digital obligatoria para finalizar la induccion. */}
        <div className="space-y-2 pt-2 border-t">
          <div className="flex items-center gap-2">
            <PenLine className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Firma digital</span>
            <Badge variant="secondary" className="text-[10px]">
              Requerida
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Al firmar confirmas que recibiste la inducción y presentaste la evaluación.
          </p>
          <SignaturePad ref={firmaRef} height={160} />
        </div>

        <div className="flex items-center justify-between gap-3 pt-2 border-t">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Responde todo y firma para enviar.
          </p>
          <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              "Finalizar y firmar"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
