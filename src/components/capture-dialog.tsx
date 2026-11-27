"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Info } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"
import { MarkedPhoto } from "@/components/marked-photo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ApiError, api } from "@/lib/api"
import { formatDateTime } from "@/lib/format"
import { captureCameraLabel } from "@/lib/framesize"
import type { Capture } from "@/lib/types"

export function CaptureDialog({
  capture,
  readOnly,
  onClose,
  onDelete,
}: {
  capture: Capture
  readOnly: boolean
  onClose: () => void
  onDelete?: () => void
}) {
  const queryClient = useQueryClient()
  const [manualCount, setManualCount] = useState(capture.manual_count === null ? "" : String(capture.manual_count))
  const [label, setLabel] = useState(capture.label)
  const [notes, setNotes] = useState(capture.notes ?? "")
  const [speciesId, setSpeciesId] = useState("")
  const species = useQuery({ queryKey: ["species"], queryFn: () => api.species() })
  const boxes = useQuery({ queryKey: ["annotations", capture.id], queryFn: () => api.annotations(capture.id) })
  const selectedSpeciesId = species.data?.some((item) => item.id === speciesId) ? speciesId : (species.data?.[0]?.id ?? "")
  const mark = useMutation({
    mutationFn: (box: { x: number; y: number; width: number; height: number }) =>
      api.createAnnotation(capture.id, { species_id: selectedSpeciesId, ...box }),
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
  const revise = useMutation({
    mutationFn: (patch: { id: string; species_id: string; x: number; y: number; width: number; height: number }) =>
      api.updateAnnotation(capture.id, patch.id, {
        species_id: patch.species_id,
        x: patch.x,
        y: patch.y,
        width: patch.width,
        height: patch.height,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData<typeof updated[]>(["annotations", capture.id], (current) =>
        current?.map((item) => (item.id === updated.id ? updated : item)),
      )
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Não foi possível ajustar a marcação"),
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
  const noSpecies = (species.data ?? []).length === 0

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-3" onClick={onClose}>
      <div
        className="flex max-h-[94vh] w-full max-w-[min(96vw,1600px)] flex-col overflow-hidden rounded-xl bg-card md:w-max md:flex-row md:items-start"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="min-w-0 shrink-0">
          <MarkedPhoto
            id={capture.id}
            alt={capture.device_name}
            boxes={boxes.data ?? []}
            species={species.data ?? []}
            frame="dialog"
            editable={!readOnly}
            onAdd={(box) => {
              if (!selectedSpeciesId) {
                toast.error("Cadastre uma espécie antes de marcar")
                return
              }
              mark.mutate(box)
            }}
            onUpdate={(annotationId, box) => revise.mutateAsync({ id: annotationId, ...box }).then(() => undefined)}
            onRemove={(annotationId) => unmark.mutate(annotationId)}
          />
        </div>
        <div className="flex min-h-0 w-full flex-col md:relative md:w-[22rem] md:self-stretch">
        <form
          className="flex max-h-[42vh] min-h-0 w-full flex-col gap-4 overflow-auto p-4 md:absolute md:inset-0 md:max-h-none"
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
              value={selectedSpeciesId || null}
              onValueChange={(value) => value && setSpeciesId(value)}
              disabled={readOnly || noSpecies}
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
            {noSpecies ? (
              <p className="text-xs text-muted-foreground">
                <Link href="/species" className="underline" onClick={onClose}>
                  Cadastre uma espécie
                </Link>{" "}
                antes de marcar.
              </p>
            ) : null}
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
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>
              {readOnly
                ? "As caixas mostram as marcações humanas e as detecções da armadilha."
                : "Clique para marcar. Arraste a caixa para movê-la e o canto para mudar o tamanho. A espécie de cada caixa fica na lista dela."}
            </span>
          </p>
          <div className="flex gap-2">
            <Button type="submit" disabled={readOnly || mutation.isPending}>
              Salvar
            </Button>
            {readOnly || !onDelete ? null : (
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
    </div>
  )
}

export function DiscardDialog({ ids, onClose, onDone }: { ids: string[]; onClose: () => void; onDone: () => void }) {
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
