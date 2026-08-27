// Subida de soportes del recobro de incapacidades desde el navegador.
//
// Vive aquí y no dentro de cada componente porque hay TRES puntos de subida —el
// soporte clínico en Ausentismos, y el correo radicado y el comprobante de pago
// en Recobro— y los tres tienen que comportarse igual: si uno arregla el límite
// de tamaño y los otros no, el error reaparece por donde nadie lo está mirando.

import { supabase } from "@/lib/supabase"

/** Tope del bucket. Se avisa ANTES de subir para no hacer esperar en vano. */
export const MAX_MB_SOPORTE = 50

export interface ResultadoSubida {
  success: boolean
  url?: string
  error?: string
}

/**
 * Lee la respuesta como TEXTO y recién ahí intenta interpretarla como JSON.
 *
 * Es la línea que evita el error que reportó el usuario. Cuando el archivo pasa
 * el tope de la función serverless, la plataforma responde "Request Entity Too
 * Large" en texto plano; `res.json()` reventaba con "unexpected token 'Request
 * En'... is not valid JSON", que no dice nada de la causa. Así el cuerpo crudo
 * queda disponible para mostrarlo.
 */
async function leerRespuesta(res: Response): Promise<{ datos: any; crudo: string }> {
  const crudo = await res.text()
  try {
    return { datos: crudo ? JSON.parse(crudo) : null, crudo }
  } catch {
    return { datos: null, crudo }
  }
}

/**
 * Sube un soporte y devuelve su URL pública.
 *
 * El archivo va del navegador DIRECTO a Supabase Storage mediante una URL
 * firmada que emite `/api/recobro/upload`. NO pasa por la función serverless,
 * cuyo cuerpo se corta alrededor de 4,5 MB — un límite de la plataforma, no
 * configurable— que un PDF escaneado supera con facilidad.
 *
 * Nunca lanza: devuelve `success: false` con un mensaje que se pueda mostrar.
 */
export async function subirSoporteRecobro(
  file: File,
  opciones: { id: string; tipo: string },
): Promise<ResultadoSubida> {
  if (!file) return { success: false, error: "No se seleccionó ningún archivo." }

  if (file.size > MAX_MB_SOPORTE * 1024 * 1024) {
    return {
      success: false,
      error: `El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y el máximo son ${MAX_MB_SOPORTE} MB.`,
    }
  }

  try {
    // 1) El servidor emite la URL firmada. Aquí solo viaja el nombre del
    //    archivo, así que esta petición nunca choca con el tope de tamaño.
    const resFirma = await fetch("/api/recobro/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: opciones.id, tipo: opciones.tipo, nombre: file.name }),
    })
    const { datos: firma, crudo } = await leerRespuesta(resFirma)

    if (!resFirma.ok || !firma?.token || !firma?.path) {
      console.error("[v0] recobro upload firma:", resFirma.status, crudo)
      return {
        success: false,
        error:
          firma?.error ||
          crudo.slice(0, 200) ||
          `El servidor respondió ${resFirma.status} sin explicación.`,
      }
    }

    // 2) El archivo va del navegador a Supabase. El tope de la función deja de
    //    aplicar; el único límite que queda es el del bucket.
    const { error: errSubida } = await supabase.storage
      .from("archivos")
      .uploadToSignedUrl(firma.path, firma.token, file, {
        contentType: file.type || "application/octet-stream",
      })

    if (errSubida) {
      console.error("[v0] recobro upload a Supabase:", errSubida)
      return {
        success: false,
        error: errSubida.message || "El almacenamiento rechazó el archivo.",
      }
    }

    return { success: true, url: firma.url }
  } catch (err: any) {
    // Aquí solo deberían llegar fallos de red reales.
    console.error("[v0] recobro upload excepción:", err)
    return { success: false, error: err?.message || "No se pudo contactar al servidor." }
  }
}
