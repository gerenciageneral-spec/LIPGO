"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Camera, X } from "lucide-react"
import { toast } from "@/hooks/use-toast"

interface QRCameraScannerProps {
  onScan: (code: string) => void
  buttonText?: string
  isOpen: boolean
  onClose: () => void
}

export function QRCameraScanner({ onScan, buttonText = "Escanear QR", isOpen, onClose }: QRCameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [scanning, setScanning] = useState(false)
  const scanningRef = useRef(false)

  const startCanvasFallback = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext("2d")
    if (!context) return

    const scanLoop = () => {
      if (!scanningRef.current || !videoRef.current) return

      const video = videoRef.current

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        context.drawImage(video, 0, 0, canvas.width, canvas.height)

        const imageData = context.getImageData(0, 0, canvas.width, canvas.height)

        // @ts-ignore - jsQR loaded from CDN
        if (typeof window !== "undefined" && window.jsQR) {
          try {
            // @ts-ignore
            const code = window.jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: "attemptBoth",
            })

            if (code && code.data) {
              console.log("[v0] QR Code detected (jsQR):", code.data)
              handleQRDetected(code.data)
              return
            }
          } catch (err) {
            console.error("[v0] jsQR error:", err)
          }
        }
      }

      if (scanningRef.current) {
        requestAnimationFrame(scanLoop)
      }
    }

    scanLoop()
  }

  useEffect(() => {
    if (isOpen) {
      startCamera()
    } else {
      stopCamera()
    }

    return () => {
      stopCamera()
    }
  }, [isOpen])

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
        await videoRef.current.play()
      }

      setStream(mediaStream)
      setScanning(true)
      scanningRef.current = true

      // Wait for video to be ready, then start scanning
      setTimeout(() => {
        startNativeScanning()
        startCanvasFallback()
      }, 500)
    } catch (error) {
      console.error("[v0] Error accessing camera:", error)
      toast({
        title: "Error de cámara",
        description: "No se pudo acceder a la cámara del dispositivo",
        variant: "destructive",
      })
      onClose()
    }
  }

  const startNativeScanning = async () => {
    if (!videoRef.current) return

    // @ts-ignore - BarcodeDetector API
    if (typeof window !== "undefined" && "BarcodeDetector" in window) {
      try {
        // @ts-ignore
        const barcodeDetector = new window.BarcodeDetector({ formats: ["qr_code"] })

        const scanLoop = async () => {
          if (!scanningRef.current || !videoRef.current) return

          try {
            const barcodes = await barcodeDetector.detect(videoRef.current)

            if (barcodes && barcodes.length > 0) {
              const qrValue = barcodes[0].rawValue.trim()
              console.log("[v0] QR Code detected (BarcodeDetector):", qrValue)
              handleQRDetected(qrValue)
              return
            }
          } catch (err) {
            console.error("[v0] BarcodeDetector scan error:", err)
          }

          if (scanningRef.current) {
            requestAnimationFrame(scanLoop)
          }
        }

        scanLoop()
      } catch (error) {
        console.error("[v0] BarcodeDetector error:", error)
      }
    }
  }

  const handleQRDetected = (qrValue: string) => {
    const trimmedValue = qrValue.trim()

    // QR Code full value
    console.log("[v0] QR Code full value:", trimmedValue)

    onScan(trimmedValue)
    stopCamera()
    onClose()

    toast({
      title: "QR Escaneado Exitosamente",
      description: `Código: ${trimmedValue}`,
    })
  }

  const stopCamera = () => {
    setScanning(false)
    scanningRef.current = false

    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
      setStream(null)
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Escanear Código QR
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative aspect-square bg-black rounded-lg overflow-hidden">
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />

            {/* Scanning overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-3/4 h-3/4 border-4 border-green-500 rounded-lg shadow-lg animate-pulse" />
            </div>

            {/* Scanning indicator */}
            {scanning && (
              <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-4 py-2 rounded-full text-sm font-medium">
                Escaneando...
              </div>
            )}
          </div>

          <canvas ref={canvasRef} className="hidden" />

          <div className="text-center text-sm text-muted-foreground">
            Apunte la cámara hacia el código QR. Se detectará automáticamente.
          </div>

          <Button variant="outline" className="w-full bg-transparent" onClick={onClose}>
            <X className="mr-2 h-4 w-4" />
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Hook to check if device is mobile
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor
      const mobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase())
      setIsMobile(mobile)
    }

    checkMobile()
    window.addEventListener("resize", checkMobile)

    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  return isMobile
}
