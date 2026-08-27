"use client"

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { setTipoPagoOrden } from "@/lib/picking-actions"

interface TipoPagoSelectorProps {
  orderId: number
  tipoPago?: "global" | "individual" | null
  disabled?: boolean
  onChanged: (v: "global" | "individual") => void
}

/**
 * Elección obligatoria por orden: Pago Global (el sistema calcula y
 * sobrescribe `auxiliares` al cerrar, con todo el personal elegible
 * presente ese día) o Pago Individual (respeta tal cual el personal
 * asignado por vehículo). La garantía real está en el servidor
 * (app/api/upload-picking-photos, mode=finalize) — este control es la
 * forma de elegir, no la única barrera.
 */
export function TipoPagoSelector({ orderId, tipoPago, disabled, onChanged }: TipoPagoSelectorProps) {
  const { toast } = useToast()

  const handleChange = async (v: "global" | "individual") => {
    const r = await setTipoPagoOrden(orderId, v)
    if (r.success) {
      onChanged(v)
    } else {
      toast({ title: "Error", description: r.message, variant: "destructive" })
    }
  }

  return (
    <div className="flex items-center gap-2">
      <RadioGroup
        value={tipoPago ?? undefined}
        onValueChange={handleChange}
        disabled={disabled}
        className="flex flex-row gap-3"
      >
        <div className="flex items-center space-x-1.5">
          <RadioGroupItem value="global" id={`pago-global-${orderId}`} />
          <Label htmlFor={`pago-global-${orderId}`} className="cursor-pointer text-xs font-normal">
            Pago Global
          </Label>
        </div>
        <div className="flex items-center space-x-1.5">
          <RadioGroupItem value="individual" id={`pago-individual-${orderId}`} />
          <Label htmlFor={`pago-individual-${orderId}`} className="cursor-pointer text-xs font-normal">
            Pago Individual
          </Label>
        </div>
      </RadioGroup>
      {!tipoPago && !disabled && (
        <span className="text-[10px] font-semibold text-rose-600">⚠ Elige tipo de pago</span>
      )}
    </div>
  )
}
