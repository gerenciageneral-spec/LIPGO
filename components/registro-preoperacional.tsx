"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { toast } from "@/hooks/use-toast"
import { Loader2, ClipboardCheck, History, Eye, ChevronLeft, ChevronRight, Pen, Eraser, FileSignature, Download, BarChart3, AlertTriangle, CheckCircle, XCircle, Calendar, Truck, Check, ChevronsUpDown } from "lucide-react"
import { savePreoperacional, getPreoperacionalHistory, getPreoperacionalDashboardData } from "@/lib/preoperacional-actions"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { getColaboradoresLite, type ColaboradorLite } from "@/lib/headcount-actions"
import { cn } from "@/lib/utils"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { useAuth } from "@/components/auth-provider"

const BOOL_FIELDS_OPERADOR = [
  {
    name: "licencia_vigente",
    label:
      "Mi licencia de conducción o Curso de Operador de montacargas está vigente y es apta para operar este vehículo.",
  },
  { name: "certificado_mantenimiento", label: "Certificado Mantenimiento" },
  {
    name: "estado_salud_adecuado",
    label: "Mi estado de salud y descanso es adecuado para conducir",
  },
  {
    name: "sin_consumo_sustancias",
    label:
      "NO he consumido medicamentos, drogas o alcohol que puedan afecten mi desempeño como conductor",
  },
]

const BOOL_FIELDS_INSPECCION = [
  { name: "espejos_laterales", label: "Espejos laterales: Sin roturas, sin manchas y ajustado" },
  { name: "alarma_reversa", label: "Alarma de reversa: Función automática con el cambio de reversa." },
  { name: "extintor_incendio", label: "Extintor de incendio: Extintor de 5 Libras / Recargado / Revisado" },
  { name: "llantas", label: "Llantas: Libres de rajaduras y sin desgaste excesivo" },
  {
    name: "cilindros_elevacion_direccion",
    label: "Cilindros de elevación, dirección e inclinación: Libres de escape o daños",
  },
  { name: "montura_cilindros", label: "Montura de los cilindros: Firme" },
  { name: "estado_horquillas", label: "Estado de las Horquillas: Firme" },
  { name: "estado_mastil", label: "Estado del Mastil: Firme" },
  { name: "estado_mangueras", label: "Estado de las Mangueras: Sin fugas o goteos" },
  {
    name: "cadenas_elevacion_descenso",
    label: "Cadenas de Elevacion y Descenso: Sin fisuras o deformidades",
  },
  { name: "rejillas_apoyo_carga", label: "Rejillas de apoyo de la carga: Firme" },
  {
    name: "luces_delanteras",
    label: "Lamparas Luces delanteras: Lentes sin roturas / funcionando / de color blanco / amarillo",
  },
  {
    name: "luces_traseras",
    label: "Lamparas Luces traseras: Lentes sin roturas / funcionando / de color blanco / amarillo",
  },
  { name: "bateria", label: "Bateria: Sin rajaduras / Aislada adecuadamente" },
  { name: "conexiones_electricas", label: "Conexiones electricas: Firmes y en buen estado" },
  { name: "cableado_electrico", label: "Cableado electrico: Aislado / sin roturas / ajustados" },
  {
    name: "espejo_retrovisor_interior",
    label: "Espejos retrovisor interior: Sin roturas / sin manchas / ajustado",
  },
  {
    name: "estado_cabina",
    label: "Estado de la cabina del operador: Protegida y en buen estado en general de orden y aseo.",
  },
  { name: "sillas", label: "Sillas: Atornilladas al piso" },
  {
    name: "pedales",
    label: "Pedales freno / clutch / acelerador: Con forro antideslizante / sin juego excesivo",
  },
  { name: "alarma_retroceso", label: "Alarma de retroceso: Funcionando correctamente." },
  { name: "cinturones_seguridad", label: "Cinturones de seguridad: Dos puntos de apoyo" },
  { name: "pito", label: "Pito: Funcionando / que se oiga minimo a 50 m." },
  { name: "timon_volante", label: "Timon o volante: Funcionando en perfectas condiciones" },
  { name: "frenos", label: "Frenos: Pedales con antideslizante / nivel de liquido" },
  { name: "palancas_control", label: "Palancas de Control: Buen estado" },
  { name: "freno_parque_mano", label: "Freno de Parque o de Mano: Buen estado" },
  {
    name: "horometro_indicador",
    label: "Horometro/Indicador: Funcionando, legible y dentro del rango del mantenimiento",
  },
]

const ALL_BOOL_FIELDS = [...BOOL_FIELDS_OPERADOR, ...BOOL_FIELDS_INSPECCION]

const buildInitialBoolState = (fields: { name: string }[]) =>
  Object.fromEntries(fields.map((f) => [f.name, false]))

interface FormState {
  fecha: string
  turno: string
  referencia_montacargas: string
  placa: string
  nombre_operador: string
  // Cedula de la persona seleccionada en el combobox de headcount. Es lo que
  // permite cruzar la inspeccion contra su marcacion de entrada del dia.
  identificacion_operador: string
  desviacion_identificada: string
  [key: string]: string | boolean
}

interface HistoryRecord {
  id: number
  fecha: string
  turno: string
  referencia_montacargas: string
  placa: string
  nombre_operador: string
  identificacion_operador: string | null
  // Hora de entrada del operador ese dia (de `asistencia`). Null si nunca marco.
  hora_entrada_operador: string | null
  desviacion_identificada: string
  created_at: string
  firma: string | null
  [key: string]: string | number | boolean | null
}

