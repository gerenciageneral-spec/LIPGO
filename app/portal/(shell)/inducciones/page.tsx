"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { GraduationCap, Loader2, CheckCircle2, Clock, ChevronRight } from "lucide-react"
import { usePortal } from "@/components/portal/portal-provider"
import {
  listInduccionesObligatorias,
  getResultadosPorHeadcount,
  type InduccionResumen,
  type ResultadoIntento,
} from "@/lib/inducciones-actions"

/**
 * Pagina de Inducciones del Portal del Trabajador.
 * Lista las inducciones obligatorias/activas y marca cada una como
 * "Aprobada" o "Pendiente" segun los intentos del trabajador
 * (getResultadosPorHeadcount con su colaborador_id = headcount_id).
 */
export default function PortalInduccionesPage() {
  const { colaborador } = usePortal()
  const [loading, setLoading] = useState(true)
  const [inducciones, setInducciones] = useState<InduccionResumen[]>([])
  const [resultados, setResultados] = useState<ResultadoIntento[]>([])

  useEffect(() => {
    const load = async () => {
      if (!colaborador?.colaborador_id) return
      setLoading(true)
      const [indRes, resRes] = await Promise.all([
        listInduccionesObligatorias(colaborador.colaborador_id),
        getResultadosPorHeadcount(colaborador.colaborador_id),
      ])
      if (indRes.success) setInducciones(indRes.data)
      if (resRes.success) setResultados(resRes.data)
      setLoading(false)
    }
    load()
  }, [colaborador?.colaborador_id])

  // Una induccion esta aprobada si existe algun intento aprobado con su codigo.
  const aprobadaPorCodigo = (codigo: string | null) =>
    !!codigo && resultados.some((r) => r.codigo_sig === codigo && r.aprobado)

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
            const aprobada = aprobadaPorCodigo(ind.codigo_sig)
            return (
              <Card key={ind.id} className="overflow-hidden transition-colors hover:border-primary/40">
                <CardContent className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {ind.codigo_sig && (
                        <span className="font-mono text-xs text-muted-foreground">{ind.codigo_sig}</span>
                      )}
                      {aprobada ? (
                        <Badge className="bg-green-100 text-green-800 border-green-300 hover:bg-green-100">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Aprobada
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100">
                          <Clock className="h-3 w-3 mr-1" />
                          Pendiente
                        </Badge>
                      )}
                    </div>
                    <h3 className="mt-1 font-semibold text-balance">{ind.tema}</h3>
                    {ind.descripcion && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                        {ind.descripcion}
                      </p>
                    )}
                  </div>
                  <Button asChild variant={aprobada ? "outline" : "default"} size="sm" className="gap-1 shrink-0">
                    <Link href={`/portal/inducciones/${encodeURIComponent(ind.id)}`}>
                      {aprobada ? "Repasar" : "Realizar"}
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
