"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, Package, Search } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { getOrderProductDetails } from "@/lib/bascula-actions"
import { useAuth } from "@/components/auth-provider"

interface ProductDetailRow {
  nombreproducto: string | null
  lote: string | null
  cantidad: number | null
}

interface BasculaOrderDetailsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  ordendecargue: string | null
  placa?: string | null
}

export function BasculaOrderDetailsDialog({
  open,
  onOpenChange,
  ordendecargue,
  placa,
}: BasculaOrderDetailsDialogProps) {
  const { selectedEmpresaId } = useAuth()
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<ProductDetailRow[]>([])
  const [search, setSearch] = useState("")

  useEffect(() => {
    if (!open || !ordendecargue) return

    let cancelled = false
    const load = async () => {
      setLoading(true)
      setSearch("")
      try {
        const result = await getOrderProductDetails(
          ordendecargue,
          selectedEmpresaId,
        )
        if (cancelled) return
        if (!result.success) {
          toast({
            title: "Error",
            description:
              result.error ||
              "No se pudo cargar el detalle de la orden.",
            variant: "destructive",
          })
          setRows([])
        } else {
          setRows((result.data as ProductDetailRow[]) || [])
        }
      } catch {
        if (!cancelled) {
          toast({
            title: "Error",
            description: "Error inesperado al cargar el detalle.",
            variant: "destructive",
          })
          setRows([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [open, ordendecargue, selectedEmpresaId])

  const filteredRows = rows.filter((r) => {
    if (!search) return true
    const needle = search.toLowerCase()
    return (
      (r.nombreproducto || "").toLowerCase().includes(needle) ||
      (r.lote || "").toLowerCase().includes(needle)
    )
  })

  const totalCantidad = rows.reduce(
    (acc, r) => acc + (Number(r.cantidad) || 0),
    0,
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Detalle de Orden de Cargue
          </DialogTitle>
          <DialogDescription>
            Orden:{" "}
            <span className="font-semibold text-foreground">
              {ordendecargue || "-"}
            </span>
            {placa ? (
              <>
                {" | "}Placa:{" "}
                <span className="font-semibold text-foreground">{placa}</span>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por producto o lote..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm bg-white"
          />
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto rounded-md border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs font-semibold">
                  Producto
                </TableHead>
                <TableHead className="text-xs font-semibold">Lote</TableHead>
                <TableHead className="text-xs font-semibold text-right">
                  Cantidad
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-24 text-center text-xs">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-24 text-center text-xs">
                    {rows.length === 0
                      ? "No se encontraron productos para esta orden."
                      : "Ningún producto coincide con la búsqueda."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.map((row, idx) => (
                  <TableRow key={`${row.nombreproducto}-${row.lote}-${idx}`}>
                    <TableCell className="text-xs">
                      {row.nombreproducto || "-"}
                    </TableCell>
                    <TableCell className="text-xs">{row.lote || "-"}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums">
                      {row.cantidad != null
                        ? Number(row.cantidad).toLocaleString("es-CO")
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Summary */}
        {!loading && rows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
            <div>
              <span className="text-muted-foreground">Líneas: </span>
              <span className="font-semibold text-foreground">
                {rows.length}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Cantidad total: </span>
              <span className="font-semibold text-foreground tabular-nums">
                {totalCantidad.toLocaleString("es-CO")}
              </span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
