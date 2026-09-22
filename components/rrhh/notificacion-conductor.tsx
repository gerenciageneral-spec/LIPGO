"use client"

// NOTIFICACIÓN AL CONDUCTOR
//
// Configura los dos avisos automáticos: asignación de muelle y fin de cargue.
//
// Lo que más importa de esta pantalla es el DESVÍO DE PRUEBAS: mientras tenga
// un número, todos los avisos van ahí en vez de al conductor. Vaciarlo es lo
// que pone el flujo en real, y por eso se pide confirmación.

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"
import { AlertTriangle, ExternalLink, Loader2, Save, TestTube2, Truck } from "lucide-react"
import {
  getConfigConductor,
  getEnlaceEncuestaEjemplo,
  guardarConfigConductor,
} from "@/lib/notificacion-conductor-actions"
import type { ConfigConductor } from "@/lib/notificacion-conductor-tipos"

/** Los proyectos de LIP. Mismos ids que usa el resto del sistema. */
const EMPRESAS = [
  { id: 1, nombre: "Harinera Indupan" },
  { id: 2, nombre: "Avimol" },
  { id: 3, nombre: "Cedi Funza" },
  { id: 4, nombre: "Cedi Medellín" },
]

const MARCADORES = [
  { clave: "{conductor}", que: "nombre del conductor" },
  { clave: "{placa}", que: "placa del vehículo" },
  { clave: "{muelle}", que: "número de muelle" },
  { clave: "{orden}", que: "número de orden" },
  { clave: "{cliente}", que: "empresa" },
  { clave: "{encuesta}", que: "enlace de la encuesta" },
]

