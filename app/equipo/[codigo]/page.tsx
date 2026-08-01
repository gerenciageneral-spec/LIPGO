"use client"

// Pantalla que abre el QR pegado en el montacarga.
//
// Vive FUERA de /portal a propósito: el portal del colaborador se autentica
// con localStorage, y aquí hace falta la sesión real de Supabase Auth para que
// cada registro quede firmado con el usuario. Como AuthProvider está en el
// layout raíz, esta ruta la hereda sin configurar nada.
//
// Está pensada para un celular con una mano: fichas grandes, un solo botón
// protagonista y nada de tablas anchas.

import { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@/components/auth-provider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, ArrowLeft, Forklift, Loader2, LogIn, Wrench } from "lucide-react"
import { getMontacargaPorQR, getHojaDeVida, type Montacarga, type HojaDeVida } from "@/lib/montacargas-actions"
import { RegistroActividad, ETIQUETA_TIPO } from "@/components/montacargas/registro-actividad"

const ETIQUETA_PREVENTIVO: Record<string, string> = {
  vencido: "Preventivo VENCIDO",
  proximo: "Preventivo próximo",
  al_dia: "Preventivo al día",
  sin_programar: "Preventivo sin programar",
}
const TONO: Record<string, string> = {
  vencido: "border-red-300 bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-300",
  proximo: "border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-300",
  al_dia: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300",
  sin_programar: "border-border bg-muted text-muted-foreground",
}

