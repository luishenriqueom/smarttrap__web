"use client"

import { useEffect, useRef, useState } from "react"
import type { Map as LeafletMap, Marker } from "leaflet"

const DEFAULT_CENTER: [number, number] = [-5.0892, -42.8016]

export function LocationMap({
  latitude,
  longitude,
  readOnly = false,
  onChange,
}: {
  latitude: number | null
  longitude: number | null
  readOnly?: boolean
  onChange?: (point: { latitude: number; longitude: number }) => void
}) {
  const node = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  const mapRef = useRef<LeafletMap | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const leafletRef = useRef<typeof import("leaflet") | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    const container = node.current
    if (!container) return
    let cancelled = false
    if (!document.getElementById("leaflet-stylesheet")) {
      const link = document.createElement("link")
      link.id = "leaflet-stylesheet"
      link.rel = "stylesheet"
      link.href = "/leaflet/leaflet.css"
      document.head.appendChild(link)
    }
    void import("leaflet").then((imported) => {
      if (cancelled || !node.current) return
      const leaflet = resolveLeaflet(imported)
      leafletRef.current = leaflet
      const hasPoint = latitude != null && longitude != null
      const map = leaflet.map(node.current, { scrollWheelZoom: true }).setView(hasPoint ? [latitude, longitude] : DEFAULT_CENTER, hasPoint ? 15 : 6)
      leaflet
        .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        })
        .addTo(map)
      mapRef.current = map
      if (!readOnly) {
        map.on("click", (event) => {
          onChangeRef.current?.({ latitude: event.latlng.lat, longitude: event.latlng.lng })
        })
      }
      setReady(true)
    })
    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      markerRef.current = null
      leafletRef.current = null
      setReady(false)
    }
    // The first view uses the coordinates available when the map is created.
    // Later changes move the marker in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly])

  useEffect(() => {
    const map = mapRef.current
    const leaflet = leafletRef.current
    if (!ready || !map || !leaflet) return
    if (latitude == null || longitude == null) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }
    if (!markerRef.current) {
      const marker = leaflet
        .marker([latitude, longitude], { icon: pinIcon(leaflet), draggable: !readOnly })
        .addTo(map)
      if (!readOnly) {
        marker.on("dragend", () => {
          const position = marker.getLatLng()
          onChangeRef.current?.({ latitude: position.lat, longitude: position.lng })
        })
      }
      markerRef.current = marker
      map.setView([latitude, longitude], Math.max(map.getZoom(), 15))
      return
    }
    markerRef.current.setLatLng([latitude, longitude])
    map.panTo([latitude, longitude])
  }, [latitude, longitude, readOnly, ready])

  return <div ref={node} className="z-0 h-72 w-full overflow-hidden rounded-lg border" />
}

function pinIcon(leaflet: typeof import("leaflet")) {
  return leaflet.divIcon({
    className: "",
    html: '<span style="display:block;width:16px;height:16px;margin:1px;border-radius:999px;background:#166534;border:2px solid #fff;box-shadow:0 1px 4px rgb(0 0 0 / 45%)"></span>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
}

function resolveLeaflet(imported: typeof import("leaflet")) {
  const withDefault = imported as typeof import("leaflet") & { default?: typeof import("leaflet") }
  return withDefault.default?.map ? withDefault.default : imported
}
