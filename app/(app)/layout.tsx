import { redirect } from "next/navigation";
import { AppLayout } from "@takaki/go-design-system";
import { MetaGoSidebar } from "@/components/layout/metago-sidebar";
import { createClient } from "@/lib/supabase/server";

export default async function AppRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <AppLayout
      sidebar={<MetaGoSidebar />}
      mainClassName="flex flex-col gap-6 p-6"
    >
      {children}
    </AppLayout>
  );
}
