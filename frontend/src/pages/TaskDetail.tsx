import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  IconDownload,
  IconFile,
  IconList,
} from "@douyinfe/semi-icons";
import { Button, Card, Checkbox, Input, Select, Space, Tag, TextArea, Typography } from "@douyinfe/semi-ui";
import {
  analyzeTask,
  deleteAttachment,
  downloadAttachmentFile,
  downloadIssueReportHtml,
  downloadIssueReportWord,
  fetchFramework,
  getAnalysisStatus,
  getDocumentChunk,
  getParserCapabilities,
  getTask,
  getTaskCostCompare,
  getTaskTokenEstimate,
  listAgents,
  listAttachments,
  listDocumentChunks,
  listReviewIssues,
  runIssueReview,
  updateTask,
  updateReviewIssue,
  uploadAttachment,
} from "../api";
import type {
  AnalysisStatusResult,
  Attachment,
  DocumentChunk,
  Framework,
  LlmAgent,
  ParserCapability,
  CostCompareItem,
  ReviewIssue,
  ReviewIssueListResult,
  ReviewTask,
  TaskTokenEstimate,
} from "../types";

const { Title, Paragraph, Text } = Typography;
type TaskStep = "materials" | "result" | "report";

const STEP_ORDER: TaskStep[] = ["materials", "result", "report"];

const STEP_DEF: { key: TaskStep; stepLabel: string; title: string }[] = [
  { key: "materials", stepLabel: "第一步", title: "上传方案材料" },
  { key: "result", stepLabel: "第二步", title: "查看评审结果" },
  { key: "report", stepLabel: "第三步", title: "编辑并下载报告" },
];

function parseTaskStep(s: string | undefined): TaskStep | null {
  if (s === "materials" || s === "result" || s === "report") return s;
  if (s === "plan") return "materials";
  return null;
}

const shellCardStyle = {
  width: "100%" as const,
  borderRadius: 24,
  border: "1px solid rgba(255, 255, 255, 0.9)",
  background: "linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(247, 248, 255, 0.88))",
  boxShadow: "0 24px 60px rgba(111, 123, 168, 0.14)",
} as const;

const softTechCardStyle = {
  width: "100%" as const,
  borderRadius: 22,
  border: "1px solid rgba(226, 232, 240, 0.95)",
  background: "linear-gradient(180deg, rgba(255, 255, 255, 0.86), rgba(248, 250, 252, 0.82))",
} as const;

const techInputStyle = {
  background: "rgba(255, 255, 255, 0.9)",
  border: "1px solid rgba(203, 213, 225, 0.95)",
  color: "#0f172a",
} as const;

const techPrimaryBtn = {
  borderRadius: 999,
  background: "linear-gradient(90deg, #20d2cc, #2c7ef8)",
  border: "none",
  boxShadow: "0 12px 28px rgba(35, 157, 226, 0.28)",
} as const;

function formatMoney(value: number | null | undefined, currency: "USD" | "CNY") {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency,
    minimumFractionDigits: value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 4 : 2,
  }).format(value);
}

