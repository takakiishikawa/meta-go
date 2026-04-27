import { redirect } from "next/navigation";
import { AppLayout } from "@takaki/go-design-system";
import { MetaGoSidebar } from "@/components/layout/metago-sidebar";
import { createClient } from "@/lib/supabase/server";
import { fetchDeliveryStats } from "@/lib/metago/delivery-stats";

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

  const deliveryStats = await fetchDeliveryStats(supabase);

  return (
    <AppLayout
      sidebar={<MetaGoSidebar deliveryStats={deliveryStats} />}
      mainClassName="flex flex-col gap-6 p-6"
    >
      {children}
    </AppLayout>
  );
}
