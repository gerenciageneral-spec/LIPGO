"use client"

// Helpers de UI compartidos por los formularios de captura del modulo SST.
// Archivo nuevo, no modifica sst-utils.ts. Usa los tokens de marca existentes.

import type React from "react"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SST_TOKENS } from "@/components/sst/sst-utils"

export function Kpi({ t, v, c }: { t: string; v: React.ReactNode; c?: string }) {
  return (
    <Card className="p-4">
      <div className="text-2xl font-bold" style={{ color: c ?? SST_TOKENS.navy }}>
        {v}
      </div>
      <div className="text-xs text-muted-foreground">{t}</div>
    </Card>
  )
}

export function Sec({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold" style={{ color: SST_TOKENS.navy }}>
        {n}
      </h3>
      {children}
    </section>
  )
}

export function Row3({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 md:grid-cols-3">{children}</div>
}

export function Field({ l, children }: { l: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs" style={{ color: SST_TOKENS.ink }}>
        {l}
      </label>
      {children}
    </div>
  )
}

export function Sel({
  v,
  on,
  o,
  small,
}: {
  v: string
  on: (v: string) => void
  o: [string, string][]
  small?: boolean
}) {
  return (
    <Select value={v} onValueChange={on}>
      <SelectTrigger className={small ? "h-8" : ""}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {o.map(([val, lab]) => (
          <SelectItem key={val} value={val}>
            {lab}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
