import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Button, Card, Input, Select, Space, Spin, Switch, Toast, Typography } from "@douyinfe/semi-ui";
import { createUser, getUser, updateUser } from "../api";
import { useAuth } from "../auth";
import type { UserRole } from "../types";
import { pageShellForm, formFieldGridStyle, formFieldLabelStyle, formFieldReadonlySurface, formFieldSpanAll, techFieldSurface, techPrimaryButton } from "../theme/pageChrome";

const { Title, Text } = Typography;

export default function UserFormPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user: me } = useAuth();
  const isNew = id == null;

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(!isNew);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (isNew || !id) return;
    const userId = Number(id);
    if (!Number.isFinite(userId)) {
      Toast.error("无效的用户 ID");
      nav("/users", { replace: true });
      return;
    }
    setLoading(true);
    setErr(null);
    getUser(userId)
      .then((u) => {
        setUsername(u.username);
        setDisplayName(u.display_name || "");
        setRole(u.role);
        setIsActive(u.is_active);
        setPassword("");
      })
      .catch((e) => {
        Toast.error(e instanceof Error ? e.message : "加载用户失败");
        nav("/users", { replace: true });
      })
      .finally(() => setLoading(false));
  }, [id, isNew, nav]);

  if (me?.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (isNew) {
        await createUser({
          username: username.trim(),
          display_name: displayName.trim() || null,
          password,
          role,
        });
        Toast.success("用户已创建");
        nav("/users");
        return;
      }
      const userId = Number(id);
      const patch: {
        display_name: string;
        role: UserRole;
        is_active: boolean;
        password?: string;
      } = {
        display_name: displayName.trim(),
        role,
        is_active: isActive,
      };
      const pw = password.trim();
      if (pw.length >= 6) patch.password = pw;
      await updateUser(userId, patch);
      Toast.success("已保存");
      nav("/users");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "保存失败";
      setErr(msg);
      Toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  if (!isNew && loading) {
    return (
      <Card bordered={false} style={pageShellForm} className="tech-enter tech-enter-1" bodyStyle={{ padding: 48 }}>
        <Spin size="large" style={{ display: "block", margin: "0 auto" }} />
      </Card>
    );
  }

  return (
    <Card bordered={false} style={pageShellForm} className="tech-enter tech-enter-1" bodyStyle={{ padding: "clamp(22px, 4vw, 44px)" }}>
      <Space vertical spacing="loose" style={{ width: "100%", alignItems: "stretch" }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
          <div>
            <Title heading={2} style={{ margin: 0, color: "#0f172a" }}>
              {isNew ? "新增用户" : "编辑用户"}
            </Title>
          </div>
          <Button onClick={() => nav("/users")} style={{ borderRadius: 999 }}>
            返回列表
          </Button>
        </div>

        <form onSubmit={(e) => void onSubmit(e)}>
          <div style={formFieldGridStyle}>
            {isNew ? (
              <div>
                <Text strong style={formFieldLabelStyle}>
                  用户名
                </Text>
                <Input
                  value={username}
                  onChange={setUsername}
                  placeholder="登录名"
                  style={techFieldSurface}
                />
              </div>
            ) : (
              <div>
                <Text strong style={formFieldLabelStyle}>
                  用户名
                </Text>
                <Input
                  value={username}
                  disabled
                  readOnly
                  className="form-field-readonly-input"
                  style={formFieldReadonlySurface}
                />
              </div>
            )}
            <div>
              <Text strong style={formFieldLabelStyle}>
                显示名称
              </Text>
              <Input
                value={displayName}
                onChange={setDisplayName}
                placeholder="可选"
                style={techFieldSurface}
              />
            </div>
            <div>
              <Text strong style={formFieldLabelStyle}>
                角色
              </Text>
              <Select
                value={role}
                onChange={(value) => setRole(value as UserRole)}
                className="taskhome-filter-select"
                style={{ width: "100%" }}
                optionList={[
                  { label: "普通用户", value: "user" },
                  { label: "管理员", value: "admin" },
                ]}
              />
            </div>
            <div style={formFieldSpanAll}>
              <Text strong style={formFieldLabelStyle}>
                {isNew ? "初始密码" : "新密码（可选）"}
              </Text>
              <Input
                value={password}
                onChange={setPassword}
                placeholder={isNew ? "至少 6 位" : "留空则不修改"}
                mode="password"
                autoComplete="off"
                style={techFieldSurface}
              />
            </div>
            {!isNew ? (
              <div style={formFieldSpanAll}>
                <Text strong style={formFieldLabelStyle}>
                  账号启用
                </Text>
                <div style={{ paddingTop: 4 }}>
                  <Switch checked={isActive} onChange={setIsActive} />
                </div>
              </div>
            ) : null}
          </div>

          {err ? (
            <div style={{ marginTop: 16 }} className="tech-alert tech-alert-danger" role="alert">
              {err}
            </div>
          ) : null}

          <div style={{ marginTop: 28, display: "flex", justifyContent: "flex-end" }}>
            <Button
              htmlType="submit"
              theme="solid"
              type="primary"
              loading={busy}
              disabled={isNew ? !username.trim() || password.length < 6 : false}
              style={techPrimaryButton}
            >
              {isNew ? "创建用户" : "保存更改"}
            </Button>
          </div>
        </form>
      </Space>
    </Card>
  );
}
