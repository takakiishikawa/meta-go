import { createClient } from "@/lib/supabase/server"
import { PageHeader, SettingsGroup, SettingsItem } from "@takaki/go-design-system"
import { Badge } from "@takaki/go-design-system"

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const displayName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "—"
  const email = user?.email || "—"
  const avatarUrl = user?.user_metadata?.avatar_url || null

  return (
    <>
      <PageHeader title="設定" description="MetaGoの設定とプロフィール情報" />

      <SettingsGroup title="プロフィール" description="Googleアカウントの情報">
        {avatarUrl && (
          <SettingsItem
            label="アバター"
            control={
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt={displayName} className="size-8 rounded-full" />
            }
          />
        )}
        <SettingsItem label="名前" control={<span className="text-sm text-foreground">{displayName}</span>} />
        <SettingsItem label="メール" control={<span className="text-sm text-foreground">{email}</span>} />
      </SettingsGroup>

      <SettingsGroup title="MetaGoについて" description="バージョンと環境情報">
        <SettingsItem
          label="バージョン"
          control={<Badge variant="outline">Phase 1</Badge>}
        />
        <SettingsItem
          label="データベース"
          control={<span className="text-sm text-foreground">Supabase (metago schema)</span>}
        />
        <SettingsItem
          label="対象プロダクト"
          control={<span className="text-sm text-foreground">NativeGo / CareGo / KenyakuGo / CookGo / PhysicalGo / TaskGo</span>}
        />
      </SettingsGroup>
    </>
  )
}
