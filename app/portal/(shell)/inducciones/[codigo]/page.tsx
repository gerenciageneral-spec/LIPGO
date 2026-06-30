"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { ArrowLeft, ExternalLink, Loader2, GraduationCap, FileText } from "lucide-react"
import { getInduccionConEvaluacionPorId, type InduccionPortal } from "@/lib/inducciones-actions"
import { EvaluacionQuiz } from "@/components/portal/evaluacion-quiz"

/**
 * Detalle de una induccion en el portal: muestra el material (boton para abrir
 * la presentacion si existe material_url) y debajo la evaluacion (quiz).
 */
export default function PortalInduccionDetallePage() {
  const params = useParams<{ codigo: string }>()
  // El segmento de la ruta es el id de la induccion (unico y siempre presente).
  const induccionId = decodeURIComponent(params.codigo)
  const [loading, setLoading] = useState(true)
  const [induccion, setInduccion] = useState<InduccionPortal | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const res = await getInduccionConEvaluacionPorId(induccionId)
      if (res.success) setInduccion(res.data)
      setLoading(false)
    }
    load()
  }, [induccionId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!induccion) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Empty>
          <EmptyHeader>
            <GraduationCap className="h-10 w-10 text-muted-foreground" />
            <EmptyTitle>Inducción no encontrada</EmptyTitle>
            <EmptyDescription>Esta inducción no está disponible o fue retirada.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  const { capacitacion, evaluacion, preguntas } = induccion

  return (
    <div className="space-y-6">
      <BackLink />

      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5">
              <GraduationCap className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              {capacitacion.codigo_sig && (
                <span className="font-mono text-xs text-muted-foreground">{capacitacion.codigo_sig}</span>
              )}
              <CardTitle className="text-lg text-balance">{capacitacion.tema}</CardTitle>
              {capacitacion.descripcion && (
                <CardDescription className="mt-1">{capacitacion.descripcion}</CardDescription>
              )}
            </div>
          </div>
        </CardHeader>
        {capacitacion.material_url && (
          <CardContent>
            <Button asChild variant="outline" className="gap-2">
              <a href={capacitacion.material_url} target="_blank" rel="noopener noreferrer">
                <FileText className="h-4 w-4" />
                Abrir presentación
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          </CardContent>
        )}
      </Card>

      {evaluacion && preguntas.length > 0 ? (
        <EvaluacionQuiz induccion={induccion} />
      ) : (
        <Empty>
          <EmptyHeader>
            <FileText className="h-10 w-10 text-muted-foreground" />
            <EmptyTitle>Esta inducción aún no tiene evaluación</EmptyTitle>
            <EmptyDescription>Revisa el material; no hay preguntas por responder.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  )
}

function BackLink() {
  return (
    <Link
      href="/portal/inducciones"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Volver a mis inducciones
    </Link>
  )
}
