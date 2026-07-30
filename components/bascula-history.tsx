"use client"

import { useState, useEffect } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Loader2, Download, Pencil, Eye, EyeOff } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import * as XLSX from "xlsx"
import { getBasculaHistory, updateBasculaRecord } from "@/lib/bascula-actions"
import { useAuth } from "@/components/auth-provider"
import { useSubmoduloFiltro } from "@/components/submodulo-filtro-context"
import { BasculaOrderDetailsDialog } from "@/components/bascula-order-details-dialog"

const EDIT_PASSWORD = "Jeff123456"

interface BasculaHistoryRecord {
  id: number
  ordendecargue: string
  fechaorden: string
  fechacargue: string
  placa: string
  // Transporte asignado a la orden en cabeceraoc. Se puede editar
  // desde el modal "Editar Registro Báscula".
  transporte: string | null
  tiquetebascula: string
  pesoorden: number
  pesovascula: number
}

export function BasculaHistory() {
  const { selectedEmpresaId } = useAuth()
  // Publica el filtro de periodo (desde/hasta) a la tarjeta de KPIs de arriba
  // ("Indicadores — Recepción y Despacho"), para que las toneladas mostradas
  // sean las del MISMO periodo que se está filtrando en esta tabla.
  const { setFiltro: setKpiFiltro } = useSubmoduloFiltro()
  const [data, setData] = useState<BasculaHistoryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  // Filtros — desde/hasta filtra por RANGO sobre fechaorden (el mismo campo que
  // usa la tarjeta de toneladas de arriba, para que ambas coincidan).
  const [desdeFilter, setDesdeFilter] = useState("")
  const [hastaFilter, setHastaFilter] = useState("")
  const [placaFilter, setPlacaFilter] = useState("")
  const [ordenFilter, setOrdenFilter] = useState("")
  const [tiqueteFilter, setTiqueteFilter] = useState("")

  // Publicar el filtro de periodo a la tira de KPIs superior.
  useEffect(() => {
    setKpiFiltro({ anio: null, mes: null, desde: desdeFilter || null, hasta: hastaFilter || null })
  }, [desdeFilter, hastaFilter, setKpiFiltro])
  // Al salir del submódulo, limpiar el filtro para que otros módulos usen su
  // resumen por defecto.
  useEffect(() => () => setKpiFiltro({ anio: null, mes: null, desde: null, hasta: null }), [setKpiFiltro])

  // Details dialog state (productos + lotes por orden de cargue)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [selectedOrden, setSelectedOrden] = useState<string | null>(null)
  const [selectedPlaca, setSelectedPlaca] = useState<string | null>(null)

  const openDetails = (record: BasculaHistoryRecord) => {
    setSelectedOrden(record.ordendecargue || null)
    setSelectedPlaca(record.placa || null)
    setDetailsOpen(true)
  }

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editRecord, setEditRecord] = useState<BasculaHistoryRecord | null>(null)
  const [editStep, setEditStep] = useState<"password" | "edit">("password")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [newPeso, setNewPeso] = useState("")
  const [newTiquete, setNewTiquete] = useState("")
  const [newTransporte, setNewTransporte] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (selectedEmpresaId) {
      loadData()
    }
  }, [selectedEmpresaId])

  const loadData = async () => {
    setLoading(true)
    try {
      const result = await getBasculaHistory(selectedEmpresaId)
      if (!result.success) {
        toast({ title: "Error", description: result.error || "No se pudieron cargar los datos del historial de báscula.", variant: "destructive" })
        setData([])
      } else {
        setData(result.data || [])
      }
    } catch (error) {
      toast({ title: "Error", description: "Error al cargar los datos.", variant: "destructive" })
      setData([])
    } finally {
      setLoading(false)
    }
  }

  const openEditDialog = (record: BasculaHistoryRecord) => {
    setEditRecord(record)
    setEditStep("password")
    setPassword("")
    setShowPassword(false)
    setNewPeso(record.pesovascula?.toString() || "")
    setNewTiquete(record.tiquetebascula || "")
    setNewTransporte(record.transporte || "")
    setEditDialogOpen(true)
  }

  const handlePasswordSubmit = () => {
    if (password !== EDIT_PASSWORD) {
      toast({ title: "Contraseña incorrecta", description: "La contraseña ingresada no es válida.", variant: "destructive" })
      return
    }
    setEditStep("edit")
  }

  const handleSaveRecord = async () => {
    if (!editRecord) return
    const parsed = parseFloat(newPeso)
    if (isNaN(parsed) || parsed <= 0) {
      toast({ title: "Valor inválido", description: "Ingresa un peso válido mayor a 0.", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const trimmedTransporte = newTransporte.trim()
      const result = await updateBasculaRecord(
        editRecord.id,
        parsed,
        newTiquete,
        trimmedTransporte,
      )
      if (!result.success) {
        toast({ title: "Error", description: result.error || "No se pudo actualizar el registro.", variant: "destructive" })
        return
      }
      setData((prev) =>
        prev.map((r) =>
          r.id === editRecord.id
            ? {
                ...r,
                pesovascula: parsed,
                tiquetebascula: newTiquete,
                transporte: trimmedTransporte || null,
              }
            : r,
        ),
      )
      toast({ title: "Actualizado", description: "Registro de báscula actualizado correctamente." })
      setEditDialogOpen(false)
    } catch {
      toast({ title: "Error", description: "Error inesperado al guardar.", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleExportToExcel = () => {
    setExporting(true)
    try {
      const dataToExport = filteredData.map((row) => ({
        "Orden de Cargue": row.ordendecargue || "",
        "Fecha Orden": row.fechaorden || "",
        "Fecha Cargue": row.fechacargue || "",
        Placa: row.placa || "",
        "Tiquete Báscula": row.tiquetebascula || "",
        "Peso Orden (kg)": row.pesoorden || "",
        "Peso Báscula (kg)": row.pesovascula || "",
      }))
      const worksheet = XLSX.utils.json_to_sheet(dataToExport)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, "Historial Báscula")
      XLSX.writeFile(workbook, `historial_bascula_${new Date().toISOString().split("T")[0]}.xlsx`)
      toast({ title: "Éxito", description: "Datos exportados correctamente a Excel." })
    } catch {
      toast({ title: "Error", description: "No se pudo exportar a Excel.", variant: "destructive" })
    } finally {
      setExporting(false)
    }
  }

  const filteredData = data.filter((item) => {
    if (desdeFilter && item.fechaorden < desdeFilter) return false
    if (hastaFilter && item.fechaorden > hastaFilter) return false
    if (placaFilter && !item.placa?.toLowerCase().includes(placaFilter.toLowerCase())) return false
    if (ordenFilter && !item.ordendecargue?.toLowerCase().includes(ordenFilter.toLowerCase())) return false
    if (tiqueteFilter && !item.tiquetebascula?.toLowerCase().includes(tiqueteFilter.toLowerCase())) return false
    return true
  })

  // Toneladas del periodo/filtro actual — mismo criterio que la tarjeta de
  // arriba (Σ pesovascula), para que la tabla y la tarjeta muestren el mismo
  // número aunque la tarjeta consulte directo a la BD (sin paginar 1000 filas
  // como este listado en memoria).
  const toneladasFiltradas = filteredData.reduce((acc, r) => acc + (Number(r.pesovascula) || 0), 0)

  const clearFilters = () => {
    setDesdeFilter("")
    setHastaFilter("")
    setPlacaFilter("")
    setOrdenFilter("")
    setTiqueteFilter("")
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Historial Báscula</h2>
        <Button onClick={handleExportToExcel} disabled={exporting || filteredData.length === 0} size="sm">
          {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          Exportar a Excel
        </Button>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="space-y-1">
          <Label htmlFor="desde" className="text-xs">Fecha desde</Label>
          <Input id="desde" type="date" value={desdeFilter} onChange={(e) => setDesdeFilter(e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="hasta" className="text-xs">Fecha hasta</Label>
          <Input id="hasta" type="date" value={hastaFilter} onChange={(e) => setHastaFilter(e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="placa" className="text-xs">Placa</Label>
          <Input id="placa" type="text" placeholder="Buscar placa..." value={placaFilter} onChange={(e) => setPlacaFilter(e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="orden" className="text-xs">Orden de Cargue</Label>
          <Input id="orden" type="text" placeholder="Buscar orden..." value={ordenFilter} onChange={(e) => setOrdenFilter(e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tiquete" className="text-xs">Tiquete Báscula</Label>
          <Input id="tiquete" type="text" placeholder="Buscar tiquete..." value={tiqueteFilter} onChange={(e) => setTiqueteFilter(e.target.value)} className="h-9 text-sm" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        El filtro "Fecha desde/hasta" (sobre fecha de orden) también actualiza la tarjeta de toneladas de arriba.
      </p>

      {(desdeFilter || hastaFilter || placaFilter || ordenFilter || tiqueteFilter) && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={clearFilters}>Limpiar Filtros</Button>
        </div>
      )}

      {/* Tabla */}
      <div className="w-full overflow-x-auto rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs whitespace-nowrap font-semibold">Orden de Cargue</TableHead>
              <TableHead className="text-xs whitespace-nowrap font-semibold">Fecha Orden</TableHead>
              <TableHead className="text-xs whitespace-nowrap font-semibold">Fecha Cargue</TableHead>
              <TableHead className="text-xs whitespace-nowrap font-semibold">Placa</TableHead>
              <TableHead className="text-xs whitespace-nowrap font-semibold">Tiquete Báscula</TableHead>
              <TableHead className="text-xs whitespace-nowrap font-semibold">Peso Orden (kg)</TableHead>
              <TableHead className="text-xs whitespace-nowrap font-semibold">Peso Báscula (kg)</TableHead>
              <TableHead className="text-xs whitespace-nowrap font-semibold w-24 text-center">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-xs">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : filteredData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-xs">No se encontraron registros.</TableCell>
              </TableRow>
            ) : (
              filteredData.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-xs whitespace-nowrap">{row.ordendecargue || "-"}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{row.fechaorden || "-"}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{row.fechacargue || "-"}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{row.placa || "-"}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{row.tiquetebascula || "-"}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{row.pesoorden || "-"}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{row.pesovascula || "-"}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openDetails(row)}
                        title="Ver detalle de productos y lotes"
                        disabled={!row.ordendecargue}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEditDialog(row)}
                        title="Editar Peso Báscula"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="text-sm text-muted-foreground">
        Mostrando {filteredData.length} de {data.length} registros · {(Math.round(toneladasFiltradas * 10) / 10).toLocaleString("es-CO")} t en el periodo filtrado
      </div>

      <BasculaOrderDetailsDialog
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        ordendecargue={selectedOrden}
        placa={selectedPlaca}
      />

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { if (!saving) setEditDialogOpen(open) }}>
        <DialogContent className="sm:max-w-sm">
          {editStep === "password" ? (
            <>
              <DialogHeader>
                <DialogTitle>Verificación de Identidad</DialogTitle>
                <DialogDescription>
                  Ingresa la contraseña para editar el Peso Báscula de la orden <span className="font-semibold">{editRecord?.ordendecargue}</span>.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 py-2">
                <Label htmlFor="edit-password">Contraseña</Label>
                <div className="relative">
                  <Input
                    id="edit-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handlePasswordSubmit()}
                    placeholder="Ingresa la contraseña"
                    autoFocus
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(v => !v)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
                <Button onClick={handlePasswordSubmit}>Continuar</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Editar Registro Báscula</DialogTitle>
                <DialogDescription>
                  Orden: <span className="font-semibold">{editRecord?.ordendecargue}</span>{" | "}Placa: <span className="font-semibold">{editRecord?.placa}</span>
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-1">
                  <Label htmlFor="new-transporte">Transporte</Label>
                  <Input
                    id="new-transporte"
                    type="text"
                    value={newTransporte}
                    onChange={(e) => setNewTransporte(e.target.value)}
                    placeholder="Nombre del transporte"
                    autoFocus
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new-tiquete">Tiquete Báscula</Label>
                  <Input
                    id="new-tiquete"
                    type="text"
                    value={newTiquete}
                    onChange={(e) => setNewTiquete(e.target.value)}
                    placeholder="Numero de tiquete"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new-peso">Peso Báscula (kg)</Label>
                  <Input
                    id="new-peso"
                    type="number"
                    step="0.01"
                    min="0"
                    value={newPeso}
                    onChange={(e) => setNewPeso(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSaveRecord()}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={saving}>Cancelar</Button>
                <Button onClick={handleSaveRecord} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Guardar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
