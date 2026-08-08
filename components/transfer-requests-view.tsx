"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { getDispatchTransfers, generateUnloadOrder } from "@/lib/transfer-actions"
import { toast } from "@/hooks/use-toast"
import { FileDown } from "lucide-react"
import { useAuth } from "@/components/auth-provider"

interface DispatchTransfer {
  id: number
  ocargue: string
  placa: string
  creado: string
  nombreproducto: string
  idproducto: number
  codproducto: string
  lote: string
  cantidad: number
  tipoproducto?: string
  peso_unitkg?: number
  peso_linea?: number
}

interface OrderDetail {
  nombreproducto: string
  idproducto: number
  codproducto: string
  lote: string
  cantidad: number
  peso_unitkg: number
  pesoLinea: number
}

export function TransferRequestsView() {
  const { selectedEmpresaId } = useAuth()
  const [transfers, setTransfers] = useState<DispatchTransfer[]>([])
  const [uniqueOrders, setUniqueOrders] = useState<string[]>([])
  const [selectedOrder, setSelectedOrder] = useState<string>("")
  const [orderDetails, setOrderDetails] = useState<OrderDetail[]>([])
  const [headerInfo, setHeaderInfo] = useState<{
    placa: string
    fechaDespacho: string
    tipoProducto: string
    pesoTotal: number
  }>({
    placa: "",
    fechaDespacho: "",
    tipoProducto: "",
    pesoTotal: 0,
  })
  const [loading, setLoading] = useState(true)
  const [isGeneratingOrder, setIsGeneratingOrder] = useState(false)

  useEffect(() => {
    if (!selectedEmpresaId) return
    loadTransfers()
  }, [selectedEmpresaId])

  useEffect(() => {
    if (selectedOrder) {
      const details = transfers.filter((t) => t.ocargue === selectedOrder)

      const detailsWithWeight = details.map((d) => {
        const pesoUnitario = d.peso_unitkg || 0
        const pesoLinea = d.cantidad * pesoUnitario

        console.log(
          "[v0] Detail:",
          d.nombreproducto,
          "peso_unitkg:",
          d.peso_unitkg,
          "cantidad:",
          d.cantidad,
          "pesoLinea:",
          pesoLinea,
        )

        return {
          nombreproducto: d.nombreproducto,
          idproducto: d.idproducto,
          codproducto: d.codproducto,
          lote: d.lote,
          cantidad: d.cantidad,
          peso_unitkg: pesoUnitario,
          pesoLinea: pesoLinea,
        }
      })

      setOrderDetails(detailsWithWeight)

      const pesoTotal = detailsWithWeight.reduce((sum, detail) => sum + detail.pesoLinea, 0)
      console.log("[v0] Peso total calculated:", pesoTotal)

      if (details.length > 0) {
        setHeaderInfo({
          placa: details[0].placa,
          fechaDespacho: formatDate(details[0].creado),
          tipoProducto: details[0].tipoproducto || "N/A",
          pesoTotal: pesoTotal,
        })
      }
    }
  }, [selectedOrder, transfers])

  const loadTransfers = async () => {
    try {
      setLoading(true)
      console.log("[v0] TransferRequestsView: Loading transfers...")
      const data = await getDispatchTransfers(selectedEmpresaId ?? undefined)
      console.log("[v0] TransferRequestsView: Received data:", data.length, "records")
      console.log("[v0] TransferRequestsView: Sample transfer data:", data[0])
      setTransfers(data)

      const unique = Array.from(new Set(data.map((t) => t.ocargue))).sort()
      console.log("[v0] TransferRequestsView: Unique orders:", unique)
      setUniqueOrders(unique)

      if (unique.length > 0) {
        setSelectedOrder(unique[0])
      }
    } catch (error) {
      console.error("Error loading dispatch transfers:", error)
      toast({
        title: "Error",
        description: "No se pudieron cargar los despachos de traslado",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return ""
    const date = new Date(dateString)
    return date.toLocaleDateString("es-CO")
  }

  const handleGenerateUnloadOrder = async () => {
    if (!selectedOrder) {
      toast({
        title: "Error",
        description: "Debe seleccionar una orden de cargue primero",
        variant: "destructive",
      })
      return
    }

    setIsGeneratingOrder(true)
    try {
      const result = await generateUnloadOrder(selectedOrder, selectedEmpresaId ?? undefined)
      toast({
        title: "Éxito",
        description: `Orden de descargue ${result.ordendecargue} generada exitosamente`,
      })
      // Reload transfers to refresh the list
      await loadTransfers()
    } catch (error) {
      console.error("[v0] Error generating unload order:", error)
      toast({
        title: "Error",
        description: "Error al generar la orden de descargue",
        variant: "destructive",
      })
    } finally {
      setIsGeneratingOrder(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Solicitudes de Traslado</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Seleccionar Orden de Cargue</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedOrder} onValueChange={setSelectedOrder}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Seleccione una orden de cargue" />
            </SelectTrigger>
            <SelectContent>
              {uniqueOrders.map((order) => (
                <SelectItem key={order} value={order}>
                  {order}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedOrder && (
        <Card>
          <CardHeader>
            <CardTitle>Información de la Orden</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Placa</p>
                <p className="text-lg font-semibold">{headerInfo.placa}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Fecha de Despacho</p>
                <p className="text-lg font-semibold">{headerInfo.fechaDespacho}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tipo Producto</p>
                <p className="text-lg font-semibold">{headerInfo.tipoProducto}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Peso Total (kg)</p>
                <p className="text-lg font-semibold">{headerInfo.pesoTotal.toFixed(2)}</p>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={handleGenerateUnloadOrder} disabled={isGeneratingOrder} className="gap-2">
                <FileDown className="h-4 w-4" />
                {isGeneratingOrder ? "Generando..." : "Generar Orden de Descargue"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {selectedOrder && (
        <Card>
          <CardHeader>
            <CardTitle>Detalle de Productos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre Producto</TableHead>
                    <TableHead>ID Producto</TableHead>
                    <TableHead>Código Producto</TableHead>
                    <TableHead>Lote</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">Peso Línea (kg)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center">
                        Cargando...
                      </TableCell>
                    </TableRow>
                  ) : orderDetails.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center">
                        No se encontraron productos para esta orden
                      </TableCell>
                    </TableRow>
                  ) : (
                    orderDetails.map((detail, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{detail.nombreproducto}</TableCell>
                        <TableCell>{detail.idproducto}</TableCell>
                        <TableCell>{detail.codproducto}</TableCell>
                        <TableCell>{detail.lote}</TableCell>
                        <TableCell className="text-right">{detail.cantidad}</TableCell>
                        <TableCell className="text-right">{detail.pesoLinea.toFixed(2)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
