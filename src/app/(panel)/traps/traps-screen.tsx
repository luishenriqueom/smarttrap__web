"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ApiError, api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { timeAgo } from "@/lib/format"

export default function TrapsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando...</p>}>
      <TrapsScreen />
    </Suspense>
  )
}

function TrapsScreen() {
  const { user } = useAuth()
  const params = useSearchParams()
  const ownerFromQuery = params.get("owner") ?? ""
  const [ownerFilter, setOwnerFilter] = useState(ownerFromQuery)
  const [editing, setEditing] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const devices = useQuery({
    queryKey: ["devices", ownerFilter],
    queryFn: () => api.devices(ownerFilter || undefined),
  })
  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api.users(),
    enabled: user?.role === "superadmin",
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Armadilhas</h1>
          <p className="text-sm text-muted-foreground">Cadastre o código que o equipamento envia antes de ir a campo.</p>
        </div>
        {user && !user.is_demo ? (
          <Button onClick={() => { setEditing(null); setOpen(true) }}>Nova armadilha</Button>
        ) : null}
      </div>

      {user?.role === "superadmin" ? (
        <div className="max-w-xs space-y-2">
          <Label>Filtrar por dono</Label>
          <Select
            items={{
              all: "Todos",
              ...Object.fromEntries((users.data ?? []).map((item) => [item.id, item.name])),
            }}
            value={ownerFilter || "all"}
            onValueChange={(value) => setOwnerFilter(!value || value === "all" ? "" : value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {users.data?.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {open && user && !user.is_demo ? (
        <TrapForm
          users={users.data ?? []}
          superadmin={user.role === "superadmin"}
          initial={devices.data?.items.find((item) => item.id === editing) ?? null}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false)
            queryClient.invalidateQueries({ queryKey: ["devices"] })
          }}
        />
      ) : null}

      <Card>
        <CardContent className="px-0">
          {devices.isLoading ? <p className="px-4 text-sm text-muted-foreground">Carregando...</p> : null}
          {devices.data && devices.data.items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma armadilha nesta lista.</p>
          ) : null}
          {devices.data && devices.data.items.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Local</TableHead>
                  {user?.role === "superadmin" ? <TableHead>Dono</TableHead> : null}
                  <TableHead>Estado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.data.items.map((device) => (
                  <TableRow key={device.id}>
                    <TableCell className="font-medium">{device.name}</TableCell>
                    <TableCell className="font-mono text-xs">{device.code}</TableCell>
                    <TableCell>{device.location || "—"}</TableCell>
                    {user?.role === "superadmin" ? <TableCell>{device.owner_name}</TableCell> : null}
                    <TableCell>
                      <Badge variant={device.is_online ? "default" : "outline"}>{device.is_online ? "Online" : timeAgo(device.last_seen_at)}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/traps/${device.id}`} />}>
                        Abrir
                      </Button>
                      {user && !user.is_demo ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditing(device.id)
                            setOpen(true)
                          }}
                        >
                          Editar
                        </Button>
                      ) : null}
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

function TrapForm({
  initial,
  superadmin,
  users,
  onClose,
  onSaved,
}: {
  initial: { id: string; name: string; code: string; location: string | null; owner_id: string } | null
  superadmin: boolean
  users: { id: string; name: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(initial?.name ?? "")
  const [code, setCode] = useState(initial?.code ?? "")
  const [location, setLocation] = useState(initial?.location ?? "")
  const [ownerId, setOwnerId] = useState(initial?.owner_id ?? "")
  const mutation = useMutation({
    mutationFn: async () => {
      if (initial) {
        return api.updateDevice(initial.id, {
          name,
          location,
          ...(superadmin && ownerId ? { owner_id: ownerId } : {}),
        })
      }
      return api.createDevice({
        name,
        code,
        location,
        ...(superadmin && ownerId ? { owner_id: ownerId } : {}),
      })
    },
    onSuccess: () => {
      toast.success(initial ? "Armadilha atualizada" : "Armadilha cadastrada")
      onSaved()
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Não foi possível salvar"),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{initial ? "Editar armadilha" : "Nova armadilha"}</CardTitle>
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
            <Label htmlFor="trap-name">Nome</Label>
            <Input id="trap-name" value={name} onChange={(event) => setName(event.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="trap-code">Código</Label>
            <Input id="trap-code" value={code} onChange={(event) => setCode(event.target.value)} required disabled={Boolean(initial)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="trap-location">Local</Label>
            <Input id="trap-location" value={location} onChange={(event) => setLocation(event.target.value)} />
          </div>
          {superadmin ? (
            <div className="space-y-2">
              <Label>Dono</Label>
              <Select
                items={Object.fromEntries(users.map((item) => [item.id, item.name]))}
                value={ownerId || null}
                onValueChange={(value) => setOwnerId(value ?? "")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
