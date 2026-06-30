"use server"

/**
 * Utility functions for handling dates with Colombia timezone (America/Bogota, UTC-5)
 */

/**
 * Get current date and time in Colombia timezone
 */
export async function getColombiaDateTime(): Promise<Date> {
  const now = new Date()
  // Convert to Colombia timezone (America/Bogota, UTC-5)
  const colombiaTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Bogota" }))
  return colombiaTime
}

/**
 * Get current date in Colombia timezone formatted as YYYY-MM-DD
 */
export async function getColombiaDate(): Promise<string> {
  const colombiaTime = await getColombiaDateTime()
  return colombiaTime.toISOString().split("T")[0]
}

/**
 * Get current time in Colombia timezone formatted as HH:MM:SS
 */
export async function getColombiaTime(): Promise<string> {
  const colombiaTime = await getColombiaDateTime()
  return colombiaTime.toTimeString().split(" ")[0]
}

/**
 * Get current datetime in Colombia timezone as ISO string
 */
export async function getColombiaISO(): Promise<string> {
  const colombiaTime = await getColombiaDateTime()
  return colombiaTime.toISOString()
}

/**
 * Format a date for display in Colombia format
 */
export async function formatColombiaDate(date: Date | string): Promise<string> {
  const dateObj = typeof date === "string" ? new Date(date) : date
  return dateObj.toLocaleDateString("es-CO", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
}

/**
 * Format a datetime for display in Colombia format
 */
export async function formatColombiaDateTime(date: Date | string): Promise<string> {
  const dateObj = typeof date === "string" ? new Date(date) : date
  return dateObj.toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
}

/**
 * Parse a date string from an input field (YYYY-MM-DD) and return it in the same format
 * This avoids timezone conversion issues that can shift the date by one day
 */
export async function parseDateInput(dateString: string): Promise<string> {
  if (!dateString) return ""
  // Return the date string as-is if it's already in YYYY-MM-DD format
  // This prevents timezone conversion issues
  return dateString
}

/**
 * Convert a date input to Colombia timezone without shifting the day
 */
export async function dateInputToColombiaDate(dateString: string): Promise<string> {
  if (!dateString) return ""

  // The input is already in YYYY-MM-DD format which is what we need
  return dateString
}
