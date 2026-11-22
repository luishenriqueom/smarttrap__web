"use client"

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { fetchCaptureBlob } from "@/lib/api"
import type { Annotation } from "@/lib/types"

const PALETTE = ["#e11d48", "#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#be123c", "#4d7c0f"]

export function speciesColor(name: string) {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return PALETTE[hash % PALETTE.length]
}

type DraftBox = { x: number; y: number; width: number; height: number }
type SpeciesOption = { id: string; name: string }
type BoxPatch = { species_id: string; x: number; y: number; width: number; height: number }
type Gesture =
  | { kind: "draw"; x: number; y: number }
  | { kind: "move"; id: string; pointerX: number; pointerY: number; origin: DraftBox }
  | { kind: "resize"; id: string; origin: DraftBox }

export function MarkedPhoto({
  id,
  alt,
  boxes,
  editable,
  species = [],
  frame = "thumb",
  onAdd,
  onRemove,
  onUpdate,
}: {
  id: string
  alt: string
  boxes: Annotation[]
  editable?: boolean
  species?: SpeciesOption[]
  frame?: "thumb" | "dialog"
  onAdd?: (box: DraftBox) => void
  onRemove?: (id: string) => void
  onUpdate?: (id: string, box: BoxPatch) => void | Promise<unknown>
}) {
  const imageRef = useRef<HTMLImageElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftBox | null>(null)
  const [live, setLive] = useState<DraftBox | null>(null)
  const [liveId, setLiveId] = useState<string | null>(null)
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

  useEffect(() => {
    if (!liveId || !live) return
    const box = boxes.find((item) => item.id === liveId)
    if (box && box.x === live.x && box.y === live.y && box.width === live.width && box.height === live.height) {
      setLive(null)
      setLiveId(null)
    }
  }, [boxes, live, liveId])

  function point(event: { clientX: number; clientY: number }) {
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

  function clamp(box: DraftBox) {
    const image = imageRef.current
    const photoWidth = image?.naturalWidth || natural.width
    const photoHeight = image?.naturalHeight || natural.height
    const width = Math.max(8, Math.min(box.width, photoWidth))
    const height = Math.max(8, Math.min(box.height, photoHeight))
    return {
      x: Math.max(0, Math.min(photoWidth - width, box.x)),
      y: Math.max(0, Math.min(photoHeight - height, box.y)),
      width,
      height,
    }
  }

  function shown(box: Annotation) {
    return liveId === box.id && live ? live : box
  }

  function finishGesture(event: ReactPointerEvent) {
    const current = gesture.current
    gesture.current = null
    if (!current || current.kind === "draw" || !onUpdate) return
    const pointer = point(event)
    if (!pointer) {
      setLive(null)
      setLiveId(null)
      return
    }
    const next = clamp(
      current.kind === "move"
        ? {
            x: current.origin.x + (pointer.x - current.pointerX),
            y: current.origin.y + (pointer.y - current.pointerY),
            width: current.origin.width,
            height: current.origin.height,
          }
        : {
            x: current.origin.x,
            y: current.origin.y,
            width: pointer.x - current.origin.x,
            height: pointer.y - current.origin.y,
          },
    )
    const box = boxes.find((item) => item.id === current.id)
    if (!box) {
      setLive(null)
      setLiveId(null)
      return
    }
    const moved = next.x !== box.x || next.y !== box.y || next.width !== box.width || next.height !== box.height
    if (!moved) {
      setLive(null)
      setLiveId(null)
      return
    }
    setLiveId(box.id)
    setLive(next)
    Promise.resolve(onUpdate(box.id, { species_id: box.species_id, ...next })).catch(() => {
      setLive(null)
      setLiveId(null)
    })
  }

  if (!src) return <div className={frame === "dialog" ? "min-h-40 w-full" : "min-h-40 rounded-lg bg-muted"} />

  const imageClass = frame === "dialog" ? "block h-auto max-h-[60vh] w-full md:max-h-[94vh] md:w-auto md:max-w-[calc(96vw-22rem)]" : "block max-h-[70vh] max-w-full rounded-lg bg-muted"

  return (
    <div className={frame === "dialog" ? "relative max-w-full" : "relative inline-block max-w-full align-top"}>
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        draggable={false}
        className={imageClass}
        onLoad={(event) => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
        onPointerDown={(event) => {
          if (!editable || !onAdd) return
          const start = point(event)
          if (!start) return
          gesture.current = { kind: "draw", x: start.x, y: start.y }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          const current = gesture.current
          if (!current) return
          const pointer = point(event)
          if (!pointer) return
          if (current.kind === "draw") {
            const width = Math.abs(pointer.x - current.x)
            const height = Math.abs(pointer.y - current.y)
            if (width < 4 && height < 4) {
              setDraft(null)
              return
            }
            setDraft({
              x: Math.min(current.x, pointer.x),
              y: Math.min(current.y, pointer.y),
              width: Math.max(1, width),
              height: Math.max(1, height),
            })
            return
          }
          const next = clamp(
            current.kind === "move"
              ? {
                  x: current.origin.x + (pointer.x - current.pointerX),
                  y: current.origin.y + (pointer.y - current.pointerY),
                  width: current.origin.width,
                  height: current.origin.height,
                }
              : {
                  x: current.origin.x,
                  y: current.origin.y,
                  width: pointer.x - current.origin.x,
                  height: pointer.y - current.origin.y,
                },
          )
          setLiveId(current.id)
          setLive(next)
        }}
        onPointerUp={(event) => {
          const current = gesture.current
          if (!current || current.kind !== "draw") {
            finishGesture(event)
            return
          }
          gesture.current = null
          const pointer = point(event)
          if (!pointer || !onAdd || !imageRef.current) {
            setDraft(null)
            return
          }
          const width = Math.abs(pointer.x - current.x)
          const height = Math.abs(pointer.y - current.y)
          const photoWidth = imageRef.current.naturalWidth
          const photoHeight = imageRef.current.naturalHeight
          if (width < 8 && height < 8) {
            const size = 32
            const boxWidth = Math.min(size, photoWidth)
            const boxHeight = Math.min(size, photoHeight)
            onAdd({
              x: Math.max(0, Math.min(photoWidth - boxWidth, current.x - Math.round(boxWidth / 2))),
              y: Math.max(0, Math.min(photoHeight - boxHeight, current.y - Math.round(boxHeight / 2))),
              width: boxWidth,
              height: boxHeight,
            })
          } else {
            onAdd({
              x: Math.min(current.x, pointer.x),
              y: Math.min(current.y, pointer.y),
              width: Math.max(1, width),
              height: Math.max(1, height),
            })
          }
          setDraft(null)
        }}
      />
      {boxes.map((box) => {
        const view = shown(box)
        const adjustable = editable && box.source === "human" && Boolean(onUpdate)
        return (
          <div key={box.id} className={`absolute border-2 ${adjustable ? "cursor-move" : "pointer-events-none"}`} style={{ ...place(view), borderColor: speciesColor(box.species_name) }}>
            {adjustable ? (
              <select
                aria-label={`Espécie da marcação`}
                className="absolute bottom-full left-0 max-w-[12rem] cursor-pointer bg-black/80 px-1 text-[10px] leading-4 text-white"
                value={box.species_id}
                onPointerDown={(event) => event.stopPropagation()}
                onChange={(event) => {
                  const speciesId = event.target.value
                  if (!speciesId) return
                  void Promise.resolve(onUpdate?.(box.id, { species_id: speciesId, x: view.x, y: view.y, width: view.width, height: view.height })).catch(() => undefined)
                }}
              >
                {species.some((item) => item.id === box.species_id) ? null : <option value={box.species_id}>{box.species_name}</option>}
                {species.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="absolute bottom-full left-0 max-w-[12rem] truncate bg-black/75 px-1 text-[10px] leading-4 text-white">
                {box.species_name}
                {box.confidence != null ? ` ${Math.round(box.confidence * 100)}%` : ""}
              </span>
            )}
            {adjustable ? (
              <div
                className="absolute inset-0"
                onPointerDown={(event) => {
                  const start = point(event)
                  if (!start) return
                  gesture.current = { kind: "move", id: box.id, pointerX: start.x, pointerY: start.y, origin: { x: view.x, y: view.y, width: view.width, height: view.height } }
                  event.currentTarget.setPointerCapture(event.pointerId)
                  event.stopPropagation()
                }}
                onPointerMove={(event) => {
                  if (gesture.current?.kind !== "move" || gesture.current.id !== box.id) return
                  const pointer = point(event)
                  if (!pointer) return
                  const current = gesture.current
                  setLiveId(box.id)
                  setLive(
                    clamp({
                      x: current.origin.x + (pointer.x - current.pointerX),
                      y: current.origin.y + (pointer.y - current.pointerY),
                      width: current.origin.width,
                      height: current.origin.height,
                    }),
                  )
                  event.stopPropagation()
                }}
                onPointerUp={(event) => {
                  finishGesture(event)
                  event.stopPropagation()
                }}
              />
            ) : null}
            {editable && box.source === "human" && onRemove ? (
              <button
                type="button"
                aria-label={`Remover marcação de ${box.species_name}`}
                className="absolute -top-2 -right-2 z-10 grid size-4 cursor-pointer place-items-center rounded-full bg-black text-[10px] leading-none text-white"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => onRemove(box.id)}
              >
                ×
              </button>
            ) : null}
            {adjustable ? (
              <button
                type="button"
                aria-label={`Redimensionar marcação de ${box.species_name}`}
                className="absolute -right-1.5 -bottom-1.5 z-10 size-3 cursor-nwse-resize rounded-sm border border-white bg-black"
                onPointerDown={(event) => {
                  gesture.current = { kind: "resize", id: box.id, origin: { x: view.x, y: view.y, width: view.width, height: view.height } }
                  event.currentTarget.setPointerCapture(event.pointerId)
                  event.stopPropagation()
                }}
                onPointerMove={(event) => {
                  if (gesture.current?.kind !== "resize" || gesture.current.id !== box.id) return
                  const pointer = point(event)
                  if (!pointer) return
                  const origin = gesture.current.origin
                  setLiveId(box.id)
                  setLive(clamp({ x: origin.x, y: origin.y, width: pointer.x - origin.x, height: pointer.y - origin.y }))
                  event.stopPropagation()
                }}
                onPointerUp={(event) => {
                  finishGesture(event)
                  event.stopPropagation()
                }}
              />
            ) : null}
          </div>
        )
      })}
      {draft ? <div className="pointer-events-none absolute border-2 border-white" style={place(draft)} /> : null}
    </div>
  )
}
