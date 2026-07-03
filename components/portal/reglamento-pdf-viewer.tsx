"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import "react-pdf/dist/Page/AnnotationLayer.css"
import "react-pdf/dist/Page/TextLayer.css"
import { Loader2 } from "lucide-react"

// Worker servido localmente desde /public para garantizar que la version
// coincida exactamente con la de pdfjs-dist instalada (evita el error
// "API version does not match Worker version").
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"

interface ReglamentoPdfViewerProps {
  /** Ruta del PDF a renderizar. */
  file: string
  /** Se invoca una sola vez cuando el usuario llega al final del documento. */
  onReachedEnd: () => void
}

/**
 * Visor de PDF scrollable: renderiza TODAS las paginas una debajo de otra
 * dentro de un contenedor con scroll propio. Un "sentinel" al final del
 * documento es observado con IntersectionObserver para detectar de forma
 * fiable cuando el trabajador completa la lectura (scroll completo), algo
 * imposible con un <iframe> de PDF por restricciones de origen cruzado.
 */
export default function ReglamentoPdfViewer({ file, onReachedEnd }: ReglamentoPdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [containerWidth, setContainerWidth] = useState<number>(0)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const reachedRef = useRef(false)

  // Medir el ancho del contenedor para que las paginas se ajusten responsivamente.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => setContainerWidth(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
  }, [])

  // Observar el sentinel: cuando entra en viewport del contenedor, el usuario
  // llego al final del documento.
  useEffect(() => {
    if (!numPages) return
    const root = containerRef.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel) return

    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !reachedRef.current) {
            reachedRef.current = true
            onReachedEnd()
          }
        }
      },
      { root, threshold: 0.9 },
    )
    obs.observe(sentinel)
    return () => obs.disconnect()
  }, [numPages, onReachedEnd])

  return (
    <div
      ref={containerRef}
      className="h-[60vh] overflow-y-auto rounded-lg border bg-muted/30 px-2 py-3"
    >
      <Document
        file={file}
        onLoadSuccess={onDocumentLoadSuccess}
        loading={
          <div className="flex h-[55vh] items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
            Cargando documento...
          </div>
        }
        error={
          <div className="flex h-[55vh] items-center justify-center text-center text-sm text-destructive">
            No se pudo cargar el documento. Recarga la pagina e intenta de nuevo.
          </div>
        }
        className="flex flex-col items-center gap-3"
      >
        {Array.from({ length: numPages }, (_, i) => (
          <Page
            key={`page_${i + 1}`}
            pageNumber={i + 1}
            width={containerWidth ? Math.min(containerWidth - 16, 900) : undefined}
            renderTextLayer
            renderAnnotationLayer
            className="shadow-sm"
          />
        ))}
      </Document>
      {/* Sentinel: marca el final del documento para detectar scroll completo. */}
      <div ref={sentinelRef} aria-hidden className="h-6 w-full" />
    </div>
  )
}
