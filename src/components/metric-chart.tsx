"use client"

import { useQuery } from "@tanstack/react-query"
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { api } from "@/lib/api"
import { formatTick, periodRange } from "@/lib/format"
import type { Period } from "@/lib/types"

const colors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]

export function MetricChart({
  period,
  deviceId,
  metric,
}: {
  period: Period
  deviceId?: string
  metric: "pest_count" | "battery_v"
}) {
  const range = periodRange(period)
  const query = useQuery({
    queryKey: ["series", period, deviceId ?? "all"],
    queryFn: () => api.series({ ...range, device_id: deviceId }),
  })

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Carregando gráfico...</p>
  if (query.isError) return <p className="text-sm text-destructive">Não foi possível carregar a série.</p>

  const names = [...new Set((query.data ?? []).map((point) => point.device_name))]
  const rows = new Map<string, Record<string, string | number | null>>()
  for (const point of query.data ?? []) {
    const row = rows.get(point.bucket) ?? { bucket: point.bucket }
    row[point.device_name] = metric === "pest_count" ? point.pest_count : point.battery_v
    rows.set(point.bucket, row)
  }
  const data = [...rows.values()].sort((a, b) => String(a.bucket).localeCompare(String(b.bucket)))

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem métricas neste período.</p>
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="bucket" tickFormatter={(value) => formatTick(String(value), range.bucket)} minTickGap={24} />
          <YAxis width={40} allowDecimals={metric === "battery_v"} />
          <Tooltip
            labelFormatter={(value) => formatTick(String(value), range.bucket)}
            formatter={(value) => (value === null || value === undefined ? "—" : String(value))}
          />
          {names.length > 1 ? <Legend /> : null}
          {names.map((name, index) => (
            <Line
              key={name}
              type="monotone"
              dataKey={name}
              name={name}
              stroke={colors[index % colors.length]}
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
