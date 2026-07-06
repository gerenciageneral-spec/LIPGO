"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/components/auth-provider"
import {
  getExamenesMedicos,
  deleteExamenMedico,
  getCostoExamenDefault,
  setCostoExamenDefault,
  registrarConceptoExamen,
  importarExamenesDesdeHeadcount,
  revalidarExamenesDesdeDocumento,
  type ExamenMedico,
} from "@/lib/examenes-medicos-actions"
import { getHojasVida, type HojaDeVida } from "@/lib/hojas-vida-actions"
import { getColaboradoresLite } from "@/lib/headcount-actions"
import {
  Plus,
  Trash2,
  Eye,
  Download,
  Search,
  Stethoscope,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  DownloadCloud,
  Gavel,
  Wallet,
  ScanSearch,
} from "lucide-react"

const COP = (n: number) => "$" + (Number(n) || 0).toLocaleString("es-CO")

// Badge de aptitud a partir de la bandera `apto` (true/false/null).
function AptitudBadge({ apto }: { apto: boolean | null }) {
  if (apto === true)
    return (
      <Badge className="gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        <CheckCircle2 className="h-3 w-3" /> Apto
      </Badge>
    )
  if (apto === false)
    return (
      <Badge className="gap-1 bg-red-100 text-red-700 hover:bg-red-100">
        <XCircle className="h-3 w-3" /> No apto
      </Badge>
    )
  return (
    <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300">
      <Clock className="h-3 w-3" /> Pendiente
    </Badge>
  )
}

// Badge del estado de la persona en Head Count (Activo / Inactivo / Candidato nuevo).
function EstadoBadge({ estado }: { estado: string | null | undefined }) {
  if (estado === "Activo")
    return <Badge className="bg-sky-100 text-sky-700 hover:bg-sky-100">Activo</Badge>
  if (estado === "Inactivo")
    return <Badge className="bg-slate-200 text-slate-600 hover:bg-slate-200">Inactivo</Badge>
  return <Badge variant="outline" className="text-violet-600 border-violet-300">Candidato</Badge>
}

