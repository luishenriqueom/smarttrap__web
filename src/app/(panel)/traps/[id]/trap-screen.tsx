"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useState } from "react"
import { MarkedPhoto } from "@/components/marked-photo"
import { MetricChart } from "@/components/metric-chart"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { frameSizeLabel } from "@/lib/framesize"
import { formatDateTime, formatNumber, formatPercent, periodRange } from "@/lib/format"
import type { Capture, Period } from "@/lib/types"

const periods: { value: Period; label: string }[] = [
  { value: "24h", label: "Últimas 24 horas" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
]

export default function TrapDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const { user } = useAuth()
  const [period, setPeriod] = useState<Period>("7d")
  const range = periodRange(period)
  const device = useQuery({ queryKey: ["device", id], queryFn: () => api.device(id), enabled: Boolean(id) })
  const photos = useQuery({
    queryKey: ["captures", id, "recent"],
    queryFn: () => api.captures({ device_id: id, limit: 6 }),
    enabled: Boolean(id),
  })
  const metrics = useQuery({
    queryKey: ["metrics", id, period],
    queryFn: () => api.metrics({ device_id: id, from: range.from, to: range.to, limit: 50 }),
    enabled: Boolean(id),
  })

  if (device.isLoading) return <p className="text-sm text-muted-foreground">Carregando...</p>
  if (device.isError || !device.data) return <p className="text-sm text-destructive">Armadilha não encontrada.</p>

  const current = device.data

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 px-0" nativeButton={false} render={<Link href="/traps" />}>
            Voltar
          </Button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{current.name}</h1>
            <Badge variant={current.is_online ? "default" : "outline"}>{current.is_online ? "Online" : "Offline"}</Badge>
            {user && !user.is_demo ? (
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/traps/${current.id}/edit`} />}>
                Editar
              </Button>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {current.code}
            {current.location ? ` · ${current.location}` : ""} · {current.owner_name} · Resolução {frameSizeLabel(current.frame_size)} · JPEG {current.jpeg_quality} · Sono {Math.round(current.sleep_seconds / 60)} min
          </p>
        </div>
        <Select
          items={Object.fromEntries(periods.map((item) => [item.value, item.label]))}
          value={period}
          onValueChange={(value) => value && setPeriod(value as Period)}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {periods.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fotos recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {photos.isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p> : null}
          {photos.data && photos.data.items.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma foto desta armadilha.</p> : null}
          {photos.data && photos.data.items.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {photos.data.items.map((capture) => (
                <RecentPhoto key={capture.id} capture={capture} />
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Contagem</CardTitle>
          </CardHeader>
          <CardContent>
            <MetricChart period={period} deviceId={id} metric="pest_count" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Bateria</CardTitle>
          </CardHeader>
          <CardContent>
            <MetricChart period={period} deviceId={id} metric="battery_v" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Leituras do período</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {metrics.isLoading ? <p className="px-4 text-sm text-muted-foreground">Carregando...</p> : null}
          {metrics.data && metrics.data.items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Sem leituras neste período.</p>
          ) : null}
          {metrics.data && metrics.data.items.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Pragas</TableHead>
                  <TableHead>Confiança</TableHead>
                  <TableHead>Bateria</TableHead>
                  <TableHead>RSSI</TableHead>
                  <TableHead>SNR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.data.items.map((metric) => (
                  <TableRow key={metric.id}>
                    <TableCell>{formatDateTime(metric.recorded_at)}</TableCell>
                    <TableCell>{formatNumber(metric.pest_count)}</TableCell>
                    <TableCell>{formatPercent(metric.confidence)}</TableCell>
                    <TableCell>{metric.battery_v === null ? "—" : `${formatNumber(metric.battery_v, 2)} V`}</TableCell>
                    <TableCell>{formatNumber(metric.rssi)}</TableCell>
                    <TableCell>{formatNumber(metric.snr, 1)}</TableCell>
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

function RecentPhoto({ capture }: { capture: Capture }) {
  const boxes = useQuery({ queryKey: ["annotations", capture.id], queryFn: () => api.annotations(capture.id) })
  return (
    <figure className="space-y-1">
      <MarkedPhoto id={capture.id} alt={capture.device_name} boxes={boxes.data ?? []} />
      <figcaption className="text-xs text-muted-foreground">{formatDateTime(capture.captured_at)}</figcaption>
    </figure>
  )
}
