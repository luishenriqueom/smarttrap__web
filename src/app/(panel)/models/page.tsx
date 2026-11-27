export const instant = false

import { Suspense } from "react"
import ModelsScreen from "./models-screen"

export default function ModelsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando...</p>}>
      <ModelsScreen />
    </Suspense>
  )
}
