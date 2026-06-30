"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, IdCard, Loader2, LogIn, Lock } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { loginPortalColaborador } from "@/lib/portal-actions"
import { usePortal } from "@/components/portal/portal-provider"

export function PortalLoginForm() {
  const router = useRouter()
  const { toast } = useToast()
  const { login } = usePortal()
  const [identificacion, setIdentificacion] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await loginPortalColaborador(identificacion, password)
      if (!result.success || !result.data) {
        setError(result.error || "No pudimos validar tu identidad.")
        toast({
          title: "Acceso no autorizado",
          description: result.error || "Revisa tu documento e intenta nuevamente.",
          variant: "destructive",
        })
        return
      }
      login(result.data)
      toast({
        title: `Bienvenido, ${result.data.nombre.split(" ")[0]}`,
        description: "Ingreso exitoso al portal.",
      })
      router.push("/portal/dashboard")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md shadow-xl border-slate-200/70">
      <CardHeader className="space-y-2 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <IdCard className="h-7 w-7 text-primary" aria-hidden />
        </div>
        <CardTitle className="text-2xl font-semibold text-balance">Portal de Trabajadores</CardTitle>
        <CardDescription className="text-pretty">
          Ingresa con tu documento de identidad para consultar tus certificados, anticipos, permisos y
          nomina.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="identificacion" className="text-sm font-medium">
              Usuario (Documento de Identidad)
            </Label>
            <Input
              id="identificacion"
              inputMode="numeric"
              autoComplete="username"
              placeholder="Ej. 1020304050"
              value={identificacion}
              onChange={(e) => setIdentificacion(e.target.value)}
              required
              className="h-11 text-base"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password" className="text-sm font-medium flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" aria-hidden />
              Contrasena (Documento de Identidad)
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="Repite tu documento"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-11 text-base"
            />
            <p className="text-xs text-muted-foreground">
              Por ahora tu usuario y contrasena son el mismo numero de documento.
            </p>
          </div>

          <Button type="submit" className="h-11 text-base gap-2" disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogIn className="h-4 w-4" />
            )}
            {loading ? "Validando..." : "Ingresar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
