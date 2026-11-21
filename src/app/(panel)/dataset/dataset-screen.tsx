"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ApiError, api, downloadDataset, fetchCaptureBlob, subscribeCaptures } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { formatDateTime, labelText } from "@/lib/format"
import { captureCameraLabel } from "@/lib/framesize"
import type { Capture, Device, Page } from "@/lib/types"

const PAGE_SIZE = 12

function captureMatches(capture: Capture, deviceId: string, from: string, to: string) {
  if (deviceId && capture.device_id !== deviceId) return false
  const taken = new Date(capture.captured_at).getTime()
  if (from && taken < new Date(from).getTime()) return false
  if (to && taken > new Date(`${to}T23:59:59`).getTime()) return false
  return true
}

function placeCapture(page: Page<Capture>, capture: Capture): Page<Capture> {
  if (page.items.some((item) => item.id === capture.id)) return page
  const total = page.total + 1
  if (page.offset > 0) return { ...page, total }
  const items = [...page.items, capture].sort(
    (a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime(),
  )
  return { ...page, total, items: items.slice(0, page.limit) }
}

export default function DatasetPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [deviceId, setDeviceId] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [offset, setOffset] = useState(0)
  const [unseen, setUnseen] = useState(0)
  const [selected, setSelected] = useState<Capture | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const filters = useRef({ deviceId, from, to, offset })
  filters.current = { deviceId, from, to, offset }
  const waiting = useRef<Capture[]>([])
  const seen = useRef(new Set<string>())
  const devices = useQuery({ queryKey: ["devices"], queryFn: () => api.devices() })
  const captures = useQuery({
    queryKey: ["captures", deviceId, from, to, offset],
    queryFn: () =>
      api.captures({
        device_id: deviceId || undefined,
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
        limit: PAGE_SIZE,
        offset,
      }),
  })
  const readOnly = Boolean(user?.is_demo)

  useEffect(() => {
    if (offset === 0) setUnseen(0)
  }, [offset])

  useEffect(() => {
    waiting.current = []
    setPicked([])
  }, [deviceId, from, to])

  useEffect(() => {
    if (!captures.data || waiting.current.length === 0) return
    const queued = waiting.current
    waiting.current = []
    for (const capture of queued) {
      queryClient.setQueriesData<Page<Capture>>({ queryKey: ["captures", deviceId, from, to] }, (page) =>
        page ? placeCapture(page, capture) : page,
      )
    }
  }, [captures.data, deviceId, from, to, queryClient])

  useEffect(() => {
    const controller = new AbortController()
    void subscribeCaptures((capture) => {
      const current = filters.current
      if (!captureMatches(capture, current.deviceId, current.from, current.to)) return
      if (seen.current.has(capture.id)) return
      seen.current.add(capture.id)
      const prefix = ["captures", current.deviceId, current.from, current.to] as const
      const loaded = queryClient.getQueryData<Page<Capture>>([...prefix, current.offset])
      if (!loaded) waiting.current = [capture, ...waiting.current.filter((item) => item.id !== capture.id)].slice(0, 24)
      queryClient.setQueriesData<Page<Capture>>({ queryKey: prefix }, (page) => (page ? placeCapture(page, capture) : page))
      if (current.offset > 0) setUnseen((count) => count + 1)
    }, controller.signal)
    return () => controller.abort()
  }, [queryClient])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dataset</h1>
          <p className="text-sm text-muted-foreground">Fotos recebidas na fase de coleta. As excluídas ficam fora da exportação.</p>
        </div>
        <Button type="button" onClick={() => setExportOpen(true)}>
          Exportar Dataset
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <div className="space-y-2 md:col-span-2">
          <Label>Armadilha</Label>
          <Select
            items={{
              all: "Todas",
              ...Object.fromEntries((devices.data?.items ?? []).map((device) => [device.id, device.name])),
            }}
            value={deviceId || "all"}
            onValueChange={(value) => {
              setDeviceId(!value || value === "all" ? "" : value)
              setOffset(0)
              setUnseen(0)
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {devices.data?.items.map((device) => (
                <SelectItem key={device.id} value={device.id}>
                  {device.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="from">De</Label>
          <Input id="from" type="date" value={from} onChange={(event) => { setFrom(event.target.value); setOffset(0); setUnseen(0) }} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="to">Até</Label>
          <Input id="to" type="date" value={to} onChange={(event) => { setTo(event.target.value); setOffset(0); setUnseen(0) }} />
        </div>
      </div>

      {unseen > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-2">
          <p className="text-sm">{unseen === 1 ? "1 foto nova" : `${unseen} fotos novas`}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setOffset(0)}>
            Ver no início
          </Button>
        </div>
      ) : null}
      {!readOnly && captures.data && captures.data.items.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={captures.data.items.every((capture) => picked.includes(capture.id))}
              onChange={(event) => {
                const ids = captures.data?.items.map((capture) => capture.id) ?? []
                setPicked((current) =>
                  event.target.checked ? [...new Set([...current, ...ids])] : current.filter((id) => !ids.includes(id)),
                )
              }}
            />
            Selecionar esta página
          </label>
          {picked.length > 0 ? (
            <>
              <span className="text-sm text-muted-foreground">
                {picked.length === 1 ? "1 selecionada" : `${picked.length} selecionadas`}
              </span>
              <Button type="button" variant="destructive" size="sm" onClick={() => setPendingDelete(picked)}>
                Excluir selecionadas
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
      {captures.isLoading ? <p className="text-sm text-muted-foreground">Carregando fotos...</p> : null}
      {captures.data && captures.data.items.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-14 text-center text-sm text-muted-foreground">
          Nenhuma imagem neste filtro.
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {captures.data?.items.map((capture) => {
          const resolution = captureCameraLabel(capture)
          const checked = picked.includes(capture.id)
          return (
            <Card key={capture.id} className={`relative overflow-hidden py-0 ${checked ? "ring-2 ring-primary" : ""}`}>
              {readOnly ? null : (
                <label className="absolute top-2 left-2 z-10 grid size-7 place-items-center rounded-md bg-background/90 shadow-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={checked}
                    aria-label={`Selecionar foto de ${capture.device_name}`}
                    onChange={() =>
                      setPicked((current) =>
                        current.includes(capture.id) ? current.filter((id) => id !== capture.id) : [...current, capture.id],
                      )
                    }
                  />
                </label>
              )}
              <button type="button" className="block w-full text-left" onClick={() => setSelected(capture)}>
                <CaptureImage id={capture.id} alt={capture.device_name} className="aspect-square w-full object-cover" />
                <CardContent className="space-y-1 py-3">
                  <p className="truncate text-sm font-medium">{capture.device_name}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(capture.captured_at)}</p>
                  {resolution ? <p className="text-xs text-muted-foreground">{resolution}</p> : null}
                  <p className="text-xs">{labelText(capture.label)}</p>
                </CardContent>
              </button>
            </Card>
          )
        })}
      </div>
      {captures.data && captures.data.total > captures.data.limit ? (
        <div className="flex items-center justify-between">
          <Button variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
            Anterior
          </Button>
          <p className="text-sm text-muted-foreground">
            {offset + 1}–{Math.min(offset + PAGE_SIZE, captures.data.total)} de {captures.data.total}
          </p>
          <Button variant="outline" disabled={offset + PAGE_SIZE >= captures.data.total} onClick={() => setOffset(offset + PAGE_SIZE)}>
            Próxima
          </Button>
        </div>
      ) : null}

      {selected ? (
        <CaptureDialog
          capture={selected}
          readOnly={readOnly}
          onClose={() => setSelected(null)}
          onDelete={() => setPendingDelete([selected.id])}
        />
      ) : null}
      {pendingDelete ? (
        <DiscardDialog
          ids={pendingDelete}
          onClose={() => setPendingDelete(null)}
          onDone={() => {
            const removed = new Set(pendingDelete)
            setPicked((current) => current.filter((id) => !removed.has(id)))
            if (selected && removed.has(selected.id)) setSelected(null)
            setPendingDelete(null)
          }}
        />
      ) : null}
      {exportOpen ? (
        <ExportDialog
          devices={devices.data?.items ?? []}
          initialDeviceId={deviceId}
          initialFrom={from}
          initialTo={to}
          onClose={() => setExportOpen(false)}
        />
      ) : null}
    </div>
  )
}

function ExportDialog({
  devices,
  initialDeviceId,
  initialFrom,
  initialTo,
  onClose,
}: {
  devices: Device[]
  initialDeviceId: string
  initialFrom: string
  initialTo: string
  onClose: () => void
}) {
  const [deviceId, setDeviceId] = useState(initialDeviceId)
  const [from, setFrom] = useState(initialFrom)
  const [to, setTo] = useState(initialTo)
  const [pending, setPending] = useState(false)

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-card p-4" onClick={(event) => event.stopPropagation()}>
        <h2 className="text-lg font-semibold">Exportar Dataset</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          O zip traz só as fotos válidas do período. Imagens excluídas ficam de fora. O nome usa o código da armadilha e a data, e o manifest.csv traz rótulo, resolução e qualidade JPEG.
        </p>
        <form
          className="mt-4 space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!from || !to) {
              toast.error("Informe o início e o fim do período")
              return
            }
            if (from > to) {
              toast.error("O fim do período é anterior ao início")
              return
            }
            setPending(true)
            downloadDataset(
              {
                device_id: deviceId || undefined,
                from: new Date(from).toISOString(),
                to: new Date(`${to}T23:59:59`).toISOString(),
              },
              `dataset_${from}_${to}.zip`,
            )
              .then(() => {
                toast.success("Download iniciado")
                onClose()
              })
              .catch((error) => toast.error(error instanceof ApiError ? error.message : "Não foi possível exportar"))
              .finally(() => setPending(false))
          }}
        >
          <div className="space-y-2">
            <Label>Armadilha</Label>
            <Select
              items={{
                all: "Todas",
                ...Object.fromEntries(devices.map((device) => [device.id, device.name])),
              }}
              value={deviceId || "all"}
              onValueChange={(value) => setDeviceId(!value || value === "all" ? "" : value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {devices.map((device) => (
                  <SelectItem key={device.id} value={device.id}>
                    {device.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="export-from">De</Label>
              <Input id="export-from" type="date" value={from} required onChange={(event) => setFrom(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="export-to">Até</Label>
              <Input id="export-to" type="date" value={to} required onChange={(event) => setTo(event.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Exportando..." : "Baixar zip"}
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

function CaptureImage({ id, alt, className }: { id: string; alt: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    let url: string | null = null
    fetchCaptureBlob(id)
      .then((objectUrl) => {
        url = objectUrl
        if (active) setSrc(objectUrl)
        else URL.revokeObjectURL(objectUrl)
      })
      .catch(() => setSrc(null))
    return () => {
      active = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [id])
  if (!src) return <div className={`bg-muted ${className ?? ""}`} />
  return <img src={src} alt={alt} className={className} />
}

function DiscardDialog({ ids, onClose, onDone }: { ids: string[]; onClose: () => void; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [pending, setPending] = useState(false)
  const count = ids.length

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-card p-4" onClick={(event) => event.stopPropagation()}>
        <h2 className="text-lg font-semibold">{count === 1 ? "Excluir imagem" : `Excluir ${count} imagens`}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {count === 1 ? "Ela sai" : "Elas saem"} do dataset e da exportação. O arquivo continua guardado e a exclusão pode ser desfeita.
        </p>
        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => {
              setPending(true)
              api
                .discardCaptures(ids)
                .then(() => {
                  toast.success(count === 1 ? "Imagem excluída do dataset" : `${count} imagens excluídas do dataset`, {
                    action: {
                      label: "Desfazer",
                      onClick: () => {
                        void api
                          .restoreCaptures(ids)
                          .then(() => {
                            queryClient.invalidateQueries({ queryKey: ["captures"] })
                            queryClient.invalidateQueries({ queryKey: ["devices"] })
                            toast.success(count === 1 ? "Imagem restaurada" : "Imagens restauradas")
                          })
                          .catch((error) => toast.error(error instanceof ApiError ? error.message : "Não foi possível restaurar"))
                      },
                    },
                  })
                  queryClient.invalidateQueries({ queryKey: ["captures"] })
                  queryClient.invalidateQueries({ queryKey: ["devices"] })
                  onDone()
                })
                .catch((error) => {
                  toast.error(error instanceof ApiError ? error.message : "Não foi possível excluir")
                  setPending(false)
                })
            }}
          >
            {pending ? "Excluindo..." : "Excluir"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  )
}

function CaptureDialog({
  capture,
  readOnly,
  onClose,
  onDelete,
}: {
  capture: Capture
  readOnly: boolean
  onClose: () => void
  onDelete: () => void
}) {
  const queryClient = useQueryClient()
  const [manualCount, setManualCount] = useState(capture.manual_count === null ? "" : String(capture.manual_count))
  const [label, setLabel] = useState(capture.label)
  const [notes, setNotes] = useState(capture.notes ?? "")
  const mutation = useMutation({
    mutationFn: () =>
      api.updateCapture(capture.id, {
        manual_count: manualCount === "" ? null : Number(manualCount),
        label,
        notes,
      }),
    onSuccess: () => {
      toast.success("Rótulo salvo")
      queryClient.invalidateQueries({ queryKey: ["captures"] })
      onClose()
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Não foi possível salvar"),
  })

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="grid max-h-[90vh] w-full max-w-4xl gap-4 overflow-auto rounded-xl bg-card p-4 md:grid-cols-[1.4fr_1fr]" onClick={(event) => event.stopPropagation()}>
        <CaptureImage id={capture.id} alt={capture.device_name} className="max-h-[70vh] w-full rounded-lg object-contain bg-muted" />
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!readOnly) mutation.mutate()
          }}
        >
          <div>
            <h2 className="text-lg font-semibold">{capture.device_name}</h2>
            <p className="text-sm text-muted-foreground">{formatDateTime(capture.captured_at)}</p>
            {captureCameraLabel(capture) ? <p className="text-sm text-muted-foreground">{captureCameraLabel(capture)}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="count">Contagem manual</Label>
            <Input id="count" type="number" min={0} value={manualCount} disabled={readOnly} onChange={(event) => setManualCount(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Rótulo</Label>
            <Select
              items={{ unlabeled: "Sem rótulo", with_pest: "Com praga", without_pest: "Sem praga" }}
              value={label}
              onValueChange={(value) => value && setLabel(value as Capture["label"])}
              disabled={readOnly}
            >
              <SelectTrigger className="w-full" disabled={readOnly}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unlabeled">Sem rótulo</SelectItem>
                <SelectItem value="with_pest">Com praga</SelectItem>
                <SelectItem value="without_pest">Sem praga</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" value={notes} disabled={readOnly} onChange={(event) => setNotes(event.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={readOnly || mutation.isPending}>
              Salvar
            </Button>
            {readOnly ? null : (
              <Button type="button" variant="destructive" onClick={onDelete}>
                Excluir
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
