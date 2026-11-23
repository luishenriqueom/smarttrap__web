export type Role = "common" | "superadmin"

export type User = {
  id: string
  name: string
  email: string
  role: Role
  is_demo: boolean
  is_active: boolean
  created_at: string
}

export type TokenResponse = {
  access_token: string
  token_type: string
  user: User
}

export type Metric = {
  id: string
  device_id: string
  recorded_at: string
  received_at: string
  pest_count: number
  confidence: number | null
  battery_v: number | null
  rssi: number | null
  snr: number | null
}

export type Device = {
  id: string
  code: string
  name: string
  location: string | null
  owner_id: string
  owner_name: string
  last_seen_at: string | null
  is_online: boolean
  created_at: string
  last_metric: Metric | null
  capture_count: number
  frame_size: string
  jpeg_quality: number
  sleep_seconds: number
  model_id: string | null
  last_clock_at: string | null
  last_clock_received_at: string | null
  clock_sync_requested: boolean
  operating_mode: "collect" | "infer"
  reported_mode: "collect" | "infer" | null
}

export type Capture = {
  id: string
  device_id: string
  device_name: string
  device_code: string
  captured_at: string
  received_at: string
  size_bytes: number
  frame_size: string | null
  jpeg_quality: number | null
  width: number | null
  height: number | null
  manual_count: number | null
  label: "unlabeled" | "with_pest" | "without_pest"
  notes: string | null
  mark_count: number
}

export type SeriesPoint = {
  device_id: string
  device_name: string
  bucket: string
  pest_count: number
  battery_v: number | null
}

export type Page<T> = {
  items: T[]
  total: number
  limit: number
  offset: number
}

export type Period = "24h" | "7d" | "30d"

export type Species = {
  id: string
  name: string
  position: number
}

export type Annotation = {
  id: string
  capture_id: string
  species_id: string
  species_name: string
  x: number
  y: number
  width: number
  height: number
  source: "human" | "device"
  confidence: number | null
}

export type TrainedModel = {
  id: string
  status: "idle" | "training" | "ready" | "failed" | string
  sha256: string | null
  class_labels: string[]
  input_size: number
  window: number
  stride: number
  error: string | null
  created_at: string
}

export type FirmwareTarget = "smarttrap" | "heltec"

export type FirmwareRelease = {
  target: FirmwareTarget
  version: number
  sha256: string
  size_bytes: number
  created_at: string
}
