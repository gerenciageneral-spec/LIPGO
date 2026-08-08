"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, CheckCircle2, PlayCircle, Warehouse } from "lucide-react"
import {
  getAlmacenes,
  getLocationsFromSaldoInvDetalle,
  getProductsFromSaldoInvDetalle,
  getInventoryForAudit,
} from "@/lib/inventory-actions"
import { useAuth } from "@/components/auth-provider"

interface AuditItem {
  nombreproducto: string
  lote: string
  stock_actual: number
  conteo: number
  diferencia: number
}

interface AlmacenOption {
  id: number
  nombre: string
}

// Sentinel para el Select cuando no hay almacen elegido. shadcn/ui
// Select no acepta value="" en SelectItem, asi que usamos un literal.
const ALL_ALMACENES = "all"

export default function InventoryAudit() {
  const { selectedEmpresaId } = useAuth()
  const [almacenes, setAlmacenes] = useState<AlmacenOption[]>([])
  const [selectedAlmacen, setSelectedAlmacen] = useState<string>(ALL_ALMACENES)
  const [locations, setLocations] = useState<string[]>([])
  const [products, setProducts] = useState<string[]>([])
  const [selectedLocation, setSelectedLocation] = useState("defaultLocation")
  const [selectedProduct, setSelectedProduct] = useState("all")
  const [auditItems, setAuditItems] = useState<AuditItem[]>([])
  const [isAuditing, setIsAuditing] = useState(false)
  const [isValidated, setIsValidated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingLocations, setLoadingLocations] = useState(false)

  // Carga inicial: almacenes y catalogo de productos (los productos no
  // dependen del almacen porque saldoinvdetalle ya viene filtrado por
  // empresa, y un producto puede existir en varias locations).
  useEffect(() => {
    if (!selectedEmpresaId) return
    void loadAlmacenes()
    void loadProducts()
  }, [selectedEmpresaId])

  // Cuando cambia el almacen seleccionado, recargamos las localizaciones.
  // Memoizamos con useCallback porque la usamos como effect dependency
  // y queremos evitar recreaciones innecesarias.
  const loadLocations = useCallback(async (bodegaId?: number) => {
    setLoadingLocations(true)
    try {
      const locs = await getLocationsFromSaldoInvDetalle(bodegaId, selectedEmpresaId ?? undefined)
      setLocations(locs)
    } catch (error) {
      console.error("[v0] Error loading locations:", error)
      setLocations([])
    } finally {
      setLoadingLocations(false)
    }
  }, [selectedEmpresaId])

  useEffect(() => {
    const bodegaId =
      selectedAlmacen === ALL_ALMACENES ? undefined : Number(selectedAlmacen)
    // Reset de la localizacion al cambiar el almacen para que el usuario
    // no quede con una seleccion invalida (location de otra bodega).
    setSelectedLocation("defaultLocation")
    void loadLocations(bodegaId)
  }, [selectedAlmacen, loadLocations])

  const loadAlmacenes = async () => {
    try {
      const data = await getAlmacenes(selectedEmpresaId ?? undefined)
      // Mapeamos a la forma que necesita el Select. `getAlmacenes` ya
      // devuelve solo los de la empresa activa.
      const opts: AlmacenOption[] = (data ?? []).map((a: { id: number; nombre: string }) => ({
        id: a.id,
        nombre: a.nombre,
      }))
      setAlmacenes(opts)
    } catch (error) {
      console.error("[v0] Error loading almacenes:", error)
      setAlmacenes([])
    }
  }

  const loadProducts = async () => {
    try {
      const prods = await getProductsFromSaldoInvDetalle(selectedEmpresaId ?? undefined)
      setProducts(prods)
    } catch (error) {
      console.error("[v0] Error loading products:", error)
    }
  }

  const handleIniciarConteo = async () => {
    if (!selectedLocation || selectedLocation === "defaultLocation") {
      alert("Por favor seleccione una localización")
      return
    }

    setLoading(true)
    setIsValidated(false)

    try {
      const data = await getInventoryForAudit(selectedLocation, selectedProduct, selectedEmpresaId ?? undefined)

      // Initialize audit items with conteo = 0 and diferencia = 0
      const items: AuditItem[] = data.map((item) => ({
        nombreproducto: item.nombreproducto,
        lote: item.lote,
        stock_actual: item.stock_actual,
        conteo: 0,
        diferencia: 0,
      }))

      setAuditItems(items)
      setIsAuditing(true)
    } catch (error) {
      console.error("[v0] Error starting audit:", error)
      alert("Error al iniciar el conteo")
    } finally {
      setLoading(false)
    }
  }

  const handleConteoChange = (index: number, value: string) => {
    const newConteo = Number.parseFloat(value) || 0
    setAuditItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              conteo: newConteo,
              diferencia: 0, // Reset diferencia when conteo changes
            }
          : item,
      ),
    )
    // Reset validation when user changes values
    setIsValidated(false)
  }

  const handleValidarInventario = () => {
    // Calculate differences
    const validatedItems = auditItems.map((item) => ({
      ...item,
      diferencia: item.conteo - item.stock_actual,
    }))

    setAuditItems(validatedItems)
    setIsValidated(true)
  }

  const handleReset = () => {
    setSelectedAlmacen(ALL_ALMACENES)
    setSelectedLocation("defaultLocation")
    setSelectedProduct("all")
    setAuditItems([])
    setIsAuditing(false)
    setIsValidated(false)
  }

  const selectedAlmacenLabel =
    selectedAlmacen === ALL_ALMACENES
      ? "Todos los almacenes"
      : almacenes.find((a) => String(a.id) === selectedAlmacen)?.nombre ?? "—"

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Auditoría de Inventario</CardTitle>
          <CardDescription>
            Realice el conteo físico del inventario y valide las diferencias. Filtre por
            almacén para reducir la lista de localizaciones a contar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="almacen" className="flex items-center gap-1.5">
                <Warehouse className="h-3.5 w-3.5 text-muted-foreground" />
                Almacén
              </Label>
              <Select
                value={selectedAlmacen}
                onValueChange={setSelectedAlmacen}
                disabled={isAuditing}
              >
                <SelectTrigger id="almacen">
                  <SelectValue placeholder="Todos los almacenes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_ALMACENES}>Todos los almacenes</SelectItem>
                  {almacenes.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Localización *</Label>
              <Select
                value={selectedLocation}
                onValueChange={setSelectedLocation}
                disabled={isAuditing || loadingLocations}
              >
                <SelectTrigger id="location">
                  <SelectValue
                    placeholder={
                      loadingLocations
                        ? "Cargando localizaciones..."
                        : locations.length === 0
                          ? "Sin localizaciones disponibles"
                          : "Seleccione una localización..."
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc} value={loc}>
                      {loc}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {locations.length} localización{locations.length === 1 ? "" : "es"} con
                stock en{" "}
                <span className="font-medium text-foreground">{selectedAlmacenLabel}</span>
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="product">Producto (Opcional)</Label>
              <Select value={selectedProduct} onValueChange={setSelectedProduct} disabled={isAuditing}>
                <SelectTrigger id="product">
                  <SelectValue placeholder="Todos los productos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los productos</SelectItem>
                  {products.map((prod) => (
                    <SelectItem key={prod} value={prod}>
                      {prod}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!isAuditing ? (
            <Button
              onClick={handleIniciarConteo}
              disabled={!selectedLocation || selectedLocation === "defaultLocation" || loading}
              className="w-full"
            >
              <PlayCircle className="mr-2 h-4 w-4" />
              {loading ? "Cargando..." : "Iniciar Conteo Físico"}
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button onClick={handleValidarInventario} className="flex-1">
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Validar Inventario
              </Button>
              <Button onClick={handleReset} variant="outline">
                Nueva Auditoría
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {isAuditing && auditItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Conteo Físico - {selectedLocation}</CardTitle>
            <CardDescription>
              Almacén: <span className="font-medium">{selectedAlmacenLabel}</span>
              {selectedProduct && selectedProduct !== "all" ? (
                <>
                  {" · "}Producto: <span className="font-medium">{selectedProduct}</span>
                </>
              ) : null}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b">
                    <th className="text-left p-3 font-semibold">Producto</th>
                    <th className="text-left p-3 font-semibold">Lote</th>
                    {isValidated && <th className="text-right p-3 font-semibold">Stock Actual</th>}
                    <th className="text-right p-3 font-semibold">Conteo</th>
                    {isValidated && <th className="text-right p-3 font-semibold">Diferencia</th>}
                  </tr>
                </thead>
                <tbody>
                  {auditItems.map((item, index) => {
                    const hasDifference = isValidated && item.diferencia !== 0
                    return (
                      <tr
                        key={`${item.nombreproducto}-${item.lote}`}
                        className={`border-b ${hasDifference ? "bg-red-50" : ""}`}
                      >
                        <td className="p-3">{item.nombreproducto}</td>
                        <td className="p-3">{item.lote}</td>
                        {isValidated && <td className="p-3 text-right font-medium">{item.stock_actual.toFixed(2)}</td>}
                        <td className="p-3">
                          <Input
                            type="number"
                            step="0.01"
                            value={item.conteo}
                            onChange={(e) => handleConteoChange(index, e.target.value)}
                            className="text-right"
                            disabled={isValidated}
                          />
                        </td>
                        {isValidated && (
                          <td className="p-3 text-right">
                            {hasDifference ? (
                              <span className={`font-bold ${item.diferencia > 0 ? "text-green-600" : "text-red-600"}`}>
                                {item.diferencia > 0 ? "+" : ""}
                                {item.diferencia.toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">0.00</span>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {isValidated && (
              <div className="mt-4 space-y-2">
                {auditItems.some((item) => item.diferencia !== 0) ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Se encontraron diferencias en el inventario. Revise los productos marcados en rojo.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert>
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertDescription>El inventario coincide perfectamente con el conteo físico.</AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
