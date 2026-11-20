"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ApiError, api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { roleLabel } from "@/lib/format"
import type { User } from "@/lib/types"

export default function UsersPage() {
  const { user } = useAuth()
  const [editing, setEditing] = useState<User | null>(null)
  const [creating, setCreating] = useState(false)
  const users = useQuery({ queryKey: ["users"], queryFn: () => api.users(), enabled: user?.role === "superadmin" })

  if (user && user.role !== "superadmin") {
    return <p className="text-sm text-muted-foreground">Apenas o SuperAdmin gerencia usuários.</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
          <p className="text-sm text-muted-foreground">Contas comuns e a conta de demonstração.</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null)
            setCreating(true)
          }}
        >
          Novo usuário
        </Button>
      </div>

      {creating || editing ? (
        <UserForm
          initial={editing}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
        />
      ) : null}

      <Card>
        <CardContent className="px-0">
          {users.isLoading ? <p className="px-4 text-sm text-muted-foreground">Carregando...</p> : null}
          {users.isError ? <p className="px-4 text-sm text-destructive">Não foi possível listar os usuários.</p> : null}
          {users.data ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.data.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>{item.email}</TableCell>
                    <TableCell>
                      <Badge variant={item.is_demo ? "secondary" : "outline"}>{roleLabel(item.role, item.is_demo)}</Badge>
                    </TableCell>
                    <TableCell>{item.is_active ? "Ativo" : "Inativo"}</TableCell>
                    <TableCell className="text-right">
                      {item.is_demo ? (
                        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/traps?owner=${item.id}`} />}>
                          Armadilhas
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setCreating(false)
                          setEditing(item)
                        }}
                      >
                        Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

function UserForm({ initial, onClose }: { initial: User | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(initial?.name ?? "")
  const [email, setEmail] = useState(initial?.email ?? "")
  const [password, setPassword] = useState("")
  const [active, setActive] = useState(initial?.is_active ?? true)
  const mutation = useMutation({
    mutationFn: () => {
      if (!initial) return api.createUser({ name, email, password })
      return api.updateUser(initial.id, {
        name,
        email,
        ...(password ? { password } : {}),
        is_active: active,
      })
    },
    onSuccess: () => {
      toast.success(initial ? "Usuário atualizado" : "Usuário criado")
      queryClient.invalidateQueries({ queryKey: ["users"] })
      onClose()
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Não foi possível salvar"),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{initial ? "Editar usuário" : "Novo usuário"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault()
            mutation.mutate()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="user-name">Nome</Label>
            <Input id="user-name" value={name} onChange={(event) => setName(event.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="user-email">E-mail</Label>
            <Input id="user-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="user-password">{initial ? "Nova senha" : "Senha inicial"}</Label>
            <Input
              id="user-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required={!initial}
              minLength={6}
              placeholder={initial ? "Deixe em branco para manter" : ""}
            />
          </div>
          {initial ? (
            <label className="flex items-center gap-2 text-sm md:mt-7">
              <input type="checkbox" checked={active} disabled={initial.is_demo} onChange={(event) => setActive(event.target.checked)} />
              Conta ativa
            </label>
          ) : null}
          <div className="flex gap-2 md:col-span-2">
            <Button type="submit" disabled={mutation.isPending}>
              Salvar
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
