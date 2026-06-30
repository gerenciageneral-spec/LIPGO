"use client"

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import { Button } from "@/components/ui/button"
import { Eraser } from "lucide-react"

// Pad de firma minimalista basado en <canvas> nativo. No depende de
// librerias externas. Soporta mouse y touch. El padre puede:
//   - leer si esta vacio (ref.isEmpty())
//   - convertir el trazo a Blob PNG (ref.toBlob())
//   - limpiar (ref.clear())
export interface SignaturePadHandle {
  isEmpty: () => boolean
  toBlob: () => Promise<Blob | null>
  clear: () => void
}

interface SignaturePadProps {
  className?: string
  height?: number
}

export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(
  function SignaturePad({ className, height = 180 }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const drawingRef = useRef(false)
    const lastRef = useRef<{ x: number; y: number } | null>(null)
    const [empty, setEmpty] = useState(true)

    // Ajusta la resolucion del canvas al tamano renderizado teniendo
    // en cuenta el devicePixelRatio para que la firma no se vea
    // pixelada en pantallas retina / moviles.
    useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const resize = () => {
        const dpr = window.devicePixelRatio || 1
        const rect = canvas.getBoundingClientRect()
        canvas.width = rect.width * dpr
        canvas.height = rect.height * dpr
        const ctx = canvas.getContext("2d")
        if (ctx) {
          ctx.scale(dpr, dpr)
          ctx.lineWidth = 2
          ctx.lineCap = "round"
          ctx.lineJoin = "round"
          ctx.strokeStyle = "#111827"
          // Fondo blanco para que la imagen exportada tenga contraste
          // (los PNGs con fondo transparente se ven mal cuando se
          // imprimen sobre papel blanco escaneado).
          ctx.fillStyle = "#ffffff"
          ctx.fillRect(0, 0, rect.width, rect.height)
        }
      }
      resize()
      window.addEventListener("resize", resize)
      return () => window.removeEventListener("resize", resize)
    }, [])

    const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current!
      const rect = canvas.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    const handleDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault()
      drawingRef.current = true
      lastRef.current = getPos(e)
      ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)
    }

    const handleMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return
      const ctx = canvasRef.current?.getContext("2d")
      if (!ctx || !lastRef.current) return
      const pos = getPos(e)
      ctx.beginPath()
      ctx.moveTo(lastRef.current.x, lastRef.current.y)
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
      lastRef.current = pos
      if (empty) setEmpty(false)
    }

    const handleUp = () => {
      drawingRef.current = false
      lastRef.current = null
    }

    const clear = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      const rect = canvas.getBoundingClientRect()
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, rect.width, rect.height)
      setEmpty(true)
    }

    useImperativeHandle(ref, () => ({
      isEmpty: () => empty,
      clear,
      toBlob: () =>
        new Promise<Blob | null>((resolve) => {
          const canvas = canvasRef.current
          if (!canvas) return resolve(null)
          canvas.toBlob((blob) => resolve(blob), "image/png")
        }),
    }))

    return (
      <div className={className}>
        <div className="border rounded-md bg-white" style={{ height }}>
          <canvas
            ref={canvasRef}
            className="w-full h-full touch-none rounded-md cursor-crosshair"
            onPointerDown={handleDown}
            onPointerMove={handleMove}
            onPointerUp={handleUp}
            onPointerCancel={handleUp}
            onPointerLeave={handleUp}
          />
        </div>
        <div className="flex justify-between items-center mt-1">
          <span className="text-xs text-muted-foreground">
            Firme dentro del recuadro
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clear}
            className="h-7 gap-1 text-xs"
          >
            <Eraser className="w-3 h-3" />
            Limpiar
          </Button>
        </div>
      </div>
    )
  },
)
