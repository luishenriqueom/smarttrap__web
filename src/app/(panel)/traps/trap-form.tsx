"use client"

import { useMutation, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ApiError, api } from "@/lib/api"
import { FRAME_SIZES } from "@/lib/framesize"
import type { TrainedModel } from "@/lib/types"

export type TrapDraft = {
  id: string
  name: string
  code: string
  location: string | null
  owner_id: string
  frame_size: string
  jpeg_quality: number
  sleep_seconds: number
  model_id: string | null
}

export function TrapForm({
  initial,
  superadmin,
  users,
  onClose,
  onSaved,
}: {
  initial: TrapDraft | null
  superadmin: boolean
  users: { id: string; name: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(initial?.name ?? "")
  const [code, setCode] = useState(initial?.code ?? "")
  const [location, setLocation] = useState(initial?.location ?? "")
  const [ownerId, setOwnerId] = useState(initial?.owner_id ?? "")
  const [frameSize, setFrameSize] = useState(initial?.frame_size ?? "svga")
  const [jpegQuality, setJpegQuality] = useState(String(initial?.jpeg_quality ?? 12))
  const [sleepMinutes, setSleepMinutes] = useState(String(Math.round((initial?.sleep_seconds ?? 300) / 60)))
  const [modelId, setModelId] = useState(initial?.model_id ?? "")
  const models = useQuery({ queryKey: ["models"], queryFn: () => api.models(), enabled: Boolean(initial) })
  const readyModels = (models.data ?? []).filter((model): model is TrainedModel => model.status === "ready")
  const mutation = useMutation({
    mutationFn: async () => {
      const quality = Number(jpegQuality)
      const minutes = Number(sleepMinutes)
      if (!Number.isInteger(quality) || quality < 4 || quality > 63) {
        throw new ApiError(422, "A qualidade JPEG deve ficar entre 4 e 63")
      }
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
        throw new ApiError(422, "O intervalo de sono deve ficar entre 1 minuto e 24 horas")
      }
      const sleepSeconds = minutes * 60
      if (initial) {
        return api.updateDevice(initial.id, {
          name,
          location,
          frame_size: frameSize,
          jpeg_quality: quality,
          sleep_seconds: sleepSeconds,
          model_id: modelId || null,
          ...(superadmin && ownerId ? { owner_id: ownerId } : {}),
        })
      }
      return api.createDevice({
        name,
        code,
        location,
        frame_size: frameSize,
        jpeg_quality: quality,
        sleep_seconds: sleepSeconds,
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
          <div className="space-y-2">
            <Label>Resolução da câmera</Label>
            <Select
              items={Object.fromEntries(FRAME_SIZES.map((item) => [item.id, item.label]))}
              value={frameSize}
              onValueChange={(value) => value && setFrameSize(value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FRAME_SIZES.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Na coleta, vale para a próxima foto. Na inferência, passa a valer no ciclo seguinte.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="trap-jpeg">Qualidade JPEG</Label>
            <Input
              id="trap-jpeg"
              type="number"
              min={4}
              max={63}
              step={1}
              value={jpegQuality}
              onChange={(event) => setJpegQuality(event.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">De 4 a 63. Um número menor gera um arquivo maior e mais nítido. O padrão é 12.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="trap-sleep">Intervalo de sono (minutos)</Label>
            <Input
              id="trap-sleep"
              type="number"
              min={1}
              max={1440}
              step={1}
              value={sleepMinutes}
              onChange={(event) => setSleepMinutes(event.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">Depois de cada ciclo. O padrão é 5 minutos. Vale no fim do ciclo em que a armadilha buscar a configuração.</p>
          </div>
          {initial ? (
            <div className="space-y-2">
              <Label>Modelo</Label>
              <Select
                items={{ none: "Nenhum", ...Object.fromEntries(readyModels.map((model) => [model.id, model.class_labels.join(", ") || model.id.slice(0, 8)])) }}
                value={modelId || "none"}
                onValueChange={(value) => setModelId(!value || value === "none" ? "" : value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Nenhum" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {readyModels.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.class_labels.join(", ") || model.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">A armadilha baixa este arquivo na próxima janela de Wi-Fi.</p>
            </div>
          ) : null}
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
