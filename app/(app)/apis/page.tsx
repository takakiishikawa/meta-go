import { createClient } from "@/lib/supabase/server"
import { ApisClient } from "./apis-client"

export default async function ApisPage() {
  const supabase = await createClient()

  const [keysRes, productsRes] = await Promise.all([
    supabase
      .schema("metago")
      .from("api_keys")
      .select("*")
      .order("env_var_name"),
    supabase
      .schema("metago")
      .from("products")
      .select("id, name, display_name, primary_color")
      .order("priority"),
  ])

  return (
    <ApisClient
      apiKeys={keysRes.data ?? []}
      products={productsRes.data ?? []}
    />
  )
}
