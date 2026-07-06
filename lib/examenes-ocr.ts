// Lectura automática del "Concepto de aptitud" de un examen médico ocupacional
// (PDF o imagen) con Claude (visión). Regla de negocio LIP:
//   - "Sin restricciones"                         => APTO
//   - "Aplazado para cargue y descargue" (o toda   => NO APTO
//      restricción/aplazamiento que impida cargue/descargue)
//   - No se encuentra el concepto                  => pendiente (null, revisión manual)
// Sin "use server": se importa desde rutas y server actions.

const MODEL = "claude-haiku-4-5"

const PROMPT =
  'Eres un lector de certificados médicos ocupacionales colombianos. Localiza SIEMPRE el ' +
  'campo "Concepto de aptitud" (suele estar en la sección "Concepto de aptitud"). ' +
  'Devuelve EXCLUSIVAMENTE un JSON válido, sin texto adicional ni markdown, con esta forma: ' +
  '{"concepto": "<texto exacto del concepto de aptitud tal cual aparece>", "apto": true|false|null}. ' +
  'El cargo base es de CARGUE Y DESCARGUE (operario logístico). Clasifica así: ' +
  '(1) "Sin restricciones", o "Apto" sin condiciones que afecten el cargue y descargue => apto=true. ' +
  '(2) "Aplazado para cargue y descargue", "No apto", o cualquier concepto que IMPIDA las labores de ' +
  'cargue y descargue => apto=false. ' +
  '(3) Restricción PARCIAL que NO impide el cargue y descargue pero sí otra actividad (p. ej. ' +
  '"Aplazado para manipular alimentos") y donde la persona "puede laborar con recomendaciones" o ' +
  '"apto con recomendaciones": depende del cargo => apto=null (revisión manual). ' +
  '(4) Si no logras leer el concepto => concepto=null y apto=null. ' +
  'No inventes: si dudas del texto, apto=null.'

export interface ConceptoExamen {
  concepto: string | null
  apto: boolean | null
}

function mediaTypeDeUrl(url: string): string {
  const ext = (url.split("?")[0].split(".").pop() || "").toLowerCase()
  if (ext === "png") return "image/png"
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg"
  if (ext === "webp") return "image/webp"
  return "application/pdf" // por defecto PDF (formato usual del certificado)
}

// Lee el concepto a partir del contenido en base64.
export async function leerConceptoAptitud(base64: string, mediaType: string): Promise<ConceptoExamen> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key || !base64) return { concepto: null, apto: null }

  const esPdf = mediaType === "application/pdf"
  const bloqueDoc = esPdf
    ? { type: "document", source: { type: "base64", media_type: mediaType, data: base64 } }
    : { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        messages: [{ role: "user", content: [bloqueDoc, { type: "text", text: PROMPT }] }],
      }),
    })
    if (!res.ok) {
      console.error("[examenes-ocr] API", res.status, (await res.text()).slice(0, 200))
      return { concepto: null, apto: null }
    }
    const j: any = await res.json()
    const text: string = j?.content?.[0]?.text || ""
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return { concepto: null, apto: null }
    const parsed = JSON.parse(m[0])
    const apto = parsed.apto === true ? true : parsed.apto === false ? false : null
    const concepto = typeof parsed.concepto === "string" && parsed.concepto.trim() ? parsed.concepto.trim() : null
    return { concepto, apto }
  } catch (e: any) {
    console.error("[examenes-ocr] error:", e?.message || e)
    return { concepto: null, apto: null }
  }
}

// Lee el concepto descargando el documento desde su URL pública (Storage).
export async function leerConceptoAptitudDesdeUrl(url: string): Promise<ConceptoExamen> {
  try {
    if (!url) return { concepto: null, apto: null }
    const res = await fetch(url)
    if (!res.ok) return { concepto: null, apto: null }
    const b64 = Buffer.from(await res.arrayBuffer()).toString("base64")
    return await leerConceptoAptitud(b64, mediaTypeDeUrl(url))
  } catch {
    return { concepto: null, apto: null }
  }
}
