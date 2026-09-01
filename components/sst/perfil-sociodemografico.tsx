"use client"

// Perfil Sociodemográfico (SST-FOR-32). Censo + análisis SG-SST / ISO 45001 / 0312.
// Filtra por el selector global (proyecto) y por estado (activos/retirados).
// Lee sst_perfil_sociodemografico.

import { useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SST_TOKENS } from "@/components/sst/sst-utils"
import { Kpi } from "@/components/sst/sst-form-ui"
import {
  listPerfilSociodemografico, savePerfilSociodemografico, getPerfilPorDocumento,
  resolverRevisionPerfil,
} from "@/lib/sst-perfil-actions"
import { buscarColaboradorMedevac } from "@/lib/sst-medevac-actions"
import { getCoberturaSST, type CoberturaSST, type FilaCobertura } from "@/lib/sst-cobertura-actions"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { Sec, Row3, Field, Sel } from "@/components/sst/sst-form-ui"
import {
  DOCUMENTO_TIPOS, CENTROS_TRABAJO, EPS_OPCIONES, ARL_OPCIONES, AFP_OPCIONES,
  SEXO_OPCIONES, ESCOLARIDAD_OPCIONES, ESTADO_CIVIL_OPCIONES, SI_NO,
  TIPO_VIVIENDA_OPCIONES, CARACTERISTICAS_VIVIENDA_OPCIONES, ZONA_OPCIONES,
  ESTRATO_OPCIONES, TRANSPORTE_OPCIONES, INGRESOS_OPCIONES, GRUPO_ETNICO_OPCIONES,
  TURNO_OPCIONES, CENTRO_POR_EMPRESA, edadDesdeFechaISO,
} from "@/lib/sst-datos-catalogos"
import type { PerfilSociodemograficoRow } from "@/lib/sst-evidencia-types"
import { Users, Loader2, Search, Pencil, X, UserPlus, AlertTriangle, Check } from "lucide-react"
import {
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts"

// Alto exacto del encabezado, en pixeles. La fila de filtros se ancla justo
// debajo con este mismo valor: al alto natural habria que adivinarlo y la fila
// quedaria montada sobre el encabezado o despegada de el.
const ALTO_ENCABEZADO = 30

// Radix Select no admite un item con valor vacio: el "sin filtro" usa este
// centinela en vez de "".
const TODOS_COB = "__todos"

const COLORS = ["#0D3B6E", "#00B4CC", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#14B8A6", "#F97316", "#64748B"]
const T = (v: any) => String(v ?? "").trim()

function conteo(rows: PerfilSociodemograficoRow[], fn: (r: PerfilSociodemograficoRow) => string): { name: string; value: number }[] {
  const m: Record<string, number> = {}
  for (const r of rows) {
    const k = fn(r) || "(sin dato)"
    m[k] = (m[k] || 0) + 1
  }
  return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
}

const rangoEdad = (e: number | null) => {
  const n = Number(e) || 0
  if (!n) return "(sin dato)"
  if (n <= 25) return "18–25"
  if (n <= 35) return "26–35"
  if (n <= 45) return "36–45"
  if (n <= 55) return "46–55"
  return "56+"
}
const antiguedadAnios = (r: PerfilSociodemograficoRow): number | null => {
  const s = T(r.fecha_ingreso)
  const m = /(\d{4})/.exec(s.length <= 5 ? "20" + s.slice(-2) : s) // heurística año
  const y = m ? Number(m[1]) : null
  if (!y || y < 2000 || y > 2100) return null
  return Math.max(0, 2026 - y)
}

// Columnas de la tabla detallada (todo el contexto) + exportación CSV.
// Todas las columnas del formato. "_nombre" y "_antiguedad" son DERIVADAS: la
// primera junta apellidos y nombres, la segunda se calcula desde la fecha de
// ingreso. La antiguedad no se guarda a proposito -- el archivo original la
// traia ya calculada y quedaba desactualizada al dia siguiente.
const COLS: { k: keyof PerfilSociodemograficoRow | "_nombre" | "_antiguedad"; l: string }[] = [
  { k: "documento", l: "Documento" }, { k: "documento_tipo", l: "Tipo doc." },
  { k: "_nombre", l: "Nombre" },
  { k: "fecha_nacimiento", l: "Nacimiento" }, { k: "edad", l: "Edad" }, { k: "sexo", l: "Sexo" },
  { k: "centro_trabajo", l: "Centro" }, { k: "cargo", l: "Cargo" }, { k: "turno", l: "Turno" },
  { k: "fecha_ingreso", l: "Ingreso" }, { k: "_antiguedad", l: "Antigüedad" },
  { k: "eps", l: "EPS" }, { k: "afp", l: "AFP" }, { k: "arl", l: "ARL" },
  { k: "nivel_escolaridad", l: "Escolaridad" }, { k: "estado_civil", l: "Estado civil" }, { k: "grupo_etnico", l: "Grupo étnico" },
  { k: "cabeza_familia", l: "Cabeza fam." }, { k: "num_hijos", l: "Hijos" }, { k: "personas_hogar", l: "Personas hogar" }, { k: "ingresos_familiares", l: "Ingresos" },
  { k: "tipo_vivienda", l: "Vivienda" }, { k: "caracteristicas_vivienda", l: "Tenencia" },
  { k: "zona", l: "Zona" }, { k: "estrato", l: "Estrato" }, { k: "transporte", l: "Transporte" },
  { k: "municipio_residencia", l: "Municipio" }, { k: "direccion", l: "Dirección" },
  { k: "pais_nacimiento", l: "País nac." }, { k: "depto_nacimiento", l: "Depto nac." },
  { k: "consume_alcohol", l: "Alcohol" }, { k: "actividad_fisica", l: "Act. física" }, { k: "fumador", l: "Fumador" }, { k: "estado", l: "Estado" },
]
const celda = (r: PerfilSociodemograficoRow, k: string): string => {
  if (k === "_nombre") return `${T(r.apellidos)} ${T(r.nombres)}`.trim()
  // La antiguedad se DERIVA de la fecha de ingreso. El archivo original la
  // traia ya calculada en tres columnas (Dia/Mes/Ano) y por eso quedaba
  // desactualizada al dia siguiente de exportarlo.
  if (k === "_antiguedad") {
    const a = antiguedad(T(r.fecha_ingreso))
    return a ? `${a.anios}a ${a.meses}m ${a.dias}d` : ""
  }
  return T((r as any)[k])
}

// Filtros: uno por cada COLUMNA (su texto genera las opciones). Arriba solo Mes/Año.
// Un filtro es dropdown si tiene pocos valores; si son muchos (nombre/documento…),
// es campo de texto (contiene).
const MESES = [
  ["01", "Enero"], ["02", "Febrero"], ["03", "Marzo"], ["04", "Abril"], ["05", "Mayo"], ["06", "Junio"],
  ["07", "Julio"], ["08", "Agosto"], ["09", "Septiembre"], ["10", "Octubre"], ["11", "Noviembre"], ["12", "Diciembre"],
]
/**
 * Año y mes de la fecha de ingreso, para los filtros de arriba.
 *
 * Acepta LAS DOS formas en que puede venir: `AAAA-MM-DD`, que es como la deja
 * la carga masiva y como la guarda el formulario, y `D/M/AAAA`, que es como
 * quedaron los registros viejos escritos a mano.
 *
 * Antes solo entendia D/M/A: con una fecha ISO tomaba el DIA como año, asi que
 * "2025-05-03" se filtraba bajo el año 2003. Se distingue por la posicion de
 * las cuatro cifras, no por el separador -- los dos formatos usan guion o
 * barra indistintamente.
 */
const ingParts = (r: PerfilSociodemograficoRow) => {
  const p = T(r.fecha_ingreso).split(/[/\-.]/).map((x) => x.trim()).filter(Boolean)
  if (p.length < 3) return { anio: "", mes: "" }

  const isoPrimero = /^\d{4}$/.test(p[0])
  let y = isoPrimero ? p[0] : p[2]
  const mNum = Number(p[1])          // el mes va en medio en los dos formatos
  if (y.length === 2) y = "20" + y
  return { anio: /^\d{4}$/.test(y) ? y : "", mes: mNum >= 1 && mNum <= 12 ? String(mNum).padStart(2, "0") : "" }
}

// Registro en blanco. `documento` es la llave: enlaza este perfil con la ficha
// MEDEVAC de la misma persona y con su head count.
const formVacio = (empresaId?: number | null): Record<string, any> => ({
  documento: "", documento_tipo: "Cedula de ciudadanía", nombres: "", apellidos: "",
  fecha_nacimiento: "", sexo: "", eps: "", afp: "", arl: "Sura",
  centro_trabajo: (empresaId && CENTRO_POR_EMPRESA[empresaId]) || "", turno: "", cargo: "",
  fecha_ingreso: "", pais_nacimiento: "Colombia", depto_nacimiento: "", municipio_residencia: "",
  grupo_etnico: "", nivel_escolaridad: "", estado_civil: "", cabeza_familia: "",
  num_hijos: "", personas_hogar: "", ingresos_familiares: "", tipo_vivienda: "",
  caracteristicas_vivienda: "", zona: "", direccion: "", transporte: "", estrato: "",
  consume_alcohol: "", actividad_fisica: "", fumador: "", estado: "activo",
})

/**
 * Antiguedad en la empresa a partir de `fecha_ingreso` (AAAA-MM-DD).
 *
 * El formulario original traia tres columnas -Dia, Mes y Ano- con este mismo
 * calculo ya hecho. NO se guardaron: una antiguedad guardada queda desactualizada
 * al dia siguiente, y la fecha de ingreso no.
 */
function antiguedad(fechaISO: string | null | undefined, hoyISO?: string) {
  const f = String(fechaISO ?? "").trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return null
  const hoy = hoyISO ?? new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" })
  const [ay, am, ad] = f.split("-").map(Number)
  const [hy, hm, hd] = hoy.split("-").map(Number)
  let anios = hy - ay, meses = hm - am, dias = hd - ad
  if (dias < 0) { meses--; dias += new Date(hy, hm - 1, 0).getDate() }
  if (meses < 0) { anios--; meses += 12 }
  return anios < 0 ? null : { anios, meses, dias }
}

export function PerfilSociodemografico({ selectedEmpresaId: propEmpresaId }: { selectedEmpresaId?: number | null }) {
  const { selectedEmpresaId: ctxEmpresaId } = useAuth()
  const empresaId = propEmpresaId ?? ctxEmpresaId ?? null
  const [rows, setRows] = useState<PerfilSociodemograficoRow[]>([])
  const [cobertura, setCobertura] = useState<CoberturaSST | null>(null)
  const [loading, setLoading] = useState(true)
  const [estado, setEstado] = useState<"activo" | "retirado" | "todos">("activo")
  const [tab, setTab] = useState("analisis")
  const [filtros, setFiltros] = useState<Record<string, string>>({}) // por columna
  const [mesF, setMesF] = useState("")
  const [anioF, setAnioF] = useState("")
  const { toast } = useToast()
  const [form, setForm] = useState<Record<string, any>>(() => formVacio(empresaId))
  const [guardando, setGuardando] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const editando = !!form._existe
  const setF = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }))

  async function cargar() {
    setLoading(true)
    const [lista, cob] = await Promise.all([listPerfilSociodemografico(empresaId), getCoberturaSST()])
    setRows(lista)
    setCobertura(cob)
    setLoading(false)
  }
  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  /**
   * Trae lo que ya se sabe de esa persona: su perfil si existe, y si no, al
   * menos el nombre y el cargo del head count. Evita volver a digitar datos
   * que la empresa ya tiene y, sobre todo, evita crear un perfil con el nombre
   * escrito distinto al de su ficha MEDEVAC.
   */
  async function buscarPorDocumento() {
    const doc = String(form.documento || "").trim()
    if (!doc) return
    setBuscando(true)
    const [pr, hc] = await Promise.all([getPerfilPorDocumento(doc), buscarColaboradorMedevac(doc, null)])
    setBuscando(false)

    if (pr) {
      cargarEnFormulario(pr)
      toast({ title: "Ya tiene perfil", description: `${pr.apellidos ?? ""} ${pr.nombres ?? ""} — se cargó para editarlo.` })
      return
    }
    if (hc.found && hc.data) {
      // El head count guarda "Apellidos Nombres" en un solo campo. Se parte por
      // las dos primeras palabras, que es como se lee el censo (por apellido).
      const partes = String(hc.data.nombres ?? "").trim().split(/\s+/)
      setForm((f) => ({
        ...f,
        apellidos: partes.slice(0, 2).join(" ") || f.apellidos,
        nombres: partes.slice(2).join(" ") || f.nombres,
        cargo: hc.data.cargo || f.cargo,
        centro_trabajo: CENTRO_POR_EMPRESA[hc.data.idempresa] ?? f.centro_trabajo,
      }))
      toast({ title: "Sin perfil todavía", description: `${hc.data.nombres} — se tomaron nombre y cargo del head count.` })
      return
    }
    toast({ title: "No se encontró", description: "Ese documento no está en el head count. Revísalo antes de crear el perfil." })
  }

  function cargarEnFormulario(r: PerfilSociodemograficoRow) {
    setForm({
      _existe: true,
      documento: r.documento ?? "", documento_tipo: r.documento_tipo ?? "Cedula de ciudadanía",
      nombres: r.nombres ?? "", apellidos: r.apellidos ?? "",
      fecha_nacimiento: r.fecha_nacimiento ?? "", sexo: r.sexo ?? "",
      eps: r.eps ?? "", afp: r.afp ?? "", arl: r.arl ?? "Sura",
      centro_trabajo: r.centro_trabajo ?? "", turno: r.turno ?? "", cargo: r.cargo ?? "",
      fecha_ingreso: r.fecha_ingreso ?? "", pais_nacimiento: r.pais_nacimiento ?? "Colombia",
      depto_nacimiento: r.depto_nacimiento ?? "", municipio_residencia: r.municipio_residencia ?? "",
      grupo_etnico: r.grupo_etnico ?? "", nivel_escolaridad: r.nivel_escolaridad ?? "",
      estado_civil: r.estado_civil ?? "", cabeza_familia: r.cabeza_familia ?? "",
      num_hijos: r.num_hijos == null ? "" : String(r.num_hijos),
      personas_hogar: r.personas_hogar == null ? "" : String(r.personas_hogar),
      ingresos_familiares: r.ingresos_familiares ?? "", tipo_vivienda: r.tipo_vivienda ?? "",
      caracteristicas_vivienda: r.caracteristicas_vivienda ?? "", zona: r.zona ?? "",
      direccion: r.direccion ?? "", transporte: r.transporte ?? "", estrato: r.estrato ?? "",
      consume_alcohol: r.consume_alcohol ?? "", actividad_fisica: r.actividad_fisica ?? "",
      fumador: r.fumador ?? "", estado: r.estado ?? "activo",
    })
    setTab("registrar")
  }

  async function guardar() {
    if (!String(form.documento || "").trim()) {
      toast({ title: "Falta el N° de documento", description: "Es la llave que enlaza el perfil con su ficha MEDEVAC." })
      return
    }
    if (!String(form.apellidos || "").trim() && !String(form.nombres || "").trim()) {
      toast({ title: "Falta el nombre del colaborador" })
      return
    }
    setGuardando(true)
    const { _existe, ...datos } = form
    // `requiere_revision` se limpia: guardar a mano ES la revision.
    const res = await savePerfilSociodemografico(
      { ...datos, requiere_revision: false, revision_nota: null, idempresa: empresaId ?? undefined } as any,
      empresaId,
    )
    setGuardando(false)
    if (res.success) {
      toast({ title: editando ? "Perfil actualizado" : "Perfil creado" })
      setForm(formVacio(empresaId))
      cargar()
      setTab("listado")
    } else {
      toast({ title: "Error al guardar", description: res.message })
    }
  }

  // Perfiles que entraron por carga masiva con algo que corregir a mano: una
  // EPS mal escrita, un municipio que quedo con el texto de ayuda del
  // formulario, un documento que no cuadra con su ficha MEDEVAC.
  //
  // Se calcula sobre `rows` y no sobre `base`: el filtro de activo/retirado de
  // arriba no deberia esconder un dato pendiente de corregir. Si alguien esta
  // retirado y su perfil quedo mal, sigue siendo un dato malo en el censo.
  const pendientes = useMemo(() => rows.filter((r: any) => r.requiere_revision), [rows])

  async function marcarRevisado(id?: number) {
    if (!id) return
    const r = await resolverRevisionPerfil(id)
    if (r.success) {
      toast({ title: "Marcado como corregido", description: r.message })
      cargar()
    } else {
      toast({ title: "No se pudo marcar", description: r.message })
    }
  }

  // --- Cobertura del censo contra el head count ----------------------------
  // Filtros propios: aqui el universo son las personas ACTIVAS del head count,
  // tengan perfil o no, que es un conjunto distinto del listado de arriba
  // (los perfiles que existen). Compartir los filtros confundiria.
  const [cobQ, setCobQ] = useState("")
  const [cobCentro, setCobCentro] = useState(TODOS_COB)
  const [cobCargo, setCobCargo] = useState(TODOS_COB)
  const [cobEstado, setCobEstado] = useState("pendientes")

  const filasCobertura = cobertura?.filas ?? []

  const cobOpciones = useMemo(() => {
    const uniq = (f: (x: FilaCobertura) => string | null) =>
      [...new Set(filasCobertura.map((x) => T(f(x))).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"))
    return { centros: uniq((x) => x.centroTrabajo), cargos: uniq((x) => x.cargo) }
  }, [filasCobertura])

  const cobFiltrada = useMemo(() => {
    const t = T(cobQ).toLowerCase()
    return filasCobertura.filter((x) => {
      if (cobCentro !== TODOS_COB && T(x.centroTrabajo) !== cobCentro) return false
      if (cobCargo !== TODOS_COB && T(x.cargo) !== cobCargo) return false
      // Solo el Perfil: la ficha MEDEVAC tiene su propia cobertura en su modulo.
      if (cobEstado === "pendientes" && x.perfilCompleto) return false
      if (cobEstado === "completos" && !x.perfilCompleto) return false
      if (t && !`${x.nombre} ${x.identificacion}`.toLowerCase().includes(t)) return false
      return true
    })
  }, [filasCobertura, cobQ, cobCentro, cobCargo, cobEstado])

  // Los indicadores se calculan sobre lo FILTRADO: filtrar por un centro y que
  // los numeros siguieran mostrando el total de la empresa haria que no
  // cuadraran con la tabla que se ve justo debajo.
  const cobKpis = useMemo(() => ({
    n: cobFiltrada.length,
    conPerfil: cobFiltrada.filter((x) => x.tienePerfil).length,
    perfilCompleto: cobFiltrada.filter((x) => x.perfilCompleto).length,
  }), [cobFiltrada])

  const hayFiltroCob = T(cobQ) !== "" || cobCentro !== TODOS_COB || cobCargo !== TODOS_COB || cobEstado !== "pendientes"
  function limpiarFiltrosCobertura() {
    setCobQ(""); setCobCentro(TODOS_COB); setCobCargo(TODOS_COB); setCobEstado("pendientes")
  }

  const base = useMemo(() => rows.filter((r) => estado === "todos" || (r.estado ?? "activo") === estado), [rows, estado])
  // Opciones (valores presentes) por CADA columna.
  const opciones = useMemo(() => {
    const m: Record<string, Set<string>> = {}
    COLS.forEach((c) => (m[String(c.k)] = new Set()))
    base.forEach((r) => COLS.forEach((c) => { const v = celda(r, String(c.k)); if (v) m[String(c.k)].add(v) }))
    return m
  }, [base])
  // ¿dropdown (pocas opciones) o campo de texto "contiene" (muchas)?
  const esSelect = (k: string) => (opciones[k]?.size ?? 0) <= 25
  const anios = useMemo(() => {
    const s = new Set<string>()
    base.forEach((r) => { const a = ingParts(r).anio; if (a) s.add(a) })
    return Array.from(s).sort().reverse()
  }, [base])
  // Tabla: base + Mes/Año (ingreso) + filtro por cada columna.
  const filtradas = useMemo(() => {
    return base.filter((r) => {
      const ing = ingParts(r)
      if (anioF && ing.anio !== anioF) return false
      if (mesF && ing.mes !== mesF) return false
      for (const c of COLS) {
        const fv = filtros[String(c.k)]
        if (!fv) continue
        const cell = celda(r, String(c.k))
        if (esSelect(String(c.k))) { if (cell !== fv) return false }
        else if (!cell.toLowerCase().includes(fv.toLowerCase())) return false
      }
      return true
    })
  }, [base, filtros, mesF, anioF, opciones])
  const activos = Object.values(filtros).filter(Boolean).length + (mesF ? 1 : 0) + (anioF ? 1 : 0)
  // Tarjetas de análisis EN VIVO según los filtros aplicados.
  const kpisF = useMemo(() => {
    const n = filtradas.length
    const pct = (x: number) => (n ? Math.round((100 * x) / n) : 0)
    const cnt = (fn: (r: PerfilSociodemograficoRow) => boolean) => filtradas.filter(fn).length
    const edades = filtradas.map((r) => Number(r.edad) || 0).filter(Boolean)
    const edad = edades.length ? Math.round(edades.reduce((a, b) => a + b, 0) / edades.length) : 0
    const ants = filtradas.map(antiguedadAnios).filter((x): x is number => x !== null)
    const ant = ants.length ? (ants.reduce((a, b) => a + b, 0) / ants.length).toFixed(1) : "0"
    const moda = (fn: (r: PerfilSociodemograficoRow) => string) => { const c = conteo(filtradas, fn); return c.length && c[0].name !== "(sin dato)" ? `${c[0].name}` : "—" }
    return {
      n, pctTotal: base.length ? Math.round((100 * n) / base.length) : 0, edad, ant,
      masc: pct(cnt((r) => /^m/i.test(T(r.sexo)))), fem: pct(cnt((r) => /^f/i.test(T(r.sexo)))),
      cabeza: pct(cnt((r) => /^s/i.test(T(r.cabeza_familia)))), fuma: pct(cnt((r) => /^s/i.test(T(r.fumador)))),
      activ: pct(cnt((r) => /^s/i.test(T(r.actividad_fisica)))),
      escolaridad: moda((r) => T(r.nivel_escolaridad)), estrato: moda((r) => T(r.estrato)), cargo: moda((r) => T(r.cargo)),
    }
  }, [filtradas, base])
  const edadPromF = kpisF.edad

  function exportarCSV() {
    const head = COLS.map((c) => `"${c.l}"`).join(";")
    const body = filtradas.map((r) => COLS.map((c) => `"${String(celda(r, c.k as string)).replace(/"/g, "'")}"`).join(";")).join("\n")
    const blob = new Blob(["﻿" + head + "\n" + body], { type: "text/csv;charset=utf-8;" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `perfil-sociodemografico-${estado}.csv`
    a.click()
  }

  const kpis = useMemo(() => {
    const n = base.length
    const edades = base.map((r) => Number(r.edad) || 0).filter(Boolean)
    const edadProm = edades.length ? Math.round(edades.reduce((a, b) => a + b, 0) / edades.length) : 0
    const h = base.filter((r) => /^m/i.test(T(r.sexo))).length
    const muj = base.filter((r) => /^f/i.test(T(r.sexo))).length
    const cabeza = base.filter((r) => /^s/i.test(T(r.cabeza_familia))).length
    const ants = base.map(antiguedadAnios).filter((x): x is number => x !== null)
    const antProm = ants.length ? (ants.reduce((a, b) => a + b, 0) / ants.length).toFixed(1) : "0"
    const fuma = base.filter((r) => /^s/i.test(T(r.fumador))).length
    const activo = base.filter((r) => /^s/i.test(T(r.actividad_fisica))).length
    const pct = (x: number) => (n ? Math.round((100 * x) / n) : 0)
    return { n, edadProm, hPct: pct(h), mujPct: pct(muj), cabezaPct: pct(cabeza), antProm, fumaPct: pct(fuma), activoPct: pct(activo) }
  }, [base])

  const fmtEmpresa = empresaId ? "" : " · consolidado (todos los proyectos)"

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xl font-bold" style={{ color: SST_TOKENS.navy }}>
          <Users className="h-5 w-5" /> Perfil Sociodemográfico (SST-FOR-32){fmtEmpresa}
        </h2>
        <Badge variant="outline">ISO 45001 · Res. 0312 — caracterización de la población trabajadora</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["activo", "retirado", "todos"] as const).map((e) => (
          <Button key={e} size="sm" variant={estado === e ? "default" : "outline"} onClick={() => setEstado(e)}
            style={estado === e ? { background: SST_TOKENS.navy, color: "white" } : undefined}>
            {e === "activo" ? "Activos" : e === "retirado" ? "Retirados" : "Todos"}
          </Button>
        ))}
        {loading && <Loader2 className="h-4 w-4 animate-spin" style={{ color: SST_TOKENS.teal }} />}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
        <Kpi t="Colaboradores" v={kpis.n} />
        <Kpi t="Edad promedio" v={`${kpis.edadProm}`} />
        <Kpi t="Masculino" v={`${kpis.hPct}%`} c={SST_TOKENS.navy} />
        <Kpi t="Femenino" v={`${kpis.mujPct}%`} c={SST_TOKENS.teal} />
        <Kpi t="Cabeza de familia" v={`${kpis.cabezaPct}%`} />
        <Kpi t="Antigüedad prom." v={`${kpis.antProm} a`} />
        <Kpi t="Actividad física" v={`${kpis.activoPct}%`} c={SST_TOKENS.ok} />
        <Kpi t="Fumadores" v={`${kpis.fumaPct}%`} c={kpis.fumaPct > 20 ? SST_TOKENS.warn : SST_TOKENS.ok} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="analisis">Análisis (dashboards)</TabsTrigger>
          <TabsTrigger value="listado">Tabla / Análisis detallado</TabsTrigger>
          <TabsTrigger value="cobertura">Cobertura</TabsTrigger>
          <TabsTrigger value="pendientes">
            Por corregir
            {pendientes.length > 0 && (
              <span
                className="ml-1.5 rounded-full px-1.5 text-[10px] font-bold"
                style={{ background: SST_TOKENS.warn, color: "white" }}
              >
                {pendientes.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="registrar">{editando ? "Editar registro" : "Crear registro"}</TabsTrigger>
        </TabsList>

        {/* Captura manual. El modulo era de solo lectura: el censo dependia por
            completo de que el trabajador lo diligenciara en el portal o de una
            carga masiva. Aqui SST puede crear y corregir registros uno a uno. */}
        {/* Cobertura del censo contra el head count: la pregunta de auditoría
            es "¿toda la plantilla tiene su perfil sociodemográfico?", y se
            responde aquí. Parte del personal ACTIVO, tenga perfil o no, así que
            puede listar gente que en la tabla de arriba todavía no existe. */}
        <TabsContent value="cobertura" className="pt-3">
          {!cobertura ? (
            <Card className="p-6 text-center text-muted-foreground">Cargando cobertura…</Card>
          ) : !cobertura.disponible ? (
            <Card className="p-6 text-sm text-muted-foreground">
              No se pudo calcular la cobertura. Verifica que la vista <code>vw_sst_datos_colaborador</code>{" "}
              exista (script <code>scripts/sig/44_medevac_perfil_enlace_y_carga.sql</code>).
            </Card>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
                <Kpi t={hayFiltroCob ? "Activos (filtrados)" : "Activos en head count"} v={cobKpis.n} />
                <Kpi t="Con perfil creado" v={cobKpis.conPerfil} />
                <Kpi
                  t="Perfil completo"
                  v={cobKpis.perfilCompleto}
                  c={cobKpis.n > 0 && cobKpis.perfilCompleto === cobKpis.n ? SST_TOKENS.ok : SST_TOKENS.warn}
                />
                <Kpi
                  t="Sin perfil completo"
                  v={cobKpis.n - cobKpis.perfilCompleto}
                  c={cobKpis.perfilCompleto === cobKpis.n ? SST_TOKENS.ok : SST_TOKENS.bad}
                />
              </div>

              <Card className="p-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[14rem] flex-1">
                    <label className="text-xs" style={{ color: SST_TOKENS.ink }}>Colaborador</label>
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input value={cobQ} onChange={(e) => setCobQ(e.target.value)} placeholder="Nombre o cédula…" className="pl-8" />
                    </div>
                  </div>
                  <div className="w-48">
                    <label className="text-xs" style={{ color: SST_TOKENS.ink }}>Centro de trabajo</label>
                    <Sel v={cobCentro} on={setCobCentro} o={[[TODOS_COB, "Todos los centros"], ...cobOpciones.centros.map((c) => [c, c] as [string, string])]} />
                  </div>
                  <div className="w-48">
                    <label className="text-xs" style={{ color: SST_TOKENS.ink }}>Cargo</label>
                    <Sel v={cobCargo} on={setCobCargo} o={[[TODOS_COB, "Todos los cargos"], ...cobOpciones.cargos.map((c) => [c, c] as [string, string])]} />
                  </div>
                  <div className="w-52">
                    <label className="text-xs" style={{ color: SST_TOKENS.ink }}>Estado del perfil</label>
                    <Sel
                      v={cobEstado}
                      on={setCobEstado}
                      o={[
                        ["pendientes", "Sin perfil completo"],
                        ["completos", "Con perfil completo"],
                        ["todos", "Todos"],
                      ]}
                    />
                  </div>
                  {hayFiltroCob && (
                    <Button variant="ghost" size="sm" onClick={limpiarFiltrosCobertura} title="Volver al estado inicial">
                      <X className="mr-1 h-4 w-4" /> Limpiar
                    </Button>
                  )}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  <Users className="mr-1 inline h-3.5 w-3.5" />
                  Personal <b>activo</b> en el head count. El portal del trabajador le exige completar
                  su perfil cuando entra a pedir un anticipo, un permiso o un certificado. La ficha
                  MEDEVAC tiene su propia cobertura en su módulo.
                  {" "}Mostrando <b>{cobFiltrada.length}</b> de {filasCobertura.length}.
                </div>
              </Card>

              <Card className="p-0 overflow-x-auto">
                <div className="max-h-[60vh] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0">
                      <tr style={{ background: SST_TOKENS.navy, color: "white" }}>
                        <th className="p-2 text-left">Colaborador</th>
                        <th className="p-2 text-left">Documento</th>
                        <th className="p-2 text-left">Centro de trabajo</th>
                        <th className="p-2 text-left">Cargo</th>
                        <th className="p-2 text-center">Perfil Sociodemográfico</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cobFiltrada.map((f, i) => (
                        <tr key={f.identificacion + i} style={{ background: i % 2 ? "#f7fafc" : "white" }}>
                          <td className="p-2">{f.nombre}</td>
                          <td className="p-2 text-xs text-muted-foreground">{f.identificacion}</td>
                          <td className="p-2 text-xs">{f.centroTrabajo || <span className="text-muted-foreground">—</span>}</td>
                          <td className="p-2 text-xs">{f.cargo || <span className="text-muted-foreground">—</span>}</td>
                          <td className="p-2 text-center">
                            {/* Tres estados, no dos: "Falta" es que no hay
                                registro y hay que crearlo entero; "Incompleto"
                                es que ya existe y solo le falta un dato. No se
                                resuelven igual. */}
                            <Badge
                              style={{
                                background: f.perfilCompleto ? SST_TOKENS.ok : f.tienePerfil ? SST_TOKENS.warn : SST_TOKENS.bad,
                                color: "white",
                              }}
                            >
                              {f.perfilCompleto ? "Completo" : f.tienePerfil ? "Incompleto" : "Falta"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                      {cobFiltrada.length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-6 text-center" style={{ color: hayFiltroCob ? undefined : SST_TOKENS.ok }}>
                            {hayFiltroCob
                              ? "Nadie coincide con los filtros."
                              : "Toda la plantilla activa tiene su perfil completo."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Perfiles que la carga masiva no pudo resolver sola. Mismo
            comportamiento que la pestana equivalente de MEDEVAC: al corregir y
            guardar, o al marcarlos como revisados, salen de esta lista. */}
        <TabsContent value="pendientes" className="pt-3">
          <Card className="p-0 overflow-x-auto">
            <div className="border-b p-3 text-xs text-muted-foreground">
              Perfiles que entraron con algún dato por corregir a mano. Al editarlos y guardar, o al
              marcarlos como corregidos, salen de esta lista.
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: SST_TOKENS.warn, color: "white" }}>
                  <th className="p-2 text-left">Colaborador</th>
                  <th className="p-2 text-left">Documento</th>
                  <th className="p-2 text-left">Qué hay que corregir</th>
                  <th className="p-2 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pendientes.map((r: any, i: number) => (
                  <tr key={r.id ?? i} style={{ background: i % 2 ? "#fffaf0" : "white" }}>
                    <td className="p-2">
                      <div className="flex items-center gap-1 font-medium">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: SST_TOKENS.warn }} />
                        {[r.apellidos, r.nombres].filter(Boolean).join(" ") || "Sin nombre"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {[r.cargo, r.centro_trabajo].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </td>
                    <td className="p-2 font-mono text-xs">{r.documento || "—"}</td>
                    <td className="p-2 text-xs">{r.revision_nota || "Sin motivo registrado"}</td>
                    <td className="p-2 text-center whitespace-nowrap">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={() => cargarEnFormulario(r)}
                      >
                        <Pencil className="mr-1 h-3 w-3" /> Corregir
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        title="Ya está bien así"
                        onClick={() => marcarRevisado(r.id)}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {pendientes.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center" style={{ color: SST_TOKENS.ok }}>
                      No hay perfiles pendientes por corregir.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="registrar" className="pt-3">
          <Card className="space-y-6 p-4">
            {editando && (
              <div className="flex items-center justify-between rounded-md px-3 py-2 text-xs" style={{ background: SST_TOKENS.light }}>
                <span>
                  Editando el perfil de <b>{form.apellidos} {form.nombres}</b>. El documento es la llave:
                  si lo cambias, se crea un registro nuevo en vez de actualizar este.
                </span>
                <Button variant="ghost" size="sm" onClick={() => setForm(formVacio(empresaId))}>
                  <X className="mr-1 h-3.5 w-3.5" /> Cancelar
                </Button>
              </div>
            )}

            <Sec n="Identificación">
              <p className="-mt-1 text-[11px] text-muted-foreground">
                Digita el <b>N° de documento</b> y pulsa buscar. Si la persona ya tiene perfil se carga
                para editarlo; si no, se traen su nombre y cargo del <b>head count</b> para no digitarlos
                ni arriesgarse a escribirlos distinto a como están en su ficha MEDEVAC.
              </p>
              <Row3>
                <Field l="N° de documento">
                  <div className="flex gap-1">
                    <Input
                      value={form.documento}
                      onChange={(e) => setF("documento", e.target.value)}
                      onBlur={buscarPorDocumento}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscarPorDocumento() } }}
                      placeholder="Cédula…"
                    />
                    <Button type="button" variant="outline" size="sm" className="shrink-0" disabled={buscando} onClick={buscarPorDocumento}>
                      {buscando ? "…" : <Search className="h-4 w-4" />}
                    </Button>
                  </div>
                </Field>
                <Field l="Tipo de documento"><Sel v={form.documento_tipo} on={(v) => setF("documento_tipo", v)} o={DOCUMENTO_TIPOS} /></Field>
                <Field l="Apellidos"><Input value={form.apellidos} onChange={(e) => setF("apellidos", e.target.value)} /></Field>
                <Field l="Nombres"><Input value={form.nombres} onChange={(e) => setF("nombres", e.target.value)} /></Field>
                <Field l="Estado"><Sel v={form.estado || "activo"} on={(v) => setF("estado", v)} o={[["activo", "Activo"], ["retirado", "Retirado"]]} /></Field>
              </Row3>
            </Sec>

            <Sec n="Datos personales">
              <Row3>
                <Field l="Fecha de nacimiento"><Input type="date" value={form.fecha_nacimiento} onChange={(e) => setF("fecha_nacimiento", e.target.value)} /></Field>
                <Field l="Edad">
                  {/* Solo lectura: se deriva de la fecha. Una edad escrita a
                      mano deja de ser cierta al año siguiente. */}
                  <Input readOnly className="bg-muted" value={edadDesdeFechaISO(form.fecha_nacimiento) ?? ""} placeholder="Se calcula sola" />
                </Field>
                <Field l="Sexo"><Sel v={form.sexo || ""} on={(v) => setF("sexo", v)} o={SEXO_OPCIONES} /></Field>
                <Field l="País de nacimiento"><Input value={form.pais_nacimiento} onChange={(e) => setF("pais_nacimiento", e.target.value)} /></Field>
                <Field l="Departamento de nacimiento"><Input value={form.depto_nacimiento} onChange={(e) => setF("depto_nacimiento", e.target.value)} /></Field>
                <Field l="Grupo étnico"><Sel v={form.grupo_etnico || ""} on={(v) => setF("grupo_etnico", v)} o={GRUPO_ETNICO_OPCIONES} /></Field>
                <Field l="Nivel de escolaridad"><Sel v={form.nivel_escolaridad || ""} on={(v) => setF("nivel_escolaridad", v)} o={ESCOLARIDAD_OPCIONES} /></Field>
              </Row3>
            </Sec>

            <Sec n="Vinculación">
              <Row3>
                <Field l="Cargo"><Input value={form.cargo} onChange={(e) => setF("cargo", e.target.value)} /></Field>
                <Field l="Centro de trabajo">
                  <Input list="perfil-centros" value={form.centro_trabajo} onChange={(e) => setF("centro_trabajo", e.target.value)} />
                  <datalist id="perfil-centros">{CENTROS_TRABAJO.map((v) => <option key={v} value={v} />)}</datalist>
                </Field>
                <Field l="Turno de trabajo"><Sel v={form.turno || ""} on={(v) => setF("turno", v)} o={TURNO_OPCIONES} /></Field>
                <Field l="Fecha de ingreso"><Input type="date" value={form.fecha_ingreso} onChange={(e) => setF("fecha_ingreso", e.target.value)} /></Field>
                <Field l="Antigüedad">
                  {/* Igual que la edad: se deriva. El formulario original traía
                      Día/Mes/Año ya calculados y quedaban desactualizados. */}
                  <Input readOnly className="bg-muted" placeholder="Se calcula sola"
                    value={(() => {
                      const a = antiguedad(form.fecha_ingreso)
                      return a ? `${a.anios} años, ${a.meses} meses, ${a.dias} días` : ""
                    })()} />
                </Field>
                <Field l="EPS">
                  <Input list="perfil-eps" value={form.eps} onChange={(e) => setF("eps", e.target.value)} />
                  <datalist id="perfil-eps">{EPS_OPCIONES.map((v) => <option key={v} value={v} />)}</datalist>
                </Field>
                <Field l="Fondo de pensiones (AFP)">
                  <Input list="perfil-afp" value={form.afp} onChange={(e) => setF("afp", e.target.value)} />
                  <datalist id="perfil-afp">{AFP_OPCIONES.map((v) => <option key={v} value={v} />)}</datalist>
                </Field>
                <Field l="ARL">
                  <Input list="perfil-arl" value={form.arl} onChange={(e) => setF("arl", e.target.value)} />
                  <datalist id="perfil-arl">{ARL_OPCIONES.map((v) => <option key={v} value={v} />)}</datalist>
                </Field>
              </Row3>
            </Sec>

            <Sec n="Familia">
              <Row3>
                <Field l="Estado civil"><Sel v={form.estado_civil || ""} on={(v) => setF("estado_civil", v)} o={ESTADO_CIVIL_OPCIONES} /></Field>
                <Field l="Cabeza de familia"><Sel v={form.cabeza_familia || ""} on={(v) => setF("cabeza_familia", v)} o={SI_NO} /></Field>
                <Field l="N° de hijos"><Input type="number" min={0} value={form.num_hijos} onChange={(e) => setF("num_hijos", e.target.value)} /></Field>
                <Field l="Personas en el hogar"><Input type="number" min={1} value={form.personas_hogar} onChange={(e) => setF("personas_hogar", e.target.value)} /></Field>
                <Field l="Ingresos familiares mensuales"><Sel v={form.ingresos_familiares || ""} on={(v) => setF("ingresos_familiares", v)} o={INGRESOS_OPCIONES} /></Field>
              </Row3>
            </Sec>

            <Sec n="Vivienda y desplazamiento">
              <Row3>
                <Field l="Tipo de vivienda"><Sel v={form.tipo_vivienda || ""} on={(v) => setF("tipo_vivienda", v)} o={TIPO_VIVIENDA_OPCIONES} /></Field>
                <Field l="Tenencia de la vivienda"><Sel v={form.caracteristicas_vivienda || ""} on={(v) => setF("caracteristicas_vivienda", v)} o={CARACTERISTICAS_VIVIENDA_OPCIONES} /></Field>
                <Field l="Zona"><Sel v={form.zona || ""} on={(v) => setF("zona", v)} o={ZONA_OPCIONES} /></Field>
                <Field l="Estrato de servicios públicos"><Sel v={form.estrato || ""} on={(v) => setF("estrato", v)} o={ESTRATO_OPCIONES} /></Field>
                <Field l="Municipio de residencia"><Input value={form.municipio_residencia} onChange={(e) => setF("municipio_residencia", e.target.value)} /></Field>
                <Field l="Dirección de residencia"><Input value={form.direccion} onChange={(e) => setF("direccion", e.target.value)} /></Field>
                <Field l="Transporte para ir al trabajo"><Sel v={form.transporte || ""} on={(v) => setF("transporte", v)} o={TRANSPORTE_OPCIONES} /></Field>
              </Row3>
            </Sec>

            <Sec n="Hábitos y estilo de vida">
              <Row3>
                <Field l="Consume bebidas alcohólicas"><Sel v={form.consume_alcohol || ""} on={(v) => setF("consume_alcohol", v)} o={SI_NO} /></Field>
                <Field l="Actividad física (3 veces/semana, 30 min)"><Sel v={form.actividad_fisica || ""} on={(v) => setF("actividad_fisica", v)} o={SI_NO} /></Field>
                <Field l="Es fumador"><Sel v={form.fumador || ""} on={(v) => setF("fumador", v)} o={SI_NO} /></Field>
              </Row3>
            </Sec>

            <Button onClick={guardar} disabled={guardando} style={{ background: SST_TOKENS.navy, color: "white" }}>
              {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Crear perfil"}
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="analisis" className="pt-3">
          {base.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">Sin registros para este filtro.</Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Torta titulo="Sexo" data={conteo(base, (r) => T(r.sexo))} />
              <Barra titulo="Rango de edad" data={conteo(base, (r) => rangoEdad(r.edad))} orden={["18–25", "26–35", "36–45", "46–55", "56+"]} />
              <Barra titulo="Nivel de escolaridad" data={conteo(base, (r) => T(r.nivel_escolaridad))} />
              <Torta titulo="Estado civil" data={conteo(base, (r) => T(r.estado_civil))} />
              <Barra titulo="Estrato de servicios públicos" data={conteo(base, (r) => T(r.estrato))} />
              <Torta titulo="Turno de trabajo" data={conteo(base, (r) => T(r.turno))} />
              <Barra titulo="Grupo étnico" data={conteo(base, (r) => T(r.grupo_etnico))} />
              <Torta titulo="Tipo de vivienda" data={conteo(base, (r) => T(r.tipo_vivienda))} />
              <Torta titulo="Zona de residencia" data={conteo(base, (r) => T(r.zona))} />
              <Barra titulo="Transporte al trabajo" data={conteo(base, (r) => T(r.transporte))} />
              <Barra titulo="EPS" data={conteo(base, (r) => T(r.eps)).slice(0, 8)} />
              <Barra titulo="Hábitos (Sí)" data={[
                { name: "Actividad física", value: base.filter((r) => /^s/i.test(T(r.actividad_fisica))).length },
                { name: "Consume alcohol", value: base.filter((r) => /^s/i.test(T(r.consume_alcohol))).length },
                { name: "Fumador", value: base.filter((r) => /^s/i.test(T(r.fumador))).length },
                { name: "Cabeza de familia", value: base.filter((r) => /^s/i.test(T(r.cabeza_familia))).length },
              ]} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="listado" className="space-y-3 pt-3">
          {/* Tarjetas de análisis EN VIVO — reflejan los filtros aplicados */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
            <Kpi t={`Filtrados (${kpisF.pctTotal}% del total)`} v={`${kpisF.n}`} />
            <Kpi t="Edad promedio" v={`${kpisF.edad}`} />
            <Kpi t="Antigüedad prom." v={`${kpisF.ant} a`} />
            <Kpi t="Masculino / Fem." v={`${kpisF.masc}/${kpisF.fem}%`} c={SST_TOKENS.navy} />
            <Kpi t="Cabeza de familia" v={`${kpisF.cabeza}%`} />
            <Kpi t="Act. física / Fuma" v={`${kpisF.activ}/${kpisF.fuma}%`} c={kpisF.fuma > 20 ? SST_TOKENS.warn : SST_TOKENS.ok} />
            <TarjetaTexto t="Escolaridad predominante" v={kpisF.escolaridad} />
            <TarjetaTexto t="Estrato predominante" v={kpisF.estrato} />
            <TarjetaTexto t="Cargo predominante" v={kpisF.cargo} />
          </div>

          {/* Arriba SOLO Mes y Año (de ingreso). Los demás filtros van en cada columna. */}
          <div className="flex flex-wrap items-center gap-2">
            <div>
              <label className="mr-1 text-[10px] uppercase text-muted-foreground">Año ingreso</label>
              <select value={anioF} onChange={(e) => setAnioF(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs">
                <option value="">Todos</option>
                {anios.map((a) => (<option key={a} value={a}>{a}</option>))}
              </select>
            </div>
            <div>
              <label className="mr-1 text-[10px] uppercase text-muted-foreground">Mes ingreso</label>
              <select value={mesF} onChange={(e) => setMesF(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs">
                <option value="">Todos</option>
                {MESES.map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
              </select>
            </div>
            <Badge variant="outline">{filtradas.length} de {base.length} · edad prom. {edadPromF}</Badge>
            {activos > 0 && (
              <Button size="sm" variant="ghost" onClick={() => { setFiltros({}); setMesF(""); setAnioF("") }}>Limpiar filtros</Button>
            )}
            <Button size="sm" variant="outline" onClick={exportarCSV} disabled={filtradas.length === 0}>Exportar CSV</Button>
          </div>

          <Card className="p-0">
            <div className="relative max-h-[70vh] overflow-auto">
              <table className="w-max min-w-full border-separate border-spacing-0 text-xs">
              <thead>
                <tr>
                  {COLS.map((c, i) => (
                    <th
                      key={c.k as string}
                      className={`sticky top-0 whitespace-nowrap px-2 pt-2 pb-1 text-left ${i === 0 ? "left-0 z-30" : "z-20"}`}
                      style={{ background: SST_TOKENS.navy, color: "white", height: ALTO_ENCABEZADO }}
                    >
                      {c.l}
                    </th>
                  ))}
                  <th
                    className="sticky right-0 top-0 z-30 whitespace-nowrap px-2 pt-2 pb-1 text-center"
                    style={{ background: SST_TOKENS.navy, color: "white", height: ALTO_ENCABEZADO }}
                  >
                    Editar
                  </th>
                </tr>
                <tr>
                  {COLS.map((c, i) => {
                    const k = String(c.k)
                    return (
                      <th
                        key={k}
                        className={`sticky px-2 pb-2 align-top font-normal ${i === 0 ? "left-0 z-30" : "z-20"}`}
                        style={{ background: SST_TOKENS.navy, top: ALTO_ENCABEZADO }}
                      >
                        {esSelect(k) ? (
                          <select
                            value={filtros[k] ?? ""}
                            onChange={(e) => setFiltros((f) => ({ ...f, [k]: e.target.value }))}
                            className="h-7 w-full min-w-[90px] rounded border bg-background px-1 text-[11px] text-foreground"
                            title={`Filtrar por ${c.l}`}
                          >
                            <option value="">Todos</option>
                            {Array.from(opciones[k] ?? []).sort().map((o) => (<option key={o} value={o}>{o}</option>))}
                          </select>
                        ) : (
                          <input
                            value={filtros[k] ?? ""}
                            onChange={(e) => setFiltros((f) => ({ ...f, [k]: e.target.value }))}
                            placeholder="filtrar…"
                            className="h-7 w-full min-w-[90px] rounded border bg-background px-1 text-[11px] text-foreground"
                          />
                        )}
                      </th>
                    )
                  })}
                  <th className="sticky right-0 z-30 px-2 pb-2" style={{ background: SST_TOKENS.navy, top: ALTO_ENCABEZADO }} />
                </tr>
              </thead>
              <tbody>
                {filtradas.map((r, i) => (
                  <tr key={r.id ?? i} style={{ background: i % 2 ? "#f7fafc" : "white" }}>
                    {COLS.map((c) => (
                      <td key={c.k as string} className="whitespace-nowrap p-2">
                        {c.k === "documento" && (r as any).requiere_revision ? (
                          <span className="flex items-center gap-1">
                            <AlertTriangle
                              className="h-3 w-3 shrink-0"
                              style={{ color: SST_TOKENS.warn }}
                              aria-label="Requiere revisión"
                            />
                            {celda(r, "documento")}
                          </span>
                        ) : c.k === "estado" ? (
                          <Badge style={{ background: (r.estado ?? "activo") === "retirado" ? SST_TOKENS.grey : SST_TOKENS.ok, color: "white" }}>{r.estado ?? "activo"}</Badge>
                        ) : (
                          celda(r, c.k as string)
                        )}
                      </td>
                    ))}
                    <td
                      className="sticky right-0 z-10 whitespace-nowrap border-b p-2 text-center"
                      style={{ background: i % 2 ? "#f7fafc" : "#ffffff" }}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-muted-foreground"
                        title="Abrir para corregir"
                        onClick={() => cargarEnFormulario(r)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {filtradas.length === 0 && (
                  <tr><td colSpan={COLS.length + 1} className="p-6 text-center text-muted-foreground">Sin colaboradores para estos filtros.</td></tr>
                )}
              </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function TarjetaTexto({ t, v }: { t: string; v: string }) {
  return (
    <Card className="p-4">
      <div className="truncate text-base font-bold" style={{ color: SST_TOKENS.navy }} title={v}>{v}</div>
      <div className="text-xs text-muted-foreground">{t}</div>
    </Card>
  )
}

function Torta({ titulo, data }: { titulo: string; data: { name: string; value: number }[] }) {
  return (
    <Card className="p-3">
      <h3 className="mb-1 text-sm font-semibold" style={{ color: SST_TOKENS.ink }}>{titulo}</h3>
      <ResponsiveContainer width="100%" height={210}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={(e: any) => `${e.name}: ${e.value}`} labelLine={false} fontSize={10}>
            {data.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </Card>
  )
}

function Barra({ titulo, data, orden }: { titulo: string; data: { name: string; value: number }[]; orden?: string[] }) {
  const d = orden ? [...data].sort((a, b) => orden.indexOf(a.name) - orden.indexOf(b.name)) : data
  return (
    <Card className="p-3">
      <h3 className="mb-1 text-sm font-semibold" style={{ color: SST_TOKENS.ink }}>{titulo}</h3>
      <ResponsiveContainer width="100%" height={210}>
        <BarChart data={d} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={120} />
          <Tooltip />
          <Bar dataKey="value" name="Colaboradores" fill={SST_TOKENS.navy} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  )
}

export default PerfilSociodemografico
