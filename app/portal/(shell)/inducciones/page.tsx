"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { GraduationCap, Loader2, CheckCircle2, Clock, ChevronRight, XCircle } from "lucide-react"
import { usePortal } from "@/components/portal/portal-provider"
import { listInduccionesObligatorias, type InduccionResumen } from "@/lib/inducciones-actions"

/** Fecha corta del intento. `fecha` es un timestamp del servidor, pero se
 *  contempla que llegue como 'YYYY-MM-DD' suelto: pasar ese formato por Date
 *  lo interpreta en UTC y en Colombia se veria un dia antes. */
function fechaCorta(valor: string | null): string {
  if (!valor) return ""
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor)
  if (soloFecha) return `${soloFecha[3]}/${soloFecha[2]}/${soloFecha[1]}`
  const d = new Date(valor)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Bogota",
  })
}

/**
 * Pagina de Inducciones del Portal del Trabajador.
 * Lista las inducciones asignadas y marca cada una como "Aprobada",
 * "No aprobada" o "Pendiente". El estado viene resuelto desde
 * listInduccionesObligatorias, que lo cruza por llave foranea; aca no se
 * vuelve a calcular para no tener dos fuentes de verdad del mismo dato.
 */
export default function PortalInduccionesPage() {
  const { colaborador } = usePortal()
  const [loading, setLoading] = useState(true)
  const [inducciones, setInducciones] = useState<InduccionResumen[]>([])

  useEffect(() => {
    const load = async () => {
      if (!colaborador?.colaborador_id) return
      setLoading(true)
      const indRes = await listInduccionesObligatorias(colaborador.colaborador_id)
      if (indRes.success) setInducciones(indRes.data)
      setLoading(false)
    }
    load()
  }, [colaborador?.colaborador_id])

  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5">
              <GraduationCap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Mis Inducciones</CardTitle>
              <CardDescription className="mt-1">
                Revisa el material de cada inducción y responde su evaluación. Necesitas
                aprobar todas las inducciones obligatorias.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : inducciones.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <GraduationCap className="h-10 w-10 text-muted-foreground" />
            <EmptyTitle>No tienes inducciones asignadas</EmptyTitle>
            <EmptyDescription>
              Cuando RRHH publique una inducción aparecerá aquí para que la realices.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-3">
          {inducciones.map((ind) => {
            // Presentarla y no pasarla no es lo mismo que no haberla hecho:
            // antes las dos se veian igual y el trabajador no sabia si su
            // evaluacion habia quedado registrada.
            const noAprobada = !ind.aprobada && ind.intentos > 0
            return (
              <Card key={ind.id} className="overflow-hidden transition-colors hover:border-primary/40">
                <CardContent className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {ind.codigo_sig && (
                        <span className="font-mono text-xs text-muted-foreground">{ind.codigo_sig}</span>
                      )}
                      {ind.aprobada ? (
                        <Badge className="bg-green-100 text-green-800 border-green-300 hover:bg-green-100">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Aprobada
                        </Badge>
                      ) : noAprobada ? (
                        <Badge className="bg-red-100 text-red-800 border-red-300 hover:bg-red-100">
                          <XCircle className="h-3 w-3 mr-1" />
                          No aprobada
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100">
                          <Clock className="h-3 w-3 mr-1" />
                          Pendiente
                        </Badge>
                      )}
                      {ind.intentos > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {ind.mejor_puntaje}/{ind.mejor_total} correctas
                          {fechaCorta(ind.ultimo_intento)
                            ? ` · ${fechaCorta(ind.ultimo_intento)}`
                            : ""}
                          {ind.intentos > 1 ? ` · ${ind.intentos} intentos` : ""}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-1 font-semibold text-balance">{ind.tema}</h3>
                    {ind.descripcion && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                        {ind.descripcion}
                      </p>
                    )}
                  </div>
                  <Button
                    asChild
                    variant={ind.aprobada ? "outline" : "default"}
                    size="sm"
                    className="gap-1 shrink-0"
                  >
                    <Link href={`/portal/inducciones/${encodeURIComponent(ind.id)}`}>
                      {ind.aprobada ? "Repasar" : noAprobada ? "Reintentar" : "Realizar"}
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
