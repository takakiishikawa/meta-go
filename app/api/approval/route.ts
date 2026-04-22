import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const PRODUCT_REPOS: Record<string, string> = {
  "native-go":   "nativego",
  "care-go":     "carego",
  "kenyaku-go":  "kenyakugo",
  "cook-go":     "cookgo",
  "physical-go": "physicalgo",
  "task-go":     "taskgo",
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  const receivedKey = authHeader?.replace("Bearer ", "").trim()

  if (!receivedKey || receivedKey !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { repo, title, description, category, level, pr_url } = body

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // repo は "owner/repo-name" 形式で届く
  const repoName = String(repo ?? "").split("/")[1] ?? ""
  const productSlug = PRODUCT_REPOS[repoName]

  let product_id: string | null = null
  if (productSlug) {
    const { data: product } = await supabase
      .schema("metago")
      .from("products")
      .select("id")
      .eq("name", productSlug)
      .single()
    product_id = product?.id ?? null
  }

  const { error } = await supabase.schema("metago").from("approval_queue").insert({
    product_id,
    title: String(title),
    description: description ? String(description) : null,
    category: category ? String(category) : "dependency",
    state: "pending",
    meta: {
      pr_url: pr_url ?? null,
      level: level ?? "L2",
      repo: repo ?? null,
    },
  })

  if (error) {
    console.error("approval_queue insert error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
