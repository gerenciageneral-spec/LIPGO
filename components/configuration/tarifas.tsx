"use client"

// Submódulo Financiera > Tarifas: CRUD por pestañas de las 4 tablas de tarifas
// (+ la tabla base legacy). Cada pestaña muestra:
//  - un texto de IMPACTO (qué cálculos/vistas dependen de esa tarifa), y
//  - un botón para DUPLICAR tarifas a otro periodo (ver duplicar-tarifas-dialog).

import { useState } from "react"
import { GenericCrudTable } from "./generic-crud-table"
import { configModules } from "@/lib/config-definitions"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Copy, Info } from "lucide-react"
import { DuplicarTarifasDialog } from "./duplicar-tarifas-dialog"
import { CuadroMandoNomina } from "./cuadro-mando-nomina"

type TabDef = {
  v: string
  l: string
  key: string
  table?: string // tabla real (para duplicar); ausente = no duplicable
  desc?: React.ReactNode // texto de impacto
  custom?: boolean // render propio (no GenericCrudTable) y sin duplicar
}

const TABS: TabDef[] = [
  {
    v: "parametros",
    l: "Cuadro de mando",
    key: "",
    custom: true,
    desc: (
      <>
        <strong>Parámetros legales de nómina</strong> (SMLV, auxilio, días, jornada y % de recargos) por año.
        De aquí se derivan los recargos/horas extra por persona: <code>HOD = (salario + auxilio) ÷ (días × jornada)</code>.
        Es la <strong>fuente de las tarifas de turno</strong> (reemplaza la edición manual).
      </>
    ),
  },
  {
    v: "operacion",
    l: "Operación",
    key: "tarifas_operacion",
    table: "tarifasoperacion",
    desc: (
      <>
        Tarifa de <strong>facturación al cliente por tonelada</strong>. Alimenta la vista{" "}
        <code>facturacion</code>: <code>valor_a_facturar = tarifa × toneladas</code> (cruza por empresa +
        operación, y según producto / empresa que factura / transportadora). <strong>Impacta los ingresos</strong>{" "}
        del Estado de Resultados y de Facturación Proyectos.
      </>
    ),
  },
  {
    v: "personal",
    l: "Personal",
    key: "tarifas_personal",
    table: "tarifaspersonal",
    desc: (
      <>
        Tarifa de <strong>pago (destajo) a los auxiliares</strong> por operación y tonelada. Alimenta{" "}
        <code>pagonomina</code> (<code>pago_produccion</code>) y <code>toneladasauxiliarespago</code> (
        <code>total_pago_dia</code>): el peso de cada cargue se reparte entre los auxiliares y se multiplica por
        esta tarifa. <strong>Impacta el costo de nómina</strong> de los auxiliares.
      </>
    ),
  },
  {
    v: "turnos",
    l: "Turnos",
    key: "tarifas_turnos",
    table: "tarifasturnos",
    desc: (
      <>
        Tarifa de <strong>nómina de turnos de especialidad</strong>: <code>base</code> (valor del turno) y los
        recargos por hora (<code>hed/hedf/hen/hef/hn</code>). Alimenta <code>pagonomina</code>:{" "}
        <code>base_turno + Σ(horas × recargo)</code>. <strong>Impacta la liquidación de nómina</strong> del
        personal de especialidad.
      </>
    ),
  },
  {
    v: "facturacion",
    l: "Facturación por turnos",
    key: "tarifas_facturacion_turnos",
    table: "tarifasfacturacionturnos",
    desc: (
      <>
        Tarifa de <strong>facturación y costo de turnos de especialidad</strong>. Alimenta{" "}
        <code>facturacionturnos</code>: <code>facturacion_total = tarifaturno + tarifahoraextra × (hed − 0.66)</code>;{" "}
        <code>costo_total = costoturno + costohoraextra × (hed − 0.66)</code>;{" "}
        <code>utilidad = facturación − costo</code>. <strong>Impacta ingresos y utilidad</strong> por turnos.
      </>
    ),
  },
  {
    v: "general",
    l: "Tarifas base",
    key: "tarifas",
    desc: <>Catálogo general de tarifas (tabla <code>tarifas</code>). Uso legacy.</>,
  },
]

export function Tarifas() {
  const [dup, setDup] = useState<{ table: string; titulo: string } | null>(null)

  return (
    <div className="space-y-4">
      <Tabs defaultValue="parametros" className="w-full">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1">
          {TABS.map((t) => (
            <TabsTrigger key={t.v} value={t.v}>
              {t.l}
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map((t) => (
          <TabsContent key={t.v} value={t.v} className="mt-4 space-y-3">
            {/* Texto de impacto */}
            {t.desc && (
              <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="leading-relaxed">{t.desc}</p>
              </div>
            )}

            {/* Acción de duplicar */}
            {t.table && (
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => setDup({ table: t.table!, titulo: t.l })}>
                  <Copy className="mr-2 h-4 w-4" /> Duplicar a otro periodo
                </Button>
              </div>
            )}

            {t.custom ? <CuadroMandoNomina /> : <GenericCrudTable moduleDef={configModules[t.key]} />}
          </TabsContent>
        ))}
      </Tabs>

      {dup && (
        <DuplicarTarifasDialog
          open={!!dup}
          onOpenChange={(o) => {
            if (!o) setDup(null)
          }}
          tableName={dup.table}
          titulo={dup.titulo}
        />
      )}
    </div>
  )
}
