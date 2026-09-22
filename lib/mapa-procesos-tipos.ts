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


// ---------------------------------------------------------------------------
// LOS PROCESOS DEL MAPA
//
// Estaban dentro de `components/sig/mapa-procesos.tsx`. Se mueven aquí porque
// ahora hay dos pantallas que necesitan la misma lista: el mapa y la de
// permisos. Con dos copias, agregar un proceso al mapa y olvidar la otra lista
// dejaría un proceso que nadie puede autorizar --y sin ningún error que lo
// delate: el botón simplemente no abriría para nadie.
//
// OJO: existe una tabla `sig_procesos` con OTRA taxonomía (DE, CD, GH...) que
// usa No Conformidades. No es esta lista. Los códigos de aquí son los que se
// guardan en `sig_documentos.proceso_id`.
// ---------------------------------------------------------------------------

export type TipoProceso = "Estratégico" | "Misional" | "Apoyo" | "Interfaz"

export interface Proceso {
  id: string
  codigo: string
  nombre: string
  tipo: TipoProceso
}

/** Los tres grupos del mapa. El prefijo arma el código (E-01, M-01, A-01…). */
export const GRUPOS: Record<
  "estrategicos" | "misionales" | "apoyo",
  { tipo: TipoProceso; pref: string; items: string[] }
> = {
  estrategicos: {
    tipo: "Estratégico",
    pref: "E",
    items: ["Proceso Estratégico", "Proceso SGI", "Proceso Gestión IT (Innovación y Tecnología)"],
  },
  misionales: {
    tipo: "Misional",
    pref: "M",
    items: ["Gestión Proceso Comercial", "Gestión de Operaciones y Prestación de Servicio"],
  },
  apoyo: {
    tipo: "Apoyo",
    pref: "A",
    items: [
      "Gestión de Talento Humano",
      "Gestión de Mantenimiento",
      "Gestión de Compras",
      "Gestión Financiera y Contable",
    ],
  },
}

/** Los once procesos: los nueve del mapa más la entrada y la salida. */
function construirProcesos(): Proceso[] {
  const out: Proceso[] = []
  for (const g of Object.values(GRUPOS)) {
    g.items.forEach((nombre, i) => {
      out.push({
        id: `${g.pref}-${String(i + 1).padStart(2, "0")}`,
        codigo: `${g.pref}-${String(i + 1).padStart(2, "0")}`,
        nombre,
        tipo: g.tipo,
      })
    })
  }
  out.push({
    id: "IN-01",
    codigo: "IN-01",
    nombre: "Requerimientos del usuario y partes interesadas",
    tipo: "Interfaz",
  })
  out.push({
    id: "OUT-01",
    codigo: "OUT-01",
    nombre: "Satisfacción del usuario y partes interesadas",
    tipo: "Interfaz",
  })
  return out
}

export const PROCESOS = construirProcesos()
