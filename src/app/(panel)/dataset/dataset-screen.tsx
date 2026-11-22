"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { MarkedPhoto } from "@/components/marked-photo"
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
  const [importOpen, setImportOpen] = useState(false)
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
        <div className="flex gap-2">
          {readOnly ? null : <TrainButton />}
          {readOnly ? null : (
            <Button type="button" variant="outline" onClick={() => setImportOpen(true)}>
              Importar fotos
            </Button>
          )}
          <Button type="button" onClick={() => setExportOpen(true)}>
            Exportar Dataset
          </Button>
        </div>
      </div>
      {readOnly ? null : <SpeciesBar />}
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
      {importOpen ? (
        <ImportDialog
          devices={devices.data?.items ?? []}
          initialDeviceId={deviceId}
          onClose={() => setImportOpen(false)}
          onImported={(importedDeviceId) => {
            setDeviceId(importedDeviceId)
            setOffset(0)
            setUnseen(0)
            queryClient.invalidateQueries({ queryKey: ["captures"] })
            queryClient.invalidateQueries({ queryKey: ["devices"] })
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

function jpegFiles(list: FileList | File[] | null) {
  return [...(list ?? [])]
    .filter((file) => file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
}

function readDropEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return new Promise((resolve) => {
      ;(entry as FileSystemFileEntry).file((file) => resolve([file]))
    })
  }
  if (!entry.isDirectory) return Promise.resolve([])
  const reader = (entry as FileSystemDirectoryEntry).createReader()
  return new Promise((resolve) => {
    const files: File[] = []
    const readBatch = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(files)
          return
        }
        void Promise.all(batch.map((child) => readDropEntry(child))).then((nested) => {
          files.push(...nested.flat())
          readBatch()
        })
      })
    }
    readBatch()
  })
}

async function filesFromDrop(transfer: DataTransfer) {
  const entries = [...transfer.items].map((item) => item.webkitGetAsEntry?.() ?? null).filter((entry): entry is FileSystemEntry => entry !== null)
  if (entries.length === 0) return jpegFiles(transfer.files)
  const nested = await Promise.all(entries.map((entry) => readDropEntry(entry)))
  return jpegFiles(nested.flat())
}

