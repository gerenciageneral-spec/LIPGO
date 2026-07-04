// =====================================================================
// Adaptador de canal WhatsApp (Meta Cloud API) con MODO SIMULACION.
// =====================================================================
// Toda la app envia mensajes a traves de `enviarWhatsApp(...)`. Detras
// de esa interfaz hay dos comportamientos, gobernados por la variable
// de entorno WHATSAPP_ENABLED:
//
//   WHATSAPP_ENABLED != "true"  -> MODO SIMULACION (default):
//       No se llama a Meta, no se gasta y no se depende de la aprobacion
//       del negocio. Devuelve estado "simulado". Sirve para ver el modulo
//       funcionando hoy con datos reales del personal.
//
//   WHATSAPP_ENABLED == "true"  -> ENVIO REAL:
//       Llama a la Graph API con WHATSAPP_PHONE_NUMBER_ID y
//       WHATSAPP_ACCESS_TOKEN. Devuelve el wamid del mensaje.
//
// Cuando Meta apruebe el negocio y las plantillas, solo se ponen las
// credenciales en .env.local y WHATSAPP_ENABLED=true. Cero reescritura.
// =====================================================================

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v21.0"

export type EstadoEnvio = "simulado" | "enviado" | "error" | "sin_celular"

export interface ResultadoEnvio {
  estado: EstadoEnvio
  /** wamid devuelto por Meta (solo en envio real). */
  proveedorMsgId?: string
  /** Celular normalizado a E.164 al que se dirigio (o intento). */
  celular?: string
  /** Detalle si estado === "error". */
  error?: string
}

export interface ParametrosEnvio {
  /** Celular tal como esta en la base (se normaliza aca dentro). */
  celular: string
  /**
   * Texto ya renderizado del mensaje. En MODO SIMULACION es lo unico
   * que se necesita. En envio real, si `plantilla` esta definida se
   * envia como plantilla; si no, se envia como texto libre (solo valido
   * dentro de la ventana de 24h de servicio).
   */
  mensaje: string
  /** Nombre de la plantilla aprobada en Meta (envio real). */
  plantilla?: string
  /** Codigo de idioma de la plantilla (ej. "es" o "es_CO"). */
  idioma?: string
  /** Variables en orden para los {{1}}, {{2}}... de la plantilla. */
  variables?: string[]
}

/**
 * Normaliza un celular colombiano a formato E.164 sin el "+".
 * WhatsApp Cloud API espera el numero en digitos con indicativo de pais
 * y sin signos: p.ej. "3001234567" -> "573001234567".
 *
 * Devuelve null si no parece un movil colombiano valido (10 digitos
 * empezando por 3, con o sin el 57 delante).
 */
export function normalizarCelularCO(raw: string | null | undefined): string | null {
  if (!raw) return null
  // Deja solo digitos (quita +, espacios, guiones, parentesis).
  let d = String(raw).replace(/\D/g, "")
  if (!d) return null
  // Quita 00 de marcado internacional.
  if (d.startsWith("00")) d = d.slice(2)
  // Ya trae indicativo Colombia (57) + 10 digitos de movil.
  if (d.length === 12 && d.startsWith("57") && d[2] === "3") return d
  // 10 digitos locales empezando por 3 -> antepone 57.
  if (d.length === 10 && d.startsWith("3")) return "57" + d
  // No reconocido como movil CO.
  return null
}

/**
 * Envia (o simula) un mensaje de WhatsApp a un celular.
 * Nunca lanza: cualquier fallo se devuelve como estado "error" para que
 * el llamador pueda registrar la auditoria fila por fila.
 */
export async function enviarWhatsApp(params: ParametrosEnvio): Promise<ResultadoEnvio> {
  const celular = normalizarCelularCO(params.celular)
  if (!celular) {
    return { estado: "sin_celular", error: "Celular invalido o vacio" }
  }

  const habilitado = process.env.WHATSAPP_ENABLED === "true"

  // ---- MODO SIMULACION ----
  if (!habilitado) {
    return { estado: "simulado", celular }
  }

  // ---- ENVIO REAL (Meta Cloud API) ----
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!phoneNumberId || !token) {
    return {
      estado: "error",
      celular,
      error: "WHATSAPP_ENABLED=true pero faltan WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN",
    }
  }

  // Cuerpo: plantilla si se especifico, de lo contrario texto libre.
  let body: Record<string, unknown>
  if (params.plantilla) {
    const componentes =
      params.variables && params.variables.length > 0
        ? [
            {
              type: "body",
              parameters: params.variables.map((v) => ({ type: "text", text: v })),
            },
          ]
        : []
    body = {
      messaging_product: "whatsapp",
      to: celular,
      type: "template",
      template: {
        name: params.plantilla,
        language: { code: params.idioma || "es" },
        ...(componentes.length > 0 ? { components: componentes } : {}),
      },
    }
  } else {
    body = {
      messaging_product: "whatsapp",
      to: celular,
      type: "text",
      text: { body: params.mensaje },
    }
  }

  try {
    const resp = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    )

    const data = (await resp.json()) as {
      messages?: { id: string }[]
      error?: { message?: string }
    }

    if (!resp.ok) {
      return {
        estado: "error",
        celular,
        error: data?.error?.message || `HTTP ${resp.status}`,
      }
    }

    return {
      estado: "enviado",
      celular,
      proveedorMsgId: data?.messages?.[0]?.id,
    }
  } catch (e) {
    return {
      estado: "error",
      celular,
      error: e instanceof Error ? e.message : "Error de red al enviar a Meta",
    }
  }
}
