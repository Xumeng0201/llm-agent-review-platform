import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  IconAIWandLevel2,
  IconArticle,
  IconDownload,
  IconFile,
  IconList,
} from "@douyinfe/semi-icons";
import {
  Button,
  Card,
  Divider,
  InputNumber,
  Progress,
  Select,
  Slider,
  Space,
  Table,
  Tag,
  TextArea,
  Typography,
} from "@douyinfe/semi-ui";
import {
  aiApplyReport,
  aiGenerateReport,
  aiSuggestScores,
  attachmentDownloadUrl,
  fetchFramework,
  fetchReport,
  getTask,
  listAgents,
  listAttachments,
  listScores,
  reportDownloadUrl,
  saveScore,
  updateTask,
  uploadAttachment,
} from "../api";
import type {
  AiSuggestResult,
  Attachment,
  Framework,
  Indicator,
  IndicatorScoreRow,
  LlmAgent,
  OverallReport,
  ReviewTask,
} from "../types";

const { Title, Paragraph, Text } = Typography;

type Tab = "proposal" | "scores" | "report";

type AiReportDraft = {
  conclusion: string;
  highlights: string;
  issues: string;
  items: { indicator_id: number; score: number; notes: string; opinion: string }[];
  agent_name: string;
  raw_excerpt: string;
};

function conclusionTagColor(code: string): "green" | "orange" | "red" {
  if (code === "pass") return "green";
  if (code === "rectify") return "orange";
  return "red";
}

const fullWidthCard = { width: "100%" as const };

