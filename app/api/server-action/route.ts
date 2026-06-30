export async function POST(request: Request) {
  "use server"

  try {
    const { action, args } = await request.json()

    console.log("[v0] Server Action Proxy:", action)

    // Import all action modules
    const actionsModule = await import(`@/lib/${action.module}`)

    // Get the function
    const actionFunction = actionsModule[action.function]

    if (!actionFunction || typeof actionFunction !== "function") {
      return Response.json({ error: `Action ${action.function} not found in ${action.module}` }, { status: 404 })
    }

    // Execute the function with provided arguments
    const result = await actionFunction(...(args || []))

    return Response.json({ success: true, data: result })
  } catch (error) {
    console.error("[v0] Server Action Proxy error:", error)
    return Response.json(
      {
        error: "Server action failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
