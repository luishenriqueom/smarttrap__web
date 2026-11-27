"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ApiError, api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { formatDateTime } from "@/lib/format"
import type { TrainedModel } from "@/lib/types"

export default function ModelsScreen() {
  const { user } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const requested = searchParams.get("train") === "1"
  const query = searchParams.toString()
  const [manual, setManual] = useState(false)
  const [closedQuery, setClosedQuery] = useState<string | null>(null)
  const open = Boolean(user && !user.is_demo) && (manual || (requested && closedQuery !== query))
  const [pendingDelete, setPendingDelete] = useState<TrainedModel | null>(null)
  const models = useQuery({
    queryKey: ["models"],
    queryFn: () => api.models(),
    refetchInterval: (query) => (query.state.data?.some((model) => model.status === "training") ? 4000 : false),
  })
  const readOnly = !user || user.is_demo
  const training = models.data?.some((model) => model.status === "training") ?? false
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteModel(id),
    onSuccess: () => {
      toast.success("Modelo excluído")
      setPendingDelete(null)
      queryClient.invalidateQueries({ queryKey: ["models"] })
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Não foi possível excluir"),
  })

  function closeTrain() {
    setManual(false)
    setClosedQuery(query)
    if (requested) router.replace("/models")
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Modelos</h1>
          <p className="text-sm text-muted-foreground">Últimos treinos e o arquivo que a armadilha pode baixar.</p>
        </div>
        {readOnly ? null : (
          <Button
            type="button"
            onClick={() => setManual(true)}
          >
            Novo treinamento
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="px-0">
          {models.isLoading ? <p className="px-4 text-sm text-muted-foreground">Carregando...</p> : null}
          {models.isError ? <p className="px-4 text-sm text-destructive">Não foi possível listar os modelos.</p> : null}
          {models.data && models.data.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum modelo treinado.</p>
          ) : null}
          {models.data && models.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Classes</TableHead>
                  <TableHead>Erro</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {models.data.map((model) => (
                  <TableRow key={model.id}>
                    <TableCell>{formatDateTime(model.created_at)}</TableCell>
                    <TableCell>
                      <Badge variant={model.status === "failed" ? "outline" : "secondary"}>{modelStatus(model.status)}</Badge>
                    </TableCell>
                    <TableCell>{periodText(model)}</TableCell>
                    <TableCell>{model.class_labels.join(", ") || "—"}</TableCell>
                    <TableCell className="max-w-xs truncate" title={model.error ?? undefined}>
                      {model.error || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {readOnly || model.status === "training" ? null : (
                        <Button variant="ghost" size="sm" onClick={() => setPendingDelete(model)}>
                          Excluir
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>

      {open ? <TrainDialog busy={training} onClose={closeTrain} /> : null}
      {pendingDelete ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setPendingDelete(null)}>
          <div className="w-full max-w-md rounded-xl bg-card p-4" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-lg font-semibold">Excluir modelo</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              O arquivo sai da lista. Se uma armadilha ainda usa este modelo, troque o modelo dela antes.
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

function TrainDialog({ busy, onClose }: { busy: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const train = useMutation({
    mutationFn: () => {
      if (from && to && to < from) throw new ApiError(422, "O fim do período é anterior ao início")
      return api.trainModel({
        images_from: from ? new Date(from).toISOString() : null,
        images_to: to ? new Date(`${to}T23:59:59`).toISOString() : null,
      })
    },
    onSuccess: () => {
      toast.success("Treino iniciado")
      queryClient.invalidateQueries({ queryKey: ["models"] })
      onClose()
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Não foi possível treinar"),
  })

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-card p-4" onClick={(event) => event.stopPropagation()}>
        <h2 className="text-lg font-semibold">Novo treinamento</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha o período das imagens. Em branco, o treino usa todas as fotos marcadas.
        </p>
        <form
          className="mt-4 space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            train.mutate()
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="train-from">De</Label>
              <Input id="train-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="train-to">Até</Label>
              <Input id="train-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </div>
          </div>
          {busy ? <p className="text-sm">Já existe um treino em andamento.</p> : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || train.isPending}>
              {train.isPending ? "Iniciando..." : "Iniciar treino"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function modelStatus(status: string) {
  if (status === "training") return "treinando"
  if (status === "ready") return "pronto"
  if (status === "failed") return "falhou"
  return "aguardando"
}

function periodText(model: TrainedModel) {
  if (!model.images_from && !model.images_to) return "Todas as imagens"
  if (model.images_from && model.images_to) return `${formatDateTime(model.images_from)} – ${formatDateTime(model.images_to)}`
  if (model.images_from) return `A partir de ${formatDateTime(model.images_from)}`
  return `Até ${formatDateTime(model.images_to)}`
}