export default function TaskDetail() {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { id, step: stepParam } = useParams<{ id: string; step: string }>();
  const taskId = Number(id);
  const stepFromUrl = parseTaskStep(stepParam);
  const focusedChunkId = Number(searchParams.get("chunk")) || null;

  const [task, setTask] = useState<ReviewTask | null>(null);
  const [fw, setFw] = useState<Framework | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [agents, setAgents] = useState<LlmAgent[]>([]);
  const [proposalDraft, setProposalDraft] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisStatusResult | null>(null);
  const [tokenEstimate, setTokenEstimate] = useState<TaskTokenEstimate | null>(null);
  const [parserCapability, setParserCapability] = useState<ParserCapability | null>(null);
  const [costCompare, setCostCompare] = useState<CostCompareItem[]>([]);
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [focusedChunk, setFocusedChunk] = useState<DocumentChunk | null>(null);
  const [chunkOffset, setChunkOffset] = useState(0);
  const [expandedChunkIds, setExpandedChunkIds] = useState<number[]>([]);
  const [issueList, setIssueList] = useState<ReviewIssueListResult | null>(null);
  const [severityFilter, setSeverityFilter] = useState<"all" | "serious" | "major" | "minor">("all");
  const [dimensionFilter, setDimensionFilter] = useState<"all" | number>("all");
  const [issueKeyword, setIssueKeyword] = useState("");
  const [manualOnly, setManualOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | ReviewIssue["status"]>("all");
  const [issueBusyId, setIssueBusyId] = useState<number | null>(null);
  const [editingIssueId, setEditingIssueId] = useState<number | null>(null);
  const [issueDraft, setIssueDraft] = useState<Partial<ReviewIssue>>({});
  const [pickAgentId, setPickAgentId] = useState<string | number | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [wordDownloading, setWordDownloading] = useState(false);
  const chunkPageSize = 20;

  const loadChunks = useCallback(
    async (offset: number) => {
      if (!Number.isFinite(taskId)) return;
      setChunks(await listDocumentChunks(taskId, { limit: chunkPageSize, offset }).catch(() => []));
    },
    [taskId]
  );

  const selectedAgent =
    agents.find((a) => a.id === Number(pickAgentId)) ??
    agents.find((a) => a.id === task?.llm_agent_id) ??
    null;

  const loadAll = useCallback(async () => {
    if (!Number.isFinite(taskId)) return;
    setErr(null);
    const [taskRes, frameworkRes, attachmentRes, agentRes, analysisRes, issueRes, tokenRes, parserRes, compareRes] = await Promise.all([
      getTask(taskId),
      fetchFramework(),
      listAttachments(taskId),
      listAgents(),
      getAnalysisStatus(taskId).catch(() => null),
      listReviewIssues(taskId).catch(() => null),
      getTaskTokenEstimate(taskId).catch(() => null),
      getParserCapabilities().catch(() => null),
      getTaskCostCompare(taskId).catch(() => []),
    ]);
    setTask(taskRes);
    setFw(frameworkRes);
    setAttachments(attachmentRes);
    setAgents(agentRes);
    setAnalysis(analysisRes);
    setIssueList(issueRes);
    setTokenEstimate(tokenRes);
    setParserCapability(parserRes);
    setCostCompare(compareRes);
    await loadChunks(chunkOffset).catch(() => setChunks([]));
    setProposalDraft(taskRes.proposal_body ?? "");
    setPickAgentId(taskRes.llm_agent_id ?? agentRes[0]?.id ?? undefined);
  }, [taskId]);

  useEffect(() => {
    void loadAll().catch((e) => setErr(e instanceof Error ? e.message : "加载失败"));
  }, [loadAll]);

  useEffect(() => {
    void loadChunks(chunkOffset);
  }, [chunkOffset, loadChunks]);

  useEffect(() => {
    if (!focusedChunkId) {
      setFocusedChunk(null);
      return;
    }
    void getDocumentChunk(focusedChunkId)
      .then((chunk) => {
        setFocusedChunk(chunk);
        setExpandedChunkIds((current) => (current.includes(chunk.id) ? current : [...current, chunk.id]));
      })
      .catch(() => setFocusedChunk(null));
  }, [focusedChunkId]);

  const materialChunks = useMemo(() => {
    if (!focusedChunk) return chunks;
    if (chunks.some((chunk) => chunk.id === focusedChunk.id)) return chunks;
    return [focusedChunk, ...chunks];
  }, [chunks, focusedChunk]);

  if (!Number.isFinite(taskId)) {
    return (
      <Card bordered={false} style={shellCardStyle}>
        <Paragraph style={{ color: "rgba(51, 65, 85, 0.88)" }}>无效的任务 ID。</Paragraph>
      </Card>
    );
  }

  if (stepFromUrl === null) {
    return <Navigate to={`/tasks/${id}/materials`} replace />;
  }

  const step = stepFromUrl;

  async function saveMaterialsAndPrompt() {
    if (!task) return;
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const next = await updateTask(task.id, {
        proposal_body: proposalDraft,
        llm_agent_id: task.llm_agent_id ?? (pickAgentId === undefined || pickAgentId === "" ? null : Number(pickAgentId)),
      });
      setTask(next);
      const res = await getAnalysisStatus(task.id).catch(() => null);
      setAnalysis(res);
      setTokenEstimate(await getTaskTokenEstimate(task.id).catch(() => null));
      setCostCompare(await getTaskCostCompare(task.id).catch(() => []));
      setChunkOffset(0);
      setChunks(await listDocumentChunks(task.id, { limit: chunkPageSize, offset: 0 }).catch(() => []));
      setMsg("方案说明已保存，系统已同步更新解析结果。");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function onFileSelected(files: FileList | null) {
    if (!files?.length) return;
    setErr(null);
    setMsg(null);
    try {
      for (const file of Array.from(files)) {
        await uploadAttachment(taskId, file, "项目方案");
      }
      setAttachments(await listAttachments(taskId));
      const res = await getAnalysisStatus(taskId).catch(() => null);
      setAnalysis(res);
      setTokenEstimate(await getTaskTokenEstimate(taskId).catch(() => null));
      setCostCompare(await getTaskCostCompare(taskId).catch(() => []));
      setChunkOffset(0);
      setChunks(await listDocumentChunks(taskId, { limit: chunkPageSize, offset: 0 }).catch(() => []));
      setTask((current) =>
        current && res
          ? {
              ...current,
              analysis_status: res.analysis_status,
              doc_total_chars: res.doc_total_chars,
              doc_total_chunks: res.doc_total_chunks,
            }
          : current
      );
      setMsg("方案文件已上传，系统已自动解析材料。");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "上传失败");
    }
  }

  async function onDeleteAttachment(attachmentId: number, filename: string) {
    if (!confirm(`确定删除已上传材料「${filename}」？`)) return;
    setErr(null);
    setMsg(null);
    try {
      await deleteAttachment(taskId, attachmentId);
      setAttachments(await listAttachments(taskId));
      setMsg(`已删除材料「${filename}」。`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "删除附件失败");
    }
  }

  async function runAnalysis() {
    if (!Number.isFinite(taskId)) return;
    setAnalyzing(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await analyzeTask(taskId);
      setAnalysis(res);
      setTokenEstimate(await getTaskTokenEstimate(taskId).catch(() => null));
      setCostCompare(await getTaskCostCompare(taskId).catch(() => []));
      setChunkOffset(0);
      setChunks(await listDocumentChunks(taskId, { limit: chunkPageSize, offset: 0 }).catch(() => []));
      setTask((current) =>
        current
          ? {
              ...current,
              analysis_status: res.analysis_status,
              doc_total_chars: res.doc_total_chars,
              doc_total_chunks: res.doc_total_chunks,
            }
          : current
      );
      setMsg("材料解析状态已更新。");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "材料解析失败");
    } finally {
      setAnalyzing(false);
    }
  }

  async function triggerIssueReview() {
    if (!Number.isFinite(taskId)) return;
    setReviewBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await runIssueReview(taskId, {
        agent_id:
          pickAgentId === undefined || pickAgentId === ""
            ? undefined
            : Number(pickAgentId),
      });
      setTask((current) =>
        current ? { ...current, analysis_status: "reviewing" } : current
      );
      setMsg("问题审查任务已提交。");
      setIssueList(await listReviewIssues(taskId).catch(() => null));
      nav(`/tasks/${taskId}/result`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "发起问题审查失败");
    } finally {
      setReviewBusy(false);
    }
  }

  async function patchIssue(issueId: number, patch: Partial<ReviewIssue>, successMessage = "问题状态已更新。") {
    setIssueBusyId(issueId);
    setErr(null);
    setMsg(null);
    try {
      const updated = await updateReviewIssue(issueId, patch);
      setIssueList((current) =>
        current
          ? {
              ...current,
            items: current.items.map((item) => (item.id === issueId ? updated : item)),
          }
          : current
      );
      setMsg(successMessage);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "更新问题失败");
    } finally {
      setIssueBusyId(null);
    }
  }

  function startEditIssue(issue: ReviewIssue) {
    setEditingIssueId(issue.id);
    setIssueDraft({
      severity: issue.severity,
      title: issue.title,
      description: issue.description,
      reason: issue.reason ?? "",
      suggestion: issue.suggestion ?? "",
      needs_supplement: issue.needs_supplement,
      manual_review: issue.manual_review,
      status: issue.status,
    });
  }

  function cancelEditIssue() {
    setEditingIssueId(null);
    setIssueDraft({});
  }

  async function saveIssueEdit(issueId: number) {
    await patchIssue(
      issueId,
      {
        severity: issueDraft.severity,
        title: (issueDraft.title ?? "").toString().trim(),
        description: (issueDraft.description ?? "").toString().trim(),
        reason: ((issueDraft.reason ?? "").toString().trim() || null) as string | null,
        suggestion: ((issueDraft.suggestion ?? "").toString().trim() || null) as string | null,
        needs_supplement: !!issueDraft.needs_supplement,
        manual_review: !!issueDraft.manual_review,
        status: (issueDraft.status as ReviewIssue["status"]) || "revised",
      },
      "问题内容已保存。"
    );
    setEditingIssueId(null);
    setIssueDraft({});
  }

  if (!task || !fw) {
    return (
      <Card bordered={false} style={shellCardStyle}>
        <Paragraph style={{ color: "rgba(51, 65, 85, 0.88)" }}>加载中…</Paragraph>
      </Card>
    );
  }

  const stepIndex = STEP_ORDER.indexOf(step);
  const prevKey = stepIndex > 0 ? STEP_ORDER[stepIndex - 1] : null;
  const nextKey = stepIndex < STEP_ORDER.length - 1 ? STEP_ORDER[stepIndex + 1] : null;
  const issueSummary = issueList?.summary ?? null;
  const filteredIssues =
    issueList?.items.filter((item) => {
      if (severityFilter !== "all" && item.severity !== severityFilter) return false;
      if (dimensionFilter !== "all" && item.dimension_id !== dimensionFilter) return false;
      if (manualOnly && !item.manual_review) return false;
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      const keyword = issueKeyword.trim().toLowerCase();
      if (keyword) {
        const haystack = [
          item.title,
          item.description,
          item.reason ?? "",
          item.suggestion ?? "",
          item.dimension_title,
        ]
          .join("\n")
          .toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }
      return true;
    }) ?? [];
  const dimensionOptions = [
    { label: "全部维度", value: "all" },
    ...((fw.dimensions ?? []).map((dimension) => ({
      label: dimension.title,
      value: dimension.id,
    }))),
  ];
  const chunkCanPrev = chunkOffset > 0;
  const chunkCanNext = chunks.length === chunkPageSize;

  function parseJsonList(raw: string | null | undefined): string[] {
    if (!raw) return [];
    try {
      const value = JSON.parse(raw);
      if (!Array.isArray(value)) return [];
      return value.map((item) => String(item)).filter(Boolean);
    } catch {
      return [];
    }
  }

  function issueHighlightTerms(item: ReviewIssue): string[] {
    const terms = [
      item.title,
      item.dimension_title,
      item.description,
      item.reason ?? "",
    ]
      .join(" ")
      .match(/[\u4e00-\u9fffA-Za-z0-9]{2,12}/g);
    return Array.from(new Set((terms ?? []).slice(0, 12)));
  }

  function renderHighlightedText(text: string, terms: string[]) {
    if (!text) return text;
    const filtered = terms
      .map((term) => term.trim())
      .filter((term) => term.length >= 2)
      .sort((a, b) => b.length - a.length)
      .slice(0, 8);
    if (!filtered.length) return text;
    const pattern = new RegExp(`(${filtered.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
    const parts = text.split(pattern);
    return parts.map((part, index) =>
      filtered.some((term) => term.toLowerCase() === part.toLowerCase()) ? (
        <mark
          key={`${part}-${index}`}
          style={{
            background: "rgba(250, 204, 21, 0.28)",
            color: "#0f172a",
            padding: "0 2px",
            borderRadius: 4,
          }}
        >
          {part}
        </mark>
      ) : (
        <span key={`${part}-${index}`}>{part}</span>
      )
    );
  }

  function toggleChunkExpanded(chunkId: number) {
    setExpandedChunkIds((current) =>
      current.includes(chunkId) ? current.filter((id) => id !== chunkId) : [...current, chunkId]
    );
  }

  function jumpToChunk(chunkId: number | null) {
    if (!chunkId) return;
    setSearchParams({ chunk: String(chunkId) });
    nav(`/tasks/${taskId}/materials`);
  }

  const stepNavBtn = (key: TaskStep, icon: React.ReactNode) => {
    const def = STEP_DEF.find((s) => s.key === key)!;
    return (
      <Button
        key={key}
        className={step === key ? "taskdetail-stepbtn taskdetail-stepbtn-active" : "taskdetail-stepbtn"}
        icon={icon}
        theme={step === key ? "solid" : "light"}
        type={step === key ? "primary" : "tertiary"}
        onClick={() => nav(`/tasks/${task.id}/${key}`)}
        style={{
          flex: 1,
          minWidth: 0,
          height: "auto",
          paddingTop: 10,
          paddingBottom: 10,
          whiteSpace: "normal",
          textAlign: "center",
        }}
      >
        <span style={{ display: "block", fontSize: 14, lineHeight: "20px", fontWeight: 600 }}>
          {def.stepLabel}：
        </span>
        <span style={{ display: "block", fontSize: 14, lineHeight: "20px", fontWeight: 400, marginTop: 2, opacity: 0.88 }}>
          {def.title}
        </span>
      </Button>
    );
  };

  return (
    <Space vertical spacing="loose" style={{ width: "100%", alignItems: "stretch" }}>
      <Card
        bordered={false}
        style={shellCardStyle}
        className="tech-enter tech-enter-1"
        bodyStyle={{ padding: "24px 24px 26px" }}
        title={<Title heading={4} style={{ color: "#0f172a" }}>{task.name}</Title>}
        headerExtraContent={
          <Button
            theme="light"
            type="tertiary"
            onClick={() =>
              nav(
                task.phase === "pre_review" ? "/tasks/pre-review" : "/tasks/implementation"
              )
            }
            style={{
              color: "#334155",
              border: "1px solid rgba(203, 213, 225, 0.95)",
              background: "rgba(255, 255, 255, 0.82)",
              borderRadius: 999,
            }}
          >
            返回列表
          </Button>
        }
      >
      </Card>

      {err ? <div className="tech-alert tech-alert-danger" style={{ width: "100%" }}>{err}</div> : null}
      {msg ? (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            width: "100%",
            background: "rgba(18, 74, 57, 0.58)",
            border: "1px solid rgba(147, 251, 207, 0.18)",
            color: "#d8ffea",
            fontSize: 14,
          }}
        >
          {msg}
        </div>
      ) : null}

      <div className="taskdetail-stepbar tech-enter tech-enter-2">
        {stepNavBtn("materials", <IconFile />)}
        {stepNavBtn("result", <IconList />)}
        {stepNavBtn("report", <IconDownload />)}
      </div>

      {step === "materials" ? (
        <Card
          bordered={false}
          style={shellCardStyle}
          className="tech-enter tech-enter-3"
          bodyStyle={{ padding: 24 }}
          title={<Title heading={5} style={{ color: "#0f172a" }}>方案材料</Title>}
        >
          <div
            style={{
              marginBottom: 20,
              padding: 16,
              borderRadius: 18,
              border: "1px solid rgba(226, 232, 240, 0.95)",
              background: "rgba(248, 250, 252, 0.9)",
            }}
          >
            <Space style={{ width: "100%", justifyContent: "space-between", flexWrap: "wrap" }}>
              <div>
                <Text strong style={{ display: "block", marginBottom: 6 }}>材料解析状态</Text>
                <Paragraph style={{ margin: 0, color: "rgba(71, 85, 105, 0.86)" }}>
                  当前状态：{analysis?.analysis_status ?? task.analysis_status}，
                  已识别字数 {analysis?.doc_total_chars ?? task.doc_total_chars ?? 0}，
                  解析单元 {analysis?.doc_total_chunks ?? task.doc_total_chunks ?? 0}
                </Paragraph>
              </div>
              <Button loading={analyzing} onClick={() => void runAnalysis()}>
                {analyzing ? "解析中…" : "重新解析材料"}
              </Button>
            </Space>
            {analysis?.files?.length ? (
              <div style={{ marginTop: 14 }}>
                <Text strong style={{ display: "block", marginBottom: 8 }}>解析明细</Text>
                <Space vertical align="start" spacing="medium" style={{ width: "100%" }}>
                  {analysis.files.map((file) => (
                    <div
                      key={file.id}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 14,
                        border: "1px solid rgba(226, 232, 240, 0.92)",
                        background: "rgba(255, 255, 255, 0.78)",
                      }}
                    >
                      <Space wrap spacing={8}>
                        <Text strong>{file.file_name}</Text>
                        <Tag color={file.parse_status === "done" ? "green" : file.parse_status === "failed" ? "red" : "blue"}>
                          {file.parse_status === "done" ? "解析完成" : file.parse_status === "failed" ? "待处理" : "处理中"}
                        </Tag>
                        {file.page_count != null ? <Tag type="light">{file.page_count} 页</Tag> : null}
                        {file.char_count != null ? <Tag type="light">{file.char_count} 字</Tag> : null}
                      </Space>
                      {file.parse_error ? (
                        <Paragraph style={{ margin: "8px 0 0", color: "rgba(180, 83, 9, 0.92)" }}>
                          {file.parse_error}
                        </Paragraph>
                      ) : null}
                    </div>
                  ))}
                </Space>
              </div>
            ) : null}
            <div style={{ marginTop: 16 }}>
              <Text strong style={{ display: "block", marginBottom: 8 }}>Token 成本估算</Text>
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 14,
                  border: "1px solid rgba(226, 232, 240, 0.92)",
                  background: "rgba(255,255,255,0.8)",
                }}
              >
                <Paragraph style={{ margin: 0, color: "rgba(51, 65, 85, 0.88)", lineHeight: 1.8 }}>
                  当前解析引擎：
                  <Text strong style={{ color: "#0f172a" }}>
                    {" "}
                    {tokenEstimate?.parser_engine || parserCapability?.preferred_engine || "builtin"}
                  </Text>
                  {tokenEstimate?.parser_mode ? ` · ${tokenEstimate.parser_mode}` : ""}
                  。长文本分块本身不调用大模型，LLM 分块成本约为
                  <Text strong style={{ color: "#0f172a" }}> {tokenEstimate?.llm_chunking_tokens ?? 0} tokens</Text>。
                </Paragraph>
                <Paragraph style={{ margin: "8px 0 0", color: "rgba(51, 65, 85, 0.88)", lineHeight: 1.8 }}>
                  绑定模型：
                  <Text strong style={{ color: "#0f172a" }}>
                    {" "}
                    {tokenEstimate?.price_display_name || tokenEstimate?.model_name || selectedAgent?.model || "未识别"}
                  </Text>
                  {tokenEstimate?.estimated_cost_low_usd != null && tokenEstimate?.estimated_cost_high_usd != null ? (
                    <>
                      {" "}，本次完整问题审查费用约
                      <Text strong style={{ color: "#0f172a" }}>
                        {" "}
                        {formatMoney(tokenEstimate.estimated_cost_low_usd, "USD")} ~ {formatMoney(tokenEstimate.estimated_cost_high_usd, "USD")}
                      </Text>
                      {" "}（约
                      <Text strong style={{ color: "#0f172a" }}>
                        {" "}
                        {formatMoney(tokenEstimate.estimated_cost_low_cny, "CNY")} ~ {formatMoney(tokenEstimate.estimated_cost_high_cny, "CNY")}
                      </Text>
                      ）。
                    </>
                  ) : (
                    <>，当前还没有匹配到内置官方价目表，所以暂时只显示 token，不显示费用。</>
                  )}
                </Paragraph>
                <div className="taskhome-stat-row" style={{ marginTop: 14 }}>
                  <div className="taskhome-stat-card">
                    <Text className="taskhome-stat-label">本地切块估算</Text>
                    <div className="taskhome-stat-value">{tokenEstimate?.local_chunk_tokens ?? 0}</div>
                  </div>
                  <div className="taskhome-stat-card">
                    <Text className="taskhome-stat-label">审查输入估算</Text>
                    <div className="taskhome-stat-value">{tokenEstimate?.review_input_tokens ?? 0}</div>
                  </div>
                  <div className="taskhome-stat-card">
                    <Text className="taskhome-stat-label">审查输出估算</Text>
                    <div className="taskhome-stat-value">{tokenEstimate?.review_output_tokens ?? 0}</div>
                  </div>
                  <div className="taskhome-stat-card">
                    <Text className="taskhome-stat-label">LLM 总估算</Text>
                    <div className="taskhome-stat-value">{tokenEstimate?.total_llm_tokens ?? 0}</div>
                  </div>
                </div>
                {tokenEstimate?.estimated_cost_low_usd != null && tokenEstimate?.estimated_cost_high_usd != null ? (
                  <div className="taskhome-stat-row" style={{ marginTop: 14 }}>
                    <div className="taskhome-stat-card">
                      <Text className="taskhome-stat-label">费用下限（USD）</Text>
                      <div className="taskhome-stat-value" style={{ fontSize: 24 }}>
                        {formatMoney(tokenEstimate.estimated_cost_low_usd, "USD")}
                      </div>
                    </div>
                    <div className="taskhome-stat-card">
                      <Text className="taskhome-stat-label">费用上限（USD）</Text>
                      <div className="taskhome-stat-value" style={{ fontSize: 24 }}>
                        {formatMoney(tokenEstimate.estimated_cost_high_usd, "USD")}
                      </div>
                    </div>
                    <div className="taskhome-stat-card">
                      <Text className="taskhome-stat-label">费用下限（CNY）</Text>
                      <div className="taskhome-stat-value" style={{ fontSize: 24 }}>
                        {formatMoney(tokenEstimate.estimated_cost_low_cny, "CNY")}
                      </div>
                    </div>
                    <div className="taskhome-stat-card">
                      <Text className="taskhome-stat-label">费用上限（CNY）</Text>
                      <div className="taskhome-stat-value" style={{ fontSize: 24 }}>
                        {formatMoney(tokenEstimate.estimated_cost_high_cny, "CNY")}
                      </div>
                    </div>
                  </div>
                ) : null}
                {tokenEstimate?.dimensions?.length ? (
                  <div style={{ marginTop: 12 }}>
                    <Text strong style={{ display: "block", marginBottom: 8 }}>按审查维度估算</Text>
                    <Space vertical align="start" spacing="medium" style={{ width: "100%" }}>
                      {tokenEstimate.dimensions.map((item) => (
                        <div
                          key={item.dimension_id}
                          style={{
                            width: "100%",
                            padding: "8px 10px",
                            borderRadius: 12,
                            background: "rgba(248,250,252,0.92)",
                            border: "1px solid rgba(226,232,240,0.92)",
                            color: "#334155",
                          }}
                        >
                          <Text strong style={{ color: "#0f172a" }}>{item.dimension_title}</Text>
                          <Text style={{ marginLeft: 10 }}>
                            召回 {item.retrieved_chunks} 段，输入约 {item.input_tokens}，输出约 {item.output_tokens} tokens
                          </Text>
                        </div>
                      ))}
                    </Space>
                  </div>
                ) : null}
                {(tokenEstimate?.assumptions?.length || parserCapability?.notes?.length) ? (
                  <ul style={{ margin: "12px 0 0", paddingLeft: 20, color: "rgba(71, 85, 105, 0.88)" }}>
                    {(tokenEstimate?.assumptions ?? []).map((item) => (
                      <li key={`a-${item}`}>{item}</li>
                    ))}
                    {(parserCapability?.notes ?? []).map((item) => (
                      <li key={`p-${item}`}>{item}</li>
                    ))}
                  </ul>
                ) : null}
                {tokenEstimate?.pricing_source_url ? (
                  <Paragraph style={{ margin: "10px 0 0", color: "rgba(71, 85, 105, 0.82)" }}>
                    价格来源：
                    <a
                      href={tokenEstimate.pricing_source_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "#2563eb", marginLeft: 6 }}
                    >
                      {tokenEstimate.pricing_source_name || tokenEstimate.pricing_source_url}
                    </a>
                  </Paragraph>
                ) : null}
                {costCompare.length ? (
                  <div style={{ marginTop: 16 }}>
                    <Text strong style={{ display: "block", marginBottom: 8 }}>不同模型成本对比</Text>
                    <Space vertical align="start" spacing="medium" style={{ width: "100%" }}>
                      {costCompare.map((item) => (
                        <div
                          key={item.agent_id}
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: 14,
                            border: selectedAgent?.id === item.agent_id
                              ? "1px solid rgba(59, 130, 246, 0.92)"
                              : "1px solid rgba(226, 232, 240, 0.92)",
                            background: selectedAgent?.id === item.agent_id
                              ? "rgba(239, 246, 255, 0.9)"
                              : "rgba(255,255,255,0.8)",
                          }}
                        >
                          <Space wrap spacing={8}>
                            <Text strong style={{ color: "#0f172a" }}>{item.agent_name}</Text>
                            <Tag type="light">{item.model}</Tag>
                            {selectedAgent?.id === item.agent_id ? <Tag color="blue">当前绑定</Tag> : null}
                            {!item.supported ? <Tag color="grey">暂未匹配价目表</Tag> : null}
                          </Space>
                          <Paragraph style={{ margin: "8px 0 0", color: "rgba(51, 65, 85, 0.88)" }}>
                            {item.supported
                              ? <>预计费用 {formatMoney(item.estimated_cost_low_cny, "CNY")} ~ {formatMoney(item.estimated_cost_high_cny, "CNY")}（{item.total_llm_tokens} tokens）</>
                              : <>当前仅能估算 token：{item.total_llm_tokens}</>}
                          </Paragraph>
                        </div>
                      ))}
                    </Space>
                  </div>
                ) : null}
              </div>
            </div>
            {chunks.length ? (
              <div style={{ marginTop: 16 }}>
                <Space style={{ width: "100%", justifyContent: "space-between", flexWrap: "wrap", marginBottom: 8 }}>
                  <Text strong>Chunk 明细</Text>
                  <Space wrap>
                    <Button disabled={!chunkCanPrev} onClick={() => setChunkOffset((current) => Math.max(0, current - chunkPageSize))}>
                      上一页
                    </Button>
                    <Button disabled={!chunkCanNext} onClick={() => setChunkOffset((current) => current + chunkPageSize)}>
                      下一页
                    </Button>
                  </Space>
                </Space>
                <Space vertical align="start" spacing="medium" style={{ width: "100%" }}>
                  {materialChunks.map((chunk) => {
                    const keywords = parseJsonList(chunk.keywords_json);
                    const hints = parseJsonList(chunk.dimension_hints_json);
                    const expanded = expandedChunkIds.includes(chunk.id) || focusedChunk?.id === chunk.id;
                    return (
                      <div
                        key={chunk.id}
                        id={`chunk-${chunk.id}`}
                        style={{
                          width: "100%",
                          padding: "12px 14px",
                          borderRadius: 14,
                          border: chunk.id === focusedChunk?.id ? "1px solid rgba(59, 130, 246, 0.9)" : "1px solid rgba(226, 232, 240, 0.92)",
                          background: chunk.id === focusedChunk?.id ? "rgba(239, 246, 255, 0.9)" : "rgba(255, 255, 255, 0.82)",
                        }}
                      >
                        <Space wrap spacing={8}>
                          <Tag type="light">Chunk #{chunk.chunk_index}</Tag>
                          {chunk.section_title ? <Tag color="blue">{chunk.section_title}</Tag> : null}
                          {chunk.page_from != null ? (
                            <Tag type="light">
                              第 {chunk.page_from}
                              {chunk.page_to && chunk.page_to !== chunk.page_from ? `-${chunk.page_to}` : ""} 页
                            </Tag>
                          ) : null}
                          {chunk.char_count != null ? <Tag type="light">{chunk.char_count} 字</Tag> : null}
                        </Space>
                        {chunk.summary ? (
                          <Paragraph style={{ margin: "8px 0 0", color: "rgba(51, 65, 85, 0.88)" }}>
                            摘要：{chunk.summary}
                          </Paragraph>
                        ) : null}
                        {keywords.length ? (
                          <Paragraph style={{ margin: "6px 0 0", color: "rgba(37, 99, 235, 0.92)" }}>
                            关键词：{keywords.join("、")}
                          </Paragraph>
                        ) : null}
                        {hints.length ? (
                          <Paragraph style={{ margin: "6px 0 0", color: "rgba(8, 145, 178, 0.92)" }}>
                            维度提示：{hints.join("、")}
                          </Paragraph>
                        ) : null}
                        <Paragraph style={{ margin: "8px 0 0", color: "rgba(71, 85, 105, 0.88)", lineHeight: 1.7 }}>
                          {expanded ? chunk.content : `${chunk.content.slice(0, 260)}${chunk.content.length > 260 ? "…" : ""}`}
                        </Paragraph>
                        <Space wrap>
                          {chunk.content.length > 260 ? (
                            <Button size="small" theme="borderless" onClick={() => toggleChunkExpanded(chunk.id)}>
                              {expanded ? "收起全文" : "展开全文"}
                            </Button>
                          ) : null}
                          {chunk.id === focusedChunk?.id ? (
                            <Button
                              size="small"
                              theme="borderless"
                              onClick={() => {
                                setFocusedChunk(null);
                                setSearchParams({});
                              }}
                            >
                              清除定位
                            </Button>
                          ) : null}
                        </Space>
                      </div>
                    );
                  })}
                </Space>
              </div>
            ) : null}
          </div>

          <div style={{ marginBottom: 20 }}>
            <Text strong style={{ display: "block", marginBottom: 8 }}>上传方案文件</Text>
            <div className="taskdetail-upload-box">
              <input type="file" multiple onChange={(e) => void onFileSelected(e.target.files)} style={{ fontSize: 14, color: "#334155" }} />
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <Text strong style={{ display: "block", marginBottom: 8 }}>已上传材料</Text>
            <ul style={{ margin: 0, paddingLeft: 20, color: "rgba(71, 85, 105, 0.88)" }}>
              {attachments.length === 0 ? (
                <li>暂无附件</li>
              ) : (
                attachments.map((att) => (
                  <li key={att.id} style={{ marginBottom: 8 }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <Button
                        theme="borderless"
                        type="tertiary"
                        style={{ color: "#2563eb", padding: 0 }}
                        onClick={() =>
                          void downloadAttachmentFile(task.id, att.id, att.original_name).catch((e) =>
                            setErr(e instanceof Error ? e.message : "下载附件失败")
                          )
                        }
                      >
                        {att.original_name}
                      </Button>
                      <Button
                        size="small"
                        type="danger"
                        theme="borderless"
                        onClick={() => void onDeleteAttachment(att.id, att.original_name)}
                      >
                        删除
                      </Button>
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div style={{ marginBottom: 20 }}>
            <Text strong style={{ display: "block", marginBottom: 8 }}>项目背景说明</Text>
            <TextArea
              value={proposalDraft}
              onChange={setProposalDraft}
              rows={6}
                placeholder="补充项目背景、客户目标、建设范围、已知约束…"
              style={{ ...techInputStyle, marginBottom: 12 }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
              <Text strong style={{ display: "block", marginBottom: 8 }}>审查智能体</Text>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div
                style={{
                  flex: 1,
                  minWidth: 280,
                  padding: "12px 14px",
                  borderRadius: 14,
                  border: "1px solid rgba(120, 255, 230, 0.12)",
                  background: "rgba(255,255,255,0.88)",
                  color: "#0f172a",
                }}
              >
                {selectedAgent
                  ? `${selectedAgent.name} · ${selectedAgent.model}`
                  : "当前任务未绑定审查智能体"}
              </div>
              <Button loading={saving} onClick={() => void saveMaterialsAndPrompt()}>
                保存说明并重建解析
              </Button>
              <Button theme="solid" type="primary" loading={reviewBusy} style={techPrimaryBtn} onClick={() => void triggerIssueReview()}>
                {reviewBusy ? "提交中…" : "发起问题审查"}
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {step === "result" ? (
        issueSummary || (issueList && issueList.items.length > 0) ? (
          <Space vertical spacing="loose" style={{ width: "100%", alignItems: "stretch" }}>
            <Card
              bordered={false}
              style={shellCardStyle}
              className="tech-enter tech-enter-3"
              title={<Title heading={5} style={{ color: "#0f172a" }}>问题审查总览</Title>}
            >
              <Space style={{ width: "100%", justifyContent: "space-between", flexWrap: "wrap", marginBottom: 16 }}>
                <div style={{ maxWidth: 900 }}>
                  <Text style={{ display: "block", color: "rgba(15, 23, 42, 0.72)", fontSize: 12 }}>总体判断</Text>
                  <Paragraph style={{ margin: "8px 0 0", color: "rgba(51, 65, 85, 0.9)", lineHeight: 1.8 }}>
                    {issueSummary?.overall_assessment || "当前尚未形成总体审查判断。"}
                  </Paragraph>
                </div>
                <Space wrap>
                  <Button
                    icon={<IconDownload />}
                    onClick={() =>
                      void downloadIssueReportHtml(task.id, task.name).catch((e) =>
                        setErr(e instanceof Error ? e.message : "HTML 意见书下载失败")
                      )
                    }
                  >
                    下载 HTML 意见书
                  </Button>
                  <Button
                    icon={<IconDownload />}
                    loading={wordDownloading}
                    onClick={() => {
                      setErr(null);
                      setWordDownloading(true);
                      void downloadIssueReportWord(task.id, task.name)
                        .catch((e) => setErr(e instanceof Error ? e.message : "Word 意见书下载失败"))
                        .finally(() => setWordDownloading(false));
                    }}
                  >
                    下载 Word 意见书
                  </Button>
                  <Button loading={reviewBusy} onClick={() => void triggerIssueReview()}>
                    {reviewBusy ? "提交中…" : "重新发起问题审查"}
                  </Button>
                </Space>
              </Space>

              <div className="taskhome-stat-row" style={{ marginTop: 0 }}>
                <div className="taskhome-stat-card">
                  <Text className="taskhome-stat-label">严重问题</Text>
                  <div className="taskhome-stat-value">{issueSummary?.serious_count ?? 0}</div>
                </div>
                <div className="taskhome-stat-card">
                  <Text className="taskhome-stat-label">一般问题</Text>
                  <div className="taskhome-stat-value">{issueSummary?.major_count ?? 0}</div>
                </div>
                <div className="taskhome-stat-card">
                  <Text className="taskhome-stat-label">轻微问题</Text>
                  <div className="taskhome-stat-value">{issueSummary?.minor_count ?? 0}</div>
                </div>
              </div>

              {issueSummary?.missing_materials?.length ? (
                <div style={{ marginTop: 18 }}>
                  <Text strong style={{ display: "block", marginBottom: 8 }}>建议补充材料</Text>
                  <ul style={{ margin: 0, paddingLeft: 20, color: "rgba(71, 85, 105, 0.88)" }}>
                    {issueSummary.missing_materials.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </Card>

            <Card bordered={false} style={softTechCardStyle} className="tech-enter tech-enter-4">
              <Space style={{ width: "100%", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <Space wrap>
                  <Button
                    theme={severityFilter === "all" ? "solid" : "light"}
                    type={severityFilter === "all" ? "primary" : "tertiary"}
                    style={severityFilter === "all" ? techPrimaryBtn : undefined}
                    onClick={() => setSeverityFilter("all")}
                  >
                    全部问题
                  </Button>
                  <Button
                    theme={severityFilter === "serious" ? "solid" : "light"}
                    type={severityFilter === "serious" ? "primary" : "tertiary"}
                    style={severityFilter === "serious" ? techPrimaryBtn : undefined}
                    onClick={() => setSeverityFilter("serious")}
                  >
                    仅严重
                  </Button>
                  <Button
                    theme={severityFilter === "major" ? "solid" : "light"}
                    type={severityFilter === "major" ? "primary" : "tertiary"}
                    style={severityFilter === "major" ? techPrimaryBtn : undefined}
                    onClick={() => setSeverityFilter("major")}
                  >
                    仅一般
                  </Button>
                  <Button
                    theme={severityFilter === "minor" ? "solid" : "light"}
                    type={severityFilter === "minor" ? "primary" : "tertiary"}
                    style={severityFilter === "minor" ? techPrimaryBtn : undefined}
                    onClick={() => setSeverityFilter("minor")}
                  >
                    仅轻微
                  </Button>
                  <Select
                    value={dimensionFilter}
                    style={{ minWidth: 220 }}
                    optionList={dimensionOptions}
                    onChange={(value: string | number | Record<string, unknown> | unknown[] | undefined) =>
                      setDimensionFilter(typeof value === "number" || value === "all" ? value : "all")
                    }
                  />
                  <Input
                    value={issueKeyword}
                    onChange={setIssueKeyword}
                    placeholder="搜索问题标题、描述、建议"
                    style={{ minWidth: 260, ...techInputStyle }}
                  />
                </Space>
                <Button
                  theme={manualOnly ? "solid" : "light"}
                  type={manualOnly ? "primary" : "tertiary"}
                  style={manualOnly ? techPrimaryBtn : undefined}
                  onClick={() => setManualOnly((v) => !v)}
                >
                  {manualOnly ? "显示全部" : "仅人工重点复核"}
                </Button>
                <Select
                  value={statusFilter}
                  style={{ minWidth: 180 }}
                  optionList={[
                    { label: "全部状态", value: "all" },
                    { label: "待处理", value: "open" },
                    { label: "已采纳", value: "accepted" },
                    { label: "已驳回", value: "dismissed" },
                    { label: "已修订", value: "revised" },
                  ]}
                  onChange={(value: string | number | Record<string, unknown> | unknown[] | undefined) =>
                    setStatusFilter(typeof value === "string" ? (value as "all" | ReviewIssue["status"]) : "all")
                  }
                />
              </Space>
            </Card>

            {filteredIssues.map((item) => (
              <Card key={item.id} bordered={false} style={softTechCardStyle} className="tech-rise-in tech-delay-2">
                <Space style={{ width: "100%", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    {(() => {
                      const highlightTerms = issueHighlightTerms(item);
                      return (
                        <>
                    <Space spacing={8} wrap>
                      <Tag color={item.severity === "serious" ? "red" : item.severity === "major" ? "orange" : "blue"}>
                        {item.severity === "serious" ? "严重问题" : item.severity === "major" ? "一般问题" : "轻微问题"}
                      </Tag>
                      <Tag type="light">{item.dimension_title}</Tag>
                      {item.needs_supplement ? <Tag color="purple">需补材料</Tag> : null}
                      {item.manual_review ? <Tag color="pink">人工重点复核</Tag> : null}
                    </Space>
                    <Title heading={6} style={{ margin: "10px 0 0", color: "#0f172a" }}>
                      {item.title}
                    </Title>
                    {editingIssueId === item.id ? (
                      <div
                        style={{
                          marginTop: 14,
                          padding: 14,
                          borderRadius: 18,
                          background: "rgba(248, 250, 252, 0.92)",
                          border: "1px solid rgba(203, 213, 225, 0.92)",
                        }}
                      >
                        <Space vertical align="start" spacing="medium" style={{ width: "100%" }}>
                          <Space wrap style={{ width: "100%" }}>
                            <Select
                              value={issueDraft.severity}
                              style={{ minWidth: 140 }}
                              optionList={[
                                { label: "严重问题", value: "serious" },
                                { label: "一般问题", value: "major" },
                                { label: "轻微问题", value: "minor" },
                              ]}
                              onChange={(value: string | number | Record<string, unknown> | unknown[] | undefined) =>
                                setIssueDraft((current) => ({
                                  ...current,
                                  severity: (typeof value === "string" ? value : current.severity) as ReviewIssue["severity"],
                                }))
                              }
                            />
                            <Select
                              value={issueDraft.status}
                              style={{ minWidth: 140 }}
                              optionList={[
                                { label: "待处理", value: "open" },
                                { label: "已采纳", value: "accepted" },
                                { label: "已驳回", value: "dismissed" },
                                { label: "已修订", value: "revised" },
                              ]}
                              onChange={(value: string | number | Record<string, unknown> | unknown[] | undefined) =>
                                setIssueDraft((current) => ({
                                  ...current,
                                  status: (typeof value === "string" ? value : current.status) as ReviewIssue["status"],
                                }))
                              }
                            />
                          </Space>
                          <Input
                            value={(issueDraft.title ?? "").toString()}
                            placeholder="问题标题"
                            onChange={(value) => setIssueDraft((current) => ({ ...current, title: value }))}
                          />
                          <TextArea
                            value={(issueDraft.description ?? "").toString()}
                            placeholder="问题描述"
                            autosize={{ minRows: 3, maxRows: 6 }}
                            onChange={(value: string) => setIssueDraft((current) => ({ ...current, description: value }))}
                          />
                          <TextArea
                            value={(issueDraft.reason ?? "").toString()}
                            placeholder="形成原因"
                            autosize={{ minRows: 2, maxRows: 5 }}
                            onChange={(value: string) => setIssueDraft((current) => ({ ...current, reason: value }))}
                          />
                          <TextArea
                            value={(issueDraft.suggestion ?? "").toString()}
                            placeholder="整改建议"
                            autosize={{ minRows: 2, maxRows: 5 }}
                            onChange={(value: string) => setIssueDraft((current) => ({ ...current, suggestion: value }))}
                          />
                          <Space wrap spacing={16}>
                            <Checkbox
                              checked={!!issueDraft.needs_supplement}
                              onChange={(e) => setIssueDraft((current) => ({ ...current, needs_supplement: e.target.checked }))}
                            >
                              需补材料
                            </Checkbox>
                            <Checkbox
                              checked={!!issueDraft.manual_review}
                              onChange={(e) => setIssueDraft((current) => ({ ...current, manual_review: e.target.checked }))}
                            >
                              人工重点复核
                            </Checkbox>
                          </Space>
                          <Space wrap>
                            <Button
                              loading={issueBusyId === item.id}
                              style={techPrimaryBtn}
                              theme="solid"
                              type="primary"
                              onClick={() => void saveIssueEdit(item.id)}
                            >
                              保存修改
                            </Button>
                            <Button onClick={cancelEditIssue}>取消</Button>
                          </Space>
                        </Space>
                      </div>
                    ) : (
                      <>
                        <Paragraph style={{ margin: "10px 0 0", color: "rgba(71, 85, 105, 0.9)", lineHeight: 1.8 }}>
                          {item.description}
                        </Paragraph>
                        {item.reason ? (
                          <Paragraph style={{ margin: "8px 0 0", color: "rgba(51, 65, 85, 0.88)", lineHeight: 1.8 }}>
                            原因：{item.reason}
                          </Paragraph>
                        ) : null}
                        {item.suggestion ? (
                          <Paragraph style={{ margin: "8px 0 0", color: "rgba(37, 99, 235, 0.92)", lineHeight: 1.8 }}>
                            建议：{item.suggestion}
                          </Paragraph>
                        ) : null}
                      </>
                    )}
                    {item.evidences.length ? (
                      <div style={{ marginTop: 12 }}>
                        <Text strong style={{ display: "block", marginBottom: 8 }}>证据引用</Text>
                        <Space vertical align="start" spacing="medium" style={{ width: "100%" }}>
                          {item.evidences.map((evidence) => (
                            <div
                              key={evidence.id}
                              style={{
                                width: "100%",
                                padding: 12,
                                borderRadius: 14,
                                background: "rgba(248, 250, 252, 0.92)",
                                border: "1px solid rgba(226, 232, 240, 0.95)",
                              }}
                            >
                              <Text style={{ display: "block", color: "rgba(15, 23, 42, 0.76)", fontSize: 12 }}>
                                {evidence.file_name}
                                {evidence.page_from != null ? ` · 第 ${evidence.page_from}${evidence.page_to && evidence.page_to !== evidence.page_from ? `-${evidence.page_to}` : ""} 页` : ""}
                                {evidence.section_title ? ` · ${evidence.section_title}` : ""}
                              </Text>
                              <Paragraph style={{ margin: "6px 0 0", color: "rgba(51, 65, 85, 0.88)", lineHeight: 1.7 }}>
                                {renderHighlightedText(evidence.quote_text, highlightTerms)}
                              </Paragraph>
                              {evidence.chunk_id ? (
                                <Button
                                  size="small"
                                  theme="borderless"
                                  style={{ marginTop: 6, paddingLeft: 0 }}
                                  onClick={() => jumpToChunk(evidence.chunk_id)}
                                >
                                  定位到对应 chunk
                                </Button>
                              ) : null}
                            </div>
                          ))}
                        </Space>
                      </div>
                    ) : null}
                    <Space wrap style={{ marginTop: 14 }}>
                      <Button
                        size="small"
                        loading={issueBusyId === item.id}
                        onClick={() => void patchIssue(item.id, { status: "accepted" })}
                      >
                        采纳
                      </Button>
                      <Button
                        size="small"
                        loading={issueBusyId === item.id}
                        onClick={() => void patchIssue(item.id, { status: "dismissed" })}
                      >
                        驳回
                      </Button>
                      <Button
                        size="small"
                        loading={issueBusyId === item.id}
                        onClick={() =>
                          void patchIssue(item.id, {
                            manual_review: !item.manual_review,
                          })
                        }
                      >
                        {item.manual_review ? "取消重点复核" : "标记重点复核"}
                      </Button>
                      <Button
                        size="small"
                        loading={issueBusyId === item.id}
                        onClick={() => startEditIssue(item)}
                      >
                        编辑
                      </Button>
                    </Space>
                        </>
                      );
                    })()}
                  </div>
                  <Tag type="light">
                    状态：{item.status === "accepted" ? "已采纳" : item.status === "dismissed" ? "已驳回" : item.status === "revised" ? "已修订" : "待处理"}
                  </Tag>
                </Space>
              </Card>
            ))}
            {!filteredIssues.length ? (
              <Card bordered={false} style={softTechCardStyle}>
                <Paragraph style={{ margin: 0, color: "rgba(71, 85, 105, 0.86)" }}>
                  当前筛选条件下暂无问题记录。
                </Paragraph>
              </Card>
            ) : null}
          </Space>
        ) : (
          <Card bordered={false} style={shellCardStyle} className="tech-enter tech-enter-3">
            <Paragraph style={{ color: "rgba(51, 65, 85, 0.88)" }}>
              当前还没有问题审查结果。请先更新材料解析，再点击“发起问题审查”。
            </Paragraph>
            <Space style={{ marginTop: 12 }}>
              <Button loading={analyzing} onClick={() => void runAnalysis()}>
                {analyzing ? "解析中…" : "更新材料解析"}
              </Button>
              <Button theme="solid" type="primary" loading={reviewBusy} style={techPrimaryBtn} onClick={() => void triggerIssueReview()}>
                {reviewBusy ? "提交中…" : "发起问题审查"}
              </Button>
            </Space>
          </Card>
        )
      ) : null}

      {step === "report" ? (
        <Space vertical spacing="loose" style={{ width: "100%", alignItems: "stretch" }}>
          <Card
            bordered={false}
            style={shellCardStyle}
            className="tech-enter tech-enter-3"
            title={<Title heading={5} style={{ color: "#0f172a" }}>审查意见书</Title>}
          >
            <Paragraph style={{ color: "rgba(51, 65, 85, 0.88)", lineHeight: 1.8 }}>
              当前报告页已切换为基于问题清单的“审查意见书”导出模式，不再兼容旧版评分报告。请先完成问题审查，再下载 HTML 或 Word 版意见书。
            </Paragraph>

            {issueSummary ? (
              <div style={{ marginBottom: 18 }}>
                <Text strong style={{ display: "block", marginBottom: 8 }}>总体判断</Text>
                <Paragraph style={{ margin: 0, color: "rgba(51, 65, 85, 0.88)", lineHeight: 1.8 }}>
                  {issueSummary.overall_assessment || "当前尚未形成总体判断。"}
                </Paragraph>
              </div>
            ) : null}

            <Space wrap>
              <Button
                theme="solid"
                type="primary"
                icon={<IconDownload />}
                loading={wordDownloading}
                style={techPrimaryBtn}
                onClick={() => {
                  setErr(null);
                  setWordDownloading(true);
                  void downloadIssueReportWord(task.id, task.name)
                    .catch((e) => setErr(e instanceof Error ? e.message : "Word 意见书下载失败"))
                    .finally(() => setWordDownloading(false));
                }}
              >
                下载 Word 意见书
              </Button>
              <Button
                type="tertiary"
                onClick={() =>
                  void downloadIssueReportHtml(task.id, task.name).catch((e) =>
                    setErr(e instanceof Error ? e.message : "HTML 意见书下载失败")
                  )
                }
              >
                下载 HTML 意见书
              </Button>
            </Space>
          </Card>

          <Card bordered={false} style={softTechCardStyle} className="tech-enter tech-enter-4" title={<Title heading={6} style={{ color: "#0f172a" }}>评测原则</Title>}>
            <ul style={{ margin: 0, paddingLeft: 20, color: "rgba(71, 85, 105, 0.88)", fontSize: 14 }}>
              {fw.meta.principles.map((t, i) => (
                <li key={i} style={{ marginBottom: 4 }}>{t}</li>
              ))}
            </ul>
          </Card>
        </Space>
      ) : null}

      <div className="taskdetail-footer-nav">
        {prevKey ? (
          <Button type="tertiary" onClick={() => nav(`/tasks/${task.id}/${prevKey}`)}>
            上一步：{STEP_DEF.find((s) => s.key === prevKey)?.title}
          </Button>
        ) : (
          <span />
        )}
        {nextKey ? (
          <Button
            theme="solid"
            type="primary"
            style={techPrimaryBtn}
            disabled={step === "materials" && !issueSummary}
            onClick={() => nav(`/tasks/${task.id}/${nextKey}`)}
          >
            下一步：{STEP_DEF.find((s) => s.key === nextKey)?.title}
          </Button>
        ) : (
          <span />
        )}
      </div>
    </Space>
  );
}
