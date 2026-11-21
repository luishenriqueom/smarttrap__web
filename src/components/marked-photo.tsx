"use client"

import { useEffect, useRef, useState } from "react"
import { fetchCaptureBlob } from "@/lib/api"
import type { Annotation } from "@/lib/types"

const PALETTE = ["#e11d48", "#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#be123c", "#4d7c0f"]

export function speciesColor(name: string) {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return PALETTE[hash % PALETTE.length]
}

type DraftBox = { x: number; y: number; width: number; height: number }

export function MarkedPhoto({
  id,
  alt,
  boxes,
  editable,
  onAdd,
  onRemove,
}: {
  id: string
  alt: string
  boxes: Annotation[]
  editable?: boolean
  onAdd?: (box: DraftBox) => void
  onRemove?: (id: string) => void
}) {
  const imageRef = useRef<HTMLImageElement>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftBox | null>(null)
  const [natural, setNatural] = useState({ width: 1, height: 1 })

  useEffect(() => {
    let active = true
    let url: string | null = null
    fetchCaptureBlob(id)
      .then((objectUrl) => {
        url = objectUrl
        if (active) setSrc(objectUrl)
        else URL.revokeObjectURL(objectUrl)
      })
      .catch(() => {
        if (active) setSrc(null)
      })
    return () => {
      active = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [id])

  function point(event: React.PointerEvent) {
    const image = imageRef.current
    if (!image) return null
    const rect = image.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return null
    const x = ((event.clientX - rect.left) / rect.width) * image.naturalWidth
    const y = ((event.clientY - rect.top) / rect.height) * image.naturalHeight
    return {
      x: Math.max(0, Math.min(image.naturalWidth, Math.round(x))),
      y: Math.max(0, Math.min(image.naturalHeight, Math.round(y))),
    }
  }

  function place(box: DraftBox) {
    return {
      left: `${(box.x / natural.width) * 100}%`,
      top: `${(box.y / natural.height) * 100}%`,
      width: `${(box.width / natural.width) * 100}%`,
      height: `${(box.height / natural.height) * 100}%`,
    }
  }

  if (!src) return <div className="min-h-40 rounded-lg bg-muted" />

  return (
    <div className="relative inline-block max-w-full align-top">
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        draggable={false}
        className="block max-h-[70vh] max-w-full rounded-lg bg-muted"
        onLoad={(event) => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
        onPointerDown={(event) => {
          if (!editable || !onAdd) return
          const start = point(event)
          if (!start) return
          drag.current = start
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          if (!drag.current) return
          const current = point(event)
          if (!current) return
          const width = Math.abs(current.x - drag.current.x)
          const height = Math.abs(current.y - drag.current.y)
          if (width < 4 && height < 4) {
            setDraft(null)
            return
          }
          setDraft({
            x: Math.min(drag.current.x, current.x),
            y: Math.min(drag.current.y, current.y),
            width: Math.max(1, width),
            height: Math.max(1, height),
          })
        }}
        onPointerUp={(event) => {
          const start = drag.current
          drag.current = null
          if (!start || !onAdd || !imageRef.current) {
            setDraft(null)
            return
          }
          const current = point(event)
          if (!current) {
            setDraft(null)
            return
          }
          const width = Math.abs(current.x - start.x)
          const height = Math.abs(current.y - start.y)
          const photoWidth = imageRef.current.naturalWidth
          const photoHeight = imageRef.current.naturalHeight
          if (width < 8 && height < 8) {
            const size = 32
            const boxWidth = Math.min(size, photoWidth)
            const boxHeight = Math.min(size, photoHeight)
            onAdd({
              x: Math.max(0, Math.min(photoWidth - boxWidth, start.x - Math.round(boxWidth / 2))),
              y: Math.max(0, Math.min(photoHeight - boxHeight, start.y - Math.round(boxHeight / 2))),
              width: boxWidth,
              height: boxHeight,
            })
          } else {
            onAdd({
              x: Math.min(start.x, current.x),
              y: Math.min(start.y, current.y),
              width: Math.max(1, width),
              height: Math.max(1, height),
            })
          }
          setDraft(null)
        }}
      />
      {boxes.map((box) => (
        <div key={box.id} className="pointer-events-none absolute border-2" style={{ ...place(box), borderColor: speciesColor(box.species_name) }}>
          <span className="absolute bottom-full left-0 max-w-[12rem] truncate bg-black/75 px-1 text-[10px] leading-4 text-white">
            {box.species_name}
            {box.confidence != null ? ` ${Math.round(box.confidence * 100)}%` : ""}
          </span>
          {editable && box.source === "human" && onRemove ? (
            <button
              type="button"
              aria-label={`Remover marcação de ${box.species_name}`}
              className="pointer-events-auto absolute -top-2 -right-2 grid size-4 place-items-center rounded-full bg-black text-[10px] leading-none text-white"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onRemove(box.id)}
            >
              ×
            </button>
          ) : null}
        </div>
      ))}
      {draft ? <div className="pointer-events-none absolute border-2 border-white" style={place(draft)} /> : null}
    </div>
  )
}
