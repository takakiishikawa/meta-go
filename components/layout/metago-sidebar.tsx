"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import {
  LayoutDashboard,
  ClipboardList,
  Code2,
  ShieldCheck,
  Package,
  Palette,
  Gauge,
  DollarSign,
  ScrollText,
  TrendingUp,
  Activity,
  Lightbulb,
  Settings,
  Layers,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarFooter,
} from "@takaki/go-design-system"
import { cn } from "@/lib/utils"

const navGroups = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { title: "承認待ち", href: "/approval", icon: ClipboardList },
    ],
  },
  {
    label: "Delivery",
    badge: "P1",
    items: [
      { title: "コード品質", href: "/quality", icon: Code2 },
      { title: "セキュリティ", href: "/security", icon: ShieldCheck },
      { title: "依存・技術スタック", href: "/dependency", icon: Package },
      { title: "デザインシステム", href: "/design-system", icon: Palette },
      { title: "パフォーマンス", href: "/performance", icon: Gauge },
      { title: "コスト", href: "/cost", icon: DollarSign },
      { title: "実行ログ", href: "/exec-log", icon: ScrollText },
    ],
  },
  {
    label: "Discovery",
    badge: "P2",
    items: [
      { title: "PSF", href: "/psf", icon: TrendingUp },
      { title: "使用パターン", href: "/engagement", icon: Activity },
      { title: "仮説・バックログ", href: "/hypothesis", icon: Lightbulb },
    ],
  },
  {
    label: "Settings",
    items: [
      { title: "Concept", href: "/concept", icon: Layers },
      { title: "設定", href: "/settings", icon: Settings },
    ],
  },
]

export function MetaGoSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar className="border-r border-border" style={{ width: 240 }}>
      <SidebarHeader className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div
            className="flex size-8 shrink-0 items-center justify-center rounded-md"
            style={{ backgroundColor: "var(--color-primary)" }}
          >
            <span className="text-sm font-bold text-white">M</span>
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-foreground text-sm">MetaGo</span>
            <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
              PSF Product Manager
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="py-2">
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="flex items-center gap-2">
              {group.label}
              {group.badge && (
                <span
                  className="rounded px-1 text-[10px] font-medium"
                  style={{
                    backgroundColor: "var(--color-surface-subtle)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {group.badge}
                </span>
              )}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive = pathname === item.href
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive}>
                        <Link href={item.href} className="flex items-center gap-2">
                          <item.icon className="size-4 shrink-0" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  )
}
