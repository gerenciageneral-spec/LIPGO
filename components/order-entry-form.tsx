"use client"

import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command"

import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"

import { useState, useEffect } from "react"
import {
  getVendedores,
  getClientes,
  getDestinos,
  getCategorias,
  getProductos,
  getCondicionesPago,
  getTiposDespacho,
  getBodegasByCliente,
  getEmpresas,
  getOwners,
  type Bodega,
  type Cliente,
  getOrderForEdit,
  registerOrder, // Imported for creating new orders
  updateOrder, // Imported for updating existing orders
  getProductWeight, // Imported for getting product weight
} from "@/lib/actions"
import { getAccessibleEmpresesFromPermisos } from "@/lib/orders-actions"
import { generateAndUploadOrderPDF } from "@/lib/pdf-actions" // Imported for PDF generation
import { toast } from "@/components/ui/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Loader2, Plus, Trash2, ArrowLeft, Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase"

interface ProductLine {
  id: string
  categoria: string
  producto: string
  cantidad: number
  precioUnitario: number
  totalLinea: number
  descuentoIVA: number
  descuentoPP: number
  subtotal: number
  comboOpen?: boolean
}

interface OrderEntryFormProps {
  onManageOrders?: () => void
  editOrderId?: number
  // Alias/callbacks opcionales usados por algunos contenedores (main-content,
  // comprehensive). No se consumen aquí; se declaran para compatibilidad de tipos.
  onNavigateToManageOrders?: () => void
  onOrderSaved?: () => void
}

