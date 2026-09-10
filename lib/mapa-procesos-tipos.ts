// Tipos y constantes del Mapa de Procesos.
//
// Viven aparte de `mapa-procesos-actions.ts` porque ese archivo es `"use server"`
// y ahí SOLO se pueden exportar funciones async: exportar una constante o un
// tipo desde un archivo de server actions rompe el build (el typecheck no lo
// detecta, el bundler sí).

/** Las tres listas de documentos de cada proceso. */
export type CategoriaDoc = "formato" | "informacion" | "registro"

export const CATEGORIAS: Array<{ id: CategoriaDoc; label: string; ayuda: string }> = [
  {
    id: "formato",
    label: "Formatos",
    ayuda: "Plantillas en blanco que el proceso usa para registrar su trabajo.",
  },
  {
    id: "informacion",
    label: "Información documentada",
    ayuda: "Procedimientos, instructivos, manuales y políticas del proceso.",
  },
  {
    id: "registro",
    label: "Registros",
    ayuda: "Evidencia de lo ejecutado: formatos ya diligenciados, actas, reportes.",
  },
]

/** Tope del Server Action. Se avisa ANTES de subir para no esperar en vano. */
export const MAX_MB_DOCUMENTO = 25

export interface DocumentoProceso {
  id: string
  codigo: string
  nombre: string
  version: string
  categoria: CategoriaDoc | null
  procesoId: string | null
  archivoUrl: string | null
  archivoNombre: string | null
  estado: string | null
  subidoPor: string | null
  actualizadoAt: string | null
}

export interface GuardarDocumentoInput {
  /** Presente = editar; ausente = crear. */
  id?: string
  procesoId: string
  categoria: CategoriaDoc
  codigo: string
  nombre: string
  version: string
  archivoUrl?: string | null
  archivoNombre?: string | null
}
