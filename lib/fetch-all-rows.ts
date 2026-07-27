// Supabase / PostgREST topan CADA respuesta en 1000 filas (aunque se pida más).
// Para leer tablas grandes se pagina con .range() hasta agotar. `makeQuery(from,to)`
// debe construir la consulta con un `.order()` ESTABLE (idealmente por una columna
// única como id) + `.range(from, to)`, para que las páginas no se solapen ni salten.
//
// Uso indistinto en server actions, route handlers y componentes cliente (es una
// función pura; funciona con cualquier cliente de Supabase).
export async function fetchAllRows<T = any>(
  makeQuery: (from: number, to: number) => any,
): Promise<T[]> {
  const PAGE = 1000
  let offset = 0
  const all: T[] = []
  for (;;) {
    const { data, error } = await makeQuery(offset, offset + PAGE - 1)
    if (error) throw new Error(error.message)
    const batch = data ?? []
    all.push(...batch)
    if (batch.length < PAGE) break
    offset += PAGE
    if (offset > 500000) break // salvaguarda anti-bucle (nunca esperado en la práctica)
  }
  return all
}
