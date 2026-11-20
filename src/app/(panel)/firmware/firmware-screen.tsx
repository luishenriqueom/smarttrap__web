"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ApiError, api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { formatDateTime } from "@/lib/format"
import type { FirmwareRelease, FirmwareTarget } from "@/lib/types"

const targets: { id: FirmwareTarget; title: string; hint: string }[] = [
  {
    id: "smarttrap",
    title: "Armadilha",
    hint: "Binário do ESP32-CAM. Uma versão maior entra no próximo ciclo de Wi-Fi, ou no comando LoRa depois da inferência.",
  },
  {
    id: "heltec",
    title: "Heltec",
    hint: "Binário do gateway. Ele consulta a API e aplica o arquivo pela própria internet.",
  },
]

export default function FirmwareScreen() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const releases = useQuery({
    queryKey: ["firmware"],
    queryFn: () => api.firmware(),
    enabled: user?.role === "superadmin",
  })
  const [versions, setVersions] = useState<Record<FirmwareTarget, string>>({ smarttrap: "", heltec: "" })
  const [files, setFiles] = useState<Record<FirmwareTarget, File | null>>({ smarttrap: null, heltec: null })
  const [fileKey, setFileKey] = useState(0)

  const publish = useMutation({
    mutationFn: () => {
      const body = new FormData()
      for (const target of targets) {
        const version = versions[target.id].trim()
        const file = files[target.id]
        if (!version && !file) continue
        if (!version || !file) throw new ApiError(422, `Informe a versão e o arquivo de ${target.title}.`)
        body.set(`${target.id}_version`, version)
        body.set(`${target.id}_bin`, file)
      }
      if ([...body.keys()].length === 0) throw new ApiError(422, "Envie ao menos um firmware.")
      return api.publishFirmware(body)
    },
    onSuccess: (result) => {
      const published = result.items.map((item) => `${labelOf(item.target)} v${item.version}`).join(" e ")
      toast.success(`Publicado: ${published}`)
      setFiles({ smarttrap: null, heltec: null })
      setVersions({ smarttrap: "", heltec: "" })
      setFileKey((value) => value + 1)
      queryClient.invalidateQueries({ queryKey: ["firmware"] })
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Não foi possível publicar"),
  })

  if (user && user.role !== "superadmin") {
    return <p className="text-sm text-muted-foreground">Apenas o SuperAdmin publica firmware.</p>
  }

  const current = new Map((releases.data ?? []).map((item) => [item.target, item]))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Firmware</h1>
        <p className="text-sm text-muted-foreground">
          Publique um binário com versão maior que a instalada. O dispositivo só baixa quando o número publicado é maior.
        </p>
      </div>

      <form
        className="grid gap-4 lg:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault()
          publish.mutate()
        }}
      >
        {targets.map((target) => (
          <Card key={target.id}>
            <CardHeader>
              <CardTitle>{target.title}</CardTitle>
              <CardDescription>{target.hint}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Published release={current.get(target.id)} loading={releases.isLoading} failed={releases.isError} />
              <div className="space-y-2">
                <Label htmlFor={`${target.id}-version`}>Versão</Label>
                <Input
                  id={`${target.id}-version`}
                  type="number"
                  min={1}
                  max={65535}
                  inputMode="numeric"
                  value={versions[target.id]}
                  placeholder={String((current.get(target.id)?.version ?? 0) + 1)}
                  onChange={(event) => setVersions((state) => ({ ...state, [target.id]: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${target.id}-file`}>Arquivo .bin</Label>
                <Input
                  key={`${target.id}-${fileKey}`}
                  id={`${target.id}-file`}
                  type="file"
                  accept=".bin,application/octet-stream"
                  onChange={(event) => setFiles((state) => ({ ...state, [target.id]: event.target.files?.[0] ?? null }))}
                />
              </div>
            </CardContent>
          </Card>
        ))}
        <div className="lg:col-span-2">
          <Button type="submit" disabled={publish.isPending}>
            {publish.isPending ? "Publicando..." : "Publicar"}
          </Button>
        </div>
      </form>
    </div>
  )
}

function Published({ release, loading, failed }: { release?: FirmwareRelease; loading: boolean; failed: boolean }) {
  if (loading) return <p className="text-sm text-muted-foreground">Carregando a versão publicada...</p>
  if (failed) return <p className="text-sm text-destructive">Não foi possível consultar o firmware publicado.</p>
  if (!release) return <p className="text-sm text-muted-foreground">Nenhum binário publicado. A consulta do dispositivo responde 404.</p>
  return (
    <p className="text-sm text-muted-foreground">
      Publicado: versão {release.version}, {formatBytes(release.size_bytes)}, {formatDateTime(release.created_at)}. SHA-256{" "}
      <span className="font-mono">{release.sha256.slice(0, 12)}</span>
    </p>
  )
}

function labelOf(target: FirmwareTarget) {
  return target === "smarttrap" ? "Armadilha" : "Heltec"
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(2)} MB`
}
