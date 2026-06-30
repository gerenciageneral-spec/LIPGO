import AsistenteIA from "@/components/asistente-ia"

/**
 * Pagina dedicada al Asistente IA, full-screen.
 * Usa h-dvh para ocupar exactamente el viewport visible (incluyendo en
 * mobile cuando se contraen las barras del navegador).
 */
export const metadata = {
  title: "Asistente IA",
  description:
    "Chat con el asistente virtual. Pregunta lo que necesites en lenguaje natural.",
}

export default function AsistenteIAPage() {
  return (
    <main className="h-dvh w-full">
      <AsistenteIA />
    </main>
  )
}
