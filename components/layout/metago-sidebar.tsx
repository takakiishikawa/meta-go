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

export interface SidebarScores {
  quality: number | null;
  security: number | null;
  design_system: number | null;
  performance: number | null;
}

type ScoreKey = keyof SidebarScores;

interface NavItem {
  title: string;
  href: string;
  icon: typeof LayoutDashboard;
  scoreKey?: ScoreKey;
}

const navGroups: { label: string; items: NavItem[] }[] = [
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
      {
        title: "Code Quality",
        href: "/quality",
        icon: Code2,
        scoreKey: "quality",
      },
      {
        title: "Security",
        href: "/security",
        icon: ShieldCheck,
        scoreKey: "security",
      },
      { title: "Dependencies", href: "/dependency", icon: Package },
      {
        title: "Design System",
        href: "/design-system",
        icon: Palette,
        scoreKey: "design_system",
      },
      {
        title: "Performance",
        href: "/performance",
        icon: Gauge,
        scoreKey: "performance",
      },
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

function scoreColor(score: number): string {
  if (score >= 80) return "#36B37E";
  if (score >= 60) return "#FF8B00";
  return "#FF5630";
}

export function MetaGoSidebar({ scores }: { scores?: SidebarScores }) {
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
                  const score =
                    item.scoreKey && scores ? scores[item.scoreKey] : null;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={pathname === item.href}
                      >
                        <Link
                          href={item.href}
                          className="flex w-full items-center gap-2"
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          <span className="flex-1 truncate">{item.title}</span>
                          {score !== null && (
                            <span
                              className="ml-auto text-xs font-semibold tabular-nums"
                              style={{ color: scoreColor(score) }}
                            >
                              {score}
                            </span>
                          )}
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
