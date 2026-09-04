"use client"

/**
 * Wrapper del Visor de Ubicaciones (pestana "Seguimiento a Conexiones").
 *
 * Responsabilidades:
 *  1. Consultar la tabla `registro_conexiones` de Supabase.
 *  2. Resolver el `nombre_usuario` contra `profiles.usuario` (FK via auth.users).
 *  3. Cargar el mapa Leaflet dinamicamente con `ssr: false` para evitar errores
 *     de `window is not defined` durante el render en servidor.
 *  4. Renderizar un Card de shadcn con titulo, badge de conteo y filtro de rango
 *     de fechas.
 */

import { useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { DatePickerField } from "@/components/ui/date-picker-field"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, MapPin, RefreshCw, User } from "lucide-react"
import { createClient } from "@/lib/supabase-client"
import type { Conexion } from "@/components/visor-ubicaciones-map"

// Carga dinamica del mapa: ssr: false es OBLIGATORIO porque Leaflet depende de `window`.
const VisorUbicacionesMap = dynamic(() => import("@/components/visor-ubicaciones-map"), {
  ssr: false,
  loading: () => (
    <div className="h-[500px] w-full flex items-center justify-center bg-muted/30 rounded-xl">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  ),
})

export default function VisorUbicaciones() {
  const [conexiones, setConexiones] = useState<Conexion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Rango por defecto: ultimos 7 dias
  const today = new Date()
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  const [startDate, setStartDate] = useState(weekAgo.toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(today.toISOString().slice(0, 10))

  // Filtro por nombre de usuario. "all" = sin filtro. El valor almacenado es el
  // usuario_id (UUID) de la tabla profiles, no el nombre, para evitar colisiones.
  const [selectedUsuarioId, setSelectedUsuarioId] = useState<string>("all")

  const loadConexiones = async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = await createClient()

      // Construir rango inclusivo [start 00:00, end 23:59:59]
      const startIso = `${startDate}T00:00:00`
      const endIso = `${endDate}T23:59:59`

      const { data, error: err } = await supabase
        .from("registro_conexiones")
        .select("id, usuario_id, latitud, longitud, accion, created_at")
        .gte("created_at", startIso)
        .lte("created_at", endIso)
        .not("latitud", "is", null)
        .not("longitud", "is", null)
        .order("created_at", { ascending: false })
        .limit(500)

      if (err) {
        console.log("[v0] Error cargando registro_conexiones:", err)
        setError(err.message)
        setConexiones([])
        setLoading(false)
        return
      }

      const rows = data || []
      console.log("[v0] registro_conexiones filas:", rows.length)

      // Resolver nombres de usuario: se obtienen los usuario_id unicos y se consultan
      // contra `profiles` (tabla mencionada en conversaciones previas del proyecto).
      const uniqueUserIds = Array.from(new Set(rows.map((r) => r.usuario_id).filter(Boolean)))
      const nombresMap = new Map<string, string>()

      if (uniqueUserIds.length > 0) {
        const { data: profiles, error: profErr } = await supabase
          .from("profiles")
          .select("id, usuario")
          .in("id", uniqueUserIds)

        if (profErr) {
          console.log("[v0] No se pudieron resolver profiles:", profErr.message)
        } else {
          for (const p of profiles || []) {
            nombresMap.set(p.id as string, (p as any).usuario || "Usuario")
          }
        }
      }

      const conexionesMapeadas: Conexion[] = rows.map((r: any) => ({
        id: String(r.id),
        usuario_id: r.usuario_id,
        nombre_usuario: nombresMap.get(r.usuario_id) || "Usuario desconocido",
        latitud: Number(r.latitud),
        longitud: Number(r.longitud),
        accion: r.accion || "Captura automatica",
        created_at: r.created_at,
      }))

      setConexiones(conexionesMapeadas)
    } catch (e: any) {
      console.log("[v0] VisorUbicaciones exception:", e)
      setError(e?.message || "Error desconocido")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadConexiones()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Lista de usuarios unicos para el Select de filtro (se deriva de las conexiones
  // ya cargadas para que el dropdown siempre muestre opciones con nombre resuelto)
  const opcionesUsuarios = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const c of conexiones) {
      if (c.usuario_id && !mapa.has(c.usuario_id)) {
        mapa.set(c.usuario_id, c.nombre_usuario || "Usuario")
      }
    }
    // Orden alfabetico por nombre
    return Array.from(mapa.entries())
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
  }, [conexiones])

  // Conexiones tras aplicar el filtro por usuario. Se filtra en cliente para que
  // cambiar el filtro no dispare una nueva query a Supabase.
  const conexionesFiltradas = useMemo(() => {
    if (selectedUsuarioId === "all") return conexiones
    return conexiones.filter((c) => c.usuario_id === selectedUsuarioId)
  }, [conexiones, selectedUsuarioId])

  // Estadisticas simples para el encabezado (basadas en el resultado filtrado)
  const usuariosUnicos = useMemo(
    () => new Set(conexionesFiltradas.map((c) => c.usuario_id)).size,
    [conexionesFiltradas],
  )

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Rastreo de Conexiones
          </CardTitle>
          <CardDescription>
            Ubicaciones capturadas automaticamente (08:00, 14:00 y 17:00 hora Colombia)
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {conexionesFiltradas.length} punto{conexionesFiltradas.length !== 1 ? "s" : ""}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {usuariosUnicos} usuario{usuariosUnicos !== 1 ? "s" : ""}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Filtros: fecha inicio, fecha fin, usuario y boton actualizar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.5fr_auto] gap-3 items-end">
          <div>
            <label className="text-sm font-medium">Fecha Inicio</label>
            <DatePickerField
              value={startDate}
              onChange={setStartDate}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Fecha Fin</label>
            <DatePickerField
              value={endDate}
              onChange={setEndDate}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" />
              Usuario
            </label>
            <Select value={selectedUsuarioId} onValueChange={setSelectedUsuarioId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Todos los usuarios" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los usuarios</SelectItem>
                {opcionesUsuarios.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={loadConexiones} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Actualizar
          </Button>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Contenedor del mapa: h-[500px] w-full rounded-xl overflow-hidden border */}
        <div className="h-[500px] w-full rounded-xl overflow-hidden border">
          {loading && conexiones.length === 0 ? (
            <div className="h-full w-full flex items-center justify-center bg-muted/30">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : conexionesFiltradas.length === 0 ? (
            <div className="h-full w-full flex flex-col items-center justify-center gap-2 bg-muted/30 text-muted-foreground">
              <MapPin className="h-8 w-8" />
              <p className="text-sm">
                {conexiones.length === 0
                  ? "No hay conexiones en el rango seleccionado"
                  : "El usuario seleccionado no tiene conexiones en este rango"}
              </p>
            </div>
          ) : (
            <VisorUbicacionesMap conexiones={conexionesFiltradas} />
          )}
        </div>
      </CardContent>
    </Card>
  )
}
