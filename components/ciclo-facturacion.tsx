"use client"

// CICLO DE FACTURACIÓN (Gestión Financiera › Facturación).
//
// Flujo documental de una prefactura ya aprobada: anexo enviado (Jefe de
// Facturación) -> anexo firmado por el cliente (Coordinador) -> factura
// enviada (Jefe) -> factura firmada por el cliente (Coordinador) -> cierre
// (Jefe). Desde el cierre arranca cartera/cobro (días vencidos, pagos). Ver
// lib/ciclo-facturacion-actions.ts.

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/components/auth-provider"
import { getUserPermissions } from "@/lib/permissions-actions"
import {
  listarCicloFacturacion,
  getEventosCiclo,
  solicitarCorreccion,
  marcarCierre,
  registrarPago,
  getPagosDe,
  getCondicionesPagoOwner,
  actualizarCondicionPagoOwner,
  getCondicionesEnvioAnexo,
  actualizarCondicionEnvioAnexo,
  getSoporteDePrefactura,
  type PrefacturaCiclo,
  type EventoCiclo,
  type EstadoCiclo,
  type EtapaDocumento,
  type EtapaCorregible,
  type PagoPrefactura,
  type CondicionEnvioAnexo,
} from "@/lib/ciclo-facturacion-actions"
import { DIAS_SEMANA_LABEL } from "@/lib/ciclo-facturacion-shared"
import { AdjuntosUploader } from "@/components/ciclo-facturacion/adjuntos-uploader"
import { SoporteAnexo } from "@/components/cuadro-control-facturacion"
import type { SoporteLinea } from "@/lib/facturacion-control-actions"
import { AlertTriangle, Check, ChevronDown, ChevronUp, Clock, FileClock, Loader2, Settings2, Wallet } from "lucide-react"

const money = (v: number) => `$${Math.round(v).toLocaleString("es-CO")}`

const PASOS: { key: EstadoCiclo; label: string; evento: EtapaDocumento | null; rol: "jefe" | "coordinador" }[] = [
  { key: "pendiente_anexo", label: "Anexo enviado", evento: "anexo_enviado", rol: "jefe" },
  { key: "pendiente_firma_anexo", label: "Anexo firmado", evento: "anexo_firmado", rol: "coordinador" },
  { key: "pendiente_factura", label: "Factura enviada", evento: "factura_enviada", rol: "jefe" },
  { key: "pendiente_firma_factura", label: "Factura firmada", evento: "factura_firmada", rol: "coordinador" },
  { key: "pendiente_cierre", label: "Cierre", evento: null, rol: "jefe" },
]
const IDX_ESTADO: Record<EstadoCiclo, number> = {
  pendiente_anexo: 0,
  pendiente_firma_anexo: 1,
  pendiente_factura: 2,
  pendiente_firma_factura: 3,
  pendiente_cierre: 4,
  cerrado: 5,
}

const LABEL_EVENTO: Record<string, string> = {
  anexo_enviado: "Anexo enviado",
  anexo_firmado: "Anexo firmado por el cliente",
  factura_enviada: "Factura enviada",
  factura_firmada: "Factura firmada por el cliente",
  cierre: "Cierre de facturación",
  correccion_solicitada: "Corrección solicitada",
}

