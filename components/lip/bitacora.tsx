"use client"

/**
 * Modulo "Bitácora" (Operación Lip).
 *
 * Pantalla sencilla con dos zonas:
 *   1. Captura: un Textarea amplio + boton "Guardar" para registrar la
 *      bitacora del dia. La fecha se asigna automatica en el servidor
 *      (zona Bogota) y el `idempresa` viene del contexto de sesion.
 *   2. Historial: tabla de registros previos de la empresa con
 *      opciones de Editar y Eliminar.
 *
 * El acceso al modulo va protegido por el permiso `bitacora` (ver
 * `lib/permissions-map.ts`). La proteccion se aplica desde
 * `main-content.tsx` con `<PermissionGuard moduleName="Bitácora">`.
 */

import { useCallback, useEffect, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { useToast } from "@/hooks/use-toast"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  FileBarChart2,
  History as HistoryIcon,
  Loader2,
  NotebookPen,
  Pencil,
  Printer,
  Save,
  Trash2,
} from "lucide-react"
import {
  createBitacora,
  deleteBitacora,
  getBitacoras,
  updateBitacora,
  type BitacoraRow,
} from "@/lib/bitacora-actions"
import {
  deleteCierreSnapshot,
  listCierreSnapshots,
  type CierreSnapshot,
} from "@/lib/cierre-historial-actions"
import CierreDiaDashboard from "@/components/lip/cierre-dia-dashboard"

/**
 * Formatea una fecha ISO (`YYYY-MM-DD`) como `DD/MM/YYYY`. Si la
 * cadena viene vacia o malformada, devuelve "-" para no romper la UI.
 */
