"use client"

import { Crosshair } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { ApiError } from "@/lib/api"
import { useAuth } from "@/lib/auth"

export default function LoginPage() {
  const { user, ready, login, loginDemo } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState<"login" | "demo" | null>(null)

  useEffect(() => {
    if (ready && user) router.replace("/")
  }, [ready, user, router])

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError("")
    setPending("login")
    try {
      await login(email, password)
      router.replace("/")
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Não foi possível entrar")
    } finally {
      setPending(null)
    }
  }

  async function onDemo() {
    setError("")
    setPending("demo")
    try {
      await loginDemo()
      router.replace("/")
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "A demonstração está indisponível")
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Crosshair className="size-5" />
          </div>
          <CardTitle className="text-xl">Smart Trap</CardTitle>
          <CardDescription>Acompanhe as armadilhas e o dataset de campo.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button className="h-10 w-full" type="submit" disabled={pending !== null}>
              {pending === "login" ? "Entrando..." : "Entrar"}
            </Button>
          </form>
          <div className="my-5 flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">ou</span>
            <Separator className="flex-1" />
          </div>
          <Button className="h-10 w-full" type="button" variant="outline" onClick={onDemo} disabled={pending !== null}>
            {pending === "demo" ? "Abrindo..." : "Demonstração"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
