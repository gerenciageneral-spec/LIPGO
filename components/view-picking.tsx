"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FileText, ImageIcon, X, ChevronLeft, ChevronRight } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { getViewPickingOrders } from "@/lib/view-picking-actions"
import { useAuth } from "@/components/auth-provider"

interface PickingOrder {
  id: number
  ordendecargue: string
  fechaorden: string | null
  fechacargue: string | null
  pesoorden: number | null
  iniciocargue: string | null
  fincargue: string | null
  auxiliares: string | null
  doccargue: string | null
  fotospicking: string | null
}

export function ViewPicking() {
  const { selectedEmpresaId } = useAuth()
  const [orders, setOrders] = useState<PickingOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [photosDialogOpen, setPhotosDialogOpen] = useState(false)
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([])
  const [selectedOrderNumber, setSelectedOrderNumber] = useState("")
  const [fullscreenPhotoIndex, setFullscreenPhotoIndex] = useState<number | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    if (selectedEmpresaId) {
      loadOrders()
    }
  }, [selectedEmpresaId])

  const loadOrders = async () => {
    try {
      setLoading(true)
      const result = await getViewPickingOrders(selectedEmpresaId)

      if (result.success) {
        setOrders(result.data)
      } else {
        toast({
          title: "Error",
          description: result.message || "Error al cargar las órdenes",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("[v0] Error loading picking orders:", error)
      toast({
        title: "Error",
        description: "Error al cargar las órdenes de picking",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (date: string | null) => {
    if (!date) return "-"
    const d = new Date(date + "T00:00:00")
    return d.toLocaleDateString("es-CO", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
  }

  const formatTime = (time: string | null) => {
    if (!time) return "-"
    return time
  }

  const formatWeight = (weight: number | null) => {
    if (!weight) return "-"
    return weight.toFixed(2)
  }

  const formatAuxiliares = (auxiliares: string | null) => {
    if (!auxiliares) return "-"
    const auxList = auxiliares.split(",").map((aux) => aux.trim())
    return (
      <div className="flex flex-col gap-0.5">
        {auxList.map((aux, index) => (
          <div key={index} className="text-[10px]">
            • {aux}
          </div>
        ))}
      </div>
    )
  }

  const handleOpenPDF = (pdfUrl: string | null) => {
    if (!pdfUrl) {
      toast({
        title: "PDF no disponible",
        description: "No hay PDF de picking para esta orden",
        variant: "destructive",
      })
      return
    }
    window.open(pdfUrl, "_blank")
  }

  const handleViewPhotos = (fotospicking: string | null, ordendecargue: string) => {
    if (!fotospicking) {
      toast({
        title: "Fotos no disponibles",
        description: "No hay fotos para esta orden de picking",
        variant: "destructive",
      })
      return
    }

    try {
      const photoUrls = JSON.parse(fotospicking)
      if (Array.isArray(photoUrls) && photoUrls.length > 0) {
        setSelectedPhotos(photoUrls)
        setSelectedOrderNumber(ordendecargue)
        setPhotosDialogOpen(true)
      } else {
        toast({
          title: "Fotos no disponibles",
          description: "No hay fotos para esta orden de picking",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("[v0] Error parsing fotospicking:", error)
      toast({
        title: "Error",
        description: "Error al cargar las fotos",
        variant: "destructive",
      })
    }
  }

  const handlePhotoClick = (index: number) => {
    setFullscreenPhotoIndex(index)
  }

  const handleNextPhoto = () => {
    if (fullscreenPhotoIndex !== null && fullscreenPhotoIndex < selectedPhotos.length - 1) {
      setFullscreenPhotoIndex(fullscreenPhotoIndex + 1)
    }
  }

  const handlePrevPhoto = () => {
    if (fullscreenPhotoIndex !== null && fullscreenPhotoIndex > 0) {
      setFullscreenPhotoIndex(fullscreenPhotoIndex - 1)
    }
  }

  const handleCloseFullscreen = () => {
    setFullscreenPhotoIndex(null)
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Ver Picking
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Cargando órdenes de picking...</div>
          ) : (
            <div className="relative">
              <div className="overflow-x-auto">
                <div className="max-h-[600px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="text-xs">Orden de Cargue</TableHead>
                        <TableHead className="text-xs">Fecha Orden</TableHead>
                        <TableHead className="text-xs">Fecha Cargue</TableHead>
                        <TableHead className="text-xs">Peso Orden (ton)</TableHead>
                        <TableHead className="text-xs">Inicio Cargue</TableHead>
                        <TableHead className="text-xs">Fin Cargue</TableHead>
                        <TableHead className="text-xs">Auxiliares</TableHead>
                        <TableHead className="text-xs">PDF Picking</TableHead>
                        <TableHead className="text-xs">Fotos</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                            No hay órdenes de picking disponibles
                          </TableCell>
                        </TableRow>
                      ) : (
                        orders.map((order) => (
                          <TableRow key={order.id}>
                            <TableCell className="text-xs font-medium">{order.ordendecargue}</TableCell>
                            <TableCell className="text-xs">{formatDate(order.fechaorden)}</TableCell>
                            <TableCell className="text-xs">{formatDate(order.fechacargue)}</TableCell>
                            <TableCell className="text-xs text-center">{formatWeight(order.pesoorden)}</TableCell>
                            <TableCell className="text-xs">{formatTime(order.iniciocargue)}</TableCell>
                            <TableCell className="text-xs">{formatTime(order.fincargue)}</TableCell>
                            <TableCell className="text-[10px]">{formatAuxiliares(order.auxiliares)}</TableCell>
                            <TableCell className="text-xs">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => handleOpenPDF(order.doccargue)}
                                disabled={!order.doccargue}
                              >
                                <FileText className="h-5 w-5 text-fuchsia-500" />
                              </Button>
                            </TableCell>
                            <TableCell className="text-xs">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => handleViewPhotos(order.fotospicking, order.ordendecargue)}
                                disabled={!order.fotospicking}
                              >
                                <ImageIcon className="h-5 w-5 text-blue-500" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={photosDialogOpen} onOpenChange={setPhotosDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Fotos de Picking - {selectedOrderNumber}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 py-4">
            {selectedPhotos.map((photoUrl, index) => (
              <div
                key={index}
                className="relative border rounded-lg overflow-hidden bg-muted cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                onClick={() => handlePhotoClick(index)}
              >
                <img
                  src={photoUrl || "/placeholder.svg"}
                  alt={`Foto ${index + 1}`}
                  className="w-full h-64 object-cover"
                  onError={(e) => {
                    e.currentTarget.src = "/placeholder.svg?height=256&width=256"
                  }}
                />
                <div className="absolute top-2 right-2 bg-black/70 text-white px-2 py-1 rounded text-xs">
                  {index + 1} / {selectedPhotos.length}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {fullscreenPhotoIndex !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={handleCloseFullscreen}
        >
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 text-white hover:bg-white/20"
            onClick={handleCloseFullscreen}
          >
            <X className="h-6 w-6" />
          </Button>

          {fullscreenPhotoIndex > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20"
              onClick={(e) => {
                e.stopPropagation()
                handlePrevPhoto()
              }}
            >
              <ChevronLeft className="h-8 w-8" />
            </Button>
          )}

          {fullscreenPhotoIndex < selectedPhotos.length - 1 && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20"
              onClick={(e) => {
                e.stopPropagation()
                handleNextPhoto()
              }}
            >
              <ChevronRight className="h-8 w-8" />
            </Button>
          )}

          <div className="max-w-[90vw] max-h-[90vh] relative" onClick={(e) => e.stopPropagation()}>
            <img
              src={selectedPhotos[fullscreenPhotoIndex] || "/placeholder.svg"}
              alt={`Foto ${fullscreenPhotoIndex + 1}`}
              className="max-w-full max-h-[90vh] object-contain"
              onError={(e) => {
                e.currentTarget.src = "/placeholder.svg?height=600&width=600"
              }}
            />
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-lg text-sm">
              {fullscreenPhotoIndex + 1} / {selectedPhotos.length}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
