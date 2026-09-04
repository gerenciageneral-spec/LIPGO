"use client"
import { useState, useEffect } from "react"
import { updateOrder, updateOrderDetails, getOrderDetails } from "@/lib/orders-actions"
import {
  getVendedores,
  getClientes,
  getBodegasByCliente,
  getCondicionesPago,
  getTiposDespacho,
  getCategorias,
  getProductos,
  getProductWeight,
  type Bodega,
  type Cliente,
} from "@/lib/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DatePickerField } from "@/components/ui/date-picker-field"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Plus, Trash2, ArrowLeft } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { useAuth } from "@/components/auth-provider"

interface OrderEditPageProps {
  order: any
  onSave: () => void
  onCancel: () => void
}

interface ProductLine {
  id: string
  transid?: number
  categoria: string
  producto: string
  cantidad: number
  precioUnitario: number
  totalLinea: number
  descuentoIVA: number
  descuentoPP: number
  subtotal: number
  peso: number
  peso_unitkg?: number
}

function OrderEditPage({ order, onSave, onCancel }: OrderEditPageProps) {
  // Proyecto activo del selector global — mismo criterio que order-entry-form.tsx,
  // sin esto getClientes() caia a la empresa del PERFIL del usuario.
  const { selectedEmpresaId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [orderData, setOrderData] = useState<any>(null)

  // Header fields
  const [fechaPedido, setFechaPedido] = useState("")
  const [fechaProgramada, setFechaProgramada] = useState("")
  const [selectedVendedor, setSelectedVendedor] = useState("")
  const [empresa, setEmpresa] = useState("")
  const [selectedCliente, setSelectedCliente] = useState("")
  const [selectedClienteId, setSelectedClienteId] = useState<number | null>(null)
  const [selectedBodega, setSelectedBodega] = useState("")
  const [destino, setDestino] = useState("")
  const [direccion, setDireccion] = useState("")
  const [condicionPago, setCondicionPago] = useState("")
  const [tipoDespacho, setTipoDespacho] = useState("")
  const [ordenCompra, setOrdenCompra] = useState("")
  const [nPedido, setNPedido] = useState("")
  const [pedido, setPedido] = useState("")
  const [observaciones, setObservaciones] = useState("")

  // Discount settings
  const [aplicarDescuentoIVA, setAplicarDescuentoIVA] = useState(false)
  const [aplicarDescuentoPP, setAplicarDescuentoPP] = useState(false)
  const [descuentoPPPercent, setDescuentoPPPercent] = useState<number | string>("")

  // Product lines
  const [products, setProducts] = useState<ProductLine[]>([])

  // Dropdown data
  const [vendedores, setVendedores] = useState<{ nombre: string }[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [bodegas, setBodegas] = useState<Bodega[]>([])
  const [condicionesPagoList, setCondicionesPagoList] = useState<{ nombrecondicion: string }[]>([])
  const [tiposDespachoList, setTiposDespachoList] = useState<{ nombretipodespacho: string }[]>([])
  const [categorias, setCategorias] = useState<{ nombre: string }[]>([])
  const [allProductos, setAllProductos] = useState<{ nombre: string; categoria: string; peso_unitkg?: number }[]>([])

  useEffect(() => {
    loadData()
  }, [order, selectedEmpresaId])

  const loadData = async () => {
    setLoading(true)
    try {
      // Load all dropdowns in parallel
      const [vendedoresData, clientesData, condicionesData, tiposData, categoriasData, productosData, detailsResult] =
        await Promise.all([
          getVendedores(),
          getClientes(selectedEmpresaId ?? undefined),
          getCondicionesPago(),
          getTiposDespacho(),
          getCategorias(),
          getProductos(),
          getOrderDetails(order.idpedido),
        ])

      setVendedores(vendedoresData)
      setClientes(clientesData)
      setCondicionesPagoList(condicionesData)
      setTiposDespachoList(tiposData)
      setCategorias(categoriasData)
      setAllProductos(productosData)

      if (order) {
        setFechaPedido(order.fecha ? order.fecha.split("T")[0] : "")
        setFechaProgramada(order.fecha_programada ? order.fecha_programada.split("T")[0] : "")
        setSelectedVendedor(order.vendedor || "")
        setEmpresa(order.empresa || "")
        setSelectedCliente(order.cliente || "")
        setSelectedBodega(order.bodega || "")
        setDestino(order.destino || "")
        setDireccion(order.direccion || "")
        setCondicionPago(order.condicion_pago || "")
        setTipoDespacho(order.tipodespacho || "")
        setOrdenCompra(order.orden_de_compra || "")
        setNPedido(order.npedido || "")
        console.log("[v0] Initializing pedido state with:", order.pedido)
        setPedido(order.pedido || "")
        setObservaciones(order.observaciones || "")

        const clienteFound = clientesData.find((c) => c.nombre === order.cliente)
        if (clienteFound) {
          setSelectedClienteId(clienteFound.id)
          const bodegasData = await getBodegasByCliente(clienteFound.id)
          setBodegas(bodegasData)
        }

        if (order.descuentoiva && order.descuentoiva > 0) {
          setAplicarDescuentoIVA(true)
        }
        if (order.descuentopp && order.descuentopp > 0) {
          setAplicarDescuentoPP(true)
          if (detailsResult.success && detailsResult.data && detailsResult.data.length > 0) {
            const firstDetail = detailsResult.data[0]
            if (firstDetail.total_linea && firstDetail.total_linea > 0) {
              const percent = (firstDetail.descuentopp / firstDetail.total_linea) * 100
              setDescuentoPPPercent(percent.toFixed(2))
            }
          }
        }
      }

      if (detailsResult.success && detailsResult.data) {
        const loadedProducts: ProductLine[] = detailsResult.data.map((detail: any) => ({
          id: detail.transid.toString(),
          transid: detail.transid,
          categoria: detail.categoria || "",
          producto: detail.producto || "",
          cantidad: detail.unidades || 0,
          precioUnitario: detail.precio_und || 0,
          totalLinea: detail.total_linea || 0,
          descuentoIVA: detail.iva || 0,
          descuentoPP: detail.descuentopp || 0,
          subtotal: detail.subtotal || 0,
          peso: detail.peso || 0,
          peso_unitkg: detail.peso_unitkg || 0,
        }))
        setProducts(loadedProducts)
      }
    } catch (error) {
      console.error("Error loading order data:", error)
      toast({
        title: "Error",
        description: "No se pudo cargar la información del pedido.",
        variant: "destructive",
      })
    }
    setLoading(false)
  }

  useEffect(() => {
    if (selectedClienteId) {
      loadBodegas()
    } else {
      setBodegas([])
      setSelectedBodega("")
    }
  }, [selectedClienteId])

  const loadBodegas = async () => {
    if (!selectedClienteId) return
    const bodegasData = await getBodegasByCliente(selectedClienteId)
    setBodegas(bodegasData)
  }

  useEffect(() => {
    if (selectedBodega) {
      const bodega = bodegas.find((b) => b.nombrebodega === selectedBodega)
      if (bodega) {
        setDestino(bodega.ciudad)
        setDireccion(bodega.direccion)
      }
    }
  }, [selectedBodega, bodegas])

  const calculateRowValues = (product: ProductLine) => {
    const totalLinea = (product.cantidad || 0) * (product.precioUnitario || 0)
    const descuentoIVA = aplicarDescuentoIVA ? totalLinea * 0.05 : 0
    const ppPercent = typeof descuentoPPPercent === "number" ? descuentoPPPercent : Number(descuentoPPPercent) || 0
    const descuentoPP = aplicarDescuentoPP && ppPercent > 0 ? totalLinea * (ppPercent / 100) : 0
    const subtotal = totalLinea - descuentoIVA - descuentoPP

    return { totalLinea, descuentoIVA, descuentoPP, subtotal }
  }

  const calculateTotals = () => {
    let totalOrden = 0
    let descuentoIVATotal = 0
    let descuentoPPTotal = 0
    let totalPagar = 0
    let pesoTotal = 0

    products.forEach((product) => {
      const { totalLinea, descuentoIVA, descuentoPP, subtotal } = calculateRowValues(product)
      totalOrden += totalLinea
      descuentoIVATotal += descuentoIVA
      descuentoPPTotal += descuentoPP
      totalPagar += subtotal
      pesoTotal += product.peso || 0
    })

    return { totalOrden, descuentoIVATotal, descuentoPPTotal, totalPagar, pesoTotal }
  }

  const totals = calculateTotals()

  const addProductLine = () => {
    const newProduct: ProductLine = {
      id: Date.now().toString(),
      categoria: "",
      producto: "",
      cantidad: 0,
      precioUnitario: 0,
      totalLinea: 0,
      descuentoIVA: 0,
      descuentoPP: 0,
      subtotal: 0,
      peso: 0,
    }
    setProducts([...products, newProduct])
  }

  const removeProductLine = (id: string) => {
    setProducts(products.filter((p) => p.id !== id))
  }

  const updateProductLine = (id: string, field: keyof ProductLine, value: any) => {
    setProducts((prevProducts) => {
      const updatedProducts = prevProducts.map((p) => {
        if (p.id === id) {
          const updated = { ...p, [field]: value }

          // Reset product when category changes
          if (field === "categoria") {
            updated.producto = ""
          }

          // Recalculate weight only if we have the necessary data
          if (field === "cantidad" && updated.peso_unitkg) {
            updated.peso = updated.peso_unitkg * (value || 0)
          }

          // If changing product, fetch weight asynchronously
          if (field === "producto") {
            // Get product data
            const productoData = allProductos.find((p) => p.nombre === value)
            if (productoData) {
              updated.categoria = productoData.categoria
              // Fetch weight asynchronously without blocking
              getProductWeight(value).then((peso_unitkg) => {
                setProducts((prev) =>
                  prev.map((prod) =>
                    prod.id === id
                      ? {
                          ...prod,
                          peso_unitkg,
                          peso: peso_unitkg * (prod.cantidad || 0),
                        }
                      : prod,
                  ),
                )
              })
            }
          }

          // Calculate row values
          const calculated = calculateRowValues(updated)
          updated.totalLinea = calculated.totalLinea
          updated.descuentoIVA = calculated.descuentoIVA
          updated.descuentoPP = calculated.descuentoPP
          updated.subtotal = calculated.subtotal

          return updated
        }
        return p
      })

      return updatedProducts
    })
  }

  useEffect(() => {
    setProducts((prevProducts) =>
      prevProducts.map((product) => {
        const calculated = calculateRowValues(product)
        return {
          ...product,
          totalLinea: calculated.totalLinea,
          descuentoIVA: calculated.descuentoIVA,
          descuentoPP: calculated.descuentoPP,
          subtotal: calculated.subtotal,
        }
      }),
    )
  }, [aplicarDescuentoIVA, aplicarDescuentoPP, descuentoPPPercent])

  const getFilteredProducts = (categoria: string) => {
    return allProductos.filter((p) => p.categoria === categoria).map((p) => p.nombre)
  }

  const handleSave = async () => {
    if (!selectedVendedor || !selectedCliente || !empresa || !pedido) {
      toast({
        title: "Error",
        description: "Por favor complete los campos requeridos: Vendedor, Cliente, Empresa, Pedido.",
        variant: "destructive",
      })
      return
    }

    if (products.length === 0) {
      toast({
        title: "Error",
        description: "Debe agregar al menos un producto.",
        variant: "destructive",
      })
      return
    }

    setSaving(true)
    try {
      console.log("[v0] Starting order update for orderId:", order.idpedido)

      const headerData = {
        fecha: fechaPedido,
        fecha_programada: fechaProgramada,
        vendedor: selectedVendedor,
        cliente: selectedCliente,
        destino,
        direccion,
        empresa,
        medio: selectedBodega,
        condicion_pago: condicionPago,
        orden_de_compra: ordenCompra,
        pedido: nPedido,
        total_linea: totals.totalOrden,
        descuentoiva: totals.descuentoIVATotal,
        descuentopp: totals.descuentoPPTotal,
        total_pagar: totals.totalPagar,
        tipo_despacho: tipoDespacho,
        observaciones,
      }

      console.log("[v0] Updating header with data:", headerData)
      const headerResult = await updateOrder(order.idpedido, headerData)

      if (!headerResult.success) {
        throw new Error("Error al actualizar cabecera")
      }
      console.log("[v0] Header updated successfully")

      console.log("[v0] Updating order details via server action")
      const detailsResult = await updateOrderDetails(order.idpedido, products)

      if (!detailsResult.success) {
        throw new Error(detailsResult.message || "Error al actualizar detalles")
      }
      console.log("[v0] Details updated successfully")

      console.log("[v0] Generating PDF for updated order...")

      // Find cliente and bodega data
      const clienteData = clientes.find((c) => c.nombre === selectedCliente)
      const bodegaData = bodegas.find((b) => b.nombrebodega === selectedBodega)

      // Group products by category for PDF
      const groupedProducts: { [key: string]: any[] } = {}
      products.forEach((product) => {
        const categoria = product.categoria || "Sin categoría"
        if (!groupedProducts[categoria]) {
          groupedProducts[categoria] = []
        }
        groupedProducts[categoria].push({
          referencia: product.producto,
          precioUnitario: product.precioUnitario,
          cantidad: product.cantidad,
          peso: product.peso || 0,
        })
      })

      const pdfData = {
        nit: "900123456-7", // You may want to fetch this from config
        carrera: "Cra 7 #123-45",
        fechaPedido: fechaPedido,
        sucursalMolinos: bodegaData?.nombrebodega || selectedBodega,
        nitCliente: clienteData?.nit || "",
        nombreCliente: selectedCliente,
        direccionEntrega: direccion,
        ciudadEntrega: destino,
        asesorComercial: selectedVendedor,
        fechaEntrega: fechaProgramada,
        condicionPago: condicionPago,
        tipoDespacho: tipoDespacho,
        groupedProducts,
        totalOrden: totals.totalOrden,
        descuentoIVA: totals.descuentoIVATotal,
        descuentoPP: totals.descuentoPPTotal,
        totalPagar: totals.totalPagar,
        kgDespacho: totals.pesoTotal,
        observaciones: observaciones || "",
      }

      const { generateAndUploadOrderPDF } = await import("@/lib/pdf-actions")
      const pdfResult = await generateAndUploadOrderPDF(pdfData as any, order.idpedido)

      if (!pdfResult.success || !pdfResult.url) {
        console.error("[v0] Error generating PDF:", pdfResult.error)
        throw new Error("Error al generar el PDF")
      }

      console.log("[v0] PDF generated successfully:", pdfResult.url)

      // Update pdfpedido field with new URL
      const { updateOrderPDFUrl } = await import("@/lib/orders-actions")
      const updatePDFResult = await updateOrderPDFUrl(order.idpedido, pdfResult.url)

      if (!updatePDFResult.success) {
        console.error("[v0] Error updating PDF URL:", updatePDFResult.message)
        // Don't fail the entire operation if PDF URL update fails
      }

      // Auto-download the PDF
      const link = document.createElement("a")
      link.href = pdfResult.url
      link.download = `pedido-${order.idpedido}-actualizado.pdf`
      link.target = "_blank"
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      console.log("[v0] PDF downloaded successfully")

      toast({
        title: "Éxito",
        description: "Pedido actualizado correctamente y PDF generado",
      })

      // Return to orders management
      onSave()
    } catch (error) {
      console.error("[v0] Error saving order:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al guardar el pedido",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(
      val || 0,
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" onClick={onCancel} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Button>
        <h2 className="text-xl font-bold">Editar Pedido #{order.idpedido}</h2>
      </div>

      <div className="space-y-6">
        {/* Header Fields */}
        <div className="border rounded-lg p-4 space-y-4 bg-white">
          <h3 className="font-semibold text-sm">Información del Pedido</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label className="text-[10px]">
                Fecha del Pedido <span className="text-red-500">*</span>
              </Label>
              <DatePickerField
                value={fechaPedido}
                onChange={setFechaPedido}
                className="text-[10px] h-7"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[10px]">
                Fecha Programada <span className="text-red-500">*</span>
              </Label>
              <DatePickerField
                value={fechaProgramada}
                onChange={setFechaProgramada}
                className="text-[10px] h-7"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[10px]">
                Pedido <span className="text-red-500">*</span>
              </Label>
              <Input
                value={pedido}
                onChange={(e) => setPedido(e.target.value)}
                className="text-[10px] h-7"
                placeholder="Número de pedido"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[10px]">
                Vendedor <span className="text-red-500">*</span>
              </Label>
              <Select value={selectedVendedor} onValueChange={setSelectedVendedor}>
                <SelectTrigger className="text-[10px] h-7 w-full truncate">
                  <SelectValue placeholder="Seleccione vendedor" />
                </SelectTrigger>
                <SelectContent>
                  {vendedores.map((v) => (
                    <SelectItem key={v.nombre} value={v.nombre} className="text-xs">
                      {v.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px]">
                Empresa <span className="text-red-500">*</span>
              </Label>
              <Select value={empresa} onValueChange={setEmpresa}>
                <SelectTrigger className="text-[10px] h-7 w-full truncate">
                  <SelectValue placeholder="Seleccione empresa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="indupan" className="text-xs">
                    Indupan
                  </SelectItem>
                  <SelectItem value="frigomeat" className="text-xs">
                    Frigomeat
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px]">
                Cliente <span className="text-red-500">*</span>
              </Label>
              <Select
                value={selectedCliente}
                onValueChange={(val) => {
                  setSelectedCliente(val)
                  const cliente = clientes.find((c) => c.nombre === val)
                  setSelectedClienteId(cliente?.id || null)
                }}
              >
                <SelectTrigger className="text-[10px] h-7 w-full truncate">
                  <SelectValue placeholder="Seleccione cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.nombre} className="text-xs">
                      {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px]">
                Sucursal <span className="text-red-500">*</span>
              </Label>
              <Select value={selectedBodega} onValueChange={setSelectedBodega} disabled={!selectedClienteId}>
                <SelectTrigger className="text-[10px] h-7 w-full truncate">
                  <SelectValue placeholder="Seleccione sucursal" />
                </SelectTrigger>
                <SelectContent>
                  {bodegas.map((b) => (
                    <SelectItem key={b.idbodega} value={b.nombrebodega} className="text-xs">
                      {b.nombrebodega}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px]">Destino</Label>
              <Input
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                placeholder="Campo Automático"
                className="text-[10px] h-7"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[10px]">Dirección</Label>
              <Input
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
                placeholder="Campo Automático"
                className="text-[10px] h-7"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[10px]">Condición de Pago</Label>
              <Select value={condicionPago} onValueChange={setCondicionPago}>
                <SelectTrigger className="text-[10px] h-7 w-full truncate">
                  <SelectValue placeholder="Seleccione condición" />
                </SelectTrigger>
                <SelectContent>
                  {condicionesPagoList.map((cp) => (
                    <SelectItem key={cp.nombrecondicion} value={cp.nombrecondicion} className="text-xs">
                      {cp.nombrecondicion}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px]">Tipo de Despacho</Label>
              <Select value={tipoDespacho} onValueChange={setTipoDespacho}>
                <SelectTrigger className="text-[10px] h-7 w-full truncate">
                  <SelectValue placeholder="Seleccione tipo" />
                </SelectTrigger>
                <SelectContent>
                  {tiposDespachoList.map((td) => (
                    <SelectItem key={td.nombretipodespacho} value={td.nombretipodespacho} className="text-xs">
                      {td.nombretipodespacho}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px]">Orden de Compra</Label>
              <Input
                value={ordenCompra}
                onChange={(e) => setOrdenCompra(e.target.value)}
                className="text-[10px] h-7"
                placeholder="Opcional"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[10px]">N° Pedido</Label>
              <Input
                value={nPedido}
                onChange={(e) => setNPedido(e.target.value)}
                className="text-[10px] h-7"
                placeholder="Opcional"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px]">Observaciones</Label>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              className="w-full min-h-[60px] text-[10px] border rounded-md p-2"
              placeholder="Observaciones adicionales"
            />
          </div>
        </div>

        {/* Discount Options */}
        <div className="border rounded-lg p-4 space-y-3 bg-white">
          <h3 className="font-semibold text-sm">Opciones de Descuento</h3>
          <div className="flex flex-col gap-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="descuento-iva"
                checked={aplicarDescuentoIVA}
                onCheckedChange={(checked) => setAplicarDescuentoIVA(!!checked)}
              />
              <Label htmlFor="descuento-iva" className="text-xs cursor-pointer">
                Aplicar Descuento IVA (5%)
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="descuento-pp"
                checked={aplicarDescuentoPP}
                onCheckedChange={(checked) => setAplicarDescuentoPP(!!checked)}
              />
              <Label htmlFor="descuento-pp" className="text-xs cursor-pointer">
                Aplicar Descuento Pronto Pago
              </Label>
              {aplicarDescuentoPP && (
                <Input
                  type="number"
                  value={descuentoPPPercent}
                  onChange={(e) => setDescuentoPPPercent(e.target.value)}
                  placeholder="% Descuento"
                  className="text-xs h-7 w-24 ml-2"
                  step="0.01"
                  min="0"
                  max="100"
                />
              )}
            </div>
          </div>
        </div>

        {/* Products Table */}
        <div className="border rounded-lg p-4 space-y-3 bg-white">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-sm">Productos</h3>
            <Button onClick={addProductLine} size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Agregar Producto
            </Button>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Categoría</TableHead>
                  <TableHead className="text-xs">Producto</TableHead>
                  <TableHead className="text-xs">Cantidad</TableHead>
                  <TableHead className="text-xs">Precio Unit.</TableHead>
                  <TableHead className="text-xs">Total Línea</TableHead>
                  <TableHead className="text-xs">Desc. IVA</TableHead>
                  <TableHead className="text-xs">Desc. P.P.</TableHead>
                  <TableHead className="text-xs">Subtotal</TableHead>
                  <TableHead className="text-xs">Peso (kg)</TableHead>
                  <TableHead className="text-xs"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <Select
                        value={product.categoria}
                        onValueChange={(val) => updateProductLine(product.id, "categoria", val)}
                      >
                        <SelectTrigger className="text-xs h-7 w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {categorias.map((cat) => (
                            <SelectItem key={cat.nombre} value={cat.nombre} className="text-xs">
                              {cat.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={product.producto}
                        onValueChange={(val) => updateProductLine(product.id, "producto", val)}
                        disabled={!product.categoria}
                      >
                        <SelectTrigger className="text-xs h-7 w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {getFilteredProducts(product.categoria).map((prod) => (
                            <SelectItem key={prod} value={prod} className="text-xs">
                              {prod}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={product.cantidad || ""}
                        onChange={(e) => updateProductLine(product.id, "cantidad", Number(e.target.value))}
                        className="text-xs h-7 w-20"
                        min="0"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={product.precioUnitario || ""}
                        onChange={(e) => updateProductLine(product.id, "precioUnitario", Number(e.target.value))}
                        className="text-xs h-7 w-24"
                        min="0"
                      />
                    </TableCell>
                    <TableCell className="text-xs">{formatCurrency(product.totalLinea)}</TableCell>
                    <TableCell className="text-xs">{formatCurrency(product.descuentoIVA)}</TableCell>
                    <TableCell className="text-xs">{formatCurrency(product.descuentoPP)}</TableCell>
                    <TableCell className="text-xs font-medium">{formatCurrency(product.subtotal)}</TableCell>
                    <TableCell className="text-xs">{product.peso.toFixed(2)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeProductLine(product.id)}
                        className="h-7 w-7"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-600" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Totals */}
        <div className="border rounded-lg p-4 space-y-2 bg-white">
          <h3 className="font-semibold text-sm mb-3">Resumen</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Total Orden</p>
              <p className="font-semibold">{formatCurrency(totals.totalOrden)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Descuento IVA</p>
              <p className="font-semibold">{formatCurrency(totals.descuentoIVATotal)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Descuento P.P.</p>
              <p className="font-semibold">{formatCurrency(totals.descuentoPPTotal)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total a Pagar</p>
              <p className="font-bold text-lg text-primary">{formatCurrency(totals.totalPagar)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Peso Total (kg)</p>
              <p className="font-semibold">{totals.pesoTotal.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              "Guardar Cambios"
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

export { OrderEditPage }
