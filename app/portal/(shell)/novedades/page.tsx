"use client"

// Pagina "Novedades de Asistencia" del Portal del Trabajador.
//
// Lista las filas de `registroasistencia` donde el campo `asistencia`
// no es null/vacio, filtrando por la `identificacion` del colaborador
// autenticado. Cada fila representa una novedad (ej: "Incapacidad",
// "Permiso", "No asistio") asociada a una fecha. La data se trae via
// la server action `getNovedadesAsistenciaPortal` que usa service_role
// para bypassear RLS.

import { useEffect, useState } from "react"
import { usePortal } from "@/components/portal/portal-provider"
import {
  getNovedadesAsistenciaPortal,
  type PortalNovedadAsistencia,
} from "@/lib/portal-actions"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { CalendarClock, AlertCircle } from "lucide-react"

// Formatea la fecha YYYY-MM-DD que viene de Postgres como "DD/MM/YYYY"
// usando el locale local. Se hace manualmente para evitar problemas de
// timezone (new Date("2026-01-15") interpreta como UTC y puede mostrar
// el dia anterior en zonas con offset negativo).
function formatFecha(fechaIso: string): string {
  if (!fechaIso) return "-"
  const [y, m, d] = fechaIso.split("T")[0].split("-")
  if (!y || !m || !d) return fechaIso
  return `${d}/${m}/${y}`
}

export default function NovedadesAsistenciaPage() {
  const { colaborador } = usePortal()
  const [novedades, setNovedades] = useState<PortalNovedadAsistencia[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!colaborador?.identificacion) return
    let cancelled = false
    setLoading(true)
    setError(null)
    getNovedadesAsistenciaPortal(colaborador.identificacion)
      .then((res) => {
        if (cancelled) return
        if (res.success) {
          setNovedades(res.data)
        } else {
          setError(res.error || "No pudimos cargar tus novedades.")
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [colaborador?.identificacion])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CalendarClock className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Novedades de Asistencia</CardTitle>
              <CardDescription>
                Historial de novedades registradas en tu asistencia
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Cargando novedades...
            </p>
          ) : error ? (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          ) : novedades.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center">
              <p className="text-sm font-medium">Sin novedades registradas</p>
              <p className="text-xs text-muted-foreground mt-1">
                No tienes novedades de asistencia en tu historial.
              </p>
            </div>
          ) : (
            <>
              {/* Vista desktop/tablet: tabla compacta */}
              <div className="hidden sm:block rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32">Fecha</TableHead>
                      <TableHead>Novedad</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {novedades.map((n) => (
                      <TableRow key={n.id}>
                        <TableCell className="font-medium">
                          {formatFecha(n.fecha)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-normal">
                            {n.asistencia}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Vista mobile: cards apiladas. La tabla se queda muy
                  apretada en pantallas estrechas, asi que en mobile
                  mostramos cada novedad como bloque con la fecha
                  arriba y el badge debajo. */}
              <ul className="sm:hidden space-y-2">
                {novedades.map((n) => (
                  <li
                    key={n.id}
                    className="rounded-lg border bg-card p-3 flex items-start justify-between gap-3"
                  >
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Fecha
                      </p>
                      <p className="text-sm font-semibold">
                        {formatFecha(n.fecha)}
                      </p>
                    </div>
                    <Badge variant="secondary" className="font-normal">
                      {n.asistencia}
                    </Badge>
                  </li>
                ))}
              </ul>

              <p className="mt-4 text-xs text-muted-foreground">
                Total: {novedades.length} novedad
                {novedades.length === 1 ? "" : "es"}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
