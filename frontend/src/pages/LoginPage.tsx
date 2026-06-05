import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { IconHistogram, IconList, IconUser } from "@douyinfe/semi-icons";
import { Button, Checkbox, Input, Typography } from "@douyinfe/semi-ui";
import { ApiError } from "../api";
import { useAuth } from "../auth";

const { Text } = Typography;

const REMEMBER_KEY = "project-review-remember-login";

function FeatureIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="login-feature-icon" aria-hidden="true">
      {children}
    </span>
  );
}

export default function LoginPage() {
  const { user, loading, needsBootstrap, login, bootstrapAdmin, refreshBootstrapStatus } = useAuth();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(REMEMBER_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { username?: string; remember?: boolean };
      if (parsed.remember && parsed.username) {
        setUsername(parsed.username);
        setRemember(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const formTitle = useMemo(
    () => (needsBootstrap ? "初始化管理员" : "欢迎登录"),
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
      if (remember) {
        localStorage.setItem(
          REMEMBER_KEY,
          JSON.stringify({ remember: true, username: username.trim() })
        );
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }
    } catch (error) {
      setErr(error instanceof Error ? error.message : "提交失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card-left">
          <h1 className="login-brand-title">项目方案评审平台</h1>
          <p className="login-brand-desc">
            {needsBootstrap
              ? "系统首次启用，请先创建管理员账号，后续由管理员维护用户与评审任务。"
              : "面向方案预审与实施方案的多维度智能审查与对比分析，助力规范评审与高效决策。"}
          </p>
          <div className="login-feature-icons">
            <FeatureIcon>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="4" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.6" />
                <path d="M8 20h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <path d="M12 10v4M10 12h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </FeatureIcon>
            <FeatureIcon>
              <IconHistogram style={{ fontSize: 28 }} />
            </FeatureIcon>
            <FeatureIcon>
              <IconList style={{ fontSize: 28 }} />
            </FeatureIcon>
          </div>
        </div>

        <div className="login-card-right">
          <h2 className="login-form-title">{formTitle}</h2>
          <div className="login-form-title-line" />

          <form
            className="login-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submitForm();
            }}
          >
            <div className="login-field">
              <span className="login-field-icon">
                <IconUser />
              </span>
              <Input
                className="login-input"
                borderless
                value={username}
                onChange={setUsername}
                placeholder="请输入用户名"
                size="large"
                autoFocus
              />
            </div>

            {needsBootstrap ? (
              <div className="login-field">
                <span className="login-field-icon">
                  <IconUser />
                </span>
                <Input
                  className="login-input"
                  borderless
                  value={displayName}
                  onChange={setDisplayName}
                  placeholder="显示名称（可选）"
                  size="large"
                />
              </div>
            ) : null}

            <div className="login-field">
              <span className="login-field-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
                  <path
                    d="M8 11V8a4 4 0 1 1 8 0v3"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <Input
                className="login-input"
                borderless
                value={password}
                onChange={setPassword}
                placeholder="请输入密码"
                mode="password"
                size="large"
              />
            </div>

            {!needsBootstrap ? (
              <div className="login-remember-row">
                <Checkbox checked={remember} onChange={(e) => setRemember(Boolean(e.target?.checked))}>
                  记住密码
                </Checkbox>
              </div>
            ) : null}

            {err ? <div className="login-error">{err}</div> : null}

            <Button
              htmlType="submit"
              theme="solid"
              type="primary"
              size="large"
              loading={busy}
              disabled={!username.trim() || password.length < 6}
              className="login-submit-btn"
              block
            >
              {needsBootstrap ? "创建管理员并进入" : "登 录"}
            </Button>

            {!needsBootstrap ? (
              <button type="button" className="login-forgot-link">
                忘记密码
              </button>
            ) : null}
          </form>
        </div>
      </div>

      <Text className="login-footer">
        Copyright © {new Date().getFullYear()} 项目方案评审平台
      </Text>
    </div>
  );
}
