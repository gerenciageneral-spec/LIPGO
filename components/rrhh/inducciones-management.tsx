"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/components/auth-provider"
import {
  Plus,
  Edit2,
  Trash2,
  Loader2,
  GraduationCap,
  HelpCircle,
  CheckCircle2,
  CalendarClock,
  CircleDashed,
  Users,
  Search,
  FolderOpen,
  Upload,
  ExternalLink,
  Copy,
  Download,
  X,
  UserMinus,
  AlertTriangle,
} from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import {
  listInduccionesAdmin,
  getInduccionAdmin,
  guardarInduccion,
  eliminarInduccion,
  duplicarInduccionEnEmpresas,
  programarInduccion,
  listTrabajadoresEmpresa,
  type InduccionAdmin,
  type PreguntaAdmin,
  type TrabajadorOpcion,
  type EstadoInduccion,
} from "@/lib/inducciones-actions"
import { getAccessibleEmpresesFromPermisos } from "@/lib/orders-actions"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { IndicadorInduccionesTab } from "@/components/rrhh/indicador-inducciones"
import { CarpetasTrabajadores } from "@/components/rrhh/carpetas-trabajadores"

interface FormState {
  id: string | null
  tema: string
  descripcion: string
  codigo_sig: string
  material_url: string
  obligatoria: boolean
  activa: boolean
  esAdmin: boolean
  tipo: string
  mes: string
  anio: string
  puntaje_aprobacion: string
}

// Opciones del selector de tipo. El value es el valor normalizado que se
// almacena en la columna `tipo` de capacitaciones; el label es el texto visible.
const TIPO_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "induccion", label: "Inducción" },
  { value: "capacitacion", label: "Capacitación" },
  { value: "re_induccion", label: "Re Inducción" },
]

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

const AHORA = new Date()
// Rango de anios seleccionables: anio anterior hasta dos anios adelante.
const ANIOS = Array.from({ length: 4 }, (_, i) => AHORA.getFullYear() - 1 + i)

// Etiqueta "Mes Anio" a partir de la fecha programada 'YYYY-MM-DD'.
// Vive fuera del componente porque tambien la usan el filtro de columna y el
// armado de sus opciones, que se calculan antes de renderizar.
function labelProgramada(fecha: string | null): string {
  if (!fecha) return "Sin programar"
  const [y, m] = fecha.split("-")
  const mi = parseInt(m, 10) - 1
  if (mi < 0 || mi > 11) return "Sin programar"
  return `${MESES[mi]} ${y}`
}

const ETIQUETA_ESTADO: Record<EstadoInduccion, string> = {
  sin_programar: "Sin programar",
  programada: "Programada",
  ejecutada: "Ejecutada",
}

const ORDEN_ESTADO: EstadoInduccion[] = ["sin_programar", "programada", "ejecutada"]

/** Texto comparable: sin mayusculas y sin tildes, para que buscar "induccion"
 *  tambien encuentre "Inducción". */
const comparable = (v: unknown) =>
  String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")

/** Valor del desplegable "Todos". No puede ser "" porque Radix Select no
 *  acepta un SelectItem con valor vacio. */
const TODOS = "__todos__"

/** Alto de la fila de encabezado. La fila de filtros se ancla justo debajo con
 *  este mismo numero; si cambia el padding del th, hay que ajustarlo aqui. */
const ALTO_ENCABEZADO = 34

type ColumnaLista = {
  k: string
  l: string
  min: string
  tipo: "texto" | "lista"
  centrado?: boolean
  ph?: string
}

// Una entrada por columna visible de la tabla. De aqui salen el encabezado, la
// fila de filtros y el filtrado, para que no puedan desalinearse entre si.
const COLUMNAS_LISTA: ColumnaLista[] = [
  { k: "codigo", l: "Código", min: "8rem", tipo: "texto", ph: "Código…" },
  { k: "tema", l: "Tema", min: "20rem", tipo: "texto", ph: "Tema…" },
  { k: "programada", l: "Programada", min: "10rem", tipo: "lista" },
  { k: "preguntas", l: "Preguntas", min: "6.5rem", tipo: "texto", centrado: true, ph: "N.º" },
  { k: "aprueba", l: "Aprueba con", min: "7.5rem", tipo: "texto", centrado: true, ph: "N.º" },
  { k: "estado", l: "Estado", min: "11rem", tipo: "lista", centrado: true },
]

/** Texto por el que se filtra cada columna. Es el MISMO que se ve en pantalla:
 *  si difirieran, filtrar por lo que uno lee no traeria la fila. */
function valorCelda(ind: InduccionAdmin, k: string): string {
  switch (k) {
    case "codigo":
      return ind.codigo_sig || ""
    case "tema":
      return ind.tema || ""
    case "programada":
      return labelProgramada(ind.fecha)
    case "preguntas":
      return String(ind.total_preguntas)
    case "aprueba":
      return `${ind.puntaje_aprobacion}/${ind.total_preguntas}`
    case "estado":
      return ETIQUETA_ESTADO[ind.estado] ?? ""
    default:
      return ""
  }
}

