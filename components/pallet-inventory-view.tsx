"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Package, QrCode } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
  getInventoryByPallet,
  getProductosForPalletFilter,
  getLotesForPalletFilter,
  getLocationsForPalletFilter,
} from "@/lib/qr-actions"

interface PalletInventory {
  idqr: string
  codproducto: string
  nombreproducto: string
  lote: string
  location: string
  stock_total: number
}

export function PalletInventoryView() {
  const [inventory, setInventory] = useState<PalletInventory[]>([])
  const [productos, setProductos] = useState<Array<{ nombre: string }>>([])
  const [lotes, setLotes] = useState<Array<{ lote: string }>>([])
  const [locations, setLocations] = useState<Array<{ location: string }>>([])
  const [loading, setLoading] = useState(true)

  // Filter states
  const [productoFilter, setProductoFilter] = useState("all")
  const [loteFilter, setLoteFilter] = useState("all")
  const [locationFilter, setLocationFilter] = useState("all")

  const { toast } = useToast()

  useEffect(() => {
    loadFilterOptions()
    loadInventory()
  }, [])

  const loadFilterOptions = async () => {
    try {
      const [productosData, lotesData, locationsData] = await Promise.all([
        getProductosForPalletFilter(),
        getLotesForPalletFilter(),
        getLocationsForPalletFilter(),
      ])

      setProductos(productosData)
      setLotes(lotesData)
      setLocations(locationsData)
    } catch (error) {
      console.error("Error loading filter options:", error)
    }
  }

  const loadInventory = async () => {
    setLoading(true)
    try {
      const filters = {
        producto: productoFilter,
        lote: loteFilter,
        location: locationFilter,
      }

      const result = await getInventoryByPallet(filters)

      if (result.success) {
        setInventory(result.data)
      } else {
        toast({
          title: "Error",
          description: result.error || "Error al cargar el inventario",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error loading inventory:", error)
      toast({
        title: "Error",
        description: "Error al cargar el inventario por estiba",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleFilter = () => {
    loadInventory()
  }

  const handleClearFilters = () => {
    setProductoFilter("all")
    setLoteFilter("all")
    setLocationFilter("all")
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center gap-2">
        <QrCode className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Inventario por Estiba</h1>
      </div>

      {/* Filters Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Product Filter */}
            <div className="space-y-2 w-full">
              <Label htmlFor="productoFilter">Producto</Label>
              <Select value={productoFilter} onValueChange={setProductoFilter}>
                <SelectTrigger id="productoFilter" className="w-full">
                  <SelectValue placeholder="Todos los productos" />
                </SelectTrigger>
                <SelectContent className="max-w-[300px]">
                  <SelectItem value="all">Todos</SelectItem>
                  {productos.map((prod) => (
                    <SelectItem key={prod.nombre} value={prod.nombre} className="truncate">
                      {prod.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Lote Filter */}
            <div className="space-y-2 w-full">
              <Label htmlFor="loteFilter">Lote</Label>
              <Select value={loteFilter} onValueChange={setLoteFilter}>
                <SelectTrigger id="loteFilter" className="w-full">
                  <SelectValue placeholder="Todos los lotes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {lotes.map((lote) => (
                    <SelectItem key={lote.lote} value={lote.lote}>
                      {lote.lote}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Location Filter */}
            <div className="space-y-2 w-full">
              <Label htmlFor="locationFilter">Localización</Label>
              <Select value={locationFilter} onValueChange={setLocationFilter}>
                <SelectTrigger id="locationFilter" className="w-full">
                  <SelectValue placeholder="Todas las localizaciones" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc.location} value={loc.location}>
                      {loc.location}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Action Buttons */}
            <div className="flex items-end gap-2">
              <Button onClick={handleFilter} className="flex-1 gap-2">
                <Search className="h-4 w-4" />
                Buscar
              </Button>
              <Button onClick={handleClearFilters} variant="outline" className="flex-1 bg-transparent">
                Limpiar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Inventario por Estiba
            </div>
            <span className="text-sm font-normal text-muted-foreground">Total de registros: {inventory.length}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[600px] overflow-auto border rounded-lg">
            <Table>
              <TableHeader className="sticky top-0 bg-muted z-10">
                <TableRow>
                  <TableHead>ID QR</TableHead>
                  <TableHead>Código Producto</TableHead>
                  <TableHead>Nombre Producto</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead>Localización</TableHead>
                  <TableHead className="text-right">Stock Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Cargando...
                    </TableCell>
                  </TableRow>
                ) : inventory.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No se encontraron registros
                    </TableCell>
                  </TableRow>
                ) : (
                  inventory.map((item, index) => (
                    <TableRow key={`${item.idqr}-${item.lote}-${index}`}>
                      <TableCell className="font-medium">{item.idqr}</TableCell>
                      <TableCell>{item.codproducto}</TableCell>
                      <TableCell>{item.nombreproducto}</TableCell>
                      <TableCell>{item.lote}</TableCell>
                      <TableCell>{item.location}</TableCell>
                      <TableCell className="text-right font-medium">{item.stock_total.toLocaleString()}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
