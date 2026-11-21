export const FRAME_SIZES = [
  { id: "qqvga", label: "160×120" },
  { id: "qvga", label: "320×240" },
  { id: "vga", label: "640×480" },
  { id: "svga", label: "800×600" },
  { id: "xga", label: "1024×768" },
  { id: "sxga", label: "1280×1024" },
  { id: "uxga", label: "1600×1200" },
] as const

export function frameSizeLabel(id: string | null | undefined): string {
  return FRAME_SIZES.find((item) => item.id === id)?.label ?? "—"
}

export function captureResolution(capture: { width: number | null; height: number | null }): string | null {
  if (capture.width == null || capture.height == null) return null
  return `${capture.width}×${capture.height}`
}

export function captureCameraLabel(capture: { width: number | null; height: number | null; jpeg_quality: number | null }): string | null {
  const parts = [captureResolution(capture), capture.jpeg_quality == null ? null : `JPEG ${capture.jpeg_quality}`].filter(
    (part): part is string => Boolean(part),
  )
  return parts.length > 0 ? parts.join(" · ") : null
}
