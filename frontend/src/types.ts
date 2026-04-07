export type ReviewStatus = "in_progress" | "completed";

export interface ReviewTask {
  id: number;
  name: string;
  proposal_body: string | null;
  summary_highlights: string | null;
  summary_issues: string | null;
  review_summary: string | null;
  created_at: string | null;
  review_status: ReviewStatus;
  username: string;
  llm_agent_id?: number | null;
}

export type LlmProvider = "deepseek" | "openai" | "custom";

export interface LlmAgent {
  id: number;
  name: string;
  provider: LlmProvider;
  api_base: string | null;
  model: string;
  key_hint: string;
  system_prompt: string | null;
  created_at: string | null;
}

export interface AiSuggestResult {
  items: { indicator_id: number; score: number; notes: string }[];
  raw_excerpt: string;
  agent_id: number;
  agent_name: string;
}

export interface AiReportResult {
  items: { indicator_id: number; score: number; notes: string; opinion: string }[];
  conclusion: string;
  highlights: string;
  issues: string;
  raw_excerpt: string;
  agent_id: number;
  agent_name: string;
}

export interface Secondary {
  id: string;
  title: string;
  audit_points: string[];
  basis: string[];
}

export interface Indicator {
  id: number;
  key: string;
  title: string;
  goal: string;
  verdict_rules: string;
  veto: boolean;
  critical: boolean;
  secondaries: Secondary[];
}

export interface Framework {
  meta: {
    title: string;
    description: string;
    principles: string[];
    project_types?: { id: string; label: string }[];
    optional_weights_note?: string;
  };
  indicators: Indicator[];
}

export interface IndicatorScoreRow {
  id: number;
  task_id: number;
  indicator_id: number;
  score: number | null;
  notes: string | null;
}

export interface IndicatorReportRow {
  indicator_id: number;
  title: string;
  score: number | null;
  max_score: number;
  notes: string | null;
}

export interface OverallReport {
  task_id: number;
  task_name: string;
  total_score: number;
  max_total: number;
  conclusion_code: "pass" | "rectify" | "reject";
  conclusion_label: string;
  reasons: string[];
  indicators: IndicatorReportRow[];
  summary_highlights: string | null;
  summary_issues: string | null;
  review_summary: string | null;
}

export interface Attachment {
  id: number;
  task_id: number;
  original_name: string;
  category: string | null;
}
