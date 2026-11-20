"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useState } from "react"
import { MetricChart } from "@/components/metric-chart"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api } from "@/lib/api"
import { formatNumber, formatPercent, timeAgo } from "@/lib/format"
import { useAuth } from "@/lib/auth"
import type { Period } from "@/lib/types"

const periods: { value: Period; label: string }[] = [
  { value: "24h", label: "Últimas 24 horas" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
]

export default function OverviewPage() {
  const { user } = useAuth()
  const [period, setPeriod] = useState<Period>("7d")
  const devices = useQuery({ queryKey: ["devices"], queryFn: () => api.devices() })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Visão geral</h1>
          <p className="text-sm text-muted-foreground">Contagem, bateria e última comunicação de cada armadilha.</p>
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

      {devices.isLoading ? <p className="text-sm text-muted-foreground">Carregando armadilhas...</p> : null}
      {devices.isError ? <p className="text-sm text-destructive">Não foi possível carregar as armadilhas.</p> : null}
      {devices.data && devices.data.items.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-14 text-center text-sm text-muted-foreground">
          {user?.is_demo
            ? "Nenhuma armadilha vinculada a esta conta."
            : "Nenhuma armadilha ainda. Cadastre uma para começar."}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {devices.data?.items.map((device) => (
          <Link key={device.id} href={`/traps/${device.id}`}>
            <Card className="h-full transition-colors hover:bg-muted/40">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{device.name}</CardTitle>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">{device.code}</p>
                  </div>
                  <Badge variant={device.is_online ? "default" : "outline"}>{device.is_online ? "Online" : "Offline"}</Badge>
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-3">
                <Stat label="Pragas" value={device.last_metric ? formatNumber(device.last_metric.pest_count) : "—"} />
                <Stat label="Confiança" value={formatPercent(device.last_metric?.confidence ?? null)} />
                <Stat label="Bateria" value={device.last_metric?.battery_v != null ? `${formatNumber(device.last_metric.battery_v, 2)} V` : "—"} />
                <p className="col-span-3 text-xs text-muted-foreground">Visto {timeAgo(device.last_seen_at)}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contagem de pragas</CardTitle>
        </CardHeader>
        <CardContent>
          <MetricChart period={period} metric="pest_count" />
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  )
}
