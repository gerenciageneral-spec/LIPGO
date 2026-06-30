"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { HeartHandshake } from "lucide-react"

/**
 * Programa de Bienestar (transversal para todos).
 * Placeholder de Fase 1: el CRUD de programas, evidencias e indicadores
 * (cobertura, % ejecutados) llega en la Fase 2 contra `th_bienestar_programas`.
 */
export default function BienestarPrograma() {
  return (
    <div className="p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <HeartHandshake className="h-5 w-5 text-muted-foreground" />
            Programa de Bienestar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Módulo en construcción. Aquí se gestionarán los programas de bienestar (salud, recreación, educación,
            reconocimiento y familiar) con sus evidencias e indicadores.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
