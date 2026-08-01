"use client"

// Etiquetas QR para pegar en el montacarga.
//
// El QR codifica la URL /equipo/{codigo_qr}, no el id: así el celular la abre
// con la cámara nativa sin app intermedia, y el código no es adivinable.
//
// Los QR se generan en el CLIENTE con `qrcode` (a data-URL), no en el
// servidor: no hay que subir imágenes a ningún lado ni guardar nada, y la
// etiqueta se puede reimprimir siempre igual desde el código.

import { useEffect, useState } from "react"
import QRCode from "qrcode"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, Printer } from "lucide-react"
import type { Montacarga } from "@/lib/montacargas-actions"

export function QrEtiquetas({ equipos, proyecto }: { equipos: Montacarga[]; proyecto: string }) {
  const [qrs, setQrs] = useState<Record<string, string>>({})
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let cancelado = false
    const generar = async () => {
      setCargando(true)
      const out: Record<string, string> = {}
      // `window.location.origin` para que el QR apunte al dominio desde el que
      // se imprime: en local a localhost y en producción a Vercel, sin
      // configurar nada.
      const base = typeof window !== "undefined" ? window.location.origin : ""
      for (const e of equipos) {
        if (!e.codigo_qr) continue
        try {
          out[e.codigo_qr] = await QRCode.toDataURL(`${base}/equipo/${e.codigo_qr}`, {
            width: 320,
            margin: 1,
            errorCorrectionLevel: "M", // el equipo se ensucia: algo de tolerancia ayuda
          })
        } catch {
          /* si uno falla, los demás se imprimen igual */
        }
      }
      if (!cancelado) {
        setQrs(out)
        setCargando(false)
      }
    }
    generar()
    return () => {
      cancelado = true
    }
  }, [equipos])

  if (cargando) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Generando los códigos…
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 no-print">
        <p className="text-sm text-muted-foreground">
          {equipos.length} etiqueta(s). Imprime, recorta y pega cada una en su equipo. Al escanearla desde el celular
          abre la hoja del montacarga para registrar el mantenimiento.
        </p>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" /> Imprimir
        </Button>
      </div>

      <div id="qr-etiquetas-print" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {equipos.map((e) => (
          <div
            key={e.codigo_qr}
            className="flex break-inside-avoid flex-col items-center rounded-lg border border-black/30 bg-white p-3 text-center text-black"
          >
            {qrs[e.codigo_qr] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrs[e.codigo_qr]} alt={`QR ${e.identificacion}`} className="h-32 w-32" />
            ) : (
              <div className="flex h-32 w-32 items-center justify-center text-[10px] text-red-600">
                No se pudo generar
              </div>
            )}
            <div className="mt-1.5 w-full">
              <div className="truncate text-sm font-bold leading-tight">{e.identificacion}</div>
              {e.alias && <div className="truncate text-[11px] leading-tight">{e.alias}</div>}
              <div className="truncate text-[10px] leading-tight">
                {[e.marca, e.modelo].filter(Boolean).join(" ") || "Montacarga"}
              </div>
              <div className="mt-0.5 truncate text-[9px] uppercase tracking-wide">{proyecto}</div>
            </div>
          </div>
        ))}
      </div>

      {equipos.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Crea primero los montacargas para poder imprimir sus etiquetas.
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default QrEtiquetas
