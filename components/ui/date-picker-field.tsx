"use client"

import { format, parseISO } from "date-fns"
import { es } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

/**
 * Reemplazo genérico de `<input type="date">` -- el calendario nativo del
 * navegador se cerraba al navegar entre meses con las flechas (reportado por
 * el usuario 4-sep-2026). El Popover NO controla `open`/`onOpenChange`: Radix
 * maneja ese estado internamente, así que los clicks de navegación dentro del
 * Calendar (react-day-picker) nunca lo cierran.
 *
 * `value`/`onChange` siguen siendo string `"YYYY-MM-DD"` (o `""` vacío) para
 * poder reemplazar un `<input type="date">` sin tocar el resto de la lógica
 * del formulario que ya filtra/guarda por ese string.
 */
export function DatePickerField({
  value,
  onChange,
  placeholder = "Seleccionar fecha",
  className,
  disabled,
  id,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  id?: string
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn("w-full justify-start text-left font-normal", className)}
        >
          {value ? format(parseISO(value), "dd/MM/yyyy") : <span className="text-muted-foreground">{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value ? parseISO(value) : undefined}
          onSelect={(date) => onChange(date ? format(date, "yyyy-MM-dd") : "")}
          locale={es}
        />
      </PopoverContent>
    </Popover>
  )
}
