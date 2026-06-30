"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Printer, Loader2, CheckCircle2, AlertCircle, Factory, Check, ChevronsUpDown } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { getProductsWithCodes, getAlmacenes, getLocationsWithId } from "@/lib/inventory-actions"

const API_URL = "https://duct-dose-gentleman.ngrok-free.dev/api/registro-manual"

interface FormState {
  producto: string
  bodega: string
  localizacion: string
  lote: string
  bultos_procesados: string
  tipo_empaque: string
}

const INITIAL_STATE: FormState = {
  producto: "",
  bodega: "",
  localizacion: "",
  lote: "",
  bultos_procesados: "",
  tipo_empaque: "Arrume",
}

interface ProductOption {
  id: number
  nombre: string
  codigo: string
}
interface AlmacenOption {
  id: number
  nombre: string
}
interface LocationOption {
  id: number
  codigo: string
  descripcion: string | null
}

export default function QRPalletRegistration() {
  const [formData, setFormData] = useState<FormState>(INITIAL_STATE)
  const [submitting, setSubmitting] = useState(false)
  const [lastResult, setLastResult] = useState<
    { type: "success"; id: string | number } | { type: "error"; message: string } | null
  >(null)

  // Datos de las tablas
  const [products, setProducts] = useState<ProductOption[]>([])
  const [almacenes, setAlmacenes] = useState<AlmacenOption[]>([])
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [loadingLocations, setLoadingLocations] = useState(false)

  // Estado de apertura de cada combobox
  const [productoOpen, setProductoOpen] = useState(false)
  const [bodegaOpen, setBodegaOpen] = useState(false)
  const [localizacionOpen, setLocalizacionOpen] = useState(false)

  // Carga inicial de productos y almacenes
  useEffect(() => {
    ;(async () => {
      const [prods, alms] = await Promise.all([getProductsWithCodes(), getAlmacenes()])
      setProducts(prods as ProductOption[])
      setAlmacenes(alms as AlmacenOption[])
    })()
  }, [])

  // Las localizaciones dependen del almacén seleccionado
  useEffect(() => {
    if (!formData.bodega) {
      setLocations([])
      return
    }
    ;(async () => {
      setLoadingLocations(true)
      const locs = await getLocationsWithId(Number.parseInt(formData.bodega, 10))
      setLocations(locs)
      setLoadingLocations(false)
    })()
  }, [formData.bodega])

  const handleChange = (field: keyof FormState, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const selectedProductName = products.find((p) => String(p.id) === formData.producto)?.nombre
  const selectedAlmacenName = almacenes.find((a) => String(a.id) === formData.bodega)?.nombre
  const selectedLocation = locations.find((l) => String(l.id) === formData.localizacion)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLastResult(null)

    const requiredFields: (keyof FormState)[] = [
      "producto",
      "bodega",
      "localizacion",
      "lote",
      "bultos_procesados",
    ]
    for (const field of requiredFields) {
      if (!formData[field].toString().trim()) {
        toast({
          title: "Campos incompletos",
          description: "Por favor complete todos los campos del formulario.",
          variant: "destructive",
        })
        return
      }
    }

    // Se envían los IDs seleccionados (no los nombres) al backend
    const payload = {
      producto: Number.parseInt(formData.producto, 10),
      bodega: Number.parseInt(formData.bodega, 10),
      localizacion: Number.parseInt(formData.localizacion, 10),
      lote: Number.parseInt(formData.lote, 10),
      bultos_procesados: Number.parseInt(formData.bultos_procesados, 10),
      tipo_empaque: formData.tipo_empaque,
    }

    setSubmitting(true)
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error(`El servidor respondió con estado ${response.status}`)
      }

      let generatedId: string | number = "—"
      try {
        const data = await response.json()
        generatedId = data?.id ?? data?.id_generado ?? data?.idqr ?? data?.registro_id ?? "—"
      } catch {
        // El backend pudo no devolver JSON; mantenemos el placeholder.
      }

      setLastResult({ type: "success", id: generatedId })
      toast({
        title: "Etiqueta enviada a la impresora",
        description: `Registro exitoso. ID generado: ${generatedId}`,
      })
      setFormData(INITIAL_STATE)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo conectar con el servidor de impresión."
      setLastResult({ type: "error", message })
      toast({
        title: "Error en el registro",
        description: message,
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-full bg-background p-4 md:p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/30">
            <Factory className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">LipGo V3.0</h1>
            <p className="text-sm text-muted-foreground">Registro manual en línea de producción</p>
          </div>
        </div>

        <Card className="shadow-sm">
          <CardHeader className="border-b">
            <CardTitle>Registro de Producción e Impresión de Etiqueta</CardTitle>
            <CardDescription>
              Complete los datos del proceso para generar la orden de impresión de la etiqueta térmica.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {/* Producto */}
                <div className="space-y-2">
                  <Label htmlFor="producto">Producto</Label>
                  <Popover open={productoOpen} onOpenChange={setProductoOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        id="producto"
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={productoOpen}
                        className="w-full justify-between bg-transparent font-normal"
                      >
                        <span className="truncate">{selectedProductName || "Seleccionar producto"}</span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar producto..." className="h-9" />
                        <CommandList>
                          <CommandEmpty>No se encontraron productos.</CommandEmpty>
                          <CommandGroup>
                            {products.map((product) => (
                              <CommandItem
                                key={product.id}
                                value={`${product.nombre} ${product.codigo}`}
                                onSelect={() => {
                                  handleChange("producto", String(product.id))
                                  setProductoOpen(false)
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    formData.producto === String(product.id) ? "opacity-100" : "opacity-0",
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
                </div>

                {/* Almacén / Bodega */}
                <div className="space-y-2">
                  <Label htmlFor="bodega">Almacén</Label>
                  <Popover open={bodegaOpen} onOpenChange={setBodegaOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        id="bodega"
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={bodegaOpen}
                        className="w-full justify-between bg-transparent font-normal"
                      >
                        <span className="truncate">{selectedAlmacenName || "Seleccionar almacén"}</span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar almacén..." className="h-9" />
                        <CommandList>
                          <CommandEmpty>No se encontraron almacenes.</CommandEmpty>
                          <CommandGroup>
                            {almacenes.map((almacen) => (
                              <CommandItem
                                key={almacen.id}
                                value={almacen.nombre}
                                onSelect={() => {
                                  handleChange("bodega", String(almacen.id))
                                  // Reiniciar localización al cambiar de almacén
                                  handleChange("localizacion", "")
                                  setBodegaOpen(false)
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    formData.bodega === String(almacen.id) ? "opacity-100" : "opacity-0",
                                  )}
                                />
                                {almacen.nombre}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Localización */}
                <div className="space-y-2">
                  <Label htmlFor="localizacion">Localización</Label>
                  <Popover open={localizacionOpen} onOpenChange={setLocalizacionOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        id="localizacion"
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={localizacionOpen}
                        disabled={!formData.bodega || loadingLocations}
                        className="w-full justify-between bg-transparent font-normal"
                      >
                        <span className="truncate">
                          {selectedLocation
                            ? selectedLocation.codigo
                            : loadingLocations
                              ? "Cargando..."
                              : !formData.bodega
                                ? "Seleccione un almacén primero"
                                : "Seleccionar localización"}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar localización..." className="h-9" />
                        <CommandList>
                          <CommandEmpty>No se encontraron localizaciones.</CommandEmpty>
                          <CommandGroup>
                            {locations.map((loc) => (
                              <CommandItem
                                key={loc.id}
                                value={`${loc.codigo} ${loc.descripcion ?? ""}`}
                                onSelect={() => {
                                  handleChange("localizacion", String(loc.id))
                                  setLocalizacionOpen(false)
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    formData.localizacion === String(loc.id) ? "opacity-100" : "opacity-0",
                                  )}
                                />
                                {loc.codigo}
                                {loc.descripcion ? (
                                  <span className="ml-2 text-muted-foreground">{loc.descripcion}</span>
                                ) : null}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Lote */}
                <div className="space-y-2">
                  <Label htmlFor="lote">Número de Lote</Label>
                  <Input
                    id="lote"
                    type="number"
                    inputMode="numeric"
                    value={formData.lote}
                    onChange={(e) => handleChange("lote", e.target.value)}
                    placeholder="Ej: 20260603"
                    required
                  />
                </div>

                {/* Bultos */}
                <div className="space-y-2">
                  <Label htmlFor="bultos_procesados">Cantidad de Bultos Procesados</Label>
                  <Input
                    id="bultos_procesados"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={formData.bultos_procesados}
                    onChange={(e) => handleChange("bultos_procesados", e.target.value)}
                    placeholder="Ej: 70"
                    required
                  />
                </div>

                {/* Modo de almacenamiento */}
                <div className="space-y-2">
                  <Label htmlFor="tipo_empaque">Modo de Almacenamiento</Label>
                  <Select
                    value={formData.tipo_empaque}
                    onValueChange={(value) => handleChange("tipo_empaque", value)}
                  >
                    <SelectTrigger id="tipo_empaque">
                      <SelectValue placeholder="Seleccione modo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Arrume">Arrume</SelectItem>
                      <SelectItem value="Estiba">Estiba</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {lastResult?.type === "success" && (
                <div className="flex items-start gap-3 rounded-lg border border-[var(--chart-3)]/30 bg-[var(--chart-3)]/10 p-3 text-sm text-[var(--chart-3)]">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-semibold text-foreground">Etiqueta enviada a la impresora</p>
                    <p className="text-muted-foreground">ID generado por el sistema: {lastResult.id}</p>
                  </div>
                </div>
              )}

              {lastResult?.type === "error" && (
                <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-semibold text-foreground">No se pudo completar el registro</p>
                    <p className="text-muted-foreground">{lastResult.message}</p>
                  </div>
                </div>
              )}

              <Button type="submit" disabled={submitting} className="w-full gap-2">
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Registrando e Imprimiendo...
                  </>
                ) : (
                  <>
                    <Printer className="h-4 w-4" />
                    Registrar e Imprimir Etiqueta
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
