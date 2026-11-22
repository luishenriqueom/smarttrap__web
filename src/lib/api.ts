import type { Annotation, Capture, Device, FirmwareRelease, Metric, Page, SeriesPoint, Species, TokenResponse, TrainedModel, User } from "@/lib/types"

const CONFIGURED_API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

function apiUrl() {
  if (typeof window === "undefined") return CONFIGURED_API_URL
  const configured = new URL(CONFIGURED_API_URL)
  const configuredIsLocal = configured.hostname === "localhost" || configured.hostname === "127.0.0.1"
  const pageHost = window.location.hostname
  const pageIsLocal = pageHost === "localhost" || pageHost === "127.0.0.1"
  if (!configuredIsLocal || pageIsLocal) return CONFIGURED_API_URL
  const port = configured.port ? `:${configured.port}` : ""
  return `${configured.protocol}//${pageHost}${port}`
}
const TOKEN_KEY = "smarttrap_token"

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function getToken() {
  if (typeof window === "undefined") return null
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

function messageFrom(data: unknown) {
  if (data && typeof data === "object" && "detail" in data) {
    const detail = (data as { detail: unknown }).detail
    if (typeof detail === "string") return detail
    if (Array.isArray(detail)) {
      return detail
        .map((item) => (item && typeof item === "object" && "msg" in item ? String(item.msg) : "Dados inválidos"))
        .join(" ")
    }
  }
  return "Não foi possível concluir a operação"
}

function withQuery(path: string, params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value))
  }
  const text = query.toString()
  return text ? `${path}?${text}` : path
}

async function request<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const headers = new Headers(init.headers)
  if (auth) {
    const token = getToken()
    if (token) headers.set("Authorization", `Bearer ${token}`)
  }
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }
  const response = await fetch(`${apiUrl()}${path}`, { ...init, headers })
  if (response.status === 401 && auth && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    clearToken()
    window.location.href = "/login"
  }
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) throw new ApiError(response.status, messageFrom(data))
  return data as T
}

export async function downloadDataset(params: { device_id?: string; from: string; to: string }, filename: string) {
  const headers = new Headers()
  const token = getToken()
  if (token) headers.set("Authorization", `Bearer ${token}`)
  const response = await fetch(`${apiUrl()}${withQuery("/api/v1/captures/export", params)}`, { headers })
  if (response.status === 401 && typeof window !== "undefined") {
    clearToken()
    window.location.href = "/login"
  }
  if (!response.ok) {
    const text = await response.text()
    let data: unknown = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = null
    }
    throw new ApiError(response.status, messageFrom(data))
  }
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export async function subscribeCaptures(onCapture: (capture: Capture) => void, signal: AbortSignal) {
  let delayMs = 1000
  while (!signal.aborted) {
    try {
      const response = await fetch(`${apiUrl()}/api/v1/captures/stream`, {
        headers: { Authorization: `Bearer ${getToken() ?? ""}`, Accept: "text/event-stream" },
        signal,
      })
      if (response.status === 401) {
        clearToken()
        if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
          window.location.href = "/login"
        }
        return
      }
      if (!response.ok || !response.body) throw new Error("stream")
      delayMs = 1000
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      while (!signal.aborted) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n")
        let boundary = buffer.indexOf("\n\n")
        while (boundary !== -1) {
          const raw = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)
          const data = raw
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim())
            .join("\n")
          if (data) onCapture(JSON.parse(data) as Capture)
          boundary = buffer.indexOf("\n\n")
        }
      }
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return
    }
    if (signal.aborted) return
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, delayMs)
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer)
          resolve()
        },
        { once: true },
      )
    })
    delayMs = Math.min(delayMs * 2, 10000)
  }
}

export async function fetchCaptureBlob(id: string) {
  const response = await fetch(`${apiUrl()}/api/v1/captures/${id}/image`, {
    headers: { Authorization: `Bearer ${getToken() ?? ""}` },
  })
  if (!response.ok) throw new ApiError(response.status, "Não foi possível abrir a imagem")
  return URL.createObjectURL(await response.blob())
}

export const api = {
  login: (email: string, password: string) =>
    request<TokenResponse>("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }, false),
  demo: () => request<TokenResponse>("/api/v1/auth/demo", { method: "POST" }, false),
  me: () => request<User>("/api/v1/auth/me"),
  devices: (ownerId?: string) => request<Page<Device>>(withQuery("/api/v1/devices", { limit: 100, owner_id: ownerId })),
  device: (id: string) => request<Device>(`/api/v1/devices/${id}`),
  createDevice: (body: { code: string; name: string; location?: string; owner_id?: string; frame_size?: string; jpeg_quality?: number; sleep_seconds?: number }) =>
    request<Device>("/api/v1/devices", { method: "POST", body: JSON.stringify(body) }),
  updateDevice: (id: string, body: { name?: string; location?: string | null; owner_id?: string; frame_size?: string; jpeg_quality?: number; sleep_seconds?: number; model_id?: string | null }) =>
    request<Device>(`/api/v1/devices/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  captures: (params: { device_id?: string; from?: string; to?: string; limit?: number; offset?: number }) =>
    request<Page<Capture>>(withQuery("/api/v1/captures", params)),
  updateCapture: (id: string, body: { manual_count?: number | null; label?: string; notes?: string | null }) =>
    request<Capture>(`/api/v1/captures/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  importCaptures: (body: FormData) => request<{ imported: number; skipped: number }>("/api/v1/captures/import", { method: "POST", body }),
  discardCaptures: (ids: string[]) => request<{ discarded: number }>("/api/v1/captures/discard", { method: "POST", body: JSON.stringify({ ids }) }),
  restoreCaptures: (ids: string[]) => request<{ restored: number }>("/api/v1/captures/restore", { method: "POST", body: JSON.stringify({ ids }) }),
  metrics: (params: { device_id: string; from?: string; to?: string; limit?: number }) =>
    request<Page<Metric>>(withQuery("/api/v1/metrics", params)),
  series: (params: { device_id?: string; from: string; to: string; bucket: "hour" | "day" }) =>
    request<SeriesPoint[]>(withQuery("/api/v1/metrics/series", params)),
  users: () => request<User[]>("/api/v1/users"),
  createUser: (body: { name: string; email: string; password: string }) =>
    request<User>("/api/v1/users", { method: "POST", body: JSON.stringify(body) }),
  updateUser: (id: string, body: { name?: string; email?: string; password?: string; is_active?: boolean }) =>
    request<User>(`/api/v1/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  species: () => request<Species[]>("/api/v1/species"),
  createSpecies: (name: string) => request<Species>("/api/v1/species", { method: "POST", body: JSON.stringify({ name }) }),
  annotations: (captureId: string) => request<Annotation[]>(`/api/v1/captures/${captureId}/annotations`),
  createAnnotation: (captureId: string, body: { species_id: string; x: number; y: number; width: number; height: number }) =>
    request<Annotation>(`/api/v1/captures/${captureId}/annotations`, { method: "POST", body: JSON.stringify(body) }),
  deleteAnnotation: (captureId: string, annotationId: string) =>
    request<null>(`/api/v1/captures/${captureId}/annotations/${annotationId}`, { method: "DELETE" }),
  models: () => request<TrainedModel[]>("/api/v1/models"),
  trainModel: () => request<TrainedModel>("/api/v1/models/train", { method: "POST" }),
  firmware: () => request<FirmwareRelease[]>("/api/v1/firmware"),
  publishFirmware: (body: FormData) => request<{ items: FirmwareRelease[] }>("/api/v1/firmware", { method: "POST", body }),
}
