import { PortalLoginForm } from "@/components/portal/portal-login-form"

export const metadata = {
  title: "Iniciar sesion | Portal de Trabajadores",
  description:
    "Accede con tu documento de identidad para consultar certificados, anticipos, permisos y nomina.",
}

export default function PortalLoginPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <PortalLoginForm />
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Si tienes problemas para ingresar, comunicate con el area de Talento Humano.
        </p>
      </div>
    </main>
  )
}