const EMPTY_FORM: FormState = {
  id: null,
  tema: "",
  descripcion: "",
  codigo_sig: "",
  material_url: "",
  obligatoria: true,
  activa: true,
  esAdmin: false,
  tipo: "induccion",
  mes: String(AHORA.getMonth() + 1),
  anio: String(AHORA.getFullYear()),
  puntaje_aprobacion: "1",
}

function nuevaPregunta(orden: number): PreguntaAdmin {
  return {
    orden,
    enunciado: "",
    tipo: "mcq",
    opciones: { a: "", b: "", c: "" },
    respuesta_correcta: "a",
  }
}

/**
 * Construye una URL que fuerza la descarga del material. Para archivos
 * almacenados en Supabase Storage se añade `download=<nombre.ext>`, que hace
 * que Supabase responda con `Content-Disposition: attachment; filename=...`
 * usando exactamente ese nombre. Pasar el nombre con su extensión es clave:
 * con `?download` a secas el navegador puede renombrar un .html a .txt según
 * el content-type. Para URLs externas se devuelve la URL tal cual.
 */
function materialDownloadUrl(url: string): string {
  if (!url) return url
  const esSupabaseStorage = url.includes("/storage/v1/object/public/")
  if (!esSupabaseStorage) return url
  // Extraemos el nombre del archivo (con su extensión) de la ruta.
  let filename = "material"
  try {
    const path = url.split("?")[0]
    const last = path.substring(path.lastIndexOf("/") + 1)
    filename = decodeURIComponent(last) || "material"
  } catch {
    /* noop */
  }
  const param = `download=${encodeURIComponent(filename)}`
  return url.includes("?") ? `${url}&${param}` : `${url}?${param}`
}

