"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Clock } from "lucide-react"
import { toast } from "sonner"
import { registerVehicleAppointment } from "@/lib/vehicle-actions"
import { useAuth } from "@/components/auth-provider"
import {
  getCategorias,
  getTransportes,
  getTiposVehiculos,
  getTiposDespacho,
  type Categoria,
  type Transporte,
  type TipoVehiculo,
  type TipoDespacho,
} from "@/lib/actions"

export function VehicleAppointmentsForm() {
  const { selectedEmpresaId } = useAuth()
  const [formData, setFormData] = React.useState({
    placa: "",
    nombre_conductor: "",
    telefono: "",
    transporte: "",
    tipo_vehiculo: "",
    tipo_producto: "",
    tipo_despacho: "", // Added tipo_despacho field
  })
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [categorias, setCategorias] = React.useState<Categoria[]>([])
  const [transportes, setTransportes] = React.useState<Transporte[]>([])
  const [tiposVehiculos, setTiposVehiculos] = React.useState<TipoVehiculo[]>([])
  const [tiposDespacho, setTiposDespacho] = React.useState<TipoDespacho[]>([]) // Added state for tipos despacho
  const [validationErrors, setValidationErrors] = React.useState<Record<string, boolean>>({})
  const [placaError, setPlacaError] = React.useState<string>("")

  React.useEffect(() => {
    const loadDropdownData = async () => {
      const [categoriasData, transportesData, tiposVehiculosData, tiposDespachoData] = await Promise.all([
        getCategorias(),
        getTransportes(),
        getTiposVehiculos(),
        getTiposDespacho(),
      ])
      setCategorias(categoriasData)
      setTransportes(transportesData)
      setTiposVehiculos(tiposVehiculosData)
      setTiposDespacho(tiposDespachoData) // Set tipos despacho
    }
    loadDropdownData()
  }, [])

  const handleInputChange = (field: string, value: string) => {
    let processedValue = value

    if (field === "placa") {
      processedValue = value.toUpperCase().replace(/[^A-Z0-9]/g, "")
    }

    if (field === "nombre_conductor") {
      processedValue = value.toUpperCase().replace(/[^A-Z\s]/g, "")
    }

    if (field === "telefono") {
      processedValue = value.replace(/[^0-9]/g, "")
    }

    setFormData((prev) => ({ ...prev, [field]: processedValue }))
    if (validationErrors[field]) {
      setValidationErrors((prev) => ({ ...prev, [field]: false }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const errors: Record<string, boolean> = {}

    if (!formData.placa) {
      errors.placa = true
    }

    if (!formData.nombre_conductor) {
      errors.nombre_conductor = true
    }

    if (!formData.transporte) {
      errors.transporte = true
    }

    if (!formData.tipo_vehiculo) {
      errors.tipo_vehiculo = true
    }

    if (!formData.tipo_producto) {
      errors.tipo_producto = true
    }

    if (!formData.tipo_despacho) {
      errors.tipo_despacho = true
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      toast.error("Por favor complete correctamente todos los campos requeridos")
      return
    }

    setIsSubmitting(true)
    setPlacaError("")

    try {
      const selectedTipoVehiculo = tiposVehiculos.find((tv) => tv.nombretipo === formData.tipo_vehiculo)
      const capacidad = selectedTipoVehiculo?.capacidad || 0

      const result = await registerVehicleAppointment({
        placa: formData.placa,
        nombre_conductor: formData.nombre_conductor,
        telefono: formData.telefono,
        transporte: formData.transporte,
        tipo_vehiculo: formData.tipo_vehiculo,
        tipo_producto: formData.tipo_producto,
        capacidad: capacidad,
        tipo_despacho: formData.tipo_despacho,
        selectedEmpresaId: selectedEmpresaId ?? undefined,
      })

      if (!result.success) {
        console.log("[v0] Registration error:", result.error)
        // Check if it's a placa error
        if (result.error?.includes("placa")) {
          setPlacaError(result.error)
        } else {
          toast.error(result.error || "Error al registrar la cita")
        }
        return
      }

      toast.success("Cita de vehículo registrada exitosamente")

      setFormData({
        placa: "",
        nombre_conductor: "",
        telefono: "",
        transporte: "",
        tipo_vehiculo: "",
        tipo_producto: "",
        tipo_despacho: "",
      })
      setValidationErrors({})
      setPlacaError("")
    } catch (error) {
      console.error("[v0] Unexpected error registering appointment:", error)
      toast.error("Error al registrar la cita")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto px-2 md:px-0">
      <div className="bg-primary rounded-t-lg p-2 md:p-4 flex items-center gap-2">
        <Clock className="h-4 w-4 md:h-5 md:w-5 text-white" />
        <div>
          <h1 className="text-sm md:text-lg font-bold text-white">Registrar Vehículos</h1>
          <p className="text-[10px] md:text-xs text-white/90 mt-0.5">Complete los datos del vehículo y conductor</p>
        </div>
      </div>

      <Card className="border-t-0 rounded-t-none p-3 md:p-6">
        <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
            <div className="space-y-2">
              <Label htmlFor="placa" className="text-xs md:text-sm">
                Placa <span className="text-destructive">*</span>
              </Label>
              <Input
                id="placa"
                placeholder="Ej: ABC123"
                className={`text-xs md:text-sm h-8 md:h-9 uppercase ${validationErrors.placa ? "border-red-500 border-2" : ""}`}
                value={formData.placa}
                onChange={(e) => handleInputChange("placa", e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nombre_conductor" className="text-xs md:text-sm">
                Nombre del Conductor <span className="text-destructive">*</span>
              </Label>
              <Input
                id="nombre_conductor"
                placeholder="Nombre completo"
                className={`text-xs md:text-sm h-8 md:h-9 uppercase ${validationErrors.nombre_conductor ? "border-red-500 border-2" : ""}`}
                value={formData.nombre_conductor}
                onChange={(e) => handleInputChange("nombre_conductor", e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="telefono" className="text-xs md:text-sm">
                Celular
              </Label>
              <Input
                id="telefono"
                type="tel"
                placeholder="Ej: 3001234567"
                className={`text-xs md:text-sm h-8 md:h-9 ${validationErrors.telefono ? "border-red-500 border-2" : ""}`}
                value={formData.telefono}
                onChange={(e) => handleInputChange("telefono", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="transporte" className="text-xs md:text-sm">
                Transporte <span className="text-destructive">*</span>
              </Label>
              <Select value={formData.transporte} onValueChange={(value) => handleInputChange("transporte", value)}>
                <SelectTrigger
                  className={`text-xs md:text-sm h-8 md:h-9 ${validationErrors.transporte ? "border-red-500 border-2" : ""}`}
                >
                  <SelectValue placeholder="Seleccione transporte" />
                </SelectTrigger>
                <SelectContent>
                  {transportes.map((transporte) => (
                    <SelectItem key={transporte.nombretransporte} value={transporte.nombretransporte}>
                      {transporte.nombretransporte}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tipo_vehiculo" className="text-xs md:text-sm">
                Tipo de Vehículo <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.tipo_vehiculo}
                onValueChange={(value) => handleInputChange("tipo_vehiculo", value)}
              >
                <SelectTrigger
                  className={`text-xs md:text-sm h-8 md:h-9 ${validationErrors.tipo_vehiculo ? "border-red-500 border-2" : ""}`}
                >
                  <SelectValue placeholder="Seleccione tipo" />
                </SelectTrigger>
                <SelectContent>
                  {tiposVehiculos.map((tipoVehiculo) => (
                    <SelectItem key={tipoVehiculo.nombretipo} value={tipoVehiculo.nombretipo}>
                      {tipoVehiculo.nombretipo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tipo_producto" className="text-xs md:text-sm">
                Tipo de Producto <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.tipo_producto}
                onValueChange={(value) => handleInputChange("tipo_producto", value)}
              >
                <SelectTrigger
                  className={`text-xs md:text-sm h-8 md:h-9 ${validationErrors.tipo_producto ? "border-red-500 border-2" : ""}`}
                >
                  <SelectValue placeholder="Seleccione producto" />
                </SelectTrigger>
                <SelectContent>
                  {categorias.map((categoria) => (
                    <SelectItem key={categoria.nombre} value={categoria.nombre}>
                      {categoria.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tipo_despacho" className="text-xs md:text-sm">
                Despacho/Recepción <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.tipo_despacho}
                onValueChange={(value) => handleInputChange("tipo_despacho", value)}
              >
                <SelectTrigger
                  className={`text-xs md:text-sm h-8 md:h-9 ${validationErrors.tipo_despacho ? "border-red-500 border-2" : ""}`}
                >
                  <SelectValue placeholder="Seleccione tipo despacho" />
                </SelectTrigger>
                <SelectContent>
                  {tiposDespacho.map((tipoDespacho) => (
                    <SelectItem key={tipoDespacho.nombretipodespacho} value={tipoDespacho.nombretipodespacho}>
                      {tipoDespacho.nombretipodespacho}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end pt-2 md:pt-4">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-primary text-white hover:bg-primary/90 font-semibold text-xs md:text-sm h-8 md:h-9 px-4 md:px-6 w-full sm:w-auto"
            >
              {isSubmitting ? "Guardando..." : "Guardar"}
            </Button>
          </div>

          {placaError && (
            <div className="text-red-600 text-xs md:text-sm font-medium text-center mt-2">
              {placaError}
            </div>
          )}
        </form>
      </Card>
    </div>
  )
}
