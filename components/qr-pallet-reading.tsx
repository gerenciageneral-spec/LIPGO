"use client"

import type React from "react"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { QrCode, Search, Package, Warehouse, Box, Camera, MapPin, Hash } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { QRCameraScanner, useIsMobile } from "@/components/qr-camera-scanner"

interface PalletInventoryItem {
  idqr: string
  codproducto: string
  nombreproducto: string
  lote: string
  location: string
  stock_total: number
}

export default function QRPalletReading() {
  const [qrCode, setQrCode] = useState("")
  const [palletItems, setPalletItems] = useState<PalletInventoryItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const isMobile = useIsMobile()

  // Busca la estiba en la vista view_inventario_por_estiba por idqr.
  const searchByQR = async (code: string) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/pallet-inventory/by-qr?idqr=${encodeURIComponent(code.trim())}`)
      const result = await response.json()

      if (result.success && result.data.length > 0) {
        setPalletItems(result.data)
        toast({
          title: "Estiba encontrada",
          description: "Información cargada correctamente",
        })
      } else {
        setPalletItems(null)
        toast({
          title: "No encontrado",
          description: result.error || "No se encontró información para este código QR",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error scanning QR:", error)
      setPalletItems(null)
      toast({
        title: "Error",
        description: "Error al buscar la información de la estiba",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleScanQR = async () => {
    if (!qrCode.trim()) {
      toast({
        title: "Error",
        description: "Ingrese un código QR para buscar",
        variant: "destructive",
      })
      return
    }
    await searchByQR(qrCode)
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleScanQR()
    }
  }

  const handleQRScanned = async (code: string) => {
    setQrCode(code)
    await searchByQR(code)
  }

  const handleOpenCamera = () => {
    setIsCameraOpen(true)
  }

  const totalStock = palletItems?.reduce((sum, item) => sum + Number(item.stock_total), 0) || 0
  const cabecera = palletItems?.[0]

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center gap-2">
        <QrCode className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Lectura de QR Estibas</h1>
      </div>

      {/* Scanner Section */}
      <Card className="border-2 border-primary/20 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10">
          <CardTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            Escanear Código QR
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <div className="flex-1 space-y-2">
              <Label htmlFor="qrCode" className="text-base">
                Código QR
              </Label>
              <Input
                id="qrCode"
                value={qrCode}
                onChange={(e) => setQrCode(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Escanee o ingrese código QR"
                className="h-12 text-lg"
                disabled={loading}
              />
            </div>
            {isMobile && (
              <Button
                onClick={handleOpenCamera}
                variant="outline"
                className="mt-8 h-12 px-6 bg-transparent"
                disabled={loading}
              >
                <Camera className="h-5 w-5 mr-2" />
                Cámara
              </Button>
            )}
            <Button onClick={handleScanQR} className="mt-8 h-12 px-6" disabled={loading}>
              <Search className="h-5 w-5 mr-2" />
              {loading ? "Buscando..." : "Buscar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Pallet Information Display */}
      {palletItems && cabecera && (
        <div className="space-y-6 animate-in fade-in duration-500">
          {/* Header Card */}
          <Card className="border-2 border-green-500/30 shadow-xl bg-gradient-to-br from-green-50 to-emerald-50">
            <CardHeader className="bg-gradient-to-r from-green-500 to-emerald-600 text-white">
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Package className="h-7 w-7" />
                Información de Estiba
              </CardTitle>
              <p className="text-green-100 text-sm mt-1">ID QR: {cabecera.idqr}</p>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              {/* Product Info */}
              <div className="bg-white rounded-lg p-4 shadow-sm border border-green-200">
                <h3 className="text-lg font-semibold text-green-800 mb-3 flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Producto
                </h3>
                <div className="text-2xl font-bold text-gray-900 mb-2">{cabecera.nombreproducto}</div>
                <div className="text-sm text-gray-600">Código: {cabecera.codproducto}</div>
              </div>

              {/* Grid Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded-lg p-4 shadow-sm border border-green-200">
                  <div className="flex items-center gap-2 text-gray-600 mb-2">
                    <MapPin className="h-4 w-4" />
                    <span className="text-sm font-medium">Localización</span>
                  </div>
                  <div className="text-lg font-semibold text-gray-900">{cabecera.location}</div>
                </div>

                <div className="bg-white rounded-lg p-4 shadow-sm border border-green-200">
                  <div className="flex items-center gap-2 text-gray-600 mb-2">
                    <Warehouse className="h-4 w-4" />
                    <span className="text-sm font-medium">Stock Total</span>
                  </div>
                  <div className="text-lg font-semibold text-gray-900">{totalStock.toLocaleString()}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Details Card */}
          <Card className="border-2 border-blue-500/30 shadow-xl bg-gradient-to-br from-blue-50 to-sky-50">
            <CardHeader className="bg-gradient-to-r from-blue-500 to-sky-600 text-white">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Box className="h-6 w-6" />
                Detalle de Lotes
              </CardTitle>
              <p className="text-blue-100 text-sm mt-1">
                Total de lotes: {palletItems.length} | Stock total: {totalStock.toLocaleString()}
              </p>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-3">
                {palletItems.map((item, index) => (
                  <div
                    key={`${item.idqr}-${item.lote}-${index}`}
                    className="bg-white rounded-lg p-4 shadow-sm border border-blue-200 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="bg-blue-500 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold">
                            {index + 1}
                          </div>
                          <span className="text-sm text-gray-500">Lote</span>
                        </div>
                        <div className="text-xl font-bold text-gray-900 mb-1">{item.lote}</div>
                        <div className="text-sm text-gray-600 flex items-center gap-3 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Hash className="h-3.5 w-3.5" />
                            {item.codproducto}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {item.location}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-500 mb-1">Stock Total</div>
                        <div className="text-2xl font-bold text-blue-600">
                          {Number(item.stock_total).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Camera Scanner Dialog */}
      <QRCameraScanner isOpen={isCameraOpen} onClose={() => setIsCameraOpen(false)} onScan={handleQRScanned} />
    </div>
  )
}
