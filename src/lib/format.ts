import type { Period } from "@/lib/types"

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" })

export function formatDateTime(value: string | null) {
  if (!value) return "—"
  return dateTime.format(new Date(value))
}

export function formatNumber(value: number | null, digits = 0) {
  if (value === null || Number.isNaN(value)) return "—"
  return value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function formatPercent(value: number | null) {
  if (value === null) return "—"
  return `${Math.round(value * 100)}%`
}

export function timeAgo(value: string | null) {
  if (!value) return "sem comunicação"
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000)
  if (minutes < 1) return "agora"
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  return `há ${Math.round(hours / 24)} d`
}

export function roleLabel(role: string, isDemo: boolean) {
  if (isDemo) return "Demonstração"
  if (role === "superadmin") return "SuperAdmin"
  return "Comum"
}

export function labelText(label: string) {
  if (label === "with_pest") return "Com praga"
  if (label === "without_pest") return "Sem praga"
  return "Sem rótulo"
}

export function periodRange(period: Period) {
  const end = new Date()
  const start = new Date(end)
  if (period === "24h") start.setHours(start.getHours() - 24)
  if (period === "7d") start.setDate(start.getDate() - 7)
  if (period === "30d") start.setDate(start.getDate() - 30)
  return {
    from: start.toISOString(),
    to: end.toISOString(),
    bucket: period === "30d" ? ("day" as const) : ("hour" as const),
  }
}

export function formatTick(value: string, bucket: "hour" | "day") {
  const date = new Date(value)
  if (bucket === "day") return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit" })
}
