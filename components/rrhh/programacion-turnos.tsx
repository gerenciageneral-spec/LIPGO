"use client"

/**
 * Modulo "Programación de turnos" (RRHH Lip).
 *
 * Permite programar a futuro a las personas activas del headcount en
 * una fecha y puesto determinados. Cada programacion se persiste en
 * `registroasistencia` con la bandera `especialidad` (texto: "true"
 * o "false") derivada de la columna boolean `especialidad` del
 * puesto en `tarifasturnos`.
 *
 * Estructura de la pantalla:
 *
 *   ┌─────────────────────────────────────────────┐
 *   │ Header: fecha objetivo + acciones masivas   │
 *   ├──────────────┬──────────────────────────────┤
 *   │ Personal     │  Programación actual         │
 *   │ activo       │  (lo que ya esta en BD para  │
 *   │ (selector)   │   la fecha seleccionada)     │
 *   └──────────────┴──────────────────────────────┘
 *
 * En el panel izquierdo el operador selecciona personas, asigna
 * puesto + hora de entrada y guarda con un solo click. En el panel
 * derecho ve la programacion ya guardada y puede eliminar registros.
 */

import { useState, useEffect, useMemo } from "react"
import { useAuth } from "@/components/auth-provider"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import {
  Loader2,
  CalendarDays,
  Search,
  Users,
  Save,
  Trash2,
  Clock,
  Wand2,
  CheckSquare,
  Square,
} from "lucide-react"
import {
  getActiveHeadcountForScheduling,
  getPuestosFromTarifas,
  getProgramacionesByDate,
  programarTurnos,
  deleteProgramacion,
  type ActiveHeadcountPerson,
  type PuestoOption,
  type ProgramacionExistenteRow,
} from "@/lib/programacion-turnos-actions"

/**
 * Opciones de novedad. Replica el catalogo usado por
 * `components/personnel-notices.tsx` con EXACTA IGUALDAD DE TEXTO
 * para que las programaciones de novedad que se guardan en
 * `registroasistencia.asistencia` coincidan bit a bit con las que
 * registra "Novedades de Personal" y los modulos aguas abajo (nomina,
 * dashboards, exportes) las reconozcan sin tratamiento adicional.
 */
const NOTICE_OPTIONS = [
  "38- Licencia no remunerada- Deducción",
  "13- Incapacidad por enfermedad general al 100%",
  "14- Incapacidad por enfermedad general al 50",
  "15- Incapacidad por enfermedad general al 66%- ingreso",
  "16- Incapacidad por enfermedad profesional",
  "20- Licencia maternidad/paternidad",
  "21- Licencia por luto",
  "22- Licencia remunerada",
  "31- Vacaciones disfrutadas",
  "Retiro",
  "Descanso",
  "Descanso compensatorio domingo anterior",
]

/**
 * Puesto con doble jornada: al programar "Auxiliar Mixto" se puede
 * asignar Turno 1 o Turno 2, cada uno con su propio horario, y la
 * MISMA persona puede tener las dos filas el mismo dia (columna
 * `registroasistencia.turno`). Para cualquier otro puesto la
 * jornada sigue siendo unica (turno = null), sin cambios.
 */
const AUXILIAR_MIXTO = "Auxiliar Mixto"

/** Estado por persona en el panel de seleccion. */
interface SelectionState {
  /** Si la persona esta marcada para programar. */
  selected: boolean
  /** Puesto asignado (clave de tarifasturnos.puesto). */
  puesto: string
  /** Hora de entrada en formato "HH:MM". */
  hora: string
  /** Hora de salida en formato "HH:MM". */
  horaSalida: string
  /**
   * Novedad seleccionada (texto). Si tiene un valor no vacio, la
   * programacion se guardara en modo NOVEDAD (puesto/hora se ignoran
   * y `asistencia` recibe este texto).
   */
  novedad: string
  /**
   * Turno ("1"/"2"/"" ) — solo aplica cuando `puesto === AUXILIAR_MIXTO`.
   * Cadena vacia = sin turno (puesto de jornada unica, o Auxiliar Mixto
   * sin turno elegido todavia).
   */
  turno: string
}

/**
 * Genera la fecha "manana" en formato YYYY-MM-DD usando la zona
 * horaria de Colombia. Es el default razonable porque "Programación
 * de turnos" es siempre a futuro.
 */
function getDefaultScheduleDate(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  return fmt.format(tomorrow)
}

