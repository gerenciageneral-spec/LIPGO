"use client"

import { useEffect, useMemo, useState } from "react"
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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Empty } from "@/components/ui/empty"
import {
  Loader2,
  CheckCircle2,
  XCircle,
  FileText,
  FileDown,
  Search,
  TrendingUp,
  Users,
  DollarSign,
  RefreshCw,
  ExternalLink,
  ClipboardList,
  Link2,
  Copy,
  Check,
  FileType2,
  Receipt,
  Upload,
  Clock,
  Trash2,
} from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { useToast } from "@/hooks/use-toast"
import {
  getSolicitudesTrabajadores,
  aprobarSolicitud,
  rechazarSolicitud,
  eliminarSolicitud,
  generarCertificadoLaboralWord,
  subirEvidenciaAnticipo,
  gestionarAprobacionPermiso,
  type SolicitudTrabajador,
} from "@/lib/gestion-solicitudes-actions"

/**
 * Dashboard administrativo de Gestion de Solicitudes.
 *
 * Consume la tabla `solicitudes_trabajadores` JOIN `headcount`:
 *  - KPIs de anticipos del mes + tasa de aprobacion + top solicitantes.
 *  - Tabla con filtros por estado, tipo y empleado.
 *  - Acciones por fila: aprobar/rechazar (anticipo/permiso), subir PDF (certificado).
 */
