import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconDeleteStroked, IconEditStroked, IconSearchStroked } from "@douyinfe/semi-icons";
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
  Typography,
} from "@douyinfe/semi-ui";
import { TableActionButton, TableActionGroup } from "../components/TableActionButton";
import { deleteAgent, listAgents } from "../api";
import { pageShellList, techPrimaryButton, toolbarSearchInput } from "../theme/pageChrome";
import type { LlmAgent, LlmProvider } from "../types";
import { providerLabel } from "./agentShared";

const { Title, Text } = Typography;

type ProviderFilter = "all" | LlmProvider;

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

export default function MethodsPage() {
  const nav = useNavigate();
  const [items, setItems] = useState<LlmAgent[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const body = await listAgents({
        page,
        page_size: pageSize,
        q: search.trim() || undefined,
        provider: providerFilter,
      });
      setListTotal(body.total);
      setItems(body.items);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, providerFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, providerFilter, pageSize]);

  const totalPages = Math.max(1, Math.ceil(listTotal / pageSize) || 1);
  const pageSafe = Math.min(page, totalPages);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  async function onDelete(id: number, n: string) {
    if (!confirm(`删除智能体「${n}」？`)) return;
    setErr(null);
    try {
      await deleteAgent(id);
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
      width: 80,
      align: "center" as const,
    },
    {
      title: "名称",
      dataIndex: "name",
      key: "name",
      align: "center" as const,
      render: (text: string) => (
        <Text strong style={{ color: "#0f172a" }}>
          {text}
        </Text>
      ),
    },
    {
      title: "提供方",
      dataIndex: "provider",
      key: "provider",
      width: 160,
      align: "center" as const,
      render: (p: LlmProvider) => <Text style={{ color: "rgba(51, 65, 85, 0.9)" }}>{providerLabel[p]}</Text>,
    },
    {
      title: "模型",
      dataIndex: "model",
      key: "model",
      align: "center" as const,
      render: (m: string) => (
        <span style={{ fontSize: 12, color: "rgba(51, 65, 85, 0.84)" }}>{m}</span>
      ),
    },
    {
      title: "提示词",
      key: "prompt",
      width: 100,
      align: "center" as const,
      render: (_: unknown, r: LlmAgent) => (
        <Text size="small" style={{ color: "rgba(71, 85, 105, 0.86)" }}>
          {(r.system_prompt ?? "").trim() ? "已自定义" : "默认角色"}
        </Text>
      ),
    },
    {
      title: "Key",
      dataIndex: "key_hint",
      key: "key_hint",
      align: "center" as const,
      render: (h: string) => (
        <Text size="small" style={{ color: "rgba(51, 65, 85, 0.84)" }}>
          {h}
        </Text>
      ),
    },
    {
      title: "创建时间",
      dataIndex: "created_at",
      key: "created_at",
      width: 176,
      align: "center" as const,
      render: (value: string | null | undefined) => (
        <span style={{ fontSize: 12, color: "rgba(51, 65, 85, 0.82)" }}>
          {formatDateTime(value ?? null)}
        </span>
      ),
    },
    {
      title: "更新时间",
      dataIndex: "updated_at",
      key: "updated_at",
      width: 176,
      align: "center" as const,
      render: (value: string | null | undefined) => (
        <span style={{ fontSize: 12, color: "rgba(51, 65, 85, 0.82)" }}>
          {formatDateTime(value ?? null)}
        </span>
      ),
    },
    {
      title: "更新人",
      dataIndex: "username",
      key: "username",
      width: 120,
      align: "center" as const,
      ellipsis: true,
      render: (v: string | undefined) => (
        <Text style={{ color: "rgba(51, 65, 85, 0.92)" }}>{v?.trim() || "—"}</Text>
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: 150,
      align: "center" as const,
      render: (_: unknown, a: LlmAgent) => (
        <TableActionGroup>
          <TableActionButton
            tone="primary"
            label="编辑"
            icon={<IconEditStroked />}
            onClick={() => nav(`/methods/${a.id}/edit`)}
          />
          <TableActionButton
            tone="danger"
            label="删除"
            icon={<IconDeleteStroked />}
            onClick={() => void onDelete(a.id, a.name)}
          />
        </TableActionGroup>
      ),
    },
  ];

  const dataSource = items.map((a, idx) => ({
    ...a,
    key: a.id,
    row_no: (pageSafe - 1) * pageSize + idx + 1,
  }));

  const emptyIsFiltered = listTotal === 0 && (Boolean(search.trim()) || providerFilter !== "all");

  const emptyNode = emptyIsFiltered ? (
    <Empty
      title="无匹配结果"
      description="尝试调整搜索关键词或提供方筛选。"
      style={{ padding: "40px 0" }}
    />
  ) : (
    <Empty
      title="暂无智能体"
      description="点击右上角「+ 新增审查智能体」创建后，将出现在此列表中。"
      style={{ padding: "40px 0" }}
    />
  );

  return (
    <Space vertical spacing="loose" style={{ width: "100%", alignItems: "stretch" }}>
      <Card bordered={false} style={pageShellList} className="tech-enter tech-enter-1 page-shell-list" bodyStyle={{ padding: 0 }}>
        <div className="taskhome-toolbar">
          <Title heading={5} style={{ margin: 0, color: "#0f172a" }}>
            智能体列表
          </Title>
          <Space wrap style={{ justifyContent: "flex-end" }}>
            <Button theme="solid" type="primary" onClick={() => nav("/methods/new")} style={techPrimaryButton}>
              + 新增审查智能体
            </Button>
            <Input
              prefix={<IconSearchStroked />}
              placeholder="搜索名称或模型"
              value={search}
              onChange={setSearch}
              style={toolbarSearchInput}
            />
            <Select
              className="taskhome-filter-select"
              value={providerFilter}
              onChange={(v) => setProviderFilter(v as ProviderFilter)}
              style={{ width: 160 }}
              optionList={[
                { label: "全部提供方", value: "all" },
                { label: "DeepSeek", value: "deepseek" },
                { label: "OpenAI", value: "openai" },
                { label: "自定义", value: "custom" },
              ]}
            />
          </Space>
        </div>

        {err ? (
          <div style={{ margin: 16 }} className="tech-alert tech-alert-danger" role="alert">
            {err}
          </div>
        ) : null}

        <div style={{ padding: loading || listTotal === 0 ? 24 : 0 }}>
          {loading ? (
            <Spin size="large" style={{ display: "block", margin: "48px auto" }} />
          ) : listTotal === 0 ? (
            emptyNode
          ) : (
            <Table className="taskhome-table" columns={columns} dataSource={dataSource} pagination={false} size="small" />
          )}
        </div>

        {!loading && listTotal > 0 ? (
          <div className="taskhome-pagination">
            <Typography.Text style={{ color: "rgba(51, 65, 85, 0.84)" }}>
              当前筛选结果 <strong style={{ color: "#0f172a" }}>{listTotal}</strong> 条
            </Typography.Text>
            <Pagination
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
