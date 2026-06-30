import IsoEvidenceDashboard from "@/components/iso9001/iso-evidence-dashboard"

export const metadata = {
  title: "Centro de Evidencia ISO 9001",
  description:
    "Cumplimiento ISO 9001 verificado con datos reales de LIPgo por cada requisito de la norma.",
}

export default function Iso9001Page() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6">
      <IsoEvidenceDashboard />
    </main>
  )
}
