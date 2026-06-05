export type ReviewStatus = "in_progress" | "completed";
/** 方案预审 / 实施方案审核 */
export type ReviewPhase = "pre_review" | "implementation";
export type UserRole = "admin" | "user";
export type AnalysisStatus =
  | "draft"
  | "parsing"
  | "indexed"
  | "reviewing"
  | "reviewed"
  | "failed";
export type IssueSeverity = "serious" | "major" | "minor";
export type IssueStatus = "open" | "accepted" | "dismissed" | "revised";

export interface ReviewTask {
  id: number;
  name: string;
  project_key: string | null;
  version: string | null;
  proposal_body: string | null;
  summary_highlights: string | null;
  summary_issues: string | null;
  review_summary: string | null;
  created_at: string | null;
  updated_at: string | null;
  review_status: ReviewStatus;
  username: string;
  llm_agent_id?: number | null;
  analysis_status: AnalysisStatus;
  doc_total_chars: number | null;
  doc_total_chunks: number | null;
  overall_assessment: string | null;
  missing_materials: string | null;
  phase: ReviewPhase;
  project_id?: number | null;
  framework_version_id?: number | null;
}

export interface ReviewProject {
  id: number;
  name: string;
  unit_name: string | null;
  external_code: string | null;
  created_at: string | null;
}

export interface FrameworkVersionInfo {
  id: number;
  phase: string;
  version_seq: number;
  original_filename: string;
  created_at: string | null;
  text_char_count: number;
  /** 上传人显示名或登录名 */
  username?: string;
}

export interface FrameworkCurrentResponse {
  phase: string;
  current: FrameworkVersionInfo | null;
}

/** GET /api/review-framework/{phase}/preview-text */
export interface FrameworkCriteriaPreview {
  phase: string;
  version_seq: number;
  original_filename: string;
  created_at: string | null;
  username?: string;
  text: string;
  text_was_truncated: boolean;
}

export interface AppUser {
  id: number;
  username: string;
  display_name: string;
  role: UserRole;
  is_active: boolean;
  avatar_url: string | null;
  created_at: string | null;
  updated_at: string | null;
  updated_by_name?: string;
}

/** 列表接口统一分页结构 */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

/** GET /api/review-tasks/metrics */
export interface ReviewTaskMetrics {
  total: number;
  in_progress: number;
  completed: number;
}

export interface AuthResult {
  token: string;
  user: AppUser;
}

