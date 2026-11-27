"use client"

import { useCallback } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"

export function usePageParam() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const page = pageFrom(searchParams.get("page"))
  const setPage = useCallback(
    (next: number) => {
      const params = new URLSearchParams(searchParams.toString())
      const target = Math.max(1, Math.floor(next))
      if (target <= 1) params.delete("page")
      else params.set("page", String(target))
      const query = params.toString()
      router.replace(query ? `${pathname}?${query}` : pathname)
    },
    [pathname, router, searchParams],
  )
  return { page, setPage }
}

function pageFrom(value: string | null) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) return 1
  return parsed
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number
  pageSize: number
  total: number
  onPage: (page: number) => void
}) {
  if (total <= pageSize) return null
  const pages = Math.ceil(total / pageSize)
  const items = pageList(page, pages)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Anterior
        </Button>
        {items.map((item, index) =>
          item === "gap" ? (
            <span key={`gap-${index}`} className="px-1 text-sm text-muted-foreground">
              …
            </span>
          ) : (
            <Button
              key={item}
              type="button"
              size="sm"
              variant={item === page ? "default" : "outline"}
              aria-current={item === page ? "page" : undefined}
              aria-label={`Página ${item}`}
              onClick={() => onPage(item)}
            >
              {item}
            </Button>
          ),
        )}
        <Button type="button" variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Próxima
        </Button>
      </div>
    </div>
  )
}

function pageList(current: number, total: number) {
  const wanted = new Set([1, total, current - 1, current, current + 1])
  const sorted = [...wanted].filter((item) => item >= 1 && item <= total).sort((a, b) => a - b)
  const items: Array<number | "gap"> = []
  let previous = 0
  for (const item of sorted) {
    if (previous && item - previous > 1) items.push("gap")
    items.push(item)
    previous = item
  }
  return items
}
