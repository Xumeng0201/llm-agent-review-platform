import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Button,
  Card,
  Input,
  Select,
  Space,
  Spin,
  Pagination,
  Table,
  Tag,
  Toast,
  Typography,
} from "@douyinfe/semi-ui";
import { IconColumnsStroked, IconFolderOpenStroked, IconSearch, IconSimilarity } from "@douyinfe/semi-icons";
import {
  compareMemoryTasks,
  fetchMemoryLibrary,
  fetchMemorySimilar,
  reindexMemoryLibrary,
} from "../api";
import { useAuth } from "../auth";
import type {
  MemoryChunkPair,
  MemoryCompareResult,
  MemoryDuplicateRisk,
  MemoryProfile,
  MemorySimilarItem,
  ReviewPhase,
} from "../types";
import { pageShellList, secondaryPillButton, techPrimaryButton, toolbarSearchInput } from "../theme/pageChrome";

const { Text, Paragraph, Title } = Typography;

const MEMORY_MODES = [
  {
    key: "library",
    label: "方案库",
    desc: "浏览已索引方案",
    Icon: IconFolderOpenStroked,
  },
  {
    key: "similar",
    label: "相似检索",
    desc: "跨项目查找相似",
    Icon: IconSimilarity,
  },
  {
    key: "compare",
    label: "并排对比",
    desc: "两份方案内容比对",
    Icon: IconColumnsStroked,
  },
] as const;

function phaseLabel(phase: string | null | undefined): string {
  if (phase === "pre_review") return "方案预审";
  if (phase === "implementation") return "实施方案";
  return "—";
}

function formatPct(score: number): string {
  return `${(score * 100).toFixed(1)}%`;
}

function riskTagColor(risk: MemoryDuplicateRisk): "red" | "orange" | "green" | "grey" {
  if (risk === "high") return "red";
  if (risk === "medium") return "orange";
  if (risk === "low") return "green";
  return "grey";
}

function riskLabel(risk: MemoryDuplicateRisk): string {
  if (risk === "high") return "高风险";
  if (risk === "medium") return "中风险";
  if (risk === "low") return "低风险";
  return "不可比";
}

