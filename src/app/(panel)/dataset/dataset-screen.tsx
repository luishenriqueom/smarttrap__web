"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { CaptureDialog, DiscardDialog } from "@/components/capture-dialog"
import { Pagination, usePageParam } from "@/components/pagination"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ApiError, api, downloadDataset, fetchCaptureBlob, subscribeCaptures } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { formatDateTime, labelText } from "@/lib/format"
import { captureCameraLabel } from "@/lib/framesize"
import type { Capture, Device, Page } from "@/lib/types"

const PAGE_SIZE = 12

function captureMatches(capture: Capture, deviceId: string, from: string, to: string, marked: "" | "yes" | "no") {
  if (deviceId && capture.device_id !== deviceId) return false
  const taken = new Date(capture.captured_at).getTime()
  if (from && taken < new Date(from).getTime()) return false
  if (to && taken > new Date(`${to}T23:59:59`).getTime()) return false
  if (marked === "yes" && capture.mark_count < 1) return false
  if (marked === "no" && capture.mark_count > 0) return false
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
  const [marked, setMarked] = useState<"" | "yes" | "no">("")
  const { page, setPage } = usePageParam()
  const offset = (page - 1) * PAGE_SIZE
  const [unseen, setUnseen] = useState(0)
  const [selected, setSelected] = useState<Capture | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const filters = useRef({ deviceId, from, to, marked, offset })
  filters.current = { deviceId, from, to, marked, offset }
  const waiting = useRef<Capture[]>([])
  const seen = useRef(new Set<string>())
  const devices = useQuery({ queryKey: ["devices"], queryFn: () => api.devices() })
  const captures = useQuery({
    queryKey: ["captures", deviceId, from, to, marked, offset],
    queryFn: () =>
      api.captures({
        device_id: deviceId || undefined,
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
        marked: marked === "" ? undefined : marked === "yes",
        limit: PAGE_SIZE,
        offset,
      }),
  })
  const readOnly = Boolean(user?.is_demo)

  useEffect(() => {
    if (offset === 0) setUnseen(0)
  }, [offset])

  useEffect(() => {
    if (!captures.data) return
    const pages = Math.max(1, Math.ceil(captures.data.total / PAGE_SIZE))
    if (page > pages) setPage(pages)
  }, [captures.data, page, setPage])

  useEffect(() => {
    waiting.current = []
    setPicked([])
  }, [deviceId, from, to, marked])

  useEffect(() => {
    if (!captures.data || waiting.current.length === 0) return
    const queued = waiting.current
    waiting.current = []
    for (const capture of queued) {
      queryClient.setQueriesData<Page<Capture>>({ queryKey: ["captures", deviceId, from, to, marked] }, (page) =>
        page ? placeCapture(page, capture) : page,
      )
    }
  }, [captures.data, deviceId, from, to, marked, queryClient])

  useEffect(() => {
    const controller = new AbortController()
    void subscribeCaptures((capture) => {
      const current = filters.current
      if (!captureMatches(capture, current.deviceId, current.from, current.to, current.marked)) return
      if (seen.current.has(capture.id)) return
      seen.current.add(capture.id)
      const prefix = ["captures", current.deviceId, current.from, current.to, current.marked] as const
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
          {readOnly ? null : (
            <Button type="button" variant="outline" nativeButton={false} render={<Link href="/models?train=1" />}>
              Treinar Modelo
            </Button>
          )}
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
      <div className="grid gap-3 md:grid-cols-5">
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
              setPage(1)
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
          <Input id="from" type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); setUnseen(0) }} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="to">Até</Label>
          <Input id="to" type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); setUnseen(0) }} />
        </div>
        <div className="space-y-2">
          <Label>Marcações</Label>
          <Select
            items={{ all: "Todas", yes: "Com marcação", no: "Sem marcação" }}
            value={marked || "all"}
            onValueChange={(value) => {
              setMarked(!value || value === "all" ? "" : value === "no" ? "no" : "yes")
              setPage(1)
              setUnseen(0)
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="yes">Com marcação</SelectItem>
              <SelectItem value="no">Sem marcação</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {unseen > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-2">
          <p className="text-sm">{unseen === 1 ? "1 foto nova" : `${unseen} fotos novas`}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setPage(1)}>
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
                  <p className={`text-xs ${capture.mark_count > 0 ? "font-medium" : "text-muted-foreground"}`}>
                    {(capture.mark_count ?? 0) === 1 ? "1 marcação" : (capture.mark_count ?? 0) > 1 ? `${capture.mark_count} marcações` : "Sem marcação"}
                  </p>
                </CardContent>
              </button>
            </Card>
          )
        })}
      </div>
      {captures.data ? (
        <Pagination page={page} pageSize={PAGE_SIZE} total={captures.data.total} onPage={setPage} />
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
            setPage(1)
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
