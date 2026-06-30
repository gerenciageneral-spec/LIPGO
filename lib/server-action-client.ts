"use client"

/**
 * Client-side wrapper to call server actions through API route
 * This solves the 500 errors in production when calling server actions directly
 */
export async function callServerAction<T = any>(module: string, functionName: string, ...args: any[]): Promise<T> {
  try {
    const response = await fetch("/api/server-action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: { module, function: functionName },
        args,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.message || `Server action failed: ${response.statusText}`)
    }

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error || "Server action returned failure")
    }

    return result.data as T
  } catch (error) {
    console.error(`[v0] Error calling server action ${module}.${functionName}:`, error)
    throw error
  }
}

export const actions = {
  config: (fn: string, ...args: any[]) => callServerAction("config-actions", fn, ...args),
  inventory: (fn: string, ...args: any[]) => callServerAction("inventory-actions", fn, ...args),
  orders: (fn: string, ...args: any[]) => callServerAction("orders-actions", fn, ...args),
  general: (fn: string, ...args: any[]) => callServerAction("actions", fn, ...args),
  qr: (fn: string, ...args: any[]) => callServerAction("qr-actions", fn, ...args),
  picking: (fn: string, ...args: any[]) => callServerAction("picking-actions", fn, ...args),
  batch: (fn: string, ...args: any[]) => callServerAction("batch-actions", fn, ...args),
  transfer: (fn: string, ...args: any[]) => callServerAction("transfer-actions", fn, ...args),
  vehicle: (fn: string, ...args: any[]) => callServerAction("vehicle-actions", fn, ...args),
  mrp: (fn: string, ...args: any[]) => callServerAction("mrp-actions", fn, ...args),
}
