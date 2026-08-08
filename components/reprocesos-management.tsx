"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/components/auth-provider"
import { Trash2, PackageCheck, Loader2 } from "lucide-react"
import {
  getReprocesos,
  deleteReproceso,
  processReproceso,
  getLocations,
  type Reproceso,
  type Location,
  type ProcessReprocesoData,
} from "@/lib/inventory-actions"

export function ReprocesosManagement() {
  const { toast } = useToast()
  const { selectedEmpresaId } = useAuth()
  const [reprocesos, setReprocesos] = useState<Reproceso[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [showProcessDialog, setShowProcessDialog] = useState(false)
  const [selectedReproceso, setSelectedReproceso] = useState<Reproceso | null>(null)
  const [processFormData, setProcessFormData] = useState({
    lote: "",
    cantidad: 0,
  })

  useEffect(() => {
    loadData()
  }, [selectedEmpresaId])

  const loadData = async () => {
    setLoading(true)
    const [reprocesosData, locationsData] = await Promise.all([
      getReprocesos(selectedEmpresaId),
      getLocations(undefined, selectedEmpresaId ?? undefined)
    ])
    setReprocesos(reprocesosData)
    setLocations(locationsData)
    setLoading(false)
  }

  const handleDelete = async (id: number) => {
    if (!confirm("¿Está seguro de que desea dar de baja este reproceso?")) {
      return
    }

    setDeletingId(id)
    const result = await deleteReproceso(id)

    if (result.success) {
      toast({
        title: "Éxito",
        description: result.message,
      })
      loadData()
    } else {
      toast({
        title: "Error",
        description: result.message,
        variant: "destructive",
      })
    }
    setDeletingId(null)
  }

  const handleOpenProcessDialog = (reproceso: Reproceso) => {
    setSelectedReproceso(reproceso)
    setProcessFormData({
      lote: reproceso.lote,
      cantidad: reproceso.cantidad,
    })
    setShowProcessDialog(true)
  }

  const handleProcessSubmit = async () => {
    if (!selectedReproceso) return

    if (!processFormData.lote || !processFormData.cantidad || processFormData.cantidad <= 0) {
      toast({
        title: "Error",
        description: "Por favor complete todos los campos obligatorios",
        variant: "destructive",
      })
      return
    }

    setProcessingId(selectedReproceso.id)

    const processData: ProcessReprocesoData = {
      id: selectedReproceso.id,
      codproducto: selectedReproceso.codproducto,
      producto: selectedReproceso.producto,
      lote: processFormData.lote,
      localizacion: "",
      cantidad: processFormData.cantidad,
    }

    const result = await processReproceso(processData)

    if (result.success) {
      toast({
        title: "Éxito",
        description: result.message,
      })
      setShowProcessDialog(false)
      setSelectedReproceso(null)
      loadData()
    } else {
      toast({
        title: "Error",
        description: result.message,
        variant: "destructive",
      })
    }
    setProcessingId(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Gestión de Reprocesos</CardTitle>
          <CardDescription>Lista de productos en reproceso pendientes de entrega</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead>Creado</TableHead>
                  <TableHead className="text-center">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reprocesos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No hay reprocesos pendientes
                    </TableCell>
                  </TableRow>
                ) : (
                  reprocesos.map((reproceso) => (
                    <TableRow key={reproceso.id}>
                      <TableCell className="font-medium">{reproceso.producto}</TableCell>
                      <TableCell>{reproceso.codproducto}</TableCell>
                      <TableCell>{reproceso.lote}</TableCell>
                      <TableCell className="text-right">{reproceso.cantidad}</TableCell>
                      <TableCell>
                        {reproceso.creado ? new Date(reproceso.creado).toLocaleString("es-CO") : "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenProcessDialog(reproceso)}
                            disabled={processingId === reproceso.id}
                          >
                            {processingId === reproceso.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <PackageCheck className="w-4 h-4 mr-1" />
                                Gestionar
                              </>
                            )}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDelete(reproceso.id)}
                            disabled={deletingId === reproceso.id}
                          >
                            {deletingId === reproceso.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
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

      <Dialog open={showProcessDialog} onOpenChange={setShowProcessDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gestionar Reproceso</DialogTitle>
            <DialogDescription>Complete la información para registrar la entrega del reproceso</DialogDescription>
          </DialogHeader>

          {selectedReproceso && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm text-muted-foreground">Producto</Label>
                  <p className="font-medium">{selectedReproceso.producto}</p>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">Código</Label>
                  <p className="font-medium">{selectedReproceso.codproducto}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="lote">Lote *</Label>
                <Input
                  id="lote"
                  value={processFormData.lote}
                  onChange={(e) => setProcessFormData((prev) => ({ ...prev, lote: e.target.value }))}
                  placeholder="Ingrese el lote"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cantidad">Cantidad *</Label>
                <Input
                  id="cantidad"
                  type="number"
                  value={processFormData.cantidad}
                  onChange={(e) => setProcessFormData((prev) => ({ ...prev, cantidad: Number(e.target.value) }))}
                  placeholder="Ingrese la cantidad"
                  min="1"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProcessDialog(false)} disabled={processingId !== null}>
              Cancelar
            </Button>
            <Button onClick={handleProcessSubmit} disabled={processingId !== null}>
              {processingId !== null ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Procesando...
                </>
              ) : (
                "Confirmar Entrega"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
