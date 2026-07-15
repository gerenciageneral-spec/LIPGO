"use client"

// Submódulo Financiera > Tarifas: CRUD por pestañas de las 4 tablas de tarifas
// (operación, personal, turnos, facturación por turnos) + la tabla base legacy.
// Cada pestaña reutiliza GenericCrudTable con su definición de configModules.

import { GenericCrudTable } from "./generic-crud-table"
import { configModules } from "@/lib/config-definitions"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const TABS = [
  { v: "operacion", l: "Operación", key: "tarifas_operacion" },
  { v: "personal", l: "Personal", key: "tarifas_personal" },
  { v: "turnos", l: "Turnos", key: "tarifas_turnos" },
  { v: "facturacion", l: "Facturación por turnos", key: "tarifas_facturacion_turnos" },
  { v: "general", l: "Tarifas base", key: "tarifas" },
] as const

export function Tarifas() {
  return (
    <div className="space-y-4">
      <Tabs defaultValue="operacion" className="w-full">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1">
          {TABS.map((t) => (
            <TabsTrigger key={t.v} value={t.v}>
              {t.l}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t.v} value={t.v} className="mt-4">
            <GenericCrudTable moduleDef={configModules[t.key]} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
