// Tipos de la mensajería por WhatsApp.
//
// Aparte del archivo de acciones porque ese es "use server" y esos archivos
// solo pueden exportar funciones async.

export type EstadoMensaje = "enviado" | "entregado" | "leido" | "fallido" | "error"

export interface PlantillaWhatsapp {
  id: number
  nombre: string
  idioma: string
  descripcion: string | null
  uso: string | null
  /** Nombres legibles de las variables, POR POSICIÓN. */
  variables: { header: string[]; body: string[] }
  activa: boolean
}

export interface MensajeWhatsapp {
  id: string
  telefono: string
  nombre: string | null
  plantilla: string | null
  estado: EstadoMensaje
  errorCodigo: string | null
  errorDetalle: string | null
  origen: string | null
  enviadoPor: string | null
  creadoEn: string
  entregadoEn: string | null
  leidoEn: string | null
  /** Los valores que se sustituyeron, para reconstruir el mensaje. */
  parametros: { header?: string[]; body?: string[] } | null
}

/** Estado de la configuración, sin exponer el token. */
export interface EstadoConfigWhatsapp {
  /** true = las variables de entorno están puestas. */
  configurado: boolean
  faltantes: string[]
  /** Solo los últimos 4 caracteres, para confirmar cuál token está activo. */
  tokenFinal: string | null
  phoneNumberId: string | null
  apiVersion: string
  /** Lo que responde Meta al consultar el número. null = no se pudo. */
  numeroVerificado: string | null
  nombreVerificado: string | null
  /**
   * Calidad del número según Meta: GREEN | YELLOW | RED | UNKNOWN.
   *
   * Baja cuando la gente bloquea o reporta los mensajes, y arrastra consigo el
   * límite de envíos diarios. Se pedía a Meta pero se descartaba, así que
   * cuando los envíos empezaban a fallar no había dónde mirar.
   */
  calidadNumero: string | null
  mensajeError: string | null
}

export interface EnviarPlantillaInput {
  empresaId?: number | null
  /** Número en cualquier formato: se normaliza a E.164 de Colombia. */
  telefono: string
  plantilla: string
  idioma?: string
  /** Valores del encabezado, en orden. */
  header?: string[]
  /** Valores del cuerpo, en orden. */
  body?: string[]
  /**
   * Nombres de las variables, cuando la plantilla usa {{nombre}} en vez de
   * {{1}}. Si vienen, cada parametro viaja con su `parameter_name`.
   */
  nombresHeader?: string[]
  nombresBody?: string[]
  /**
   * Identificador de una imagen ya subida a Meta, para plantillas cuyo
   * encabezado es de tipo IMAGE.
   *
   * Solo sirve si la plantilla se CREÓ con encabezado de imagen: no se le
   * puede poner una a un encabezado de texto. Y al revés, una plantilla de
   * encabezado imagen enviada sin esto falla.
   *
   * Excluyente con `header`, que es para encabezados de texto.
   */
  headerImagenId?: string
  /** Qué flujo lo dispara. Sirve para medir volumen y costo. */
  origen?: string
  identificacion?: string | null
  nombre?: string | null
}

export interface ResultadoEnvio {
  success: boolean
  messageId?: string
  message?: string
  /** Código de error de Meta, cuando lo hay. */
  codigo?: string
}
