import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconDeleteStroked,
  IconDownload,
  IconFile,
  IconSearch,
} from "@douyinfe/semi-icons";
import {
  Button,
  Card,
  Empty,
  Input,
  Pagination,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Toast,
  Typography,
} from "@douyinfe/semi-ui";
import { deleteTask, downloadIssueReportWord, getTaskCostOverview, listTasks } from "../api";
import type { ReviewPhase, ReviewTask, TaskCostOverviewItem } from "../types";

const { Title, Text } = Typography;

type StatusFilter = "all" | "in_progress" | "completed";

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const normalized =
    /(?:Z|[+-]\d{2}:\d{2})$/.test(iso) || iso.includes("/")
      ? iso
      : `${iso.replace(" ", "T")}Z`;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(d)
    .replace(/\//g, "-");
}

export default function TaskHome({ phase }: { phase: ReviewPhase }) {
  const nav = useNavigate();
  const newTaskPath = phase === "pre_review" ? "/tasks/pre-review/new" : "/tasks/implementation/new";
  const phaseTitle = phase === "pre_review" ? "方案预审" : "实施方案审核";
  const [items, setItems] = useState<ReviewTask[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [costMap, setCostMap] = useState<Record<number, TaskCostOverviewItem>>({});

  function formatMoney(value: number | null | undefined, currency: "USD" | "CNY") {
    if (value == null || Number.isNaN(value)) return "—";
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency,
      minimumFractionDigits: value < 1 ? 4 : 2,
      maximumFractionDigits: value < 1 ? 4 : 2,
    }).format(value);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [tasks, costs] = await Promise.all([
        listTasks(phase),
        getTaskCostOverview().catch(() => []),
      ]);
      setItems(tasks);
      setCostMap(Object.fromEntries(costs.map((item) => [item.task_id, item])));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [phase]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((t) => {
      if (q && !t.name.toLowerCase().includes(q)) return false;
      if (statusFilter === "all") return true;
      return t.review_status === statusFilter;
    });
  }, [items, search, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, pageSize]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const slice = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  async function onDelete(id: number, name: string) {
    if (!confirm(`确定删除评审任务「${name}」？相关附件与历史审查结果将一并删除。`)) return;
    try {
      await deleteTask(id);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "删除失败");
    }
  }

  const columns = [
    {
      title: "任务名称",
      dataIndex: "name",
      ellipsis: true,
      render: (text: string) => (
        <Text strong style={{ color: "#0f172a" }}>
          {text}
        </Text>
      ),
    },
    {
      title: "创建时间",
      dataIndex: "created_at",
      width: 176,
      render: (iso: string | null) => (
        <span style={{ fontFamily: "monospace", fontSize: 12, color: "rgba(51, 65, 85, 0.82)" }}>
          {formatDateTime(iso)}
        </span>
      ),
    },
    {
      title: "状态",
      dataIndex: "review_status",
      width: 120,
      render: (s: ReviewTask["review_status"]) =>
        s === "completed" ? (
          <Tag
            size="large"
            shape="circle"
            style={{
              color: "#166534",
              background: "rgba(220, 252, 231, 0.9)",
              border: "1px solid rgba(134, 239, 172, 0.95)",
            }}
          >
            已完成
          </Tag>
        ) : (
          <Tag
            size="large"
            shape="circle"
            style={{
              color: "#1d4ed8",
              background: "rgba(219, 234, 254, 0.92)",
              border: "1px solid rgba(147, 197, 253, 0.95)",
            }}
          >
            评审中
          </Tag>
        ),
    },
    {
      title: "预计成本",
      dataIndex: "id",
      width: 180,
      render: (_: unknown, record: ReviewTask) => {
        const cost = costMap[record.id];
        if (!cost || cost.estimated_cost_low_cny == null || cost.estimated_cost_high_cny == null) {
          return <Text style={{ color: "rgba(100, 116, 139, 0.84)" }}>—</Text>;
        }
        return (
          <div>
            <Text strong style={{ color: "#0f172a" }}>
              {formatMoney(cost.estimated_cost_low_cny, "CNY")} ~ {formatMoney(cost.estimated_cost_high_cny, "CNY")}
            </Text>
            <div style={{ fontSize: 12, color: "rgba(71, 85, 105, 0.76)", marginTop: 2 }}>
              {cost.total_llm_tokens} tokens
            </div>
          </div>
        );
      },
    },
    {
      title: "操作",
      dataIndex: "id",
      width: 170,
      align: "center" as const,
      render: (_: unknown, record: ReviewTask) => (
        <Space spacing={6}>
          <Button
            icon={<IconFile />}
            theme="borderless"
            type="tertiary"
            aria-label="进入评审"
            style={{ color: "#4f46e5" }}
            onClick={() => nav(`/tasks/${record.id}/materials`)}
          />
          {record.review_status === "completed" ? (
            <Button
              icon={<IconDownload />}
              theme="borderless"
              type="tertiary"
              aria-label="下载 Word 审查意见书到本地"
              style={{ color: "#93fbcf" }}
              onClick={() =>
                void downloadIssueReportWord(record.id, record.name).catch((e) =>
                  Toast.error(e instanceof Error ? e.message : "下载失败")
                )
              }
            />
          ) : null}
          <Button
            icon={<IconDeleteStroked />}
            theme="borderless"
            type="danger"
            aria-label="删除"
            onClick={() => void onDelete(record.id, record.name)}
          />
        </Space>
      ),
    },
  ];

  const dataSource = slice.map((t) => ({
    ...t,
    key: t.id,
  }));

  return (
    <Space vertical spacing="loose" style={{ width: "100%", alignItems: "stretch" }}>
      <Card bordered={false} style={shellCard} className="tech-enter tech-enter-1" bodyStyle={{ padding: 0 }}>
        <div className="taskhome-toolbar">
          <Title heading={5} style={{ margin: 0, color: "#0f172a" }}>
            {phaseTitle} · 任务列表
          </Title>
          <Space wrap style={{ justifyContent: "flex-end" }}>
            <Button theme="solid" type="primary" onClick={() => nav(newTaskPath)} style={techPrimaryBtn}>
              + 新建{phaseTitle}任务
            </Button>
            <Input
              prefix={<IconSearch />}
              placeholder="搜索评审任务名称"
              value={search}
              onChange={setSearch}
              style={toolbarInputStyle}
            />
            <Select
              className="taskhome-filter-select"
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as StatusFilter)}
              style={{ width: 144 }}
              optionList={[
                { label: "全部状态", value: "all" },
                { label: "评审中", value: "in_progress" },
                { label: "已完成", value: "completed" },
              ]}
            />
          </Space>
        </div>

        {err ? (
          <div style={{ margin: 16 }} className="tech-alert tech-alert-danger" role="alert">
            {err}
          </div>
        ) : null}

        <div style={{ padding: loading || total === 0 ? 24 : 0 }}>
          {loading ? (
            <Spin size="large" style={{ display: "block", margin: "48px auto" }} />
          ) : total === 0 ? (
            <Empty
              title="暂无任务"
              description="创建第一个评审任务后，就可以上传材料并触发自动解析与问题审查。"
              style={{ padding: "40px 0" }}
            />
          ) : (
            <Table
              className="taskhome-table"
              columns={columns}
              dataSource={dataSource}
              pagination={false}
              size="small"
            />
          )}
        </div>

        {!loading && total > 0 ? (
          <div className="taskhome-pagination">
            <Typography.Text style={{ color: "rgba(51, 65, 85, 0.84)" }}>
              当前筛选结果 <strong style={{ color: "#0f172a" }}>{total}</strong> 条
            </Typography.Text>
            <Pagination
              total={total}
              currentPage={pageSafe}
              pageSize={pageSize}
              showSizeChanger
              pageSizeOpts={[10, 20, 50]}
              showQuickJumper
              onPageChange={(p) => setPage(p)}
              onPageSizeChange={(s) => setPageSize(s)}
            />
          </div>
        ) : null}
      </Card>
    </Space>
  );
}

const shellCard = {
  width: "100%",
  borderRadius: 24,
  border: "1px solid rgba(255, 255, 255, 0.9)",
  background: "linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(247, 248, 255, 0.86))",
  boxShadow: "0 24px 60px rgba(111, 123, 168, 0.14)",
} as const;

const toolbarInputStyle = {
  width: 240,
  background: "rgba(255, 255, 255, 0.88)",
  border: "1px solid rgba(203, 213, 225, 0.9)",
  color: "#0f172a",
} as const;

const techPrimaryBtn = {
  borderRadius: 999,
  background: "linear-gradient(90deg, #20d2cc, #2c7ef8)",
  border: "none",
  boxShadow: "0 12px 28px rgba(35, 157, 226, 0.28)",
} as const;
