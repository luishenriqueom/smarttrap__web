"use client"

import { Brain, Bug, Cpu, Crosshair, Images, LayoutDashboard, LogOut, Radio, Users } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth"
import { roleLabel } from "@/lib/format"
import type { User } from "@/lib/types"
import { cn } from "cn"

const links = [
  { href: "/", label: "Visão geral", icon: LayoutDashboard },
  { href: "/traps", label: "Armadilhas", icon: Radio },
  { href: "/dataset", label: "Dataset", icon: Images },
  { href: "/species", label: "Espécies", icon: Bug },
  { href: "/models", label: "Modelos", icon: Brain },
]

export function Shell({ user, children }: { user: User; children: React.ReactNode }) {
  const pathname = usePathname()
  const { logout } = useAuth()
  const items =
    user.role === "superadmin"
      ? [...links, { href: "/firmware", label: "Firmware", icon: Cpu }, { href: "/users", label: "Usuários", icon: Users }]
      : links

  return (
    <div className="flex min-h-dvh bg-background">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col self-start bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex items-center gap-3 px-5 py-6">
          <span className="grid size-10 place-items-center rounded-xl bg-sidebar-accent">
            <Crosshair className="size-5 text-sidebar-primary" />
          </span>
          <div>
            <p className="font-heading text-base font-semibold">Smart Trap</p>
            <p className="text-xs text-sidebar-foreground/70">Monitoramento de campo</p>
          </div>
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3">
          {items.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(pathname, item.href)} />
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-4">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <Badge variant="secondary" className="mt-2 bg-sidebar-accent text-sidebar-accent-foreground">
            {roleLabel(user.role, user.is_demo)}
          </Badge>
          <Button variant="ghost" className="mt-3 w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" onClick={logout}>
            <LogOut />
            Sair
          </Button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 border-b bg-sidebar px-4 py-3 text-sidebar-foreground md:hidden">
          <p className="font-semibold">Smart Trap</p>
          <Button size="sm" variant="ghost" className="text-sidebar-foreground" onClick={logout}>
            Sair
          </Button>
        </div>
        <nav className="flex gap-2 overflow-x-auto border-b bg-sidebar px-3 py-2 md:hidden">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm whitespace-nowrap",
                isActive(pathname, item.href) ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {user.is_demo ? (
          <div className="border-b bg-amber-50 px-6 py-3 text-sm text-amber-950">
            Você está na demonstração. Os dados são somente leitura.
          </div>
        ) : null}
        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  )
}

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof Radio; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
        active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70",
      )}
    >
      <Icon className="size-4" />
      {label}
    </Link>
  )
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}
