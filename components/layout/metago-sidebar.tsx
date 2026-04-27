"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  ClipboardList,
  Code2,
  ShieldCheck,
  Package,
  Palette,
  Gauge,
  Rocket,
  TrendingUp,
  Activity,
  Lightbulb,
  Layers,
  Key,
  Sun,
  Moon,
} from "lucide-react";
import {
  AppSwitcher,
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
  UserMenu,
} from "@takaki/go-design-system";
import { createClient } from "@/lib/supabase/client";
import type {
  DeliveryHref,
  DeliveryStats,
  MenuStats,
} from "@/lib/metago/delivery-stats";

const GO_APPS = [
  { name: "MetaGo", url: "https://metago.vercel.app/", color: "#1E3A8A" },
  {
    name: "NativeGo",
    url: "https://english-learning-app-black.vercel.app/",
    color: "#0052CC",
  },
  {
    name: "CareGo",
    url: "https://care-go-mu.vercel.app/dashboard",
    color: "#00875A",
  },
  {
    name: "KenyakuGo",
    url: "https://kenyaku-go.vercel.app/",
    color: "#FF5630",
  },
  {
    name: "CookGo",
    url: "https://cook-go-lovat.vercel.app/dashboard",
    color: "#FF991F",
  },
  {
    name: "PhysicalGo",
    url: "https://physical-go.vercel.app/dashboard",
    color: "#6554C0",
  },
  { name: "TaskGo", url: "https://taskgo-dun.vercel.app/", color: "#00B8D9" },
  {
    name: "DesignSystem",
    url: "https://github.com/takakiishikawa/go-design-system",
    color: "#7C3AED",
  },
];

const navGroups = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { title: "Approvals", href: "/approval", icon: ClipboardList },
    ],
  },
  {
    label: "Delivery",
    items: [
      { title: "Code Quality", href: "/quality", icon: Code2 },
      { title: "Security", href: "/security", icon: ShieldCheck },
      { title: "Dependencies", href: "/dependency", icon: Package },
      { title: "Design System", href: "/design-system", icon: Palette },
      { title: "Performance", href: "/performance", icon: Gauge },
      { title: "Deployments", href: "/deployments", icon: Rocket },
    ],
  },
  {
    label: "Discovery",
    items: [
      { title: "PSF", href: "/psf", icon: TrendingUp },
      { title: "Engagement", href: "/engagement", icon: Activity },
      { title: "Hypotheses", href: "/hypothesis", icon: Lightbulb },
    ],
  },
];

function formatDelta(n: number): string {
  if (n === 0) return "±0";
  return n > 0 ? `+${n}` : `${n}`;
}

function MenuStatsLine({ stats }: { stats: MenuStats }) {
  // 「未対応 N (+Δ7d) / 解決 N (+Δ7d)」を sidebar 1 行に詰めるため、
  // 各値は等幅っぽく見える小さい text にする。
  return (
    <span
      className="text-[10px] leading-tight text-muted-foreground tabular-nums"
      style={{ marginLeft: "1.5rem" }}
    >
      未対応 {stats.open}
      {stats.newLast7d > 0 && (
        <span className="text-warning"> ({formatDelta(stats.newLast7d)})</span>
      )}
      <span> / </span>
      解決 {stats.resolved}
      {stats.resolvedLast7d > 0 && (
        <span className="text-success">
          {" "}
          ({formatDelta(stats.resolvedLast7d)})
        </span>
      )}
    </span>
  );
}

export function MetaGoSidebar({
  deliveryStats,
}: {
  deliveryStats?: DeliveryStats;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [displayName, setDisplayName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [avatarUrl, setAvatarUrl] = React.useState("");
  const [isDark, setIsDark] = React.useState(false);

  React.useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setDisplayName(
        user.user_metadata?.display_name || user.email?.split("@")[0] || "User",
      );
      setEmail(user.email || "");
      setAvatarUrl(user.user_metadata?.avatar_url || "");
    });
    const update = () =>
      setIsDark(document.documentElement.classList.contains("dark"));
    update();
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, []);

  function toggleTheme() {
    const next = isDark ? "light" : "dark";
    localStorage.setItem("theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <Sidebar>
      <SidebarHeader>
        <AppSwitcher currentApp="MetaGo" apps={GO_APPS} placement="bottom" />
      </SidebarHeader>

      <SidebarContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const stats = deliveryStats?.[item.href as DeliveryHref];
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={pathname === item.href}
                        className={stats ? "h-auto py-2" : undefined}
                      >
                        <Link
                          href={item.href}
                          className="flex flex-col items-stretch gap-0.5"
                        >
                          <span className="flex items-center gap-2">
                            <item.icon className="h-4 w-4 shrink-0" />
                            {item.title}
                          </span>
                          {stats && <MenuStatsLine stats={stats} />}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <UserMenu
          displayName={displayName || "—"}
          email={email}
          avatarUrl={avatarUrl}
          items={[
            {
              title: "Concept",
              icon: Layers,
              onSelect: () => router.push("/concept"),
              isActive: pathname === "/concept",
            },
            {
              title: "API Keys",
              icon: Key,
              onSelect: () => router.push("/apis"),
              isActive: pathname === "/apis",
            },
            {
              title: isDark ? "Dark" : "Light",
              icon: isDark ? Moon : Sun,
              onSelect: toggleTheme,
            },
          ]}
          signOut={{ onSelect: handleSignOut }}
        />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
