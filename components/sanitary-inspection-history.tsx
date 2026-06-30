"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { FileText, Loader2, ImageIcon } from "lucide-react"
import { getSanitaryRegistryHistory } from "@/lib/orders-actions"
import { useAuth } from "@/components/auth-provider"

interface SanitaryRecord {
  id: number
  ordencargue: string | null
  placa: string
  conductor: string
  producto: string
  carpas: string
  limpieza: string
  olores: string
  plastico: string
  fumigacion: string
  plaguicida: string | null
  observaciones: string | null
  fumigador: string
  auxiliar: string
  aprobacion: string
  foto: string | null
  pdf: string | null
  fecha: string | null
  horaregistro: string | null
}

export function SanitaryInspectionHistory() {
  const { selectedEmpresaId } = useAuth()
  const [records, setRecords] = useState<SanitaryRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (selectedEmpresaId) {
      loadHistory()
    }
  }, [selectedEmpresaId])

  const loadHistory = async () => {
    setLoading(true)
    const result = await getSanitaryRegistryHistory(selectedEmpresaId)
    if (result.success) {
      setRecords(result.data)
    }
    setLoading(false)
  }

  const handleViewPhoto = (photoUrl: string | null) => {
    if (photoUrl) {
      window.open(photoUrl, "_blank")
    }
  }

  const handleViewPDF = (pdfUrl: string | null) => {
    if (pdfUrl) {
      window.open(pdfUrl, "_blank")
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Historial de Inspección Sanitaria</CardTitle>
          <CardDescription>Registro completo de todas las inspecciones sanitarias realizadas</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No hay registros de inspección disponibles</div>
          ) : (
            <div className="max-h-[600px] overflow-y-auto overflow-x-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Hora Registro</TableHead>
                    <TableHead>Orden Cargue</TableHead>
                    <TableHead>Placa</TableHead>
                    <TableHead>Conductor</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Carpas</TableHead>
                    <TableHead>Limpieza</TableHead>
                    <TableHead>Olores</TableHead>
                    <TableHead>Plástico</TableHead>
                    <TableHead>Fumigación</TableHead>
                    <TableHead>Plaguicida</TableHead>
                    <TableHead>Observaciones</TableHead>
                    <TableHead>Fumigador</TableHead>
                    <TableHead>Auxiliar</TableHead>
                    <TableHead>Aprobación</TableHead>
                    <TableHead>Foto</TableHead>
                    <TableHead>PDF</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-medium">{record.id}</TableCell>
                      <TableCell>{record.fecha || "-"}</TableCell>
                      <TableCell>{record.horaregistro || "-"}</TableCell>
                      <TableCell>{record.ordencargue || "-"}</TableCell>
                      <TableCell>{record.placa}</TableCell>
                      <TableCell>{record.conductor}</TableCell>
                      <TableCell>{record.producto}</TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            record.carpas === "Si" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                          }`}
                        >
                          {record.carpas}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            record.limpieza === "Si" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                          }`}
                        >
                          {record.limpieza}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            record.olores === "Si" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                          }`}
                        >
                          {record.olores}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            record.plastico === "Si" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                          }`}
                        >
                          {record.plastico}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            record.fumigacion === "Si" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                          }`}
                        >
                          {record.fumigacion}
                        </span>
                      </TableCell>
                      <TableCell>{record.plaguicida || "-"}</TableCell>
                      <TableCell className="max-w-xs truncate">{record.observaciones || "-"}</TableCell>
                      <TableCell>{record.fumigador}</TableCell>
                      <TableCell>{record.auxiliar}</TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            record.aprobacion === "aprobado" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                          }`}
                        >
                          {record.aprobacion}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewPhoto(record.foto)}
                          disabled={!record.foto}
                          title={record.foto ? "Ver foto" : "No hay foto disponible"}
                        >
                          <ImageIcon className="h-4 w-4" />
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewPDF(record.pdf)}
                          disabled={!record.pdf}
                          title={record.pdf ? "Ver PDF" : "No hay PDF disponible"}
                        >
                          <FileText className="h-4 w-4 text-purple-900" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
