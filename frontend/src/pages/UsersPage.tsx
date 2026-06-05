import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconEditStroked, IconSearchStroked } from "@douyinfe/semi-icons";
import { Button, Card, Empty, Input, Pagination, Space, Spin, Table, Typography } from "@douyinfe/semi-ui";
import { TableActionButton, TableActionGroup } from "../components/TableActionButton";
import { listUsers } from "../api";
import { useAuth } from "../auth";
import { pageShellList, techPrimaryButton, toolbarSearchInput } from "../theme/pageChrome";
import type { AppUser, UserRole } from "../types";

const { Title, Text } = Typography;

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

export default function UsersPage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const body = await listUsers({
        page,
        page_size: pageSize,
        q: search.trim() || undefined,
      });
      setListTotal(body.total);
      setUsers(body.items);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "加载用户失败");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => {
    if (user?.role === "admin") {
      void load();
    }
  }, [user?.role, load]);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize]);

  const totalPages = Math.max(1, Math.ceil(listTotal / pageSize) || 1);
  const pageSafe = Math.min(page, totalPages);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  if (user?.role !== "admin") {
    return (
      <Space vertical spacing="loose" style={{ width: "100%", alignItems: "stretch" }}>
        <Card bordered={false} style={pageShellList} className="tech-enter tech-enter-1 page-shell-list" bodyStyle={{ padding: 24 }}>
          <Title heading={5} style={{ margin: "0 0 12px", color: "#0f172a" }}>
            用户管理
          </Title>
          <Text style={{ color: "rgba(51, 65, 85, 0.86)" }}>仅管理员可以查看和创建用户。</Text>
        </Card>
      </Space>
    );
  }

  const emptyIsFiltered = listTotal === 0 && Boolean(search.trim());

  return (
    <Space vertical spacing="loose" style={{ width: "100%", alignItems: "stretch" }}>
      <Card bordered={false} style={pageShellList} className="tech-enter tech-enter-1 page-shell-list" bodyStyle={{ padding: 0 }}>
        <div className="taskhome-toolbar">
          <Title heading={5} style={{ margin: 0, color: "#0f172a" }}>
            用户列表
          </Title>
          <Space wrap style={{ justifyContent: "flex-end" }}>
            <Button theme="solid" type="primary" style={techPrimaryButton} onClick={() => nav("/users/new")}>
              + 新增用户
            </Button>
            <Input
              prefix={<IconSearchStroked />}
              placeholder="搜索用户名或显示名"
              value={search}
              onChange={setSearch}
              style={toolbarSearchInput}
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
            <Empty
              title={emptyIsFiltered ? "无匹配结果" : "暂无用户"}
              description={
                emptyIsFiltered
                  ? "尝试调整搜索关键词。"
                  : "点击「新增用户」创建第一个账号。"
              }
              style={{ padding: "40px 0" }}
            />
          ) : (
            <Table
              className="taskhome-table"
              dataSource={users.map((r, idx) => ({
                ...r,
                key: r.id,
                row_no: (pageSafe - 1) * pageSize + idx + 1,
              }))}
              loading={false}
              pagination={false}
              size="small"
              columns={[
                {
                  title: "序号",
                  dataIndex: "row_no",
                  key: "row_no",
                  width: 80,
                  align: "center" as const,
                },
                {
                  title: "用户",
                  key: "user",
                  align: "center" as const,
                  render: (_: unknown, r: AppUser) => (
                    <div style={{ textAlign: "center" }}>
                      <Text strong style={{ color: "#0f172a" }}>
                        {r.display_name || r.username}
                      </Text>
                      {r.display_name?.trim() && r.display_name !== r.username ? (
                        <div style={{ fontSize: 12, color: "rgba(71, 85, 105, 0.82)", marginTop: 2 }}>
                          {r.username}
                        </div>
                      ) : null}
                    </div>
                  ),
                },
                {
                  title: "角色",
                  dataIndex: "role",
                  key: "role",
                  align: "center" as const,
                  render: (value: UserRole) => (value === "admin" ? "管理员" : "普通用户"),
                },
                {
                  title: "状态",
                  dataIndex: "is_active",
                  key: "is_active",
                  align: "center" as const,
                  render: (value: boolean) => (value ? "启用" : "停用"),
                },
                {
                  title: "创建时间",
                  dataIndex: "created_at",
                  key: "created_at",
                  width: 170,
                  align: "center" as const,
                  render: (value: string | null) => (
                    <span style={{ fontSize: 12, color: "rgba(51, 65, 85, 0.82)" }}>
                      {formatDateTime(value)}
                    </span>
                  ),
                },
                {
                  title: "更新时间",
                  dataIndex: "updated_at",
                  key: "updated_at",
                  width: 170,
                  align: "center" as const,
                  render: (value: string | null) => (
                    <span style={{ fontSize: 12, color: "rgba(51, 65, 85, 0.82)" }}>
                      {formatDateTime(value)}
                    </span>
                  ),
                },
                {
                  title: "更新人",
                  dataIndex: "updated_by_name",
                  key: "updated_by_name",
                  width: 120,
                  align: "center" as const,
                  render: (value: string | undefined) => (
                    <Text style={{ color: "rgba(51, 65, 85, 0.92)" }}>{value?.trim() || "—"}</Text>
                  ),
                },
                {
                  title: "操作",
                  key: "actions",
                  width: 130,
                  align: "center" as const,
                  render: (_: unknown, record: AppUser) => (
                    <TableActionGroup>
                      <TableActionButton
                        tone="primary"
                        label="编辑"
                        icon={<IconEditStroked />}
                        onClick={() => nav(`/users/${record.id}/edit`)}
                      />
                    </TableActionGroup>
                  ),
                },
              ]}
            />
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
              onPageSizeChange={(s) => {
                setPageSize(s);
                setPage(1);
              }}
            />
          </div>
        ) : null}
      </Card>
    </Space>
  );
}