function Tarjeta({
  cfg,
  onGuardar,
}: {
  cfg: ConfigConductor
  onGuardar: () => void
}) {
  const { toast } = useToast()
  const [activo, setActivo] = useState(cfg.activo)
  const [mensaje, setMensaje] = useState(cfg.mensaje)
  const [titulo, setTitulo] = useState(cfg.titulo)
  const [url, setUrl] = useState(cfg.urlEncuesta ?? "")
  const [empresas, setEmpresas] = useState<number[]>(cfg.empresas)
  const [telPrueba, setTelPrueba] = useState(cfg.telefonoPrueba ?? "")
  const [guardando, setGuardando] = useState(false)
  // Un enlace real, para poder abrir la encuesta antes de activar el aviso.
  const [ejemploUrl, setEjemploUrl] = useState<string | null>(null)
  const [ejemploOrden, setEjemploOrden] = useState<string | null>(null)
  const [buscandoEjemplo, setBuscandoEjemplo] = useState(false)

  const esCierre = cfg.evento === "cargue_finalizado"

  // La primera versión del script 182 sembró este marcador. No es un formulario:
  // es un enlace muerto que le gana a la encuesta propia y deja el KPI en cero
  // sin que nada avise. Se señala aquí porque se corrige borrando el campo.
  const urlMuerta = url.trim() === "https://forms.gle/PENDIENTE"

  async function guardar() {
    // Quitar el desvío es lo que hace que empiecen a llegarle mensajes a gente
    // real. No puede pasar por descuido.
    if (cfg.telefonoPrueba && !telPrueba.trim()) {
      const ok = window.confirm(
        "Vas a quitar el teléfono de pruebas.\n\n" +
          "A partir de ahora los avisos irían al conductor de cada orden, no a tu número. " +
          "¿Continuar?",
      )
      if (!ok) return
    }

    setGuardando(true)
    const r = await guardarConfigConductor({
      evento: cfg.evento,
      activo,
      mensaje,
      titulo,
      urlEncuesta: esCierre ? url : null,
      empresas,
      telefonoPrueba: telPrueba || null,
    })
    setGuardando(false)
    if (!r.success) {
      toast({ title: "No se pudo guardar", description: r.message, variant: "destructive" })
      return
    }
    toast({ title: "Configuración guardada", description: cfg.nombre })
    onGuardar()
  }

  async function verEnlaceReal() {
    setBuscandoEjemplo(true)
    const r = await getEnlaceEncuestaEjemplo()
    setBuscandoEjemplo(false)
    if (!r.success || !r.url) {
      toast({
        title: "No se pudo armar el enlace",
        description: r.message,
        variant: "destructive",
      })
      return
    }
    setEjemploUrl(r.url)
    setEjemploOrden(r.orden ?? null)
  }

  // Cómo se va a ver el mensaje, con datos de ejemplo.
  const ejemplo = mensaje
    .replace(/\{conductor\}/gi, "Jorge Ramírez")
    .replace(/\{placa\}/gi, "ABC123")
    .replace(/\{muelle\}/gi, "3")
    .replace(/\{orden\}/gi, "OC-4451")
    .replace(/\{cliente\}/gi, "Avimol")
    .replace(
      /\{encuesta\}/gi,
      urlMuerta
        ? "(enlace roto)"
        : url || ejemploUrl || "el enlace de la encuesta de LIPgo",
    )

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Truck className="h-4 w-4" />
            {cfg.nombre}
          </h3>
          <p className="text-[11px] text-muted-foreground">
            {cfg.evento === "muelle_asignado"
              ? "Se envía al asignarle un muelle al vehículo."
              : "Se envía al cerrar la orden de cargue."}
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox checked={activo} onCheckedChange={(v) => setActivo(v === true)} />
          <span className="text-sm font-medium">{activo ? "Activo" : "Desactivado"}</span>
        </label>
      </div>

      <div className="space-y-3 p-4">
        <div>
          <Label className="text-xs">Título del aviso</Label>
          <Input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            className="mt-1 h-9 text-sm"
          />
        </div>

        <div>
          <Label className="text-xs">Mensaje</Label>
          <Textarea
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            rows={3}
            className="mt-1 text-sm"
          />
          <div className="mt-1.5 flex flex-wrap gap-1">
            {MARCADORES.filter((m) => esCierre || m.clave !== "{encuesta}").map((m) => (
              <button
                key={m.clave}
                type="button"
                title={m.que}
                onClick={() => setMensaje((t) => `${t} ${m.clave}`.replace(/\s{2,}/g, " ").trim())}
                className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] hover:bg-muted/50"
              >
                {m.clave}
              </button>
            ))}
          </div>
        </div>

        {esCierre && (
          <div>
            <Label className="text-xs">Enlace de la encuesta</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Déjalo vacío para usar la encuesta de LIPgo"
              className="mt-1 h-9 text-sm"
            />
            {/* Vacío no es un olvido: es lo que hace que las respuestas cuenten
                en el indicador. Conviene decirlo donde se decide. */}
            {urlMuerta && (
              <div className="mt-1.5 rounded-md border border-amber-300 bg-amber-50 p-2">
                <p className="text-[11px] text-amber-900">
                  <strong>Este enlace no lleva a ninguna parte.</strong> Es un marcador que quedó
                  de una versión anterior. Bórralo y guarda para usar la encuesta de LIPgo; si lo
                  dejas, al conductor le llega un enlace que no abre.
                </p>
                <button
                  type="button"
                  onClick={() => setUrl("")}
                  className="mt-1.5 rounded border border-amber-400 bg-white px-2 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
                >
                  Borrar el enlace
                </button>
              </div>
            )}
            {/* El enlace es distinto por orden y se arma al enviar, así que aquí
                no hay uno "el" enlace que mostrar. Poder abrir uno real es lo
                único que confirma que la encuesta responde; sin esto, el
                primero en probarla sería un conductor. */}
            {!url.trim() && (
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                {ejemploUrl ? (
                  <>
                    <p className="text-[11px] text-slate-600">
                      Así queda para la orden <strong>{ejemploOrden}</strong>. Cada orden lleva el
                      suyo:
                    </p>
                    <a
                      href={ejemploUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 flex items-center gap-1.5 break-all font-mono text-[11px] text-teal-700 underline"
                    >
                      {ejemploUrl}
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                    <p className="mt-1.5 text-[11px] text-slate-500">
                      Ábrelo para ver lo que verá el conductor. Es real: si lo respondes, la
                      calificación queda registrada para esa orden.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-[11px] text-slate-600">
                      El enlace se arma al enviar y es distinto para cada orden, por eso no aparece
                      aquí.
                    </p>
                    <button
                      type="button"
                      onClick={verEnlaceReal}
                      disabled={buscandoEjemplo}
                      className="mt-1.5 flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                    >
                      {buscandoEjemplo ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <ExternalLink className="h-3 w-3" />
                      )}
                      Ver un enlace real
                    </button>
                  </>
                )}
              </div>
            )}
            <p className="mt-1 text-[11px] text-muted-foreground">
              {url.trim() && !urlMuerta ? (
                <>
                  Se usará este enlace externo. Las respuestas quedarán{" "}
                  <strong>fuera</strong> del indicador de Satisfacción conductor.
                </>
              ) : urlMuerta ? null : (
                <>
                  Se usará la <strong>encuesta de LIPgo</strong>, un enlace distinto para cada
                  orden que el conductor abre sin iniciar sesión. Las respuestas alimentan el KPI
                  de Satisfacción conductor en Satisfacción y PQRSF.
                </>
              )}
            </p>
          </div>
        )}

        {/* Cómo lo va a recibir el conductor. */}
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-[10px] uppercase tracking-wide text-emerald-800">Así se verá</p>
          <p className="mt-1 text-sm text-emerald-900">
            <strong>{titulo || "LIP Logística"}</strong>
            <br />
            Hola Jorge Ramírez, {ejemplo || "…"}
          </p>
        </div>

        <div>
          <Label className="text-xs">Empresas donde aplica</Label>
          <div className="mt-1 flex flex-wrap gap-3">
            {EMPRESAS.map((e) => (
              <label key={e.id} className="flex cursor-pointer items-center gap-1.5 text-sm">
                <Checkbox
                  checked={empresas.includes(e.id)}
                  onCheckedChange={(v) =>
                    setEmpresas((prev) =>
                      v === true ? [...prev, e.id] : prev.filter((x) => x !== e.id),
                    )
                  }
                />
                {e.nombre}
              </label>
            ))}
          </div>
          {activo && empresas.length === 0 && (
            <p className="mt-1 text-[11px] text-amber-700">
              Sin empresas seleccionadas no se enviará ningún aviso.
            </p>
          )}
        </div>

        {/* EL DESVÍO. Es lo que separa una prueba de escribirle a gente real. */}
        <div
          className={`rounded-lg border p-3 ${
            telPrueba ? "border-sky-300 bg-sky-50" : "border-red-300 bg-red-50"
          }`}
        >
          <p
            className={`flex items-center gap-1.5 text-sm font-medium ${
              telPrueba ? "text-sky-900" : "text-red-900"
            }`}
          >
            <TestTube2 className="h-4 w-4" />
            {telPrueba ? "En modo prueba" : "Enviará al conductor real"}
          </p>
          <Input
            value={telPrueba}
            onChange={(e) => setTelPrueba(e.target.value)}
            placeholder="3202343157"
            className="mt-2 h-9 bg-white text-sm"
          />
          <p className={`mt-1 text-[11px] ${telPrueba ? "text-sky-800" : "text-red-800"}`}>
            {telPrueba
              ? "Todos los avisos van a este número, no al conductor. Vacíalo cuando quieras pasar a real."
              : "Sin número de pruebas, los avisos irán al teléfono del conductor de cada orden."}
          </p>
        </div>

        <Button className="w-full gap-1.5" onClick={guardar} disabled={guardando}>
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar
        </Button>
      </div>
    </section>
  )
}

export default function NotificacionConductor() {
  const [configs, setConfigs] = useState<ConfigConductor[]>([])
  const [faltaMigracion, setFaltaMigracion] = useState(false)
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    setCargando(true)
    const r = await getConfigConductor()
    if (r.success && r.data) setConfigs(r.data)
    setFaltaMigracion(!!r.faltaMigracion)
    setCargando(false)
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  if (cargando) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (faltaMigracion) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="flex items-center gap-2 font-medium">
          <AlertTriangle className="h-4 w-4" />
          Falta correr <code className="font-mono text-xs">scripts/182_notificacion_conductor.sql</code>
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <p className="text-[11px] text-muted-foreground">
          Estos avisos se envían <strong>solos</strong> cuando ocurre el evento en el Centro de
          Coordinación. Cada mensaje tiene costo, así que conviene dejarlos en modo prueba hasta
          confirmar que el texto y el momento son los correctos. Un aviso se envía{" "}
          <strong>una sola vez por orden</strong>: reasignar el muelle no vuelve a escribirle al
          conductor.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {configs.map((c) => (
          <Tarjeta key={c.evento} cfg={c} onGuardar={cargar} />
        ))}
      </div>
    </div>
  )
}