function MemoryModeNav({
  activeTab,
  onChange,
}: {
  activeTab: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="memory-tab-bar" role="tablist" aria-label="记忆比对模式">
      {MEMORY_MODES.map(({ key, label, desc, Icon }) => {
        const active = activeTab === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            className={`memory-tab-item${active ? " is-active" : ""}`}
            onClick={() => onChange(key)}
          >
            <span className="memory-tab-icon" aria-hidden>
              <Icon />
            </span>
            <span className="memory-tab-copy">
              <span className="memory-tab-title">{label}</span>
              <span className="memory-tab-desc">{desc}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ProfileSummaryCard({ profile, side }: { profile: MemoryProfile; side: "源" | "目标" }) {
  const listBlock = (label: string, items: string[]) =>
    items.length ? (
      <div className="memory-profile-section">
        <Text type="tertiary" size="small">
          {label}
        </Text>
        <div className="memory-profile-tags">
          {items.slice(0, 12).map((x) => (
            <Tag key={x} size="small">
              {x}
            </Tag>
          ))}
        </div>
      </div>
    ) : null;

  return (
    <div className={`memory-profile-card memory-profile-card--${side === "源" ? "source" : "target"}`}>
      <div className="memory-profile-card-head">
        <span className={`memory-profile-side-badge memory-profile-side-badge--${side === "源" ? "source" : "target"}`}>
          {side}
        </span>
        <Text strong ellipsis={{ showTooltip: true }} style={{ color: "#0f172a", flex: 1, minWidth: 0 }}>
          {profile.task_name}
        </Text>
      </div>
      <Space wrap>
        <Tag>{profile.project_key || "未填项目"}</Tag>
        {profile.version ? <Tag color="white">v {profile.version}</Tag> : null}
        <Tag color="blue">{phaseLabel(profile.phase)}</Tag>
      </Space>
      {profile.project_overview?.trim() ? (
        <Paragraph
          className="memory-profile-overview"
          ellipsis={{ rows: 4, expandable: true, collapsible: true }}
        >
          {profile.project_overview.trim()}
        </Paragraph>
      ) : (
        <Text type="tertiary" size="small" style={{ display: "block", marginTop: 8 }}>
          暂无项目概述
        </Text>
      )}
      {profile.core_functions.length ? (
        listBlock("核心功能", profile.core_functions)
      ) : (
        <Text type="tertiary" size="small" style={{ display: "block", marginTop: 10 }}>
          暂无核心功能摘要
        </Text>
      )}
    </div>
  );
}

function CompareResultPanel({ result }: { result: MemoryCompareResult }) {
  return (
    <div className="memory-compare-result">
      <div className="memory-compare-score-card">
        <div className="memory-compare-score-main">
          <Tag color={result.comparable ? riskTagColor(result.duplicate_risk) : "grey"} size="large">
            {result.comparable ? riskLabel(result.duplicate_risk) : "不可比对"}
          </Tag>
          {result.comparable ? (
            <div className="memory-compare-score-value">
              <span className="memory-compare-score-number">{formatPct(result.similarity_score)}</span>
              <span className="memory-compare-score-caption">整体相似度</span>
            </div>
          ) : null}
        </div>
        <Paragraph className="memory-compare-score-message">{result.message}</Paragraph>
        {result.overlap_keywords.length ? (
          <div className="memory-compare-keywords">
            <Text type="tertiary" size="small">
              重叠关键词
            </Text>
            <div className="memory-profile-tags">
              {result.overlap_keywords.map((k) => (
                <Tag key={k} color="amber">
                  {k}
                </Tag>
              ))}
            </div>
          </div>
        ) : null}
        {result.findings.length ? (
          <ul className="memory-compare-findings">
            {result.findings.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="memory-compare-profile-grid">
        <ProfileSummaryCard profile={result.source} side="源" />
        <ProfileSummaryCard profile={result.target} side="目标" />
      </div>
      {result.chunk_pairs.length ? (
        <div className="memory-chunk-section">
          <Text strong style={{ display: "block", marginBottom: 10 }}>
            段落级相似片段（Top {result.chunk_pairs.length}）
          </Text>
          <Table
            className="memory-chunk-compare-table"
            size="small"
            pagination={false}
            style={{ width: "100%" }}
            dataSource={result.chunk_pairs}
            rowKey={(r?: MemoryChunkPair) =>
              r ? `${r.source_chunk_id}-${r.target_chunk_id}` : "pair"
            }
            columns={[
              {
                title: "相似度",
                width: 80,
                align: "center",
                render: (_: unknown, r) => formatPct(r.score),
              },
              {
                title: "源方案",
                render: (_: unknown, r) => (
                  <div className="memory-chunk-compare-cell">
                    <Text size="small" strong>
                      {r.source_file_name}
                      {r.source_section_title ? ` · ${r.source_section_title}` : ""}
                    </Text>
                    <Paragraph
                      ellipsis={{ rows: 3, expandable: true }}
                      style={{ margin: "4px 0 0", fontSize: 12 }}
                    >
                      {r.source_excerpt}
                    </Paragraph>
                  </div>
                ),
              },
              {
                title: "目标方案",
                render: (_: unknown, r) => (
                  <div className="memory-chunk-compare-cell">
                    <Text size="small" strong>
                      {r.target_file_name}
                      {r.target_section_title ? ` · ${r.target_section_title}` : ""}
                    </Text>
                    <Paragraph
                      ellipsis={{ rows: 3, expandable: true }}
                      style={{ margin: "4px 0 0", fontSize: 12 }}
                    >
                      {r.target_excerpt}
                    </Paragraph>
                  </div>
                ),
              },
            ]}
          />
        </div>
      ) : null}
    </div>
  );
}

export default function MemoryComparePage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const taskFromUrl = Number(searchParams.get("task") || "");
  const initialTab = searchParams.get("tab") === "compare" ? "compare" : searchParams.get("tab") === "similar" ? "similar" : "library";

  const [activeTab, setActiveTab] = useState(initialTab);
  const [phaseFilter, setPhaseFilter] = useState<ReviewPhase | "all">("all");
  const [libraryQ, setLibraryQ] = useState("");
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [library, setLibrary] = useState<MemoryProfile[]>([]);
  const [libraryPage, setLibraryPage] = useState(1);
  const [libraryPageSize, setLibraryPageSize] = useState(15);
  const [reindexing, setReindexing] = useState(false);

  const [sourceTaskId, setSourceTaskId] = useState<number | null>(
    Number.isFinite(taskFromUrl) && taskFromUrl > 0 ? taskFromUrl : null
  );
  const [targetTaskId, setTargetTaskId] = useState<number | null>(null);

  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarItems, setSimilarItems] = useState<MemorySimilarItem[]>([]);
  const [similarSourceKey, setSimilarSourceKey] = useState<string | null>(null);

  const [compareLoading, setCompareLoading] = useState(false);
  const [compareResult, setCompareResult] = useState<MemoryCompareResult | null>(null);

  const libraryStats = useMemo(() => {
    const readyCount = library.filter((item) => item.index_status === "ready").length;
    const preReviewCount = library.filter((item) => item.phase === "pre_review").length;
    const implementationCount = library.filter((item) => item.phase === "implementation").length;
    return {
      total: library.length,
      ready: readyCount,
      preReview: preReviewCount,
      implementation: implementationCount,
    };
  }, [library]);

  const libraryTotal = library.length;
  const libraryPageSafe = Math.max(
    1,
    Math.min(libraryPage, Math.max(1, Math.ceil(libraryTotal / libraryPageSize)))
  );
  const libraryPageData = useMemo(() => {
    const start = (libraryPageSafe - 1) * libraryPageSize;
    return library.slice(start, start + libraryPageSize).map((item, idx) => ({
      ...item,
      row_no: start + idx + 1,
    }));
  }, [library, libraryPageSafe, libraryPageSize]);

  useEffect(() => {
    setLibraryPage(1);
  }, [phaseFilter, libraryQ]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(library.length / libraryPageSize));
    if (libraryPage > maxPage) setLibraryPage(maxPage);
  }, [library.length, libraryPageSize, libraryPage]);

  const loadLibrary = useCallback(async () => {
    setLibraryLoading(true);
    try {
      const res = await fetchMemoryLibrary({
        phase: phaseFilter === "all" ? undefined : phaseFilter,
        q: libraryQ || undefined,
        limit: 300,
      });
      setLibrary(res.items);
    } catch (e) {
      Toast.error(e instanceof Error ? e.message : "加载方案库失败");
    } finally {
      setLibraryLoading(false);
    }
  }, [phaseFilter, libraryQ]);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  useEffect(() => {
    if (Number.isFinite(taskFromUrl) && taskFromUrl > 0) {
      setSourceTaskId(taskFromUrl);
    }
  }, [taskFromUrl]);

  const selectOptions = useMemo(
    () =>
      library.map((p) => ({
        value: p.task_id,
        label: `${p.task_name}（${p.project_key || "未填"}${p.version ? ` · ${p.version}` : ""}）`,
      })),
    [library]
  );

  const runSimilar = useCallback(async () => {
    if (!sourceTaskId) {
      Toast.warning("请先选择源任务");
      return;
    }
    setSimilarLoading(true);
    setSimilarItems([]);
    try {
      const res = await fetchMemorySimilar(sourceTaskId, 15);
      setSimilarItems(res.items);
      setSimilarSourceKey(res.source_project_key);
      if (!res.items.length) {
        Toast.info("未找到跨项目相似方案（同项目不同版本已自动排除）");
      }
    } catch (e) {
      Toast.error(e instanceof Error ? e.message : "相似检索失败");
    } finally {
      setSimilarLoading(false);
    }
  }, [sourceTaskId]);

  const runCompare = useCallback(async () => {
    if (!sourceTaskId || !targetTaskId) {
      Toast.warning("请选择源任务与目标任务");
      return;
    }
    if (sourceTaskId === targetTaskId) {
      Toast.warning("请选择两个不同任务");
      return;
    }
    setCompareLoading(true);
    setCompareResult(null);
    try {
      const res = await compareMemoryTasks(sourceTaskId, targetTaskId);
      setCompareResult(res);
      if (!res.comparable) {
        Toast.warning(res.message);
      }
    } catch (e) {
      Toast.error(e instanceof Error ? e.message : "比对失败");
    } finally {
      setCompareLoading(false);
    }
  }, [sourceTaskId, targetTaskId]);

  const goSimilar = (taskId: number) => {
    setSourceTaskId(taskId);
    setActiveTab("similar");
    setSearchParams({ task: String(taskId), tab: "similar" });
    void (async () => {
      setSimilarLoading(true);
      try {
        const res = await fetchMemorySimilar(taskId, 15);
        setSimilarItems(res.items);
        setSimilarSourceKey(res.source_project_key);
      } catch (e) {
        Toast.error(e instanceof Error ? e.message : "相似检索失败");
      } finally {
        setSimilarLoading(false);
      }
    })();
  };

  const goCompare = (sourceId: number, targetId: number) => {
    setSourceTaskId(sourceId);
    setTargetTaskId(targetId);
    setActiveTab("compare");
    setSearchParams({ task: String(sourceId), tab: "compare" });
    void (async () => {
      setCompareLoading(true);
      setCompareResult(null);
      try {
        setCompareResult(await compareMemoryTasks(sourceId, targetId));
      } catch (e) {
        Toast.error(e instanceof Error ? e.message : "比对失败");
      } finally {
        setCompareLoading(false);
      }
    })();
  };

  const switchTab = useCallback(
    (key: string) => {
      setActiveTab(key);
      const next = new URLSearchParams(searchParams);
      next.set("tab", key);
      if (sourceTaskId) next.set("task", String(sourceTaskId));
      setSearchParams(next);
    },
    [searchParams, setSearchParams, sourceTaskId]
  );

  const libraryColumns = [
    {
      title: "序号",
      dataIndex: "row_no",
      key: "row_no",
      width: "5%",
      align: "center" as const,
    },
    {
      title: "任务名称",
      dataIndex: "task_name",
      width: "20%",
      align: "center" as const,
      render: (name: string, row: MemoryProfile) => (
        <Link to={`/tasks/${row.task_id}/materials`}>
          {name}
        </Link>
      ),
    },
    {
      title: "项目",
      dataIndex: "project_key",
      width: "12%",
      align: "center" as const,
      render: (v: string | null) => v || "—",
    },
    {
      title: "版本",
      dataIndex: "version",
      width: "8%",
      align: "center" as const,
      render: (v: string | null) => v || "—",
    },
    {
      title: "阶段",
      dataIndex: "phase",
      width: "10%",
      align: "center" as const,
      render: (v: string) => (
        <span className={`memory-phase-tag memory-phase-tag--${v === "pre_review" ? "pre" : "impl"}`}>
          {phaseLabel(v)}
        </span>
      ),
    },
    {
      title: "项目概述",
      dataIndex: "project_overview",
      align: "center" as const,
      render: (overview: string | null) =>
        overview?.trim() ? (
          <Text ellipsis={{ showTooltip: true }} style={{ maxWidth: 420 }}>
            {overview.trim()}
          </Text>
        ) : (
          <Text type="tertiary">—</Text>
        ),
    },
    {
      title: "索引",
      dataIndex: "index_status",
      width: 88,
      align: "center" as const,
      render: (s: string) => (
        <span className={`memory-index-badge${s === "ready" ? " is-ready" : ""}`}>
          {s === "ready" ? "就绪" : s}
        </span>
      ),
    },
    {
      title: "操作",
      width: 200,
      align: "center" as const,
      render: (_: unknown, row: MemoryProfile) => (
        <Space className="memory-action-group" style={{ justifyContent: "center" }}>
          <Button
            size="small"
            theme="borderless"
            className="memory-action-button is-secondary"
            onClick={() => goSimilar(row.task_id)}
          >
            查相似
          </Button>
          <Button
            size="small"
            theme="light"
            className="memory-action-button is-primary"
            disabled={!sourceTaskId || sourceTaskId === row.task_id}
            onClick={() => {
              if (!sourceTaskId) {
                setSourceTaskId(row.task_id);
                Toast.info("已设为源任务，请再选一个目标进行对比");
                return;
              }
              goCompare(sourceTaskId, row.task_id);
            }}
          >
            对比
          </Button>
        </Space>
      ),
    },
  ];

  const similarColumns = [
    {
      title: "任务",
      dataIndex: "task_name",
      align: "center" as const,
      render: (name: string, row: MemorySimilarItem) => (
        <Link to={`/tasks/${row.task_id}/materials`}>
          {name}
        </Link>
      ),
    },
    {
      title: "项目",
      dataIndex: "project_key",
      align: "center" as const,
      render: (v: string | null) => v || "—",
    },
    {
      title: "版本",
      dataIndex: "version",
      align: "center" as const,
      render: (v: string | null) => v || "—",
    },
    {
      title: "相似度",
      dataIndex: "similarity_score",
      width: 96,
      align: "center" as const,
      render: (s: number) => <span className="memory-similarity-score">{formatPct(s)}</span>,
    },
    {
      title: "重叠词",
      dataIndex: "overlap_keywords",
      align: "center" as const,
      render: (kw: string[]) => kw.slice(0, 6).join("、") || "—",
    },
    {
      title: "操作",
      width: 100,
      align: "center" as const,
      render: (_: unknown, row: MemorySimilarItem) =>
        sourceTaskId ? (
          <Button size="small" type="primary" onClick={() => goCompare(sourceTaskId, row.task_id)}>
            并排对比
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="memory-compare-page tech-enter">
      <Card
        bordered={false}
        style={pageShellList}
        bodyStyle={{ padding: "22px 24px 24px" }}
        className="page-shell-list memory-page-shell"
      >
        <div className="memory-page-header">
          <Title heading={4} style={{ margin: 0, color: "#0f172a" }}>
            方案记忆比对
          </Title>
        </div>

        <div className="memory-workbench">
          <MemoryModeNav activeTab={activeTab} onChange={switchTab} />

          <div className="memory-workbench-body">
        {activeTab === "library" ? (
          <>
            <div className="memory-stats-grid">
              <div className="memory-stat-card">
                <span className="memory-stat-label">方案总数</span>
                <strong className="memory-stat-value">{libraryStats.total}</strong>
              </div>
              <div className="memory-stat-card memory-stat-card--accent">
                <span className="memory-stat-label">已索引</span>
                <strong className="memory-stat-value">{libraryStats.ready}</strong>
              </div>
              <div className="memory-stat-card">
                <span className="memory-stat-label">方案预审</span>
                <strong className="memory-stat-value">{libraryStats.preReview}</strong>
              </div>
              <div className="memory-stat-card">
                <span className="memory-stat-label">实施方案</span>
                <strong className="memory-stat-value">{libraryStats.implementation}</strong>
              </div>
            </div>
            <div className="memory-toolbar-panel">
              <div className="memory-toolbar-fields">
                <Select
                  className="app-select"
                  value={phaseFilter}
                  style={{ width: 148 }}
                  optionList={[
                    { value: "all", label: "全部阶段" },
                    { value: "pre_review", label: "方案预审" },
                    { value: "implementation", label: "实施方案" },
                  ]}
                  onChange={(v) => setPhaseFilter(v as ReviewPhase | "all")}
                />
                <Input
                  prefix={<IconSearch />}
                  placeholder="搜索任务名、项目、摘要、关键词"
                  value={libraryQ}
                  onChange={setLibraryQ}
                  onEnterPress={() => void loadLibrary()}
                  style={{ ...toolbarSearchInput, width: 360 }}
                />
              </div>
              <Space wrap>
                <Button
                  theme="solid"
                  type="primary"
                  style={techPrimaryButton}
                  onClick={() => void loadLibrary()}
                >
                  搜索
                </Button>
                {user?.role === "admin" ? (
                  <Button
                    theme="light"
                    loading={reindexing}
                    style={secondaryPillButton}
                    onClick={() => {
                      setReindexing(true);
                      void reindexMemoryLibrary()
                        .then((r) => {
                          Toast.success(`已重建 ${r.indexed_count} 条记忆索引`);
                          return loadLibrary();
                        })
                        .catch((e) => Toast.error(e instanceof Error ? e.message : "重建失败"))
                        .finally(() => setReindexing(false));
                    }}
                  >
                    重建全库索引
                  </Button>
                ) : null}
              </Space>
            </div>
            <Spin spinning={libraryLoading}>
              <div className="memory-library-section">
                <div className="taskhome-table-wrap">
                  <Table
                    className="taskhome-table memory-library-table"
                    columns={libraryColumns}
                    dataSource={libraryPageData}
                    rowKey="task_id"
                    pagination={false}
                    size="small"
                    tableLayout="fixed"
                    style={{ width: "100%" }}
                    empty={
                      <Text type="tertiary">暂无已索引方案，请先完成任务解析或点击「重建全库索引」</Text>
                    }
                  />
                </div>
                {!libraryLoading && libraryTotal > 0 ? (
                  <div className="taskhome-pagination">
                    <Text style={{ color: "rgba(51, 65, 85, 0.84)" }}>
                      当前筛选结果 <strong style={{ color: "#0f172a" }}>{libraryTotal}</strong> 条
                    </Text>
                    <Pagination
                      className="taskhome-pagination-control"
                      total={libraryTotal}
                      currentPage={libraryPageSafe}
                      pageSize={libraryPageSize}
                      showSizeChanger
                      pageSizeOpts={[10, 15, 20, 50]}
                      showQuickJumper
                      onPageChange={(p) => setLibraryPage(p)}
                      onPageSizeChange={(s) => {
                        setLibraryPageSize(s);
                        setLibraryPage(1);
                      }}
                    />
                  </div>
                ) : null}
              </div>
            </Spin>
          </>
        ) : null}

        {activeTab === "similar" ? (
          <>
            <div className="memory-toolbar-panel">
              <div className="memory-hero-note">
                <Text strong>跨项目查找相似方案</Text>
                <Text type="tertiary" size="small">
                  选定当前方案后，系统会自动排除同项目不同版本，只保留跨项目候选结果。
                </Text>
              </div>
              <Space wrap align="end" className="memory-toolbar-fields">
                <div className="memory-field-block">
                  <Text type="tertiary" size="small" className="memory-field-label">
                    源任务（当前方案）
                  </Text>
                  <Select
                    className="app-select"
                    filter
                    placeholder="选择任务"
                    value={sourceTaskId ?? undefined}
                    style={{ width: 360 }}
                    optionList={selectOptions}
                    onChange={(v) => setSourceTaskId(v as number)}
                  />
                </div>
                <Button
                  theme="solid"
                  type="primary"
                  loading={similarLoading}
                  style={techPrimaryButton}
                  onClick={() => void runSimilar()}
                >
                  检索相似方案
                </Button>
              </Space>
            </div>
            {similarSourceKey ? (
              <Text className="memory-panel-hint">
                当前源项目标识：<Text strong>{similarSourceKey}</Text>（结果已排除同项目不同版本）
              </Text>
            ) : null}
            <Spin spinning={similarLoading}>
              <Table
                className="taskhome-table memory-library-table"
                columns={similarColumns}
                dataSource={similarItems}
                rowKey="task_id"
                pagination={false}
                empty={
                  <Text type="tertiary">
                    {sourceTaskId ? "点击检索，或从方案库/任务详情进入" : "请先选择源任务"}
                  </Text>
                }
              />
            </Spin>
          </>
        ) : null}

        {activeTab === "compare" ? (
          <>
            <div className="memory-toolbar-panel">
              <div className="memory-hero-note">
                <Text strong>并排查看两份方案的核心差异</Text>
                <Text type="tertiary" size="small">
                  适合核对是否存在结构复用、内容重合或表述过度相似的情况。
                </Text>
              </div>
              <Space wrap align="end" className="memory-toolbar-fields">
                <div className="memory-field-block">
                  <Text type="tertiary" size="small" className="memory-field-label">
                    源任务（当前方案）
                  </Text>
                  <Select
                    className="app-select"
                    filter
                    placeholder="选择任务"
                    value={sourceTaskId ?? undefined}
                    style={{ width: 320 }}
                    optionList={selectOptions}
                    onChange={(v) => setSourceTaskId(v as number)}
                  />
                </div>
                <div className="memory-field-block">
                  <Text type="tertiary" size="small" className="memory-field-label">
                    目标任务
                  </Text>
                  <Select
                    className="app-select"
                    filter
                    value={targetTaskId ?? undefined}
                    style={{ width: 320 }}
                    optionList={selectOptions}
                    onChange={(v) => setTargetTaskId(v as number)}
                  />
                </div>
                <Button
                  theme="solid"
                  type="primary"
                  loading={compareLoading}
                  style={techPrimaryButton}
                  onClick={() => void runCompare()}
                >
                  开始比对
                </Button>
              </Space>
            </div>
            <Spin spinning={compareLoading}>
              {compareResult ? (
                <CompareResultPanel result={compareResult} />
              ) : (
                <div className="memory-empty-state">
                  <Text strong style={{ display: "block", marginBottom: 6 }}>
                    选择两份不同项目的方案后开始比对
                  </Text>
                  <Text type="tertiary">系统会自动输出整体相似度、重叠关键词、段落级相似片段与风险判断。</Text>
                </div>
              )}
            </Spin>
          </>
        ) : null}
          </div>
        </div>
      </Card>
    </div>
  );
}