export default function TaskDetail() {
  const nav = useNavigate();
  const { id } = useParams();
  const taskId = Number(id);
  const [tab, setTab] = useState<Tab>("proposal");
  const [task, setTask] = useState<ReviewTask | null>(null);
  const [fw, setFw] = useState<Framework | null>(null);
  const [scores, setScores] = useState<IndicatorScoreRow[]>([]);
  const [report, setReport] = useState<OverallReport | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [proposalDraft, setProposalDraft] = useState("");
  const [highlightsDraft, setHighlightsDraft] = useState("");
  const [issuesDraft, setIssuesDraft] = useState("");
  const [reviewSummaryDraft, setReviewSummaryDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(1);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [agents, setAgents] = useState<LlmAgent[]>([]);
  const [pickAgentId, setPickAgentId] = useState<string | number | undefined>(
    undefined
  );
  const [aiResult, setAiResult] = useState<AiSuggestResult | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiReportDraft, setAiReportDraft] = useState<AiReportDraft | null>(null);
  const [aiReportBusy, setAiReportBusy] = useState(false);

  const scoreMap = useMemo(() => {
    const m = new Map<number, IndicatorScoreRow>();
    scores.forEach((s) => m.set(s.indicator_id, s));
    return m;
  }, [scores]);

  const loadAll = useCallback(async () => {
    if (!Number.isFinite(taskId)) return;
    setErr(null);
    const [t, f, sc, att] = await Promise.all([
      getTask(taskId),
      fetchFramework(),
      listScores(taskId),
      listAttachments(taskId),
    ]);
    setTask(t);
    setFw(f);
    setScores(sc);
    setAttachments(att);
    setProposalDraft(t.proposal_body ?? "");
    setHighlightsDraft(t.summary_highlights ?? "");
    setIssuesDraft(t.summary_issues ?? "");
    setReviewSummaryDraft(t.review_summary ?? "");
  }, [taskId]);

  useEffect(() => {
    void loadAll().catch((e) => setErr(e instanceof Error ? e.message : "加载失败"));
  }, [loadAll]);

  useEffect(() => {
    void listAgents().then(setAgents).catch(() => {});
  }, []);

  useEffect(() => {
    if (task?.llm_agent_id != null) setPickAgentId(task.llm_agent_id);
    else setPickAgentId(undefined);
  }, [task?.id, task?.llm_agent_id]);

  useEffect(() => {
    if (!Number.isFinite(taskId) || tab !== "report") return;
    void fetchReport(taskId)
      .then(setReport)
      .catch((e) => setErr(e instanceof Error ? e.message : "报告加载失败"));
  }, [tab, taskId, scores]);

  async function saveProposal() {
    if (!task) return;
    setMsg(null);
    setErr(null);
    try {
      const t = await updateTask(task.id, { proposal_body: proposalDraft });
      setTask(t);
      setMsg("方案说明已保存。");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失败");
    }
  }

  async function saveSummary() {
    if (!task) return;
    setMsg(null);
    setErr(null);
    try {
      const t = await updateTask(task.id, {
        summary_highlights: highlightsDraft,
        summary_issues: issuesDraft,
        review_summary: reviewSummaryDraft,
      });
      setTask(t);
      setMsg("报告中的亮点、整改意见与综合评审意见已保存。");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失败");
    }
  }

  async function saveDefaultAgent() {
    if (!task) return;
    setErr(null);
    setMsg(null);
    try {
      const t = await updateTask(task.id, {
        llm_agent_id:
          pickAgentId === undefined || pickAgentId === ""
            ? null
            : Number(pickAgentId),
      });
      setTask(t);
      setMsg("已更新任务默认智能体。");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失败");
    }
  }

  async function runAiSuggest() {
    if (!Number.isFinite(taskId)) return;
    setErr(null);
    setMsg(null);
    setAiBusy(true);
    setAiResult(null);
    try {
      const r = await aiSuggestScores(taskId, {
        agent_id:
          pickAgentId === undefined || pickAgentId === ""
            ? undefined
            : Number(pickAgentId),
      });
      setAiResult(r);
      setMsg(`已使用「${r.agent_name}」生成建议，请人工复核后再采纳。`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "智能体调用失败");
    } finally {
      setAiBusy(false);
    }
  }

  async function runAiFullReport() {
    if (!Number.isFinite(taskId)) return;
    setErr(null);
    setMsg(null);
    setAiReportBusy(true);
    setAiReportDraft(null);
    try {
      const r = await aiGenerateReport(taskId, {
        agent_id:
          pickAgentId === undefined || pickAgentId === ""
            ? undefined
            : Number(pickAgentId),
      });
      setAiReportDraft({
        conclusion: r.conclusion,
        highlights: r.highlights,
        issues: r.issues,
        items: r.items.map((x) => ({ ...x })),
        agent_name: r.agent_name,
        raw_excerpt: r.raw_excerpt,
      });
      setMsg(`已使用「${r.agent_name}」生成完整报告预览，可修改后应用到任务。`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "生成完整报告失败");
    } finally {
      setAiReportBusy(false);
    }
  }

  async function applyAiFullReport() {
    if (!aiReportDraft || !Number.isFinite(taskId)) return;
    setErr(null);
    setMsg(null);
    setAiReportBusy(true);
    try {
      await aiApplyReport(taskId, {
        items: aiReportDraft.items,
        conclusion: aiReportDraft.conclusion,
        highlights: aiReportDraft.highlights,
        issues: aiReportDraft.issues,
      });
      await loadAll();
      const rep = await fetchReport(taskId);
      setReport(rep);
      setAiReportDraft(null);
      setMsg("已将智能体报告写入分项说明、亮点、问题与综合评审意见；请下载报告前再核对。");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "应用失败");
    } finally {
      setAiReportBusy(false);
    }
  }

  async function applyAiScores() {
    if (!aiResult || !Number.isFinite(taskId)) return;
    setErr(null);
    setMsg(null);
    setAiBusy(true);
    try {
      for (const it of aiResult.items) {
        await saveScore(taskId, {
          indicator_id: it.indicator_id,
          score: it.score,
          notes: `[AI·${aiResult.agent_name}] ${it.notes}`,
        });
      }
      setScores(await listScores(taskId));
      setAiResult(null);
      setMsg("已将建议写入分项表，请务必人工复核调整。");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "写入失败");
    } finally {
      setAiBusy(false);
    }
  }

  async function onSaveIndicator(
    indicatorId: number,
    scoreVal: number,
    notes: string
  ) {
    setErr(null);
    setSavingId(indicatorId);
    try {
      await saveScore(taskId, {
        indicator_id: indicatorId,
        score: scoreVal,
        notes: notes || undefined,
      });
      setScores(await listScores(taskId));
      setMsg(`已保存「${indicatorId}」号指标评分。`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingId(null);
    }
  }

  async function onFileSelected(files: FileList | null) {
    if (!files?.length) return;
    setErr(null);
    try {
      for (const file of Array.from(files)) {
        await uploadAttachment(taskId, file, "项目方案");
      }
      setAttachments(await listAttachments(taskId));
      setMsg("方案文件已上传。");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "上传失败");
    }
  }

  if (!Number.isFinite(taskId)) {
    return (
      <Card bordered style={fullWidthCard}>
        <Paragraph type="tertiary">无效的任务 ID。</Paragraph>
        <Button
          theme="borderless"
          type="primary"
          style={{ marginTop: 8, paddingLeft: 0 }}
          onClick={() => nav("/tasks")}
        >
          返回列表
        </Button>
      </Card>
    );
  }

  if (!task || !fw) {
    return (
      <Card bordered style={fullWidthCard}>
        <Paragraph type="tertiary">加载中…</Paragraph>
        {err ? (
          <Paragraph type="danger" style={{ marginTop: 8 }}>
            {err}
          </Paragraph>
        ) : null}
      </Card>
    );
  }

  const tabBtn = (key: Tab, label: string, icon: React.ReactNode) => (
    <Button
      key={key}
      icon={icon}
      theme={tab === key ? "solid" : "light"}
      type={tab === key ? "primary" : "tertiary"}
      onClick={() => setTab(key)}
    >
      {label}
    </Button>
  );

  return (
    <Space
      vertical
      spacing="loose"
      style={{ width: "100%", alignItems: "stretch" }}
    >
      <Card
        bordered
        shadows="hover"
        style={fullWidthCard}
        title={<Title heading={4}>{task.name}</Title>}
        headerExtraContent={
          <Button theme="light" type="tertiary" onClick={() => nav("/tasks")}>
            返回列表
          </Button>
        }
      >
        <Paragraph type="secondary" style={{ margin: 0 }}>
          十项一级指标各 0～10 分，合计满分 100 分；结论由系统按规则汇总（含数据项一票否决与安全重点项）。
        </Paragraph>
      </Card>

      {err ? (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 6,
            width: "100%",
            background: "rgba(var(--semi-red-0), 1)",
            border: "1px solid rgba(var(--semi-red-2), 1)",
            color: "rgba(var(--semi-red-9), 1)",
            fontSize: 14,
          }}
          role="alert"
        >
          {err}
        </div>
      ) : null}
      {msg ? (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 6,
            width: "100%",
            background: "rgba(var(--semi-green-0), 1)",
            border: "1px solid rgba(var(--semi-green-2), 1)",
            color: "rgba(var(--semi-green-9), 1)",
            fontSize: 14,
          }}
          role="status"
        >
          {msg}
        </div>
      ) : null}

      <Space
        spacing={8}
        style={{
          flexWrap: "wrap",
          paddingBottom: 12,
          borderBottom: "1px solid rgba(var(--semi-border-color), 1)",
          width: "100%",
        }}
      >
        {tabBtn("proposal", "方案与上传", <IconFile />)}
        {tabBtn("scores", "分项打分", <IconList />)}
        {tabBtn("report", "评审报告", <IconDownload />)}
      </Space>

      {tab === "proposal" && (
        <Card
          bordered
          shadows="hover"
          style={fullWidthCard}
          title={<Title heading={5}>项目方案</Title>}
        >
          <Paragraph type="tertiary" style={{ marginTop: -8 }}>
            上传 Word / PDF 等方案文件；也可在下方填写补充说明（与附件一并写入报告依据）。
          </Paragraph>
          <div style={{ marginBottom: 20 }}>
            <Text strong style={{ display: "block", marginBottom: 8 }}>
              上传方案文件
            </Text>
            <input
              type="file"
              multiple
              onChange={(e) => void onFileSelected(e.target.files)}
              style={{ fontSize: 14 }}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <Text strong style={{ display: "block", marginBottom: 8 }}>
              已上传
            </Text>
            <ul style={{ margin: 0, paddingLeft: 20, color: "rgba(var(--semi-grey-7),1)" }}>
              {attachments.length === 0 ? (
                <li>暂无附件</li>
              ) : (
                attachments.map((a) => (
                  <li key={a.id}>
                    <a
                      href={attachmentDownloadUrl(task.id, a.id)}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "rgba(var(--semi-blue-6),1)" }}
                    >
                      {a.original_name}
                    </a>
                  </li>
                ))
              )}
            </ul>
          </div>
          <Divider margin="12px" />
          <div>
            <Text strong style={{ display: "block", marginBottom: 8 }}>
              方案说明（可选）
            </Text>
            <TextArea
              value={proposalDraft}
              onChange={setProposalDraft}
              rows={5}
              placeholder="可粘贴方案摘要或关键信息…"
              style={{ marginBottom: 12 }}
            />
            <Button theme="solid" type="primary" onClick={() => void saveProposal()}>
              保存说明
            </Button>
          </div>
        </Card>
      )}

      {tab === "scores" && (
        <Space
          vertical
          spacing="loose"
          style={{ width: "100%", alignItems: "stretch" }}
        >
          <Card
            bordered
            style={{
              ...fullWidthCard,
              borderColor: "rgba(var(--semi-blue-3), 0.45)",
              background: "rgba(var(--semi-blue-0), 0.55)",
            }}
            title={
              <Space>
                <IconAIWandLevel2 style={{ fontSize: 18, color: "rgba(var(--semi-blue-6),1)" }} />
                <Title heading={6} style={{ margin: 0 }}>
                  测评智能体辅助
                </Title>
              </Space>
            }
          >
            <Paragraph type="tertiary" size="small" style={{ marginTop: -8 }}>
              在「测评方法」中配置 DeepSeek / OpenAI 等 Key
              后，可在此调用模型根据方案正文与附件名生成十项 0～10
              分建议。采纳前请人工复核；未填方案说明且无附件时无法调用。
            </Paragraph>
            <div style={{ marginTop: 12, width: "100%" }}>
              <Text strong style={{ display: "block", marginBottom: 8 }}>
                使用的智能体
              </Text>
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                  flexWrap: "nowrap",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Select
                    value={pickAgentId}
                    onChange={(v) => setPickAgentId(v as string | number | undefined)}
                    style={{ width: "100%" }}
                    optionList={[
                      { label: "使用任务默认（未绑定则需在下方选择）", value: "" },
                      ...agents.map((a) => ({
                        label: `${a.name} · ${a.model}`,
                        value: a.id,
                      })),
                    ]}
                  />
                </div>
                <Button
                  style={{ flexShrink: 0, whiteSpace: "nowrap" }}
                  onClick={() => void saveDefaultAgent()}
                >
                  保存为任务默认
                </Button>
                <Button
                  theme="solid"
                  type="primary"
                  loading={aiBusy}
                  style={{ flexShrink: 0, whiteSpace: "nowrap" }}
                  onClick={() => void runAiSuggest()}
                >
                  {aiBusy ? "调用中…" : "生成 AI 打分建议"}
                </Button>
              </div>
            </div>
            {aiResult ? (
              <>
                <Divider margin="16px" />
                <Text type="tertiary" size="small" style={{ display: "block", marginBottom: 8 }}>
                  模型：{aiResult.agent_name}（节选）{aiResult.raw_excerpt}
                </Text>
                <Table
                  size="small"
                  pagination={false}
                  style={{ width: "100%" }}
                  columns={[
                    { title: "#", dataIndex: "indicator_id", width: 48 },
                    { title: "建议分", dataIndex: "score", width: 80 },
                    { title: "说明", dataIndex: "notes" },
                  ]}
                  dataSource={aiResult.items.map((row) => ({
                    ...row,
                    key: row.indicator_id,
                  }))}
                />
                <Space style={{ marginTop: 12 }}>
                  <Button
                    theme="solid"
                    type="primary"
                    disabled={aiBusy}
                    onClick={() => void applyAiScores()}
                  >
                    采纳并写入分项
                  </Button>
                  <Button type="tertiary" onClick={() => setAiResult(null)}>
                    丢弃建议
                  </Button>
                </Space>
              </>
            ) : null}
          </Card>
          <Paragraph type="tertiary" size="small" style={{ width: "100%" }}>
            指标 5「数据体系」得分 &lt; 5 视为一票否决；指标 7「安全管控」得分 &lt; 5
            为重点项不通过；任三项得分 &lt; 5 为不通过。总分 ≥85 且数据、安全项 ≥6 为通过；总分
            ≥65 且未触发红线为基本通过（需整改）。
          </Paragraph>
          {fw.indicators.map((ind) => (
            <IndicatorScoreCard
              key={ind.id}
              ind={ind}
              row={scoreMap.get(ind.id)}
              expanded={expandedId === ind.id}
              onToggle={() =>
                setExpandedId((v) => (v === ind.id ? null : ind.id))
              }
              saving={savingId === ind.id}
              onSave={(scoreVal, notes) =>
                void onSaveIndicator(ind.id, scoreVal, notes)
              }
            />
          ))}
        </Space>
      )}

      {tab === "report" && !report && (
        <Paragraph type="tertiary" style={{ width: "100%" }}>
          正在汇总…
        </Paragraph>
      )}

      {tab === "report" && report && (
        <Space
          vertical
          spacing="loose"
          style={{ width: "100%", alignItems: "stretch" }}
        >
          <Card
            bordered
            shadows="hover"
            style={fullWidthCard}
            bodyStyle={{ width: "100%" }}
            title={<Title heading={5}>评分与结论</Title>}
          >
            <Space
              style={{
                width: "100%",
                justifyContent: "space-between",
                flexWrap: "wrap",
                marginBottom: 12,
              }}
            >
              <Space spacing={12} align="center">
                <span style={{ fontSize: 28, fontWeight: 700 }}>
                  {report.total_score}
                  <span
                    style={{
                      fontSize: 18,
                      fontWeight: 400,
                      color: "rgba(var(--semi-grey-6),1)",
                    }}
                  >
                    {" "}
                    / {report.max_total}
                  </span>
                </span>
                <Tag size="large" color={conclusionTagColor(report.conclusion_code)} type="light">
                  {report.conclusion_label}
                </Tag>
              </Space>
              <Button
                theme="solid"
                type="primary"
                icon={<IconDownload />}
                onClick={() => {
                  window.location.href = reportDownloadUrl(task.id);
                }}
              >
                下载评审报告
              </Button>
            </Space>
            <Progress
              percent={report.total_score}
              stroke="rgba(var(--semi-blue-5),1)"
              style={{ marginBottom: 16 }}
            />
            <div style={{ marginBottom: 16 }}>
              <Text strong style={{ display: "block", marginBottom: 8 }}>
                结论说明
              </Text>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 20,
                  color: "rgba(var(--semi-grey-7),1)",
                  fontSize: 14,
                }}
              >
                {report.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
            <Table
              size="small"
              pagination={false}
              columns={[
                { title: "#", dataIndex: "indicator_id", width: 44 },
                { title: "一级指标", dataIndex: "title" },
                {
                  title: "得分",
                  dataIndex: "score",
                  width: 100,
                  align: "center" as const,
                  render: (_: unknown, row: OverallReport["indicators"][0]) =>
                    `${row.score ?? "—"} / ${row.max_score}`,
                },
                {
                  title: "说明",
                  dataIndex: "notes",
                  render: (n: string | null) => (
                    <span style={{ color: "rgba(var(--semi-grey-7),1)" }}>{n || "—"}</span>
                  ),
                },
              ]}
              dataSource={report.indicators.map((row) => ({
                ...row,
                key: row.indicator_id,
              }))}
              style={{ width: "100%" }}
            />
          </Card>

          <Card
            bordered
            style={{
              ...fullWidthCard,
              borderColor: "rgba(var(--semi-blue-3), 0.4)",
              background: "rgba(var(--semi-blue-0), 0.4)",
            }}
            bodyStyle={{ width: "100%" }}
            title={
              <Space>
                <IconArticle style={{ fontSize: 18, color: "rgba(var(--semi-blue-6),1)" }} />
                <Title heading={6} style={{ margin: 0 }}>
                  智能体完整评审报告
                </Title>
              </Space>
            }
          >
            <Paragraph type="tertiary" size="small" style={{ marginTop: -8 }}>
              一次性生成分项分数、分项评审意见、综合结论文本、亮点与整改建议。预览中可直接修改文字，再「应用到任务」写入分项表与报告下载内容（与上方「打分建议」相互独立）。
            </Paragraph>
            <Space wrap style={{ marginTop: 12 }}>
              <Button
                theme="solid"
                type="primary"
                loading={aiReportBusy && !aiReportDraft}
                onClick={() => void runAiFullReport()}
              >
                {aiReportBusy && !aiReportDraft ? "生成中…" : "生成完整报告"}
              </Button>
              {aiReportDraft ? (
                <>
                  <Button
                    loading={aiReportBusy}
                    onClick={() => void applyAiFullReport()}
                  >
                    {aiReportBusy ? "写入中…" : "应用到任务"}
                  </Button>
                  <Button type="tertiary" onClick={() => setAiReportDraft(null)}>
                    关闭预览
                  </Button>
                </>
              ) : null}
            </Space>
            {aiReportDraft ? (
              <>
                <Divider margin="16px" />
                <Text type="tertiary" size="small" style={{ display: "block", marginBottom: 12 }}>
                  模型：{aiReportDraft.agent_name}（节选）{aiReportDraft.raw_excerpt}
                </Text>
                <div style={{ marginBottom: 12 }}>
                  <Text strong style={{ display: "block", marginBottom: 8 }}>
                    综合结论（将写入「综合评审意见」区块）
                  </Text>
                  <TextArea
                    value={aiReportDraft.conclusion}
                    onChange={(v) =>
                      setAiReportDraft((d) => (d ? { ...d, conclusion: v } : d))
                    }
                    rows={4}
                  />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <Text strong style={{ display: "block", marginBottom: 8 }}>
                    项目亮点
                  </Text>
                  <TextArea
                    value={aiReportDraft.highlights}
                    onChange={(v) =>
                      setAiReportDraft((d) => (d ? { ...d, highlights: v } : d))
                    }
                    rows={3}
                  />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <Text strong style={{ display: "block", marginBottom: 8 }}>
                    存在问题与整改建议
                  </Text>
                  <TextArea
                    value={aiReportDraft.issues}
                    onChange={(v) =>
                      setAiReportDraft((d) => (d ? { ...d, issues: v } : d))
                    }
                    rows={3}
                  />
                </div>
                <Table
                  size="small"
                  pagination={false}
                  scroll={{ x: 900 }}
                  columns={[
                    { title: "#", dataIndex: "indicator_id", width: 44 },
                    {
                      title: "分",
                      dataIndex: "score",
                      width: 88,
                      render: (_text, record, index) => (
                        <InputNumber
                          min={0}
                          max={10}
                          value={record.score}
                          onNumberChange={(n) => {
                            const score = Math.min(
                              10,
                              Math.max(0, Math.round(Number(n)))
                            );
                            setAiReportDraft((d) => {
                              if (!d) return d;
                              const items = d.items.slice();
                              items[index] = { ...items[index], score };
                              return { ...d, items };
                            });
                          }}
                        />
                      ),
                    },
                    {
                      title: "打分依据",
                      dataIndex: "notes",
                      render: (_text, record, index) => (
                        <TextArea
                          rows={3}
                          value={record.notes}
                          onChange={(v) => {
                            setAiReportDraft((d) => {
                              if (!d) return d;
                              const items = d.items.slice();
                              items[index] = { ...items[index], notes: v };
                              return { ...d, items };
                            });
                          }}
                          style={{ fontSize: 12 }}
                        />
                      ),
                    },
                    {
                      title: "分项评审意见",
                      dataIndex: "opinion",
                      render: (_text, record, index) => (
                        <TextArea
                          rows={4}
                          value={record.opinion}
                          onChange={(v) => {
                            setAiReportDraft((d) => {
                              if (!d) return d;
                              const items = d.items.slice();
                              items[index] = { ...items[index], opinion: v };
                              return { ...d, items };
                            });
                          }}
                          style={{ fontSize: 12 }}
                        />
                      ),
                    },
                  ]}
                  dataSource={aiReportDraft.items.map((row) => ({
                    ...row,
                    key: row.indicator_id,
                  }))}
                  style={{ width: "100%" }}
                />
              </>
            ) : null}
          </Card>

          <Card
            bordered
            shadows="hover"
            style={fullWidthCard}
            title={<Title heading={5}>报告正文补充</Title>}
          >
            <Paragraph type="tertiary" size="small" style={{ marginTop: -8 }}>
              以下内容会写入下载的 HTML 报告。可与智能体生成结果混编：修改后请点击保存。
            </Paragraph>
            <div style={{ marginBottom: 12 }}>
              <Text strong style={{ display: "block", marginBottom: 8 }}>
                综合评审意见（智能体/人工）
              </Text>
              <TextArea
                value={reviewSummaryDraft}
                onChange={setReviewSummaryDraft}
                rows={4}
                placeholder="总体判断、是否建议通过、主要风险…（下载报告中单独成段展示）"
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <Text strong style={{ display: "block", marginBottom: 8 }}>
                项目亮点
              </Text>
              <TextArea
                value={highlightsDraft}
                onChange={setHighlightsDraft}
                rows={3}
                placeholder="提炼方案优势…"
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <Text strong style={{ display: "block", marginBottom: 8 }}>
                存在问题与整改建议
              </Text>
              <TextArea
                value={issuesDraft}
                onChange={setIssuesDraft}
                rows={3}
                placeholder="逐条问题、建议、时限与复核标准…"
              />
            </div>
            <Button theme="solid" type="primary" onClick={() => void saveSummary()}>
              保存到报告
            </Button>
          </Card>
        </Space>
      )}

      <Card bordered style={fullWidthCard} title={<Title heading={6}>评测原则</Title>}>
        <ul
          style={{
            margin: 0,
            paddingLeft: 20,
            color: "rgba(var(--semi-grey-7),1)",
            fontSize: 14,
          }}
        >
          {fw.meta.principles.map((t, i) => (
            <li key={i} style={{ marginBottom: 4 }}>
              {t}
            </li>
          ))}
        </ul>
      </Card>
    </Space>
  );
}