export default function GestionSolicitudes() {
  const { selectedEmpresaId } = useAuth()
  const { toast } = useToast()

  const [solicitudes, setSolicitudes] = useState<SolicitudTrabajador[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Filtros
  const [filtroEstado, setFiltroEstado] = useState<string>("all")
  const [filtroTipo, setFiltroTipo] = useState<string>("all")
  const [filtroEmpleado, setFiltroEmpleado] = useState<string>("")

  // Dialog rechazar
  const [rechazoDialog, setRechazoDialog] = useState<{ open: boolean; solicitud: SolicitudTrabajador | null }>({
    open: false,
    solicitud: null,
  })
  const [motivoRechazo, setMotivoRechazo] = useState("")
  // Rol que rechaza un permiso (GH o Coord). Solo aplica cuando la solicitud
  // a rechazar es de tipo 'permiso'. Para anticipos se ignora.
  const [rolRechazoPermiso, setRolRechazoPermiso] = useState<"GH" | "Coord">("GH")

  // Generacion de Certificado Laboral en Word: id de la solicitud que se esta
  // procesando. null = no hay generacion en curso. Se usa para deshabilitar el
  // boton y mostrar el spinner solo en la fila correspondiente.
  const [generatingId, setGeneratingId] = useState<string | null>(null)

  // Dialog para subir evidencia de pago + firma a un anticipo aprobado o
  // completado. Solo se abre desde la accion de fila correspondiente.
  const [evidenciaDialog, setEvidenciaDialog] = useState<{
    open: boolean
    solicitud: SolicitudTrabajador | null
  }>({ open: false, solicitud: null })

  // Dialog de confirmacion para eliminar fisicamente una solicitud.
  // Lo manejamos aparte del rechazo porque eliminar es destructivo
  // (borra la fila de `solicitudes_trabajadores`) y no debe
  // dispararse sin un paso explicito de confirmacion.
  const [eliminarDialog, setEliminarDialog] = useState<{
    open: boolean
    solicitud: SolicitudTrabajador | null
  }>({ open: false, solicitud: null })
  const [eliminando, setEliminando] = useState(false)

  const loadSolicitudes = async () => {
    setRefreshing(true)
    // Gestion de Solicitudes muestra TODAS las solicitudes (sin filtro de empresa)
    const result = await getSolicitudesTrabajadores()
    if (!result.success) {
      toast({
        title: "Error al cargar solicitudes",
        description: result.error || "Intente nuevamente",
        variant: "destructive",
      })
    }
    setSolicitudes(result.data)
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => {
    loadSolicitudes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // KPIs calculados en cliente sobre el dataset global de solicitudes
  const kpis = useMemo(() => {
    const now = new Date()
    const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1)
    const anticiposMes = solicitudes.filter(
      (s) => s.tipo === "anticipo" && new Date(s.created_at) >= inicioMes,
    )
    const montoAnticiposMes = anticiposMes.reduce((sum, s) => sum + (Number(s.monto) || 0), 0)

    const decididas = solicitudes.filter((s) => s.estado !== "pendiente")
    const aprobadas = decididas.filter((s) => s.estado === "aprobada" || s.estado === "completada")
    const rechazadas = decididas.filter((s) => s.estado === "rechazada")
    const tasaAprobacion =
      decididas.length > 0 ? Math.round((aprobadas.length / decididas.length) * 100) : 0

    const porColaborador = new Map<number, { nombre: string; total: number }>()
    for (const s of solicitudes) {
      const existing = porColaborador.get(s.colaborador_id)
      if (existing) existing.total += 1
      else porColaborador.set(s.colaborador_id, { nombre: s.colaborador_nombre, total: 1 })
    }
    const topSolicitantes = Array.from(porColaborador.entries())
      .map(([id, v]) => ({ colaborador_id: id, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 3)

    return {
      totalAnticiposMes: anticiposMes.length,
      montoAnticiposMes,
      tasaAprobacion,
      totalAprobadas: aprobadas.length,
      totalRechazadas: rechazadas.length,
      topSolicitantes,
    }
  }, [solicitudes])

  // Tabla filtrada
  const filtradas = useMemo(() => {
    return solicitudes.filter((s) => {
      if (filtroEstado !== "all" && s.estado !== filtroEstado) return false
      if (filtroTipo !== "all" && s.tipo !== filtroTipo) return false
      if (
        filtroEmpleado.trim() !== "" &&
        !s.colaborador_nombre.toLowerCase().includes(filtroEmpleado.trim().toLowerCase())
      )
        return false
      return true
    })
  }, [solicitudes, filtroEstado, filtroTipo, filtroEmpleado])

  // Handlers
  const handleAprobar = async (s: SolicitudTrabajador) => {
    const result = await aprobarSolicitud(s.id)
    if (!result.success) {
      toast({ title: "No se pudo aprobar", description: result.error, variant: "destructive" })
      return
    }
    toast({
      title: "Solicitud aprobada",
      description:
        s.tipo === "anticipo"
          ? "El empleado podra firmar el documento en su portal."
          : "La solicitud fue aprobada correctamente.",
    })
    loadSolicitudes()
  }

  /**
   * Aprueba un PERMISO desde uno de los dos roles validadores (GH / Coord).
   * El estado global solo pasa a 'aprobada' cuando ambos roles aprobaron.
   */
  const handleAprobarPermiso = async (
    s: SolicitudTrabajador,
    rol: "GH" | "Coord",
  ) => {
    const result = await gestionarAprobacionPermiso(s.id, rol, "aprobar")
    if (!result.success) {
      toast({
        title: `No se pudo aprobar como ${rol}`,
        description: result.error,
        variant: "destructive",
      })
      return
    }
    toast({
      title:
        result.nuevoEstadoGlobal === "aprobada"
          ? "Permiso aprobado por GH y Coordinacion"
          : `Aprobacion de ${rol} registrada`,
      description:
        result.nuevoEstadoGlobal === "aprobada"
          ? "Ambos roles aprobaron. El estado global paso a aprobada."
          : "Falta la aprobacion del otro rol para finalizar.",
    })
    loadSolicitudes()
  }

  const handleConfirmarRechazo = async () => {
    if (!rechazoDialog.solicitud) return
    if (!motivoRechazo.trim()) {
      toast({ title: "Motivo obligatorio", variant: "destructive" })
      return
    }

    const solicitud = rechazoDialog.solicitud

    // Para permisos enrutamos por gestionarAprobacionPermiso para que el
    // rechazo quede asociado al rol (GH/Coord) que lo emitio. Para anticipos
    // mantenemos el flujo clasico de rechazarSolicitud.
    const result =
      solicitud.tipo === "permiso"
        ? await gestionarAprobacionPermiso(
            solicitud.id,
            rolRechazoPermiso,
            "rechazar",
            motivoRechazo.trim(),
          )
        : await rechazarSolicitud(solicitud.id, motivoRechazo.trim())

    if (!result.success) {
      toast({ title: "No se pudo rechazar", description: result.error, variant: "destructive" })
      return
    }
    toast({ title: "Solicitud rechazada", description: "El empleado sera notificado." })
    setRechazoDialog({ open: false, solicitud: null })
    setMotivoRechazo("")
    setRolRechazoPermiso("GH")
    loadSolicitudes()
  }

  /**
   * Confirma y ejecuta la eliminacion fisica de una solicitud. Una vez
   * borrada no se puede recuperar — por eso solo se dispara desde el
   * dialog de confirmacion (`eliminarDialog`). Tras un borrado exitoso
   * recargamos el listado para que la fila desaparezca.
   */
  const handleConfirmarEliminar = async () => {
    const solicitud = eliminarDialog.solicitud
    if (!solicitud) return
    setEliminando(true)
    try {
      const result = await eliminarSolicitud(solicitud.id)
      if (!result.success) {
        toast({
          title: "No se pudo eliminar",
          description: result.error,
          variant: "destructive",
        })
        return
      }
      toast({
        title: "Solicitud eliminada",
        description: "La solicitud se borro correctamente.",
      })
      setEliminarDialog({ open: false, solicitud: null })
      loadSolicitudes()
    } finally {
      setEliminando(false)
    }
  }

  /**
   * Genera el Certificado Laboral en formato Word (.docx).
   *
   * Flujo:
   *  1. Llama al server action que descarga la plantilla desde Storage,
   *     llena los placeholders con docxtemplater y devuelve el archivo en
   *     base64 (ademas lo sube al bucket `certificados` y marca la solicitud
   *     como `completada`).
   *  2. Decodifica el base64 a Blob en el cliente.
   *  3. Dispara la descarga automatica con el nombre `Certificado_<Empleado>.docx`.
   *  4. Refresca la tabla para que la fila pase a "Completada" y muestre el
   *     boton de "Ver documento".
   */
  const handleGenerarCertificado = async (s: SolicitudTrabajador) => {
    console.log("[v0] handleGenerarCertificado start id:", s.id, "estado:", s.estado)
    setGeneratingId(s.id)
    try {
      console.log("[v0] llamando server action generarCertificadoLaboralWord...")
      const result = await generarCertificadoLaboralWord(s.id)
      console.log("[v0] resultado action success:", result.success, "error:", result.error, "hasBase64:", !!result.base64)
      if (!result.success || !result.base64 || !result.fileName) {
        throw new Error(result.error || "No se pudo generar el documento")
      }

      // Decodificar base64 -> Uint8Array -> Blob para disparar download.
      // El backend ahora genera el certificado como PDF nativo con
      // pdf-lib (mismo patron que la Autorizacion de Descuentos), por
      // eso usamos el MIME type application/pdf.
      const binary = atob(result.base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }
      const blob = new Blob([bytes], { type: "application/pdf" })

      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = result.fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast({
        title: "Certificado generado",
        description: `Se descargo ${result.fileName} y la solicitud quedo completada.`,
      })
      loadSolicitudes()
    } catch (err: any) {
      console.log("[v0] handleGenerarCertificado error:", err?.message, err)
      toast({
        title: "Error al generar certificado",
        description: err?.message || "Intente nuevamente",
        variant: "destructive",
      })
    } finally {
      setGeneratingId(null)
    }
  }

  return (
    <div className="w-full max-w-full space-y-4">
      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Gestion de Solicitudes</h2>
          <p className="text-sm text-muted-foreground">
            Administra anticipos, permisos y certificados solicitados por los empleados.
          </p>
        </div>
        <Button variant="outline" onClick={loadSolicitudes} disabled={refreshing}>
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="ml-2">Actualizar</span>
        </Button>
      </div>

      {/* Banner con el link publico del Portal del Trabajador */}
      <PortalLinkBanner />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Total Anticipos del Mes</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.totalAnticiposMes}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Monto total:{" "}
              <span className="font-semibold text-foreground">
                {formatCurrency(kpis.montoAnticiposMes)}
              </span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Tasa de Aprobacion</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.tasaAprobacion}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-green-600 font-medium">{kpis.totalAprobadas} aprobadas</span>
              {" / "}
              <span className="text-red-600 font-medium">{kpis.totalRechazadas} rechazadas</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Top Solicitantes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {kpis.topSolicitantes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin solicitudes</p>
            ) : (
              <ol className="space-y-1 text-sm">
                {kpis.topSolicitantes.map((t, idx) => (
                  <li key={t.colaborador_id} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 truncate">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {idx + 1}
                      </span>
                      <span className="truncate font-medium">{t.nombre}</span>
                    </span>
                    <Badge variant="secondary" className="shrink-0 ml-2">
                      {t.total}
                    </Badge>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabla + Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Solicitudes
          </CardTitle>
          <CardDescription>
            {filtradas.length} solicitud{filtradas.length !== 1 ? "es" : ""} visible
            {filtradas.length !== 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Estado</Label>
              <Select value={filtroEstado} onValueChange={setFiltroEstado}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                  <SelectItem value="aprobada">Aprobada</SelectItem>
                  <SelectItem value="rechazada">Rechazada</SelectItem>
                  <SelectItem value="completada">Completada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Todos los tipos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los tipos</SelectItem>
                  <SelectItem value="certificado">Certificado</SelectItem>
                  <SelectItem value="anticipo">Anticipo</SelectItem>
                  <SelectItem value="permiso">Permiso</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Empleado</Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Nombre del empleado"
                  value={filtroEmpleado}
                  onChange={(e) => setFiltroEmpleado(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empleado</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Fecha Solicitud</TableHead>
                  <TableHead>Detalle</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : filtradas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10">
                      <Empty className="border-0">
                        <ClipboardList className="h-8 w-8 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground mt-2">
                          No hay solicitudes que coincidan con los filtros.
                        </p>
                      </Empty>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtradas.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="font-medium">{s.colaborador_nombre}</div>
                        <div className="text-xs text-muted-foreground">
                          {s.colaborador_cargo || "-"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <TipoBadge tipo={s.tipo} />
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {formatDate(s.created_at)}
                      </TableCell>
                      <TableCell className="text-sm max-w-xs">
                        <DetalleSolicitud s={s} />
                      </TableCell>
                      <TableCell>
                        <EstadoBadge estado={s.estado} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-2 justify-end flex-wrap">
                          <RowActions
                            solicitud={s}
                            onAprobar={() => handleAprobar(s)}
                            onRechazar={() =>
                              setRechazoDialog({ open: true, solicitud: s })
                            }
                            onAprobarPermiso={(rol) =>
                              handleAprobarPermiso(s, rol)
                            }
                            onGenerarCertificado={() => handleGenerarCertificado(s)}
                            onSubirEvidencia={() =>
                              setEvidenciaDialog({ open: true, solicitud: s })
                            }
                            generating={generatingId === s.id}
                          />
                          {/* Eliminar solicitud: disponible para CUALQUIER
                              fila independientemente del tipo o estado.
                              Lo dejamos como icon-button discreto al
                              lado de las acciones especificas para que
                              no compita visualmente con Aprobar/Rechazar
                              pero quede siempre accesible.
                              Abre un dialog de confirmacion antes de
                              ejecutar el borrado fisico. */}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            title="Eliminar solicitud"
                            onClick={() =>
                              setEliminarDialog({ open: true, solicitud: s })
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Eliminar solicitud</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Dialog: Rechazar */}
      <Dialog
        open={rechazoDialog.open}
        onOpenChange={(o) => {
          if (!o) {
            setRechazoDialog({ open: false, solicitud: null })
            setMotivoRechazo("")
            setRolRechazoPermiso("GH")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar solicitud</DialogTitle>
            <DialogDescription>
              Escribe el motivo del rechazo. El empleado podra verlo en su portal.
            </DialogDescription>
          </DialogHeader>
          {rechazoDialog.solicitud && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div>
                <span className="font-medium">Empleado:</span>{" "}
                {rechazoDialog.solicitud.colaborador_nombre}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-medium">Tipo:</span>
                <TipoBadge tipo={rechazoDialog.solicitud.tipo} />
              </div>
            </div>
          )}
          {/* Selector de rol que rechaza: solo aplica para permisos */}
          {rechazoDialog.solicitud?.tipo === "permiso" && (
            <div className="space-y-2">
              <Label htmlFor="rol-rechazo">Rechazar como</Label>
              <Select
                value={rolRechazoPermiso}
                onValueChange={(v) => setRolRechazoPermiso(v as "GH" | "Coord")}
              >
                <SelectTrigger id="rol-rechazo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GH">GH (Gestion Humana)</SelectItem>
                  <SelectItem value="Coord">Coord (Coordinacion)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                El rechazo quedara asociado al rol seleccionado y la solicitud
                pasara a estado <span className="font-medium">rechazada</span>.
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="motivo">Motivo de rechazo *</Label>
            <Textarea
              id="motivo"
              value={motivoRechazo}
              onChange={(e) => setMotivoRechazo(e.target.value)}
              placeholder="Describe brevemente la razon..."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRechazoDialog({ open: false, solicitud: null })
                setMotivoRechazo("")
                setRolRechazoPermiso("GH")
              }}
            >
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleConfirmarRechazo}>
              <XCircle className="h-4 w-4 mr-2" />
              Confirmar rechazo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Subir Evidencia de Pago y Firma */}
      <EvidenciaPagoDialog
        open={evidenciaDialog.open}
        solicitud={evidenciaDialog.solicitud}
        onOpenChange={(open) =>
          setEvidenciaDialog({
            open,
            solicitud: open ? evidenciaDialog.solicitud : null,
          })
        }
        onUploaded={async () => {
          setEvidenciaDialog({ open: false, solicitud: null })
          await loadSolicitudes()
        }}
      />

      {/* Dialog: Confirmar eliminacion de solicitud */}
      <Dialog
        open={eliminarDialog.open}
        onOpenChange={(o) => {
          if (!o && !eliminando) {
            setEliminarDialog({ open: false, solicitud: null })
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar solicitud</DialogTitle>
            <DialogDescription>
              Esta accion borrara la solicitud de forma permanente. No se podra
              recuperar y dejara de aparecer tanto aqui como en el portal del
              trabajador.
            </DialogDescription>
          </DialogHeader>
          {eliminarDialog.solicitud && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
              <div>
                <span className="font-medium">Empleado:</span>{" "}
                {eliminarDialog.solicitud.colaborador_nombre}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">Tipo:</span>
                <TipoBadge tipo={eliminarDialog.solicitud.tipo} />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">Estado:</span>
                <EstadoBadge estado={eliminarDialog.solicitud.estado} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={eliminando}
              onClick={() => setEliminarDialog({ open: false, solicitud: null })}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={eliminando}
              onClick={handleConfirmarEliminar}
            >
              {eliminando ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Eliminando...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" /> Eliminar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* -----------------------------  Sub-componentes  ----------------------------- */

function TipoBadge({ tipo }: { tipo: SolicitudTrabajador["tipo"] }) {
  const variantMap: Record<string, { label: string; className: string }> = {
    certificado: {
      label: "Certificado",
      className: "bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200",
    },
    anticipo: {
      label: "Anticipo",
      className: "bg-green-100 text-green-700 hover:bg-green-100 border-green-200",
    },
    permiso: {
      label: "Permiso",
      className: "bg-yellow-100 text-yellow-700 hover:bg-yellow-100 border-yellow-200",
    },
  }
  const cfg = variantMap[tipo] || { label: tipo, className: "" }
  return (
    <Badge variant="outline" className={cfg.className}>
      {cfg.label}
    </Badge>
  )
}

function EstadoBadge({ estado }: { estado: SolicitudTrabajador["estado"] }) {
  const variantMap: Record<string, { label: string; className: string }> = {
    pendiente: {
      label: "Pendiente",
      className: "bg-amber-100 text-amber-700 border-amber-200",
    },
    aprobada: {
      label: "Aprobada",
      className: "bg-emerald-100 text-emerald-700 border-emerald-200",
    },
    rechazada: {
      label: "Rechazada",
      className: "bg-red-100 text-red-700 border-red-200",
    },
    completada: {
      label: "Completada",
      className: "bg-slate-200 text-slate-700 border-slate-300",
    },
  }
  const cfg = variantMap[estado] || { label: estado, className: "" }
  return (
    <Badge variant="outline" className={cfg.className}>
      {cfg.label}
    </Badge>
  )
}

function DetalleSolicitud({ s }: { s: SolicitudTrabajador }) {
  if (s.tipo === "anticipo" && s.monto != null) {
    return <span className="font-medium">{formatCurrency(Number(s.monto))}</span>
  }
  if (s.tipo === "permiso") {
    const rango =
      s.fecha_inicio_permiso && s.fecha_fin_permiso
        ? `${formatDateShort(s.fecha_inicio_permiso)} - ${formatDateShort(s.fecha_fin_permiso)}`
        : s.fecha_inicio_permiso
          ? formatDateShort(s.fecha_inicio_permiso)
          : "-"
    return (
      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">{s.tipo_permiso || "Permiso"}</div>
        <div className="text-sm">{rango}</div>
        <PermisoAprobacionBadge
          gh={s.permiso_aprobacion_gh}
          coord={s.permiso_aprobacion_coord}
        />
      </div>
    )
  }
  if (s.tipo === "certificado") {
    return (
      <span className="text-xs text-muted-foreground">Certificado laboral oficial</span>
    )
  }
  return <span className="text-muted-foreground">-</span>
}

function RowActions({
  solicitud: s,
  onAprobar,
  onRechazar,
  onAprobarPermiso,
  onGenerarCertificado,
  onSubirEvidencia,
  generating,
}: {
  solicitud: SolicitudTrabajador
  onAprobar: () => void
  onRechazar: () => void
  onAprobarPermiso: (rol: "GH" | "Coord") => void
  onGenerarCertificado: () => void
  onSubirEvidencia: () => void
  generating: boolean
}) {
  // Anticipo pendiente: aprobar / rechazar
  if (s.tipo === "anticipo" && s.estado === "pendiente") {
    return (
      <div className="inline-flex gap-2 justify-end">
        <Button size="sm" onClick={onAprobar}>
          <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Aprobar
        </Button>
        <Button size="sm" variant="outline" onClick={onRechazar}>
          <XCircle className="h-3.5 w-3.5 mr-1" /> Rechazar
        </Button>
      </div>
    )
  }
  // Permiso: doble aprobacion (GH + Coord) + rechazo general.
  //   - Cada rol tiene su propio boton; queda deshabilitado con check verde
  //     cuando ya aprobo.
  //   - El boton de Rechazar (rojo) es general; el rol que rechaza se elige
  //     en el dialog de confirmacion.
  //   - Cuando la solicitud ya esta resuelta (aprobada/rechazada/completada)
  //     solo se muestra el soporte si existe.
  if (s.tipo === "permiso") {
    const ghAprobado = s.permiso_aprobacion_gh === "aprobado"
    const coordAprobado = s.permiso_aprobacion_coord === "aprobado"
    const yaResuelta =
      s.estado === "aprobada" ||
      s.estado === "rechazada" ||
      s.estado === "completada"

    return (
      <div className="inline-flex gap-2 justify-end flex-wrap items-center">
        {s.soporte_url && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.open(s.soporte_url!, "_blank")}
          >
            <FileText className="h-3.5 w-3.5 mr-1" /> Soporte
          </Button>
        )}
        {!yaResuelta && (
          <>
            <Button
              size="sm"
              variant={ghAprobado ? "outline" : "default"}
              disabled={ghAprobado}
              onClick={() => onAprobarPermiso("GH")}
              className={
                ghAprobado
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
                  : ""
              }
              title={ghAprobado ? "GH ya aprobo este permiso" : "Aprobar como GH"}
            >
              {ghAprobado ? (
                <Check className="h-3.5 w-3.5 mr-1 text-emerald-600" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              )}
              Aprobar GH
            </Button>
            <Button
              size="sm"
              variant={coordAprobado ? "outline" : "default"}
              disabled={coordAprobado}
              onClick={() => onAprobarPermiso("Coord")}
              className={
                coordAprobado
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
                  : ""
              }
              title={
                coordAprobado
                  ? "Coordinacion ya aprobo este permiso"
                  : "Aprobar como Coordinacion"
              }
            >
              {coordAprobado ? (
                <Check className="h-3.5 w-3.5 mr-1 text-emerald-600" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              )}
              Aprobar Coord
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={onRechazar}
              title="Rechazar la solicitud"
            >
              <XCircle className="h-3.5 w-3.5 mr-1" /> Rechazar
            </Button>
          </>
        )}
      </div>
    )
  }
  // Certificado: si ya esta completado se descarga el .docx existente; si esta
  // pendiente, se genera el Word automaticamente desde la plantilla.
  if (s.tipo === "certificado") {
    if (s.estado === "completada" && s.url_documento_final) {
      return (
        <Button
          size="sm"
          variant="outline"
          onClick={() => window.open(s.url_documento_final!, "_blank")}
        >
          <FileDown className="h-3.5 w-3.5 mr-1" /> Ver documento
        </Button>
      )
    }
    return (
      <Button size="sm" onClick={onGenerarCertificado} disabled={generating}>
        {generating ? (
          <>
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Procesando...
          </>
        ) : (
          <>
            <FileType2 className="h-3.5 w-3.5 mr-1" /> Generar Documento
          </>
        )}
      </Button>
    )
  }
  // Anticipo aprobado o completado: gestion de evidencia de pago + firma del
  // trabajador. Se muestran hasta 3 botones segun el estado:
  //   - "Evidencia" (admin): siempre disponible para subir/reemplazar el
  //     comprobante de pago.
  //   - "Ver evidencia": si ya hay archivo en url_soporte.
  //   - "Ver firma":     si el trabajador subio su firma (url_documento_final).
  if (
    s.tipo === "anticipo" &&
    (s.estado === "aprobada" || s.estado === "completada")
  ) {
    return (
      <div className="inline-flex gap-2 justify-end flex-wrap">
        {s.soporte_url && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.open(s.soporte_url!, "_blank")}
            title="Ver evidencia de pago y firma"
          >
            <Receipt className="h-3.5 w-3.5 mr-1" /> Evidencia
          </Button>
        )}
        {s.url_documento_final && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.open(s.url_documento_final!, "_blank")}
            title="Ver firma del trabajador"
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1" /> Firma
          </Button>
        )}
        <Button size="sm" onClick={onSubirEvidencia}>
          <Upload className="h-3.5 w-3.5 mr-1" />{" "}
          {s.soporte_url ? "Reemplazar" : "Subir evidencia"}
        </Button>
      </div>
    )
  }
  return null
}

/* -----------------------------  Portal Link Banner  ----------------------------- */

/**
 * Banner superior que muestra el link publico del Portal del Trabajador para
 * que RRHH lo copie y comparta con los empleados. La URL se construye al
 * montar el componente leyendo `window.location.origin` y apuntando a
 * `/portal/login`. Incluye un boton para copiar al portapapeles (con feedback
 * visual por 2 segundos) y otro para abrir el portal en pestaña nueva.
 */
function PortalLinkBanner() {
  const [portalUrl, setPortalUrl] = useState<string>("")
  const [copied, setCopied] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    // Solo en cliente: origin no existe en server
    if (typeof window !== "undefined") {
      setPortalUrl(`${window.location.origin}/portal/login`)
    }
  }, [])

  const handleCopy = async () => {
    if (!portalUrl) return
    try {
      await navigator.clipboard.writeText(portalUrl)
      setCopied(true)
      toast({
        title: "Link copiado",
        description: "El link del portal fue copiado al portapapeles.",
      })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast({
        title: "No se pudo copiar",
        description: "Copia el link manualmente desde el campo.",
        variant: "destructive",
      })
    }
  }

  const handleOpen = () => {
    if (!portalUrl) return
    window.open(portalUrl, "_blank", "noopener,noreferrer")
  }

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="p-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="rounded-lg bg-primary/10 p-2 shrink-0">
              <Link2 className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Link publico del Portal del Trabajador</p>
              <p className="text-xs text-muted-foreground">
                Comparte este enlace con tus empleados para que puedan solicitar certificados,
                anticipos, permisos y consultar su nomina.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full lg:w-auto lg:min-w-[420px]">
            <div className="relative flex-1">
              <Input
                readOnly
                value={portalUrl || "Cargando..."}
                className="pr-2 font-mono text-xs bg-background"
                onFocus={(e) => e.currentTarget.select()}
                aria-label="URL publica del Portal del Trabajador"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              disabled={!portalUrl}
              className="shrink-0"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-1.5" />
                  Copiado
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-1.5" />
                  Copiar
                </>
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleOpen}
              disabled={!portalUrl}
              className="shrink-0"
            >
              <ExternalLink className="h-4 w-4 mr-1.5" />
              Abrir
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/* -----------------------------  Evidencia de Pago  ----------------------------- */

/**
 * Dialog para que RRHH genere la AUTORIZACION DE DESCUENTO de un anticipo.
 *
 * Reemplaza el flujo anterior donde se subia un archivo manualmente: ahora
 * el sistema arma un PDF con los datos de la solicitud (empleado, monto,
 * cuotas) y embebe la firma que el trabajador cargo previamente desde el
 * portal (bucket `firmas`). El unico input requerido aqui es el numero
 * de cuotas quincenales del descuento, que se ingresa al momento de
 * generar el documento. La server action `subirEvidenciaAnticipo` es la
 * que arma el PDF, lo sube al bucket `anticipos/<anio>/<mes>/...` y
 * persiste la URL publica en `url_soporte`.
 */
function EvidenciaPagoDialog({
  open,
  solicitud,
  onOpenChange,
  onUploaded,
}: {
  open: boolean
  solicitud: SolicitudTrabajador | null
  onOpenChange: (open: boolean) => void
  onUploaded: () => void | Promise<void>
}) {
  const { toast } = useToast()
  // Cuotas como string para que el input controlado se comporte bien
  // mientras el usuario tipea (evita "NaN" intermedios). Se convierte
  // a numero solo en el submit.
  const [cuotas, setCuotas] = useState<string>("1")
  const [submitting, setSubmitting] = useState(false)

  // Reset al cerrar
  useEffect(() => {
    if (!open) setCuotas("1")
  }, [open])

  const submit = async () => {
    if (!solicitud) return
    const cuotasNum = Number.parseInt(cuotas, 10)
    if (!Number.isFinite(cuotasNum) || cuotasNum < 1) {
      toast({
        title: "Cuotas invalidas",
        description: "Ingresa un numero de cuotas mayor o igual a 1.",
        variant: "destructive",
      })
      return
    }
    if (cuotasNum > 24) {
      toast({
        title: "Cuotas demasiado altas",
        description: "El maximo permitido es 24 cuotas.",
        variant: "destructive",
      })
      return
    }

    setSubmitting(true)
    try {
      const result = await subirEvidenciaAnticipo(solicitud.id, cuotasNum)
      if (!result.success) {
        throw new Error(result.error || "No se pudo generar el documento")
      }
      toast({
        title: "Documento generado",
        description:
          "La autorizacion de descuento fue creada y guardada correctamente.",
      })
      // Cerramos el dialog primero para feedback inmediato. Luego
      // refrescamos la tabla; si el refresh falla, no enmascaramos
      // el exito real con un toast de error.
      onOpenChange(false)
      try {
        await onUploaded()
      } catch (refreshErr) {
        console.log("[v0] onUploaded refresh error:", refreshErr)
      }
    } catch (err: any) {
      console.log("[v0] generarDocumento error:", err?.message)
      toast({
        title: "Error al generar documento",
        description: err?.message || "Intente nuevamente",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!submitting) onOpenChange(o)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-emerald-700" />
            Autorizacion de Descuento
          </DialogTitle>
          <DialogDescription>
            Genera el PDF de autorizacion con los datos del anticipo y la firma
            previamente cargada por el trabajador. Indica el numero de cuotas
            quincenales del descuento.
          </DialogDescription>
        </DialogHeader>

        {solicitud && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">Empleado:</span>
              <span className="truncate">{solicitud.colaborador_nombre}</span>
            </div>
            {solicitud.monto != null && (
              <div className="flex items-center gap-2">
                <span className="font-medium">Monto:</span>
                <span className="tabular-nums font-semibold">
                  {formatCurrency(Number(solicitud.monto))}
                </span>
              </div>
            )}
            {solicitud.soporte_url && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mt-2">
                Ya existe un documento generado. Continuar
                <span className="font-medium"> reemplazara </span>
                el anterior.
              </div>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="cuotas-input">Numero de cuotas quincenales</Label>
          <Input
            id="cuotas-input"
            type="number"
            min={1}
            max={24}
            step={1}
            inputMode="numeric"
            value={cuotas}
            disabled={submitting}
            onChange={(e) => setCuotas(e.target.value)}
            className="w-32 tabular-nums"
          />
          <p className="text-xs text-muted-foreground">
            Determina en cuantas quincenas se descontara el valor del anticipo.
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button onClick={submit} disabled={submitting || !cuotas}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generando...
              </>
            ) : (
              <>
                <FileType2 className="h-4 w-4 mr-2" /> Generar documento
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* -----------------------------  Permiso Aprobacion Badge  ----------------------------- */

/**
 * Badge compacto que muestra el progreso de la doble aprobacion de un permiso:
 *   GH: [icono] | Coord: [icono]
 *
 * - aprobado  -> CheckCircle2 verde
 * - rechazado -> XCircle rojo
 * - otro      -> Clock ambar (pendiente)
 */
function PermisoAprobacionBadge({
  gh,
  coord,
}: {
  gh: SolicitudTrabajador["permiso_aprobacion_gh"]
  coord: SolicitudTrabajador["permiso_aprobacion_coord"]
}) {
  const renderIcon = (estado: typeof gh) => {
    if (estado === "aprobado") {
      return <CheckCircle2 className="h-3 w-3 text-emerald-600" />
    }
    if (estado === "rechazado") {
      return <XCircle className="h-3 w-3 text-red-600" />
    }
    return <Clock className="h-3 w-3 text-amber-600" />
  }

  return (
    <Badge
      variant="outline"
      className="gap-1.5 px-2 py-0.5 text-[10px] font-medium border-slate-200 bg-slate-50 text-slate-700"
    >
      <span className="inline-flex items-center gap-1">
        GH: {renderIcon(gh)}
      </span>
      <span className="text-slate-300">|</span>
      <span className="inline-flex items-center gap-1">
        Coord: {renderIcon(coord)}
      </span>
    </Badge>
  )
}

/* -----------------------------  Helpers  ----------------------------- */

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
  }).format(value || 0)
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-CO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

/**
 * Formatea una FECHA DE CALENDARIO (sin hora): las de permiso
 * (`fecha_inicio_permiso` / `fecha_fin_permiso`), que llegan como "YYYY-MM-DD".
 *
 * EL BUG QUE CORRIGE — un día de menos: `new Date("2026-08-10")` NO es el 10 a
 * medianoche local. El estándar manda que la forma "solo fecha" se interprete
 * como UTC, así que en Colombia (UTC-5) ese instante es el 9 a las 19:00 y
 * `toLocaleDateString` mostraba "09 ago". El trabajador pedía el 10, veía el 10
 * en su portal —que sí construye la fecha en hora local— y la empresa veía el 9.
 *
 * Una fecha de calendario no tiene zona horaria: no es un instante. Por eso se
 * arma en UTC y se formatea en UTC, de modo que los dígitos que se muestran sean
 * exactamente los guardados, mire quien mire y desde donde mire.
 *
 * Si el valor SÍ trae hora (no debería en estos campos) se formatea como antes,
 * en la zona del navegador, que es lo correcto para un instante real.
 */
function formatDateShort(iso: string): string {
  try {
    const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? "").trim())
    if (soloFecha) {
      const fecha = new Date(
        Date.UTC(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3])),
      )
      return fecha.toLocaleDateString("es-CO", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    }
    return new Date(iso).toLocaleDateString("es-CO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  } catch {
    return iso
  }
}
