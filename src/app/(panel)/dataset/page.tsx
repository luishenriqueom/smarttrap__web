export const instant = false

import { Suspense } from "react"
import DatasetScreen from "./dataset-screen"

export default function DatasetPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando...</p>}>
      <DatasetScreen />
    </Suspense>
  )
}
