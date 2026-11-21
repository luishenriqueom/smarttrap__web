"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { TrapForm } from "../../trap-form"

export default function EditTrapScreen() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const device = useQuery({ queryKey: ["device", id], queryFn: () => api.device(id), enabled: Boolean(id) })
  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api.users(),
    enabled: user?.role === "superadmin",
  })

  if (!user) return null
  if (user.is_demo) return <p className="text-sm text-muted-foreground">A demonstração não altera armadilhas.</p>
  if (device.isLoading) return <p className="text-sm text-muted-foreground">Carregando...</p>
  if (device.isError || !device.data) return <p className="text-sm text-destructive">Armadilha não encontrada.</p>

  const current = device.data

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="mb-2 px-0" nativeButton={false} render={<Link href={`/traps/${current.id}`} />}>
          Voltar
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Editar {current.name}</h1>
        <p className="mt-1 font-mono text-xs text-muted-foreground">{current.code}</p>
      </div>
      <TrapForm
        initial={current}
        superadmin={user.role === "superadmin"}
        users={users.data ?? []}
        onClose={() => router.push(`/traps/${current.id}`)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["devices"] })
          queryClient.invalidateQueries({ queryKey: ["device", current.id] })
          router.push(`/traps/${current.id}`)
        }}
      />
    </div>
  )
}
