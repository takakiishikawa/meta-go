export interface Product {
  id: string;
  name: string;
  display_name: string;
  description: string;
  github_repo: string;
  vercel_url: string;
  primary_color: string;
  priority: number;
  created_at: string;
}

export interface ScoreHistory {
  id: string;
  product_id: string;
  category: string;
  score: number;
  collected_at: string;
}

export interface QualityItem {
  id: string;
  product_id: string;
  category: string;
  title: string;
  description: string;
  state: "new" | "done";
  level: "L1" | "L2" | "L3";
  pr_url: string | null;
  created_at: string;
  resolved_at: string | null;
  products?: { display_name: string; primary_color: string };
}

export interface SecurityItem {
  id: string;
  product_id: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  cve: string | null;
  description: string;
  state: string;
  pr_url: string | null;
  created_at: string;
  resolved_at: string | null;
  products?: { display_name: string; primary_color: string };
}

export interface DependencyItem {
  id: string;
  product_id: string;
  package_name: string;
  current_version: string;
  latest_version: string;
  update_type: "patch" | "minor" | "major" | "framework";
  state: "new" | "done" | "in_progress";
  pr_url: string | null;
  created_at: string;
  products?: { display_name: string; primary_color: string };
}

export interface DesignSystemItem {
  id: string;
  product_id: string;
  category: string;
  title: string;
  description: string;
  state: string;
  pr_url: string | null;
  created_at: string;
  products?: { display_name: string; primary_color: string };
}

export interface PerformanceMetric {
  id: string;
  product_id: string;
  lcp: number | null;
  fid: number | null;
  cls: number | null;
  api_avg: number | null;
  bundle_size: number | null;
  score: number;
  measured_at: string;
  products?: { display_name: string; primary_color: string };
}

export interface CostRecord {
  id: string;
  product_id: string;
  service: string;
  amount: number;
  currency: string;
  recorded_at: string;
  products?: { display_name: string; primary_color: string };
}

export interface ExecutionLog {
  id: string;
  product_id: string;
  category: string;
  title: string;
  description: string;
  level: string;
  state: "merged" | "pending" | "failed";
  pr_url: string | null;
  created_at: string;
  products?: { display_name: string; primary_color: string };
}

export interface PsfScore {
  id: string;
  product_id: string;
  psf_score: number;
  result_score: number;
  behavior_score: number;
  result_details: Record<string, unknown>;
  behavior_details: Record<string, unknown>;
  trend: string | null;
  collected_at: string;
  products?: { display_name: string; primary_color: string };
}

export interface EngagementHistory {
  id: string;
  product_id: string;
  usage_count: number;
  trend: string | null;
  measured_at: string;
  products?: { display_name: string; primary_color: string };
}

export interface Hypothesis {
  id: string;
  product_id: string;
  type: "problem" | "solution";
  parent_hypothesis_id: string | null;
  title: string;
  description: string;
  confidence: number | null;
  state: string;
  created_at: string;
  resolved_at: string | null;
  products?: { display_name: string; primary_color: string };
}

export interface Backlog {
  id: string;
  product_id: string;
  title: string;
  description: string;
  priority: "High" | "Med" | "Low";
  state: string;
  created_at: string;
  products?: { display_name: string; primary_color: string };
}
