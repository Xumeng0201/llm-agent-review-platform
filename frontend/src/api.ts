import type {
  AiReportResult,
  AiSuggestResult,
  Attachment,
  Framework,
  LlmAgent,
  LlmProvider,
  OverallReport,
  IndicatorScoreRow,
  ReviewTask,
} from "./types";

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json() as Promise<T>;
}

export async function fetchFramework(): Promise<Framework> {
  const res = await fetch("/api/framework");
  return parseJson(res);
}

export async function listTasks(): Promise<ReviewTask[]> {
  const res = await fetch("/api/review-tasks");
  return parseJson(res);
}

export async function createTask(body: {
  name: string;
  llm_agent_id?: number | null;
}): Promise<ReviewTask> {
  const res = await fetch("/api/review-tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function getTask(id: number): Promise<ReviewTask> {
  const res = await fetch(`/api/review-tasks/${id}`);
  return parseJson(res);
}

export async function updateTask(
  id: number,
  patch: Partial<{
    name: string;
    proposal_body: string | null;
    summary_highlights: string | null;
    summary_issues: string | null;
    review_summary: string | null;
    llm_agent_id: number | null;
  }>
): Promise<ReviewTask> {
  const res = await fetch(`/api/review-tasks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return parseJson(res);
}

export async function deleteTask(id: number): Promise<void> {
  const res = await fetch(`/api/review-tasks/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

export async function listScores(taskId: number): Promise<IndicatorScoreRow[]> {
  const res = await fetch(`/api/review-tasks/${taskId}/scores`);
  return parseJson(res);
}

export async function saveScore(
  taskId: number,
  body: { indicator_id: number; score: number; notes?: string }
): Promise<IndicatorScoreRow> {
  const res = await fetch(`/api/review-tasks/${taskId}/scores`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function fetchReport(taskId: number): Promise<OverallReport> {
  const res = await fetch(`/api/review-tasks/${taskId}/report`);
  return parseJson(res);
}

export async function listAttachments(taskId: number): Promise<Attachment[]> {
  const res = await fetch(`/api/review-tasks/${taskId}/attachments`);
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
  const res = await fetch(`/api/review-tasks/${taskId}/attachments${q}`, {
    method: "POST",
    body: fd,
  });
  return parseJson(res);
}

export function attachmentDownloadUrl(taskId: number, attachmentId: number): string {
  return `/api/review-tasks/${taskId}/attachments/${attachmentId}/download`;
}

export function reportDownloadUrl(taskId: number): string {
  return `/api/review-tasks/${taskId}/report/download`;
}

export async function listAgents(): Promise<LlmAgent[]> {
  const res = await fetch("/api/llm-agents");
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
  const res = await fetch("/api/llm-agents", {
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
  const res = await fetch(`/api/llm-agents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return parseJson(res);
}

export async function deleteAgent(id: number): Promise<void> {
  const res = await fetch(`/api/llm-agents/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

export async function aiSuggestScores(
  taskId: number,
  body: { agent_id?: number | null }
): Promise<AiSuggestResult> {
  const res = await fetch(`/api/review-tasks/${taskId}/ai-suggest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function aiGenerateReport(
  taskId: number,
  body: { agent_id?: number | null }
): Promise<AiReportResult> {
  const res = await fetch(`/api/review-tasks/${taskId}/ai-report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function aiApplyReport(
  taskId: number,
  body: {
    items: { indicator_id: number; score: number; notes: string; opinion: string }[];
    conclusion: string;
    highlights: string;
    issues: string;
  }
): Promise<ReviewTask> {
  const res = await fetch(`/api/review-tasks/${taskId}/ai-report/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}
