"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ApiError, api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import type { Species } from "@/lib/types"

export default function SpeciesScreen() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Species | null>(null)
  const [creating, setCreating] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Species | null>(null)
  const species = useQuery({ queryKey: ["species"], queryFn: () => api.species() })
  const readOnly = !user || user.is_demo
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteSpecies(id),
    onSuccess: () => {
      toast.success("Espécie excluída")
      setPendingDelete(null)
      queryClient.invalidateQueries({ queryKey: ["species"] })
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Não foi possível excluir"),
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Espécies</h1>
          <p className="text-sm text-muted-foreground">Nomes usados nas marcações do dataset e no treino.</p>
        </div>
        {readOnly ? null : (
          <Button
            onClick={() => {
              setEditing(null)
              setCreating(true)
            }}
          >
            Nova espécie
          </Button>
        )}
      </div>

      {creating || editing ? (
        <SpeciesForm
          initial={editing}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
        />
      ) : null}

      <Card>
        <CardContent className="px-0">
          {species.isLoading ? <p className="px-4 text-sm text-muted-foreground">Carregando...</p> : null}
          {species.isError ? <p className="px-4 text-sm text-destructive">Não foi possível listar as espécies.</p> : null}
          {species.data && species.data.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma espécie cadastrada.</p>
          ) : null}
          {species.data && species.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {species.data.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-right">
                      {readOnly ? null : (
                        <>
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
                          <Button variant="ghost" size="sm" onClick={() => setPendingDelete(item)}>
                            Excluir
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>

      {pendingDelete ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setPendingDelete(null)}>
          <div className="w-full max-w-md rounded-xl bg-card p-4" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-lg font-semibold">Excluir {pendingDelete.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Só é possível excluir uma espécie que ainda não foi usada em marcações.
            </p>
            <div className="mt-4 flex gap-2">
              <Button type="button" variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate(pendingDelete.id)}>
                {remove.isPending ? "Excluindo..." : "Excluir"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setPendingDelete(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function SpeciesForm({ initial, onClose }: { initial: Species | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(initial?.name ?? "")
  const mutation = useMutation({
    mutationFn: () => (initial ? api.updateSpecies(initial.id, name.trim()) : api.createSpecies(name.trim())),
    onSuccess: () => {
      toast.success(initial ? "Espécie atualizada" : "Espécie cadastrada")
      queryClient.invalidateQueries({ queryKey: ["species"] })
      onClose()
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Não foi possível salvar"),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{initial ? "Editar espécie" : "Nova espécie"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (name.trim()) mutation.mutate()
          }}
        >
          <div className="min-w-64 flex-1 space-y-2">
            <Label htmlFor="species-name">Nome</Label>
            <Input id="species-name" value={name} onChange={(event) => setName(event.target.value)} required />
          </div>
          <Button type="submit" disabled={mutation.isPending || name.trim() === ""}>
            Salvar
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
