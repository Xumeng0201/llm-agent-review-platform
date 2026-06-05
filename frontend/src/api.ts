import type {
  AppUser,
  AnalysisStatusResult,
  Attachment,
  AuthResult,
  BootstrapStatus,
  DocumentChunk,
  DocumentFile,
  Framework,
  FrameworkCriteriaPreview,
  FrameworkCurrentResponse,
  FrameworkVersionInfo,
  LlmAgent,
  LlmProvider,
  ReviewIssue,
  ReviewIssueListResult,
  ReviewPhase,
  ReviewProject,
  ReviewRun,
  ReviewTask,
  ParserCapability,
  TaskTokenEstimate,
  TaskCostOverviewItem,
  CostCompareItem,
  MonthlyCostSummary,
  Paginated,
  ReviewTaskMetrics,
  ReviewStatus,
  MemoryCompareResult,
  MemoryLibraryResult,
  MemoryProfile,
  MemoryReindexResult,
  MemorySimilarListResult,
} from "./types";

const AUTH_TOKEN_KEY = "project-review-auth-token";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string | null) {
  if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
  else localStorage.removeItem(AUTH_TOKEN_KEY);
}

async function request(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  const token = getAuthToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401) {
    setAuthToken(null);
    window.dispatchEvent(new Event("auth-invalid"));
  }
  return res;
}

function formatApiErrorBody(status: number, text: string): string {
  const raw = text?.trim() || "";
  if (!raw) return resStatusText(status);
  try {
    const parsed = JSON.parse(raw) as { detail?: unknown };
    if (typeof parsed.detail === "string") return parsed.detail;
    if (parsed.detail != null) return JSON.stringify(parsed.detail);
  } catch {
    /* 非 JSON 则原样返回 */
  }
  return raw;
}

function resStatusText(status: number): string {
  return status === 502 ? "服务暂时不可用" : `HTTP ${status}`;
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(res.status, formatApiErrorBody(res.status, text));
  }
  return res.json() as Promise<T>;
}

export async function getBootstrapStatus(): Promise<BootstrapStatus> {
  const res = await request("/api/auth/bootstrap-status");
  return parseJson(res);
}

