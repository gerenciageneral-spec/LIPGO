"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/components/auth-provider"
import {
  getAusentismos,
  createAusentismo,
  updateAusentismo,
  deleteAusentismo,
  searchDiagnosticos,
  importAusentismosFromExcel,
  getHeadcountColaboradores,
  getIncidentesAT,
  type Ausentismo,
  type Diagnostico,
  type HeadcountColaborador,
} from "@/lib/ausentismos-actions"
import { AusentismosResumen } from "@/components/rrhh/ausentismos-dashboards"
import { AusentismosAnalisisDiario } from "@/components/rrhh/ausentismos-analisis-diario"
import {
  Plus,
  Trash2,
  Pencil,
  Search,
  Loader2,
  AlertTriangle,
  FileDown,
  ListChecks,
  BarChart3,
} from "lucide-react"

// Meses para el selector de "Mes de la incapacidad".
const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
]

const initialForm = {
  mes: "",
  nombre_colaborador: "",
  cedula: "",
  cargo: "",
  area: "",
  estado_colaborador: "ACTIVO",
  centro_trabajo: "",
  tipo_evento: "EG" as "EG" | "AT",
  eps: "",
  fecha_inicial: "",
  fecha_final: "",
  dias_incapacidad: "",
  prorroga: "",
  total_dias_incapacidad: "",
  dias_empresa: "",
  dias_eps: "",
  codigo_diagnostico: "",
  descripcion_diagnostico: "",
  parte_cuerpo: "",
  estadistica: "",
  salario_base: "",
  salario_base_dia: "",
  costos_empresa: "",
  costos_eps: "",
  costos_arl: "",
  total_salario_pagado: "",
  observaciones: "",
}

// Un codigo "M" (sistema osteomuscular) requiere revision del profesional de SST.
const esCodigoM = (codigo?: string | null) =>
  !!codigo && codigo.trim().toUpperCase().startsWith("M")

const toNum = (v: string) => {
  const n = Number(v)
  return Number.isNaN(n) ? 0 : n
}

