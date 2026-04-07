import { useEffect, useMemo, useState } from "react";
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
  Typography,
} from "@douyinfe/semi-ui";
import { deleteTask, listTasks, reportDownloadUrl } from "../api";
import type { ReviewTask } from "../types";

const { Title, Text } = Typography;

type StatusFilter = "all" | "in_progress" | "completed";

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export default function TaskHome() {
  const nav = useNavigate();
  const [items, setItems] = useState<ReviewTask[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      setItems(await listTasks());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

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
    if (!confirm(`确定删除评审任务「${name}」？相关附件与打分将一并删除。`)) return;
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
      dataIndex: "rowNo",
      width: 72,
    },
    {
      title: "任务名称",
      dataIndex: "name",
      ellipsis: true,
      render: (text: string) => (
        <Text strong style={{ color: "rgba(var(--semi-grey-9), 1)" }}>
          {text}
        </Text>
      ),
    },
    {
      title: "创建时间",
      dataIndex: "created_at",
      width: 176,
      render: (iso: string | null) => (
        <span style={{ fontFamily: "monospace", fontSize: 12 }}>
          {formatDateTime(iso)}
        </span>
      ),
    },
    {
      title: "用户名",
      dataIndex: "username",
      width: 100,
      render: (u: string) => u ?? "—",
    },
    {
      title: "评审状态",
      dataIndex: "review_status",
      width: 100,
      render: (s: ReviewTask["review_status"]) =>
        s === "completed" ? (
          <Tag color="green" size="large">
            已完成
          </Tag>
        ) : (
          <Tag color="blue" size="large">
            进行中
          </Tag>
        ),
    },
    {
      title: "操作",
      dataIndex: "id",
      width: 140,
      align: "center" as const,
      render: (_: unknown, record: ReviewTask) => (
        <Space spacing={4}>
          <Button
            icon={<IconFile />}
            theme="borderless"
            type="tertiary"
            aria-label="查看"
            onClick={() => nav(`/tasks/${record.id}`)}
          />
          {record.review_status === "completed" ? (
            <a
              href={reportDownloadUrl(record.id)}
              download
              aria-label="下载报告"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                borderRadius: 6,
                color: "rgba(var(--semi-blue-6), 1)",
              }}
            >
              <IconDownload />
            </a>
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

  const dataSource = slice.map((t, idx) => ({
    ...t,
    key: t.id,
    rowNo: (pageSafe - 1) * pageSize + idx + 1,
  }));

  return (
    <Card bordered shadows="hover" bodyStyle={{ padding: 0 }}>
      <div
        style={{
          padding: "20px 24px",
          borderBottom: "1px solid rgba(var(--semi-border-color), 1)",
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Title heading={5} style={{ margin: 0 }}>
          评审任务
        </Title>
        <Space wrap style={{ justifyContent: "flex-end" }}>
          <Input
            prefix={<IconSearch />}
            placeholder="搜索评审任务名称"
            value={search}
            onChange={setSearch}
            style={{ width: 220 }}
          />
          <Select
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
            style={{ width: 128 }}
            optionList={[
              { label: "全部", value: "all" },
              { label: "进行中", value: "in_progress" },
              { label: "已完成", value: "completed" },
            ]}
          />
          <Button theme="solid" type="primary" onClick={() => nav("/tasks/new")}>
            + 新增评审
          </Button>
        </Space>
      </div>

      {err ? (
        <div
          style={{
            margin: 16,
            padding: "10px 12px",
            borderRadius: 6,
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

      <div style={{ padding: loading || total === 0 ? 24 : 0 }}>
        {loading ? (
          <Spin size="large" style={{ display: "block", margin: "48px auto" }} />
        ) : total === 0 ? (
          <Empty
            title="暂无任务"
            description="点击右上角「新增评审」创建任务。"
            style={{ padding: "32px 0" }}
          />
        ) : (
          <Table
            columns={columns}
            dataSource={dataSource}
            pagination={false}
            size="small"
          />
        )}
      </div>

      {!loading && total > 0 ? (
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid rgba(var(--semi-border-color), 1)",
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Typography.Text type="secondary">
            共 <strong style={{ color: "rgba(var(--semi-grey-9), 1)" }}>{total}</strong> 条
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
  );
}