function ImportDialog({
  devices,
  initialDeviceId,
  onClose,
  onImported,
}: {
  devices: Device[]
  initialDeviceId: string
  onClose: () => void
  onImported: (deviceId: string) => void
}) {
  const [deviceId, setDeviceId] = useState(initialDeviceId)
  const [files, setFiles] = useState<File[]>([])
  const [done, setDone] = useState(0)
  const [pending, setPending] = useState(false)
  const [over, setOver] = useState(false)
  const photos = useRef<HTMLInputElement>(null)
  const folder = useRef<HTMLInputElement>(null)

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={pending ? undefined : onClose}>
      <div className="w-full max-w-md rounded-xl bg-card p-4" onClick={(event) => event.stopPropagation()}>
        <h2 className="text-lg font-semibold">Importar fotos</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          As fotos entram no dataset da armadilha escolhida, com o nome do arquivo nas notas e a data do arquivo. JPEG de até 5 MB.
        </p>
        <form
          className="mt-4 space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!deviceId) {
              toast.error("Escolha a armadilha")
              return
            }
            if (files.length === 0) {
              toast.error("Escolha ao menos uma foto JPEG")
              return
            }
            setPending(true)
            setDone(0)
            const batchSize = 12
            const run = async () => {
              let imported = 0
              let skipped = 0
              for (let start = 0; start < files.length; start += batchSize) {
                const slice = files.slice(start, start + batchSize)
                const body = new FormData()
                body.set("device_id", deviceId)
                for (const file of slice) {
                  body.append("images", file)
                  body.append("captured_at", new Date(file.lastModified || Date.now()).toISOString())
                }
                const result = await api.importCaptures(body)
                imported += result.imported
                skipped += result.skipped
                setDone(Math.min(files.length, start + slice.length))
              }
              return { imported, skipped }
            }
            run()
              .then(({ imported, skipped }) => {
                toast.success(skipped > 0 ? `${imported} fotos importadas, ${skipped} ignoradas` : `${imported} fotos importadas`)
                onImported(deviceId)
                onClose()
              })
              .catch((error) => {
                toast.error(error instanceof ApiError ? error.message : "Não foi possível importar")
                onImported(deviceId)
                setPending(false)
              })
          }}
        >
          <div className="space-y-2">
            <Label>Armadilha</Label>
            <Select
              items={Object.fromEntries(devices.map((device) => [device.id, device.name]))}
              value={deviceId || null}
              onValueChange={(value) => value && setDeviceId(value)}
              disabled={pending || devices.length === 0}
            >
              <SelectTrigger className="w-full" disabled={pending}>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {devices.map((device) => (
                  <SelectItem key={device.id} value={device.id}>
                    {device.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div
            onDragEnter={(event) => {
              event.preventDefault()
              if (!pending) setOver(true)
            }}
            onDragOver={(event) => {
              event.preventDefault()
              if (!pending) setOver(true)
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false)
            }}
            onDrop={(event) => {
              event.preventDefault()
              setOver(false)
              if (pending) return
              void filesFromDrop(event.dataTransfer).then((dropped) => {
                if (dropped.length === 0) {
                  toast.error("Solte fotos JPEG")
                  return
                }
                setFiles(dropped)
              })
            }}
            className={`rounded-lg border border-dashed px-4 py-5 text-center ${over ? "border-primary bg-primary/5" : "border-border"}`}
          >
            <p className="text-sm">{over ? "Solte para adicionar" : "Solte as fotos JPEG aqui"}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={() => photos.current?.click()}>
              Escolher fotos
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => folder.current?.click()}>
              Escolher pasta
            </Button>
            <input
              ref={photos}
              type="file"
              accept="image/jpeg,.jpg,.jpeg"
              multiple
              className="hidden"
              onChange={(event) => {
                setFiles(jpegFiles(event.target.files))
                event.target.value = ""
              }}
            />
            <input
              ref={folder}
              type="file"
              accept="image/jpeg,.jpg,.jpeg"
              multiple
              className="hidden"
              // The folder picker is a browser extension of the file input.
              {...{ webkitdirectory: "", directory: "" }}
              onChange={(event) => {
                setFiles(jpegFiles(event.target.files))
                event.target.value = ""
              }}
            />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {files.length === 0 ? "Nenhuma foto selecionada." : `${files.length} fotos JPEG`}
            {pending ? ` · ${done} de ${files.length}` : ""}
          </p>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending || !deviceId || files.length === 0}>
              {pending ? "Importando..." : "Importar"}
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </form>
      </div>
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

function modelStatus(status: string) {
  if (status === "training") return "treinando"
  if (status === "ready") return "pronto"
  if (status === "failed") return "falhou"
  return "aguardando"
}

function TrainButton() {
  const queryClient = useQueryClient()
  const models = useQuery({
    queryKey: ["models"],
    queryFn: () => api.models(),
    refetchInterval: (query) => (query.state.data?.some((model) => model.status === "training") ? 4000 : false),
  })
  const train = useMutation({
    mutationFn: () => api.trainModel(),
    onSuccess: () => {
      toast.success("Treino iniciado")
      queryClient.invalidateQueries({ queryKey: ["models"] })
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Não foi possível treinar"),
  })
  const latest = models.data?.[0]
  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" disabled={train.isPending || latest?.status === "training"} onClick={() => train.mutate()}>
        {latest?.status === "training" ? "Treinando..." : "Treinar FOMO"}
      </Button>
      {latest ? (
        <span className="text-xs text-muted-foreground">
          {modelStatus(latest.status)}
          {latest.status === "failed" && latest.error ? `: ${latest.error}` : ""}
        </span>
      ) : null}
    </div>
  )
}

function SpeciesBar() {
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const species = useQuery({ queryKey: ["species"], queryFn: () => api.species() })
  const create = useMutation({
    mutationFn: () => api.createSpecies(name.trim()),
    onSuccess: () => {
      setName("")
      queryClient.invalidateQueries({ queryKey: ["species"] })
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Não foi possível cadastrar a espécie"),
  })
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (name.trim()) create.mutate()
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="species-name">Espécie</Label>
        <Input id="species-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome da praga" />
      </div>
      <Button type="submit" variant="outline" disabled={create.isPending || name.trim() === ""}>
        Adicionar
      </Button>
      <p className="pb-2 text-sm text-muted-foreground">{(species.data ?? []).map((item) => item.name).join(", ") || "Nenhuma espécie cadastrada."}</p>
    </form>
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
  const [speciesId, setSpeciesId] = useState("")
  const species = useQuery({ queryKey: ["species"], queryFn: () => api.species() })
  const boxes = useQuery({ queryKey: ["annotations", capture.id], queryFn: () => api.annotations(capture.id) })
  useEffect(() => {
    if (!speciesId && species.data && species.data.length > 0) setSpeciesId(species.data[0].id)
  }, [species.data, speciesId])
  const mark = useMutation({
    mutationFn: (box: { x: number; y: number; width: number; height: number }) =>
      api.createAnnotation(capture.id, { species_id: speciesId, ...box }),
    onSuccess: (created) => {
      setLabel("with_pest")
      queryClient.invalidateQueries({ queryKey: ["annotations", capture.id] })
      queryClient.invalidateQueries({ queryKey: ["captures"] })
      toast.success(`Marcação de ${created.species_name} salva`)
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Não foi possível marcar"),
  })
  const unmark = useMutation({
    mutationFn: (annotationId: string) => api.deleteAnnotation(capture.id, annotationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["annotations", capture.id] })
      queryClient.invalidateQueries({ queryKey: ["captures"] })
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Não foi possível remover"),
  })
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
        <div className="space-y-2">
          <MarkedPhoto
            id={capture.id}
            alt={capture.device_name}
            boxes={boxes.data ?? []}
            editable={!readOnly}
            onAdd={(box) => {
              if (!speciesId) {
                toast.error("Cadastre uma espécie antes de marcar")
                return
              }
              mark.mutate(box)
            }}
            onRemove={(annotationId) => unmark.mutate(annotationId)}
          />
          {readOnly ? (
            <p className="text-xs text-muted-foreground">As caixas mostram as marcações humanas e as detecções da armadilha.</p>
          ) : (
            <p className="text-xs text-muted-foreground">Clique para um quadrado de 32 px. Arraste para desenhar a caixa no tamanho da praga.</p>
          )}
        </div>
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
            <Label>Espécie da próxima marcação</Label>
            <Select
              items={Object.fromEntries((species.data ?? []).map((item) => [item.id, item.name]))}
              value={speciesId || null}
              onValueChange={(value) => value && setSpeciesId(value)}
              disabled={readOnly || (species.data ?? []).length === 0}
            >
              <SelectTrigger className="w-full" disabled={readOnly}>
                <SelectValue placeholder="Nenhuma espécie" />
              </SelectTrigger>
              <SelectContent>
                {(species.data ?? []).map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