export default function Ausentismos() {
  const { selectedEmpresaId } = useAuth()
  const { toast } = useToast()

  const [items, setItems] = useState<Ausentismo[]>([])
  // AT reales = investigaciones (sst_incidentes): un accidente = una investigación.
  const [incidentesAT, setIncidentesAT] = useState<{ fecha_evento: string | null; estado: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [tipoFiltro, setTipoFiltro] = useState<"todos" | "EG" | "AT">("todos")
  const [soloRevision, setSoloRevision] = useState(false)
  // Filtro por centro de trabajo (proyecto en el que se está trabajando).
  // Filtros por año y mes (se derivan de la fecha inicial / campo mes).
  const [anioFiltro, setAnioFiltro] = useState<string>("todos")
  const [mesFiltro, setMesFiltro] = useState<string>("todos")
  // Filtro por estado del colaborador (ACTIVO / RETIRADO).
  const [estadoFiltro, setEstadoFiltro] = useState<string>("todos")

  const [form, setForm] = useState({ ...initialForm })

  // Autocompletado de diagnosticos CIE-10.
  const [diagQuery, setDiagQuery] = useState("")
  const [diagResults, setDiagResults] = useState<Diagnostico[]>([])
  const [diagOpen, setDiagOpen] = useState(false)
  const [diagLoading, setDiagLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Colaboradores del Head Count (Gestion Humana) para autocompletar.
  const [colaboradores, setColaboradores] = useState<HeadcountColaborador[]>([])

  const loadData = async () => {
    setLoading(true)
    try {
      const [data, inc] = await Promise.all([
        getAusentismos(selectedEmpresaId),
        getIncidentesAT(selectedEmpresaId),
      ])
      setItems(data)
      setIncidentesAT(inc)
    } finally {
      setLoading(false)
    }
  }

  // Carga el personal del Head Count de la empresa seleccionada.
  const loadColaboradores = async () => {
    const data = await getHeadcountColaboradores(selectedEmpresaId)
    setColaboradores(data)
  }

  // Al digitar la cedula, si coincide EXACTAMENTE con un colaborador del Head
  // Count, autocompleta nombre, cargo, estado y centro de trabajo.
  const handleCedulaChange = (value: string) => {
    const cedula = value
    const match = colaboradores.find((c) => (c.identificacion ?? "").trim() === cedula.trim())
    if (match) {
      setForm((f) => ({
        ...f,
        cedula: match.identificacion ?? cedula,
        nombre_colaborador: match.nombre ?? "",
        cargo: match.cargo ?? "",
        estado_colaborador: (match.estado ?? "").toUpperCase().includes("RETIR")
          ? "RETIRADO"
          : "ACTIVO",
        centro_trabajo: match.centro_trabajo ?? f.centro_trabajo,
      }))
    } else {
      setForm((f) => ({ ...f, cedula }))
    }
  }

  // Trae los registros de la matriz SST-MAT-06 (Excel) y llena la tabla.
  const handleImport = async () => {
    if (
      !confirm(
        "Se importarán los ausentismos de la matriz SST-MAT-06 a la empresa seleccionada. Las importaciones previas se reemplazarán. ¿Continuar?",
      )
    )
      return
    setImporting(true)
    try {
      const result = await importAusentismosFromExcel(selectedEmpresaId)
      if (result.success) {
        toast({ title: "Importación completa", description: `${result.count} registros importados.` })
        loadData()
      } else {
        toast({ title: "Error", description: result.message || "No se pudo importar." })
      }
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "No se pudo importar." })
    } finally {
      setImporting(false)
    }
  }

  useEffect(() => {
    loadData()
    loadColaboradores()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmpresaId])

  // Busca diagnosticos con debounce cuando el usuario escribe.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (diagQuery.trim().length < 2) {
      setDiagResults([])
      // Codigo vacio o muy corto: la descripcion tambien queda vacia.
      setForm((f) =>
        f.codigo_diagnostico || f.descripcion_diagnostico
          ? { ...f, codigo_diagnostico: diagQuery.trim().toUpperCase(), descripcion_diagnostico: "" }
          : f,
      )
      return
    }
    setDiagLoading(true)
    debounceRef.current = setTimeout(async () => {
      const res = await searchDiagnosticos(diagQuery)
      setDiagResults(res)
      setDiagLoading(false)
      // La descripcion queda directamente amarrada al codigo digitado: si lo
      // tecleado coincide EXACTAMENTE con un codigo del catalogo, fijamos su
      // descripcion; si no, la descripcion se limpia para no quedar desfasada.
      const typed = diagQuery.trim().toUpperCase()
      const exact = res.find((d) => d.codigo.toUpperCase() === typed)
      setForm((f) => ({
        ...f,
        codigo_diagnostico: exact ? exact.codigo : typed,
        descripcion_diagnostico: exact ? exact.descripcion : "",
      }))
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [diagQuery])

  const resetForm = () => {
    setForm({ ...initialForm })
    setEditingId(null)
    setDiagQuery("")
    setDiagResults([])
    setDiagOpen(false)
  }

  const handleEdit = (a: Ausentismo) => {
    setEditingId(a.id)
    setForm({
      mes: a.mes || "",
      nombre_colaborador: a.nombre_colaborador || "",
      cedula: a.cedula || "",
      cargo: a.cargo || "",
      area: a.area || "",
      estado_colaborador: a.estado_colaborador || "ACTIVO",
      centro_trabajo: a.centro_trabajo || "",
      tipo_evento: a.tipo_evento || "EG",
      eps: a.eps || "",
      fecha_inicial: a.fecha_inicial || "",
      fecha_final: a.fecha_final || "",
      dias_incapacidad: a.dias_incapacidad?.toString() ?? "",
      prorroga: a.prorroga?.toString() ?? "",
      total_dias_incapacidad: a.total_dias_incapacidad?.toString() ?? "",
      dias_empresa: a.dias_empresa?.toString() ?? "",
      dias_eps: a.dias_eps?.toString() ?? "",
      codigo_diagnostico: a.codigo_diagnostico || "",
      descripcion_diagnostico: a.descripcion_diagnostico || "",
      parte_cuerpo: a.parte_cuerpo || "",
      estadistica: a.estadistica || "",
      salario_base: a.salario_base?.toString() ?? "",
      salario_base_dia: a.salario_base_dia?.toString() ?? "",
      costos_empresa: a.costos_empresa?.toString() ?? "",
      costos_eps: a.costos_eps?.toString() ?? "",
      costos_arl: a.costos_arl?.toString() ?? "",
      total_salario_pagado: a.total_salario_pagado?.toString() ?? "",
      observaciones: a.observaciones || "",
    })
    setDiagQuery(a.codigo_diagnostico || "")
    setOpen(true)
  }

  const selectDiagnostico = (d: Diagnostico) => {
    setForm((f) => ({
      ...f,
      codigo_diagnostico: d.codigo,
      descripcion_diagnostico: d.descripcion,
    }))
    setDiagQuery(d.codigo)
    setDiagOpen(false)
  }

  // Al cambiar el tipo de evento, el costo de la entidad se mueve al campo
  // correcto: EG -> EPS, AT -> ARL (la ARL asume el 100%). Así un único campo
  // refleja siempre la entidad que paga según lo elegido en "Tipo de evento".
  const handleTipoEvento = (value: "EG" | "AT") => {
    setForm((f) => {
      const entidadActual = f.tipo_evento === "AT" ? f.costos_arl : f.costos_eps
      return {
        ...f,
        tipo_evento: value,
        costos_eps: value === "EG" ? entidadActual : "",
        costos_arl: value === "AT" ? entidadActual : "",
      }
    })
  }

  // Mantiene el total de dias = dias incapacidad + prorroga.
  const handleDias = (campo: "dias_incapacidad" | "prorroga", value: string) => {
    setForm((f) => {
      const next = { ...f, [campo]: value }
      const total = toNum(next.dias_incapacidad) + toNum(next.prorroga)
      next.total_dias_incapacidad = total ? String(total) : ""
      return next
    })
  }

  const handleSave = async () => {
    if (!form.nombre_colaborador.trim()) {
      toast({ title: "Falta el colaborador", description: "El nombre del colaborador es obligatorio." })
      return
    }
    setSaving(true)
    try {
      const payload = {
        mes: form.mes.trim() || null,
        nombre_colaborador: form.nombre_colaborador.trim(),
        cedula: form.cedula.trim() || null,
        cargo: form.cargo.trim() || null,
        area: form.area.trim() || null,
        estado_colaborador: form.estado_colaborador || null,
        centro_trabajo: form.centro_trabajo.trim() || null,
        tipo_evento: form.tipo_evento,
        eps: form.eps.trim() || null,
        fecha_inicial: form.fecha_inicial || null,
        fecha_final: form.fecha_final || null,
        dias_incapacidad: toNum(form.dias_incapacidad),
        prorroga: toNum(form.prorroga),
        total_dias_incapacidad: toNum(form.total_dias_incapacidad),
        dias_empresa: toNum(form.dias_empresa),
        dias_eps: toNum(form.dias_eps),
        codigo_diagnostico: form.codigo_diagnostico.trim() || null,
        descripcion_diagnostico: form.descripcion_diagnostico.trim() || null,
        parte_cuerpo: form.parte_cuerpo.trim() || null,
        estadistica: form.estadistica.trim() || null,
        salario_base: toNum(form.salario_base),
        salario_base_dia: toNum(form.salario_base_dia),
        costos_empresa: toNum(form.costos_empresa),
        // El costo de la entidad va a EPS (EG) o a ARL (AT) según el tipo de evento.
        costos_eps: form.tipo_evento === "AT" ? 0 : toNum(form.costos_eps),
        costos_arl: form.tipo_evento === "AT" ? toNum(form.costos_arl) : 0,
        total_salario_pagado: toNum(form.total_salario_pagado),
        observaciones: form.observaciones.trim() || null,
      }
      const result = editingId
        ? await updateAusentismo(editingId, payload)
        : await createAusentismo(payload, selectedEmpresaId)

      if (result.success) {
        toast({ title: editingId ? "Ausentismo actualizado" : "Ausentismo registrado" })
        setOpen(false)
        resetForm()
        loadData()
      } else {
        toast({ title: "Error", description: result.message || "No se pudo guardar." })
      }
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "No se pudo guardar." })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este registro de ausentismo?")) return
    const result = await deleteAusentismo(id)
    if (result.success) {
      toast({ title: "Ausentismo eliminado" })
      setItems((prev) => prev.filter((i) => i.id !== id))
    } else {
      toast({ title: "Error", description: result.message || "No se pudo eliminar." })
    }
  }

  // Proyectos disponibles = centros de trabajo distintos presentes en los datos.
  const proyectos = useMemo(() => {
    const set = new Set<string>()
    for (const a of items) {
      const c = (a.centro_trabajo || "").trim()
      if (c) set.add(c)
    }
    return Array.from(set).sort((x, y) => x.localeCompare(y))
  }, [items])

  // Año de un registro: se toma de la fecha inicial de la incapacidad.
  const anioDe = (a: Ausentismo): string =>
    a.fecha_inicial ? a.fecha_inicial.slice(0, 4) : ""

  // Mes de un registro: primero el campo de texto "mes"; si no, se deriva de la
  // fecha inicial (1 = Enero ... 12 = Diciembre).
  const mesDe = (a: Ausentismo): string => {
    // El campo de texto "mes" viene del Excel con casing inconsistente
    // ("ENERO" vs "Enero"); se NORMALIZA contra MESES para que el filtro coincida
    // (antes "ENERO" !== "Enero" hacía que al filtrar por Enero no saliera nada).
    if (a.mes && a.mes.trim()) {
      const t = a.mes.trim().toLowerCase()
      const canon = MESES.find((mm) => mm.toLowerCase() === t)
      if (canon) return canon
    }
    // Respaldo confiable: derivar el mes de la fecha inicial (ISO YYYY-MM-DD).
    if (a.fecha_inicial) {
      const m = Number(a.fecha_inicial.slice(5, 7))
      if (m >= 1 && m <= 12) return MESES[m - 1]
    }
    return ""
  }

  // Años disponibles presentes en los datos (descendente).
  const anios = useMemo(() => {
    const set = new Set<string>()
    for (const a of items) {
      const y = anioDe(a)
      if (y) set.add(y)
    }
    return Array.from(set).sort((x, y) => y.localeCompare(x))
  }, [items])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((a) => {
      if (anioFiltro !== "todos" && anioDe(a) !== anioFiltro) return false
      if (mesFiltro !== "todos" && mesDe(a) !== mesFiltro) return false
      if (estadoFiltro !== "todos" && (a.estado_colaborador || "").trim().toUpperCase() !== estadoFiltro)
        return false
      if (tipoFiltro !== "todos" && a.tipo_evento !== tipoFiltro) return false
      if (soloRevision && !a.requiere_revision_sst) return false
      if (!q) return true
      return (
        a.nombre_colaborador.toLowerCase().includes(q) ||
        (a.cedula?.toLowerCase().includes(q) ?? false) ||
        (a.codigo_diagnostico?.toLowerCase().includes(q) ?? false) ||
        (a.descripcion_diagnostico?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [items, search, tipoFiltro, soloRevision, anioFiltro, mesFiltro, estadoFiltro])

  // La tabla se organiza por AÑO y luego por MES, de MENOR a MAYOR (ascendente).
  const sorted = useMemo(() => {
    const idxMes = (a: Ausentismo): number => {
      const i = MESES.indexOf(mesDe(a))
      return i >= 0 ? i + 1 : 99 // sin mes reconocible → al final
    }
    return [...filtered].sort((a, b) => {
      const ya = anioDe(a) || "9999" // sin año → al final
      const yb = anioDe(b) || "9999"
      if (ya !== yb) return ya.localeCompare(yb) // año ascendente
      const ma = idxMes(a)
      const mb = idxMes(b)
      if (ma !== mb) return ma - mb // mes ascendente
      return (a.fecha_inicial || "").localeCompare(b.fecha_inicial || "") // desempate por fecha
    })
  }, [filtered])

  // Conteo de Accidentes de Trabajo = EVENTOS NUEVOS por trabajador. Cada AT nuevo
  // suma UNA vez; las PRÓRROGAS (continuaciones del mismo AT del mismo trabajador,
  // marcadas con `prorroga` > 0, `dias_incapacidad` = 0) NO suman. Un trabajador
  // puede tener varios AT nuevos y cada uno suma. Se cuenta sobre las filas YA
  // filtradas (`filtered`), así respeta el filtro de mes/año/etc. y suma la tabla.
  const casosATReal = useMemo(
    () => filtered.filter((a) => a.tipo_evento === "AT" && (Number(a.prorroga) || 0) === 0).length,
    [filtered],
  )

  const totalRevision = useMemo(
    () => items.filter((i) => i.requiere_revision_sst).length,
    [items],
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-balance">Ausentismos</h2>
          <p className="text-sm text-muted-foreground">
            Control de incapacidades por Enfermedad General (EG) y Accidente de Trabajo (AT).
            Los diagnósticos con código "M" se marcan en rojo para revisión de SST.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={handleImport} disabled={importing}>
            {importing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="mr-2 h-4 w-4" />
            )}
            {importing ? "Importando..." : "Importar Excel"}
          </Button>
          <Dialog
            open={open}
            onOpenChange={(o) => {
              setOpen(o)
              if (!o) resetForm()
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Nuevo ausentismo
              </Button>
            </DialogTrigger>
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar ausentismo" : "Nuevo ausentismo"}</DialogTitle>
            </DialogHeader>

            <div className="space-y-5 py-2">
              {/* Identificacion */}
              <section className="space-y-3">
                <h3 className="border-b pb-1.5 text-base font-semibold text-foreground">Colaborador</h3>
                <p className="text-xs text-muted-foreground">
                  Digite la cédula del colaborador para autocompletar nombre, cargo, estado y centro de
                  trabajo desde el Head Count.
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="cedula">Cédula</Label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="cedula"
                        className="pl-9"
                        autoComplete="off"
                        placeholder="Digite la cédula del colaborador"
                        value={form.cedula}
                        onChange={(e) => handleCedulaChange(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="nombre">Nombre y apellidos *</Label>
                    <Input
                      id="nombre"
                      value={form.nombre_colaborador}
                      onChange={(e) => setForm({ ...form, nombre_colaborador: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cargo">Cargo</Label>
                    <Input
                      id="cargo"
                      value={form.cargo}
                      onChange={(e) => setForm({ ...form, cargo: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="area">Área</Label>
                    <Input
                      id="area"
                      placeholder="Administrativa, Cargue y Descargue, Alturas, SST..."
                      value={form.area}
                      onChange={(e) => setForm({ ...form, area: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="estado">Estado del colaborador</Label>
                    <Select
                      value={form.estado_colaborador}
                      onValueChange={(v) => setForm({ ...form, estado_colaborador: v })}
                    >
                      <SelectTrigger id="estado" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ACTIVO">Activo</SelectItem>
                        <SelectItem value="RETIRADO">Retirado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="centro">Centro de trabajo (Proyecto)</Label>
                    <Input
                      id="centro"
                      list="centros-trabajo"
                      placeholder="Seleccione o escriba el proyecto"
                      value={form.centro_trabajo}
                      onChange={(e) => setForm({ ...form, centro_trabajo: e.target.value })}
                    />
                    <datalist id="centros-trabajo">
                      {proyectos.map((p) => (
                        <option key={p} value={p} />
                      ))}
                    </datalist>
                  </div>
                </div>
              </section>

              {/* Evento */}
              <section className="space-y-3">
                <h3 className="border-b pb-1.5 text-base font-semibold text-foreground">Evento</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="mes">Mes de la incapacidad</Label>
                    <Select value={form.mes} onValueChange={(v) => setForm({ ...form, mes: v })}>
                      <SelectTrigger id="mes" className="w-full">
                        <SelectValue placeholder="Seleccione el mes" />
                      </SelectTrigger>
                      <SelectContent>
                        {MESES.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tipo">Tipo de evento</Label>
                    <Select
                      value={form.tipo_evento}
                      onValueChange={(v) => handleTipoEvento(v as "EG" | "AT")}
                    >
                      <SelectTrigger id="tipo" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EG">Enfermedad General (EG)</SelectItem>
                        <SelectItem value="AT">Accidente de Trabajo (AT)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="eps">{form.tipo_evento === "AT" ? "Centro médico / ARL" : "EPS"}</Label>
                    <Input
                      id="eps"
                      value={form.eps}
                      onChange={(e) => setForm({ ...form, eps: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="fi">Fecha inicial</Label>
                    <Input
                      id="fi"
                      type="date"
                      value={form.fecha_inicial}
                      onChange={(e) => setForm({ ...form, fecha_inicial: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ff">Fecha final</Label>
                    <Input
                      id="ff"
                      type="date"
                      value={form.fecha_final}
                      onChange={(e) => setForm({ ...form, fecha_final: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="di">Días incap.</Label>
                    <Input
                      id="di"
                      type="number"
                      value={form.dias_incapacidad}
                      onChange={(e) => handleDias("dias_incapacidad", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pr">Prórroga</Label>
                    <Input
                      id="pr"
                      type="number"
                      value={form.prorroga}
                      onChange={(e) => handleDias("prorroga", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="td">Total días</Label>
                    <Input
                      id="td"
                      type="number"
                      value={form.total_dias_incapacidad}
                      onChange={(e) => setForm({ ...form, total_dias_incapacidad: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="de">Días empresa</Label>
                    <Input
                      id="de"
                      type="number"
                      value={form.dias_empresa}
                      onChange={(e) => setForm({ ...form, dias_empresa: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="dep">Días EPS/ARL</Label>
                    <Input
                      id="dep"
                      type="number"
                      value={form.dias_eps}
                      onChange={(e) => setForm({ ...form, dias_eps: e.target.value })}
                    />
                  </div>
                </div>
              </section>

              {/* Diagnostico */}
              <section className="space-y-3">
                <h3 className="border-b pb-1.5 text-base font-semibold text-foreground">Diagnóstico (CIE-10)</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="relative space-y-1.5">
                    <Label htmlFor="diag">Código de la incapacidad</Label>
                    <Input
                      id="diag"
                      value={diagQuery}
                      placeholder="Digite el código, ej. M545"
                      autoComplete="off"
                      className="font-mono"
                      onChange={(e) => {
                        setDiagQuery(e.target.value)
                        setDiagOpen(true)
                      }}
                      onFocus={() => setDiagOpen(true)}
                    />
                    {diagOpen && (diagResults.length > 0 || diagLoading) && (
                      <div className="absolute z-50 mt-1 max-h-60 w-full min-w-[22rem] overflow-y-auto rounded-md border bg-popover shadow-md">
                        {diagLoading ? (
                          <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" /> Buscando...
                          </div>
                        ) : (
                          diagResults.map((d) => (
                            <button
                              key={d.codigo}
                              type="button"
                              onClick={() => selectDiagnostico(d)}
                              className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent ${
                                esCodigoM(d.codigo) ? "text-red-600" : "text-foreground"
                              }`}
                            >
                              <span className="font-mono font-semibold">{d.codigo}</span>
                              <span className="flex-1">{d.descripcion}</span>
                              {esCodigoM(d.codigo) && <AlertTriangle className="h-4 w-4 shrink-0" />}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="desc-diag">Descripción del diagnóstico</Label>
                    <Input
                      id="desc-diag"
                      value={form.descripcion_diagnostico}
                      readOnly
                      placeholder="Se completa al seleccionar el código"
                      className="bg-muted/40 text-foreground"
                    />
                  </div>
                </div>

                {form.codigo_diagnostico && esCodigoM(form.codigo_diagnostico) && (
                  <div className="flex items-center gap-2 rounded-md border border-red-300 bg-red-50 p-2 text-sm font-medium text-red-700">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Diagnóstico con código &quot;M&quot;: requiere revisión del profesional de SST.
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="parte">Parte del cuerpo afectada</Label>
                    <Input
                      id="parte"
                      value={form.parte_cuerpo}
                      onChange={(e) => setForm({ ...form, parte_cuerpo: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="est">Estadística</Label>
                    <Input
                      id="est"
                      value={form.estadistica}
                      onChange={(e) => setForm({ ...form, estadistica: e.target.value })}
                    />
                  </div>
                </div>
              </section>

              {/* Costos */}
              <section className="space-y-3">
                <h3 className="border-b pb-1.5 text-base font-semibold text-foreground">Costos</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="sb">Salario base</Label>
                    <Input
                      id="sb"
                      type="number"
                      value={form.salario_base}
                      onChange={(e) => setForm({ ...form, salario_base: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sbd">Salario base día</Label>
                    <Input
                      id="sbd"
                      type="number"
                      value={form.salario_base_dia}
                      onChange={(e) => setForm({ ...form, salario_base_dia: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ce">Costos empresa</Label>
                    <Input
                      id="ce"
                      type="number"
                      value={form.costos_empresa}
                      onChange={(e) => setForm({ ...form, costos_empresa: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cep">
                      {form.tipo_evento === "AT" ? "Costos ARL (asume 100%)" : "Costos EPS"}
                    </Label>
                    <Input
                      id="cep"
                      type="number"
                      value={form.tipo_evento === "AT" ? form.costos_arl : form.costos_eps}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          ...(form.tipo_evento === "AT"
                            ? { costos_arl: e.target.value }
                            : { costos_eps: e.target.value }),
                        })
                      }
                    />
                    {form.tipo_evento === "AT" && (
                      <button
                        type="button"
                        className="text-xs text-teal-600 hover:underline"
                        onClick={() => {
                          const dia = toNum(form.salario_base_dia)
                          const dias = toNum(form.total_dias_incapacidad)
                          if (dia && dias)
                            setForm((f) => ({ ...f, costos_arl: String(Math.round(dia * dias)) }))
                        }}
                      >
                        Calcular ARL = días × salario día
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tsp">Total salario pagado</Label>
                    <Input
                      id="tsp"
                      type="number"
                      value={form.total_salario_pagado}
                      onChange={(e) => setForm({ ...form, total_salario_pagado: e.target.value })}
                    />
                  </div>
                </div>
              </section>

              <div className="space-y-1.5">
                <Label htmlFor="obs">Observaciones</Label>
                <Textarea
                  id="obs"
                  rows={2}
                  value={form.observaciones}
                  onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {saving ? "Guardando..." : editingId ? "Actualizar" : "Guardar"}
              </Button>
            </DialogFooter>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Aviso de revision SST */}
      {totalRevision > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            {totalRevision} {totalRevision === 1 ? "diagnóstico" : "diagnósticos"} con código "M"
            {totalRevision === 1 ? " requiere" : " requieren"} revisión del profesional de SST.
          </span>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por colaborador, cédula o diagnóstico..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={anioFiltro} onValueChange={setAnioFiltro}>
          <SelectTrigger className="w-full sm:w-32">
            <SelectValue placeholder="Año" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los años</SelectItem>
            {anios.map((y) => (
              <SelectItem key={y} value={y}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={mesFiltro} onValueChange={setMesFiltro}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Mes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los meses</SelectItem>
            {MESES.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={estadoFiltro} onValueChange={setEstadoFiltro}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            <SelectItem value="ACTIVO">Activo</SelectItem>
            <SelectItem value="RETIRADO">Retirado</SelectItem>
          </SelectContent>
        </Select>
        {/* El proyecto lo define el SELECTOR GLOBAL (conector) — sin filtro interno. */}
        <Select value={tipoFiltro} onValueChange={(v) => setTipoFiltro(v as typeof tipoFiltro)}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder="Tipo de evento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los eventos</SelectItem>
            <SelectItem value="EG">Enfermedad General (EG)</SelectItem>
            <SelectItem value="AT">Accidente de Trabajo (AT)</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant={soloRevision ? "default" : "outline"}
          onClick={() => setSoloRevision((s) => !s)}
          className="gap-2"
        >
          <AlertTriangle className="h-4 w-4" />
          Solo revisión SST
        </Button>
      </div>

      {/* Pestañas: registros, resumen y costos */}
      <Tabs defaultValue="registros" className="space-y-4">
        <TabsList>
          <TabsTrigger value="registros" className="gap-2">
            <ListChecks className="h-4 w-4" />
            Registros
          </TabsTrigger>
          <TabsTrigger value="analisis" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            Análisis (control diario)
          </TabsTrigger>
          <TabsTrigger value="resumen" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Resumen
          </TabsTrigger>
        </TabsList>

        <TabsContent value="registros">
          {/* Tabla */}
          <div className="rounded-md border">
            <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mes</TableHead>
              <TableHead>Colaborador</TableHead>
              <TableHead>Cédula</TableHead>
              <TableHead>Centro de trabajo</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Diagnóstico</TableHead>
              <TableHead className="text-center">Días</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  No hay ausentismos registrados.
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((a) => (
                <TableRow
                  key={a.id}
                  className={a.requiere_revision_sst ? "bg-red-50 hover:bg-red-100" : ""}
                >
                  <TableCell>{a.mes || "-"}</TableCell>
                  <TableCell className="font-medium">{a.nombre_colaborador}</TableCell>
                  <TableCell>{a.cedula || "-"}</TableCell>
                  <TableCell>{a.centro_trabajo || "-"}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${
                        a.tipo_evento === "AT"
                          ? "bg-orange-100 text-orange-800"
                          : "bg-blue-100 text-blue-800"
                      }`}
                    >
                      {a.tipo_evento}
                    </span>
                  </TableCell>
                  <TableCell className={a.requiere_revision_sst ? "text-red-700" : ""}>
                    {a.codigo_diagnostico ? (
                      <div className="flex items-center gap-1.5">
                        {a.requiere_revision_sst && <AlertTriangle className="h-4 w-4 shrink-0" />}
                        <span className="font-mono font-semibold">{a.codigo_diagnostico}</span>
                        <span className="text-sm text-muted-foreground">
                          {a.descripcion_diagnostico}
                        </span>
                      </div>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="text-center">{a.total_dias_incapacidad ?? 0}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleEdit(a)} title="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(a.id)}
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="analisis">
          <AusentismosAnalisisDiario />
        </TabsContent>

        <TabsContent value="resumen">
          <AusentismosResumen items={filtered} casosAT={casosATReal} />
        </TabsContent>

        {/* La hoja de Costos se movió al submódulo "Recobro de Incapacidades"
            para centralizar toda la información de costos de incapacidades. */}
      </Tabs>
    </div>
  )
}
