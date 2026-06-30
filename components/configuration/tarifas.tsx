"use client"

import { GenericCrudTable } from "./generic-crud-table"
import { configModules } from "@/lib/config-definitions"

export function Tarifas() {
  return <GenericCrudTable moduleDef={configModules.tarifas} />
}
