"use client"

import { CommandEmpty } from "@/components/ui/command"
import { useAuth } from "@/components/auth-provider"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandList, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "@/components/ui/use-toast"
import { Loader2, Plus, X } from "lucide-react"
import { createClient } from "@/lib/supabase-client"
import { generateDistributionOrder } from "@/lib/orders-actions"
import { getVehiclesForDistribution } from "@/lib/vehicle-actions"

interface Vehicle {
  id: number
  placa: string
  nombreconductor: string
  transporte: string
}

interface Transport {
  id: number
  nombretransporte: string
}

interface Product {
  id: number
  nombre: string
  peso_unitkg?: number
  pesobruto?: number
}

interface DistributionOrderLine {
  id: string
  producto: Product | null
  cantidad: number
  pesoUnitkg: number
  pesoTotal: number
  pesoBrutoUnit: number
  pesoBrutoTotal: number
}

interface DistributionOrderData {
  fechaDistribucion: string
  placaVehiculo: string
  transporte: Transport | null
  tiquete: string
  numeroOrden: string
  pesoBascula: number
  lineas: DistributionOrderLine[]
}

export function GenerateDistributionOrders() {
  const { selectedEmpresaId } = useAuth()
  const [transports, setTransports] = useState<Transport[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [openProductCombobox, setOpenProductCombobox] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [orderData, setOrderData] = useState<DistributionOrderData>({
    fechaDistribucion: new Date().toISOString().split("T")[0],
    placaVehiculo: "",
    transporte: null,
    tiquete: "",
    numeroOrden: "",
    pesoBascula: 0,
    lineas: [],
  })

  // Fetch transports and products when empresa changes
  useEffect(() => {
    if (selectedEmpresaId) {
      loadTransportsAndProducts()
    }
  }, [selectedEmpresaId])

  const loadTransportsAndProducts = async () => {
    try {
      setLoading(true)
      const supabase = await createClient()

      // Fetch transports
      const { data: transportesData, error: transportError } = await supabase
        .from("transportes")
        .select("id, nombretransporte")

      if (!transportError && transportesData) {
        setTransports(transportesData as Transport[])
      }

      // Fetch products
      const { data: productosData, error: productError } = await supabase
        .from("productos")
        .select("id, nombre, peso_unitkg, pesobruto")

      if (!productError && productosData) {
        setProducts(productosData as Product[])
      }

      // Fetch vehicles for distribution from citasvehiculos
      const vehiclesResult = await getVehiclesForDistribution()
      if (vehiclesResult.success && vehiclesResult.data) {
        setVehicles(vehiclesResult.data as Vehicle[])
      }

      if (transportError || productError) {
        console.error("[v0] Error loading data:", transportError, productError)
        toast({
          title: "Error",
          description: "Error al cargar transportes y productos",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("[v0] Error loading transports and products:", error)
      toast({
        title: "Error",
        description: "Error al cargar transportes y productos",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const addProductLine = () => {
    const newLine: DistributionOrderLine = {
      id: Math.random().toString(36).substr(2, 9),
      producto: null,
      cantidad: 0,
      pesoUnitkg: 0,
      pesoTotal: 0,
      pesoBrutoUnit: 0,
      pesoBrutoTotal: 0,
    }

    setOrderData((prev) => ({
      ...prev,
      lineas: [...prev.lineas, newLine],
    }))
  }

  const removeProductLine = (lineId: string) => {
    setOrderData((prev) => ({
      ...prev,
      lineas: prev.lineas.filter((line) => line.id !== lineId),
    }))
  }

  const updateProductLine = (lineId: string, producto: Product) => {
    setOrderData((prev) => ({
      ...prev,
      lineas: prev.lineas.map((line) => {
        if (line.id === lineId) {
          const newPesoUnitkg = producto.peso_unitkg || 0
          const newPesoBrutoUnit = producto.pesobruto || 0
          const newPesoTotal = line.cantidad * newPesoUnitkg
          const newPesoBrutoTotal = line.cantidad * newPesoBrutoUnit
          return {
            ...line,
            producto,
            pesoUnitkg: newPesoUnitkg,
            pesoTotal: newPesoTotal,
            pesoBrutoUnit: newPesoBrutoUnit,
            pesoBrutoTotal: newPesoBrutoTotal,
          }
        }
        return line
      }),
    }))
  }

  const updateQuantity = (lineId: string, cantidad: number) => {
    setOrderData((prev) => ({
      ...prev,
      lineas: prev.lineas.map((line) => {
        if (line.id === lineId) {
          const newPesoTotal = cantidad * line.pesoUnitkg
          const newPesoBrutoTotal = cantidad * line.pesoBrutoUnit
          return {
            ...line,
            cantidad,
            pesoTotal: newPesoTotal,
            pesoBrutoTotal: newPesoBrutoTotal,
          }
        }
        return line
      }),
    }))
  }

  const getTotalPesoBruto = () => {
    return orderData.lineas.reduce((sum, line) => sum + line.pesoBrutoTotal, 0)
  }

  const getTotalPeso = () => {
    return orderData.lineas.reduce((sum, line) => sum + line.pesoTotal, 0)
  }

  const handleSaveOrder = async () => {
    if (!orderData.placaVehiculo.trim()) {
      toast({
        title: "Error",
        description: "Por favor ingrese la placa del vehículo",
        variant: "destructive",
      })
      return
    }

    if (!orderData.transporte) {
      toast({
        title: "Error",
        description: "Por favor seleccione un transporte",
        variant: "destructive",
      })
      return
    }

    if (orderData.lineas.length === 0) {
      toast({
        title: "Error",
        description: "Por favor agregue al menos un producto a la orden",
        variant: "destructive",
      })
      return
    }

    const lineasConProducto = orderData.lineas.filter((line) => line.producto && line.cantidad > 0)

    if (lineasConProducto.length === 0) {
      toast({
        title: "Error",
        description: "Por favor agregue productos con cantidad mayor a cero",
        variant: "destructive",
      })
      return
    }

    try {
      setSaving(true)

      const result = await generateDistributionOrder({
        fechaDistribucion: orderData.fechaDistribucion,
        placa: orderData.placaVehiculo,
        transporte: orderData.transporte!.nombretransporte,
        tiquete: orderData.tiquete,
        numeroOrden: orderData.numeroOrden,
        pesoBascula: orderData.pesoBascula,
        lineas: lineasConProducto.map((line) => ({
          id: line.id,
          producto: line.producto ?? undefined,
          cantidad: line.cantidad,
          pesoBrutoTotal: line.pesoBrutoTotal,
        })),
        pesoTotalOrden: getTotalPeso(),
        pesoBrutoTotalOrden: getTotalPesoBruto(),
      })

      if (result.success) {
        toast({
          title: "Éxito",
          description: result.message,
        })

        // Reset form
        setOrderData({
          fechaDistribucion: new Date().toISOString().split("T")[0],
          placaVehiculo: "",
          transporte: null,
          tiquete: "",
          numeroOrden: "",
          pesoBascula: 0,
          lineas: [],
        })

        // Reload vehicles to remove the processed one from the list
        const vehiclesResult = await getVehiclesForDistribution()
        if (vehiclesResult.success && vehiclesResult.data) {
          setVehicles(vehiclesResult.data as Vehicle[])
        }
      } else {
        toast({
          title: "Error",
          description: result.message,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("[v0] Error saving distribution order:", error)
      toast({
        title: "Error",
        description: "Error al guardar la orden",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Generar Orden de Distribución</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Header Information */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fecha-distribucion">Fecha de Distribución</Label>
              <Input
                id="fecha-distribucion"
                type="date"
                value={orderData.fechaDistribucion}
                onChange={(e) =>
                  setOrderData((prev) => ({
                    ...prev,
                    fechaDistribucion: e.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="placa-vehiculo">Placa del Vehículo</Label>
              <Select
                value={orderData.placaVehiculo}
                onValueChange={(value) => {
                  const selectedVehicle = vehicles.find(v => v.placa === value)
                  setOrderData((prev) => ({
                    ...prev,
                    placaVehiculo: value,
                    // Auto-fill transport if vehicle has one
                    transporte: selectedVehicle?.transporte 
                      ? transports.find(t => t.nombretransporte === selectedVehicle.transporte) || prev.transporte
                      : prev.transporte,
                  }))
                }}
              >
                <SelectTrigger id="placa-vehiculo">
                  <SelectValue placeholder="Seleccionar placa" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.length === 0 ? (
                    <SelectItem value="_empty" disabled>No hay vehículos disponibles</SelectItem>
                  ) : (
                    vehicles.map((vehicle) => (
                      <SelectItem key={vehicle.id} value={vehicle.placa}>
                        {vehicle.placa} - {vehicle.nombreconductor || "Sin conductor"}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="transporte">Transporte</Label>
              <Select 
                value={orderData.transporte?.id.toString() || ""} 
                onValueChange={(value) => {
                  const selected = transports.find(t => t.id.toString() === value)
                  setOrderData((prev) => ({ ...prev, transporte: selected || null }))
                }}
              >
                <SelectTrigger id="transporte">
                  <SelectValue placeholder="Seleccionar empresa" />
                </SelectTrigger>
                <SelectContent>
                  {transports.map((transport) => (
                    <SelectItem key={transport.id} value={transport.id.toString()}>
                      {transport.nombretransporte}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tiquete">Tiquete</Label>
              <Input
                id="tiquete"
                placeholder="Ingrese número de tiquete"
                value={orderData.tiquete}
                onChange={(e) =>
                  setOrderData((prev) => ({
                    ...prev,
                    tiquete: e.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="numero-orden">Número de Orden</Label>
              <Input
                id="numero-orden"
                placeholder="Ingrese número de orden"
                value={orderData.numeroOrden}
                onChange={(e) =>
                  setOrderData((prev) => ({
                    ...prev,
                    numeroOrden: e.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="peso-bascula">Peso Báscula (ton)</Label>
              <Input
                id="peso-bascula"
                type="number"
                step="0.001"
                placeholder="Ingrese peso báscula en toneladas"
                value={orderData.pesoBascula === 0 ? "" : orderData.pesoBascula}
                onChange={(e) =>
                  setOrderData((prev) => ({
                    ...prev,
                    pesoBascula: e.target.value ? parseFloat(e.target.value) : 0,
                  }))
                }
              />
            </div>
          </div>

          {/* Products Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Productos</h3>
              <Button onClick={addProductLine} size="sm" variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                Agregar Producto
              </Button>
            </div>

            {orderData.lineas.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No hay productos agregados. Agregue productos con el botón arriba.</p>
            ) : (
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="w-24">Cantidad</TableHead>
                      <TableHead className="w-24">Peso Unit. (kg)</TableHead>
                      <TableHead className="w-28">Peso Total (kg)</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderData.lineas.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>
                          <Popover
                            open={openProductCombobox[line.id] || false}
                            onOpenChange={(open) =>
                              setOpenProductCombobox((prev) => ({
                                ...prev,
                                [line.id]: open,
                              }))
                            }
                          >
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                className={cn(
                                  "w-full justify-between",
                                  !line.producto && "text-muted-foreground"
                                )}
                              >
                                {line.producto ? line.producto.nombre : "Seleccionar producto..."}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-full p-0">
                              <Command>
                                <CommandInput placeholder="Buscar producto..." />
                                <CommandList>
                                  <CommandEmpty>No se encontró producto.</CommandEmpty>
                                  <CommandGroup>
                                    {products.map((product) => (
                                      <CommandItem
                                        value={product.nombre}
                                        key={product.id}
                                        onSelect={() => {
                                          updateProductLine(line.id, product)
                                          setOpenProductCombobox((prev) => ({
                                            ...prev,
                                            [line.id]: false,
                                          }))
                                        }}
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-4 w-4",
                                            line.producto?.id === product.id ? "opacity-100" : "opacity-0"
                                          )}
                                        />
                                        {product.nombre}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.cantidad || ""}
                            onChange={(e) => updateQuantity(line.id, parseFloat(e.target.value) || 0)}
                            className="w-full"
                          />
                        </TableCell>
                        <TableCell className="text-right">{line.pesoUnitkg.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-semibold">{line.pesoTotal.toFixed(2)}</TableCell>
                        <TableCell>
                          <Button
                            onClick={() => removeProductLine(line.id)}
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Total Weight: la suma del detalle (peso_unitkg del catalogo) viene
                en kg por linea, pero se muestra y registra directamente en toneladas. */}
            {orderData.lineas.length > 0 && (
              <div className="flex justify-end pt-4">
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Peso Total Orden</p>
                  <p className="text-2xl font-bold">{(getTotalPeso() / 1000).toFixed(3)} ton</p>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 justify-end pt-6">
            <Button variant="outline" onClick={() => window.history.back()}>
              Cancelar
            </Button>
            <Button onClick={handleSaveOrder} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {saving ? "Guardando..." : "Guardar Orden"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