function formatFecha(iso: string | null): string {
  if (!iso) return "-"
  const [y, m, d] = iso.split("-")
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

export default function Bitacora() {
  const { selectedEmpresaId } = useAuth()
  const { toast } = useToast()

  const [rows, setRows] = useState<BitacoraRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // Texto del area de captura nueva (panel principal).
  const [nuevoTexto, setNuevoTexto] = useState("")

  // Edicion: se abre un dialog que muestra el texto editable. `editId`
  // = null significa que el dialog esta cerrado.
  const [editId, setEditId] = useState<number | null>(null)
  const [editTexto, setEditTexto] = useState("")
  const [updating, setUpdating] = useState(false)

  // Borrado: se abre un AlertDialog con confirmacion explicita para
  // evitar perdidas accidentales. `deleteId` = null cierra el dialog.
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Historial de Cierres del Dia (snapshots HTML guardados en Vercel
  // Blob cada vez que el usuario imprime el cierre). Se cargan al
  // entrar a la pestaña "Historial" para no pegarle al blob en cada
  // visita a "Bitácora" / "Cierre del Día".
  const [cierres, setCierres] = useState<CierreSnapshot[]>([])
  const [loadingCierres, setLoadingCierres] = useState(false)
  const [deleteCierreFecha, setDeleteCierreFecha] = useState<string | null>(
    null,
  )
  const [deletingCierre, setDeletingCierre] = useState(false)
  const [activeTab, setActiveTab] = useState<string>("bitacora")

  const empresaId =
    typeof selectedEmpresaId === "number" ? selectedEmpresaId : Number(selectedEmpresaId)

  const fetchRows = useCallback(async () => {
    if (!empresaId) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    const res = await getBitacoras(empresaId)
    if (res.success && res.data) {
      setRows(res.data)
    } else {
      toast({
        title: "Error",
        description: res.error || "No se pudo cargar la bitácora",
        variant: "destructive",
      })
    }
    setLoading(false)
  }, [empresaId, toast])

  useEffect(() => {
    fetchRows()
  }, [fetchRows])

  // Cargar snapshots solo cuando el usuario entra a la pestaña
  // "Historial" (lazy) y cuando cambia la empresa.
  const fetchCierres = useCallback(async () => {
    if (!empresaId) {
      setCierres([])
      return
    }
    setLoadingCierres(true)
    const res = await listCierreSnapshots(empresaId)
    setLoadingCierres(false)
    if (res.success && res.data) {
      setCierres(res.data)
    } else {
      toast({
        title: "Error",
        description: res.error || "No se pudo cargar el historial",
        variant: "destructive",
      })
    }
  }, [empresaId, toast])

  useEffect(() => {
    if (activeTab === "historial") {
      fetchCierres()
    }
  }, [activeTab, fetchCierres])

  const handleDeleteCierre = async () => {
    if (!empresaId || !deleteCierreFecha) return
    setDeletingCierre(true)
    const res = await deleteCierreSnapshot(empresaId, deleteCierreFecha)
    setDeletingCierre(false)
    if (res.success) {
      toast({ title: "Eliminado", description: "Cierre eliminado del historial" })
      setDeleteCierreFecha(null)
      fetchCierres()
    } else {
      toast({
        title: "Error",
        description: res.error || "No se pudo eliminar",
        variant: "destructive",
      })
    }
  }

  // Guardar un nuevo registro desde el panel principal. Si el texto
  // queda vacio (o solo espacios) lo bloqueamos con un toast en vez
  // de mandar al servidor: ahorra round-trip y da feedback inmediato.
  const handleGuardar = async () => {
    if (!empresaId) {
      toast({
        title: "Error",
        description: "Empresa no seleccionada",
        variant: "destructive",
      })
      return
    }
    const texto = nuevoTexto.trim()
    if (!texto) {
      toast({
        title: "Bitácora vacía",
        description: "Escribe el contenido antes de guardar",
        variant: "destructive",
      })
      return
    }
    setSaving(true)
    const res = await createBitacora(empresaId, { bitacora: texto })
    setSaving(false)
    if (res.success) {
      toast({ title: "Guardado", description: "Bitácora registrada correctamente" })
      setNuevoTexto("")
      fetchRows()
    } else {
      toast({
        title: "Error",
        description: res.error || "No se pudo guardar la bitácora",
        variant: "destructive",
      })
    }
  }

  const openEdit = (row: BitacoraRow) => {
    setEditId(row.id)
    setEditTexto(row.bitacora ?? "")
  }

  const handleUpdate = async () => {
    if (!empresaId || editId == null) return
    const texto = editTexto.trim()
    if (!texto) {
      toast({
        title: "Bitácora vacía",
        description: "El contenido no puede quedar vacío",
        variant: "destructive",
      })
      return
    }
    setUpdating(true)
    const res = await updateBitacora(empresaId, editId, { bitacora: texto })
    setUpdating(false)
    if (res.success) {
      toast({ title: "Actualizado", description: "Bitácora actualizada" })
      setEditId(null)
      setEditTexto("")
      fetchRows()
    } else {
      toast({
        title: "Error",
        description: res.error || "No se pudo actualizar",
        variant: "destructive",
      })
    }
  }

  const handleDelete = async () => {
    if (!empresaId || deleteId == null) return
    setDeleting(true)
    const res = await deleteBitacora(empresaId, deleteId)
    setDeleting(false)
    if (res.success) {
      toast({ title: "Eliminada", description: "Bitácora eliminada" })
      setDeleteId(null)
      fetchRows()
    } else {
      toast({
        title: "Error",
        description: res.error || "No se pudo eliminar",
        variant: "destructive",
      })
    }
  }

  return (
    // El modulo ahora expone dos pestañas:
    //   - "bitacora": flujo original (captura + historial).
    //   - "cierre":   dashboard ejecutivo del dia con exportacion a PDF.
    //
    // El contenedor de Tabs se oculta automaticamente al imprimir el
    // dashboard (el @media print en globals.css oculta toda la UI
    // excepto #cierre-dia-print).
    <Tabs
      value={activeTab}
      onValueChange={setActiveTab}
      className="flex flex-col gap-4 p-4 md:p-6 print:p-0 print:gap-0"
    >
      <TabsList className="self-start no-print print:hidden">
        <TabsTrigger value="bitacora" className="gap-2">
          <NotebookPen className="h-4 w-4" />
          Bitácora
        </TabsTrigger>
        <TabsTrigger value="cierre" className="gap-2">
          <FileBarChart2 className="h-4 w-4" />
          Cierre del Día
        </TabsTrigger>
        <TabsTrigger value="historial" className="gap-2">
          <HistoryIcon className="h-4 w-4" />
          Historial
        </TabsTrigger>
      </TabsList>

      <TabsContent
        value="bitacora"
        className="flex flex-col gap-6 mt-0 print:hidden"
      >
      {/* Captura del dia. Diseño tipo "diario": titulo descriptivo,
          textarea amplio (8 filas) y un boton primario alineado a la
          derecha que se inhabilita mientras guarda. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <NotebookPen className="h-5 w-5" />
            Bitácora del día
          </CardTitle>
          <CardDescription>
            Registra novedades, incidencias o información relevante del día. La fecha se
            asigna automáticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Label htmlFor="bitacora-nueva" className="sr-only">
            Contenido de la bitácora
          </Label>
          <Textarea
            id="bitacora-nueva"
            placeholder="Escribe aquí la bitácora del día..."
            value={nuevoTexto}
            onChange={(e) => setNuevoTexto(e.target.value)}
            rows={8}
            className="resize-y min-h-[180px]"
          />
          <div className="flex items-center justify-end gap-2">
            <Button onClick={handleGuardar} disabled={saving || !nuevoTexto.trim()}>
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Guardar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Historial. Tabla simple con fecha, contenido (multilinea) y
          acciones. Para textos largos mantenemos `whitespace-pre-wrap`
          y `break-words` para preservar saltos de linea sin desbordar
          la celda. */}
      <Card>
        <CardHeader>
          <CardTitle>Historial</CardTitle>
          <CardDescription>Registros guardados de la empresa actual.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Cargando historial...
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay registros de bitácora todavía
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Fecha</TableHead>
                    <TableHead>Contenido</TableHead>
                    <TableHead className="w-[150px] text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="align-top font-medium">
                        {formatFecha(row.fecha)}
                      </TableCell>
                      <TableCell className="align-top whitespace-pre-wrap break-words">
                        {row.bitacora || "-"}
                      </TableCell>
                      <TableCell className="align-top text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(row)}
                          >
                            <Pencil className="h-4 w-4 mr-1" />
                            Editar
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteId(row.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Eliminar
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de edicion. Reutiliza el mismo Textarea para que la
          experiencia de escribir sea consistente con el panel de
          captura. */}
      <Dialog
        open={editId != null}
        onOpenChange={(open) => {
          if (!open) {
            setEditId(null)
            setEditTexto("")
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar bitácora</DialogTitle>
            <DialogDescription>
              Modifica el contenido y guarda los cambios.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={editTexto}
            onChange={(e) => setEditTexto(e.target.value)}
            rows={10}
            className="resize-y min-h-[220px]"
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditId(null)
                setEditTexto("")
              }}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={handleUpdate} disabled={updating}>
              {updating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog de confirmacion de borrado. Mensaje explicito para
          evitar borrados accidentales — no hay papelera ni undo. */}
      <AlertDialog
        open={deleteId != null}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta bitácora?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El registro se eliminará de forma permanente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Evitamos que el AlertDialog se cierre automaticamente
                // antes de terminar el delete; lo cerramos manual al
                // recibir la respuesta exitosa.
                e.preventDefault()
                handleDelete()
              }}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </TabsContent>

      {/* Dashboard ejecutivo del cierre del dia. Vive como componente
          aparte porque tiene su propia logica de carga de 3 fuentes y
          su zona imprimible (#cierre-dia-print) con CSS @media print. */}
      <TabsContent value="cierre" className="mt-0 -mx-4 md:-mx-6 print:mx-0">
        <CierreDiaDashboard />
      </TabsContent>

      {/* Historial de Cierres del Dia.
          Lista los snapshots HTML guardados (uno por dia) en Vercel
          Blob cada vez que el usuario imprime el cierre. Cada fila
          permite reabrir el snapshot tal como salio originalmente
          (boton "Ver / Imprimir") y, opcionalmente, eliminarlo.
          La lista se carga lazy al entrar a esta pestaña. */}
      <TabsContent value="historial" className="mt-0 print:hidden">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <HistoryIcon className="h-5 w-5" />
                Historial de Cierres del Día
              </CardTitle>
              <CardDescription>
                Cierres operativos guardados al generar el PDF. Abrelos
                para verlos o reimprimirlos.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={fetchCierres}
              disabled={loadingCierres}
            >
              {loadingCierres ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <HistoryIcon className="h-4 w-4 mr-1.5" />
              )}
              Actualizar
            </Button>
          </CardHeader>
          <CardContent>
            {loadingCierres ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                Cargando historial...
              </div>
            ) : cierres.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Aún no hay cierres guardados. Genera el PDF del Cierre
                del Día para que aparezca aquí.
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[140px]">Fecha</TableHead>
                      <TableHead>Generado</TableHead>
                      <TableHead className="w-[80px] text-right">
                        Tamaño
                      </TableHead>
                      <TableHead className="w-[260px] text-right">
                        Acciones
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cierres.map((c) => (
                      <TableRow key={c.fecha}>
                        <TableCell className="font-medium tabular-nums">
                          {formatFecha(c.fecha)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(c.uploadedAt).toLocaleString("es-CO", {
                            timeZone: "America/Bogota",
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                          {(c.size / 1024).toFixed(0)} KB
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                window.open(c.url, "_blank", "noopener")
                              }
                            >
                              <FileBarChart2 className="h-4 w-4 mr-1" />
                              Ver
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                // Abre el snapshot y dispara print()
                                // automatico una vez cargue. Pasamos un
                                // hash que el snapshot puede leer si lo
                                // necesitamos a futuro; por ahora, la
                                // accion la dispara el propio usuario.
                                const w = window.open(
                                  c.url,
                                  "_blank",
                                  "noopener",
                                )
                                if (w) {
                                  // Algunos navegadores bloquean print
                                  // remoto cross-origin; el usuario
                                  // puede usar Ctrl+P en la pestaña.
                                  setTimeout(() => {
                                    try {
                                      w.focus()
                                      w.print()
                                    } catch {
                                      /* noop */
                                    }
                                  }, 1500)
                                }
                              }}
                            >
                              <Printer className="h-4 w-4 mr-1" />
                              Imprimir
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteCierreFecha(c.fecha)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Eliminar</span>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <AlertDialog
          open={deleteCierreFecha != null}
          onOpenChange={(open) => {
            if (!open) setDeleteCierreFecha(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar este cierre?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción no se puede deshacer. El snapshot del{" "}
                {deleteCierreFecha ? formatFecha(deleteCierreFecha) : ""} se
                eliminará del historial.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deletingCierre}>
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault()
                  handleDeleteCierre()
                }}
                disabled={deletingCierre}
              >
                {deletingCierre ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TabsContent>
    </Tabs>
  )
}
