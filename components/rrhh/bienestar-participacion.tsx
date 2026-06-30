"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ClipboardList } from "lucide-react"

/**
 * Participación y Evidencias del programa de Bienestar.
 * Placeholder de Fase 1: el registro de asistentes (desde headcount),
 * satisfacción y cobertura llega en la Fase 2 contra `th_bienestar_participacion`.
 */
export default function BienestarParticipacion() {
  return (
    <div className="p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ClipboardList className="h-5 w-5 text-muted-foreground" />
            Participación y Evidencias
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Módulo en construcción. Aquí se registrará la participación de los colaboradores en las actividades de
            bienestar, su satisfacción y la cobertura alcanzada.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
