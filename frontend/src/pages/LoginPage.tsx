import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Button, Card, Input, Space, Typography } from "@douyinfe/semi-ui";
import { ApiError } from "../api";
import { useAuth } from "../auth";

const { Title, Text } = Typography;

export default function LoginPage() {
  const { user, loading, needsBootstrap, login, bootstrapAdmin, refreshBootstrapStatus } = useAuth();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pageTitle = useMemo(
    () => (needsBootstrap ? "初始化管理员账号" : "登录项目方案评审平台"),
    [needsBootstrap]
  );

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  async function submitForm() {
    setErr(null);
    setBusy(true);
    try {
      if (needsBootstrap) {
        try {
          await bootstrapAdmin({
            username: username.trim(),
            display_name: displayName.trim() || null,
            password,
          });
        } catch (error) {
          if (error instanceof ApiError && error.status === 400 && error.message.includes("已初始化")) {
            await refreshBootstrapStatus();
            await login({ username: username.trim(), password });
          } else {
            throw error;
          }
        }
      } else {
        await login({ username: username.trim(), password });
      }
    } catch (error) {
      setErr(error instanceof Error ? error.message : "提交失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background:
          "radial-gradient(circle at 14% 18%, rgba(135, 183, 255, 0.54), transparent 28%), radial-gradient(circle at 78% 10%, rgba(133, 121, 255, 0.48), transparent 26%), radial-gradient(circle at 50% 38%, rgba(255, 255, 255, 0.92), rgba(245, 247, 255, 0.84) 45%, rgba(235, 240, 255, 0.82) 100%)",
      }}
    >
      <Card
        bordered={false}
        style={{
          width: "min(100%, 480px)",
          borderRadius: 28,
          border: "1px solid rgba(255, 255, 255, 0.92)",
          background: "linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(247, 248, 255, 0.9))",
          boxShadow: "0 24px 60px rgba(111, 123, 168, 0.14)",
        }}
        bodyStyle={{ padding: 28 }}
      >
        <Space vertical spacing="loose" style={{ width: "100%" }}>
          <div>
            <Text style={{ color: "#4f46e5", letterSpacing: "0.16em", fontSize: 12 }}>
              PROJECT REVIEW HUB
            </Text>
            <Title heading={3} style={{ margin: "10px 0 8px", color: "#0f172a" }}>
              {pageTitle}
            </Title>
            <Text style={{ color: "rgba(51, 65, 85, 0.86)", lineHeight: 1.8 }}>
              {needsBootstrap
                ? "这是系统首次启用。请先创建一个管理员账号，后续再由管理员新增普通用户。"
                : "登录后即可查看自己的评审任务、智能体配置和审查结果。"}
            </Text>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitForm();
            }}
          >
            <Space vertical spacing="medium" style={{ width: "100%" }}>
              <Input
                value={username}
                onChange={setUsername}
                placeholder="用户名"
                size="large"
                autoFocus
              />
              {needsBootstrap ? (
                <Input
                  value={displayName}
                  onChange={setDisplayName}
                  placeholder="显示名称（可选）"
                  size="large"
                />
              ) : null}
              <Input
                value={password}
                onChange={setPassword}
                placeholder="密码"
                mode="password"
                size="large"
              />
              {err ? (
                <div
                  style={{
                    borderRadius: 16,
                    padding: "12px 14px",
                    background: "rgba(254, 226, 226, 0.76)",
                    color: "#b91c1c",
                    fontSize: 14,
                  }}
                >
                  {err}
                </div>
              ) : null}
              <Button
                htmlType="button"
                theme="solid"
                type="primary"
                size="large"
                loading={busy}
                disabled={!username.trim() || password.length < 6}
                onClick={() => void submitForm()}
                style={{
                  width: "100%",
                  borderRadius: 999,
                  height: 46,
                  background: "linear-gradient(90deg, #20d2cc, #2c7ef8)",
                  border: "none",
                }}
              >
                {needsBootstrap ? "创建管理员并进入系统" : "登录"}
              </Button>
            </Space>
          </form>
        </Space>
      </Card>
    </div>
  );
}