function IndicatorScoreCard({
  ind,
  row,
  expanded,
  onToggle,
  saving,
  onSave,
}: {
  ind: Indicator;
  row: IndicatorScoreRow | undefined;
  expanded: boolean;
  onToggle: () => void;
  saving: boolean;
  onSave: (score: number, notes: string) => void;
}) {
  const initial = row?.score ?? 0;
  const [localScore, setLocalScore] = useState(initial);
  const [localNotes, setLocalNotes] = useState(row?.notes ?? "");

  useEffect(() => {
    setLocalScore(row?.score ?? 0);
    setLocalNotes(row?.notes ?? "");
  }, [row?.score, row?.notes, row?.id]);

  return (
    <Card bordered style={fullWidthCard} bodyStyle={{ padding: 0 }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          padding: 16,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div>
          <Space spacing={8} wrap>
            <Text strong>
              {ind.id}. {ind.title}
            </Text>
            {ind.veto ? (
              <Tag color="red" size="small">
                一票否决
              </Tag>
            ) : null}
            {ind.critical ? (
              <Tag color="orange" size="small">
                重点考核
              </Tag>
            ) : null}
          </Space>
          <Paragraph type="tertiary" size="small" style={{ margin: "8px 0 0" }}>
            {ind.goal}
          </Paragraph>
        </div>
        <span
          style={{
            flexShrink: 0,
            fontFamily: "monospace",
            padding: "4px 10px",
            borderRadius: 6,
            border: "1px solid rgba(var(--semi-border-color),1)",
            background: "rgba(var(--semi-grey-0),1)",
          }}
        >
          {row?.score ?? "—"}/10
        </span>
      </button>
      {expanded ? (
        <div
          style={{
            padding: "0 16px 16px",
            borderTop: "1px solid rgba(var(--semi-border-color),1)",
          }}
        >
          <Paragraph type="tertiary" size="small" style={{ margin: "12px 0" }}>
            判定参考：{ind.verdict_rules}
          </Paragraph>
          {ind.secondaries.map((s) => (
            <div
              key={s.id}
              style={{
                marginBottom: 12,
                padding: 12,
                borderRadius: 8,
                border: "1px solid rgba(var(--semi-border-color),1)",
                background: "rgba(var(--semi-grey-0),0.6)",
              }}
            >
              <Text strong>{s.title}</Text>
              <ul
                style={{
                  margin: "8px 0 0",
                  paddingLeft: 18,
                  fontSize: 12,
                  color: "rgba(var(--semi-grey-7),1)",
                }}
              >
                {s.audit_points.map((ap, i) => (
                  <li key={i}>{ap}</li>
                ))}
              </ul>
              <Text type="tertiary" size="small" style={{ marginTop: 8, display: "block" }}>
                <Text strong>评测依据：</Text>
                {s.basis.join(" ")}
              </Text>
            </div>
          ))}
          <div style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 16 }}>
              <Space style={{ width: "100%", justifyContent: "space-between" }}>
                <Text strong>得分（0～10）</Text>
                <Text type="tertiary" style={{ fontFamily: "monospace" }}>
                  {localScore} 分
                </Text>
              </Space>
              <Slider
                value={localScore}
                onChange={(v) => {
                  const n =
                    typeof v === "number"
                      ? v
                      : Array.isArray(v)
                        ? (v[0] ?? 0)
                        : 0;
                  setLocalScore(n);
                }}
                min={0}
                max={10}
                step={1}
                style={{ marginTop: 12 }}
              />
              <InputNumber
                min={0}
                max={10}
                value={localScore}
                onNumberChange={(n) => {
                  if (n == null || !Number.isFinite(Number(n))) return;
                  setLocalScore(Math.min(10, Math.max(0, Math.round(Number(n)))));
                }}
                style={{ marginTop: 12, maxWidth: 120 }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <Text strong style={{ display: "block", marginBottom: 8 }}>
                评审说明
              </Text>
              <TextArea
                value={localNotes}
                onChange={setLocalNotes}
                rows={3}
                placeholder="扣分原因、依据材料编号等"
              />
            </div>
            <Button
              theme="solid"
              type="primary"
              loading={saving}
              onClick={() => onSave(localScore, localNotes)}
            >
              {saving ? "保存中…" : "保存本项评分"}
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
