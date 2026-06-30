"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { Scale, Clock, Edit, Eye } from "lucide-react"
import { toast } from "sonner"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { getLoadOrdersForBascula, updateBasculaData } from "@/lib/orders-actions"
import { getVehiclesForBascula, updateVehicleWeighingTime } from "@/lib/vehicle-actions"
import { getColombiaTime } from "@/lib/date-utils"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { useAuth } from "@/components/auth-provider"
import { BasculaOrderDetailsDialog } from "@/components/bascula-order-details-dialog"

interface LoadOrder {
  id: number
  ordendecargue: string
  placa: string
  pesajeinicial: string | null
  pesajefinal: string | null
  pesovascula: number | null
  tiquetebascula: string | null
  fechaorden: string | null
  fechacargue: string | null
  pesoorden: number | null
}

interface VehicleData {
  id: number
  placa: string
  nombreconductor: string
  horapesoinicial: string | null
}

interface BasculaFormProps {
  initialOrderId?: number | null
  onOrderLoaded?: () => void
}

export function BasculaForm({ initialOrderId, onOrderLoaded }: BasculaFormProps) {
  const { selectedEmpresaId } = useAuth()
  const [registrationType, setRegistrationType] = React.useState<"orden" | "placa">("orden")
  const [loadOrders, setLoadOrders] = React.useState<LoadOrder[]>([])
  const [vehicles, setVehicles] = React.useState<VehicleData[]>([])
  const [isLoadingOrders, setIsLoadingOrders] = React.useState(true)
  const [isLoadingVehicles, setIsLoadingVehicles] = React.useState(false)

  const [isDialogOpen, setIsDialogOpen] = React.useState(false)
  const [selectedOrder, setSelectedOrder] = React.useState<LoadOrder | null>(null)
  const [selectedVehicle, setSelectedVehicle] = React.useState<VehicleData | null>(null)
  const [formData, setFormData] = React.useState({
    horaInicio: "",
    horaFin: "",
    pesoNetoBascula: "",
    numeroTiquete: "",
  })
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [pesoNetoError, setPesoNetoError] = React.useState<string>("")

  // Detalle de productos por orden (dialog de solo lectura, NO afecta el registro de báscula).
  const [detailsOpen, setDetailsOpen] = React.useState(false)
  const [detailsOrden, setDetailsOrden] = React.useState<string | null>(null)
  const [detailsPlaca, setDetailsPlaca] = React.useState<string | null>(null)

  const handleOpenDetails = (order: LoadOrder) => {
    setDetailsOrden(order.ordendecargue || null)
    setDetailsPlaca(order.placa || null)
    setDetailsOpen(true)
  }

  React.useEffect(() => {
    if (selectedEmpresaId) {
      loadLoadOrders()
    }
  }, [selectedEmpresaId])

  React.useEffect(() => {
    if (registrationType === "placa") {
      loadVehicles()
    }
  }, [registrationType])

  React.useEffect(() => {
    if (initialOrderId && loadOrders.length > 0) {
      const order = loadOrders.find((o) => o.id === initialOrderId)
      if (order) {
        handleOpenDialog(order, "orden")
        if (onOrderLoaded) {
          onOrderLoaded()
        }
      }
    }
  }, [initialOrderId, loadOrders])

  const loadLoadOrders = async () => {
    setIsLoadingOrders(true)
    const result = await getLoadOrdersForBascula()
    if (result.success && result.data) {
      setLoadOrders(result.data)
    } else {
      toast.error(result.message || "Error al cargar órdenes de cargue")
    }
    setIsLoadingOrders(false)
  }

  const loadVehicles = async () => {
    setIsLoadingVehicles(true)
    const result = await getVehiclesForBascula()
    if (result.success && result.data) {
      setVehicles(result.data)
    } else {
      toast.error(result.error || "Error al cargar vehículos")
    }
    setIsLoadingVehicles(false)
  }

  const handleOpenDialog = (item: LoadOrder | VehicleData, type: "orden" | "placa") => {
    if (type === "orden") {
      const order = item as LoadOrder
      setSelectedOrder(order)
      setSelectedVehicle(null)
      setFormData({
        horaInicio: order.pesajeinicial || "",
        horaFin: order.pesajefinal || "",
        pesoNetoBascula: order.pesovascula?.toString() || "",
        numeroTiquete: order.tiquetebascula || "",
      })
    } else {
      const vehicle = item as VehicleData
      setSelectedVehicle(vehicle)
      setSelectedOrder(null)
      setFormData({
        horaInicio: vehicle.horapesoinicial || "",
        horaFin: "",
        pesoNetoBascula: "",
        numeroTiquete: "",
      })
    }
    setPesoNetoError("")
    setIsDialogOpen(true)
  }

  const handleRegistrarInicio = async () => {
    const horaFormateada = await getColombiaTime()
    setFormData((prev) => ({ ...prev, horaInicio: horaFormateada }))
    toast.success("Hora de inicio registrada")
  }

  const handleRegistrarFin = async () => {
    if (!formData.horaInicio) {
      toast.error("Debe registrar la hora de inicio primero")
      return
    }
    const horaFormateada = await getColombiaTime()
    setFormData((prev) => ({ ...prev, horaFin: horaFormateada }))
    toast.success("Hora de fin registrada")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (selectedOrder && formData.pesoNetoBascula) {
      const pesoNeto = Number.parseFloat(formData.pesoNetoBascula)
      if (pesoNeto > 40) {
        setPesoNetoError("Por favor revisar la cantidad ingresada, asegúrese de ingresar el punto o la coma.")
        toast.error("Por favor revisar la cantidad ingresada, asegúrese de ingresar el punto o la coma.")
        return
      }
    }

    if (selectedOrder) {
      setIsSubmitting(true)

      try {
        const result = await updateBasculaData({
          orderId: selectedOrder.id,
          pesajeinicial: formData.horaInicio || undefined,
          pesajefinal: formData.horaFin || undefined,
          pesovascula: formData.pesoNetoBascula ? Number.parseFloat(formData.pesoNetoBascula) : undefined,
          tiquetebascula: formData.numeroTiquete || undefined,
        })

        if (!result.success) {
          toast.error(result.message || "Error al guardar el registro")
          return
        }

        toast.success("Registro de báscula guardado exitosamente")
        await loadLoadOrders()
        setIsDialogOpen(false)
        resetForm()
      } catch (error) {
        console.error("Error saving bascula record:", error)
        toast.error("Error al guardar el registro")
      } finally {
        setIsSubmitting(false)
      }
    } else if (selectedVehicle) {
      if (!formData.horaInicio) {
        toast.error("Debe registrar la hora de inicio")
        return
      }

      setIsSubmitting(true)

      try {
        const result = await updateVehicleWeighingTime(selectedVehicle.id, formData.horaInicio)

        if (!result.success) {
          toast.error(result.error || "Error al guardar el registro")
          return
        }

        toast.success("Hora de pesaje inicial registrada exitosamente")
        await loadVehicles()
        setIsDialogOpen(false)
        resetForm()
      } catch (error) {
        console.error("Error saving vehicle weighing time:", error)
        toast.error("Error al guardar el registro")
      } finally {
        setIsSubmitting(false)
      }
    }
  }

  const resetForm = () => {
    setFormData({
      horaInicio: "",
      horaFin: "",
      pesoNetoBascula: "",
      numeroTiquete: "",
    })
    setSelectedOrder(null)
    setSelectedVehicle(null)
    setPesoNetoError("")
  }

  return (
    <div className="w-full">
      <div className="bg-primary rounded-t-lg p-3 md:p-4 flex items-center gap-2">
        <Scale className="h-5 w-5 text-white" />
        <div>
          <h1 className="text-base md:text-lg font-bold text-white">Registro de Báscula</h1>
          <p className="text-[10px] md:text-xs text-white/90 mt-0.5">Complete los datos del pesaje del vehículo</p>
        </div>
      </div>

      <Card className="border-t-0 rounded-t-none p-4 md:p-6">
        <div className="space-y-4">
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Tipo de Registro</Label>
            <RadioGroup
              value={registrationType}
              onValueChange={(value: "orden" | "placa") => {
                setRegistrationType(value)
              }}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="orden" id="tipo-orden" />
                <Label htmlFor="tipo-orden" className="text-sm font-normal cursor-pointer">
                  Con orden de cargue
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="placa" id="tipo-placa" />
                <Label htmlFor="tipo-placa" className="text-sm font-normal cursor-pointer">
                  Solo placa (sin orden)
                </Label>
              </div>
            </RadioGroup>
          </div>

          {registrationType === "orden" && (
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-max">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="text-left p-2 font-semibold whitespace-nowrap">Orden de Cargue</th>
                      <th className="text-left p-2 font-semibold whitespace-nowrap">Placa</th>
                      <th className="text-left p-2 font-semibold whitespace-nowrap">Fecha Orden</th>
                      <th className="text-left p-2 font-semibold whitespace-nowrap">Fecha Cargue</th>
                      <th className="text-left p-2 font-semibold whitespace-nowrap">Peso Orden</th>
                      <th className="text-left p-2 font-semibold whitespace-nowrap">Hora Inicio</th>
                      <th className="text-left p-2 font-semibold whitespace-nowrap">Hora Fin</th>
                      <th className="text-left p-2 font-semibold whitespace-nowrap">Peso (kg)</th>
                      <th className="text-left p-2 font-semibold whitespace-nowrap">Tiquete</th>
                      <th className="text-center p-2 font-semibold whitespace-nowrap">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoadingOrders ? (
                      <tr>
                        <td colSpan={10} className="text-center p-4 text-gray-500">
                          Cargando órdenes...
                        </td>
                      </tr>
                    ) : loadOrders.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="text-center p-4 text-gray-500">
                          No hay órdenes disponibles
                        </td>
                      </tr>
                    ) : (
                      loadOrders.map((order) => (
                        <tr key={order.id} className="border-t hover:bg-gray-50">
                          <td className="p-2 whitespace-nowrap">{order.ordendecargue}</td>
                          <td className="p-2 whitespace-nowrap">{order.placa}</td>
                          <td className="p-2 whitespace-nowrap">{order.fechaorden || "-"}</td>
                          <td className="p-2 whitespace-nowrap">{order.fechacargue || "-"}</td>
                          <td className="p-2 whitespace-nowrap">{order.pesoorden || "-"}</td>
                          <td className="p-2 whitespace-nowrap">{order.pesajeinicial || "-"}</td>
                          <td className="p-2 whitespace-nowrap">{order.pesajefinal || "-"}</td>
                          <td className="p-2 whitespace-nowrap">{order.pesovascula || "-"}</td>
                          <td className="p-2 whitespace-nowrap">{order.tiquetebascula || "-"}</td>
                          <td className="p-2 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenDetails(order)}
                                className="text-xs px-2 py-1 h-7"
                                title="Ver detalle de productos y lotes"
                                disabled={!order.ordendecargue}
                              >
                                <Eye className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleOpenDialog(order, "orden")}
                                className="bg-primary hover:bg-primary/90 text-xs px-2 py-1 h-7"
                              >
                                <Edit className="h-3 w-3 mr-1" />
                                Registrar
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {registrationType === "placa" && (
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-max">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="text-left p-2 font-semibold whitespace-nowrap">Placa</th>
                      <th className="text-left p-2 font-semibold whitespace-nowrap">Conductor</th>
                      <th className="text-left p-2 font-semibold whitespace-nowrap">Hora Inicio</th>
                      <th className="text-center p-2 font-semibold whitespace-nowrap">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoadingVehicles ? (
                      <tr>
                        <td colSpan={4} className="text-center p-4 text-gray-500">
                          Cargando vehículos...
                        </td>
                      </tr>
                    ) : vehicles.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center p-4 text-gray-500">
                          No hay vehículos disponibles
                        </td>
                      </tr>
                    ) : (
                      vehicles.map((vehicle) => (
                        <tr key={vehicle.id} className="border-t hover:bg-gray-50">
                          <td className="p-2 whitespace-nowrap">{vehicle.placa}</td>
                          <td className="p-2 whitespace-nowrap">{vehicle.nombreconductor}</td>
                          <td className="p-2 whitespace-nowrap">{vehicle.horapesoinicial || "-"}</td>
                          <td className="p-2 text-center whitespace-nowrap">
                            <Button
                              size="sm"
                              onClick={() => handleOpenDialog(vehicle, "placa")}
                              className="bg-primary hover:bg-primary/90 text-xs px-2 py-1 h-7"
                            >
                              <Edit className="h-3 w-3 mr-1" />
                              Registrar
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
        </div>
      </Card>

      <BasculaOrderDetailsDialog
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        ordendecargue={detailsOrden}
        placa={detailsPlaca}
      />

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Registro de Báscula</DialogTitle>
            <DialogDescription>
              {selectedOrder
                ? `Orden: ${selectedOrder.ordendecargue} - Placa: ${selectedOrder.placa}`
                : selectedVehicle
                  ? `Placa: ${selectedVehicle.placa} - Conductor: ${selectedVehicle.nombreconductor}`
                  : ""}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="hora_inicio" className="text-sm">
                  Hora Inicio <span className="text-destructive">*</span>
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="hora_inicio"
                    type="text"
                    className="text-sm h-9 flex-1 bg-gray-50"
                    value={formData.horaInicio}
                    readOnly
                    placeholder="HH:MM:SS"
                  />
                  <Button
                    type="button"
                    onClick={handleRegistrarInicio}
                    className="bg-green-600 hover:bg-green-700 text-white h-9 px-3"
                  >
                    <Clock className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {selectedOrder && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="hora_fin" className="text-sm">
                      Hora Fin
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="hora_fin"
                        type="text"
                        className="text-sm h-9 flex-1 bg-gray-50"
                        value={formData.horaFin}
                        readOnly
                        placeholder="HH:MM:SS"
                      />
                      <Button
                        type="button"
                        onClick={handleRegistrarFin}
                        disabled={!formData.horaInicio}
                        className="bg-green-600 hover:bg-green-700 text-white h-9 px-3 disabled:bg-gray-400"
                      >
                        <Clock className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="peso_neto_bascula" className="text-sm">
                      Peso Neto Báscula (ton)
                    </Label>
                    <Input
                      id="peso_neto_bascula"
                      type="number"
                      step="0.01"
                      max="100"
                      placeholder="Ej: 34.5"
                      className="text-sm h-9"
                      value={formData.pesoNetoBascula}
                      onChange={(e) => {
                        const value = e.target.value
                        setFormData((prev) => ({ ...prev, pesoNetoBascula: value }))
                        const pesoNeto = Number.parseFloat(value)
                        if (value && pesoNeto > 40) {
                          setPesoNetoError(
                            "Por favor revisar la cantidad ingresada, asegúrese de ingresar el punto o la coma.",
                          )
                        } else {
                          setPesoNetoError("")
                        }
                      }}
                    />
                    {pesoNetoError && <p className="text-xs text-red-600 mt-1">{pesoNetoError}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="numero_tiquete" className="text-sm">
                      Número de Tiquete
                    </Label>
                    <Input
                      id="numero_tiquete"
                      placeholder="Número del tiquete"
                      className="text-sm h-9"
                      value={formData.numeroTiquete}
                      onChange={(e) => setFormData((prev) => ({ ...prev, numeroTiquete: e.target.value }))}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-primary/90">
                {isSubmitting ? "Guardando..." : "Guardar Registro"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
