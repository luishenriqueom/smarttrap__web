export const instant = false

import { PanelGate } from "@/components/panel-gate"

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return <PanelGate>{children}</PanelGate>
}