export function RegistroPreoperacional() {
  const { selectedEmpresaId } = useAuth()
  const [formData, setFormData] = useState<FormState>({
    fecha: "",
    turno: "",
    referencia_montacargas: "",
    placa: "",
    nombre_operador: "",
    identificacion_operador: "",
    desviacion_identificada: "",
    ...buildInitialBoolState(BOOL_FIELDS_OPERADOR),
    ...buildInitialBoolState(BOOL_FIELDS_INSPECCION),
  })

  // Personal del headcount para el combobox de operador.
  const [colaboradores, setColaboradores] = useState<ColaboradorLite[]>([])
  const [operadorComboOpen, setOperadorComboOpen] = useState(false)

  const [saving, setSaving] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showDashboard, setShowDashboard] = useState(false)
  const [historyData, setHistoryData] = useState<HistoryRecord[]>([])
  const [dashboardData, setDashboardData] = useState<HistoryRecord[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [loadingDashboard, setLoadingDashboard] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<HistoryRecord | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [dashboardDateRange, setDashboardDateRange] = useState<string>("30")

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 20

  // Signature
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false)
  const [viewingSignature, setViewingSignature] = useState<string | null>(null)

  const setTextField = (name: string, value: string) =>
    setFormData((prev) => ({ ...prev, [name]: value }))

  const toggleBool = (name: string) =>
    setFormData((prev) => ({ ...prev, [name]: !prev[name] }))

  // Signature canvas functions
  const initCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = "#000000"
    ctx.lineWidth = 2
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
  }

  const getPosition = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    if ("touches" in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      }
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!ctx) return
    setIsDrawing(true)
    const { x, y } = getPosition(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!ctx) return
    const { x, y } = getPosition(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    setHasSignature(true)
  }

  const stopDrawing = () => {
    setIsDrawing(false)
  }

  const clearSignature = () => {
    initCanvas()
    setHasSignature(false)
  }

  useEffect(() => {
    initCanvas()
  }, [])

  // Personal del headcount de la empresa seleccionada. Se listan TODOS (no se
  // filtra por estado) porque el preoperacional lo puede diligenciar cualquier
  // persona, no solo un operador de montacargas activo.
  useEffect(() => {
    let cancelado = false
    const cargarColaboradores = async () => {
      try {
        const data = await getColaboradoresLite(selectedEmpresaId)
        if (!cancelado) setColaboradores(data)
      } catch (error) {
        console.error("[v0] Error cargando personal del headcount:", error)
      }
    }
    cargarColaboradores()
    // Al cambiar de empresa el operador elegido deja de ser valido.
    setFormData((prev) => ({ ...prev, nombre_operador: "", identificacion_operador: "" }))
    return () => {
      cancelado = true
    }
  }, [selectedEmpresaId])

