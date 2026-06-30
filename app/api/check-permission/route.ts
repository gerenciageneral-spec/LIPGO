import { type NextRequest, NextResponse } from "next/server"
import { checkModulePermission } from "@/lib/permissions-actions"

export async function POST(request: NextRequest) {
  try {
    const { moduleName } = await request.json()

    if (!moduleName) {
      return NextResponse.json({ error: "Module name is required" }, { status: 400 })
    }

    const hasPermission = await checkModulePermission(moduleName)

    return NextResponse.json({ hasPermission })
  } catch (error) {
    console.error("[v0] Error checking permission:", error)
    return NextResponse.json({ error: "Failed to check permission", hasPermission: true }, { status: 200 })
  }
}
