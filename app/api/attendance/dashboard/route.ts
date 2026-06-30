import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const empresaId = searchParams.get("empresaId")
    const mode = searchParams.get("mode") || "daily" // daily | monthly
    const month = searchParams.get("month") // YYYY-MM format for monthly mode
    const dateParam = searchParams.get("date") // YYYY-MM-DD for daily mode (optional)

    if (!empresaId) {
      return NextResponse.json({ error: "empresaId is required" }, { status: 400 })
    }

    const supabaseAdmin = await getSupabaseAdmin()

    if (mode === "daily") {
      // Use provided date or default to today in Colombia timezone
      const colombiaDate = dateParam || new Date()
        .toLocaleString("en-CA", {
          timeZone: "America/Bogota",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        })
        .split(",")[0]

      // Calculate previous day
      const currentDateObj = new Date(colombiaDate + "T12:00:00")
      currentDateObj.setDate(currentDateObj.getDate() - 1)
      const prevDate = currentDateObj.toISOString().split("T")[0]

      // Fetch current and previous day in parallel
      const [currentRes, prevRes, last7Res] = await Promise.all([
        supabaseAdmin
          .from("registroasistencia")
          .select("id, fecha, nombre, identificacion, puesto, asistencia, hed, hedf, hen, hef, hn, especialidad")
          .eq("idempresa", empresaId)
          .eq("fecha", colombiaDate),
        supabaseAdmin
          .from("registroasistencia")
          .select("id, fecha, nombre, identificacion, puesto, asistencia, hed, hedf, hen, hef, hn, especialidad")
          .eq("idempresa", empresaId)
          .eq("fecha", prevDate),
        // Last 7 days for sparkline mini-trend
        (() => {
          const d7 = new Date(colombiaDate + "T12:00:00")
          d7.setDate(d7.getDate() - 6)
          const from7 = d7.toISOString().split("T")[0]
          return supabaseAdmin
            .from("registroasistencia")
            .select("fecha, puesto, asistencia")
            .eq("idempresa", empresaId)
            .gte("fecha", from7)
            .lte("fecha", colombiaDate)
            .order("fecha", { ascending: true })
        })(),
      ])

      if (currentRes.error) {
        console.error("[v0] Dashboard daily error:", currentRes.error)
        return NextResponse.json({ error: currentRes.error.message }, { status: 500 })
      }

      return NextResponse.json({
        data: currentRes.data || [],
        prevData: prevRes.data || [],
        last7Data: last7Res.data || [],
        date: colombiaDate,
        prevDate,
      })
    }

    if (mode === "monthly") {
      // If no month provided, use current month
      const now = new Date()
      const targetMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
      const [year, mon] = targetMonth.split("-").map(Number)
      const startDate = `${year}-${String(mon).padStart(2, "0")}-01`
      const lastDay = new Date(year, mon, 0).getDate()
      const endDate = `${year}-${String(mon).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`

      const { data, error } = await supabaseAdmin
        .from("registroasistencia")
        .select("id, fecha, nombre, identificacion, puesto, asistencia, hed, hedf, hen, hef, hn, especialidad")
        .eq("idempresa", empresaId)
        .gte("fecha", startDate)
        .lte("fecha", endDate)
        .order("fecha", { ascending: true })

      if (error) {
        console.error("[v0] Dashboard monthly error:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ data: data || [], startDate, endDate, month: targetMonth })
    }

    return NextResponse.json({ error: "Invalid mode" }, { status: 400 })
  } catch (error) {
    console.error("[v0] Dashboard API error:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
