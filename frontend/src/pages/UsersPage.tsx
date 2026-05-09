import { useEffect, useState } from "react";
import { Button, Card, Input, Select, Space, Table, Typography } from "@douyinfe/semi-ui";
import { createUser, listUsers } from "../api";
import { useAuth } from "../auth";
import type { AppUser, UserRole } from "../types";

const { Title, Text } = Typography;

export default function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      setUsers(await listUsers());
    } catch (error) {
      setErr(error instanceof Error ? error.message : "加载用户失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user?.role === "admin") {
      void load();
    }
  }, [user?.role]);

  if (user?.role !== "admin") {
    return (
      <Card bordered={false} style={pageShell} bodyStyle={{ padding: 28 }}>
        <Title heading={4} style={{ color: "#0f172a", marginTop: 0 }}>
          用户管理
        </Title>
        <Text style={{ color: "rgba(51, 65, 85, 0.86)" }}>仅管理员可以查看和创建用户。</Text>
      </Card>
    );
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      await createUser({
        username: username.trim(),
        display_name: displayName.trim() || null,
        password,
        role,
      });
      setUsername("");
      setDisplayName("");
      setPassword("");
      setRole("user");
      setMsg("新用户已创建。");
      await load();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Space vertical spacing="loose" style={{ width: "100%" }}>
      <Card bordered={false} style={pageShell} bodyStyle={{ padding: 28 }}>
        <Title heading={4} style={{ color: "#0f172a", marginTop: 0 }}>
          用户管理
        </Title>
        <Text style={{ color: "rgba(51, 65, 85, 0.86)", display: "block", marginBottom: 20 }}>
          这里用于新增系统用户。每个评审任务和审查智能体都会自动挂到创建它的用户账号下。
        </Text>
        <form onSubmit={(e) => void onCreate(e)}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
            }}
          >
            <Input value={username} onChange={setUsername} placeholder="用户名" size="large" />
            <Input value={displayName} onChange={setDisplayName} placeholder="显示名称（可选）" size="large" />
            <Input value={password} onChange={setPassword} placeholder="初始密码" mode="password" size="large" />
            <Select
              value={role}
              onChange={(value) => setRole(value as UserRole)}
              size="large"
              optionList={[
                { label: "普通用户", value: "user" },
                { label: "管理员", value: "admin" },
              ]}
            />
          </div>
          {err ? <div style={alertDanger}>{err}</div> : null}
          {msg ? <div style={alertSuccess}>{msg}</div> : null}
          <div style={{ marginTop: 18 }}>
            <Button
              htmlType="submit"
              theme="solid"
              type="primary"
              loading={busy}
              disabled={!username.trim() || password.length < 6}
              style={primaryBtn}
            >
              创建用户
            </Button>
          </div>
        </form>
      </Card>

      <Card bordered={false} style={pageShell} bodyStyle={{ padding: 0 }}>
        <Table
          dataSource={users}
          loading={loading}
          pagination={false}
          columns={[
            { title: "用户名", dataIndex: "username", key: "username" },
            { title: "显示名称", dataIndex: "display_name", key: "display_name" },
            {
              title: "角色",
              dataIndex: "role",
              key: "role",
              render: (value: UserRole) => (value === "admin" ? "管理员" : "普通用户"),
            },
            {
              title: "状态",
              dataIndex: "is_active",
              key: "is_active",
              render: (value: boolean) => (value ? "启用" : "停用"),
            },
            {
              title: "创建时间",
              dataIndex: "created_at",
              key: "created_at",
              render: (value: string | null) => value?.replace("T", " ").slice(0, 19) || "—",
            },
          ]}
        />
      </Card>
    </Space>
  );
}

const pageShell = {
  width: "100%",
  borderRadius: 26,
  border: "1px solid rgba(255, 255, 255, 0.9)",
  background:
    "radial-gradient(circle at top left, rgba(56, 189, 248, 0.14), transparent 24%), linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(247, 248, 255, 0.88))",
  boxShadow: "0 24px 60px rgba(111, 123, 168, 0.14)",
} as const;

const primaryBtn = {
  borderRadius: 999,
  background: "linear-gradient(90deg, #20d2cc, #2c7ef8)",
  border: "none",
} as const;

const alertDanger = {
  marginTop: 14,
  borderRadius: 14,
  padding: "10px 12px",
  background: "rgba(254, 226, 226, 0.76)",
  color: "#b91c1c",
  fontSize: 14,
} as const;

const alertSuccess = {
  marginTop: 14,
  borderRadius: 14,
  padding: "10px 12px",
  background: "rgba(220, 252, 231, 0.78)",
  color: "#166534",
  fontSize: 14,
} as const;
