import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconDeleteStroked,
  IconDownloadStroked,
  IconSearchStroked,
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
import { TableActionButton, TableActionGroup, TaskDetailIcon } from "../components/TableActionButton";
import { deleteTask, downloadIssueReportWord, getTaskCostOverview, listTasks } from "../api";
import { pageShellList, techPrimaryButton, toolbarSearchInput } from "../theme/pageChrome";
import type { ReviewPhase, ReviewTask, TaskCostOverviewItem } from "../types";
import { parseProjectIdentity } from "../utils/projectIdentity";

const { Title, Text } = Typography;

function displayProjectKey(record: ReviewTask): string {
  const stored = record.project_key?.trim();
  if (stored) return stored;
  return parseProjectIdentity(record.name).project_key?.trim() || "—";
}

function displayVersion(record: ReviewTask): string {
  const stored = record.version?.trim();
  if (stored) return stored;
  return parseProjectIdentity(record.name).version?.trim() || "—";
}

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
  const [listTotal, setListTotal] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [costMap, setCostMap] = useState<Record<number, TaskCostOverviewItem>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const body = await listTasks({
        phase,
        page,
        page_size: pageSize,
        q: search.trim() || undefined,
        review_status: statusFilter,
      });
      setListTotal(body.total);
      setItems(body.items);
      const ids = body.items.map((t) => t.id);
      if (ids.length > 0) {
        const costs = await getTaskCostOverview(ids).catch(() => []);
        setCostMap(Object.fromEntries(costs.map((item) => [item.task_id, item])));
      } else {
        setCostMap({});
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [phase, page, pageSize, search, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [phase]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, pageSize]);

  const totalPages = Math.max(1, Math.ceil(listTotal / pageSize) || 1);
  const pageSafe = Math.min(page, totalPages);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

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
      title: "序号",
      dataIndex: "row_no",
      key: "row_no",
      width: "5%",
      align: "center" as const,
    },
    {
      title: "任务名称",
      dataIndex: "name",
      width: "18%",
      align: "left" as const,
      ellipsis: true,
      render: (text: string) => (
        <Text strong ellipsis={{ showTooltip: true }} style={{ color: "#0f172a", maxWidth: "100%" }}>
          {text}
        </Text>
      ),
    },
    {
      title: "项目名称",
      dataIndex: "project_key",
      width: "16%",
      align: "left" as const,
      ellipsis: true,
      render: (_: string | null, record: ReviewTask) => (
        <Text ellipsis={{ showTooltip: true }} style={{ color: "rgba(51, 65, 85, 0.92)", maxWidth: "100%" }}>
          {displayProjectKey(record)}
        </Text>
      ),
    },
    {
      title: "版本",
      dataIndex: "version",
      width: "6%",
      align: "center" as const,
      render: (_: string | null, record: ReviewTask) => (
        <Text style={{ color: "rgba(51, 65, 85, 0.92)", fontSize: 12 }}>
          {displayVersion(record)}
        </Text>
      ),
    },
    {
      title: "创建时间",
      dataIndex: "created_at",
      width: "11%",
      align: "center" as const,
      render: (iso: string | null) => (
        <span
          style={{
            fontSize: 12,
            color: "rgba(51, 65, 85, 0.82)",
            whiteSpace: "nowrap",
          }}
        >
          {formatDateTime(iso)}
        </span>
      ),
    },
    {
      title: "更新时间",
      dataIndex: "updated_at",
      width: "11%",
      align: "center" as const,
      render: (iso: string | null) => (
        <span
          style={{
            fontSize: 12,
            color: "rgba(51, 65, 85, 0.82)",
            whiteSpace: "nowrap",
          }}
        >
          {formatDateTime(iso)}
        </span>
      ),
    },
    {
      title: "更新人",
      dataIndex: "username",
      width: "7%",
      align: "center" as const,
      ellipsis: true,
      render: (v: string) => (
        <Text style={{ color: "rgba(51, 65, 85, 0.92)" }}>{v || "—"}</Text>
      ),
    },
    {
      title: "状态",
      dataIndex: "review_status",
      width: "8%",
      align: "center" as const,
      render: (s: ReviewTask["review_status"]) =>
        s === "completed" ? (
          <Tag className="task-status-tag task-status-tag--completed" shape="circle">
            已完成
          </Tag>
        ) : (
          <Tag className="task-status-tag task-status-tag--progress" shape="circle">
            评审中
          </Tag>
        ),
    },
    {
      title: "预计成本",
      dataIndex: "id",
      width: "9%",
      align: "center" as const,
      render: (_: unknown, record: ReviewTask) => {
        const cost = costMap[record.id];
        if (!cost || cost.total_llm_tokens <= 0) {
          return <Text style={{ color: "rgba(100, 116, 139, 0.84)" }}>—</Text>;
        }
        return (
          <Text style={{ color: "#0f172a", whiteSpace: "nowrap" }}>
            {cost.total_llm_tokens.toLocaleString("zh-CN")} tokens
          </Text>
        );
      },
    },
    {
      title: "操作",
      dataIndex: "id",
      width: "9%",
      align: "center" as const,
      render: (_: unknown, record: ReviewTask) => (
        <TableActionGroup>
          <TableActionButton
            tone="detail"
            label="详情"
            icon={<TaskDetailIcon />}
            onClick={() => nav(`/tasks/${record.id}/materials`)}
          />
          {record.review_status === "completed" ? (
            <TableActionButton
              tone="success"
              label="下载 Word 审查意见书"
              icon={<IconDownloadStroked />}
              onClick={() =>
                void downloadIssueReportWord(record.id, record.name).catch((e) =>
                  Toast.error(e instanceof Error ? e.message : "下载失败")
                )
              }
            />
          ) : null}
          <TableActionButton
            tone="danger"
            label="删除"
            icon={<IconDeleteStroked />}
            onClick={() => void onDelete(record.id, record.name)}
          />
        </TableActionGroup>
      ),
    },
  ];

  const dataSource = items.map((t, idx) => ({
    ...t,
    key: t.id,
    row_no: (pageSafe - 1) * pageSize + idx + 1,
  }));

  const emptyIsFiltered =
    listTotal === 0 && (Boolean(search.trim()) || statusFilter !== "all");

  return (
    <Space vertical spacing="loose" style={{ width: "100%", alignItems: "stretch" }}>
      <Card bordered={false} style={pageShellList} className="tech-enter tech-enter-1 page-shell-list" bodyStyle={{ padding: 0 }}>
        <div className="taskhome-toolbar">
          <Title heading={5} style={{ margin: 0, color: "#0f172a" }}>
            {phaseTitle}任务列表
          </Title>
          <Space wrap style={{ justifyContent: "flex-end" }}>
            <Button theme="solid" type="primary" onClick={() => nav(newTaskPath)} style={techPrimaryButton}>
              + 新建{phaseTitle}任务
            </Button>
            <Input
              prefix={<IconSearchStroked />}
              placeholder="搜索任务名称 / 项目名称 / 版本"
              value={search}
              onChange={setSearch}
              style={toolbarSearchInput}
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

        <div className="taskhome-table-wrap" style={{ padding: loading || listTotal === 0 ? 24 : 0 }}>
          {loading ? (
            <Spin size="large" style={{ display: "block", margin: "48px auto" }} />
          ) : listTotal === 0 ? (
            <Empty
              title={emptyIsFiltered ? "无匹配结果" : "暂无任务"}
              description={
                emptyIsFiltered
                  ? "尝试调整搜索关键词或状态筛选。"
                  : "创建第一个评审任务后，就可以上传材料并触发自动解析与问题审查。"
              }
              style={{ padding: "40px 0" }}
            />
          ) : (
            <Table
              className="taskhome-table"
              columns={columns}
              dataSource={dataSource}
              pagination={false}
              size="small"
              tableLayout="fixed"
              style={{ width: "100%" }}
            />
          )}
        </div>

        {!loading && listTotal > 0 ? (
          <div className="taskhome-pagination">
            <Typography.Text style={{ color: "rgba(51, 65, 85, 0.84)" }}>
              当前筛选结果 <strong style={{ color: "#0f172a" }}>{listTotal}</strong> 条
            </Typography.Text>
            <Pagination
              className="taskhome-pagination-control"
              total={listTotal}
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