export default function InduccionesManagement() {
  const [inducciones, setInducciones] = useState<InduccionAdmin[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [preguntas, setPreguntas] = useState<PreguntaAdmin[]>([])
  const [uploadingMaterial, setUploadingMaterial] = useState(false)
  // Un valor por columna. Vacio (o TODOS en los desplegables) = sin filtrar.
  const [filtros, setFiltros] = useState<Record<string, string>>({})
  // La induccion abierta en el dialogo de edicion. Se guarda aparte del
  // formulario porque `form` no lleva los trabajadores programados y el bloque
  // de "personas programadas" los necesita.
  const [editando, setEditando] = useState<InduccionAdmin | null>(null)
  const { toast } = useToast()
  const { selectedEmpresaId } = useAuth()

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmpresaId])

  const load = async () => {
    setLoading(true)
    const res = await listInduccionesAdmin(selectedEmpresaId)
    if (res.success) setInducciones(res.data)
    setLoading(false)
  }

  const setFiltro = (k: string, v: string) => setFiltros((prev) => ({ ...prev, [k]: v }))
  const limpiarFiltros = () => setFiltros({})

  // Las opciones de cada desplegable se arman con lo que REALMENTE hay en los
  // datos, no con una lista fija: asi ningun filtro puede devolver cero filas.
  const opcionesPorColumna = useMemo(() => {
    const m: Record<string, string[]> = {}

    // Los meses van en orden cronologico, no alfabetico: un desplegable que
    // empieza en "Abril 2026" y sigue en "Agosto 2025" no le sirve a nadie.
    const porFecha = new Map<string, string>()
    for (const ind of inducciones) {
      const etiqueta = labelProgramada(ind.fecha)
      // "9999" empuja "Sin programar" al final de la lista.
      if (!porFecha.has(etiqueta)) porFecha.set(etiqueta, ind.fecha || "9999-99-99")
    }
    m.programada = [...porFecha.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([etiqueta]) => etiqueta)

    const estadosPresentes = new Set(inducciones.map((i) => i.estado))
    m.estado = ORDEN_ESTADO.filter((e) => estadosPresentes.has(e)).map((e) => ETIQUETA_ESTADO[e])

    return m
  }, [inducciones])

  const filtrosActivos = COLUMNAS_LISTA.filter((c) => {
    const v = filtros[c.k] ?? ""
    return c.tipo === "lista" ? Boolean(v) && v !== TODOS : v.trim() !== ""
  })
  const hayFiltro = filtrosActivos.length > 0
  const resumenFiltros = filtrosActivos.map((c) => `${c.l}: ${filtros[c.k]}`).join(" · ")

  const induccionesFiltradas = useMemo(() => {
    const activos = COLUMNAS_LISTA.map((c) => ({ c, v: filtros[c.k] ?? "" })).filter(({ c, v }) =>
      c.tipo === "lista" ? Boolean(v) && v !== TODOS : v.trim() !== "",
    )
    if (activos.length === 0) return inducciones
    return inducciones.filter((ind) =>
      activos.every(({ c, v }) =>
        // Los desplegables exigen coincidencia exacta; los de texto buscan por
        // fragmento, para poder escribir "segur" y encontrar "Seguridad".
        c.tipo === "lista"
          ? valorCelda(ind, c.k) === v
          : comparable(valorCelda(ind, c.k)).includes(comparable(v)),
      ),
    )
  }, [inducciones, filtros])

  const openNew = () => {
    setEditando(null)
    setForm(EMPTY_FORM)
    setPreguntas([nuevaPregunta(1)])
    setOpen(true)
  }

  const openEdit = async (ind: InduccionAdmin) => {
    const res = await getInduccionAdmin(ind.id)
    if (!res.success || !res.induccion) {
      toast({ title: "Error", description: res.error || "No se pudo cargar", variant: "destructive" })
      return
    }
    // Derivar mes/anio de la fecha programada (formato 'YYYY-MM-DD').
    let mes = String(AHORA.getMonth() + 1)
    let anio = String(AHORA.getFullYear())
    if (res.induccion.fecha) {
      const [y, m] = res.induccion.fecha.split("-")
      if (y) anio = String(parseInt(y, 10))
      if (m) mes = String(parseInt(m, 10))
    }
    setForm({
      id: res.induccion.id,
      tema: res.induccion.tema,
      descripcion: res.induccion.descripcion || "",
      codigo_sig: res.induccion.codigo_sig || "",
      material_url: res.induccion.material_url || "",
      obligatoria: res.induccion.obligatoria,
      activa: res.induccion.activa,
      esAdmin: res.induccion.admin,
      tipo: res.induccion.tipo || "induccion",
      mes,
      anio,
      puntaje_aprobacion: String(res.induccion.puntaje_aprobacion || 1),
    })
    setPreguntas(res.preguntas.length > 0 ? res.preguntas : [nuevaPregunta(1)])
    setEditando(ind)
    setOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta inducción y todas sus preguntas?")) return
    const res = await eliminarInduccion(id)
    if (res.success) {
      toast({ title: "Inducción eliminada" })
      load()
    } else {
      toast({ title: "Error", description: res.error, variant: "destructive" })
    }
  }

  // --- Duplicado en otros proyectos (empresas) ---
  const [duplicando, setDuplicando] = useState<InduccionAdmin | null>(null)
  const [empresas, setEmpresas] = useState<Array<{ id: number; nombre: string }>>([])
  const [loadingEmpresas, setLoadingEmpresas] = useState(false)
  const [empresasSel, setEmpresasSel] = useState<Set<number>>(new Set())
  const [duplicandoSave, setDuplicandoSave] = useState(false)

  const abrirDuplicar = async (ind: InduccionAdmin) => {
    setDuplicando(ind)
    setEmpresasSel(new Set())
    setLoadingEmpresas(true)
    const data = await getAccessibleEmpresesFromPermisos()
    // Excluir la empresa de origen de la lista de destinos.
    setEmpresas(data.filter((e) => e.id !== ind.idempresa))
    setLoadingEmpresas(false)
  }

  const toggleEmpresaSel = (id: number) => {
    setEmpresasSel((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleDuplicar = async () => {
    if (!duplicando) return
    if (empresasSel.size === 0) {
      toast({ title: "Selecciona al menos un proyecto", variant: "destructive" })
      return
    }
    setDuplicandoSave(true)
    const res = await duplicarInduccionEnEmpresas(duplicando.id, Array.from(empresasSel))
    setDuplicandoSave(false)
    if (res.success) {
      toast({ title: "Inducción duplicada", description: `Se crearon ${res.creadas} copia(s) en otros proyectos.` })
      setDuplicando(null)
      load()
    } else {
      toast({ title: "Error", description: res.error, variant: "destructive" })
    }
  }

  // --- Programación de trabajadores ---
  const [programando, setProgramando] = useState<InduccionAdmin | null>(null)
  const [trabajadores, setTrabajadores] = useState<TrabajadorOpcion[]>([])
  const [loadingTrab, setLoadingTrab] = useState(false)
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set())
  const [buscarTrab, setBuscarTrab] = useState("")
  const [savingPrograma, setSavingPrograma] = useState(false)

  // Sube un archivo de material (PPT/PPTX/PDF) al storage de Supabase y
  // guarda la URL pública resultante en el campo material_url del formulario.
  const handleMaterialUpload = async (file: File | null) => {
    if (!file) return
    setUploadingMaterial(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/inducciones/upload-material", { method: "POST", body: fd })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Error al subir el archivo")
      }
      setForm((prev) => ({ ...prev, material_url: data.url }))
      toast({ title: "Material cargado", description: file.name })
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "No se pudo subir el material", variant: "destructive" })
    } finally {
      setUploadingMaterial(false)
    }
  }

  const abrirProgramar = async (ind: InduccionAdmin) => {
    setProgramando(ind)
    setSeleccion(new Set(ind.trabajadores))
    setBuscarTrab("")
    setLoadingTrab(true)
    // Si la induccion es administrativa, se listan todos los administrativos
    // sin filtrar por empresa. Se pasan ademas los ya programados para que el
    // que se haya retirado siga apareciendo y se pueda quitar de la lista.
    const res = await listTrabajadoresEmpresa(selectedEmpresaId, ind.admin, ind.trabajadores)
    setLoadingTrab(false)
    if (res.success) setTrabajadores(res.data)
    else toast({ title: "Error", description: res.error, variant: "destructive" })
  }

  const toggleSeleccion = (id: number) => {
    setSeleccion((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const guardarPrograma = async () => {
    if (!programando) return
    setSavingPrograma(true)
    const res = await programarInduccion(programando.id, Array.from(seleccion))
    setSavingPrograma(false)
    if (res.success) {
      toast({
        title: "Inducción programada",
        description: `${seleccion.size} trabajador(es) asignado(s). Aparecerá en su portal.`,
      })
      setProgramando(null)
      load()
    } else {
      toast({ title: "Error", description: res.error, variant: "destructive" })
    }
  }

  const trabajadoresFiltrados = trabajadores.filter((t) => {
    const q = buscarTrab.trim().toLowerCase()
    if (!q) return true
    return (
      t.nombre.toLowerCase().includes(q) ||
      (t.identificacion ?? "").toLowerCase().includes(q) ||
      (t.cargo ?? "").toLowerCase().includes(q)
    )
  })

  // Programados que ya no salen en el listado normal: se retiraron o pasaron a
  // otro proyecto. Van de primeros porque son los que hay que decidir; el resto
  // de la lista ya esta como debe estar.
  const asignadosFuera = trabajadoresFiltrados.filter((t) => !t.disponible)
  const seleccionables = trabajadoresFiltrados.filter((t) => t.disponible)
  const listaProgramar = [...asignadosFuera, ...seleccionables]

  const quitarAsignadosFuera = () => {
    setSeleccion((prev) => {
      const next = new Set(prev)
      // Se recorre `trabajadores` y no la lista filtrada: si hay una busqueda
      // escrita, el boton igual tiene que quitarlos a todos.
      trabajadores.filter((t) => !t.disponible).forEach((t) => next.delete(t.id))
      return next
    })
  }

  const totalFuera = trabajadores.filter((t) => !t.disponible && seleccion.has(t.id)).length

  const updatePregunta = (idx: number, patch: Partial<PreguntaAdmin>) => {
    setPreguntas((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)))
  }

  const changeTipo = (idx: number, tipo: "mcq" | "vf") => {
    setPreguntas((prev) =>
      prev.map((p, i) => {
        if (i !== idx) return p
        if (tipo === "vf") {
          return { ...p, tipo, opciones: null, respuesta_correcta: "Verdadero" }
        }
        return { ...p, tipo, opciones: { a: "", b: "", c: "" }, respuesta_correcta: "a" }
      }),
    )
  }

  const handleSave = async () => {
    if (!form.tema.trim()) {
      toast({ title: "Falta el tema", variant: "destructive" })
      return
    }
    // Validar preguntas
    for (const [i, p] of preguntas.entries()) {
      if (!p.enunciado.trim()) {
        toast({ title: `La pregunta ${i + 1} no tiene enunciado`, variant: "destructive" })
        return
      }
      if (p.tipo === "mcq") {
        const ops = p.opciones || {}
        if (!ops.a?.trim() || !ops.b?.trim() || !ops.c?.trim()) {
          toast({ title: `Completa las 3 opciones de la pregunta ${i + 1}`, variant: "destructive" })
          return
        }
      }
    }

    setSaving(true)
    const res = await guardarInduccion({
      id: form.id,
      tema: form.tema,
      descripcion: form.descripcion,
      codigo_sig: form.codigo_sig,
      material_url: form.material_url,
      obligatoria: form.obligatoria,
      activa: form.activa,
      admin: form.esAdmin,
      tipo: form.tipo,
      idempresa: selectedEmpresaId ?? null,
      mes: parseInt(form.mes, 10) || null,
      anio: parseInt(form.anio, 10) || null,
      puntaje_aprobacion: parseInt(form.puntaje_aprobacion, 10) || 1,
      preguntas: preguntas.map((p, i) => ({ ...p, orden: i + 1 })),
    })
    setSaving(false)

    if (res.success) {
      toast({ title: form.id ? "Inducción actualizada" : "Inducción creada" })
      setOpen(false)
      load()
    } else {
      toast({ title: "Error", description: res.error, variant: "destructive" })
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5">
            <GraduationCap className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Inducciones</h1>
            <p className="text-sm text-muted-foreground">
              Crea inducciones con sus preguntas de evaluación para los trabajadores.
            </p>
          </div>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="w-4 h-4" />
          Nueva Inducción
        </Button>
      </div>

      <Tabs defaultValue="lista" className="space-y-4">
        <TabsList>
          <TabsTrigger value="lista" className="gap-1.5">
            <GraduationCap className="h-4 w-4" />
            Inducciones
          </TabsTrigger>
          <TabsTrigger value="indicador" className="gap-1.5">
            <CalendarClock className="h-4 w-4" />
            Indicador
          </TabsTrigger>
          <TabsTrigger value="carpetas" className="gap-1.5">
            <FolderOpen className="h-4 w-4" />
            Carpetas de trabajadores
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : inducciones.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <GraduationCap className="h-10 w-10 text-muted-foreground" />
                <EmptyTitle>Aún no hay inducciones</EmptyTitle>
                <EmptyDescription>
                  Crea tu primera inducción y agrega las preguntas que el trabajador deberá responder.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {induccionesFiltradas.length === inducciones.length
                    ? `${inducciones.length} inducción(es)`
                    : `${induccionesFiltradas.length} de ${inducciones.length} inducción(es)`}
                  {resumenFiltros ? ` · ${resumenFiltros}` : ""}
                </span>
                {hayFiltro && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={limpiarFiltros}
                  >
                    <X className="h-3 w-3" />
                    Limpiar filtros
                  </Button>
                )}
              </div>

              {/* La tabla vive dentro de un contenedor con alto maximo: crece
                  hasta ahi y de ahi en adelante se desplaza por dentro, en vez
                  de estirar la pagina. El encabezado y la fila de filtros
                  quedan fijos arriba; Codigo y Acciones, fijos a los lados. */}
              <div className="relative max-h-[62vh] overflow-auto rounded-lg border">
                <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr>
                      {COLUMNAS_LISTA.map((c, idx) => (
                        <th
                          key={c.k}
                          className={`sticky top-0 whitespace-nowrap border-b bg-muted p-2 text-xs font-semibold ${
                            c.centrado ? "text-center" : "text-left"
                          } ${idx === 0 ? "left-0 z-30" : "z-20"}`}
                          style={{ minWidth: c.min, height: ALTO_ENCABEZADO }}
                        >
                          {c.l}
                        </th>
                      ))}
                      <th
                        className="sticky right-0 top-0 z-30 whitespace-nowrap border-b bg-muted p-2 text-right text-xs font-semibold"
                        style={{ minWidth: "23rem", height: ALTO_ENCABEZADO }}
                      >
                        Acciones
                      </th>
                    </tr>
                    {/* Un filtro por columna, justo debajo de su encabezado: se
                        ve de inmediato por que campo se esta filtrando. */}
                    <tr>
                      {COLUMNAS_LISTA.map((c, idx) => (
                        <th
                          key={c.k}
                          className={`sticky border-b bg-card p-1 ${idx === 0 ? "left-0 z-30" : "z-20"}`}
                          style={{ minWidth: c.min, top: ALTO_ENCABEZADO }}
                        >
                          {c.tipo === "lista" ? (
                            <Select
                              value={filtros[c.k] ?? TODOS}
                              onValueChange={(v) => setFiltro(c.k, v)}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={TODOS}>Todos</SelectItem>
                                {(opcionesPorColumna[c.k] ?? []).map((o) => (
                                  <SelectItem key={o} value={o}>
                                    {o}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              className="h-8 text-xs"
                              value={filtros[c.k] ?? ""}
                              onChange={(e) => setFiltro(c.k, e.target.value)}
                              placeholder={c.ph ?? "Buscar…"}
                            />
                          )}
                        </th>
                      ))}
                      <th
                        className="sticky right-0 z-30 border-b bg-card p-1"
                        style={{ top: ALTO_ENCABEZADO }}
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {induccionesFiltradas.length === 0 ? (
                      <tr>
                        <td
                          colSpan={COLUMNAS_LISTA.length + 1}
                          className="bg-card p-10 text-center text-sm text-muted-foreground"
                        >
                          Ninguna inducción coincide con los filtros.
                        </td>
                      </tr>
                    ) : (
                      induccionesFiltradas.map((ind) => (
                        <tr key={ind.id} className="group">
                          <td
                            className="sticky left-0 z-10 border-b bg-card p-2 font-mono text-xs group-hover:bg-muted"
                            style={{ minWidth: COLUMNAS_LISTA[0].min }}
                          >
                            {ind.codigo_sig || "—"}
                          </td>
                          <td
                            className="border-b bg-card p-2 font-medium group-hover:bg-muted"
                            style={{ minWidth: COLUMNAS_LISTA[1].min }}
                          >
                            <div className="flex items-center gap-2">
                              <span>{ind.tema}</span>
                              {ind.admin && (
                                <Badge variant="secondary" className="text-[10px]">
                                  Administrativa
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td
                            className="whitespace-nowrap border-b bg-card p-2 text-sm group-hover:bg-muted"
                            style={{ minWidth: COLUMNAS_LISTA[2].min }}
                          >
                            {ind.fecha ? (
                              labelProgramada(ind.fecha)
                            ) : (
                              <span className="text-muted-foreground">Sin programar</span>
                            )}
                          </td>
                          <td
                            className="border-b bg-card p-2 text-center group-hover:bg-muted"
                            style={{ minWidth: COLUMNAS_LISTA[3].min }}
                          >
                            {ind.total_preguntas}
                          </td>
                          <td
                            className="border-b bg-card p-2 text-center group-hover:bg-muted"
                            style={{ minWidth: COLUMNAS_LISTA[4].min }}
                          >
                            {ind.puntaje_aprobacion}/{ind.total_preguntas}
                          </td>
                          <td
                            className="border-b bg-card p-2 text-center group-hover:bg-muted"
                            style={{ minWidth: COLUMNAS_LISTA[5].min }}
                          >
                            {ind.estado === "ejecutada" ? (
                              <Badge className="bg-green-100 text-green-800 border-green-300 hover:bg-green-100 gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                Ejecutada
                              </Badge>
                            ) : ind.estado === "programada" ? (
                              <Badge
                                className="bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100 gap-1 cursor-pointer"
                                onClick={() => abrirProgramar(ind)}
                                title="Diligenciados / programados — clic para ajustar la lista"
                              >
                                <CalendarClock className="h-3 w-3" />
                                Programada {ind.completados}/{ind.trabajadores.length}
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="gap-1">
                                <CircleDashed className="h-3 w-3" />
                                Sin programar
                              </Badge>
                            )}
                          </td>
                          <td className="sticky right-0 z-10 space-x-2 whitespace-nowrap border-b bg-card p-2 text-right group-hover:bg-muted">
                            <Button
                              size="sm"
                              variant={ind.estado === "sin_programar" ? "default" : "outline"}
                              onClick={() => abrirProgramar(ind)}
                              className="gap-1"
                              title="Programar trabajadores"
                            >
                              <Users className="w-4 h-4" />
                              Programar
                            </Button>
                            {ind.material_url && (
                              <Button
                                size="sm"
                                variant="outline"
                                asChild
                                className="gap-1"
                                title="Descargar el material (PPT / PDF / HTML / URL)"
                              >
                                <a
                                  href={materialDownloadUrl(ind.material_url)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  download
                                >
                                  <Download className="w-4 h-4" />
                                  Material
                                </a>
                              </Button>
                            )}
                            <Button size="sm" variant="outline" onClick={() => openEdit(ind)} className="gap-1">
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => abrirDuplicar(ind)}
                              className="gap-1"
                              title="Duplicar en otros proyectos"
                            >
                              <Copy className="w-4 h-4" />
                              Duplicar
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDelete(ind.id)}
                              className="gap-1"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="indicador">
          <IndicadorInduccionesTab idempresa={selectedEmpresaId ?? null} />
        </TabsContent>

        <TabsContent value="carpetas">
          <CarpetasTrabajadores />
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar" : "Nueva"} Inducción</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {/* Metadata */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2 space-y-1.5">
                <Label htmlFor="ind-tema">Tema *</Label>
                <Input
                  id="ind-tema"
                  placeholder="Ej. Inducción en Seguridad y Salud en el Trabajo"
                  value={form.tema}
                  onChange={(e) => setForm({ ...form, tema: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ind-tipo">Tipo</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                  <SelectTrigger id="ind-tipo">
                    <SelectValue placeholder="Seleccione un tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPO_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ind-codigo">Código SIG</Label>
                <Input
                  id="ind-codigo"
                  placeholder="Ej. IND-001"
                  value={form.codigo_sig}
                  onChange={(e) => setForm({ ...form, codigo_sig: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ind-puntaje">Respuestas correctas para aprobar</Label>
                <Input
                  id="ind-puntaje"
                  type="number"
                  min={1}
                  value={form.puntaje_aprobacion}
                  onChange={(e) => setForm({ ...form, puntaje_aprobacion: e.target.value })}
                />
              </div>
              <div className="md:col-span-2 space-y-1.5">
                <Label htmlFor="ind-desc">Descripción</Label>
                <Textarea
                  id="ind-desc"
                  placeholder="Descripción breve de la inducción"
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="md:col-span-2 space-y-1.5">
                <Label htmlFor="ind-material">URL del material (presentación / PDF / HTML)</Label>
                <Input
                  id="ind-material"
                  placeholder="https://..."
                  value={form.material_url}
                  onChange={(e) => setForm({ ...form, material_url: e.target.value })}
                />
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <input
                    id="ind-material-file"
                    type="file"
                    accept=".ppt,.pptx,.pdf,.html,.htm,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/pdf,text/html"
                    className="sr-only"
                    onChange={(e) => {
                      handleMaterialUpload(e.target.files?.[0] ?? null)
                      e.target.value = ""
                    }}
                    disabled={uploadingMaterial}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploadingMaterial}
                    onClick={() => document.getElementById("ind-material-file")?.click()}
                    className="gap-2"
                  >
                    {uploadingMaterial ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    {uploadingMaterial ? "Subiendo..." : "Adjuntar PPT / PDF / HTML"}
                  </Button>
                  {form.material_url && (
                    <a
                      href={materialDownloadUrl(form.material_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                      className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
                    >
                      <Download className="h-4 w-4" />
                      Descargar material
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Pega una URL o adjunta un archivo (PPT, PPTX, PDF o HTML). El archivo se almacena en el storage y al
                  dar clic en Material se descarga para abrirlo en el computador.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ind-mes">Mes programado</Label>
                <Select value={form.mes} onValueChange={(v) => setForm({ ...form, mes: v })}>
                  <SelectTrigger id="ind-mes">
                    <SelectValue placeholder="Mes" />
                  </SelectTrigger>
                  <SelectContent>
                    {MESES.map((m, i) => (
                      <SelectItem key={m} value={String(i + 1)}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ind-anio">Año programado</Label>
                <Select value={form.anio} onValueChange={(v) => setForm({ ...form, anio: v })}>
                  <SelectTrigger id="ind-anio">
                    <SelectValue placeholder="Año" />
                  </SelectTrigger>
                  <SelectContent>
                    {ANIOS.map((a) => (
                      <SelectItem key={a} value={String(a)}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2 flex items-center gap-2">
                <Switch
                  id="ind-oblig"
                  checked={form.obligatoria}
                  onCheckedChange={(v) => setForm({ ...form, obligatoria: v })}
                />
                <Label htmlFor="ind-oblig">Obligatoria</Label>
              </div>
              <div className="md:col-span-2 flex items-center gap-2">
                <Switch
                  id="ind-admin"
                  checked={form.esAdmin}
                  onCheckedChange={(v) => setForm({ ...form, esAdmin: v })}
                />
                <Label htmlFor="ind-admin">
                  ¿Es para administrativos? (al programar mostrará todo el personal administrativo,
                  sin importar el proyecto)
                </Label>
              </div>
              {editando && (
                <div className="md:col-span-2 rounded-lg border bg-muted/40 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm">
                      <span className="font-medium">
                        Personas programadas: {editando.trabajadores.length}
                      </span>
                      <span className="text-muted-foreground">
                        {" "}
                        · diligenciaron {editando.completados}
                      </span>
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => {
                        const ind = editando
                        setOpen(false)
                        abrirProgramar(ind)
                      }}
                    >
                      <Users className="h-3.5 w-3.5" />
                      Ajustar programados
                    </Button>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    La cantidad se cambia quitando o agregando personas, no escribiendo un número:
                    cada programado tiene la inducción pendiente en su portal, así que bajar de 16 a
                    15 es decidir a quién se le quita. Ahí aparecen también los que ya se retiraron.
                  </p>
                </div>
              )}
              <p className="md:col-span-2 text-xs text-muted-foreground">
                La inducción se programa para el mes y año indicados. Usa{" "}
                <strong>Programar</strong> para asignar los trabajadores a los que se les impartió;
                aparecerá en su portal y pasará a <strong>Ejecutada</strong> automáticamente cuando
                el 100% diligencie el cuestionario.
              </p>
            </div>

            {/* Preguntas */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <HelpCircle className="h-4 w-4 text-primary" />
                  Preguntas de evaluación ({preguntas.length})
                </h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPreguntas((p) => [...p, nuevaPregunta(p.length + 1)])}
                  className="gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Agregar pregunta
                </Button>
              </div>

              {preguntas.map((p, idx) => (
                <div key={idx} className="rounded-lg border p-4 space-y-3 bg-card">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-semibold text-muted-foreground mt-2">
                      Pregunta {idx + 1}
                    </span>
                    <div className="flex items-center gap-2">
                      <RadioGroup
                        value={p.tipo}
                        onValueChange={(v) => changeTipo(idx, v as "mcq" | "vf")}
                        className="flex items-center gap-3"
                      >
                        <div className="flex items-center gap-1.5">
                          <RadioGroupItem value="mcq" id={`tipo-mcq-${idx}`} />
                          <Label htmlFor={`tipo-mcq-${idx}`} className="text-xs">Opción múltiple</Label>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <RadioGroupItem value="vf" id={`tipo-vf-${idx}`} />
                          <Label htmlFor={`tipo-vf-${idx}`} className="text-xs">Verdadero/Falso</Label>
                        </div>
                      </RadioGroup>
                      {preguntas.length > 1 && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => setPreguntas((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <Textarea
                    placeholder="Enunciado de la pregunta"
                    value={p.enunciado}
                    onChange={(e) => updatePregunta(idx, { enunciado: e.target.value })}
                    rows={2}
                  />

                  {p.tipo === "mcq" ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Marca la opción correcta con el botón de la izquierda.
                      </p>
                      <RadioGroup
                        value={p.respuesta_correcta}
                        onValueChange={(v) => updatePregunta(idx, { respuesta_correcta: v })}
                        className="space-y-2"
                      >
                        {(["a", "b", "c"] as const).map((key) => (
                          <div key={key} className="flex items-center gap-2">
                            <RadioGroupItem value={key} id={`q${idx}-${key}`} />
                            <span className="uppercase text-xs font-semibold w-4">{key}</span>
                            <Input
                              placeholder={`Opción ${key.toUpperCase()}`}
                              value={p.opciones?.[key] || ""}
                              onChange={(e) =>
                                updatePregunta(idx, {
                                  opciones: { ...(p.opciones || {}), [key]: e.target.value },
                                })
                              }
                            />
                          </div>
                        ))}
                      </RadioGroup>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Marca la respuesta correcta.</p>
                      <RadioGroup
                        value={p.respuesta_correcta}
                        onValueChange={(v) => updatePregunta(idx, { respuesta_correcta: v })}
                        className="flex items-center gap-6"
                      >
                        {["Verdadero", "Falso"].map((opt) => (
                          <div key={opt} className="flex items-center gap-1.5">
                            <RadioGroupItem value={opt} id={`q${idx}-${opt}`} />
                            <Label htmlFor={`q${idx}-${opt}`} className="text-sm">{opt}</Label>
                          </div>
                        ))}
                      </RadioGroup>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Guardar Inducción
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo de programación: asignar trabajadores a la inducción. */}
      <Dialog open={!!programando} onOpenChange={(o) => !o && setProgramando(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Programar inducción
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 flex flex-col overflow-hidden">
            <p className="text-sm text-muted-foreground">
              Selecciona los trabajadores a los que se les impartió{" "}
              <strong>{programando?.tema}</strong>. Pasará a ejecutada automáticamente cuando todos
              diligencien el cuestionario.
            </p>

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, documento o cargo..."
                value={buscarTrab}
                onChange={(e) => setBuscarTrab(e.target.value)}
                className="pl-8"
              />
            </div>

            {totalFuera > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                <p className="flex items-start gap-2 font-medium">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {totalFuera} programado(s) ya no están activos en el head count
                </p>
                <p className="mt-1.5 pl-[1.375rem]">
                  Siguen contando en el total, así que la inducción no llega al 100%. Quítalos para
                  que la cantidad programada baje —de 16 a 15, por ejemplo— y pueda pasar a
                  ejecutada.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={quitarAsignadosFuera}
                  className="mt-2 h-7 gap-1.5 border-amber-400 bg-white px-2 text-[11px] text-amber-900 hover:bg-amber-100"
                >
                  <UserMinus className="h-3.5 w-3.5" />
                  Quitar a los {totalFuera} que ya no están
                </Button>
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                <span className="font-medium text-foreground">
                  {seleccion.size} programado(s)
                </span>
                {programando && seleccion.size !== programando.trabajadores.length && (
                  <span> · antes {programando.trabajadores.length}</span>
                )}
              </span>
              {seleccionables.length > 0 && (
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => {
                    const todosMarcados = seleccionables.every((t) => seleccion.has(t.id))
                    setSeleccion((prev) => {
                      const next = new Set(prev)
                      seleccionables.forEach((t) =>
                        todosMarcados ? next.delete(t.id) : next.add(t.id),
                      )
                      return next
                    })
                  }}
                >
                  {seleccionables.every((t) => seleccion.has(t.id))
                    ? "Quitar todos"
                    : "Seleccionar todos"}
                </button>
              )}
            </div>

            <ScrollArea className="h-72 rounded-md border">
              {loadingTrab ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : trabajadoresFiltrados.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  No hay trabajadores que coincidan.
                </p>
              ) : (
                <ul className="divide-y">
                  {listaProgramar.map((t) => (
                    <li key={t.id} className={t.disponible ? "" : "bg-amber-50"}>
                      <label className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50">
                        <Checkbox
                          checked={seleccion.has(t.id)}
                          onCheckedChange={() => toggleSeleccion(t.id)}
                        />
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 text-sm font-medium truncate">
                            {t.nombre}
                            {!t.disponible && (
                              <Badge
                                variant="outline"
                                className="shrink-0 border-amber-400 text-[10px] font-normal text-amber-800"
                              >
                                {t.estado ? t.estado : "Fuera del listado"}
                              </Badge>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {t.identificacion || "—"}
                            {t.cargo ? ` · ${t.cargo}` : ""}
                          </p>
                        </div>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => setProgramando(null)} disabled={savingPrograma}>
              Cancelar
            </Button>
            <Button onClick={guardarPrograma} disabled={savingPrograma} className="gap-2">
              {savingPrograma ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Guardar programación
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo: duplicar inducción en otros proyectos (empresas) */}
      <Dialog open={!!duplicando} onOpenChange={(o) => !o && setDuplicando(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="h-5 w-5" />
              Duplicar en otros proyectos
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Se crearán copias de <span className="font-medium text-foreground">{duplicando?.tema}</span> (con su
              material, preguntas y programación) en los proyectos seleccionados. No se copian los trabajadores
              asignados.
            </p>

            {loadingEmpresas ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Cargando proyectos...
              </div>
            ) : empresas.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>Sin otros proyectos</EmptyTitle>
                  <EmptyDescription>No hay otras empresas disponibles para duplicar esta inducción.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ScrollArea className="h-64 rounded-md border">
                <div className="p-2 space-y-1">
                  {empresas.map((emp) => (
                    <label
                      key={emp.id}
                      className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-muted cursor-pointer"
                    >
                      <Checkbox
                        checked={empresasSel.has(emp.id)}
                        onCheckedChange={() => toggleEmpresaSel(emp.id)}
                      />
                      <span className="text-sm">{emp.nombre}</span>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => setDuplicando(null)} disabled={duplicandoSave}>
              Cancelar
            </Button>
            <Button
              onClick={handleDuplicar}
              disabled={duplicandoSave || empresasSel.size === 0}
              className="gap-2"
            >
              {duplicandoSave ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
              Duplicar ({empresasSel.size})
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
