"use client"

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { setModoCargaOrden } from "@/lib/picking-actions"

interface ModoCargaSelectorProps {
  orderId: number
  modoCarga?: "Estibado" | "Arrume" | null
  disabled?: boolean
  onChanged: (v: "Estibado" | "Arrume") => void
}

/**
 * Elección obligatoria por orden de Cargue en ID1/ID2: Estibado (estibas
 * normales) o Arrume (arrume negro/desarrume, casi el doble de auxiliares
 * por vehículo). La garantía real está en el servidor
 * (app/api/upload-picking-photos, mode=finalize) — este control es la forma
 * de elegir, no la única barrera. No afecta el tiempo de la propia orden
 * (validado con datos reales), es solo trazabilidad/aviso de contención de
 * personal para otros muelles.
 */
export function ModoCargaSelector({ orderId, modoCarga, disabled, onChanged }: ModoCargaSelectorProps) {
  const { toast } = useToast()

  const handleChange = async (v: "Estibado" | "Arrume") => {
    const r = await setModoCargaOrden(orderId, v)
    if (r.success) {
      onChanged(v)
    } else {
      toast({ title: "Error", description: r.message, variant: "destructive" })
    }
  }

  return (
    <div className="flex items-center gap-2">
      <RadioGroup
        value={modoCarga ?? undefined}
        onValueChange={handleChange}
        disabled={disabled}
        className="flex flex-row gap-3"
      >
        <div className="flex items-center space-x-1.5">
          <RadioGroupItem value="Estibado" id={`modo-estibado-${orderId}`} />
          <Label htmlFor={`modo-estibado-${orderId}`} className="cursor-pointer text-xs font-normal">
            Estibado
          </Label>
        </div>
        <div className="flex items-center space-x-1.5">
          <RadioGroupItem value="Arrume" id={`modo-arrume-${orderId}`} />
          <Label htmlFor={`modo-arrume-${orderId}`} className="cursor-pointer text-xs font-normal">
            Arrume
          </Label>
        </div>
      </RadioGroup>
      {!modoCarga && !disabled && (
        <span className="text-[10px] font-semibold text-rose-600">⚠ Elige Estibado o Arrume</span>
      )}
    </div>
  )
}