const loadHistory = async () => {
  setLoadingHistory(true)
  try {
  const result = await getPreoperacionalHistory(selectedEmpresaId)

      if (!result.success) {
        toast({ title: "Error", description: result.error || "No se pudo cargar el historial", variant: "destructive" })
        return
      }

      setHistoryData(result.data || [])
      setCurrentPage(1)
    } catch {
      toast({ title: "Error", description: "No se pudo cargar el historial", variant: "destructive" })
    } finally {
      setLoadingHistory(false)
    }
  }

  useEffect(() => {
  if (showHistory && selectedEmpresaId) {
  loadHistory()
  }
  }, [showHistory, selectedEmpresaId])

  const loadDashboard = async () => {
    setLoadingDashboard(true)
    try {
      const days = parseInt(dashboardDateRange)
      const dateTo = new Date().toISOString().split("T")[0]
      const dateFrom = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
      
      const result = await getPreoperacionalDashboardData(selectedEmpresaId, dateFrom, dateTo)

      if (!result.success) {
        toast({ title: "Error", description: result.error || "No se pudo cargar el dashboard", variant: "destructive" })
        return
      }

      setDashboardData(result.data || [])
    } catch {
      toast({ title: "Error", description: "No se pudo cargar el dashboard", variant: "destructive" })
    } finally {
      setLoadingDashboard(false)
    }
  }

  useEffect(() => {
    if (showDashboard && selectedEmpresaId) {
      loadDashboard()
    }
  }, [showDashboard, selectedEmpresaId, dashboardDateRange])

  const handleSubmit = async () => {
    // Se exige la identificacion, no solo el nombre: sin cedula no se puede
    // cruzar la inspeccion contra la marcacion de entrada del dia.
    if (!formData.identificacion_operador || !formData.placa) {
      toast({
        title: "Campos requeridos",
        description: "Por favor selecciona el Operador y completa la Placa antes de guardar.",
        variant: "destructive",
      })
      return
    }

    if (!hasSignature) {
      toast({
        title: "Firma requerida",
        description: "Por favor firma el registro antes de guardar.",
        variant: "destructive",
      })
      return
    }

    setSaving(true)
    try {
      // Subimos la firma PRIMERO. La firma es obligatoria (validamos
      // arriba con `hasSignature`), por lo tanto si la subida falla
      // por cualquier motivo (token de Blob no configurado, error de
      // red, canvas sin contenido convertible, etc.) abortamos el
      // guardado para no terminar persistiendo un registro con
      // `firma = ""` en la base. Antes el flujo continuaba aunque el
      // upload fallara y por eso quedaban inspecciones sin URL de
      // firma en `inspecciones_montacargas`.
      let firmaUrl = ""
      const canvas = canvasRef.current
      if (!canvas) {
        toast({
          title: "Firma no disponible",
          description: "No se pudo acceder al lienzo de la firma.",
          variant: "destructive",
        })
        return
      }
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      )
      if (!blob) {
        toast({
          title: "Error con la firma",
          description: "No se pudo procesar la imagen de la firma.",
          variant: "destructive",
        })
        return
      }
      const formDataUpload = new FormData()
      formDataUpload.append("file", blob, "firma.png")
      const uploadRes = await fetch("/api/upload-signature", {
        method: "POST",
        body: formDataUpload,
      })
      if (!uploadRes.ok) {
        // Leemos el body como texto por si el endpoint devolvio
        // detalle del error (en JSON o en texto plano). No tumbamos
        // el flujo si el parseo falla, solo nos quedamos con un
        // mensaje generico.
        let detalle = ""
        try {
          detalle = await uploadRes.text()
        } catch {
          // ignore
        }
        console.log("[v0] preoperacional upload firma fail:", uploadRes.status, detalle)
        toast({
          title: "No se pudo subir la firma",
          description:
            "Ocurrio un problema subiendo la firma. Intenta nuevamente.",
          variant: "destructive",
        })
        return
      }
      const uploadData = await uploadRes.json()
      firmaUrl = uploadData?.url || ""
      if (!firmaUrl) {
        console.log("[v0] preoperacional upload firma sin url:", uploadData)
        toast({
          title: "No se pudo subir la firma",
          description: "El servidor no devolvio una URL valida.",
          variant: "destructive",
        })
        return
      }

      const result = await savePreoperacional(
        { ...formData, firma: firmaUrl },
        selectedEmpresaId,
      )

      if (!result.success) {
        toast({ title: "Error al guardar", description: result.error || "No se pudo guardar", variant: "destructive" })
        return
      }

      toast({ title: "Inspeccion guardada", description: "El registro preoperacional fue creado correctamente." })

      // Reset form
      setFormData({
        fecha: "",
        turno: "",
        referencia_montacargas: "",
        placa: "",
        nombre_operador: "",
        identificacion_operador: "",
        desviacion_identificada: "",
        ...buildInitialBoolState(BOOL_FIELDS_OPERADOR),
        ...buildInitialBoolState(BOOL_FIELDS_INSPECCION),
      })
      clearSignature()

      // Refresh history if viewing
      if (showHistory) {
        loadHistory()
      }
    } catch {
      toast({ title: "Error inesperado", description: "Intenta nuevamente.", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-"
    const [year, month, day] = dateStr.split("T")[0].split("-")
    return `${day}/${month}/${year}`
  }

  const formatTime = (dateStr: string) => {
    if (!dateStr) return "-"
    try {
      return new Intl.DateTimeFormat("es-CO", {
        timeZone: "America/Bogota",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(new Date(dateStr))
    } catch {
      return "-"
    }
  }

  /**
   * Minutos desde medianoche de la hora de entrada ("HH:MM:SS", hora Colombia).
   * Devuelve null si no hay marcacion o el formato no es reconocible.
   */
  const minutosHoraEntrada = (hora: string | null): number | null => {
    if (!hora) return null
    const m = String(hora).match(/^(\d{1,2}):(\d{2})/)
    if (!m) return null
    return Number(m[1]) * 60 + Number(m[2])
  }

  /** Minutos desde medianoche del `created_at` del registro, en hora Colombia. */
  const minutosDiligenciamiento = (createdAt: string): number | null => {
    if (!createdAt) return null
    const fecha = new Date(createdAt)
    if (Number.isNaN(fecha.getTime())) return null
    const partes = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Bogota",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(fecha)
    const h = Number(partes.find((p) => p.type === "hour")?.value)
    const mi = Number(partes.find((p) => p.type === "minute")?.value)
    if (Number.isNaN(h) || Number.isNaN(mi)) return null
    return h * 60 + mi
  }

  /** "HH:MM" a partir de la hora de entrada cruda. */
  const formatHoraEntrada = (hora: string | null) => {
    const min = minutosHoraEntrada(hora)
    if (min === null) return null
    return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`
  }

  /**
   * Diferencia entre el diligenciamiento del preoperacional y la entrada de la
   * persona. Positiva = diligencio DESPUES de entrar (lo normal). Negativa =
   * diligencio ANTES de marcar entrada, que es justo lo que se quiere detectar.
   */
  const diferenciaEntradaVsRegistro = (record: HistoryRecord): number | null => {
    const entrada = minutosHoraEntrada(record.hora_entrada_operador)
    const registro = minutosDiligenciamiento(record.created_at)
    if (entrada === null || registro === null) return null
    return registro - entrada
  }

  /** Formatea una diferencia en minutos como "1h 20m" / "45m" / "-15m". */
  const formatDiferencia = (minutos: number) => {
    const signo = minutos < 0 ? "-" : ""
    const abs = Math.abs(minutos)
    const h = Math.floor(abs / 60)
    const m = abs % 60
    return h > 0 ? `${signo}${h}h ${m}m` : `${signo}${m}m`
  }

  const openDetail = (record: HistoryRecord) => {
    setSelectedRecord(record)
    setDetailOpen(true)
  }

  const generatePDF = async (record: HistoryRecord) => {
    const { jsPDF } = await import("jspdf")
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    let y = 10

    // Logo
    try {
      const logoImg = new Image()
      logoImg.crossOrigin = "anonymous"
      await new Promise<void>((resolve, reject) => {
        logoImg.onload = () => resolve()
        logoImg.onerror = () => reject()
        logoImg.src = "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/LipGoBG%281%29-QiKwXNpJQ5VF7HlbOfUvlPsKCYCkAU.png"
      })
      doc.addImage(logoImg, "PNG", 10, 5, 20, 20)
    } catch {
      // Continue without logo if it fails
    }

    // Title (next to logo)
    doc.setFontSize(12)
    doc.setFont("helvetica", "bold")
    doc.text("INSPECCION PRE-OPERACIONAL DE MONTACARGAS", 35, 15)
    y = 28

    // General Info - compact layout
    doc.setFontSize(8)
    doc.setFont("helvetica", "bold")
    doc.text("INFORMACION GENERAL", 10, y)
    y += 4
    doc.setFontSize(7)
    doc.setFont("helvetica", "normal")
    doc.text(`Fecha: ${formatDate(record.fecha)}   |   Hora: ${formatTime(record.created_at)}   |   Turno: ${record.turno || "-"}   |   Placa: ${record.placa || "-"}`, 10, y)
    y += 3.5
    doc.text(`Referencia: ${record.referencia_montacargas || "-"}   |   Operador: ${record.nombre_operador || "-"}`, 10, y)
    y += 6

    // Two columns layout for checkboxes
    const colWidth = (pageWidth - 20) / 2
    const startY = y

    // Validaciones del Operador (left column)
    doc.setFontSize(8)
    doc.setFont("helvetica", "bold")
    doc.text("VALIDACIONES DEL OPERADOR", 10, y)
    y += 4
    doc.setFontSize(6)
    doc.setFont("helvetica", "normal")
    BOOL_FIELDS_OPERADOR.forEach((field) => {
      const value = record[field.name] ? "SI" : "NO"
      const color = record[field.name] ? [0, 128, 0] : [255, 0, 0]
      doc.setTextColor(color[0], color[1], color[2])
      doc.text(`[${value}]`, 10, y)
      doc.setTextColor(0, 0, 0)
      doc.text(field.label.substring(0, 45), 18, y)
      y += 3.5
    })

    // Inspeccion Fisica y Mecanica (right column)
    let y2 = startY
    doc.setFontSize(8)
    doc.setFont("helvetica", "bold")
    doc.text("INSPECCION FISICA Y MECANICA", 10 + colWidth, y2)
    y2 += 4
    doc.setFontSize(6)
    doc.setFont("helvetica", "normal")
    BOOL_FIELDS_INSPECCION.forEach((field) => {
      const value = record[field.name] ? "SI" : "NO"
      const color = record[field.name] ? [0, 128, 0] : [255, 0, 0]
      doc.setTextColor(color[0], color[1], color[2])
      doc.text(`[${value}]`, 10 + colWidth, y2)
      doc.setTextColor(0, 0, 0)
      doc.text(field.label.substring(0, 45), 18 + colWidth, y2)
      y2 += 3.5
    })

    // Continue from the longer column
    y = Math.max(y, y2) + 4

    // Observaciones
    if (record.desviacion_identificada) {
      doc.setFontSize(8)
      doc.setFont("helvetica", "bold")
      doc.text("OBSERVACIONES", 10, y)
      y += 4
      doc.setFontSize(7)
      doc.setFont("helvetica", "normal")
      const lines = doc.splitTextToSize(record.desviacion_identificada, pageWidth - 20)
      doc.text(lines.slice(0, 3), 10, y) // Max 3 lines
      y += Math.min(lines.length, 3) * 3.5 + 3
    }

    // Firma del operador. Adjuntamos la imagen guardada en
    // `firmaUrl` como recuadro etiquetado debajo de las
    // observaciones. Antes intentabamos cargarla via <Image> con
    // crossOrigin="anonymous", pero si el bucket no devuelve
    // cabeceras CORS adecuadas la carga fallaba silenciosamente y la
    // firma terminaba sin aparecer en el PDF. Ahora la descargamos
    // por fetch y la convertimos a dataURL, que jsPDF siempre puede
    // embeber sin restricciones de origen.
    if (record.firma) {
      doc.setFontSize(8)
      doc.setFont("helvetica", "bold")
      doc.text("FIRMA DEL OPERADOR", 10, y)
      y += 4
      try {
        const res = await fetch(record.firma as string)
        if (!res.ok) throw new Error("fetch firma failed")
        const blob = await res.blob()
        const dataUrl: string = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(String(reader.result || ""))
          reader.onerror = () => reject(new Error("read firma failed"))
          reader.readAsDataURL(blob)
        })
        // Detectamos el formato a partir del MIME (PNG es el caso
        // tipico que usa nuestro SignaturePad, pero JPG puede venir
        // de flujos antiguos).
        const fmt = blob.type.includes("jpeg") || blob.type.includes("jpg")
          ? "JPEG"
          : "PNG"
        // Marco visible para que el PDF muestre el contenedor de la
        // firma incluso si la imagen es transparente.
        doc.setDrawColor(180, 180, 180)
        doc.rect(10, y, 60, 25)
        doc.addImage(dataUrl, fmt, 11, y + 1, 58, 23)
        y += 28
      } catch (err) {
        console.log("[v0] No se pudo embeber la firma en PDF:", err)
        doc.setFontSize(7)
        doc.setFont("helvetica", "italic")
        doc.text("(Firma no disponible)", 10, y)
        y += 6
      }
    } else {
      // Si por alguna razon el registro no tiene firma (datos
      // antiguos), dejamos un espacio claro indicandolo.
      doc.setFontSize(8)
      doc.setFont("helvetica", "bold")
      doc.text("FIRMA DEL OPERADOR", 10, y)
      y += 4
      doc.setFontSize(7)
      doc.setFont("helvetica", "italic")
      doc.setTextColor(128, 128, 128)
      doc.text("(Sin firma registrada)", 10, y)
      doc.setTextColor(0, 0, 0)
      y += 6
    }

    // Footer
    doc.setFontSize(6)
    doc.setTextColor(128, 128, 128)
    doc.text(`Generado: ${new Date().toLocaleDateString("es-CO")} ${new Date().toLocaleTimeString("es-CO")}`, pageWidth / 2, 290, { align: "center" })

    // Download
    doc.save(`inspeccion_${record.placa}_${record.fecha}.pdf`)
  }

  // Pagination calculations
  const totalPages = Math.ceil(historyData.length / pageSize)
  const startIndex = (currentPage - 1) * pageSize
  const paginatedData = historyData.slice(startIndex, startIndex + pageSize)

  // Dashboard statistics calculations
  const calculateFieldStats = (fieldName: string) => {
    if (dashboardData.length === 0) return { total: 0, cumple: 0, noCumple: 0, percentage: 100 }
    const cumple = dashboardData.filter((r) => r[fieldName] === true).length
    const noCumple = dashboardData.length - cumple
    const percentage = Math.round((cumple / dashboardData.length) * 100)
    return { total: dashboardData.length, cumple, noCumple, percentage }
  }

  const getFailureHistory = (fieldName: string) => {
    return dashboardData
      .filter((r) => r[fieldName] === false)
      .map((r) => ({
        fecha: r.fecha,
        placa: r.placa,
        operador: r.nombre_operador,
        created_at: r.created_at
      }))
      .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
  }

  const getFirstFailureDate = (fieldName: string) => {
    const failures = getFailureHistory(fieldName)
    return failures.length > 0 ? failures[0].fecha : null
  }

  const getCriticalIssues = () => {
    const allFields = [...BOOL_FIELDS_OPERADOR, ...BOOL_FIELDS_INSPECCION]
    return allFields
      .map((field) => {
        const stats = calculateFieldStats(field.name)
        const firstFailure = getFirstFailureDate(field.name)
        return {
          ...field,
          ...stats,
          firstFailure,
          failures: getFailureHistory(field.name)
        }
      })
      .filter((item) => item.noCumple > 0)
      .sort((a, b) => b.noCumple - a.noCumple)
  }

  const criticalIssues = showDashboard ? getCriticalIssues() : []
  const overallStats = showDashboard
    ? {
        totalInspections: dashboardData.length,
        uniqueVehicles: [...new Set(dashboardData.map((r) => r.placa))].length,
        uniqueOperators: [...new Set(dashboardData.map((r) => r.nombre_operador))].length
      }
    : { totalInspections: 0, uniqueVehicles: 0, uniqueOperators: 0 }

  // Vehicle matrix data - organized by vehicle with calendar view
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null)

  const getUniqueVehicles = () => {
    return [...new Set(dashboardData.map((r) => r.placa))].sort()
  }

  const getVehicleMatrixData = (placa: string) => {
    const vehicleRecords = dashboardData.filter((r) => r.placa === placa)
    
    // Get all unique dates for this vehicle
    const dates = [...new Set(vehicleRecords.map((r) => r.fecha))].sort()
    
    // Create a map of date -> record for quick lookup
    const dateRecordMap: { [date: string]: HistoryRecord } = {}
    vehicleRecords.forEach((r) => {
      // If multiple records on same date, use the latest one
      if (!dateRecordMap[r.fecha] || new Date(r.created_at) > new Date(dateRecordMap[r.fecha].created_at)) {
        dateRecordMap[r.fecha] = r
      }
    })
    
    return { dates, dateRecordMap }
  }

  const formatShortDate = (dateStr: string) => {
    const date = new Date(dateStr + "T12:00:00")
    return date.toLocaleDateString("es-CO", { day: "2-digit", month: "short" })
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <ClipboardCheck className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Registro Preoperacional</h1>
            <p className="text-sm text-muted-foreground">Inspeccion Pre-operacional de Montacargas</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant={showDashboard ? "default" : "outline"}
            onClick={() => {
              setShowDashboard(!showDashboard)
              if (showHistory) setShowHistory(false)
            }}
          >
            <BarChart3 className="mr-2 h-4 w-4" />
            {showDashboard ? "Volver" : "Ver Dashboard"}
          </Button>
          <Button
            variant={showHistory ? "default" : "outline"}
            onClick={() => {
              setShowHistory(!showHistory)
              if (showDashboard) setShowDashboard(false)
            }}
          >
            <History className="mr-2 h-4 w-4" />
            {showHistory ? "Volver" : "Ver Historial"}
          </Button>
        </div>
      </div>

      {showDashboard ? (
        /* DASHBOARD VIEW */
        <div className="space-y-6">
          {/* Filters */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Periodo:</span>
                </div>
                <Select value={dashboardDateRange} onValueChange={setDashboardDateRange}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Seleccionar periodo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Ultimos 7 dias</SelectItem>
                    <SelectItem value="15">Ultimos 15 dias</SelectItem>
                    <SelectItem value="30">Ultimos 30 dias</SelectItem>
                    <SelectItem value="60">Ultimos 60 dias</SelectItem>
                    <SelectItem value="90">Ultimos 90 dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {loadingDashboard ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : dashboardData.length === 0 ? (
            <Card>
              <CardContent className="py-8">
                <p className="text-center text-muted-foreground">No hay datos para el periodo seleccionado.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-100">
                        <ClipboardCheck className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{overallStats.totalInspections}</p>
                        <p className="text-sm text-muted-foreground">Inspecciones Totales</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-green-100">
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{overallStats.uniqueVehicles}</p>
                        <p className="text-sm text-muted-foreground">Vehiculos Inspeccionados</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-purple-100">
                        <Eye className="h-5 w-5 text-purple-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{overallStats.uniqueOperators}</p>
                        <p className="text-sm text-muted-foreground">Operadores</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Critical Alerts */}
              {criticalIssues.length > 0 && (
                <Card className="border-red-200 bg-red-50/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold flex items-center gap-2 text-red-700">
                      <AlertTriangle className="h-5 w-5" />
                      Alertas de Incumplimiento ({criticalIssues.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {criticalIssues.slice(0, 10).map((issue) => (
                      <div key={issue.name} className="bg-white rounded-lg p-4 border border-red-100">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                              <span className="font-medium text-sm">{issue.label}</span>
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                              <Badge variant="destructive" className="text-xs">
                                {issue.noCumple} fallas de {issue.total}
                              </Badge>
                              <span className="text-muted-foreground">
                                Cumplimiento: {issue.percentage}%
                              </span>
                            </div>
                            <Progress value={issue.percentage} className="mt-2 h-2" />
                            {issue.firstFailure && (
                              <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                Primera falla reportada: {formatDate(issue.firstFailure)}
                              </p>
                            )}
                            {issue.failures.length > 0 && (
                              <details className="mt-2">
                                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                                  Ver detalle de fallas ({issue.failures.length})
                                </summary>
                                <div className="mt-2 max-h-32 overflow-y-auto">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="border-b">
                                        <th className="text-left py-1 px-2">Fecha</th>
                                        <th className="text-left py-1 px-2">Placa</th>
                                        <th className="text-left py-1 px-2">Operador</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {issue.failures.map((failure, idx) => (
                                        <tr key={idx} className="border-b border-dashed">
                                          <td className="py-1 px-2">{formatDate(failure.fecha)}</td>
                                          <td className="py-1 px-2 font-medium">{failure.placa}</td>
                                          <td className="py-1 px-2">{failure.operador}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </details>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* All Fields Statistics */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">Estadisticas por Campo de Inspeccion</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {/* Operator Validations */}
                    <div>
                      <h4 className="font-medium text-sm mb-3 text-primary">Validaciones del Operador</h4>
                      <div className="space-y-3">
                        {BOOL_FIELDS_OPERADOR.map((field) => {
                          const stats = calculateFieldStats(field.name)
                          return (
                            <div key={field.name} className="space-y-1">
                              <div className="flex items-center justify-between text-sm">
                                <span className="truncate flex-1 pr-4">{field.label}</span>
                                <div className="flex items-center gap-2">
                                  {stats.noCumple > 0 ? (
                                    <Badge variant="destructive" className="text-xs">
                                      {stats.noCumple} fallas
                                    </Badge>
                                  ) : (
                                    <Badge variant="default" className="text-xs bg-green-600">
                                      100%
                                    </Badge>
                                  )}
                                  <span className="text-muted-foreground w-12 text-right">
                                    {stats.percentage}%
                                  </span>
                                </div>
                              </div>
                              <Progress value={stats.percentage} className="h-1.5" />
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Physical Inspection */}
                    <div>
                      <h4 className="font-medium text-sm mb-3 text-primary">Inspeccion Fisica y Mecanica</h4>
                      <div className="space-y-3">
                        {BOOL_FIELDS_INSPECCION.map((field) => {
                          const stats = calculateFieldStats(field.name)
                          return (
                            <div key={field.name} className="space-y-1">
                              <div className="flex items-center justify-between text-sm">
                                <span className="truncate flex-1 pr-4">{field.label}</span>
                                <div className="flex items-center gap-2">
                                  {stats.noCumple > 0 ? (
                                    <Badge variant="destructive" className="text-xs">
                                      {stats.noCumple} fallas
                                    </Badge>
                                  ) : (
                                    <Badge variant="default" className="text-xs bg-green-600">
                                      100%
                                    </Badge>
                                  )}
                                  <span className="text-muted-foreground w-12 text-right">
                                    {stats.percentage}%
                                  </span>
                                </div>
                              </div>
                              <Progress value={stats.percentage} className="h-1.5" />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Vehicle History Matrix */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Truck className="h-5 w-5" />
                    Historial por Vehiculo
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Vista de calendario mostrando el estado de cada inspeccion por dia
                  </p>
                </CardHeader>
                <CardContent>
                  {getUniqueVehicles().length === 0 ? (
                    <p className="text-center py-4 text-muted-foreground">No hay vehiculos registrados.</p>
                  ) : (
                    <Tabs defaultValue={getUniqueVehicles()[0]} className="w-full">
                      <ScrollArea className="w-full">
                        <TabsList className="mb-4 flex-wrap h-auto gap-1 p-1">
                          {getUniqueVehicles().map((placa) => (
                            <TabsTrigger
                              key={placa}
                              value={placa}
                              className="text-xs px-3 py-1.5"
                            >
                              {placa}
                            </TabsTrigger>
                          ))}
                        </TabsList>
                        <ScrollBar orientation="horizontal" />
                      </ScrollArea>
                      
                      {getUniqueVehicles().map((placa) => {
                        const { dates, dateRecordMap } = getVehicleMatrixData(placa)
                        
                        return (
                          <TabsContent key={placa} value={placa} className="mt-0">
                            <div className="rounded-lg border bg-card">
                              <ScrollArea className="w-full">
                                <div className="min-w-[600px]">
                                  <Table>
                                    <TableHeader>
                                      <TableRow className="bg-muted/50">
                                        <TableHead className="sticky left-0 bg-muted/50 z-10 min-w-[200px] text-xs font-semibold">
                                          Aspecto de Inspeccion
                                        </TableHead>
                                        {dates.map((date) => (
                                          <TableHead
                                            key={date}
                                            className="text-center text-xs px-1 min-w-[50px]"
                                          >
                                            <div className="flex flex-col">
                                              <span className="font-semibold">{formatShortDate(date).split(" ")[0]}</span>
                                              <span className="text-muted-foreground text-[10px]">{formatShortDate(date).split(" ")[1]}</span>
                                            </div>
                                          </TableHead>
                                        ))}
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {/* Operator Validations Section */}
                                      <TableRow className="bg-primary/5">
                                        <TableCell
                                          colSpan={dates.length + 1}
                                          className="text-xs font-semibold text-primary py-2"
                                        >
                                          Validaciones del Operador
                                        </TableCell>
                                      </TableRow>
                                      {BOOL_FIELDS_OPERADOR.map((field) => (
                                        <TableRow key={field.name} className="hover:bg-muted/30">
                                          <TableCell className="sticky left-0 bg-background z-10 text-xs py-1.5 pr-2">
                                            <span className="line-clamp-2" title={field.label}>
                                              {field.label.length > 50
                                                ? field.label.substring(0, 50) + "..."
                                                : field.label}
                                            </span>
                                          </TableCell>
                                          {dates.map((date) => {
                                            const record = dateRecordMap[date]
                                            const value = record?.[field.name]
                                            return (
                                              <TableCell
                                                key={date}
                                                className="text-center p-1"
                                              >
                                                {record ? (
                                                  <div
                                                    className={`w-6 h-6 rounded-full mx-auto flex items-center justify-center ${
                                                      value === true
                                                        ? "bg-green-500"
                                                        : "bg-red-500"
                                                    }`}
                                                    title={`${field.label}: ${value ? "Cumple" : "No Cumple"}`}
                                                  >
                                                    {value === true ? (
                                                      <CheckCircle className="h-3.5 w-3.5 text-white" />
                                                    ) : (
                                                      <XCircle className="h-3.5 w-3.5 text-white" />
                                                    )}
                                                  </div>
                                                ) : (
                                                  <div className="w-6 h-6 rounded-full mx-auto bg-gray-200" />
                                                )}
                                              </TableCell>
                                            )
                                          })}
                                        </TableRow>
                                      ))}
                                      
                                      {/* Physical Inspection Section */}
                                      <TableRow className="bg-primary/5">
                                        <TableCell
                                          colSpan={dates.length + 1}
                                          className="text-xs font-semibold text-primary py-2"
                                        >
                                          Inspeccion Fisica y Mecanica
                                        </TableCell>
                                      </TableRow>
                                      {BOOL_FIELDS_INSPECCION.map((field) => (
                                        <TableRow key={field.name} className="hover:bg-muted/30">
                                          <TableCell className="sticky left-0 bg-background z-10 text-xs py-1.5 pr-2">
                                            <span className="line-clamp-2" title={field.label}>
                                              {field.label.length > 50
                                                ? field.label.substring(0, 50) + "..."
                                                : field.label}
                                            </span>
                                          </TableCell>
                                          {dates.map((date) => {
                                            const record = dateRecordMap[date]
                                            const value = record?.[field.name]
                                            return (
                                              <TableCell
                                                key={date}
                                                className="text-center p-1"
                                              >
                                                {record ? (
                                                  <div
                                                    className={`w-6 h-6 rounded-full mx-auto flex items-center justify-center ${
                                                      value === true
                                                        ? "bg-green-500"
                                                        : "bg-red-500"
                                                    }`}
                                                    title={`${field.label}: ${value ? "Cumple" : "No Cumple"}`}
                                                  >
                                                    {value === true ? (
                                                      <CheckCircle className="h-3.5 w-3.5 text-white" />
                                                    ) : (
                                                      <XCircle className="h-3.5 w-3.5 text-white" />
                                                    )}
                                                  </div>
                                                ) : (
                                                  <div className="w-6 h-6 rounded-full mx-auto bg-gray-200" />
                                                )}
                                              </TableCell>
                                            )
                                          })}
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                                <ScrollBar orientation="horizontal" />
                              </ScrollArea>
                              
                              {/* Legend */}
                              <div className="flex items-center gap-4 p-3 border-t bg-muted/30 text-xs">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                                    <CheckCircle className="h-2.5 w-2.5 text-white" />
                                  </div>
                                  <span>Cumple</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
                                    <XCircle className="h-2.5 w-2.5 text-white" />
                                  </div>
                                  <span>No Cumple</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <div className="w-4 h-4 rounded-full bg-gray-200" />
                                  <span>Sin Registro</span>
                                </div>
                              </div>
                            </div>
                          </TabsContent>
                        )
                      })}
                    </Tabs>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      ) : showHistory ? (
        /* HISTORY VIEW */
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Historial de Inspecciones</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingHistory ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : historyData.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No hay registros en el historial.</p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">Fecha</TableHead>
                        <TableHead className="whitespace-nowrap">Hora registro</TableHead>
                        <TableHead className="whitespace-nowrap">Hora entrada</TableHead>
                        <TableHead className="whitespace-nowrap">Diferencia</TableHead>
                        <TableHead className="whitespace-nowrap">Turno</TableHead>
                        <TableHead className="whitespace-nowrap">Placa</TableHead>
                        <TableHead className="whitespace-nowrap">Operador</TableHead>
                        <TableHead className="whitespace-nowrap">Referencia</TableHead>
                        <TableHead className="whitespace-nowrap w-20">Firma</TableHead>
                        <TableHead className="whitespace-nowrap w-20">PDF</TableHead>
                        <TableHead className="whitespace-nowrap w-20">Ver</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedData.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell className="text-sm">{formatDate(record.fecha)}</TableCell>
                          <TableCell className="text-sm">{formatTime(record.created_at)}</TableCell>
                          <TableCell className="text-sm">
                            {formatHoraEntrada(record.hora_entrada_operador) ?? (
                              <span className="text-xs text-muted-foreground">Sin marcacion</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            {(() => {
                              const diff = diferenciaEntradaVsRegistro(record)
                              if (diff === null) return <span className="text-muted-foreground">-</span>
                              // Negativa = diligencio el preoperacional ANTES de
                              // marcar entrada. Se resalta porque es la anomalia.
                              return (
                                <span
                                  className={cn(
                                    "whitespace-nowrap",
                                    diff < 0 ? "font-medium text-red-600" : "text-muted-foreground",
                                  )}
                                >
                                  {formatDiferencia(diff)}
                                </span>
                              )
                            })()}
                          </TableCell>
                          <TableCell className="text-sm">{record.turno || "-"}</TableCell>
                          <TableCell className="text-sm font-medium">{record.placa || "-"}</TableCell>
                          <TableCell className="text-sm">{record.nombre_operador || "-"}</TableCell>
                          <TableCell className="text-sm">{record.referencia_montacargas || "-"}</TableCell>
                          <TableCell>
                            {record.firma ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setViewingSignature(record.firma)}
                                title="Ver firma"
                              >
                                <FileSignature className="h-4 w-4 text-green-600" />
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => generatePDF(record)}
                              title="Descargar PDF"
                            >
                              <Download className="h-4 w-4 text-blue-600" />
                            </Button>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openDetail(record)}
                              title="Ver detalle completo"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4">
                    <span className="text-sm text-muted-foreground">
                      Mostrando {startIndex + 1}-{Math.min(startIndex + pageSize, historyData.length)} de {historyData.length}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm">
                        Pagina {currentPage} de {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        /* FORM VIEW */
        <>
          {/* SECCION 1 - Informacion General */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-primary">
                Seccion 1: Informacion General
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Fecha</Label>
                  <Input
                    type="text"
                    value={new Date().toLocaleDateString("es-CO", { timeZone: "America/Bogota" })}
                    readOnly
                    disabled
                    className="bg-muted cursor-not-allowed"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="turno">Turno</Label>
                  <Input
                    id="turno"
                    name="turno"
                    type="text"
                    placeholder="Ej: Mañana, Tarde, Noche"
                    value={formData.turno as string}
                    onChange={(e) => setTextField("turno", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="referencia_montacargas">Referencia del montacargas</Label>
                  <Input
                    id="referencia_montacargas"
                    name="referencia_montacargas"
                    type="text"
                    placeholder="Referencia del equipo"
                    value={formData.referencia_montacargas as string}
                    onChange={(e) => setTextField("referencia_montacargas", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="placa">Placa</Label>
                  <Input
                    id="placa"
                    name="placa"
                    type="text"
                    placeholder="Placa del montacargas"
                    value={formData.placa as string}
                    onChange={(e) => setTextField("placa", e.target.value)}
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label htmlFor="nombre_operador">Operador</Label>
                  <Popover open={operadorComboOpen} onOpenChange={setOperadorComboOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        id="nombre_operador"
                        variant="outline"
                        role="combobox"
                        aria-expanded={operadorComboOpen}
                        className="w-full justify-between font-normal"
                      >
                        {formData.identificacion_operador ? (
                          <span className="truncate">
                            {formData.nombre_operador as string}
                            <span className="ml-2 text-muted-foreground">
                              ({formData.identificacion_operador as string})
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Selecciona una persona del personal</span>
                        )}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar por nombre o cedula..." />
                        <CommandList>
                          <CommandEmpty>No se encontro personal.</CommandEmpty>
                          <CommandGroup>
                            {colaboradores.map((persona) => (
                              <CommandItem
                                key={persona.identificacion}
                                // El value alimenta el buscador del Command: se
                                // incluye la cedula para poder filtrar por ella.
                                value={`${persona.nombre} ${persona.identificacion}`}
                                onSelect={() => {
                                  setFormData((prev) => ({
                                    ...prev,
                                    nombre_operador: persona.nombre,
                                    identificacion_operador: persona.identificacion,
                                  }))
                                  setOperadorComboOpen(false)
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4 shrink-0",
                                    formData.identificacion_operador === persona.identificacion
                                      ? "opacity-100"
                                      : "opacity-0",
                                  )}
                                />
                                <span className="flex min-w-0 flex-col">
                                  <span className="truncate">{persona.nombre}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {persona.identificacion}
                                    {persona.cargo ? ` · ${persona.cargo}` : ""}
                                  </span>
                                </span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <p className="text-xs text-muted-foreground">
                    Al guardar se captura la hora de entrada de esta persona para comparar contra la
                    hora de diligenciamiento.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* SECCION 2 - Validaciones del Operador */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-primary">
                Seccion 2: Validaciones del Operador
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {BOOL_FIELDS_OPERADOR.map((field) => (
                  <div key={field.name} className="flex items-start gap-3">
                    <Switch
                      id={field.name}
                      checked={formData[field.name] as boolean}
                      onCheckedChange={() => toggleBool(field.name)}
                      className="mt-0.5 shrink-0"
                    />
                    <Label
                      htmlFor={field.name}
                      className="text-sm leading-relaxed cursor-pointer"
                    >
                      {field.label}
                    </Label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* SECCION 3 - Inspeccion Fisica y Mecanica */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-primary">
                Seccion 3: Inspeccion Fisica y Mecanica
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {BOOL_FIELDS_INSPECCION.map((field) => (
                  <div key={field.name} className="flex items-start gap-3">
                    <Switch
                      id={field.name}
                      checked={formData[field.name] as boolean}
                      onCheckedChange={() => toggleBool(field.name)}
                      className="mt-0.5 shrink-0"
                    />
                    <Label
                      htmlFor={field.name}
                      className="text-sm leading-relaxed cursor-pointer"
                    >
                      {field.label}
                    </Label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* SECCION 4 - Observaciones */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-primary">
                Seccion 4: Observaciones
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <Label htmlFor="desviacion_identificada">Desviacion identificada (Observaciones)</Label>
                <Textarea
                  id="desviacion_identificada"
                  name="desviacion_identificada"
                  placeholder="Describe cualquier desviacion, anomalia o novedad encontrada durante la inspeccion..."
                  rows={4}
                  value={formData.desviacion_identificada as string}
                  onChange={(e) => setTextField("desviacion_identificada", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* SECCION 5 - Firma del Operador */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-primary flex items-center gap-2">
                <Pen className="h-4 w-4" />
                Seccion 5: Firma del Operador
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Label>Firma con el dedo o mouse <span className="text-destructive">*</span></Label>
                <div className={`border rounded-lg p-2 bg-white ${!hasSignature ? "border-destructive/50" : "border-green-500"}`}>
                  <canvas
                    ref={canvasRef}
                    width={400}
                    height={150}
                    className="w-full max-w-[400px] h-[150px] border rounded cursor-crosshair touch-none"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={clearSignature}>
                    <Eraser className="mr-2 h-4 w-4" />
                    Limpiar Firma
                  </Button>
                  {hasSignature ? (
                    <span className="text-sm text-green-600 font-medium">Firma registrada</span>
                  ) : (
                    <span className="text-sm text-destructive font-medium">Firma obligatoria</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex justify-end pb-6">
            <Button
              onClick={handleSubmit}
              disabled={saving || !hasSignature}
              size="lg"
              className="min-w-[180px]"
              title={!hasSignature ? "Debes firmar antes de guardar" : ""}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <ClipboardCheck className="mr-2 h-4 w-4" />
                  Guardar Inspeccion
                </>
              )}
            </Button>
          </div>
        </>
      )}

      {/* Signature View Dialog */}
      <Dialog open={!!viewingSignature} onOpenChange={() => setViewingSignature(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSignature className="h-5 w-5" />
              Firma del Operador
            </DialogTitle>
          </DialogHeader>
          {viewingSignature && (
            <div className="flex justify-center p-4 bg-white rounded-lg border">
              <img
                src={viewingSignature}
                alt="Firma del operador"
                className="max-w-full h-auto"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle de Inspeccion</DialogTitle>
            <DialogDescription>
              {selectedRecord && `${formatDate(selectedRecord.fecha)} - ${selectedRecord.placa} - ${selectedRecord.nombre_operador}`}
            </DialogDescription>
          </DialogHeader>
          {selectedRecord && (
            <div className="space-y-6">
              {/* Info General */}
              <div>
                <h4 className="font-semibold text-sm text-primary mb-2">Informacion General</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">Fecha:</span> {formatDate(selectedRecord.fecha)}</div>
                  <div><span className="text-muted-foreground">Turno:</span> {selectedRecord.turno || "-"}</div>
                  <div><span className="text-muted-foreground">Placa:</span> {selectedRecord.placa || "-"}</div>
                  <div><span className="text-muted-foreground">Referencia:</span> {selectedRecord.referencia_montacargas || "-"}</div>
                  <div className="col-span-2"><span className="text-muted-foreground">Operador:</span> {selectedRecord.nombre_operador || "-"}</div>
                </div>
              </div>

              {/* Validaciones del Operador */}
              <div>
                <h4 className="font-semibold text-sm text-primary mb-2">Validaciones del Operador</h4>
                <div className="space-y-1">
                  {BOOL_FIELDS_OPERADOR.map((field) => (
                    <div key={field.name} className="flex items-center gap-2 text-sm">
                      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold ${selectedRecord[field.name] ? "bg-green-500 text-white" : "bg-red-500 text-white"}`}>
                        {selectedRecord[field.name] ? "S" : "N"}
                      </span>
                      <span className="text-muted-foreground">{field.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Inspeccion Fisica y Mecanica */}
              <div>
                <h4 className="font-semibold text-sm text-primary mb-2">Inspeccion Fisica y Mecanica</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                  {BOOL_FIELDS_INSPECCION.map((field) => (
                    <div key={field.name} className="flex items-center gap-2 text-sm">
                      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${selectedRecord[field.name] ? "bg-green-500 text-white" : "bg-red-500 text-white"}`}>
                        {selectedRecord[field.name] ? "S" : "N"}
                      </span>
                      <span className="text-muted-foreground text-xs">{field.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Observaciones */}
              {selectedRecord.desviacion_identificada && (
                <div>
                  <h4 className="font-semibold text-sm text-primary mb-2">Observaciones</h4>
                  <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                    {selectedRecord.desviacion_identificada}
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
