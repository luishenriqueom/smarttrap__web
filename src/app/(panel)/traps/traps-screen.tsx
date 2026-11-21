"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { frameSizeLabel } from "@/lib/framesize"
import { timeAgo } from "@/lib/format"
import { TrapForm } from "./trap-form"

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
          <Button onClick={() => setOpen(true)}>Nova armadilha</Button>
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
          initial={null}
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
                  <TableHead>Resolução</TableHead>
                  <TableHead>JPEG</TableHead>
                  <TableHead>Sono</TableHead>
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
                    <TableCell>{frameSizeLabel(device.frame_size)}</TableCell>
                    <TableCell>{device.jpeg_quality}</TableCell>
                    <TableCell>{Math.round(device.sleep_seconds / 60)} min</TableCell>
                    {user?.role === "superadmin" ? <TableCell>{device.owner_name}</TableCell> : null}
                    <TableCell>
                      <Badge variant={device.is_online ? "default" : "outline"}>{device.is_online ? "Online" : timeAgo(device.last_seen_at)}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/traps/${device.id}`} />}>
                        Abrir
                      </Button>
                      {user && !user.is_demo ? (
                        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/traps/${device.id}/edit`} />}>
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
