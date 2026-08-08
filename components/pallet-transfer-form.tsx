"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Package, MapPin, AlertCircle, Camera, QrCode, ArrowRight, Loader2, Printer } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { QRCameraScanner } from "@/components/qr-camera-scanner"
import { searchPalletByQR } from "@/lib/picking-actions"
import { getInventoryByPallet, registerPalletTransfer, type PalletTransferLabel } from "@/lib/qr-actions"
import { useAuth } from "@/components/auth-provider"

// Endpoint de impresión (mismo módulo de Registro de QR estiba).
const PRINT_API_URL = "https://duct-dose-gentleman.ngrok-free.dev/api/registro-manual"

interface PalletLine {
  idqr: number
  codproducto: string
  nombreproducto: string
  lote: string
  location: string
  stock_total: number
}

export function PalletTransferForm() {
  const { toast } = useToast()
  const { selectedEmpresaId } = useAuth()

  // --- Origen ---
  const [originMode, setOriginMode] = useState<"scan" | "select">("scan")
  const [originQrId, setOriginQrId] = useState<number | null>(null)
  const [originLines, setOriginLines] = useState<PalletLine[]>([])
  const [selectedOriginLine, setSelectedOriginLine] = useState<PalletLine | null>(null)

  // Select-mode: catálogo de estibas con inventario
  const [allPallets, setAllPallets] = useState<PalletLine[]>([])
  const [selProducto, setSelProducto] = useState("")
  const [selLote, setSelLote] = useState("")
  const [selIdqr, setSelIdqr] = useState("")

  // --- Destino ---
  const [destQrId, setDestQrId] = useState<number | null>(null)
  const [destLines, setDestLines] = useState<PalletLine[]>([])

  // --- Común ---
  const [cantidad, setCantidad] = useState("")
  const [cantidadError, setCantidadError] = useState("")
  const [loading, setLoading] = useState(false)

  // Escáner de cámara
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanTarget, setScanTarget] = useState<"origin" | "dest">("origin")

  useEffect(() => {
    if (originMode === "select" && allPallets.length === 0) {
      loadAllPallets()
    }
  }, [originMode])

  // Validación de cantidad contra el stock de la línea origen seleccionada.
  useEffect(() => {
    const disponible = selectedOriginLine?.stock_total ?? 0
    if (cantidad && disponible > 0) {
      const n = Number.parseFloat(cantidad)
      if (n > disponible) {
        setCantidadError(`No puede trasladar más del disponible en la estiba (${disponible})`)
      } else if (n <= 0) {
        setCantidadError("La cantidad debe ser mayor a 0")
      } else {
        setCantidadError("")
      }
    } else {
      setCantidadError("")
    }
  }, [cantidad, selectedOriginLine])

  const loadAllPallets = async () => {
    try {
      const result = await getInventoryByPallet({})
      if (result.success) {
        setAllPallets(result.data as PalletLine[])
      }
    } catch (error) {
      console.error("[v0] Error loading pallets:", error)
      toast({ title: "Error", description: "No se pudieron cargar las estibas", variant: "destructive" })
    }
  }

  const openScanner = (target: "origin" | "dest") => {
    setScanTarget(target)
    setScannerOpen(true)
  }

  const handleScan = async (code: string) => {
    const qrId = Number.parseInt(code.trim())
    if (Number.isNaN(qrId)) {
      toast({ title: "QR inválido", description: "El código escaneado no es válido", variant: "destructive" })
      return
    }

    const result = await searchPalletByQR(String(qrId))
    if (!result.success || !result.data || result.data.length === 0) {
      toast({
        title: "Estiba no encontrada",
        description: result.message || "No hay inventario asociado a este QR",
        variant: "destructive",
      })
      return
    }

    const lines = result.data as PalletLine[]

    if (scanTarget === "origin") {
      setOriginQrId(qrId)
      setOriginLines(lines)
      // Si la estiba tiene una sola línea, se selecciona automáticamente.
      setSelectedOriginLine(lines.length === 1 ? lines[0] : null)
      toast({ title: "Estiba origen cargada", description: `QR ${qrId} · ${lines.length} línea(s)` })
    } else {
      if (qrId === originQrId) {
        toast({ title: "Error", description: "La estiba destino debe ser diferente a la origen", variant: "destructive" })
        return
      }
      setDestQrId(qrId)
      setDestLines(lines)
      toast({ title: "Estiba destino cargada", description: `QR ${qrId} · ${lines[0]?.location}` })
    }
  }

  // Select-mode: derivar opciones encadenadas
  const productosOptions = Array.from(new Set(allPallets.map((p) => p.nombreproducto))).sort()
  const lotesOptions = Array.from(
    new Set(allPallets.filter((p) => p.nombreproducto === selProducto).map((p) => p.lote)),
  ).sort()
  const idqrOptions = allPallets.filter(
    (p) => p.nombreproducto === selProducto && p.lote === selLote,
  )

  const handleSelectIdqr = (value: string) => {
    setSelIdqr(value)
    const line = idqrOptions.find((p) => String(p.idqr) === value) || null
    if (line) {
      setOriginQrId(line.idqr)
      setOriginLines([line])
      setSelectedOriginLine(line)
    }
  }

  const resetForm = () => {
    setOriginQrId(null)
    setOriginLines([])
    setSelectedOriginLine(null)
    setDestQrId(null)
    setDestLines([])
    setCantidad("")
    setCantidadError("")
    setSelProducto("")
    setSelLote("")
    setSelIdqr("")
  }

  // Envía cada etiqueta al servicio de impresión (misma API del Registro QR).
  const printLabels = async (labels: PalletTransferLabel[]) => {
    let printed = 0
    for (const label of labels) {
      try {
        const response = await fetch(PRINT_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
          body: JSON.stringify(label),
        })
        if (response.ok) printed++
        else console.error("[v0] Print API error status:", response.status)
      } catch (error) {
        console.error("[v0] Error printing label:", error)
      }
    }
    return printed
  }

  const handleSubmit = async () => {
    if (!originQrId || !selectedOriginLine) {
      toast({ title: "Error", description: "Seleccione la estiba y la línea de origen", variant: "destructive" })
      return
    }
    if (!destQrId) {
      toast({ title: "Error", description: "Escanee la estiba destino", variant: "destructive" })
      return
    }
    const n = Number.parseFloat(cantidad)
    if (!cantidad || n <= 0) {
      toast({ title: "Error", description: "Ingrese una cantidad válida", variant: "destructive" })
      return
    }
    if (n > selectedOriginLine.stock_total) {
      toast({ title: "Cantidad inválida", description: "Supera el disponible en la estiba origen", variant: "destructive" })
      return
    }

    try {
      setLoading(true)
      const result = await registerPalletTransfer({
        originQrId,
        destQrId,
        codproducto: selectedOriginLine.codproducto,
        nombreproducto: selectedOriginLine.nombreproducto,
        lote: selectedOriginLine.lote,
        cantidad: n,
        selectedEmpresaId: selectedEmpresaId ?? undefined,
      })

      if (!result.success) {
        toast({ title: "Error", description: result.message, variant: "destructive" })
        return
      }

      const printed = await printLabels(result.labels)
      toast({
        title: "Traslado registrado",
        description: `${result.message}. Etiquetas enviadas a impresión: ${printed}/${result.labels.length}.`,
      })

      resetForm()
      if (originMode === "select") loadAllPallets()
    } catch (error) {
      console.error("[v0] Error in pallet transfer submit:", error)
      toast({ title: "Error", description: "Error al registrar el traslado entre estibas", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const disponible = selectedOriginLine?.stock_total ?? 0

  return (
    <div className="space-y-4 md:space-y-6">
      <QRCameraScanner isOpen={scannerOpen} onClose={() => setScannerOpen(false)} onScan={handleScan} />

      <Card>
        <CardContent className="pt-4 md:pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
            {/* Origen */}
            <div className="space-y-3 md:space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Package className="h-4 w-4 md:h-5 md:w-5 text-cyan-500" />
                <h2 className="text-base md:text-lg font-semibold">Posición Origen</h2>
              </div>

              {/* Selector de modo */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={originMode === "scan" ? "default" : "outline"}
                  size="sm"
                  className={`flex-1 text-xs ${originMode === "scan" ? "bg-cyan-500 hover:bg-cyan-600" : ""}`}
                  onClick={() => setOriginMode("scan")}
                >
                  <Camera className="h-3.5 w-3.5 mr-1" />
                  Escanear
                </Button>
                <Button
                  type="button"
                  variant={originMode === "select" ? "default" : "outline"}
                  size="sm"
                  className={`flex-1 text-xs ${originMode === "select" ? "bg-cyan-500 hover:bg-cyan-600" : ""}`}
                  onClick={() => setOriginMode("select")}
                >
                  Seleccionar
                </Button>
              </div>

              {originMode === "scan" ? (
                <Button type="button" variant="outline" className="w-full" onClick={() => openScanner("origin")}>
                  <QrCode className="h-4 w-4 mr-2" />
                  {originQrId ? `Estiba escaneada: QR ${originQrId}` : "Escanear QR de estiba origen"}
                </Button>
              ) : (
                <div className="space-y-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs md:text-sm">Producto</Label>
                    <Select
                      value={selProducto}
                      onValueChange={(v) => {
                        setSelProducto(v)
                        setSelLote("")
                        setSelIdqr("")
                        setSelectedOriginLine(null)
                      }}
                    >
                      <SelectTrigger className="h-8 md:h-9 text-xs md:text-sm">
                        <SelectValue placeholder="Seleccione un producto..." />
                      </SelectTrigger>
                      <SelectContent>
                        {productosOptions.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs md:text-sm">Lote</Label>
                    <Select
                      value={selLote}
                      onValueChange={(v) => {
                        setSelLote(v)
                        setSelIdqr("")
                        setSelectedOriginLine(null)
                      }}
                      disabled={!selProducto}
                    >
                      <SelectTrigger className="h-8 md:h-9 text-xs md:text-sm">
                        <SelectValue placeholder="Seleccione un lote..." />
                      </SelectTrigger>
                      <SelectContent>
                        {lotesOptions.map((l) => (
                          <SelectItem key={l} value={l}>
                            {l}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs md:text-sm">Estiba (QR)</Label>
                    <Select value={selIdqr} onValueChange={handleSelectIdqr} disabled={!selLote}>
                      <SelectTrigger className="h-8 md:h-9 text-xs md:text-sm">
                        <SelectValue placeholder="Seleccione una estiba..." />
                      </SelectTrigger>
                      <SelectContent>
                        {idqrOptions.map((p) => (
                          <SelectItem key={p.idqr} value={String(p.idqr)}>
                            QR {p.idqr} · {p.location} · {p.stock_total} und
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Selección de línea cuando la estiba escaneada tiene varias */}
              {originMode === "scan" && originLines.length > 1 && (
                <div className="space-y-1.5">
                  <Label className="text-xs md:text-sm">Producto / Lote en la estiba</Label>
                  <Select
                    value={selectedOriginLine ? `${selectedOriginLine.nombreproducto}__${selectedOriginLine.lote}` : ""}
                    onValueChange={(v) => {
                      const [nombre, lt] = v.split("__")
                      setSelectedOriginLine(
                        originLines.find((l) => l.nombreproducto === nombre && l.lote === lt) || null,
                      )
                    }}
                  >
                    <SelectTrigger className="h-8 md:h-9 text-xs md:text-sm">
                      <SelectValue placeholder="Seleccione el producto/lote..." />
                    </SelectTrigger>
                    <SelectContent>
                      {originLines.map((l) => (
                        <SelectItem key={`${l.nombreproducto}__${l.lote}`} value={`${l.nombreproducto}__${l.lote}`}>
                          {l.nombreproducto} · Lote {l.lote} · {l.stock_total} und
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedOriginLine && (
                <div className="bg-cyan-50 border border-cyan-200 rounded-md p-2 md:p-3 text-xs md:text-sm space-y-1">
                  <div className="font-medium text-cyan-800">{selectedOriginLine.nombreproducto}</div>
                  <div className="text-cyan-700">Lote: {selectedOriginLine.lote}</div>
                  <div className="text-cyan-700">Ubicación: {selectedOriginLine.location}</div>
                  <div className="text-cyan-700">
                    Disponible: <span className="font-bold">{disponible}</span>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="cantidad-estiba" className="text-xs md:text-sm">
                  Cantidad a Trasladar
                </Label>
                <Input
                  id="cantidad-estiba"
                  type="number"
                  step="0.01"
                  min="0"
                  max={disponible}
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  className={`text-right h-8 md:h-9 text-xs md:text-sm ${cantidadError ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                  placeholder="0.00"
                  disabled={!selectedOriginLine}
                />
                {cantidadError && (
                  <div className="flex items-start gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-md p-2">
                    <AlertCircle className="h-3 w-3 md:h-4 md:w-4 mt-0.5 flex-shrink-0" />
                    <span className="font-medium">{cantidadError}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Destino */}
            <div className="space-y-3 md:space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <MapPin className="h-4 w-4 md:h-5 md:w-5 text-cyan-500" />
                <h2 className="text-base md:text-lg font-semibold">Posición Destino</h2>
              </div>

              <Button type="button" variant="outline" className="w-full" onClick={() => openScanner("dest")}>
                <QrCode className="h-4 w-4 mr-2" />
                {destQrId ? `Estiba escaneada: QR ${destQrId}` : "Escanear QR de estiba destino"}
              </Button>

              {destQrId && destLines.length > 0 && (
                <div className="bg-cyan-50 border border-cyan-200 rounded-md p-2 md:p-3 text-xs md:text-sm space-y-1">
                  <div className="font-medium text-cyan-800">QR {destQrId}</div>
                  <div className="text-cyan-700">Ubicación: {destLines[0].location}</div>
                  <div className="text-cyan-700">
                    Contenido actual:{" "}
                    {destLines.map((l) => `${l.nombreproducto} (${l.stock_total})`).join(", ") || "Vacía"}
                  </div>
                </div>
              )}

              {selectedOriginLine && destQrId && (
                <div className="flex items-center justify-center gap-2 text-cyan-600 text-xs md:text-sm bg-cyan-50/60 border border-dashed border-cyan-300 rounded-md p-3">
                  <span className="font-medium">QR {originQrId}</span>
                  <ArrowRight className="h-4 w-4" />
                  <span className="font-medium">{cantidad || 0} und</span>
                  <ArrowRight className="h-4 w-4" />
                  <span className="font-medium">QR {destQrId}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-center mt-6 md:mt-8">
            <Button
              onClick={handleSubmit}
              className="bg-cyan-500 hover:bg-cyan-600 text-white px-6 md:px-8 h-9 text-xs md:text-sm w-full md:w-auto"
              disabled={loading || !!cantidadError || !selectedOriginLine || !destQrId || !cantidad}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Registrando e Imprimiendo...
                </>
              ) : (
                <>
                  <Printer className="h-4 w-4 mr-2" />
                  Registrar Traslado e Imprimir
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
