import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

function getMonthRange() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const start = new Date(y, m, 1).toISOString().split("T")[0]
  const end = new Date(y, m + 1, 0).toISOString().split("T")[0]
  const period = `${y}-${String(m + 1).padStart(2, "0")}`
  return { start, end, period }
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("Authorization")
  if (auth !== `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { start, end, period } = getMonthRange()
  const results: Record<string, string> = {}

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (anthropicKey) {
    try {
      const res = await fetch(
        `https://api.anthropic.com/v1/usage?start_date=${start}&end_date=${end}`,
        {
          headers: {
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
          },
        }
      )
      if (res.ok) {
        const data = await res.json()
        const cost: number | null = typeof data.total_cost_usd === "number" ? data.total_cost_usd : null
        if (cost !== null) {
          await supabase.schema("metago").from("api_keys")
            .update({ cost_usd: cost, cost_period: period })
            .eq("env_var_name", "ANTHROPIC_API_KEY")
          results.anthropic = `$${cost.toFixed(4)}`
        } else {
          results.anthropic = `ok but no cost field: ${JSON.stringify(data).slice(0, 200)}`
        }
      } else {
        results.anthropic = `HTTP ${res.status}`
      }
    } catch (e) {
      results.anthropic = `error: ${e}`
    }
  } else {
    results.anthropic = "ANTHROPIC_API_KEY not set"
  }

  const openaiKey = process.env.OPENAI_API_KEY
  if (openaiKey) {
    try {
      const res = await fetch(
        `https://api.openai.com/v1/dashboard/billing/usage?start_date=${start}&end_date=${end}`,
        { headers: { Authorization: `Bearer ${openaiKey}` } }
      )
      if (res.ok) {
        const data = await res.json()
        const cost: number | null = typeof data.total_usage === "number" ? data.total_usage / 100 : null
        if (cost !== null) {
          await supabase.schema("metago").from("api_keys")
            .update({ cost_usd: cost, cost_period: period })
            .eq("env_var_name", "OPENAI_API_KEY")
          results.openai = `$${cost.toFixed(4)}`
        } else {
          results.openai = "no cost field"
        }
      } else {
        results.openai = `HTTP ${res.status}`
      }
    } catch (e) {
      results.openai = `error: ${e}`
    }
  } else {
    results.openai = "OPENAI_API_KEY not set"
  }

  return NextResponse.json({ period, results })
}
