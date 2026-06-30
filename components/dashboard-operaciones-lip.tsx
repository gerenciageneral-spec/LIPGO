"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { LayoutDashboard, CalendarRange } from "lucide-react"
import { LipDailyOperations } from "@/components/lip-daily-operations"
import { LipHistoricalOperations } from "@/components/lip-historical-operations"

export function DashboardOperacionesLip() {
  const [activeTab, setActiveTab] = useState<"daily" | "monthly">("daily")

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex items-center gap-2 border-b pb-3">
        <Button
          variant={activeTab === "daily" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("daily")}
          className="gap-2"
        >
          <LayoutDashboard className="h-4 w-4" />
          Operacion del Dia
        </Button>
        <Button
          variant={activeTab === "monthly" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("monthly")}
          className="gap-2"
        >
          <CalendarRange className="h-4 w-4" />
          Historico Mensual
        </Button>
      </div>

      {/* Tab Content */}
      {activeTab === "daily" && <LipDailyOperations />}
      {activeTab === "monthly" && <LipHistoricalOperations />}
    </div>
  )
}