export default function EquipoQRPage() {
  const params = useParams<{ codigo: string }>()
  const codigo = decodeURIComponent(String(params?.codigo ?? ""))
  const router = useRouter()
  const { user, loading: cargandoSesion } = useAuth()

  const [equipo, setEquipo] = useState<Montacarga | null>(null)
  const [hoja, setHoja] = useState<HojaDeVida | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modo, setModo] = useState<null | { tipo: "registrar" } | { tipo: "cerrar"; actividadId: number }>(null)

  const cargar = useCallback(async () => {
    if (!codigo) return
    setCargando(true)
    const r = await getMontacargaPorQR(codigo)
    if (!r.success || !r.data) {
      setError(r.error || "No se encontró el equipo.")
      setEquipo(null)
    } else {
      setEquipo(r.data)
      setError(null)
      // La hoja se pide con el proyecto DEL EQUIPO, no con el del selector: el
      // QR viene de la máquina y quien escanea puede tener otro proyecto activo.
      const h = await getHojaDeVida(r.data.idempresa, r.data.id)
      setHoja(h.success ? h.data! : null)
    }
    setCargando(false)
  }, [codigo])

  useEffect(() => {
    if (!cargandoSesion && user) cargar()
  }, [cargandoSesion, user, cargar])

  // --- Sin sesión: se manda a entrar y se vuelve aquí ---
  if (cargandoSesion) {
    return (
      <Pantalla>
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Verificando tu sesión…
        </div>
      </Pantalla>
    )
  }
  if (!user) {
    return (
      <Pantalla>
        <Card>
          <CardContent className="space-y-4 p-6 text-center">
            <Forklift className="mx-auto h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-semibold">Entra para registrar el mantenimiento</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Cada registro queda firmado con tu usuario, por eso hace falta iniciar sesión.
              </p>
            </div>
            <Button
              className="h-11 w-full"
              onClick={() => router.push(`/login?next=${encodeURIComponent(`/equipo/${codigo}`)}`)}
            >
              <LogIn className="mr-2 h-4 w-4" /> Iniciar sesión
            </Button>
          </CardContent>
        </Card>
      </Pantalla>
    )
  }

  if (cargando) {
    return (
      <Pantalla>
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Buscando el equipo…
        </div>
      </Pantalla>
    )
  }

  if (error || !equipo) {
    return (
      <Pantalla>
        <Card className="border-red-300">
          <CardContent className="space-y-3 p-6 text-center">
            <AlertTriangle className="mx-auto h-9 w-9 text-red-500" />
            <p className="text-sm">{error}</p>
            <Button variant="outline" className="h-11 w-full" onClick={() => router.push("/")}>
              Ir a LIPgo
            </Button>
          </CardContent>
        </Card>
      </Pantalla>
    )
  }

  const abiertas = (hoja?.actividades || []).filter((a) => a.estado_gestion === "abierto")

  return (
    <Pantalla>
      {modo ? (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setModo(null)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <CardTitle className="text-base">
                {modo.tipo === "registrar" ? "Registrar actividad" : "Cerrar pendiente"}
              </CardTitle>
            </div>
            <p className="pl-9 text-xs text-muted-foreground">{equipo.identificacion}</p>
          </CardHeader>
          <CardContent>
            <RegistroActividad
              idempresa={equipo.idempresa}
              equipoId={equipo.id}
              modo={modo.tipo}
              actividadId={modo.tipo === "cerrar" ? modo.actividadId : undefined}
              onListo={() => {
                setModo(null)
                cargar()
              }}
              onCancelar={() => setModo(null)}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-primary/10 p-3">
                  <Forklift className="h-7 w-7 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="truncate text-xl font-bold">{equipo.identificacion}</h1>
                  {equipo.alias && <p className="truncate text-sm text-muted-foreground">{equipo.alias}</p>}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[equipo.marca, equipo.modelo].filter(Boolean).join(" ") || "Montacarga"}
                    {equipo.capacidad_kg ? ` · ${equipo.capacidad_kg} kg` : ""}
                    {equipo.tipo_energia ? ` · ${equipo.tipo_energia}` : ""}
                  </p>
                </div>
              </div>

              <div className={`mt-4 rounded-lg border px-3 py-2 text-sm ${TONO[equipo.preventivo.estado]}`}>
                <div className="font-semibold">{ETIQUETA_PREVENTIVO[equipo.preventivo.estado]}</div>
                <div className="text-xs opacity-90">{equipo.preventivo.detalle}</div>
                {equipo.horometro_actual != null && (
                  <div className="text-xs opacity-90">Último horómetro registrado: {equipo.horometro_actual} h</div>
                )}
              </div>

              <Button className="mt-4 h-12 w-full text-base" onClick={() => setModo({ tipo: "registrar" })}>
                <Wrench className="mr-2 h-5 w-5" /> Registrar actividad
              </Button>
            </CardContent>
          </Card>

          {abiertas.length > 0 && (
            <Card className="border-red-300">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-red-700 dark:text-red-400">
                  {abiertas.length} falla(s) sin resolver
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {abiertas.map((a) => (
                  <div key={a.id} className="rounded-lg border bg-red-50/40 p-3 dark:bg-red-950/10">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Badge variant="outline" className="text-[10px]">{ETIQUETA_TIPO[a.tipo] || a.tipo}</Badge>
                      <span className="text-muted-foreground">desde {String(a.created_at).slice(0, 10)}</span>
                    </div>
                    <p className="mt-1 text-sm">{a.descripcion}</p>
                    {a.fotos.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {a.fotos.map((f) => (
                          <a key={f.url} href={f.url} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={f.url} alt={f.momento} className="h-14 w-14 rounded border object-cover" />
                          </a>
                        ))}
                      </div>
                    )}
                    <Button
                      size="sm"
                      className="mt-2 h-9 w-full"
                      onClick={() => setModo({ tipo: "cerrar", actividadId: a.id })}
                    >
                      Cerrar este pendiente
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {hoja && hoja.actividades.length > abiertas.length && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Últimas actividades</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {hoja.actividades
                  .filter((a) => a.estado_gestion !== "abierto")
                  .slice(0, 8)
                  .map((a) => (
                    <div key={a.id} className="rounded-md border p-2.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-medium">{ETIQUETA_TIPO[a.tipo] || a.tipo}</span>
                        <span className="text-muted-foreground">
                          {String(a.fecha_ejecucion ?? a.created_at).slice(0, 10)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm">{a.descripcion}</p>
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </Pantalla>
  )
}

function Pantalla({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30 px-4 py-6">
      <div className="mx-auto max-w-lg space-y-4">{children}</div>
    </div>
  )
}