function OrderEntryForm({ onManageOrders, editOrderId }: OrderEntryFormProps = {}) {
  const [vendedores, setVendedores] = useState<{ nombre: string }[]>([])
  const [selectedVendedor, setSelectedVendedor] = useState<string>("")

  const [bodegas, setBodegas] = useState<Bodega[]>([])
  const [selectedBodega, setSelectedBodega] = useState<string>("")
  const [selectedBodegaData, setSelectedBodegaData] = useState<Bodega | null>(null)

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [selectedCliente, setSelectedCliente] = useState<string>("")
  const [selectedClienteId, setSelectedClienteId] = useState<number | null>(null)
  const [clienteComboOpen, setClienteComboOpen] = useState(false)

  const [destinos, setDestinos] = useState<{ nombre: string }[]>([])
  const [selectedDestino, setSelectedDestino] = useState<string>("")

  const [categorias, setCategorias] = useState<{ nombre: string }[]>([])
  const [allProductos, setAllProductos] = useState<{ nombre: string; categoria: string; peso_unitkg?: number }[]>([])

  const [condicionesPagoList, setCondicionesPagoList] = useState<{ nombrecondicion: string }[]>([])
  const [tiposDespachoList, setTiposDespachoList] = useState<{ nombretipodespacho: string }[]>([])

  const [aplicarDescuentoIVA, setAplicarDescuentoIVA] = useState(false)
  const [aplicarDescuentoPP, setAplicarDescuentoPP] = useState(false)
  const [descuentoPPPercent, setDescuentoPPPercent] = useState<number | string>("")
  const [products, setProducts] = useState<ProductLine[]>([])
  const [saving, setSaving] = useState(false)

  const [fechaProgramada, setFechaProgramada] = useState<string>("")
  const [direccion, setDireccion] = useState("")
  const [condicionPago, setCondicionPago] = useState("")
  const [tipoDespacho, setTipoDespacho] = useState("")
  const [ordenCompra, setOrdenCompra] = useState("")
  const [nPedido, setNPedido] = useState("")
  const [observaciones, setObservaciones] = useState("")

  const [fechaPedido, setFechaPedido] = useState(new Date().toISOString().split("T")[0])

  const [selectedEmpresaId, setSelectedEmpresaId] = useState<number | null>(null)
  const [selectedEmpresaNombre, setSelectedEmpresaNombre] = useState("")
  const [selectedEmpresaFacturaNombre, setSelectedEmpresaFacturaNombre] = useState("")
  const [allEmpresas, setAllEmpresas] = useState<
    Array<{ id: number; nombre: string; nit: string; direccion: string; logo?: string }>
  >([])
  const [bodegasAccesibles, setBodegasAccesibles] = useState<Array<{ id: number; nombre: string }>>([])
  const [selectedBodegaOrigen, setSelectedBodegaOrigen] = useState<number | null>(null)
  const [selectedBodegaOrigenNombre, setSelectedBodegaOrigenNombre] = useState("")
  const [allOwners, setAllOwners] = useState<Array<{ nombre: string }>>([])
  const [loading, setLoading] = useState(true)

  const [isEditMode, setIsEditMode] = useState(false)
  const [loadingOrderData, setLoadingOrderData] = useState(false)
  const [productComboOpen, setProductComboOpen] = useState<Record<string, boolean>>({})

  useEffect(() => {
    async function loadInitialData() {
      setLoading(true)
      try {
        const [
          vendedoresData,
          condicionesPagoData,
          tiposDespachoData,
          destinosData,
          clientesData,
          categoriasData,
          productosData,
          empresasData,
          ownersData,
          bodegasAccesiblesData,
        ] = await Promise.all([
          getVendedores(),
          getCondicionesPago(),
          getTiposDespacho(),
          getDestinos(),
          getClientes(),
          getCategorias(),
          getProductos(),
          getEmpresas(),
          getOwners(),
          getAccessibleEmpresesFromPermisos(),
        ])

        setVendedores(vendedoresData)
        setCondicionesPagoList(condicionesPagoData)
        setTiposDespachoList(tiposDespachoData)
        setDestinos(destinosData)
        setClientes(clientesData)
        setCategorias(categoriasData)
        setAllProductos(productosData)
        setAllEmpresas(empresasData)
        setAllOwners(ownersData)
        setBodegasAccesibles(bodegasAccesiblesData)
        
        // Set default bodega origen if available
        if (bodegasAccesiblesData.length > 0) {
          setSelectedBodegaOrigen(bodegasAccesiblesData[0].id)
          setSelectedBodegaOrigenNombre(bodegasAccesiblesData[0].nombre)
        }
      } catch (error) {
        console.error("Error loading initial data:", error)
        toast({
          title: "Error",
          description: "No se pudieron cargar los datos necesarios.",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    }

    loadInitialData()
  }, [])

  useEffect(() => {
    async function loadOrderData() {
      if (!editOrderId || allEmpresas.length === 0 || clientes.length === 0) {
        return
      }

      setLoadingOrderData(true)
      setIsEditMode(true)

      try {
        const result = await getOrderForEdit(editOrderId)

        if (!result.success || !result.header) {
          toast({
            title: "Error",
            description: result.message || "No se pudo cargar el pedido",
            variant: "destructive",
          })
          return
        }

        const header = result.header
        const details = result.details || []

        setFechaPedido(header.fecha ? header.fecha.split("T")[0] : new Date().toISOString().split("T")[0])
        setSelectedVendedor(header.vendedor || "")
        setSelectedCliente(header.cliente || "")
        setSelectedDestino(header.destino || "")
        setSelectedBodega(header.medio || "")
        setFechaProgramada(header.fecha_programada ? header.fecha_programada.split("T")[0] : "")
        setDireccion(header.direccion || "")
        setSelectedEmpresaNombre(header.empresa || "")
        setSelectedEmpresaFacturaNombre(header.empresafactura || "")
        setCondicionPago(header.condicion_pago || "")
        setTipoDespacho(header.tipo_despacho || "")
        setOrdenCompra(header.orden_de_compra || "")
        setNPedido(header.pedido || "")
        setObservaciones(header.observaciones || "")

        const empresa = allEmpresas.find((e) => e.nombre === header.empresa)
        if (empresa) {
          setSelectedEmpresaId(empresa.id)
        }

        const cliente = clientes.find((c) => c.nombre === header.cliente)
        if (cliente) {
          setSelectedClienteId(cliente.id)
        }

        const loadedProducts = details.map((detail: any) => ({
          id: detail.transid?.toString() || Date.now().toString(),
          categoria: detail.categoria || "",
          producto: detail.producto || "",
          cantidad: detail.unidades || 0,
          precioUnitario: detail.precio_und || 0,
          totalLinea: detail.total_linea || 0,
          descuentoIVA: detail.iva || 0,
          descuentoPP: detail.descuentopp || 0,
          subtotal: detail.subtotal || 0,
        }))

        setProducts(loadedProducts)

        const hasIVA = loadedProducts.some((p: any) => p.descuentoIVA > 0)
        const hasPP = loadedProducts.some((p: any) => p.descuentoPP > 0)
        setAplicarDescuentoIVA(hasIVA)
        setAplicarDescuentoPP(hasPP)

        if (hasPP && loadedProducts.length > 0) {
          const firstProduct = loadedProducts[0]
          if (firstProduct.totalLinea > 0) {
            const ppPercent = (firstProduct.descuentoPP / firstProduct.totalLinea) * 100
            setDescuentoPPPercent(Math.round(ppPercent))
          }
        }

        toast({
          title: "Pedido cargado",
          description: `Editando pedido #${editOrderId}`,
        })
      } catch (error) {
        console.error("Error loading order data:", error)
        toast({
          title: "Error",
          description: "Error al cargar los datos del pedido",
          variant: "destructive",
        })
      } finally {
        setLoadingOrderData(false)
      }
    }

    loadOrderData()
  }, [editOrderId, allEmpresas, clientes])

  useEffect(() => {
    async function loadBodegasByCliente() {
      if (selectedClienteId) {
        try {
          const data = await getBodegasByCliente(selectedClienteId)
          setBodegas(data)
          setSelectedBodega("")
          setSelectedBodegaData(null)
        } catch (error) {
          console.error("Error fetching bodegas:", error)
          toast({
            title: "Error",
            description: "No se pudieron cargar las sucursales del cliente.",
            variant: "destructive",
          })
          setBodegas([])
        }
      } else {
        setBodegas([])
        setSelectedBodega("")
        setSelectedBodegaData(null)
      }
    }
    loadBodegasByCliente()
  }, [selectedClienteId])

  useEffect(() => {
    if (selectedBodegaData) {
      setSelectedDestino(selectedBodegaData.ciudad || "")
      setDireccion(selectedBodegaData.direccion || "")
    } else {
      setSelectedDestino("")
      setDireccion("")
    }
  }, [selectedBodegaData])

  const addProduct = () => {
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
    }
    setProducts([...products, newProduct])
  }

  const updateProductLine = (id: string, field: keyof ProductLine, value: any) => {
    setProducts(
      products.map((p) => {
        if (p.id === id) {
          if ((field === "cantidad" || field === "precioUnitario") && Number(value) < 0) {
            return p
          }

          const updated = { ...p, [field]: value }
          if (field === "categoria") {
            updated.producto = ""
          }

          const currentCantidad = Number(updated.cantidad) || 0
          const currentPrecioUnitario = Number(updated.precioUnitario) || 0
          const baseTotal = currentCantidad * currentPrecioUnitario
          updated.totalLinea = baseTotal

          const descuentoIVA = aplicarDescuentoIVA ? baseTotal * 0.05 : 0
          const ppPercent =
            typeof descuentoPPPercent === "number" ? descuentoPPPercent : Number(descuentoPPPercent || 0)
          const descuentoPP = aplicarDescuentoPP && ppPercent > 0 ? baseTotal * (ppPercent / 100) : 0

          updated.descuentoIVA = descuentoIVA
          updated.descuentoPP = descuentoPP
          updated.subtotal = baseTotal - descuentoIVA - descuentoPP

          return updated
        }
        return p
      }),
    )
  }

  useEffect(() => {
    setProducts((prevProducts) =>
      prevProducts.map((p) => {
        const baseTotal = (p.cantidad || 0) * (p.precioUnitario || 0)
        const descuentoIVA = aplicarDescuentoIVA ? baseTotal * 0.05 : 0
        const ppPercent = typeof descuentoPPPercent === "number" ? descuentoPPPercent : Number(descuentoPPPercent || 0)
        const descuentoPP = aplicarDescuentoPP && ppPercent > 0 ? baseTotal * (ppPercent / 100) : 0

        return {
          ...p,
          totalLinea: baseTotal,
          descuentoIVA,
          descuentoPP,
          subtotal: baseTotal - descuentoIVA - descuentoPP,
        }
      }),
    )
  }, [aplicarDescuentoIVA, aplicarDescuentoPP, descuentoPPPercent])

  const removeProduct = (id: string) => {
    setProducts(products.filter((p) => p.id !== id))
  }

  const calculateTotals = () => {
    const totalOrden = products.reduce((sum, p) => sum + p.totalLinea, 0)
    const descuentoIVATotal = products.reduce((sum, p) => sum + p.descuentoIVA, 0)
    const descuentoPPTotal = products.reduce((sum, p) => sum + p.descuentoPP, 0)
    const totalPagar = totalOrden - descuentoIVATotal - descuentoPPTotal

    return { totalOrden, descuentoIVATotal, descuentoPPTotal, totalPagar }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
    }).format(value)
  }

  const handleSaveOrder = async () => {
    if (
      !selectedVendedor ||
      !selectedCliente ||
      !fechaProgramada ||
      !condicionPago ||
      !tipoDespacho ||
      !selectedBodegaOrigen
    ) {
      alert("Por favor complete los campos obligatorios (*) antes de guardar")
      return
    }

    if (products.length === 0) {
      alert("Debe agregar al menos un producto para guardar el pedido")
      return
    }

    setSaving(true)

    try {
      const selectedBodegaData = bodegasAccesibles.find((b) => b.id === selectedBodegaOrigen)
      if (!selectedBodegaData) {
        alert("Por favor seleccione una bodega origen válida")
        setSaving(false)
        return
      }

      const productsWithDetails = await Promise.all(
        products.map(async (p) => {
          if (!p.producto) return null
          const weight = await getProductWeight(p.producto)
          const productInfo = allProductos.find((prod) => prod.nombre === p.producto)
          return {
            categoria: productInfo?.categoria || "Sin categoría",
            referencia: p.producto,
            precioUnitario: p.precioUnitario,
            cantidad: p.cantidad,
            peso: weight * p.cantidad,
          }
        }),
      )

      const validProductsWithDetails = productsWithDetails.filter((p) => p !== null) as Array<{
        categoria: string
        referencia: string
        precioUnitario: number
        cantidad: number
        peso: number
      }>

      const groupedProducts = validProductsWithDetails.reduce(
        (acc, product) => {
          if (!acc[product.categoria]) {
            acc[product.categoria] = []
          }
          acc[product.categoria].push(product)
          return acc
        },
        {} as Record<string, typeof validProductsWithDetails>,
      )

      const totalsData = calculateTotals()

      const headerData = {
        fecha: fechaPedido,
        vendedor: selectedVendedor,
        cliente: selectedCliente,
        destino: selectedDestino,
        medio: selectedBodega,
        fecha_programada: fechaProgramada,
        direccion: direccion,
        empresa: selectedBodegaData.nombre,
        empresafactura: selectedEmpresaFacturaNombre,
        condicion_pago: condicionPago,
        orden_de_compra: ordenCompra,
        pedido: nPedido,
        total_linea: totalsData.totalOrden,
        total_pagar: totalsData.totalPagar,
        descuentopp: totalsData.descuentoPPTotal,
        descuentoiva: totalsData.descuentoIVATotal,
        tipo_despacho: tipoDespacho,
        pdfpedido: undefined, // Will be updated after PDF generation
      }

      const detailsData = products.map((p) => ({
        categoria: allProductos.find((prod) => prod.nombre === p.producto)?.categoria || "Sin categoría",
        producto: p.producto,
        cantidad: p.cantidad,
        precio_unitario: p.precioUnitario,
        total_linea: p.totalLinea,
        descuento_iva: p.descuentoIVA,
        descuento_pp: p.descuentoPP,
        subtotal: p.subtotal,
      }))

      let result
      if (isEditMode && editOrderId) {
        result = await updateOrder(editOrderId, headerData, detailsData, selectedBodegaOrigen)
      } else {
        result = await registerOrder(headerData, detailsData, selectedBodegaOrigen)
      }

      if (!result.success) {
        alert(result.message || "Error al guardar el pedido")
        setSaving(false)
        return
      }

      const orderDataForPDF = {
        idpedido: result.idpedido,
        nit: selectedEmpresaNombre, // Assuming selectedEmpresaNombre is the nit
        carrera: "Not Available", // Placeholder for carrera
        fechaPedido: new Date().toLocaleDateString("es-CO"),
        nitCliente: "900653385",
        sucursalMolinos: selectedDestino,
        nombreCliente: selectedCliente,
        direccionEntrega: direccion || selectedDestino,
        ciudadEntrega: selectedDestino.split(",")[0] || selectedDestino,
        asesorComercial: selectedVendedor,
        fechaEntrega: new Date(fechaProgramada).toLocaleDateString("es-CO"),
        condicionPago: condicionPago,
        tipoDespacho: tipoDespacho,
        empresaFactura: selectedEmpresaFacturaNombre,
        groupedProducts: groupedProducts,
        subtotal: totalsData.totalOrden,
        iva: totalsData.descuentoIVATotal,
        total: totalsData.totalPagar,
        kgDespacho: validProductsWithDetails.reduce((sum, p) => sum + p.peso, 0),
        observaciones: observaciones,
      }

      const pdfResult = await generateAndUploadOrderPDF(orderDataForPDF, selectedBodegaData.nombre)

      if (pdfResult.success && pdfResult.url && result.idpedido) {
        const { error: updateError } = await supabase
          .from("pedidoscabecera")
          .update({ pdfpedido: pdfResult.url })
          .eq("idpedido", result.idpedido)

        if (updateError) {
          console.error("[v0] Error updating PDF URL:", updateError)
        }
      }

      if (result.success) {
        const action = isEditMode ? "actualizado" : "guardado"
        alert(`Pedido #${result.idpedido} ${action} exitosamente.`)

        if (pdfResult.success && pdfResult.url) {
          const link = document.createElement("a")
          link.href = pdfResult.url
          link.download = `pedido_${result.idpedido || Date.now()}.pdf`
          link.target = "_blank"
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
        }

        if (onManageOrders) {
          onManageOrders()
        } else {
          setProducts([])
          setDireccion("")
          setOrdenCompra("")
          setNPedido("")
          setCondicionPago("")
          setTipoDespacho("")
          setObservaciones("")
          setSelectedVendedor("")
          setSelectedCliente("")
          setSelectedDestino("")
          setSelectedBodega("")
          setFechaProgramada("")
          setAplicarDescuentoIVA(false)
          setAplicarDescuentoPP(false)
          setDescuentoPPPercent("")
          setSelectedBodegaOrigen(null)
          setSelectedBodegaOrigenNombre("")
          setSelectedEmpresaNombre("")
          setSelectedEmpresaFacturaNombre("")
          setSelectedClienteId(null)
        }
      }
    } catch (error) {
      console.error("Error saving order:", error)
      alert("Error al guardar el pedido")
    } finally {
      setSaving(false)
    }
  }

  if (loading || loadingOrderData) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      <div className="bg-primary rounded-t-lg p-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">
            {isEditMode ? `Editar Pedido #${editOrderId}` : "Registro de Nuevos Pedidos"}
          </h1>
          <p className="text-xs text-white/90 mt-0.5">Complete los datos del encabezado y agregue los productos.</p>
        </div>
        {onManageOrders && (
          <Button variant="secondary" onClick={onManageOrders} size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Información del Pedido</CardTitle>
          <CardDescription>Los campos marcados con (*) son obligatorios</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Bodega Origen field - using accessible bodegas from perfil_acceso_empresas */}
            <div className="space-y-2">
              <Label htmlFor="bodega-origen" className="text-xs md:text-sm">
                Bodega Origen <span className="text-destructive">*</span>
              </Label>
              <Select
                value={selectedBodegaOrigen?.toString() || ""}
                onValueChange={(value) => {
                  const bodegaId = Number.parseInt(value, 10)
                  setSelectedBodegaOrigen(bodegaId)
                  const bodega = bodegasAccesibles.find((b) => b.id === bodegaId)
                  if (bodega) {
                    setSelectedBodegaOrigenNombre(bodega.nombre)
                  }
                }}
              >
                <SelectTrigger id="bodega-origen">
                  <SelectValue placeholder="Seleccione bodega origen" />
                </SelectTrigger>
                <SelectContent>
                  {bodegasAccesibles.map((bodega) => (
                    <SelectItem key={bodega.id} value={bodega.id.toString()}>
                      {bodega.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="empresaFactura" className="text-xs md:text-sm">
                Empresa Factura <span className="text-destructive">*</span>
              </Label>
              <Select
                value={selectedEmpresaFacturaNombre}
                onValueChange={(value) => {
                  setSelectedEmpresaFacturaNombre(value)
                }}
              >
                <SelectTrigger id="empresaFactura">
                  <SelectValue placeholder="Seleccione empresa factura" />
                </SelectTrigger>
                <SelectContent>
                  {allOwners.map((owner, index) => (
                    <SelectItem key={index} value={owner.nombre}>
                      {owner.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Vendedor field */}
            <div className="space-y-2">
              <Label htmlFor="vendedor" className="text-xs md:text-sm">
                Vendedor <span className="text-destructive">*</span>
              </Label>
              <Select value={selectedVendedor} onValueChange={setSelectedVendedor}>
                <SelectTrigger id="vendedor">
                  <SelectValue placeholder="Seleccione vendedor" />
                </SelectTrigger>
                <SelectContent>
                  {vendedores.map((v, index) => (
                    <SelectItem key={index} value={v.nombre}>
                      {v.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fecha-pedido">Fecha</Label>
              <Input id="fecha-pedido" type="date" value={fechaPedido} disabled className="bg-muted" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cliente">Cliente *</Label>
              <div className="flex">
                <Popover open={clienteComboOpen} onOpenChange={setClienteComboOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={clienteComboOpen}
                      className="w-full justify-between bg-transparent"
                    >
                      {selectedCliente || "Seleccione cliente"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0" align="start" side="bottom" sideOffset={4}>
                    <Command>
                      <CommandInput placeholder="Buscar cliente..." />
                      <CommandList>
                        <CommandEmpty>No se encontró ningún cliente.</CommandEmpty>
                        <CommandGroup>
                          {clientes.map((c) => (
                            <CommandItem
                              key={c.id}
                              value={c.nombre}
                              onSelect={(currentValue) => {
                                const cliente = clientes.find(
                                  (cl) => cl.nombre.toLowerCase() === currentValue.toLowerCase(),
                                )
                                if (cliente) {
                                  setSelectedCliente(cliente.nombre)
                                  setSelectedClienteId(cliente.id)
                                  setSelectedBodega("")
                                  setSelectedDestino("")
                                  setDireccion("")
                                }
                                setClienteComboOpen(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedCliente === c.nombre ? "opacity-100" : "opacity-0",
                                )}
                              />
                              {c.nombre}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bodega">Bodega/Sucursal</Label>
              <Select
                value={selectedBodega}
                onValueChange={(value) => {
                  setSelectedBodega(value)
                  const bodega = bodegas.find((b) => b.nombrebodega === value)
                  setSelectedBodegaData(bodega || null)
                }}
              >
                <SelectTrigger id="bodega">
                  <SelectValue placeholder="Seleccione bodega" />
                </SelectTrigger>
                <SelectContent>
                  {bodegas.map((b) => (
                    <SelectItem key={b.idbodega} value={b.nombrebodega}>
                      {b.nombrebodega}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="destino">Destino </Label>
              <Input
                id="destino"
                value={selectedDestino}
                disabled
                className="bg-muted"
                placeholder="Ingrese el destino"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="direccion">Dirección</Label>
              <Input
                id="direccion"
                value={direccion}
                disabled
                className="bg-muted"
                placeholder="Ingrese la dirección"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fecha-programada">Fecha Programada *</Label>
              <Input
                id="fecha-programada"
                type="date"
                value={fechaProgramada}
                onChange={(e) => setFechaProgramada(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="condicion-pago">Condición de Pago *</Label>
              <Select value={condicionPago} onValueChange={setCondicionPago}>
                <SelectTrigger id="condicion-pago">
                  <SelectValue placeholder="Seleccione" />
                </SelectTrigger>
                <SelectContent>
                  {condicionesPagoList.map((c) => (
                    <SelectItem key={c.nombrecondicion} value={c.nombrecondicion}>
                      {c.nombrecondicion}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tipo-despacho">Tipo de Despacho *</Label>
              <Select value={tipoDespacho} onValueChange={setTipoDespacho}>
                <SelectTrigger id="tipo-despacho">
                  <SelectValue placeholder="Seleccione" />
                </SelectTrigger>
                <SelectContent>
                  {tiposDespachoList.map((t) => (
                    <SelectItem key={t.nombretipodespacho} value={t.nombretipodespacho}>
                      {t.nombretipodespacho}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="orden-compra">Orden de Compra</Label>
              <Input
                id="orden-compra"
                value={ordenCompra}
                onChange={(e) => setOrdenCompra(e.target.value)}
                placeholder="Ingrese número de orden"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="n-pedido">N° Pedido</Label>
              <Input
                id="n-pedido"
                value={nPedido}
                onChange={(e) => setNPedido(e.target.value)}
                placeholder="Ingrese número de pedido"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="observaciones">Observaciones</Label>
            <Textarea
              id="observaciones"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Ingrese observaciones adicionales"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Productos</CardTitle>
            <Button onClick={addProduct} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Agregar Producto
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="descuento-iva"
                checked={aplicarDescuentoIVA}
                onCheckedChange={(checked) => setAplicarDescuentoIVA(checked === true)}
              />
              <Label htmlFor="descuento-iva" className="cursor-pointer text-sm">
                Aplicar descuento IVA (5%)
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="descuento-pp"
                checked={aplicarDescuentoPP}
                onCheckedChange={(checked) => setAplicarDescuentoPP(checked === true)}
              />
              <Label htmlFor="descuento-pp" className="cursor-pointer text-sm">
                Aplicar descuento pronto pago
              </Label>
            </div>

            {aplicarDescuentoPP && (
              <div className="flex items-center space-x-2">
                <Label htmlFor="descuento-pp-percent" className="text-sm">
                  %:
                </Label>
                <Input
                  id="descuento-pp-percent"
                  type="number"
                  className="w-20 h-8"
                  value={descuentoPPPercent}
                  onChange={(e) => setDescuentoPPPercent(e.target.value)}
                  min="0"
                  max="100"
                />
              </div>
            )}
          </div>

          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Cantidad</TableHead>
                  <TableHead>Precio Unit.</TableHead>
                  <TableHead>Total Línea</TableHead>
                  <TableHead>Desc. IVA</TableHead>
                  <TableHead>Desc. PP</TableHead>
                  <TableHead>Subtotal</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <Select
                        value={product.categoria}
                        onValueChange={(value) => updateProductLine(product.id, "categoria", value)}
                      >
                        <SelectTrigger className="w-[150px]">
                          <SelectValue placeholder="Categoría" />
                        </SelectTrigger>
                        <SelectContent>
                          {categorias.map((cat) => (
                            <SelectItem key={cat.nombre} value={cat.nombre}>
                              {cat.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Popover
                        open={productComboOpen[product.id] || false}
                        onOpenChange={(open) => setProductComboOpen((prev) => ({ ...prev, [product.id]: open }))}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={productComboOpen[product.id] || false}
                            className="w-[400px] justify-between bg-transparent"
                            disabled={!product.categoria}
                          >
                            {product.producto || "Producto"}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[400px] p-0" side="bottom" sideOffset={4}>
                          <Command>
                            <CommandInput placeholder="Buscar producto..." />
                            <CommandList>
                              <CommandEmpty>No se encontró producto.</CommandEmpty>
                              <CommandGroup>
                                {allProductos
                                  .filter((p) => p.categoria === product.categoria)
                                  .map((prod) => (
                                    <CommandItem
                                      key={prod.nombre}
                                      value={prod.nombre}
                                      onSelect={(currentValue) => {
                                        updateProductLine(
                                          product.id,
                                          "producto",
                                          currentValue === product.producto ? "" : currentValue,
                                        )
                                        setProductComboOpen((prev) => ({ ...prev, [product.id]: false }))
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          product.producto === prod.nombre ? "opacity-100" : "opacity-0",
                                        )}
                                      />
                                      {prod.nombre}
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
                        className="w-24"
                        value={product.cantidad}
                        onChange={(e) => updateProductLine(product.id, "cantidad", Number(e.target.value))}
                        min="0"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        className="w-32"
                        value={product.precioUnitario}
                        onChange={(e) => updateProductLine(product.id, "precioUnitario", Number(e.target.value))}
                        min="0"
                      />
                    </TableCell>
                    <TableCell className="font-medium">{formatCurrency(product.totalLinea)}</TableCell>
                    <TableCell className="text-red-600">{formatCurrency(product.descuentoIVA)}</TableCell>
                    <TableCell className="text-red-600">{formatCurrency(product.descuentoPP)}</TableCell>
                    <TableCell className="font-bold">{formatCurrency(product.subtotal)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeProduct(product.id)}
                        disabled={products.length === 1}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end">
            <div className="w-80 space-y-2 bg-muted p-4 rounded-lg">
              <div className="flex justify-between text-sm">
                <span>Total Orden:</span>
                <span className="font-medium">{formatCurrency(calculateTotals().totalOrden)}</span>
              </div>
              <div className="flex justify-between text-sm text-red-600">
                <span>Descuento IVA Total:</span>
                <span>-{formatCurrency(calculateTotals().descuentoIVATotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-red-600">
                <span>Descuento PP Total:</span>
                <span>-{formatCurrency(calculateTotals().descuentoPPTotal)}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-lg font-bold">
                <span>Total a Pagar:</span>
                <span>{formatCurrency(calculateTotals().totalPagar)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        {onManageOrders && (
          <Button variant="outline" onClick={onManageOrders} disabled={saving}>
            Cancelar
          </Button>
        )}
        <Button onClick={handleSaveOrder} disabled={saving} className="bg-green-600 hover:bg-green-700">
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Guardando...
            </>
          ) : (
            <>{isEditMode ? "Actualizar Pedido" : "Guardar Pedido"}</>
          )}
        </Button>
      </div>
    </div>
  )
}

export { OrderEntryForm }
export default OrderEntryForm