export default function ExamenesMedicos() {
  const { selectedEmpresaId } = useAuth()
  const { toast } = useToast()
  const [examenes, setExamenes] = useState<ExamenMedico[]>([])
  const [candidatos, setCandidatos] = useState<HojaDeVida[]>([])
  const [cedulasEnHeadcount, setCedulasEnHeadcount] = useState<Set<string>>(new Set())
  const [costoDefault, setCostoDefaultState] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [estadoFiltro, setEstadoFiltro] = useState<"todos" | "Activo" | "Inactivo">("todos")
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [importando, setImportando] = useState(false)
  const [revalidando, setRevalidando] = useState(false)

  // Candidato seleccionado (desde Hojas de Vida) y datos del examen.
  const [candidato, setCandidato] = useState<HojaDeVida | null>(null)
  const [candidatoSearch, setCandidatoSearch] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [tipoExamen, setTipoExamen] = useState("Ingreso")
  const [resultado, setResultado] = useState<string>("") // "Apto" | "No apto" | "" (pendiente)
  const [costo, setCosto] = useState<string>("")
  const [fechaExamen, setFechaExamen] = useState("")
  const [observaciones, setObservaciones] = useState("")

  // Dictaminar (para exámenes pendientes ya cargados).
  const [dictamen, setDictamen] = useState<ExamenMedico | null>(null)
  const [dictamenApto, setDictamenApto] = useState<string>("")
  const [dictamenCosto, setDictamenCosto] = useState<string>("")
  const [dictamenObs, setDictamenObs] = useState<string>("")
  const [guardandoDictamen, setGuardandoDictamen] = useState(false)

  const loadData = async () => {
    setLoading(true)
    // Auto-importar los antiguos del Head Count (por empresa del selector) como Apto
    // histórico. Idempotente: solo crea los que faltan, no duplica.
    if (selectedEmpresaId) {
      try { await importarExamenesDesdeHeadcount(selectedEmpresaId) } catch { /* no bloquea la carga */ }
    }
    const [exRes, hvRes, cd, hcLite] = await Promise.all([
      getExamenesMedicos(selectedEmpresaId),
      getHojasVida(selectedEmpresaId),
      getCostoExamenDefault(selectedEmpresaId),
      getColaboradoresLite(selectedEmpresaId),
    ])
    setExamenes(exRes.success ? exRes.data : [])
    setCandidatos(hvRes.success ? hvRes.data : [])
    setCedulasEnHeadcount(new Set((hcLite || []).map((c) => String(c.identificacion || "").trim()).filter(Boolean)))
    setCostoDefaultState(cd)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmpresaId])

  const resetForm = () => {
    setCandidato(null)
    setCandidatoSearch("")
    setFile(null)
    setTipoExamen("Ingreso")
    setResultado("")
    setCosto("")
    setFechaExamen("")
    setObservaciones("")
  }

  // Candidatos NUEVOS pendientes de examen: hojas de vida que NO están ya en Head
  // Count (los antiguos ya están vinculados y aptos) y que no fueron rechazadas.
  const candidatosFiltrados = useMemo(() => {
    const q = candidatoSearch.trim().toLowerCase()
    const base = candidatos.filter(
      (c) => c.estado !== "rechazado" && !cedulasEnHeadcount.has(String(c.cedula || "").trim()),
    )
    if (!q) return base.slice(0, 25)
    return base
      .filter(
        (c) =>
          c.nombre_candidato.toLowerCase().includes(q) ||
          (c.cedula?.toLowerCase().includes(q) ?? false),
      )
      .slice(0, 25)
  }, [candidatos, candidatoSearch, cedulasEnHeadcount])

  const handleUpload = async () => {
    if (!candidato) {
      toast({ title: "Falta el candidato", description: "Selecciona la hoja de vida del candidato." })
      return
    }
    if (!file) {
      toast({ title: "Falta el documento", description: "Adjunta el examen médico." })
      return
    }

    setUploading(true)
    try {
      const fd = new FormData()
      if (selectedEmpresaId) fd.append("empresaId", String(selectedEmpresaId))
      fd.append("hoja_vida_id", candidato.id)
      fd.append("cedula", candidato.cedula || "")
      fd.append("nombre", candidato.nombre_candidato)
      fd.append("tipo_examen", tipoExamen)
      fd.append("resultado", resultado) // "Apto" | "No apto" | "" (pendiente)
      fd.append("costo", costo || String(costoDefault))
      fd.append("fecha_examen", fechaExamen)
      fd.append("observaciones", observaciones)
      fd.append("file", file)

      const res = await fetch("/api/examenes-medicos/upload", { method: "POST", body: fd })
      const json = await res.json()

      if (!res.ok) {
        toast({ title: "Error", description: json.error || "No se pudo subir el examen médico." })
        return
      }

      if (json.promocion?.apto === true) {
        toast({ title: "Apto ✓", description: "Documentos subidos a Head Count. Contratación habilitada." })
      } else if (json.promocion?.apto === false) {
        toast({ title: "No apto", description: "Hoja de vida rechazada. Contratación bloqueada." })
      } else {
        toast({ title: "Examen guardado", description: "Queda pendiente de dictamen (apto / no apto)." })
      }
      setOpen(false)
      resetForm()
      loadData()
    } catch (err) {
      toast({ title: "Error", description: "Ocurrió un error al subir el archivo." })
    } finally {
      setUploading(false)
    }
  }

  const abrirDictamen = (e: ExamenMedico) => {
    setDictamen(e)
    setDictamenApto(e.apto === true ? "Apto" : e.apto === false ? "No apto" : "")
    setDictamenCosto(String(e.costo ?? costoDefault ?? 0))
    setDictamenObs(e.observaciones || "")
  }

  const guardarDictamen = async () => {
    if (!dictamen || !dictamenApto) {
      toast({ title: "Selecciona el resultado", description: "Marca Apto o No apto." })
      return
    }
    setGuardandoDictamen(true)
    try {
      const r = await registrarConceptoExamen({
        id: dictamen.id,
        apto: dictamenApto === "Apto",
        costo: Number(dictamenCosto) || 0,
        resultado: dictamenApto,
        observaciones: dictamenObs,
      })
      if (!r.success) {
        toast({ title: "Error", description: r.message || "No se pudo guardar el dictamen." })
        return
      }
      toast({ title: dictamenApto === "Apto" ? "Apto ✓" : "No apto", description: r.message })
      setDictamen(null)
      loadData()
    } finally {
      setGuardandoDictamen(false)
    }
  }

  const handleRevalidar = async () => {
    if (!confirm("Leer el 'Concepto de aptitud' de cada examen con documento y actualizar apto/no apto automáticamente. ¿Continuar?")) return
    setRevalidando(true)
    try {
      const r = await revalidarExamenesDesdeDocumento(selectedEmpresaId)
      if (r.success) {
        toast({
          title: "Aptitud validada desde documento",
          description: `${r.leidos} leídos · ${r.aptos} aptos · ${r.noAptos} no aptos · ${r.sinConcepto} sin concepto`,
        })
        loadData()
      } else {
        toast({ title: "Error", description: r.message || "No se pudo validar." })
      }
    } finally {
      setRevalidando(false)
    }
  }

  const handleImportar = async () => {
    setImportando(true)
    try {
      const r = await importarExamenesDesdeHeadcount(selectedEmpresaId)
      if (r.success) {
        toast({ title: "Histórico importado", description: `${r.creados} examen(es) de ingreso traídos de Head Count.` })
        loadData()
      } else {
        toast({ title: "Error", description: r.message || "No se pudo importar." })
      }
    } finally {
      setImportando(false)
    }
  }

  const guardarCostoDefault = async () => {
    const r = await setCostoExamenDefault(costoDefault, selectedEmpresaId)
    if (r.success) toast({ title: "Costo por defecto guardado", description: COP(costoDefault) + " por examen." })
    else toast({ title: "Error", description: r.message })
  }

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este examen médico? Esta acción no se puede deshacer.")) return
    const result = await deleteExamenMedico(id)
    if (result.success) {
      toast({ title: "Examen médico eliminado" })
      loadData()
    } else {
      toast({ title: "Error", description: result.message || "No se pudo eliminar." })
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return examenes.filter((e) => {
      if (estadoFiltro !== "todos" && (e.estado_persona || "") !== estadoFiltro) return false
      if (!q) return true
      return e.nombre.toLowerCase().includes(q) || (e.cedula?.toLowerCase().includes(q) ?? false)
    })
  }, [examenes, search, estadoFiltro])

  const conteoEstado = useMemo(() => {
    let activos = 0, inactivos = 0, candidatos = 0
    for (const e of examenes) {
      if (e.estado_persona === "Activo") activos++
      else if (e.estado_persona === "Inactivo") inactivos++
      else candidatos++
    }
    return { activos, inactivos, candidatos }
  }, [examenes])

  // KPIs calculados en vivo respetando el filtro de estado (Activo/Inactivo/Todos),
  // para que las tarjetas cambien con el filtro. Solo cuenta el examen vigente.
  const kpis = useMemo(() => {
    const base = examenes.filter(
      (e) => (estadoFiltro === "todos" || (e.estado_persona || "") === estadoFiltro) && e.vigente !== false,
    )
    let aptos = 0, noAptos = 0, pendientes = 0, costoNegativos = 0
    for (const e of base) {
      if (e.apto === true) aptos++
      else if (e.apto === false) { noAptos++; costoNegativos += Number(e.costo) || 0 }
      else pendientes++
    }
    const decididos = aptos + noAptos
    return {
      total: base.length,
      aptos,
      noAptos,
      pendientes,
      costoNegativos: Math.round(costoNegativos),
      tasaAprobacion: decididos > 0 ? Math.round((aptos / decididos) * 1000) / 10 : 0,
    }
  }, [examenes, estadoFiltro])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Stethoscope className="h-6 w-6 text-primary" />
            Exámenes Médicos
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Requisito de contratación. El candidato llega desde su hoja de vida; si el examen es{" "}
            <span className="font-medium text-emerald-600">Apto</span> se suben sus documentos a Head Count
            y se habilita el contrato; si es <span className="font-medium text-red-600">No apto</span> se
            rechaza y se bloquea la contratación. El histórico se conserva.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={handleImportar} disabled={importando}>
            {importando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DownloadCloud className="mr-2 h-4 w-4" />}
            Importar de Head Count
          </Button>

          <Button variant="outline" onClick={handleRevalidar} disabled={revalidando} title="Leer el concepto de aptitud de cada documento y clasificar apto/no apto">
            {revalidando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanSearch className="mr-2 h-4 w-4" />}
            Validar aptitud (leer documento)
          </Button>

          <Dialog
            open={open}
            onOpenChange={(o) => {
              setOpen(o)
              if (!o) resetForm()
              if (o && !costo) setCosto(String(costoDefault || ""))
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Cargar examen médico
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg" onInteractOutside={(e) => e.preventDefault()}>
              <DialogHeader>
                <DialogTitle>Nuevo examen médico</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Selector de candidato (desde Hojas de Vida) */}
                <div className="space-y-1.5">
                  <Label>
                    Candidato — hoja de vida (cédula o nombre) <span className="text-destructive">*</span>
                  </Label>
                  {candidato ? (
                    <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
                      <div className="text-sm">
                        <span className="font-medium text-foreground">{candidato.nombre_candidato}</span>
                        <span className="text-muted-foreground"> · {candidato.cedula || "sin cédula"}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setCandidato(null)
                          setCandidatoSearch("")
                        }}
                      >
                        Cambiar
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Buscar candidato por cédula o nombre..."
                          value={candidatoSearch}
                          onChange={(e) => setCandidatoSearch(e.target.value)}
                          className="pl-8"
                        />
                      </div>
                      <div className="max-h-40 overflow-y-auto rounded-md border border-border">
                        {candidatosFiltrados.length === 0 ? (
                          <p className="px-3 py-3 text-center text-xs text-muted-foreground">
                            No hay hojas de vida que coincidan. Cárgala primero en el submódulo Hojas de Vida.
                          </p>
                        ) : (
                          candidatosFiltrados.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setCandidato(c)}
                              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                            >
                              <span>
                                <span className="font-medium text-foreground">{c.nombre_candidato}</span>
                                <span className="text-muted-foreground"> · {c.cedula || "sin cédula"}</span>
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="tipo_examen">Tipo de examen</Label>
                    <Input
                      id="tipo_examen"
                      placeholder="Ingreso, periódico, egreso..."
                      value={tipoExamen}
                      onChange={(e) => setTipoExamen(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Resultado</Label>
                    <Select value={resultado} onValueChange={setResultado}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pendiente de dictamen" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Apto">Apto</SelectItem>
                        <SelectItem value="No apto">No apto</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="costo">Costo del examen</Label>
                    <Input
                      id="costo"
                      type="number"
                      min={0}
                      placeholder={String(costoDefault)}
                      value={costo}
                      onChange={(e) => setCosto(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="fecha_examen">Fecha del examen</Label>
                    <Input
                      id="fecha_examen"
                      type="date"
                      value={fechaExamen}
                      onChange={(e) => setFechaExamen(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="observaciones">Observaciones</Label>
                  <Textarea
                    id="observaciones"
                    rows={2}
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="file">
                    Documento del examen médico <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="file"
                    type="file"
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setOpen(false)} disabled={uploading}>
                    Cancelar
                  </Button>
                  <Button onClick={handleUpload} disabled={uploading}>
                    {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {uploading ? "Subiendo..." : "Guardar"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPIs de aptitud + costo asumido por LIP */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Aptos</div>
          <div className="mt-1 text-2xl font-bold text-emerald-600">{kpis.aptos}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><XCircle className="h-4 w-4 text-red-600" /> No aptos</div>
          <div className="mt-1 text-2xl font-bold text-red-600">{kpis.noAptos}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock className="h-4 w-4 text-amber-500" /> Pendientes</div>
          <div className="mt-1 text-2xl font-bold text-amber-500">{kpis.pendientes}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Gavel className="h-4 w-4 text-primary" /> Tasa aprobación</div>
          <div className="mt-1 text-2xl font-bold text-foreground">{kpis.tasaAprobacion}%</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Wallet className="h-4 w-4 text-red-600" /> Costo negativos</div>
          <div className="mt-1 text-2xl font-bold text-red-600">{COP(kpis.costoNegativos)}</div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o cédula..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          {/* Filtro por estado del personal (Activo / Inactivo) */}
          <div className="inline-flex rounded-md border border-border p-0.5 text-xs">
            {([
              ["todos", `Todos (${examenes.length})`],
              ["Activo", `Activos (${conteoEstado.activos})`],
              ["Inactivo", `Inactivos (${conteoEstado.inactivos})`],
            ] as const).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setEstadoFiltro(val)}
                className={
                  "rounded px-2.5 py-1 transition-colors " +
                  (estadoFiltro === val ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="costoDef" className="text-xs text-muted-foreground whitespace-nowrap">
            Costo x examen (config)
          </Label>
          <Input
            id="costoDef"
            type="number"
            min={0}
            value={costoDefault}
            onChange={(e) => setCostoDefaultState(Number(e.target.value) || 0)}
            className="w-28"
          />
          <Button variant="outline" size="sm" onClick={guardarCostoDefault}>
            Guardar
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empleado</TableHead>
              <TableHead>Cédula</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Aptitud</TableHead>
              <TableHead>Concepto</TableHead>
              <TableHead className="text-right">Costo</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                  No hay exámenes médicos registrados.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">
                    {e.nombre}
                    {e.promovido ? (
                      <span className="ml-2 text-[10px] text-emerald-600">✓ en Head Count</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{e.cedula || "—"}</TableCell>
                  <TableCell><EstadoBadge estado={e.estado_persona} /></TableCell>
                  <TableCell className="text-sm">{e.tipo_examen || "—"}</TableCell>
                  <TableCell><AptitudBadge apto={e.apto ?? null} /></TableCell>
                  <TableCell className="max-w-[220px] text-xs text-muted-foreground">
                    <span className="line-clamp-2" title={e.resultado || undefined}>
                      {(e.resultado || "—").replace(/\s*\n\s*/g, " · ")}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{e.costo ? COP(e.costo) : "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{e.fecha_examen || "—"}</TableCell>
                  <TableCell>
                    {e.archivo_url ? (
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" asChild title="Ver documento">
                          <a href={e.archivo_url} target="_blank" rel="noopener noreferrer">
                            <Eye className="h-4 w-4" />
                          </a>
                        </Button>
                        <Button variant="outline" size="sm" asChild title="Descargar">
                          <a href={e.archivo_url} download={e.archivo_nombre || undefined}>
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sin documento</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {e.apto === null || e.apto === undefined ? (
                        <Button variant="default" size="sm" onClick={() => abrirDictamen(e)} title="Dictaminar apto / no apto">
                          <Gavel className="mr-1 h-4 w-4" /> Dictaminar
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => abrirDictamen(e)} title="Cambiar dictamen">
                          <Gavel className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(e.id)}
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

      {/* Dialogo de dictamen (apto / no apto) para exámenes cargados */}
      <Dialog open={!!dictamen} onOpenChange={(o) => !o && setDictamen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Dictamen del examen médico</DialogTitle>
          </DialogHeader>
          {dictamen && (
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                <span className="font-medium text-foreground">{dictamen.nombre}</span>
                <span className="text-muted-foreground"> · {dictamen.cedula || "sin cédula"}</span>
              </div>
              <div className="space-y-1.5">
                <Label>Resultado <span className="text-destructive">*</span></Label>
                <Select value={dictamenApto} onValueChange={setDictamenApto}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona apto / no apto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Apto">Apto — habilita contrato y sube a Head Count</SelectItem>
                    <SelectItem value="No apto">No apto — rechaza y bloquea contrato</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dcosto">Costo del examen</Label>
                <Input id="dcosto" type="number" min={0} value={dictamenCosto} onChange={(e) => setDictamenCosto(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dobs">Observaciones</Label>
                <Textarea id="dobs" rows={2} value={dictamenObs} onChange={(e) => setDictamenObs(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setDictamen(null)} disabled={guardandoDictamen}>
                  Cancelar
                </Button>
                <Button onClick={guardarDictamen} disabled={guardandoDictamen}>
                  {guardandoDictamen && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Guardar dictamen
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