export interface BootstrapStatus {
  needs_bootstrap: boolean;
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
  updated_at: string | null;
  /** 归属用户显示名或登录名 */
  username?: string;
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

export interface ReviewDimension {
  id: number;
  key: string;
  title: string;
  goal: string;
  review_focus: string[];
  query_terms: string[];
  serious_rules: string[];
  major_rules: string[];
  minor_rules: string[];
  required_evidence: string[];
  common_missing_items: string[];
  manual_review_triggers: string[];
}

export interface Framework {
  meta: {
    title: string;
    description: string;
    principles: string[];
    project_types?: { id: string; label: string }[];
    optional_weights_note?: string;
  };
  /** 历史框架字段；当前以 dimensions 驱动问题审查 */
  indicators?: Indicator[];
  dimensions?: ReviewDimension[];
}

export interface Attachment {
  id: number;
  task_id: number;
  original_name: string;
  category: string | null;
}

export interface DocumentFile {
  id: number;
  task_id: number;
  attachment_id: number | null;
  file_name: string;
  file_type: string | null;
  parse_status: "pending" | "parsing" | "done" | "failed";
  page_count: number | null;
  char_count: number | null;
  outline_json: string | null;
  parse_error: string | null;
}

export interface DocumentChunk {
  id: number;
  task_id: number;
  document_file_id: number;
  chunk_index: number;
  section_title: string | null;
  page_from: number | null;
  page_to: number | null;
  char_count: number | null;
  token_estimate: number | null;
  content: string;
  summary: string | null;
  keywords_json: string | null;
  dimension_hints_json: string | null;
}

export interface ReviewEvidence {
  id: number;
  issue_id: number;
  chunk_id: number | null;
  file_name: string;
  page_from: number | null;
  page_to: number | null;
  section_title: string | null;
  quote_text: string;
  rank_score: number | null;
}

export interface ReviewIssue {
  id: number;
  task_id: number;
  review_run_id: number | null;
  dimension_id: number;
  dimension_key: string | null;
  dimension_title: string;
  severity: IssueSeverity;
  title: string;
  description: string;
  reason: string | null;
  suggestion: string | null;
  needs_supplement: boolean;
  manual_review: boolean;
  status: IssueStatus;
  evidences: ReviewEvidence[];
}

export interface ReviewIssueSummary {
  overall_assessment: string | null;
  serious_count: number;
  major_count: number;
  minor_count: number;
  missing_materials: string[];
  manual_focus: string[];
}

export interface ReviewIssueListResult {
  summary: ReviewIssueSummary;
  items: ReviewIssue[];
}

export interface AnalysisStatusResult {
  task_id: number;
  analysis_status: AnalysisStatus;
  doc_total_chars: number | null;
  doc_total_chunks: number | null;
  files: DocumentFile[];
}

export interface DimensionTokenEstimate {
  dimension_id: number;
  dimension_title: string;
  retrieved_chunks: number;
  input_tokens: number;
  output_tokens: number;
}

export interface TaskTokenEstimate {
  task_id: number;
  parser_engine: string;
  parser_mode: string | null;
  local_chunk_tokens: number;
  llm_chunking_tokens: number;
  review_input_tokens: number;
  review_output_tokens: number;
  total_llm_tokens: number;
  assumptions: string[];
  dimensions: DimensionTokenEstimate[];
  model_provider: string | null;
  model_name: string | null;
  price_display_name: string | null;
  pricing_source_name: string | null;
  pricing_source_url: string | null;
  input_price_per_million_usd: number | null;
  cached_input_price_per_million_usd: number | null;
  output_price_per_million_usd: number | null;
  estimated_cost_low_usd: number | null;
  estimated_cost_high_usd: number | null;
  estimated_cost_low_cny: number | null;
  estimated_cost_high_cny: number | null;
  exchange_rate_usd_to_cny: number;
}

export interface ParserCapability {
  preferred_engine: string;
  available_engines: string[];
  optional_engines: string[];
  recommended_engine: string;
  notes: string[];
}

export interface TaskCostOverviewItem {
  task_id: number;
  total_llm_tokens: number;
  estimated_cost_low_usd: number | null;
  estimated_cost_high_usd: number | null;
  estimated_cost_low_cny: number | null;
  estimated_cost_high_cny: number | null;
  price_display_name: string | null;
}

export interface CostCompareItem {
  agent_id: number;
  agent_name: string;
  provider: string;
  model: string;
  total_llm_tokens: number;
  estimated_cost_low_usd: number | null;
  estimated_cost_high_usd: number | null;
  estimated_cost_low_cny: number | null;
  estimated_cost_high_cny: number | null;
  price_display_name: string | null;
  supported: boolean;
}

export interface MonthlyCostSummary {
  month: string;
  task_count: number;
  total_llm_tokens: number;
  estimated_cost_low_usd: number;
  estimated_cost_high_usd: number;
  estimated_cost_low_cny: number;
  estimated_cost_high_cny: number;
}

export interface ReviewRun {
  id: number;
  task_id: number;
  agent_id: number | null;
  run_type: "full" | "dimension" | "retry";
  status: "pending" | "running" | "done" | "failed";
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
}

export type MemoryDuplicateRisk = "none" | "low" | "medium" | "high";

export interface MemoryProfile {
  task_id: number;
  task_name: string;
  project_key: string | null;
  version: string | null;
  phase: ReviewPhase | null;
  analysis_status: string | null;
  index_status: string;
  index_error: string | null;
  summary_text: string | null;
  project_overview: string | null;
  goals: string[];
  capabilities: string[];
  core_functions: string[];
  systems: string[];
  keywords: string[];
  char_count: number | null;
  chunk_count: number | null;
  indexed_at: string | null;
}

export interface MemoryLibraryResult {
  items: MemoryProfile[];
  total: number;
}

export interface MemorySimilarItem {
  task_id: number;
  task_name: string;
  project_key: string | null;
  version: string | null;
  phase: ReviewPhase | null;
  similarity_score: number;
  overlap_keywords: string[];
  summary_text: string | null;
}

export interface MemorySimilarListResult {
  source_task_id: number;
  source_project_key: string | null;
  items: MemorySimilarItem[];
}

export interface MemoryChunkPair {
  score: number;
  source_chunk_id: number;
  source_file_name: string;
  source_section_title: string | null;
  source_excerpt: string;
  target_chunk_id: number;
  target_file_name: string;
  target_section_title: string | null;
  target_excerpt: string;
}

export interface MemoryCompareResult {
  comparable: boolean;
  message: string;
  similarity_score: number;
  duplicate_risk: MemoryDuplicateRisk;
  overlap_keywords: string[];
  findings: string[];
  source: MemoryProfile;
  target: MemoryProfile;
  chunk_pairs: MemoryChunkPair[];
}

export interface MemoryReindexResult {
  indexed_count: number;
}