export async function bootstrapAdmin(body: {
  username: string;
  display_name?: string | null;
  password: string;
}): Promise<AuthResult> {
  const res = await request("/api/auth/bootstrap-admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function login(body: { username: string; password: string }): Promise<AuthResult> {
  const res = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function logout(): Promise<void> {
  const res = await request("/api/auth/logout", { method: "POST" });
  if (!res.ok) throw new ApiError(res.status, await res.text());
}

export async function getMe(): Promise<AppUser> {
  const res = await request("/api/auth/me");
  return parseJson(res);
}

export async function updateMyProfile(body: { display_name: string }): Promise<AppUser> {
  const res = await request("/api/auth/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function uploadMyAvatar(file: File): Promise<AppUser> {
  const form = new FormData();
  form.append("file", file);
  const res = await request("/api/auth/me/avatar", { method: "POST", body: form });
  return parseJson(res);
}

export async function fetchMyAvatarObjectUrl(): Promise<string | null> {
  const res = await request("/api/auth/me/avatar");
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError(res.status, await res.text());
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function listUsers(params?: {
  page?: number;
  page_size?: number;
  q?: string;
}): Promise<Paginated<AppUser>> {
  const qs = new URLSearchParams();
  if (params?.page != null) qs.set("page", String(params.page));
  if (params?.page_size != null) qs.set("page_size", String(params.page_size));
  if (params?.q?.trim()) qs.set("q", params.q.trim());
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await request(`/api/users${suffix}`);
  return parseJson(res);
}

export async function createUser(body: {
  username: string;
  display_name?: string | null;
  password: string;
  role?: "admin" | "user";
}): Promise<AppUser> {
  const res = await request("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function getUser(userId: number): Promise<AppUser> {
  const res = await request(`/api/users/${userId}`);
  return parseJson(res);
}

export async function updateUser(
  userId: number,
  body: {
    display_name?: string | null;
    role?: "admin" | "user";
    is_active?: boolean;
    password?: string | null;
  },
): Promise<AppUser> {
  const res = await request(`/api/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function fetchFramework(phase?: ReviewPhase): Promise<Framework> {
  const q = phase ? `?phase=${encodeURIComponent(phase)}` : "";
  const res = await request(`/api/framework${q}`);
  return parseJson(res);
}

export async function listTasks(params?: {
  phase?: ReviewPhase;
  page?: number;
  page_size?: number;
  q?: string;
  review_status?: ReviewStatus | "all";
}): Promise<Paginated<ReviewTask>> {
  const qs = new URLSearchParams();
  if (params?.phase) qs.set("phase", params.phase);
  if (params?.page != null) qs.set("page", String(params.page));
  if (params?.page_size != null) qs.set("page_size", String(params.page_size));
  if (params?.q?.trim()) qs.set("q", params.q.trim());
  if (params?.review_status && params.review_status !== "all") {
    qs.set("review_status", params.review_status);
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await request(`/api/review-tasks${suffix}`);
  return parseJson(res);
}

export async function getReviewTaskMetrics(phase?: ReviewPhase): Promise<ReviewTaskMetrics> {
  const q = phase ? `?phase=${encodeURIComponent(phase)}` : "";
  const res = await request(`/api/review-tasks/metrics${q}`);
  return parseJson(res);
}

export async function createTask(body: {
  name: string;
  project_key?: string | null;
  version?: string | null;
  llm_agent_id?: number | null;
  phase?: ReviewPhase;
  project_id?: number | null;
}): Promise<ReviewTask> {
  const res = await request("/api/review-tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function listReviewProjects(): Promise<ReviewProject[]> {
  const res = await request("/api/review-projects");
  return parseJson(res);
}

export async function createReviewProject(body: {
  name: string;
  unit_name?: string | null;
  external_code?: string | null;
}): Promise<ReviewProject> {
  const res = await request("/api/review-projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function getFrameworkCurrent(phase: ReviewPhase): Promise<FrameworkCurrentResponse> {
  const res = await request(`/api/review-framework/${phase}/current`);
  return parseJson(res);
}

export async function getFrameworkCriteriaPreview(phase: ReviewPhase): Promise<FrameworkCriteriaPreview> {
  const res = await request(`/api/review-framework/${phase}/preview-text`);
  return parseJson(res);
}

export async function uploadReviewFrameworkDocx(
  phase: ReviewPhase,
  file: File
): Promise<FrameworkVersionInfo> {
  const fd = new FormData();
  fd.append("file", file);
  const headers = new Headers();
  const token = getAuthToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`/api/review-framework/${phase}/upload`, {
    method: "POST",
    headers,
    body: fd,
  });
  if (res.status === 401) {
    setAuthToken(null);
    window.dispatchEvent(new Event("auth-invalid"));
  }
  return parseJson(res);
}

export async function getTask(id: number): Promise<ReviewTask> {
  const res = await request(`/api/review-tasks/${id}`);
  return parseJson(res);
}

export async function updateTask(
  id: number,
  patch: Partial<{
    name: string;
    project_key: string | null;
    version: string | null;
    proposal_body: string | null;
    summary_highlights: string | null;
    summary_issues: string | null;
    review_summary: string | null;
    llm_agent_id: number | null;
  }>
): Promise<ReviewTask> {
  const res = await request(`/api/review-tasks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return parseJson(res);
}

export async function deleteTask(id: number): Promise<void> {
  const res = await request(`/api/review-tasks/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

export async function getAnalysisStatus(taskId: number): Promise<AnalysisStatusResult> {
  const res = await request(`/api/review-tasks/${taskId}/analysis-status`);
  return parseJson(res);
}

export async function analyzeTask(
  taskId: number,
  body: { force?: boolean } = {}
): Promise<AnalysisStatusResult> {
  const res = await request(`/api/review-tasks/${taskId}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function getTaskTokenEstimate(taskId: number): Promise<TaskTokenEstimate> {
  const res = await request(`/api/review-tasks/${taskId}/token-estimate`);
  return parseJson(res);
}

export async function getParserCapabilities(): Promise<ParserCapability> {
  const res = await request(`/api/parser-capabilities`);
  return parseJson(res);
}

/** 不传 taskIds 时后端返回当前用户全部任务（开销大）；列表页请传入当前页 id。 */
export async function getTaskCostOverview(taskIds?: number[]): Promise<TaskCostOverviewItem[]> {
  const qs = new URLSearchParams();
  if (taskIds && taskIds.length > 0) qs.set("task_ids", taskIds.join(","));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await request(`/api/review-costs/task-overview${suffix}`);
  return parseJson(res);
}

export async function getTaskCostCompare(taskId: number): Promise<CostCompareItem[]> {
  const res = await request(`/api/review-tasks/${taskId}/cost-compare`);
  return parseJson(res);
}

export async function getMonthlyCostSummary(): Promise<MonthlyCostSummary> {
  const res = await request(`/api/review-costs/monthly-summary`);
  return parseJson(res);
}

export async function listDocumentFiles(taskId: number): Promise<DocumentFile[]> {
  const res = await request(`/api/review-tasks/${taskId}/document-files`);
  return parseJson(res);
}

export async function listDocumentChunks(
  taskId: number,
  params: { limit?: number; offset?: number } = {}
): Promise<DocumentChunk[]> {
  const qs = new URLSearchParams();
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await request(`/api/review-tasks/${taskId}/chunks${suffix}`);
  return parseJson(res);
}

export async function getDocumentChunk(chunkId: number): Promise<DocumentChunk> {
  const res = await request(`/api/document-chunks/${chunkId}`);
  return parseJson(res);
}

export async function runIssueReview(
  taskId: number,
  body: { agent_id?: number | null; dimension_ids?: number[]; force?: boolean } = {}
): Promise<ReviewRun> {
  const res = await request(`/api/review-tasks/${taskId}/review/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function listReviewRuns(taskId: number): Promise<ReviewRun[]> {
  const res = await request(`/api/review-tasks/${taskId}/review-runs`);
  return parseJson(res);
}

export async function listReviewIssues(
  taskId: number,
  params?: { severity?: string; dimension_id?: number; manual_review?: boolean }
): Promise<ReviewIssueListResult> {
  const qs = new URLSearchParams();
  if (params?.severity) qs.set("severity", params.severity);
  if (params?.dimension_id != null) qs.set("dimension_id", String(params.dimension_id));
  if (params?.manual_review != null) qs.set("manual_review", String(params.manual_review));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await request(`/api/review-tasks/${taskId}/issues${suffix}`);
  return parseJson(res);
}

export async function getReviewIssue(issueId: number): Promise<ReviewIssue> {
  const res = await request(`/api/review-issues/${issueId}`);
  return parseJson(res);
}

export async function updateReviewIssue(
  issueId: number,
  patch: Partial<{
    severity: "serious" | "major" | "minor";
    title: string;
    description: string;
    reason: string | null;
    suggestion: string | null;
    needs_supplement: boolean;
    manual_review: boolean;
    status: "open" | "accepted" | "dismissed" | "revised";
  }>
): Promise<ReviewIssue> {
  const res = await request(`/api/review-issues/${issueId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return parseJson(res);
}

export async function listAttachments(taskId: number): Promise<Attachment[]> {
  const res = await request(`/api/review-tasks/${taskId}/attachments`);
  return parseJson(res);
}

export async function uploadAttachment(
  taskId: number,
  file: File,
  category?: string
): Promise<Attachment> {
  const fd = new FormData();
  fd.append("file", file);
  const q = category ? `?category=${encodeURIComponent(category)}` : "";
  const res = await request(`/api/review-tasks/${taskId}/attachments${q}`, {
    method: "POST",
    body: fd,
  });
  return parseJson(res);
}

export async function deleteAttachment(taskId: number, attachmentId: number): Promise<void> {
  const res = await request(`/api/review-tasks/${taskId}/attachments/${attachmentId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await res.text());
}

/** 任务名中的非法文件名字符 */
function safeReportBasename(name: string): string {
  const s = name.replace(/[/\\?%*:|"<>[\]\u0000-\u001f]/g, "_").trim();
  return s || "未命名任务";
}

async function downloadBlobFromApi(path: string, filename: string): Promise<void> {
  const res = await request(path);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `下载失败（HTTP ${res.status}）`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function downloadAttachmentFile(
  taskId: number,
  attachmentId: number,
  originalName: string
): Promise<void> {
  return downloadBlobFromApi(
    `/api/review-tasks/${taskId}/attachments/${attachmentId}/download`,
    originalName
  );
}

export async function downloadIssueReportHtml(
  taskId: number,
  taskName: string
): Promise<void> {
  return downloadBlobFromApi(
    `/api/review-tasks/${taskId}/issues/report/download`,
    `审查意见书-${safeReportBasename(taskName)}.html`
  );
}

export async function downloadIssueReportWord(
  taskId: number,
  taskName: string
): Promise<void> {
  const res = await request(`/api/review-tasks/${taskId}/issues/report/word`);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `下载失败（HTTP ${res.status}）`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = `审查意见书-${safeReportBasename(taskName)}.docx`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function listAgents(params?: {
  page?: number;
  page_size?: number;
  q?: string;
  provider?: LlmProvider | "all";
}): Promise<Paginated<LlmAgent>> {
  const qs = new URLSearchParams();
  if (params?.page != null) qs.set("page", String(params.page));
  if (params?.page_size != null) qs.set("page_size", String(params.page_size));
  if (params?.q?.trim()) qs.set("q", params.q.trim());
  if (params?.provider && params.provider !== "all") qs.set("provider", params.provider);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await request(`/api/llm-agents${suffix}`);
  return parseJson(res);
}

export async function getAgent(id: number): Promise<LlmAgent> {
  const res = await request(`/api/llm-agents/${id}`);
  return parseJson(res);
}

export async function createAgent(body: {
  name: string;
  provider: LlmProvider;
  api_base?: string | null;
  api_key: string;
  model: string;
  system_prompt?: string | null;
}): Promise<LlmAgent> {
  const res = await request("/api/llm-agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function updateAgent(
  id: number,
  patch: Partial<{
    name: string;
    provider: LlmProvider;
    api_base: string | null;
    api_key: string;
    model: string;
    system_prompt: string | null;
  }>
): Promise<LlmAgent> {
  const res = await request(`/api/llm-agents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return parseJson(res);
}

export async function deleteAgent(id: number): Promise<void> {
  const res = await request(`/api/llm-agents/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

export async function fetchMemoryLibrary(params?: {
  phase?: ReviewPhase;
  q?: string;
  limit?: number;
}): Promise<MemoryLibraryResult> {
  const qs = new URLSearchParams();
  if (params?.phase) qs.set("phase", params.phase);
  if (params?.q?.trim()) qs.set("q", params.q.trim());
  if (params?.limit != null) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await request(`/api/memory/library${suffix}`);
  return parseJson(res);
}

export async function getMemoryProfile(taskId: number): Promise<MemoryProfile> {
  const res = await request(`/api/memory/tasks/${taskId}/profile`);
  return parseJson(res);
}

export async function indexMemoryProfile(taskId: number): Promise<MemoryProfile> {
  const res = await request(`/api/memory/tasks/${taskId}/index`, { method: "POST" });
  return parseJson(res);
}

export async function fetchMemorySimilar(
  taskId: number,
  limit = 10
): Promise<MemorySimilarListResult> {
  const res = await request(`/api/memory/tasks/${taskId}/similar?limit=${limit}`);
  return parseJson(res);
}

export async function compareMemoryTasks(
  sourceTaskId: number,
  targetTaskId: number
): Promise<MemoryCompareResult> {
  const res = await request("/api/memory/compare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_task_id: sourceTaskId,
      target_task_id: targetTaskId,
    }),
  });
  return parseJson(res);
}

export async function reindexMemoryLibrary(): Promise<MemoryReindexResult> {
  const res = await request("/api/memory/reindex", { method: "POST" });
  return parseJson(res);
}
