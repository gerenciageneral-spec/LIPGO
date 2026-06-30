"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Plus, Trash2, Save } from "lucide-react"
import { toast } from "sonner"
import { getCategoriasForSelect } from "@/lib/config-actions"
import {
  createTransferRequest,
  getEmpresasForSelect,
  getProductosWithWeight,
  getInventoryByEmpresa,
} from "@/lib/transfer-actions"

interface ProductLine {
  id: string
  categoria: string
  producto: string
  productoId: number | null // Added productoId for inventory matching
  cantidad: number
  pesoUnitario: number
  pesoTotal: number
  inventarioDisponible: number
}

interface Empresa {
  id: number
  nombre: string
}

interface Categoria {
  nombre: string
}

interface ProductoWithWeight {
  id: number // Added id field
  nombre: string
  categoria: string
  peso_unitkg: number
}

interface InventoryItem {
  idproducto: number // Changed from producto string to idproducto number
  stock_global: number
}

interface TransferProduct {
  categoria: string
  producto: string
  cantidad: number
  pesoUnitario: number // Added pesoUnitario to TransferProduct
}

export function TransferRequestsForm() {
  const [bodegaOrigenId, setBodegaOrigenId] = useState<number | null>(null)
  const [bodegaDestinoId, setBodegaDestinoId] = useState<number | null>(null)
  const [products, setProducts] = useState<ProductLine[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [allProductos, setAllProductos] = useState<ProductoWithWeight[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Load data on mount
  useEffect(() => {
    loadEmpresas()
    loadCategorias()
    loadProductos()
  }, [])

  useEffect(() => {
    if (bodegaOrigenId) {
      loadInventory(bodegaOrigenId)
    } else {
      setInventory([])
    }
  }, [bodegaOrigenId])

  useEffect(() => {
    if (inventory.length > 0) {
      console.log("[v0] Updating products with inventory:", inventory)
      setProducts((prevProducts) =>
        prevProducts.map((p) => {
          const inventoryItem = inventory.find((inv) => inv.idproducto === p.productoId)
          const newInv = inventoryItem?.stock_global || 0
          console.log(`[v0] Product ${p.producto} (ID: ${p.productoId}) inventory:`, newInv)
          return {
            ...p,
            inventarioDisponible: newInv,
          }
        }),
      )
    }
  }, [inventory])

  const loadEmpresas = async () => {
    try {
      const data = await getEmpresasForSelect()
      setEmpresas(data)
    } catch (error) {
      console.error("Error loading empresas:", error)
      toast.error("Error al cargar las empresas")
    }
  }

  const loadCategorias = async () => {
    try {
      const data = await getCategoriasForSelect()
      setCategorias(data)
    } catch (error) {
      console.error("Error loading categorias:", error)
      toast.error("Error al cargar las categorías")
    }
  }

  const loadProductos = async () => {
    try {
      const data = await getProductosWithWeight()
      setAllProductos(data)
    } catch (error) {
      console.error("Error loading productos:", error)
      toast.error("Error al cargar los productos")
    }
  }

  const loadInventory = async (empresaId: number) => {
    try {
      const data = await getInventoryByEmpresa(empresaId)
      setInventory(data)
    } catch (error) {
      console.error("Error loading inventory:", error)
      toast.error("Error al cargar el inventario")
    }
  }

  const addProduct = () => {
    const newProduct: ProductLine = {
      id: Date.now().toString(),
      categoria: "",
      producto: "",
      productoId: null, // Initialize productoId
      cantidad: 0,
      pesoUnitario: 0,
      pesoTotal: 0,
      inventarioDisponible: 0,
    }
    setProducts([...products, newProduct])
  }

  const updateProductLine = (id: string, field: keyof ProductLine, value: any) => {
    setProducts(
      products.map((p) => {
        if (p.id === id) {
          const updated = { ...p, [field]: value }

          if (field === "categoria") {
            updated.producto = ""
            updated.productoId = null // Reset productoId
            updated.pesoUnitario = 0
            updated.pesoTotal = 0
            updated.inventarioDisponible = 0
          }

          if (field === "producto") {
            const productoData = allProductos.find((prod) => prod.nombre === value)
            if (productoData) {
              updated.productoId = productoData.id
              updated.pesoUnitario = productoData.peso_unitkg
              updated.pesoTotal = (productoData.peso_unitkg * updated.cantidad) / 1000

              // Get inventory for this product using ID
              const inventoryItem = inventory.find((inv) => inv.idproducto === productoData.id)
              updated.inventarioDisponible = inventoryItem?.stock_global || 0
              console.log(
                `[v0] Selected product ${value} (ID: ${productoData.id}), inventory:`,
                updated.inventarioDisponible,
              )
            }
          }

          if (field === "cantidad") {
            updated.pesoTotal = (updated.pesoUnitario * value) / 1000
          }

          return updated
        }
        return p
      }),
    )
  }

  const removeProduct = (id: string) => {
    setProducts(products.filter((p) => p.id !== id))
  }

  const totalPesoTons = products.reduce((sum, p) => sum + p.pesoTotal, 0)

  const handleSubmit = async () => {
    // Validation
    if (!bodegaOrigenId) {
      toast.error("Debe seleccionar una bodega de origen")
      return
    }
    if (!bodegaDestinoId) {
      toast.error("Debe seleccionar una bodega de destino")
      return
    }
    if (bodegaOrigenId === bodegaDestinoId) {
      toast.error("La bodega de origen y destino no pueden ser iguales")
      return
    }
    if (products.length === 0) {
      toast.error("Debe agregar al menos un producto")
      return
    }

    // Validate all products have required fields
    const invalidProduct = products.find((p) => !p.categoria || !p.producto || p.cantidad <= 0)
    if (invalidProduct) {
      toast.error("Todos los productos deben tener categoría, producto y cantidad mayor a 0")
      return
    }

    const insufficientStock = products.find((p) => p.cantidad > p.inventarioDisponible)
    if (insufficientStock) {
      toast.error(`La cantidad de ${insufficientStock.producto} supera el inventario disponible`)
      return
    }

    setIsSubmitting(true)
    try {
      const bodegaOrigenNombre = empresas.find((e) => e.id === bodegaOrigenId)?.nombre || ""
      const bodegaDestinoNombre = empresas.find((e) => e.id === bodegaDestinoId)?.nombre || ""

      const result = await createTransferRequest({
        bodegaOrigenId,
        bodegaDestinoId,
        products: products.map((p) => ({
          categoria: p.categoria,
          producto: p.producto,
          cantidad: p.cantidad,
          pesoUnitario: p.pesoUnitario,
        })),
      })

      toast.success(`Solicitud de traslado ${result.pedidoCode} creada exitosamente`)

      if (result.pdfUrl) {
        const link = document.createElement("a")
        link.href = result.pdfUrl
        link.download = `traslado_${result.pedidoCode}.pdf`
        link.target = "_blank"
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }

      // Reset form
      setBodegaOrigenId(null)
      setBodegaDestinoId(null)
      setProducts([])
    } catch (error) {
      console.error("Error creating transfer request:", error)
      toast.error("Error al crear la solicitud de traslado")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Solicitudes de Traslados</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Información de Traslado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bodegaOrigen">Bodega Origen</Label>
              <Select
                value={bodegaOrigenId?.toString() || ""}
                onValueChange={(value) => setBodegaOrigenId(Number(value))}
              >
                <SelectTrigger id="bodegaOrigen">
                  <SelectValue placeholder="Seleccione bodega de origen" />
                </SelectTrigger>
                <SelectContent>
                  {empresas.map((empresa) => (
                    <SelectItem key={`origen-${empresa.id}`} value={empresa.id.toString()}>
                      {empresa.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bodegaDestino">Bodega Destino</Label>
              <Select
                value={bodegaDestinoId?.toString() || ""}
                onValueChange={(value) => setBodegaDestinoId(Number(value))}
              >
                <SelectTrigger id="bodegaDestino">
                  <SelectValue placeholder="Seleccione bodega de destino" />
                </SelectTrigger>
                <SelectContent>
                  {empresas.map((empresa) => (
                    <SelectItem key={`destino-${empresa.id}`} value={empresa.id.toString()}>
                      {empresa.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Productos a Trasladar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[150px]">Categoría</TableHead>
                  <TableHead className="w-[150px]">Producto</TableHead>
                  <TableHead className="w-[100px]">Peso U. (kg)</TableHead>
                  <TableHead className="w-[100px]">Cantidad</TableHead>
                  <TableHead className="w-[100px]">Inv. Disp.</TableHead>
                  <TableHead className="w-[100px]">Peso T. (ton)</TableHead>
                  <TableHead className="w-[80px]">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow
                    key={product.id}
                    className={product.cantidad > product.inventarioDisponible ? "bg-red-50" : ""}
                  >
                    <TableCell className="p-2">
                      <Select
                        value={product.categoria}
                        onValueChange={(value) => updateProductLine(product.id, "categoria", value)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Seleccione categoría" />
                        </SelectTrigger>
                        <SelectContent>
                          {categorias.map((categoria, index) => (
                            <SelectItem key={`${categoria.nombre}-${index}`} value={categoria.nombre}>
                              {categoria.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="p-2">
                      <Select
                        value={product.producto}
                        onValueChange={(value) => updateProductLine(product.id, "producto", value)}
                        disabled={!product.categoria}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Seleccione producto" />
                        </SelectTrigger>
                        <SelectContent>
                          {allProductos
                            .filter((prod) => prod.categoria === product.categoria)
                            .map((producto, index) => (
                              <SelectItem key={`${producto.nombre}-${index}`} value={producto.nombre}>
                                {producto.nombre}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="p-2 text-center">
                      {product.pesoUnitario > 0 ? product.pesoUnitario.toFixed(2) : "-"}
                    </TableCell>
                    <TableCell className="p-2">
                      <Input
                        type="number"
                        min="0"
                        className="w-full"
                        value={product.cantidad}
                        onChange={(e) => updateProductLine(product.id, "cantidad", Number(e.target.value))}
                      />
                    </TableCell>
                    <TableCell className="p-2 text-center font-medium">{product.inventarioDisponible}</TableCell>
                    <TableCell className="p-2 text-center">
                      {product.pesoTotal > 0 ? product.pesoTotal.toFixed(3) : "-"}
                    </TableCell>
                    <TableCell className="p-2">
                      <Button
                        onClick={() => removeProduct(product.id)}
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {products.length > 0 && (
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell colSpan={5} className="text-right p-2">
                      Total Peso:
                    </TableCell>
                    <TableCell className="text-center p-2">{totalPesoTons.toFixed(3)} ton</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <Button onClick={addProduct} variant="secondary" className="w-full md:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Agregar Producto
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button onClick={handleSubmit} disabled={isSubmitting} size="lg">
          <Save className="h-4 w-4 mr-2" />
          {isSubmitting ? "Guardando..." : "Guardar Solicitud"}
        </Button>
      </div>
    </div>
  )
}