/** Recorta "HH:MM:SS" → "HH:MM" para el input type="time". */
function trimTime(t: string | null | undefined): string {
  if (!t) return ""
  return t.substring(0, 5)
}

export default function ProgramacionTurnos() {
  const { selectedEmpresaId } = useAuth()
  const { toast } = useToast()

  // ── Datos base ─────────────────────────────────────────────
  const [people, setPeople] = useState<ActiveHeadcountPerson[]>([])
  const [puestos, setPuestos] = useState<PuestoOption[]>([])
  const [loadingBase, setLoadingBase] = useState(true)

  // ── Programacion existente (lado derecho) ──────────────────
  const [fecha, setFecha] = useState<string>(getDefaultScheduleDate())
  const [existing, setExisting] = useState<ProgramacionExistenteRow[]>([])
  const [loadingExisting, setLoadingExisting] = useState(false)

  // ── Seleccion del lado izquierdo ───────────────────────────
  // Map id → SelectionState; usamos un Map mutable copiado en cada
  // setState para conservar inmutabilidad sin recrear todo el shape.
  const [selection, setSelection] = useState<Map<number, SelectionState>>(new Map())
  const [search, setSearch] = useState("")
  const [defaultPuesto, setDefaultPuesto] = useState<string>("")
  const [defaultHora, setDefaultHora] = useState<string>("06:00")
  const [defaultHoraSalida, setDefaultHoraSalida] = useState<string>("14:00")
  // Novedad "por defecto" del header masivo. Si esta seteada, el boton
  // "Aplicar a N" la asigna a todas las personas seleccionadas (ademas
  // de puesto/hora). Cadena vacia = sin novedad por defecto.
  const [defaultNovedad, setDefaultNovedad] = useState<string>("")

  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<ProgramacionExistenteRow | null>(null)

  // Carga inicial del headcount + puestos. Se reactiva con la
  // empresa seleccionada para que un cambio de empresa repinte ambos.
  // Si todavia no hay empresa cargada (auth en proceso) salimos sin
  // pegarle al server: el efecto se reejecutara cuando llegue.
  useEffect(() => {
    let mounted = true
    async function load() {
      if (!selectedEmpresaId) {
        setPeople([])
        setPuestos([])
        setLoadingBase(false)
        return
      }
      setLoadingBase(true)
      try {
        const [peopleRes, puestosRes] = await Promise.all([
          getActiveHeadcountForScheduling(selectedEmpresaId),
          getPuestosFromTarifas(selectedEmpresaId),
        ])
        if (!mounted) return
        setPeople(peopleRes)
        setPuestos(puestosRes)
        // Reset de seleccion al cambiar de empresa.
        setSelection(new Map())
      } catch (err) {
        console.error("[v0] Error loading base data:", err)
        toast({
          title: "Error al cargar datos",
          description: err instanceof Error ? err.message : "Error desconocido",
          variant: "destructive",
        })
      } finally {
        if (mounted) setLoadingBase(false)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [selectedEmpresaId, toast])

  // Carga la programacion existente cada vez que cambia la fecha o
  // la empresa.
  useEffect(() => {
    let mounted = true
    async function loadExisting() {
      if (!fecha || !selectedEmpresaId) {
        setExisting([])
        return
      }
      setLoadingExisting(true)
      try {
        const data = await getProgramacionesByDate(selectedEmpresaId, fecha)
        if (mounted) setExisting(data)
      } catch (err) {
        console.error("[v0] Error loading existing programaciones:", err)
        toast({
          title: "Error al cargar programación",
          description: err instanceof Error ? err.message : "Error desconocido",
          variant: "destructive",
        })
      } finally {
        if (mounted) setLoadingExisting(false)
      }
    }
    loadExisting()
    return () => {
      mounted = false
    }
  }, [fecha, selectedEmpresaId, toast])

  // Personas con una fila de JORNADA UNICA hoy (turno=null) → bloqueadas por
  // completo, igual que siempre (no tiene sentido agregarles nada mas ese
  // dia). Las de Auxiliar Mixto con turno NO bloquean aqui: se manejan abajo
  // por turno especifico (turnosOcupadosPorIdentificacion), permitiendo la
  // 2a fila del dia (Turno 1 + Turno 2).
  const idsYaProgramadas = useMemo(
    () =>
      new Set(
        existing.filter((e) => e.turno == null).map((e) => e.identificacion),
      ),
    [existing],
  )

  // Turnos (1/2) ya guardados por identificacion — para deshabilitar esa
  // opcion puntual en el selector de Turno y mostrar el badge correcto.
  const turnosOcupadosPorIdentificacion = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const e of existing) {
      if (e.turno == null) continue
      const key = String(e.turno)
      if (!m.has(e.identificacion)) m.set(e.identificacion, new Set())
      m.get(e.identificacion)!.add(key)
    }
    return m
  }, [existing])

  // Personas filtradas por el buscador (nombre/cedula).
  const filteredPeople = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return people
    return people.filter(
      (p) =>
        p.nombre.toLowerCase().includes(q) ||
        p.identificacion.toLowerCase().includes(q),
    )
  }, [people, search])

  const seleccionados = useMemo(() => {
    return Array.from(selection.entries()).filter(([, s]) => s.selected)
  }, [selection])

  const totalSeleccionados = seleccionados.length

  /** Inmutabilidad-friendly: clona el Map y aplica `mutator`. */
  function updateSelection(mutator: (m: Map<number, SelectionState>) => void) {
    setSelection((prev) => {
      const next = new Map(prev)
      mutator(next)
      return next
    })
  }

  function getOrInit(id: number, m: Map<number, SelectionState>): SelectionState {
    return (
      m.get(id) || {
        selected: false,
        puesto: defaultPuesto,
        hora: defaultHora,
        horaSalida: defaultHoraSalida,
        novedad: defaultNovedad,
        turno: "",
      }
    )
  }

  function togglePerson(id: number, checked: boolean) {
    updateSelection((m) => {
      const cur = getOrInit(id, m)
      m.set(id, { ...cur, selected: checked })
    })
  }

  function setPersonField(
    id: number,
    field: "puesto" | "hora" | "horaSalida" | "novedad" | "turno",
    value: string,
  ) {
    updateSelection((m) => {
      const cur = getOrInit(id, m)
      // Al cambiar de puesto, limpiar el turno elegido (evita arrastrar un
      // Turno 1/2 a un puesto que no lo usa).
      const next = { ...cur, [field]: value }
      if (field === "puesto" && value !== AUXILIAR_MIXTO) next.turno = ""
      m.set(id, next)
    })
  }

  function selectAllVisible() {
    updateSelection((m) => {
      for (const p of filteredPeople) {
        if (idsYaProgramadas.has(p.identificacion)) continue
        const cur = getOrInit(p.id, m)
        m.set(p.id, { ...cur, selected: true })
      }
    })
  }

  function clearSelection() {
    updateSelection((m) => {
      for (const [id, s] of m.entries()) {
        m.set(id, { ...s, selected: false })
      }
    })
  }

  /**
   * Aplica el puesto/hora "por defecto" del header masivo a todas
   * las personas seleccionadas. Util cuando un supervisor quiere
   * programar 30 personas a la misma hora en el mismo puesto.
   */
  function applyDefaultsToSelected() {
    if (!defaultPuesto && !defaultHora && !defaultHoraSalida && !defaultNovedad) {
      toast({
        title: "Configura un valor por defecto",
        description:
          "Define puesto, hora o novedad en la barra superior antes de aplicar.",
      })
      return
    }
    updateSelection((m) => {
      for (const [id, s] of m.entries()) {
        if (!s.selected) continue
        // Si se aplica una novedad por defecto, limpiamos puesto/hora
        // del item porque en modo NOVEDAD esos campos se persisten
        // como NULL. Asi evitamos confundir al usuario en la UI.
        if (defaultNovedad) {
          m.set(id, {
            ...s,
            novedad: defaultNovedad,
            puesto: "",
            hora: "",
            horaSalida: "",
            turno: "",
          })
          continue
        }
        m.set(id, {
          ...s,
          puesto: defaultPuesto || s.puesto,
          hora: defaultHora || s.hora,
          horaSalida: defaultHoraSalida || s.horaSalida,
        })
      }
    })
    toast({
      title: "Valores aplicados",
      description: `Se aplicaron a ${totalSeleccionados} ${
        totalSeleccionados === 1 ? "persona" : "personas"
      } seleccionadas.`,
    })
  }

  async function handleSave() {
    if (!selectedEmpresaId) {
      toast({
        title: "Empresa no seleccionada",
        description: "Selecciona una empresa antes de programar.",
        variant: "destructive",
      })
      return
    }
    if (!fecha) {
      toast({
        title: "Fecha requerida",
        description: "Selecciona la fecha objetivo de la programación.",
        variant: "destructive",
      })
      return
    }

    if (totalSeleccionados === 0) {
      toast({
        title: "Sin personal seleccionado",
        description: "Marca al menos una persona para programar.",
        variant: "destructive",
      })
      return
    }

    // Validar segun el modo de cada item:
    //   - Modo NOVEDAD (s.novedad no vacio): no requiere puesto/hora;
    //     se envia solo `novedad`.
    //   - Modo TURNO (sin novedad): requiere puesto + hora.
    const programaciones = []
    for (const [id, s] of seleccionados) {
      const person = people.find((p) => p.id === id)
      if (!person) continue

      const novedadTrim = s.novedad?.trim() || ""
      if (novedadTrim) {
        programaciones.push({
          identificacion: person.identificacion,
          nombre: person.nombre,
          novedad: novedadTrim,
        })
        continue
      }

      if (!s.puesto) {
        toast({
          title: "Falta puesto o novedad",
          description: `Asigna un puesto (o una novedad) a ${person.nombre}.`,
          variant: "destructive",
        })
        return
      }
      if (!s.hora) {
        toast({
          title: "Falta hora de entrada",
          description: `Asigna una hora a ${person.nombre}.`,
          variant: "destructive",
        })
        return
      }
      // Auxiliar Mixto es de doble jornada: exige elegir Turno 1 o Turno 2
      // (permite que la misma persona tenga las dos filas ese dia).
      if (s.puesto === AUXILIAR_MIXTO && !s.turno) {
        toast({
          title: "Falta el turno",
          description: `Elige Turno 1 o Turno 2 para ${person.nombre} (puesto Auxiliar Mixto).`,
          variant: "destructive",
        })
        return
      }
      programaciones.push({
        identificacion: person.identificacion,
        nombre: person.nombre,
        puesto: s.puesto,
        horaentradaprogramada: s.hora,
        horasalidaprogramada: s.horaSalida || undefined,
        turno:
          s.puesto === AUXILIAR_MIXTO && s.turno
            ? (Number(s.turno) as 1 | 2)
            : undefined,
      })
    }

    setSaving(true)
    try {
      const res = await programarTurnos(selectedEmpresaId, fecha, programaciones)
      const partes = []
      if (res.insertados > 0) {
        partes.push(`${res.insertados} programada(s)`)
      }
      if (res.duplicados.length > 0) {
        partes.push(`${res.duplicados.length} ya existían`)
      }
      toast({
        title: "Programación guardada",
        description: partes.join(" · ") || "Sin cambios",
      })
      // Limpiar seleccion y recargar lado derecho.
      clearSelection()
      const refreshed = await getProgramacionesByDate(selectedEmpresaId, fecha)
      setExisting(refreshed)
    } catch (err) {
      console.error("[v0] Error programando turnos:", err)
      toast({
        title: "Error al programar",
        description: err instanceof Error ? err.message : "Error desconocido",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(row: ProgramacionExistenteRow) {
    if (!selectedEmpresaId) {
      toast({
        title: "Empresa no seleccionada",
        description: "Selecciona una empresa antes de eliminar.",
        variant: "destructive",
      })
      return
    }
    setDeletingId(row.id)
    try {
      await deleteProgramacion(selectedEmpresaId, row.id)
      setExisting((prev) => prev.filter((r) => r.id !== row.id))
      toast({
        title: "Programación eliminada",
        description: `${row.nombre} ya no está programado para ${row.fecha}.`,
      })
    } catch (err) {
      console.error("[v0] Error deleting programacion:", err)
      toast({
        title: "Error al eliminar",
        description: err instanceof Error ? err.message : "Error desconocido",
        variant: "destructive",
      })
    } finally {
      setDeletingId(null)
      setConfirmDelete(null)
    }
  }

  // Helper para que el Select muestre el badge "Especialidad" cuando
  // el puesto seleccionado tiene `especialidad = true` en
  // `tarifasturnos`.
  const especialidadByPuesto = useMemo(() => {
    const m = new Map<string, boolean>()
    for (const p of puestos) m.set(p.puesto, p.especialidad)
    return m
  }, [puestos])

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header: titulo + fecha objetivo + defaults masivos */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" />
                Programación de turnos
              </CardTitle>
              <CardDescription>
                Programa a futuro al personal activo, asignando puesto y hora de entrada.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>
                {people.length} activos · {puestos.length} puestos disponibles
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Defaults masivos — fecha, puesto, hora, novedad y boton
              "Aplicar". En modo NOVEDAD se ignoran puesto/hora; al
              elegir una novedad por defecto la limpiamos visualmente
              en `applyDefaultsToSelected`. */}
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            <div className="space-y-1.5">
              <Label htmlFor="fecha" className="text-xs font-semibold">
                Fecha objetivo
              </Label>
              <Input
                id="fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="def-puesto" className="text-xs font-semibold">
                Puesto por defecto
              </Label>
              <Select
                value={defaultPuesto}
                onValueChange={setDefaultPuesto}
              >
                <SelectTrigger id="def-puesto">
                  <SelectValue placeholder="Selecciona un puesto" />
                </SelectTrigger>
                <SelectContent>
                  {puestos.map((p) => (
                    <SelectItem key={p.puesto} value={p.puesto}>
                      {p.puesto}
                      {p.especialidad ? " · ESP" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="def-hora" className="text-xs font-semibold">
                Hora entrada por defecto
              </Label>
              <Input
                id="def-hora"
                type="time"
                value={defaultHora}
                onChange={(e) => setDefaultHora(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="def-hora-salida" className="text-xs font-semibold">
                Hora salida por defecto
              </Label>
              <Input
                id="def-hora-salida"
                type="time"
                value={defaultHoraSalida}
                onChange={(e) => setDefaultHoraSalida(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="def-novedad" className="text-xs font-semibold">
                Novedad por defecto
              </Label>
              {/*
                Sentinel "__none__" para representar "ninguna" porque
                Radix Select no admite SelectItem con value="". Al
                escribirlo en el estado lo mapeamos a cadena vacia.
              */}
              <Select
                value={defaultNovedad || "__none__"}
                onValueChange={(v) =>
                  setDefaultNovedad(v === "__none__" ? "" : v)
                }
              >
                <SelectTrigger id="def-novedad">
                  <SelectValue placeholder="Sin novedad" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin novedad</SelectItem>
                  {NOTICE_OPTIONS.map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button
                variant="secondary"
                onClick={applyDefaultsToSelected}
                disabled={totalSeleccionados === 0}
                className="w-full gap-2"
              >
                <Wand2 className="h-4 w-4" />
                Aplicar a {totalSeleccionados}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* ── Panel izquierdo: personal disponible ────────── */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Personal activo</CardTitle>
                <CardDescription>
                  Marca a las personas que vas a programar para el {fecha || "—"}.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={selectAllVisible}
                  disabled={filteredPeople.length === 0}
                  className="gap-1.5"
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                  Todos
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={clearSelection}
                  disabled={totalSeleccionados === 0}
                  className="gap-1.5"
                >
                  <Square className="h-3.5 w-3.5" />
                  Limpiar
                </Button>
              </div>
            </div>
            <div className="relative pt-2">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-[40%] text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre o identificación…"
                className="pl-8 h-9"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="border-t">
              {loadingBase ? (
                <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cargando personal…
                </div>
              ) : filteredPeople.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  Sin personal activo para mostrar.
                </div>
              ) : (
                <div className="max-h-[520px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Nombre</TableHead>
                        <TableHead className="hidden md:table-cell">Identificación</TableHead>
                        <TableHead className="w-[180px]">Puesto</TableHead>
                        <TableHead className="w-[90px]">Turno</TableHead>
                        <TableHead className="w-[110px]">Entrada</TableHead>
                        <TableHead className="w-[110px]">Salida</TableHead>
                        <TableHead className="w-[200px]">Novedad</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPeople.map((p) => {
                        const state = selection.get(p.id) || {
                          selected: false,
                          puesto: defaultPuesto,
                          hora: defaultHora,
                          horaSalida: defaultHoraSalida,
                          novedad: defaultNovedad,
                          turno: "",
                        }
                        const esAuxiliarMixto = state.puesto === AUXILIAR_MIXTO
                        const turnosOcupados =
                          turnosOcupadosPorIdentificacion.get(p.identificacion) ?? new Set<string>()
                        // Bloqueado por completo si ya tiene una fila de jornada
                        // unica (turno=null) hoy, o si es Auxiliar Mixto y ya
                        // tiene AMBOS turnos (1 y 2) ocupados.
                        const ya =
                          idsYaProgramadas.has(p.identificacion) ||
                          (esAuxiliarMixto && turnosOcupados.has("1") && turnosOcupados.has("2"))
                        const esEspecialidad = especialidadByPuesto.get(state.puesto)
                        // Cuando la persona tiene novedad seleccionada
                        // la programacion se persistira como NOVEDAD —
                        // puesto/hora se ignoran. Desactivamos esos
                        // controles en la UI para reforzar la regla.
                        const enModoNovedad = !!state.novedad
                        return (
                          <TableRow
                            key={p.id}
                            className={ya ? "opacity-60" : state.selected ? "bg-primary/5" : ""}
                          >
                            <TableCell>
                              <Checkbox
                                checked={state.selected}
                                disabled={ya}
                                onCheckedChange={(v) => togglePerson(p.id, v === true)}
                                aria-label={`Seleccionar ${p.nombre}`}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="text-sm font-medium leading-tight">
                                  {p.nombre}
                                </span>
                                <span className="md:hidden text-[10px] text-muted-foreground">
                                  {p.identificacion}
                                </span>
                                {ya ? (
                                  <Badge
                                    variant="outline"
                                    className="mt-1 w-fit text-[9px] border-amber-300 bg-amber-50 text-amber-700"
                                  >
                                    Ya programado
                                  </Badge>
                                ) : turnosOcupados.size > 0 ? (
                                  <Badge
                                    variant="outline"
                                    className="mt-1 w-fit text-[9px] border-sky-300 bg-sky-50 text-sky-700"
                                  >
                                    {turnosOcupados.has("1") ? "Turno 1" : "Turno 2"} programado
                                  </Badge>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-sm text-muted-foreground tabular-nums">
                              {p.identificacion}
                            </TableCell>
                            <TableCell>
                              <Select
                                value={state.puesto}
                                onValueChange={(v) => setPersonField(p.id, "puesto", v)}
                                disabled={ya || !state.selected || enModoNovedad}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Puesto" />
                                </SelectTrigger>
                                <SelectContent>
                                  {puestos.map((pu) => (
                                    <SelectItem
                                      key={pu.puesto}
                                      value={pu.puesto}
                                      className="text-xs"
                                    >
                                      {pu.puesto}
                                      {pu.especialidad ? " · ESP" : ""}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {state.selected && state.puesto && esEspecialidad && !enModoNovedad ? (
                                <Badge className="mt-1 text-[9px] bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border border-emerald-200">
                                  Especialidad
                                </Badge>
                              ) : null}
                            </TableCell>
                            <TableCell>
                              {/* Turno (1/2) — solo para Auxiliar Mixto (doble
                                  jornada). Se deshabilita la opcion del turno que
                                  esa persona ya tenga programado hoy, para permitir
                                  la 2a fila (el turno faltante) sin duplicar. */}
                              {esAuxiliarMixto ? (
                                <Select
                                  value={state.turno}
                                  onValueChange={(v) => setPersonField(p.id, "turno", v)}
                                  disabled={ya || !state.selected || enModoNovedad}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Turno" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="1" disabled={turnosOcupados.has("1")} className="text-xs">
                                      Turno 1{turnosOcupados.has("1") ? " (ya)" : ""}
                                    </SelectItem>
                                    <SelectItem value="2" disabled={turnosOcupados.has("2")} className="text-xs">
                                      Turno 2{turnosOcupados.has("2") ? " (ya)" : ""}
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="relative">
                                <Clock className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                                <Input
                                  type="time"
                                  value={state.hora}
                                  onChange={(e) =>
                                    setPersonField(p.id, "hora", e.target.value)
                                  }
                                  disabled={ya || !state.selected || enModoNovedad}
                                  className="h-8 text-xs pl-7"
                                />
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="relative">
                                <Clock className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                                <Input
                                  type="time"
                                  value={state.horaSalida}
                                  onChange={(e) =>
                                    setPersonField(p.id, "horaSalida", e.target.value)
                                  }
                                  disabled={ya || !state.selected || enModoNovedad}
                                  className="h-8 text-xs pl-7"
                                />
                              </div>
                            </TableCell>
                            <TableCell>
                              {/*
                                Sentinel "__none__" para "Sin novedad"
                                (Radix Select no permite value="").
                              */}
                              <Select
                                value={state.novedad || "__none__"}
                                onValueChange={(v) =>
                                  setPersonField(
                                    p.id,
                                    "novedad",
                                    v === "__none__" ? "" : v,
                                  )
                                }
                                disabled={ya || !state.selected}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Sin novedad" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__" className="text-xs">
                                    Sin novedad
                                  </SelectItem>
                                  {NOTICE_OPTIONS.map((n) => (
                                    <SelectItem key={n} value={n} className="text-xs">
                                      {n}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {state.selected && enModoNovedad ? (
                                <Badge className="mt-1 text-[9px] bg-amber-100 text-amber-700 hover:bg-amber-100 border border-amber-200">
                                  Novedad
                                </Badge>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Panel derecho: programacion existente ──────── */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              Programados para {fecha || "—"}
              <Badge variant="secondary" className="ml-1 tabular-nums">
                {existing.length}
              </Badge>
            </CardTitle>
            <CardDescription>
              Personas ya guardadas en <code className="text-xs">registroasistencia</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="border-t">
              {loadingExisting ? (
                <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cargando…
                </div>
              ) : existing.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  Sin programaciones para esta fecha.
                </div>
              ) : (
                <div className="max-h-[520px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Puesto</TableHead>
                        <TableHead className="w-[70px]">Entrada</TableHead>
                        <TableHead className="w-[70px]">Salida</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {existing.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-sm font-medium leading-tight">
                                {row.nombre}
                              </span>
                              <span className="text-[10px] text-muted-foreground tabular-nums">
                                {row.identificacion}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {/*
                              Discriminamos visualmente turnos vs.
                              novedades. Una fila es "novedad" si
                              `asistencia` tiene contenido y no hay
                              puesto (lo que produce la rama de
                              modo NOVEDAD en `programarTurnos`).
                            */}
                            {row.asistencia && !row.puesto ? (
                              <div className="flex flex-col gap-1">
                                <span
                                  className="text-xs text-amber-800 leading-snug"
                                  title={row.asistencia}
                                >
                                  {row.asistencia}
                                </span>
                                <Badge className="w-fit text-[9px] bg-amber-100 text-amber-700 hover:bg-amber-100 border border-amber-200">
                                  Novedad
                                </Badge>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-1">
                                <span className="text-xs">{row.puesto || "—"}</span>
                                <div className="flex flex-wrap gap-1">
                                  {/* `especialidad` viene como texto desde
                                      `registroasistencia` ("true"/"false"/null).
                                      Comparamos explicitamente contra "true" —
                                      truthy no sirve porque la cadena "false"
                                      tambien es truthy en JavaScript. */}
                                  {row.especialidad === "true" ? (
                                    <Badge className="w-fit text-[9px] bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border border-emerald-200">
                                      Especialidad
                                    </Badge>
                                  ) : null}
                                  {row.turno ? (
                                    <Badge className="w-fit text-[9px] bg-sky-100 text-sky-700 hover:bg-sky-100 border border-sky-200">
                                      Turno {row.turno}
                                    </Badge>
                                  ) : null}
                                </div>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums">
                            {row.asistencia && !row.puesto
                              ? "—"
                              : trimTime(row.horaentradaprogramada) || "—"}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums">
                            {row.asistencia && !row.puesto
                              ? "—"
                              : trimTime(row.horasalidaprogramada) || "—"}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setConfirmDelete(row)}
                              disabled={deletingId === row.id}
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              aria-label={`Eliminar programación de ${row.nombre}`}
                            >
                              {deletingId === row.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Footer pegajoso con accion principal */}
      <div className="sticky bottom-0 -mx-2 sm:mx-0 z-20">
        <div className="rounded-xl border bg-background/95 backdrop-blur shadow-lg px-4 py-3 flex items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{totalSeleccionados}</span>{" "}
            {totalSeleccionados === 1 ? "persona seleccionada" : "personas seleccionadas"} ·
            objetivo{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {fecha || "—"}
            </span>
          </div>
          <Button
            onClick={handleSave}
            disabled={saving || totalSeleccionados === 0 || !fecha}
            className="gap-2"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Programar {totalSeleccionados > 0 ? `(${totalSeleccionados})` : ""}
          </Button>
        </div>
      </div>

      {/* Dialogo de confirmacion para eliminar */}
      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar programación</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete ? (
                <>
                  ¿Estás seguro de eliminar la programación de{" "}
                  <strong>{confirmDelete.nombre}</strong> para el{" "}
                  <strong>{confirmDelete.fecha}</strong>?
                </>
              ) : (
                "¿Estás seguro?"
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
