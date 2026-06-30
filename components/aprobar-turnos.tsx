"use client"

import { useState, useEffect, useRef, Fragment } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { Loader2, CheckCircle, XCircle, Pen, Eraser, FileText, Download, History, ArrowLeft, Eye, Users, X, ChevronDown, ChevronRight } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { getSolicitudesPendientes, aprobarSolicitudes, rechazarSolicitudes, getEmpresaData, getSolicitudesAprobadas, updatePdfUrl } from "@/lib/solicitud-turnos-actions"
import { Badge } from "@/components/ui/badge"

interface SolicitudTurno {
  id: number
  fechasolicitud: string
  idempresa: number
  puesto: string
  fecharequerida: string
  nombresolicitante: string
  estado: string
  nombreaprobo: string | null
  cantidad: number
  firmasolicitante: string | null
  firmaaprobo: string | null
  fechahoraprobo: string | null
  pdfaprobacion: string | null
  personal: string | null
  // Tipo de servicio adicional: "Turnos" | "Horas Extra".
  tipo: string | null
}

interface PersonaHeadcount {
  id: number
  nombre: string
}

export function AprobarTurnos() {
  const { selectedEmpresaId, profile } = useAuth()
  const { toast } = useToast()
  
  const [solicitudes, setSolicitudes] = useState<SolicitudTurno[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  
  // View mode and history
  const [viewMode, setViewMode] = useState<"pendientes" | "historial">("pendientes")
  const [historial, setHistorial] = useState<SolicitudTurno[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [selectedFirma, setSelectedFirma] = useState<{ url: string; title: string } | null>(null)
  // Filtros del historial por fecha de solicitud y fecha requerida.
  // Vacío = sin filtro. Se comparan como prefijo de la fecha (YYYY-MM-DD)
  // para tolerar valores con o sin hora.
  const [filtroFechaSolicitud, setFiltroFechaSolicitud] = useState("")
  const [filtroFechaRequerida, setFiltroFechaRequerida] = useState("")
  // Conjunto de ids de solicitudes cuya fila de detalle (campo personal)
  // está desplegada en el historial.
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  const toggleRow = (id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }
  
  // Signature
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false)
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null)
  const [actionType, setActionType] = useState<"aprobar" | "rechazar">("aprobar")
  
  // Approver name
  const [nombreAprobador, setNombreAprobador] = useState("")

  // Personnel assignment
  const [availablePersonnel, setAvailablePersonnel] = useState<PersonaHeadcount[]>([])
  const [selectedPersonnel, setSelectedPersonnel] = useState<string[]>([])
  const [loadingPersonnel, setLoadingPersonnel] = useState(false)
  const [personnelSearchTerm, setPersonnelSearchTerm] = useState("")

  useEffect(() => {
    if (selectedEmpresaId) {
      loadSolicitudes()
    }
  }, [selectedEmpresaId])

  const loadSolicitudes = async () => {
    setLoading(true)
    const result = await getSolicitudesPendientes(selectedEmpresaId)
    if (result.success) {
      setSolicitudes(result.data)
    }
    setLoading(false)
  }

  const loadHistorial = async () => {
    setLoadingHistory(true)
    const result = await getSolicitudesAprobadas(selectedEmpresaId)
    if (result.success) {
      setHistorial(result.data)
    }
    setLoadingHistory(false)
  }

  const loadPersonnel = async () => {
    if (!selectedEmpresaId) return
    setLoadingPersonnel(true)
    try {
      const response = await fetch(`/api/headcount?empresaId=${selectedEmpresaId}`)
      if (response.ok) {
        const data = await response.json()
        setAvailablePersonnel(data.map((p: { id: number; nombre: string }) => ({ id: p.id, nombre: p.nombre })))
      }
    } catch (error) {
      console.error("[v0] Error loading personnel:", error)
    } finally {
      setLoadingPersonnel(false)
    }
  }

  useEffect(() => {
    if (selectedEmpresaId) {
      loadPersonnel()
    }
  }, [selectedEmpresaId])

  const handleViewHistorial = () => {
    setViewMode("historial")
    loadHistorial()
  }

  // Acceso directo desde "Aprobación horas Éxtra": si al montar existe
  // la bandera en sessionStorage, abrimos directamente la vista de
  // historial y limpiamos la bandera para no repetir en futuras visitas.
  useEffect(() => {
    if (typeof window === "undefined") return
    if (sessionStorage.getItem("aprobarTurnosInitialView") === "historial") {
      sessionStorage.removeItem("aprobarTurnosInitialView")
      handleViewHistorial()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    setIsDrawing(true)
    setHasSignature(true)

    const rect = canvas.getBoundingClientRect()
    let x, y
    if ("touches" in e) {
      x = e.touches[0].clientX - rect.left
      y = e.touches[0].clientY - rect.top
    } else {
      x = e.clientX - rect.left
      y = e.clientY - rect.top
    }

    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    let x, y
    if ("touches" in e) {
      e.preventDefault()
      x = e.touches[0].clientX - rect.left
      y = e.touches[0].clientY - rect.top
    } else {
      x = e.clientX - rect.left
      y = e.clientY - rect.top
    }

    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const stopDrawing = () => {
    setIsDrawing(false)
  }

  const clearSignature = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
    setSignatureDataUrl(null)
  }

  const confirmSignature = () => {
    const canvas = canvasRef.current
    if (canvas && hasSignature) {
      const dataUrl = canvas.toDataURL("image/png")
      setSignatureDataUrl(dataUrl)
    }
    setSignatureDialogOpen(false)
  }

  useEffect(() => {
    if (signatureDialogOpen) {
      setTimeout(() => {
        initCanvas()
      }, 100)
    }
  }, [signatureDialogOpen])

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(solicitudes.map(s => s.id))
    } else {
      setSelectedIds([])
    }
  }

  const handleSelectOne = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedIds([...selectedIds, id])
    } else {
      setSelectedIds(selectedIds.filter(i => i !== id))
    }
  }

  const handleAddPersonnel = (nombre: string) => {
    if (!selectedPersonnel.includes(nombre)) {
      setSelectedPersonnel([...selectedPersonnel, nombre])
    }
    setPersonnelSearchTerm("")
  }

  const handleRemovePersonnel = (nombre: string) => {
    setSelectedPersonnel(selectedPersonnel.filter(p => p !== nombre))
  }

  const filteredPersonnel = availablePersonnel.filter(p => 
    p.nombre.toLowerCase().includes(personnelSearchTerm.toLowerCase()) &&
    !selectedPersonnel.includes(p.nombre)
  )

  // Una solicitud es de tipo "Turnos" cuando su campo `tipo` es "Turnos"
  // (o está vacío, ya que ese es el valor por defecto en la UI).
  const esTipoTurnos = (s: SolicitudTurno) =>
    (s.tipo || "Turnos").trim().toLowerCase() === "turnos"

  // Solicitudes seleccionadas que son de tipo "Turnos" y la cantidad
  // total de personas que requieren. Para este tipo, el personal
  // asignado debe coincidir exactamente con la cantidad solicitada.
  const solicitudesTurnosSeleccionadas = solicitudes.filter(
    (s) => selectedIds.includes(s.id) && esTipoTurnos(s),
  )
  const requiereValidacionTurnos = solicitudesTurnosSeleccionadas.length > 0
  const cantidadTurnosRequerida = solicitudesTurnosSeleccionadas.reduce(
    (sum, s) => sum + Number(s.cantidad),
    0,
  )
  const personalCoincide =
    !requiereValidacionTurnos || selectedPersonnel.length === cantidadTurnosRequerida

  const handleAprobar = async () => {
    if (selectedIds.length === 0) {
      toast({ title: "Error", description: "Seleccione al menos una solicitud", variant: "destructive" })
      return
    }
    if (!nombreAprobador.trim()) {
      toast({ title: "Error", description: "Debe ingresar el nombre de quien aprueba", variant: "destructive" })
      return
    }
    if (!signatureDataUrl) {
      toast({ title: "Error", description: "Debe firmar para aprobar", variant: "destructive" })
      return
    }
    // Para solicitudes de tipo "Turnos", el personal asignado debe ser
    // igual a la cantidad solicitada.
    if (requiereValidacionTurnos && selectedPersonnel.length !== cantidadTurnosRequerida) {
      toast({
        title: "Cantidad de personal no coincide",
        description: `Debe asignar exactamente ${cantidadTurnosRequerida} persona(s) para los turnos seleccionados. Actualmente hay ${selectedPersonnel.length} asignada(s).`,
        variant: "destructive",
      })
      return
    }

    setSaving(true)
    try {
      // Upload signature
      let firmaUrl: string | null = null
      if (signatureDataUrl) {
        const base64Data = signatureDataUrl.split(",")[1]
        const byteCharacters = atob(base64Data)
        const byteNumbers = new Array(byteCharacters.length)
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i)
        }
        const byteArray = new Uint8Array(byteNumbers)
        const blob = new Blob([byteArray], { type: "image/png" })
        
        const formDataUpload = new FormData()
        formDataUpload.append("file", blob, `firma_aprobacion_${Date.now()}.png`)
        
        const uploadRes = await fetch("/api/upload-signature", {
          method: "POST",
          body: formDataUpload,
        })
        
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json()
          firmaUrl = uploadData.url
        }
      }

      // Build personal string (comma separated)
      const personalString = selectedPersonnel.length > 0 ? selectedPersonnel.join(", ") : undefined

      const result = await aprobarSolicitudes({
        ids: selectedIds,
        nombreaprobo: nombreAprobador.trim(),
        firmaaprobo: firmaUrl,
        personal: personalString,
      })

      if (result.success) {
        // Generate PDF
        const aprobadas = solicitudes.filter(s => selectedIds.includes(s.id))
        const pdfResult = await generatePDF(aprobadas, firmaUrl, selectedPersonnel)

        let pdfUrl: string | null = null
        if (pdfResult) {
          // 1) Descargamos SIEMPRE el PDF para el usuario, antes de
          //    intentar subirlo. Antes la descarga estaba dentro del
          //    `if (pdfUploadRes.ok)`, asi que si el upload fallaba el
          //    usuario se quedaba sin ningun PDF y parecia que "ya no
          //    se generaba".
          const link = document.createElement("a")
          link.href = URL.createObjectURL(pdfResult.blob)
          link.download = pdfResult.filename
          link.click()

          // 2) Subimos el PDF al storage y guardamos su URL. Si esto
          //    falla, la aprobacion ya quedo registrada y el usuario
          //    ya tiene el archivo; solo avisamos que no se pudo
          //    archivar la copia en el servidor.
          try {
            const formDataPdf = new FormData()
            formDataPdf.append("file", pdfResult.blob, pdfResult.filename)
            formDataPdf.append("folder", "aprobacionturnos")

            const pdfUploadRes = await fetch("/api/upload-pdf", {
              method: "POST",
              body: formDataPdf,
            })

            if (pdfUploadRes.ok) {
              const pdfData = await pdfUploadRes.json()
              pdfUrl = pdfData.url
              // Update records with PDF URL
              await updatePdfUrl(selectedIds, pdfUrl)
            } else {
              const errData = await pdfUploadRes.json().catch(() => ({}))
              console.error("[v0] upload-pdf fail:", pdfUploadRes.status, errData)
              toast({
                title: "PDF generado, pero no archivado",
                description:
                  "El PDF se descargo correctamente pero no se pudo guardar la copia en el servidor.",
                variant: "destructive",
              })
            }
          } catch (uploadErr) {
            console.error("[v0] upload-pdf exception:", uploadErr)
            toast({
              title: "PDF generado, pero no archivado",
              description:
                "El PDF se descargo correctamente pero no se pudo guardar la copia en el servidor.",
              variant: "destructive",
            })
          }
        }

        toast({ title: "Solicitudes aprobadas", description: `Se aprobaron ${selectedIds.length} solicitud(es)` })
        
        // Reload and reset
        loadSolicitudes()
        setSelectedIds([])
        setHasSignature(false)
        setSignatureDataUrl(null)
        setNombreAprobador("")
        setSelectedPersonnel([])
      } else {
        toast({ title: "Error", description: result.message, variant: "destructive" })
      }
    } catch (error) {
      toast({ title: "Error", description: "Error al aprobar las solicitudes", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleRechazar = async () => {
    if (selectedIds.length === 0) {
      toast({ title: "Error", description: "Seleccione al menos una solicitud", variant: "destructive" })
      return
    }

    setSaving(true)
    try {
      const result = await rechazarSolicitudes(selectedIds, profile?.nombre || "Usuario")

      if (result.success) {
        toast({ title: "Solicitudes rechazadas", description: `Se rechazaron ${selectedIds.length} solicitud(es)` })
        loadSolicitudes()
        setSelectedIds([])
      } else {
        toast({ title: "Error", description: result.message, variant: "destructive" })
      }
    } catch (error) {
      toast({ title: "Error", description: "Error al rechazar las solicitudes", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const generatePDF = async (aprobadas: SolicitudTurno[], firmaAprobadorUrl: string | null, personnel: string[] = []): Promise<{ blob: Blob; filename: string } | null> => {
    try {
      const empresaData = await getEmpresaData(selectedEmpresaId!)
      if (!empresaData) {
        toast({ title: "Error", description: "No se pudo obtener datos de la empresa", variant: "destructive" })
        return null
      }

      // Dynamic import to avoid build issues with fflate/Worker
      const { default: jsPDF } = await import("jspdf")
      const { default: autoTable } = await import("jspdf-autotable")
      
      const doc = new jsPDF()
      const now = new Date()
      const fechaAprobacion = now.toLocaleDateString("es-CO", { 
        timeZone: "America/Bogota",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })

      // Header
      doc.setFontSize(16)
      doc.setTextColor(200, 16, 46)
      doc.setFont(undefined as unknown as string, "bold")
      doc.text(empresaData.nombre, 105, 20, { align: "center" })

      doc.setFontSize(10)
      doc.setTextColor(0, 0, 0)
      doc.setFont(undefined as unknown as string, "normal")
      doc.text(`NIT: ${empresaData.nit || ""}`, 105, 27, { align: "center" })
      doc.text(empresaData.direccion || "", 105, 33, { align: "center" })

      doc.setFontSize(14)
      doc.setFont(undefined as unknown as string, "bold")
      doc.text("APROBACIÓN DE TURNOS", 105, 45, { align: "center" })

      doc.setFontSize(10)
      doc.setFont(undefined as unknown as string, "normal")
      doc.text(`Fecha de aprobación: ${fechaAprobacion}`, 105, 53, { align: "center" })

      // Solicitante info
      const solicitante = aprobadas[0]?.nombresolicitante || ""
      const firmasolicitanteUrl = aprobadas[0]?.firmasolicitante
      
      doc.setFontSize(11)
      doc.text(`Solicitante: ${solicitante}`, 20, 65)
      doc.text(`Aprobado por: ${profile?.nombre || ""}`, 20, 72)

      // Table with details
      const tableData = aprobadas.map(s => [
        s.puesto,
        s.fecharequerida,
        s.cantidad.toString()
      ])

      autoTable(doc, {
        startY: 80,
        head: [["Puesto", "Fecha Requerida", "Cantidad"]],
        body: tableData,
        theme: "striped",
        headStyles: { fillColor: [44, 82, 130] },
        styles: { fontSize: 10 },
      })

      let currentY = (doc as any).lastAutoTable.finalY + 10

      // Total
      const totalCantidad = aprobadas.reduce((sum, s) => sum + Number(s.cantidad), 0)
      doc.setFont(undefined as unknown as string, "bold")
      doc.text(`Total de turnos aprobados: ${totalCantidad}`, 20, currentY)

      // Personnel section
      if (personnel.length > 0) {
        currentY += 15
        doc.setFontSize(12)
        doc.setFont(undefined as unknown as string, "bold")
        doc.text("PERSONAL PROGRAMADO", 20, currentY)
        
        currentY += 5
        const personnelTableData = personnel.map((nombre, index) => [(index + 1).toString(), nombre])
        
        autoTable(doc, {
          startY: currentY,
          head: [["#", "Nombre"]],
          body: personnelTableData,
          theme: "striped",
          headStyles: { fillColor: [44, 82, 130] },
          styles: { fontSize: 10 },
          columnStyles: {
            0: { cellWidth: 15 },
            1: { cellWidth: 'auto' }
          }
        })

        currentY = (doc as any).lastAutoTable.finalY + 10
      }

      const finalY = currentY

      // Signatures section
      let sigY = finalY + 20
      doc.setFont(undefined as unknown as string, "normal")
      
      // Firma solicitante
      doc.text("Firma Solicitante:", 30, sigY)
      if (firmasolicitanteUrl) {
        try {
          const imgSolicitante = await loadImage(firmasolicitanteUrl)
          doc.addImage(imgSolicitante, "PNG", 30, sigY + 5, 60, 30)
        } catch (e) {
          doc.text("[Firma no disponible]", 30, sigY + 15)
        }
      }
      doc.text(solicitante, 30, sigY + 40)
      doc.line(30, sigY + 37, 90, sigY + 37)

      // Firma aprobador
      doc.text("Firma Aprobador:", 120, sigY)
      if (firmaAprobadorUrl) {
        try {
          const imgAprobador = await loadImage(firmaAprobadorUrl)
          doc.addImage(imgAprobador, "PNG", 120, sigY + 5, 60, 30)
        } catch (e) {
          doc.text("[Firma no disponible]", 120, sigY + 15)
        }
      }
      // Linea de firma + nombre del aprobador debajo. Priorizamos
      // `nombreAprobador` (lo que el aprobador escribio en el formulario
      // justo antes de firmar) porque corresponde 1:1 con quien firma
      // este PDF. Si por algun motivo viene vacio, usamos el `profile`
      // del usuario autenticado como fallback para no dejar el espacio
      // en blanco.
      doc.line(120, sigY + 37, 180, sigY + 37)
      const nombreFirmaAprobador =
        (nombreAprobador && nombreAprobador.trim()) || profile?.nombre || ""
      doc.text(nombreFirmaAprobador, 120, sigY + 42)

      // Return PDF blob instead of downloading
      const pdfBlob = doc.output("blob")
      const filename = `aprobacion_turnos_${now.toISOString().split("T")[0]}_${Date.now()}.pdf`
      return { blob: pdfBlob, filename }
    } catch (error) {
      console.error("[v0] Error generating PDF:", error)
      toast({ title: "Error", description: "Error al generar el PDF", variant: "destructive" })
      return null
    }
  }

  // Estado para mostrar spinner en la fila del historial cuya PDF se
  // está (re)generando.
  const [generatingPdfId, setGeneratingPdfId] = useState<number | null>(null)

  // Regenera y archiva el PDF de una solicitud ya aprobada cuando su
  // `pdfaprobacion` está vacío. Reconstruye el documento con los datos
  // completos de la orden (incluyendo la firma del aprobador que ya
  // quedó guardada en `firmaaprobo` y el personal asignado), lo sube al
  // storage y persiste la URL para poblarla en el registro.
  const handleGenerarPdfHistorial = async (solicitud: SolicitudTurno) => {
    setGeneratingPdfId(solicitud.id)
    try {
      // El personal asignado se guarda como string (separado por comas)
      // en la columna `personal`. Lo reconstruimos para la tabla del PDF.
      const personnel = solicitud.personal
        ? solicitud.personal.split(",").map((p) => p.trim()).filter(Boolean)
        : []

      const pdfResult = await generatePDF(
        [solicitud],
        solicitud.firmaaprobo,
        personnel,
      )
      if (!pdfResult) return

      const formDataPdf = new FormData()
      formDataPdf.append("file", pdfResult.blob, pdfResult.filename)
      formDataPdf.append("folder", "aprobacionturnos")

      const pdfUploadRes = await fetch("/api/upload-pdf", {
        method: "POST",
        body: formDataPdf,
      })

      if (!pdfUploadRes.ok) {
        const errData = await pdfUploadRes.json().catch(() => ({}))
        console.error("[v0] upload-pdf fail:", pdfUploadRes.status, errData)
        throw new Error("No se pudo subir el PDF")
      }

      const pdfData = await pdfUploadRes.json()
      const pdfUrl: string = pdfData.url

      // Persistimos la URL para esta solicitud y refrescamos el estado
      // local para que el botón pase a "Ver PDF" sin recargar.
      await updatePdfUrl([solicitud.id], pdfUrl)
      setHistorial((prev) =>
        prev.map((s) =>
          s.id === solicitud.id ? { ...s, pdfaprobacion: pdfUrl } : s,
        ),
      )

      toast({
        title: "PDF generado",
        description: "El PDF de la aprobación se generó y guardó correctamente.",
      })
    } catch (error) {
      console.error("[v0] Error generando PDF de historial:", error)
      toast({
        title: "Error",
        description: "No se pudo generar el PDF de la aprobación.",
        variant: "destructive",
      })
    } finally {
      setGeneratingPdfId(null)
    }
  }

  const loadImage = (url: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        const canvas = document.createElement("canvas")
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext("2d")
        if (ctx) {
          ctx.drawImage(img, 0, 0)
          resolve(canvas.toDataURL("image/png"))
        } else {
          reject(new Error("Could not get canvas context"))
        }
      }
      img.onerror = reject
      img.src = url
    })
  }

  // Normaliza una fecha (con o sin hora) a su prefijo YYYY-MM-DD para
  // poder compararla contra el valor de un <input type="date">.
  const aFechaCorta = (valor: string | null) =>
    valor ? String(valor).slice(0, 10) : ""

  // Aplica los filtros de fecha de solicitud y fecha requerida sobre el
  // historial. Si un filtro está vacío, no restringe esa columna.
  const historialFiltrado = historial.filter((s) => {
    const coincideSolicitud =
      !filtroFechaSolicitud || aFechaCorta(s.fechasolicitud) === filtroFechaSolicitud
    const coincideRequerida =
      !filtroFechaRequerida || aFechaCorta(s.fecharequerida) === filtroFechaRequerida
    return coincideSolicitud && coincideRequerida
  })

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              {viewMode === "pendientes" ? "Aprobar Turnos" : "Historial de Aprobaciones"}
            </CardTitle>
            {viewMode === "pendientes" ? (
              <Button variant="outline" onClick={handleViewHistorial}>
                <History className="h-4 w-4 mr-2" />
                Ver Historial
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setViewMode("pendientes")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver a Pendientes
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {viewMode === "pendientes" ? (
            <>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  Cargando solicitudes pendientes...
                </div>
              ) : solicitudes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No hay solicitudes pendientes de aprobación
                </div>
              ) : (
                <>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">
                            <Checkbox
                              checked={selectedIds.length === solicitudes.length && solicitudes.length > 0}
                              onCheckedChange={(checked) => handleSelectAll(checked as boolean)}
                            />
                          </TableHead>
                          <TableHead>Fecha Solicitud</TableHead>
                          <TableHead>Solicitante</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Puesto</TableHead>
                          <TableHead>Fecha Requerida</TableHead>
                          <TableHead>Cantidad</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {solicitudes.map((solicitud) => (
                          <TableRow key={solicitud.id}>
                            <TableCell>
                              <Checkbox
                                checked={selectedIds.includes(solicitud.id)}
                                onCheckedChange={(checked) => handleSelectOne(solicitud.id, checked as boolean)}
                              />
                            </TableCell>
                            <TableCell>{solicitud.fechasolicitud}</TableCell>
                            <TableCell>{solicitud.nombresolicitante}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{solicitud.tipo || "Turnos"}</Badge>
                            </TableCell>
                            <TableCell>{solicitud.puesto}</TableCell>
                            <TableCell>{solicitud.fecharequerida}</TableCell>
                            <TableCell>{solicitud.cantidad}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {selectedIds.length > 0 && (
                    <div className="p-4 bg-muted rounded-lg space-y-4">
                      <p className="font-medium">{selectedIds.length} solicitud(es) seleccionada(s)</p>
                      
                      {/* Nombre del aprobador */}
                      <div className="space-y-2">
                        <Label>Nombre de quien aprueba *</Label>
                        <Input
                          value={nombreAprobador}
                          onChange={(e) => setNombreAprobador(e.target.value)}
                          placeholder="Ingrese el nombre completo"
                        />
                      </div>
                      
                      {/* Asignar Personal */}
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          Asignar Personal al Turno
                        </Label>
                        
                        {/* Selected Personnel */}
                        {selectedPersonnel.length > 0 && (
                          <div className="flex flex-wrap gap-2 p-2 bg-white rounded-md border">
                            {selectedPersonnel.map((nombre) => (
                              <Badge key={nombre} variant="secondary" className="flex items-center gap-1">
                                {nombre}
                                <button
                                  type="button"
                                  onClick={() => handleRemovePersonnel(nombre)}
                                  className="ml-1 hover:text-destructive"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        )}

                        {/* Search and Add Personnel */}
                        <div className="relative">
                          <Input
                            value={personnelSearchTerm}
                            onChange={(e) => setPersonnelSearchTerm(e.target.value)}
                            placeholder="Buscar personal por nombre..."
                            className="pr-8"
                          />
                          {loadingPersonnel && (
                            <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                          )}
                        </div>

                        {/* Personnel Suggestions */}
                        {personnelSearchTerm && filteredPersonnel.length > 0 && (
                          <div className="border rounded-md bg-white max-h-40 overflow-y-auto">
                            {filteredPersonnel.slice(0, 10).map((persona) => (
                              <button
                                key={persona.id}
                                type="button"
                                onClick={() => handleAddPersonnel(persona.nombre)}
                                className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b last:border-b-0"
                              >
                                {persona.nombre}
                              </button>
                            ))}
                          </div>
                        )}

                        {personnelSearchTerm && filteredPersonnel.length === 0 && !loadingPersonnel && (
                          <p className="text-sm text-muted-foreground">No se encontró personal con ese nombre</p>
                        )}

                        {requiereValidacionTurnos ? (
                          <p
                            className={`text-xs font-medium ${
                              personalCoincide ? "text-green-600" : "text-destructive"
                            }`}
                          >
                            {selectedPersonnel.length} de {cantidadTurnosRequerida} persona(s)
                            asignada(s)
                            {personalCoincide
                              ? " — coincide con lo solicitado"
                              : " — debe coincidir con la cantidad solicitada para turnos"}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            {selectedPersonnel.length} persona(s) asignada(s)
                          </p>
                        )}
                      </div>

                      {/* Firma del aprobador */}
                      <div className="space-y-2">
                        <Label>Firma del Aprobador (requerida para aprobar)</Label>
                        {signatureDataUrl ? (
                          <div className="space-y-2">
                            <div className="border rounded-md p-2 bg-white">
                              <img 
                                src={signatureDataUrl} 
                                alt="Firma del aprobador" 
                                className="max-h-24 mx-auto"
                              />
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setSignatureDialogOpen(true)}
                            >
                              <Pen className="h-4 w-4 mr-2" />
                              Modificar firma
                            </Button>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setSignatureDialogOpen(true)}
                          >
                            <Pen className="h-4 w-4 mr-2" />
                            Firmar
                          </Button>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <Button
                          onClick={handleAprobar}
                          disabled={saving || !signatureDataUrl || !nombreAprobador.trim() || !personalCoincide}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          {saving ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <CheckCircle className="h-4 w-4 mr-2" />
                          )}
                          Aprobar Seleccionados
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={handleRechazar}
                          disabled={saving}
                        >
                          {saving ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <XCircle className="h-4 w-4 mr-2" />
                          )}
                          Rechazar Seleccionados
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            /* Historial View */
            <div className="space-y-4">
              {/* Filtros de fecha del historial */}
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1">
                  <Label htmlFor="filtro-fecha-solicitud">Fecha Solicitud</Label>
                  <Input
                    id="filtro-fecha-solicitud"
                    type="date"
                    value={filtroFechaSolicitud}
                    onChange={(e) => setFiltroFechaSolicitud(e.target.value)}
                    className="w-44"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="filtro-fecha-requerida">Fecha Requerida</Label>
                  <Input
                    id="filtro-fecha-requerida"
                    type="date"
                    value={filtroFechaRequerida}
                    onChange={(e) => setFiltroFechaRequerida(e.target.value)}
                    className="w-44"
                  />
                </div>
                {(filtroFechaSolicitud || filtroFechaRequerida) && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setFiltroFechaSolicitud("")
                      setFiltroFechaRequerida("")
                    }}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Limpiar filtros
                  </Button>
                )}
              </div>

              {loadingHistory ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  Cargando historial...
                </div>
              ) : historialFiltrado.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {historial.length === 0
                    ? "No hay solicitudes aprobadas"
                    : "No hay solicitudes que coincidan con los filtros"}
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Fecha Solicitud</TableHead>
                        <TableHead>Fecha Requerida</TableHead>
                        <TableHead>Fecha Aprobación</TableHead>
                        <TableHead>Solicitante</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Puesto</TableHead>
                        <TableHead>Cantidad</TableHead>
                        <TableHead>Aprobado Por</TableHead>
                        <TableHead>Firmas</TableHead>
                        <TableHead>PDF</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historialFiltrado.map((solicitud) => (
                        <Fragment key={solicitud.id}>
                        <TableRow>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => toggleRow(solicitud.id)}
                              aria-label={expandedRows.has(solicitud.id) ? "Ocultar detalle" : "Ver detalle del personal"}
                            >
                              {expandedRows.has(solicitud.id) ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </Button>
                          </TableCell>
                          <TableCell>{solicitud.fechasolicitud || "-"}</TableCell>
                          <TableCell>{solicitud.fecharequerida || "-"}</TableCell>
                          <TableCell>
                            {solicitud.fechahoraprobo 
                              ? new Date(solicitud.fechahoraprobo).toLocaleString("es-CO", { timeZone: "America/Bogota" })
                              : "-"}
                          </TableCell>
                          <TableCell>{solicitud.nombresolicitante}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{solicitud.tipo || "Turnos"}</Badge>
                          </TableCell>
                          <TableCell>{solicitud.puesto}</TableCell>
                          <TableCell>{solicitud.cantidad}</TableCell>
                          <TableCell>{solicitud.nombreaprobo || "-"}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {solicitud.firmasolicitante && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setSelectedFirma({ 
                                    url: solicitud.firmasolicitante!, 
                                    title: "Firma del Solicitante" 
                                  })}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              )}
                              {solicitud.firmaaprobo && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setSelectedFirma({ 
                                    url: solicitud.firmaaprobo!, 
                                    title: "Firma del Aprobador" 
                                  })}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {solicitud.pdfaprobacion ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => window.open(solicitud.pdfaprobacion!, "_blank")}
                              >
                                <FileText className="h-4 w-4 mr-1" />
                                Ver PDF
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={generatingPdfId === solicitud.id}
                                onClick={() => handleGenerarPdfHistorial(solicitud)}
                              >
                                {generatingPdfId === solicitud.id ? (
                                  <>
                                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                    Generando...
                                  </>
                                ) : (
                                  <>
                                    <FileText className="h-4 w-4 mr-1" />
                                    Generar PDF
                                  </>
                                )}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                        {expandedRows.has(solicitud.id) && (
                          <TableRow>
                            <TableCell colSpan={11} className="bg-muted/40">
                              <div className="px-2 py-3">
                                <div className="flex items-center gap-2 mb-2 text-sm font-medium">
                                  <Users className="h-4 w-4" />
                                  Personal asignado
                                </div>
                                {solicitud.personal && solicitud.personal.trim() ? (
                                  <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                                    {solicitud.personal
                                      .split(",")
                                      .map((p) => p.trim())
                                      .filter(Boolean)
                                      .map((persona, idx) => (
                                        <li
                                          key={idx}
                                          className="text-sm text-muted-foreground rounded-md bg-background border px-3 py-1.5"
                                        >
                                          {persona}
                                        </li>
                                      ))}
                                  </ul>
                                ) : (
                                  <p className="text-sm text-muted-foreground">
                                    No hay personal registrado para esta solicitud.
                                  </p>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                        </Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Signature View Dialog */}
      <Dialog open={!!selectedFirma} onOpenChange={() => setSelectedFirma(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedFirma?.title}</DialogTitle>
          </DialogHeader>
          <div className="border rounded-lg bg-white p-4">
            {selectedFirma && (
              <img 
                src={selectedFirma.url} 
                alt={selectedFirma.title} 
                className="max-w-full mx-auto"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Signature Drawing Dialog */}
      <Dialog open={signatureDialogOpen} onOpenChange={setSignatureDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Firma del Aprobador</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Dibuje su firma en el recuadro</p>
            <div className="border rounded-lg bg-white">
              <canvas
                ref={canvasRef}
                width={350}
                height={150}
                className="w-full touch-none cursor-crosshair"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button type="button" variant="outline" onClick={clearSignature}>
              <Eraser className="h-4 w-4 mr-1" />
              Borrar
            </Button>
            <Button type="button" onClick={confirmSignature} disabled={!hasSignature}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
