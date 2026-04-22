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
  LogOut,
  Sun,
  Moon,
  ChevronsUpDown,
  Check,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@takaki/go-design-system"
import { createClient } from "@/lib/supabase/client"

// ---------------------------------------------------------------------------
// Go apps list
// ---------------------------------------------------------------------------

const GO_APPS = [
  { name: "MetaGo",     url: "https://metago.vercel.app/",                        color: "#1E3A8A" },
  { name: "NativeGo",   url: "https://english-learning-app-black.vercel.app/",    color: "#0052CC" },
  { name: "CareGo",     url: "https://care-go-mu.vercel.app/dashboard",           color: "#00875A" },
  { name: "KenyakuGo",  url: "https://kenyaku-go.vercel.app/",                    color: "#FF5630" },
  { name: "CookGo",     url: "https://cook-go-lovat.vercel.app/dashboard",        color: "#FF991F" },
  { name: "PhysicalGo", url: "https://physical-go.vercel.app/dashboard",          color: "#6554C0" },
  { name: "TaskGo",     url: "https://taskgo-dun.vercel.app/",                    color: "#00B8D9" },
] as const

// ---------------------------------------------------------------------------
// Nav groups
// ---------------------------------------------------------------------------

const navGroups = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard",   href: "/dashboard", icon: LayoutDashboard },
      { title: "承認待ち",    href: "/approval",  icon: ClipboardList },
    ],
  },
  {
    label: "Delivery",
    badge: "P1",
    items: [
      { title: "コード品質",       href: "/quality",        icon: Code2 },
      { title: "セキュリティ",     href: "/security",       icon: ShieldCheck },
      { title: "依存・技術スタック", href: "/dependency",   icon: Package },
      { title: "デザインシステム", href: "/design-system",  icon: Palette },
      { title: "パフォーマンス",   href: "/performance",    icon: Gauge },
      { title: "コスト",           href: "/cost",           icon: DollarSign },
      { title: "実行ログ",         href: "/exec-log",       icon: ScrollText },
    ],
  },
  {
    label: "Discovery",
    badge: "P2",
    items: [
      { title: "PSF",          href: "/psf",        icon: TrendingUp },
      { title: "使用パターン", href: "/engagement", icon: Activity },
      { title: "仮説・バックログ", href: "/hypothesis", icon: Lightbulb },
    ],
  },
]

const footerNavItems = [
  { title: "Concept", href: "/concept",  icon: Layers },
  { title: "設定",    href: "/settings", icon: Settings },
]

// ---------------------------------------------------------------------------
// MetaGoSidebar
// ---------------------------------------------------------------------------

export function MetaGoSidebar() {
  const pathname = usePathname()
  const [displayName, setDisplayName] = React.useState("")
  const [avatarUrl, setAvatarUrl] = React.useState("")
  const [isDark, setIsDark] = React.useState(false)

  React.useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setDisplayName(user.user_metadata?.display_name || user.email?.split("@")[0] || "User")
      setAvatarUrl(user.user_metadata?.avatar_url || "")
    })
    const update = () => setIsDark(document.documentElement.classList.contains("dark"))
    update()
    const obs = new MutationObserver(update)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => obs.disconnect()
  }, [])

  function toggleTheme() {
    const next = isDark ? "light" : "dark"
    localStorage.setItem("theme", next)
    document.documentElement.classList.toggle("dark", next === "dark")
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  const initials = (displayName || "M").charAt(0).toUpperCase()

  return (
    <Sidebar>
      {/* ヘッダー：AppSwitcher */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <span
                    className="flex size-5 shrink-0 items-center justify-center rounded-md font-bold text-white text-xs"
                    style={{ backgroundColor: "#1E3A8A" }}
                  >
                    M
                  </span>
                  <div className="flex flex-col gap-0.5 leading-none min-w-0">
                    <span className="text-xs text-muted-foreground">App</span>
                    <span className="text-[15px] font-medium tracking-tight truncate">MetaGo</span>
                  </div>
                  <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-52"
                align="start"
                side="bottom"
                sideOffset={4}
              >
                <DropdownMenuLabel className="text-xs text-muted-foreground">Goシリーズ</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {GO_APPS.map((app) => (
                  <DropdownMenuItem
                    key={app.name}
                    onSelect={() => { window.location.href = app.url }}
                    className="gap-2"
                  >
                    <span
                      className="shrink-0 rounded-full"
                      style={{ width: 8, height: 8, backgroundColor: app.color }}
                      aria-hidden
                    />
                    <span className="flex-1">{app.name}</span>
                    {app.name === "MetaGo" && <Check className="h-4 w-4 shrink-0 opacity-70" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* メインナビ */}
      <SidebarContent>
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
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={pathname === item.href}>
                      <Link href={item.href}>
                        <item.icon className="h-4 w-4 shrink-0" />
                        {item.title}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* フッター：ユーザー・設定・テーマ・ログアウト */}
      <SidebarFooter>
        <SidebarMenu>
          {/* ユーザー */}
          <SidebarMenuItem>
            <SidebarMenuButton className="cursor-pointer">
              <Avatar className="h-5 w-5 shrink-0">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <span className="truncate flex-1 min-w-0">{displayName || "—"}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {/* Concept / 設定 */}
          {footerNavItems.map(({ title, href, icon: Icon }) => (
            <SidebarMenuItem key={href}>
              <SidebarMenuButton asChild isActive={pathname === href}>
                <Link href={href}>
                  <Icon className="h-4 w-4 shrink-0" />
                  {title}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}

          {/* テーマ切り替え */}
          <SidebarMenuItem>
            <SidebarMenuButton onClick={toggleTheme} className="cursor-pointer">
              {isDark
                ? <Moon className="h-4 w-4 shrink-0" />
                : <Sun className="h-4 w-4 shrink-0" />
              }
              {isDark ? "ダーク" : "ライト"}
            </SidebarMenuButton>
          </SidebarMenuItem>

          {/* ログアウト */}
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleSignOut} className="cursor-pointer">
              <LogOut className="h-4 w-4 shrink-0" />
              ログアウト
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
