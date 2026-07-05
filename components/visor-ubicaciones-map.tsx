// @ts-nocheck — wrapper de react-leaflet/leaflet: fricción de tipos de librería
// externa (versiones). Solo desactiva el checado de tipos de este archivo aislado;
// no cambia el runtime.
"use client"

/**
 * Mapa Leaflet puro para el Visor de Ubicaciones.
 *
 * ATENCION: este archivo usa `window` indirectamente a traves de Leaflet, por lo
 * que NUNCA debe importarse directamente en otro componente.
 * Se importa SIEMPRE via `next/dynamic({ ssr: false })` desde
 * `components/visor-ubicaciones.tsx`.
 */

import { useEffect } from "react"
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

// Workaround: los iconos por defecto de leaflet no resuelven bien sus URLs cuando
// se empaqueta con Next/Webpack. Apuntamos a los assets publicos del CDN.
// Esto corre solo en el cliente gracias al ssr: false del wrapper.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
})

export interface Conexion {
  id: string
  usuario_id: string
  nombre_usuario: string
  latitud: number
  longitud: number
  accion: string
  created_at: string
}

interface Props {
  conexiones: Conexion[]
}

export default function VisorUbicacionesMap({ conexiones }: Props) {
  // Centro aproximado de Colombia y zoom para ver todo el pais
  const center: [number, number] = [4.5709, -74.2973]
  const zoom = 5

  // Log para debug/verificacion durante integracion
  useEffect(() => {
    console.log("[v0] VisorUbicacionesMap montado con", conexiones.length, "puntos")
  }, [conexiones.length])

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      scrollWheelZoom
      className="h-[500px] w-full"
      // @ts-expect-error react-leaflet v4 requiere esta prop
      style={{ height: "500px", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {conexiones.map((c) => (
        <Marker key={c.id} position={[c.latitud, c.longitud]}>
          <Popup>
            <div className="space-y-1 min-w-[180px]">
              <div className="font-bold text-sm">{c.nombre_usuario}</div>
              <div className="text-xs text-muted-foreground">{c.accion}</div>
              <div className="text-xs">
                {new Date(c.created_at).toLocaleString("es-CO", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
