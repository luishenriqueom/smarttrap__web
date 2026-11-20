"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { Shell } from "@/components/shell"
import { useAuth } from "@/lib/auth"

export function PanelGate({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (ready && !user) router.replace("/login")
  }, [ready, user, router])

  if (!ready || !user) {
    return <div className="grid min-h-dvh place-items-center text-sm text-muted-foreground">Carregando...</div>
  }

  return <Shell user={user}>{children}</Shell>
}
