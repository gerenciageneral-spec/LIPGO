"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Loader2, Plus, Trash2, Pencil } from "lucide-react"
import {
  getProducts,
  getMaterials,
  getExplosionsByProduct,
  getAllExplosions,
  createMaterialExplosion,
  deleteMaterialExplosion,
  updateMaterialExplosion,
} from "@/lib/mrp-actions"
import type { Product, Material, MaterialExplosion } from "@/lib/mrp-actions"
import { useToast } from "@/hooks/use-toast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface MaterialLine {
  tempId: string
  materialId: number
  materialName: string
  materialCode: string
  materialType: string
  materialUnit: string
  consumo: number
}

function MaterialExplosionComponent() {
  const [products, setProducts] = useState<Product[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [selectedProductId, setSelectedProductId] = useState<string>("")
  const [selectedProductName, setSelectedProductName] = useState<string>("")
  const [materialLines, setMaterialLines] = useState<MaterialLine[]>([])
  const [existingExplosions, setExistingExplosions] = useState<MaterialExplosion[]>([])
  const [allExplosions, setAllExplosions] = useState<MaterialExplosion[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingExplosion, setEditingExplosion] = useState<MaterialExplosion | null>(null)
  const [editConsumo, setEditConsumo] = useState<number>(0)
  const { toast } = useToast()

  useEffect(() => {
    loadInitialData()
  }, [])

  const loadInitialData = async () => {
    setLoading(true)
    try {
      const [productsData, materialsData, explosionsData] = await Promise.all([
        getProducts(),
        getMaterials(),
        getAllExplosions(),
      ])

      setProducts(productsData)
      setMaterials(materialsData)
      setAllExplosions(explosionsData)
    } catch (error) {
      console.error("Error loading initial data:", error)
      toast({
        title: "Error",
        description: "No se pudo cargar los datos iniciales",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selectedProductId) {
      loadProductExplosions()
    } else {
      setExistingExplosions([])
      setMaterialLines([])
    }
  }, [selectedProductId])

  const loadProductExplosions = async () => {
    if (!selectedProductId) return

    try {
      const explosions = await getExplosionsByProduct(Number.parseInt(selectedProductId))
      setExistingExplosions(explosions)
    } catch (error) {
      console.error("Error loading product explosions:", error)
    }
  }

  const handleProductChange = (productId: string) => {
    setSelectedProductId(productId)
    const product = products.find((p) => p.id.toString() === productId)
    if (product) {
      setSelectedProductName(product.nombre)
    }
    setMaterialLines([])
  }

  const addMaterialLine = () => {
    const newLine: MaterialLine = {
      tempId: `temp-${Date.now()}`,
      materialId: 0,
      materialName: "",
      materialCode: "",
      materialType: "",
      materialUnit: "",
      consumo: 0,
    }
    setMaterialLines([...materialLines, newLine])
  }

  const removeMaterialLine = (tempId: string) => {
    setMaterialLines(materialLines.filter((line) => line.tempId !== tempId))
  }

  const updateMaterialLine = (tempId: string, field: string, value: any) => {
    setMaterialLines(
      materialLines.map((line) => {
        if (line.tempId === tempId) {
          if (field === "materialId") {
            const material = materials.find((m) => m.id.toString() === value)
            if (material) {
              return {
                ...line,
                materialId: material.id,
                materialName: material.nombre,
                materialCode: material.codigo,
                materialType: material.tipo,
                materialUnit: material.undmedida,
              }
            }
          }
          return { ...line, [field]: value }
        }
        return line
      }),
    )
  }

  const handleSaveExplosion = async () => {
    if (!selectedProductId || !selectedProductName) {
      toast({
        title: "Error",
        description: "Debe seleccionar un producto",
        variant: "destructive",
      })
      return
    }

    if (materialLines.length === 0) {
      toast({
        title: "Error",
        description: "Debe agregar al menos un material",
        variant: "destructive",
      })
      return
    }

    const invalidLines = materialLines.filter((line) => line.materialId === 0 || line.consumo <= 0)
    if (invalidLines.length > 0) {
      toast({
        title: "Error",
        description: "Todos los materiales deben tener un material seleccionado y un consumo mayor a 0",
        variant: "destructive",
      })
      return
    }

    setSaving(true)
    try {
      await createMaterialExplosion(Number.parseInt(selectedProductId), selectedProductName, materialLines)
      toast({
        title: "Éxito",
        description: "Explosión de materiales creada correctamente",
      })
      setMaterialLines([])
      await loadProductExplosions()
      await loadInitialData()
    } catch (error) {
      console.error("Error saving explosion:", error)
      toast({
        title: "Error",
        description: "No se pudo guardar la explosión de materiales",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteExplosion = async (id: number) => {
    if (!confirm("¿Está seguro de eliminar esta línea de explosión?")) return

    try {
      await deleteMaterialExplosion(id)
      toast({
        title: "Éxito",
        description: "Línea eliminada correctamente",
      })
      await loadProductExplosions()
      await loadInitialData()
    } catch (error) {
      console.error("Error deleting explosion:", error)
      toast({
        title: "Error",
        description: "No se pudo eliminar la línea",
        variant: "destructive",
      })
    }
  }

  const openEditDialog = (explosion: MaterialExplosion) => {
    setEditingExplosion(explosion)
    setEditConsumo(explosion.consumo)
  }

  const handleUpdateExplosion = async () => {
    if (!editingExplosion) return

    if (editConsumo <= 0) {
      toast({
        title: "Error",
        description: "El consumo debe ser mayor a 0",
        variant: "destructive",
      })
      return
    }

    try {
      await updateMaterialExplosion(editingExplosion.id, editConsumo)
      toast({
        title: "Éxito",
        description: "Consumo actualizado correctamente",
      })
      setEditingExplosion(null)
      await loadProductExplosions()
      await loadInitialData()
    } catch (error) {
      console.error("Error updating explosion:", error)
      toast({
        title: "Error",
        description: "No se pudo actualizar el consumo",
        variant: "destructive",
      })
    }
  }

  const groupExplosionsByProduct = () => {
    const grouped = new Map<string, MaterialExplosion[]>()
    allExplosions.forEach((explosion) => {
      const existing = grouped.get(explosion.producto) || []
      grouped.set(explosion.producto, [...existing, explosion])
    })
    return grouped
  }

  const groupedExplosions = groupExplosionsByProduct()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Crear Explosión de Materiales</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="product">Producto</Label>
            <Select value={selectedProductId} onValueChange={handleProductChange}>
              <SelectTrigger id="product">
                <SelectValue placeholder="Seleccione un producto" />
              </SelectTrigger>
              <SelectContent>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id.toString()}>
                    {product.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedProductId && (
            <>
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold">Materiales</h3>
                  <Button onClick={addMaterialLine} size="sm" variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Agregar Material
                  </Button>
                </div>

                {materialLines.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-8 border rounded-lg">
                    No hay materiales agregados. Haga clic en "Agregar Material" para comenzar.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {materialLines.map((line) => (
                      <Card key={line.tempId}>
                        <CardContent className="p-4">
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="md:col-span-2">
                              <Label className="text-xs">Material</Label>
                              <Select
                                value={line.materialId.toString()}
                                onValueChange={(value) => updateMaterialLine(line.tempId, "materialId", value)}
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue placeholder="Seleccione material" />
                                </SelectTrigger>
                                <SelectContent>
                                  {materials.map((material) => (
                                    <SelectItem key={material.id} value={material.id.toString()}>
                                      {material.nombre} ({material.codigo})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div>
                              <Label className="text-xs">Consumo</Label>
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={line.consumo === 0 ? "" : line.consumo}
                                onChange={(e) =>
                                  updateMaterialLine(line.tempId, "consumo", Number.parseFloat(e.target.value) || 0)
                                }
                                placeholder="0"
                                className="h-9"
                              />
                            </div>

                            <div className="flex items-end gap-2">
                              <div className="flex-1">
                                <Label className="text-xs">Unidad</Label>
                                <Input value={line.materialUnit || "-"} disabled className="h-9" />
                              </div>
                              <Button
                                onClick={() => removeMaterialLine(line.tempId)}
                                size="sm"
                                variant="destructive"
                                className="h-9"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          {line.materialId > 0 && (
                            <div className="mt-2 text-xs text-muted-foreground grid grid-cols-2 gap-2">
                              <div>
                                <span className="font-medium">Código:</span> {line.materialCode}
                              </div>
                              <div>
                                <span className="font-medium">Tipo:</span> {line.materialType}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {materialLines.length > 0 && (
                <div className="flex justify-end pt-4 border-t">
                  <Button onClick={handleSaveExplosion} disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Guardar Explosión
                  </Button>
                </div>
              )}

              {existingExplosions.length > 0 && (
                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold mb-3">Explosión Actual del Producto</h3>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-muted">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium">Material</th>
                          <th className="px-4 py-2 text-left text-xs font-medium">Código</th>
                          <th className="px-4 py-2 text-left text-xs font-medium">Tipo</th>
                          <th className="px-4 py-2 text-right text-xs font-medium">Consumo</th>
                          <th className="px-4 py-2 text-left text-xs font-medium">Unidad</th>
                          <th className="px-4 py-2 text-center text-xs font-medium">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {existingExplosions.map((explosion) => (
                          <tr key={explosion.id} className="border-t">
                            <td className="px-4 py-2 text-xs">{explosion.material}</td>
                            <td className="px-4 py-2 text-xs">{explosion.codmat}</td>
                            <td className="px-4 py-2 text-xs">{explosion.tipomaterial}</td>
                            <td className="px-4 py-2 text-xs text-right">{explosion.consumo}</td>
                            <td className="px-4 py-2 text-xs">{explosion.unidad}</td>
                            <td className="px-4 py-2 text-xs">
                              <div className="flex items-center justify-center gap-2">
                                <Button
                                  onClick={() => openEditDialog(explosion)}
                                  size="sm"
                                  variant="outline"
                                  className="h-7"
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button
                                  onClick={() => handleDeleteExplosion(explosion.id)}
                                  size="sm"
                                  variant="destructive"
                                  className="h-7"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Todas las Explosiones de Materiales</CardTitle>
        </CardHeader>
        <CardContent>
          {allExplosions.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              No hay explosiones de materiales registradas
            </div>
          ) : (
            <div className="space-y-4">
              {Array.from(groupedExplosions.entries()).map(([producto, explosions]) => (
                <Card key={producto}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{producto}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="border rounded-lg overflow-x-auto">
                      <table className="w-full min-w-[600px]">
                        <thead className="bg-muted">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium">Material</th>
                            <th className="px-4 py-2 text-left text-xs font-medium">Código</th>
                            <th className="px-4 py-2 text-left text-xs font-medium">Tipo</th>
                            <th className="px-4 py-2 text-right text-xs font-medium">Consumo</th>
                            <th className="px-4 py-2 text-left text-xs font-medium">Unidad</th>
                          </tr>
                        </thead>
                        <tbody>
                          {explosions.map((explosion) => (
                            <tr key={explosion.id} className="border-t">
                              <td className="px-4 py-2 text-xs">{explosion.material}</td>
                              <td className="px-4 py-2 text-xs">{explosion.codmat}</td>
                              <td className="px-4 py-2 text-xs">{explosion.tipomaterial}</td>
                              <td className="px-4 py-2 text-xs text-right">{explosion.consumo}</td>
                              <td className="px-4 py-2 text-xs">{explosion.unidad}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editingExplosion} onOpenChange={() => setEditingExplosion(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Consumo</DialogTitle>
            <DialogDescription>
              Material: {editingExplosion?.material} ({editingExplosion?.codmat})
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="editConsumo">Consumo</Label>
            <Input
              id="editConsumo"
              type="number"
              min={0}
              step="0.01"
              value={editConsumo}
              onChange={(e) => setEditConsumo(Number.parseFloat(e.target.value) || 0)}
            />
            <p className="text-xs text-muted-foreground mt-1">Unidad: {editingExplosion?.unidad}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingExplosion(null)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateExplosion}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default MaterialExplosionComponent
