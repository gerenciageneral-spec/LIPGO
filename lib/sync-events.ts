// Sincronización ligera entre componentes que leen/escriben la MISMA tabla.
// Cuando uno muta la tabla, emite un evento del navegador; los demás que muestran
// esa tabla lo escuchan y recargan. Patrón general (sirve para cualquier tabla).

export function tablaChangedEvent(tableName: string): string {
  return `table-changed:${tableName}`
}

export function emitTablaChanged(tableName: string): void {
  if (typeof window !== "undefined" && tableName) {
    window.dispatchEvent(new CustomEvent(tablaChangedEvent(tableName)))
  }
}