/** Línea de pasos con círculos + conector, coloreada por estado (hecho/actual/futuro). */
function Stepper({ estado }: { estado: EstadoCiclo }) {
  const idx = estado === "cerrado" ? PASOS.length : IDX_ESTADO[estado]
  return (
    <div className="flex items-center">
      {PASOS.map((p, i) => {
        const hecho = i < idx
        const actual = i === idx
        return (
          <div key={p.key} className="flex items-center">
            {i > 0 && (
              <div
                className={`h-0.5 w-4 sm:w-6 ${i <= idx ? "bg-emerald-500" : "bg-border"}`}
                aria-hidden="true"
              />
            )}
            <div className="flex flex-col items-center gap-0.5" title={p.label}>
              <div
                className={
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ring-2 " +
                  (hecho
                    ? "bg-emerald-500 text-white ring-emerald-500 dark:bg-emerald-600 dark:ring-emerald-600"
                    : actual
                      ? "animate-pulse bg-amber-500 text-white ring-amber-500 dark:bg-amber-600 dark:ring-amber-600"
                      : "bg-muted text-muted-foreground ring-border")
                }
              >
                {hecho ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <span
                className={
                  "hidden text-[9px] leading-none sm:block " +
                  (hecho
                    ? "font-medium text-emerald-700 dark:text-emerald-400"
                    : actual
                      ? "font-bold text-amber-700 dark:text-amber-400"
                      : "text-muted-foreground")
                }
              >
                {p.label}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function BadgeCobro({ estado, dias }: { estado: "pendiente" | "parcial" | "pagada" | null; dias: number | null }) {
  if (!estado) return null
  if (estado === "pagada")
    return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300">Pagada</Badge>
  const vencida = dias !== null && dias > 0
  if (vencida) return <Badge variant="destructive">Vencida {dias}d</Badge>
  if (estado === "parcial")
    return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300">Parcial</Badge>
  return <Badge variant="secondary">Pendiente{dias !== null && dias < 0 ? ` (vence en ${-dias}d)` : ""}</Badge>
}

export default function CicloFacturacion() {
  const { toast } = useToast()
  const { user } = useAuth() as any
  const usuario: string = user?.email || user?.nombre || "usuario"

  const [permisos, setPermisos] = useState<{ jefe: boolean; coordinador: boolean }>({ jefe: false, coordinador: false })
  useEffect(() => {
    getUserPermissions()
      .then((p) => setPermisos({ jefe: !!p?.ciclo_facturacion_jefe, coordinador: !!p?.ciclo_facturacion_coordinador }))
      .catch(() => setPermisos({ jefe: false, coordinador: false }))
  }, [])

  const [data, setData] = useState<PrefacturaCiclo[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroProyecto, setFiltroProyecto] = useState<string>("")
  const [filtroEstadoCiclo, setFiltroEstadoCiclo] = useState<string>("")
  const [filtroEstadoCobro, setFiltroEstadoCobro] = useState<string>("")
  const [soloMisPendientes, setSoloMisPendientes] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    const r = await listarCicloFacturacion({
      estado_ciclo: (filtroEstadoCiclo as EstadoCiclo) || null,
      estado_cobro: (filtroEstadoCobro as any) || null,
    })
    if (r.success) setData(r.data)
    else toast({ title: "Error", description: r.message, variant: "destructive" })
    setLoading(false)
  }, [filtroEstadoCiclo, filtroEstadoCobro, toast])

  useEffect(() => {
    cargar()
  }, [cargar])

  const proyectos = useMemo(() => Array.from(new Set(data.map((d) => d.proyecto).filter(Boolean))) as string[], [data])

  const filtrados = useMemo(() => {
    return data.filter((d) => {
      if (filtroProyecto && d.proyecto !== filtroProyecto) return false
      if (soloMisPendientes) {
        const rolPaso = PASOS[IDX_ESTADO[d.estado_ciclo]]?.rol
        const esMio = (rolPaso === "jefe" && permisos.jefe) || (rolPaso === "coordinador" && permisos.coordinador)
        if (d.estado_ciclo !== "cerrado" && !esMio) return false
        if (d.estado_ciclo === "cerrado" && d.estado_cobro === "pagada") return false
      }
      return true
    })
  }, [data, filtroProyecto, soloMisPendientes, permisos])

  const [seleccionId, setSeleccionId] = useState<number | null>(null)

  const resumen = useMemo(() => {
    const enCiclo = data.filter((d) => d.estado_ciclo !== "cerrado").length
    const cerradas = data.filter((d) => d.estado_ciclo === "cerrado")
    const carteraPendiente = cerradas.reduce((s, d) => s + (d.estado_cobro !== "pagada" ? d.saldo : 0), 0)
    const vencidas = cerradas.filter((d) => d.diasVencida !== null && d.diasVencida > 0 && d.estado_cobro !== "pagada")
    const carteraVencida = vencidas.reduce((s, d) => s + d.saldo, 0)
    return { enCiclo, cerradas: cerradas.length, carteraPendiente, carteraVencida, vencidasCount: vencidas.length }
  }, [data])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-3">
            <div className="rounded-full bg-amber-100 p-2 dark:bg-amber-950/40">
              <FileClock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <div className="text-lg font-bold leading-none">{resumen.enCiclo}</div>
              <div className="text-[11px] text-muted-foreground">En proceso</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-3">
            <div className="rounded-full bg-emerald-100 p-2 dark:bg-emerald-950/40">
              <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <div className="text-lg font-bold leading-none">{resumen.cerradas}</div>
              <div className="text-[11px] text-muted-foreground">Cerradas</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-3">
            <div className="rounded-full bg-blue-100 p-2 dark:bg-blue-950/40">
              <Wallet className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <div className="text-lg font-bold leading-none">{money(resumen.carteraPendiente)}</div>
              <div className="text-[11px] text-muted-foreground">Cartera pendiente</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-3">
            <div className="rounded-full bg-red-100 p-2 dark:bg-red-950/40">
              <Clock className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <div className="text-lg font-bold leading-none text-red-600 dark:text-red-400">{money(resumen.carteraVencida)}</div>
              <div className="text-[11px] text-muted-foreground">Vencida ({resumen.vencidasCount})</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ciclo de Facturación</CardTitle>
          <CardDescription>
            Anexo enviado → firmado por el cliente → factura enviada → firmada → cierre. Desde el cierre, cartera/cobro (días vencidos).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filtroProyecto || "todos"} onValueChange={(v) => setFiltroProyecto(v === "todos" ? "" : v)}>
              <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue placeholder="Proyecto" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los proyectos</SelectItem>
                {proyectos.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filtroEstadoCiclo || "todos"} onValueChange={(v) => setFiltroEstadoCiclo(v === "todos" ? "" : v)}>
              <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="Etapa" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas las etapas</SelectItem>
                {PASOS.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                <SelectItem value="cerrado">Cerrado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroEstadoCobro || "todos"} onValueChange={(v) => setFiltroEstadoCobro(v === "todos" ? "" : v)}>
              <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="Cobro" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Cualquier cobro</SelectItem>
                <SelectItem value="pendiente">Pendiente</SelectItem>
                <SelectItem value="parcial">Parcial</SelectItem>
                <SelectItem value="pagada">Pagada</SelectItem>
              </SelectContent>
            </Select>
            <label className="flex items-center gap-1.5 text-xs">
              <Checkbox checked={soloMisPendientes} onCheckedChange={(v) => setSoloMisPendientes(!!v)} />
              Mis pendientes
            </label>
          </div>

          {loading ? (
            <div className="py-8 text-center text-xs text-muted-foreground">Cargando…</div>
          ) : filtrados.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">No hay prefacturas aprobadas con estos filtros.</div>
          ) : (
            <div className="space-y-2">
              {filtrados.map((p) => (
                <FilaCiclo
                  key={p.id}
                  p={p}
                  abierto={seleccionId === p.id}
                  onToggle={() => setSeleccionId(seleccionId === p.id ? null : p.id)}
                  permisos={permisos}
                  usuario={usuario}
                  onCambio={cargar}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {permisos.jefe && <FrecuenciaEnvioAnexoPanel />}
      {permisos.jefe && <CondicionesPagoPanel />}
    </div>
  )
}

function FilaCiclo({
  p,
  abierto,
  onToggle,
  permisos,
  usuario,
  onCambio,
}: {
  p: PrefacturaCiclo
  abierto: boolean
  onToggle: () => void
  permisos: { jefe: boolean; coordinador: boolean }
  usuario: string
  onCambio: () => void
}) {
  return (
    <div className="rounded-md border">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/40"
      >
        <div className="min-w-0">
          <div className="text-sm font-medium">
            {p.owner} <span className="text-xs font-normal text-muted-foreground">· {p.proyecto}</span>
            {p.ownerMezclado && (
              <span className="ml-1.5 inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                <AlertTriangle className="h-3 w-3" /> mezcla varios owners
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {p.periodo_desde || "?"} a {p.periodo_hasta || "?"} · {money(p.total)}
            {p.ultimoEvento && ` · último: ${LABEL_EVENTO[p.ultimoEvento.evento] || p.ultimoEvento.evento} (${new Date(p.ultimoEvento.created_at).toLocaleDateString("es-CO")})`}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Stepper estado={p.estado_ciclo} />
          {p.estado_ciclo === "cerrado" && <BadgeCobro estado={p.estado_cobro} dias={p.diasVencida} />}
          {abierto ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
        </div>
      </button>
      {abierto && <DetalleCiclo prefactura={p} permisos={permisos} usuario={usuario} onCambio={onCambio} />}
    </div>
  )
}

function DetalleCiclo({
  prefactura,
  permisos,
  usuario,
  onCambio,
}: {
  prefactura: PrefacturaCiclo
  permisos: { jefe: boolean; coordinador: boolean }
  usuario: string
  onCambio: () => void
}) {
  const { toast } = useToast()
  const [eventos, setEventos] = useState<EventoCiclo[]>([])
  const [pagos, setPagos] = useState<PagoPrefactura[]>([])
  const [soporte, setSoporte] = useState<SoporteLinea[] | null>(null)
  const [mostrarAnexo, setMostrarAnexo] = useState(false)
  const [cerrando, setCerrando] = useState(false)
  const [correccionAbierta, setCorreccionAbierta] = useState(false)
  const [pagoAbierto, setPagoAbierto] = useState(false)

  const recargarDetalle = useCallback(async () => {
    const [ev, pg] = await Promise.all([
      getEventosCiclo(prefactura.id),
      prefactura.estado_ciclo === "cerrado" ? getPagosDe(prefactura.id) : Promise.resolve({ success: true, data: [] as PagoPrefactura[] }),
    ])
    if (ev.success) setEventos(ev.data)
    if (pg.success) setPagos(pg.data)
  }, [prefactura.id, prefactura.estado_ciclo])

  useEffect(() => {
    recargarDetalle()
  }, [recargarDetalle])

  const cargarSoporte = async () => {
    if (soporte) {
      setMostrarAnexo((v) => !v)
      return
    }
    const r = await getSoporteDePrefactura(prefactura.id)
    if (r.success) {
      setSoporte(r.data)
      setMostrarAnexo(true)
    } else toast({ title: "Error", description: r.message, variant: "destructive" })
  }

  const idx = IDX_ESTADO[prefactura.estado_ciclo]
  const pasoActual = PASOS[idx] // undefined si ya está en pendiente_cierre->cerrado via marcarCierre
  const rolActual = pasoActual?.rol
  const puedoActuar = rolActual === "jefe" ? permisos.jefe : rolActual === "coordinador" ? permisos.coordinador : false

  const cerrar = async () => {
    setCerrando(true)
    const r = await marcarCierre(prefactura.id, usuario)
    setCerrando(false)
    if (r.success) {
      toast({ title: "Facturación cerrada", description: "Arranca el seguimiento de cartera/cobro." })
      onCambio()
    } else toast({ title: "No se pudo cerrar", description: r.message, variant: "destructive" })
  }

  return (
    <div className="space-y-4 border-t bg-muted/20 p-3">
      {/* Acción del paso actual */}
      {prefactura.estado_ciclo !== "cerrado" && (
        <div className="rounded-md border bg-background p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-semibold">
              Paso actual: {pasoActual?.label} — le corresponde a{" "}
              <span className="uppercase">{rolActual === "jefe" ? "Jefe de Facturación" : "Coordinador"}</span>
            </div>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={cargarSoporte}>
              {mostrarAnexo ? "Ocultar anexo" : "Ver anexo original"}
            </Button>
          </div>
          {!puedoActuar ? (
            <p className="text-xs text-muted-foreground">No tienes el permiso para este paso -- solo puedes consultar.</p>
          ) : pasoActual?.evento ? (
            <AdjuntosUploader
              prefacturaId={prefactura.id}
              evento={pasoActual.evento}
              usuario={usuario}
              label={`Adjuntar ${pasoActual.label.toLowerCase()}`}
              onDone={() => {
                recargarDetalle()
                onCambio()
              }}
            />
          ) : (
            <Button size="sm" onClick={cerrar} disabled={cerrando}>
              {cerrando && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Cerrar facturación
            </Button>
          )}
        </div>
      )}

      {mostrarAnexo && soporte && (
        <div className="rounded-md border bg-background p-3">
          <div className="mb-2 text-xs font-semibold">Anexo original de la prefactura</div>
          <SoporteAnexo lineas={soporte} />
        </div>
      )}

      {/* Cartera (solo si cerrado) */}
      {prefactura.estado_ciclo === "cerrado" && (
        <div className="rounded-md border bg-background p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-semibold">
              Cartera: {money(prefactura.saldo)} pendiente de {money(prefactura.total)} · vence {prefactura.fecha_vencimiento}
            </div>
            {permisos.jefe && prefactura.estado_cobro !== "pagada" && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPagoAbierto(true)}>
                Registrar pago
              </Button>
            )}
          </div>
          {pagos.length > 0 && (
            <ul className="space-y-0.5 text-[11px] text-muted-foreground">
              {pagos.map((pg) => (
                <li key={pg.id}>
                  {pg.fecha} · {money(pg.valor)} {pg.observacion ? `· ${pg.observacion}` : ""} {pg.usuario ? `· ${pg.usuario}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Timeline */}
      <div>
        <div className="mb-1.5 text-xs font-semibold">Historial</div>
        <ul className="space-y-2 border-l-2 border-border pl-3 text-[11px]">
          {eventos.map((e) => {
            const esCorreccion = e.evento === "correccion_solicitada"
            return (
              <li key={e.id} className="relative">
                <span
                  className={
                    "absolute -left-[17px] top-0.5 h-2 w-2 rounded-full " +
                    (esCorreccion ? "bg-amber-500 dark:bg-amber-600" : "bg-emerald-500 dark:bg-emerald-600")
                  }
                />
                <span className={esCorreccion ? "font-medium text-amber-700 dark:text-amber-400" : "font-medium"}>
                  {LABEL_EVENTO[e.evento] || e.evento}
                </span>{" "}
                — {new Date(e.created_at).toLocaleString("es-CO")} · {e.usuario}
                {e.archivo_nombre && (
                  <>
                    {" · "}
                    <a href={e.archivo_url || "#"} target="_blank" rel="noreferrer" className="text-primary underline">
                      {e.archivo_nombre}
                    </a>
                  </>
                )}
                {e.nota && <div className="italic text-muted-foreground">{e.nota}</div>}
              </li>
            )
          })}
          {eventos.length === 0 && <li className="text-muted-foreground">Sin eventos todavía.</li>}
        </ul>
      </div>

      {permisos.jefe && (
        <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-amber-700 dark:text-amber-400" onClick={() => setCorreccionAbierta(true)}>
          Solicitar corrección
        </Button>
      )}

      {correccionAbierta && (
        <ModalCorreccion
          prefacturaId={prefactura.id}
          usuario={usuario}
          onClose={() => setCorreccionAbierta(false)}
          onOk={() => {
            setCorreccionAbierta(false)
            recargarDetalle()
            onCambio()
          }}
        />
      )}
      {pagoAbierto && (
        <ModalPago
          prefacturaId={prefactura.id}
          saldo={prefactura.saldo}
          usuario={usuario}
          onClose={() => setPagoAbierto(false)}
          onOk={() => {
            setPagoAbierto(false)
            recargarDetalle()
            onCambio()
          }}
        />
      )}
    </div>
  )
}

const ETAPAS_CORREGIBLES: { value: EtapaCorregible; label: string }[] = [
  { value: "anexo_enviado", label: "Anexo enviado" },
  { value: "anexo_firmado", label: "Anexo firmado" },
  { value: "factura_enviada", label: "Factura enviada" },
  { value: "factura_firmada", label: "Factura firmada" },
  { value: "cierre", label: "Cierre" },
]

function ModalCorreccion({
  prefacturaId,
  usuario,
  onClose,
  onOk,
}: {
  prefacturaId: number
  usuario: string
  onClose: () => void
  onOk: () => void
}) {
  const { toast } = useToast()
  const [etapa, setEtapa] = useState<EtapaCorregible>("anexo_enviado")
  const [nota, setNota] = useState("")
  const [guardando, setGuardando] = useState(false)

  const guardar = async () => {
    if (!nota.trim()) {
      toast({ title: "Falta el motivo", variant: "destructive" })
      return
    }
    setGuardando(true)
    const r = await solicitarCorreccion(prefacturaId, etapa, nota.trim(), usuario)
    setGuardando(false)
    if (r.success) {
      toast({ title: "Corrección registrada", description: "La etapa se reabrió para volver a subir el archivo correcto." })
      onOk()
    } else toast({ title: "No se pudo", description: r.message, variant: "destructive" })
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Solicitar corrección</DialogTitle>
          <DialogDescription>Reabre la etapa elegida para volver a subir el archivo correcto. El historial no se borra.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Etapa a corregir</Label>
            <Select value={etapa} onValueChange={(v) => setEtapa(v as EtapaCorregible)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ETAPAS_CORREGIBLES.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Motivo (obligatorio)</Label>
            <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={3} placeholder="¿Qué estaba mal?" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={guardar} disabled={guardando}>
            {guardando && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Confirmar corrección
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ModalPago({
  prefacturaId,
  saldo,
  usuario,
  onClose,
  onOk,
}: {
  prefacturaId: number
  saldo: number
  usuario: string
  onClose: () => void
  onOk: () => void
}) {
  const { toast } = useToast()
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [valor, setValor] = useState(saldo)
  const [observacion, setObservacion] = useState("")
  const [guardando, setGuardando] = useState(false)

  const guardar = async () => {
    setGuardando(true)
    const r = await registrarPago(prefacturaId, { fecha, valor: Number(valor) || 0, observacion: observacion.trim() || undefined, usuario })
    setGuardando(false)
    if (r.success) {
      toast({ title: "Pago registrado" })
      onOk()
    } else toast({ title: "No se pudo", description: r.message, variant: "destructive" })
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
          <DialogDescription>Saldo pendiente: {money(saldo)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Fecha</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Valor</Label>
            <Input type="number" value={valor} onChange={(e) => setValor(Number(e.target.value))} />
          </div>
          <div>
            <Label className="text-xs">Observación (opcional)</Label>
            <Textarea value={observacion} onChange={(e) => setObservacion(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={guardar} disabled={guardando}>
            {guardando && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FrecuenciaEnvioAnexoPanel() {
  const { toast } = useToast()
  const [abierto, setAbierto] = useState(false)
  const [condiciones, setCondiciones] = useState<CondicionEnvioAnexo[]>([])
  const [guardando, setGuardando] = useState<number | null>(null)

  const cargar = async () => {
    const r = await getCondicionesEnvioAnexo()
    if (r.success) setCondiciones(r.data)
  }
  useEffect(() => {
    if (abierto) cargar()
  }, [abierto])

  const actualizarLocal = (idempresa: number, patch: Partial<CondicionEnvioAnexo>) => {
    setCondiciones((prev) => prev.map((c) => (c.idempresa === idempresa ? { ...c, ...patch } : c)))
  }

  const guardar = async (c: CondicionEnvioAnexo) => {
    setGuardando(c.idempresa)
    const r = await actualizarCondicionEnvioAnexo(c.idempresa, c.frecuencia, c.dia_semana)
    setGuardando(null)
    if (r.success) toast({ title: "Guardado" })
    else toast({ title: "Error", description: r.message, variant: "destructive" })
  }

  return (
    <Card>
      <CardHeader className="cursor-pointer pb-2" onClick={() => setAbierto((v) => !v)}>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4" /> Frecuencia de envío de anexos por Proyecto
        </CardTitle>
        <CardDescription className="text-xs">
          Cada proyecto puede tener su propio ritmo de facturación -- el cron corre a diario, pero solo envía el anexo de un proyecto cuando le toca según esta configuración.
        </CardDescription>
      </CardHeader>
      {abierto && (
        <CardContent className="space-y-2">
          {condiciones.map((c) => (
            <div key={c.idempresa} className="flex flex-wrap items-center gap-2">
              <span className="w-40 text-xs">{c.proyecto}</span>
              <Select value={c.frecuencia} onValueChange={(v) => actualizarLocal(c.idempresa, { frecuencia: v as "diario" | "semanal", dia_semana: v === "semanal" ? (c.dia_semana ?? 1) : c.dia_semana })}>
                <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="semanal">Semanal</SelectItem>
                  <SelectItem value="diario">Diario</SelectItem>
                </SelectContent>
              </Select>
              {c.frecuencia === "semanal" && (
                <Select value={String(c.dia_semana ?? 1)} onValueChange={(v) => actualizarLocal(c.idempresa, { dia_semana: Number(v) })}>
                  <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DIAS_SEMANA_LABEL.map((label, i) => (
                      <SelectItem key={i} value={String(i)}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => guardar(c)} disabled={guardando === c.idempresa}>
                {guardando === c.idempresa && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                Guardar
              </Button>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  )
}

function CondicionesPagoPanel() {
  const { toast } = useToast()
  const [abierto, setAbierto] = useState(false)
  const [condiciones, setCondiciones] = useState<{ owner: string; dias_plazo: number }[]>([])
  const [editando, setEditando] = useState<Record<string, number>>({})

  const cargar = async () => {
    const r = await getCondicionesPagoOwner()
    if (r.success) setCondiciones(r.data)
  }
  useEffect(() => {
    if (abierto) cargar()
  }, [abierto])

  const guardar = async (owner: string) => {
    const dias = editando[owner]
    if (!(dias > 0)) return
    const r = await actualizarCondicionPagoOwner(owner, dias)
    if (r.success) {
      toast({ title: "Guardado" })
      cargar()
    } else toast({ title: "Error", description: r.message, variant: "destructive" })
  }

  return (
    <Card>
      <CardHeader className="cursor-pointer pb-2" onClick={() => setAbierto((v) => !v)}>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Settings2 className="h-4 w-4" /> Condición de pago por Owner
        </CardTitle>
      </CardHeader>
      {abierto && (
        <CardContent className="space-y-2">
          {condiciones.length === 0 && <p className="text-xs text-muted-foreground">Todavía no hay owners con condición de pago propia -- se crean automáticamente al cerrar la primera factura de cada uno (default 30 días).</p>}
          {condiciones.map((c) => (
            <div key={c.owner} className="flex items-center gap-2">
              <span className="w-48 text-xs">{c.owner}</span>
              <Input
                type="number"
                className="h-7 w-24 text-xs"
                defaultValue={c.dias_plazo}
                onChange={(e) => setEditando((prev) => ({ ...prev, [c.owner]: Number(e.target.value) }))}
              />
              <span className="text-xs text-muted-foreground">días</span>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => guardar(c.owner)}>Guardar</Button>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  )
}
