"use client"

import { useState, useEffect } from "react"
import { getOrderDetails } from "@/lib/orders-actions"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2 } from "lucide-react"

interface OrderDetailsDialogProps {
  isOpen: boolean
  onClose: () => void
  idpedido: number
}

export function OrderDetailsDialog({ isOpen, onClose, idpedido }: OrderDetailsDialogProps) {
  const [details, setDetails] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isOpen && idpedido) {
      loadDetails()
    }
  }, [isOpen, idpedido])

  const loadDetails = async () => {
    setLoading(true)
    const result = await getOrderDetails(idpedido)
    if (result.success) {
      setDetails(result.data || [])
    }
    setLoading(false)
  }

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(
      val || 0,
    )
  }

  const formatDecimal = (val: number) => {
    return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(val || 0)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalle del Pedido #{idpedido}</DialogTitle>
        </DialogHeader>

        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Producto</TableHead>
                <TableHead className="text-xs">Categoría</TableHead>
                <TableHead className="text-xs text-right">Unidades</TableHead>
                <TableHead className="text-xs text-right">Precio Und</TableHead>
                <TableHead className="text-xs text-right">Subtotal</TableHead>
                <TableHead className="text-xs text-right">IVA</TableHead>
                <TableHead className="text-xs text-right">Desc. PP</TableHead>
                <TableHead className="text-xs text-right">Total Línea</TableHead>
                <TableHead className="text-xs text-right">Peso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : details.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center text-sm">
                    No hay detalles disponibles.
                  </TableCell>
                </TableRow>
              ) : (
                details.map((item) => (
                  <TableRow key={item.transid}>
                    <TableCell className="text-xs font-medium">{item.producto}</TableCell>
                    <TableCell className="text-xs">{item.categoria}</TableCell>
                    <TableCell className="text-xs text-right">{formatDecimal(item.unidades)}</TableCell>
                    <TableCell className="text-xs text-right">{formatCurrency(item.precio_und)}</TableCell>
                    <TableCell className="text-xs text-right">{formatCurrency(item.subtotal)}</TableCell>
                    <TableCell className="text-xs text-right">{formatCurrency(item.iva)}</TableCell>
                    <TableCell className="text-xs text-right">{formatCurrency(item.descuentopp)}</TableCell>
                    <TableCell className="text-xs text-right font-bold">{formatCurrency(item.total_linea)}</TableCell>
                    <TableCell className="text-xs text-right">{formatDecimal(item.peso)} kg</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  )
}
