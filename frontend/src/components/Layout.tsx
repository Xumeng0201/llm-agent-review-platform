import { Link, NavLink, useLocation } from "react-router-dom";
import {
  IconFile,
  IconHome,
  IconList,
  IconSetting,
  IconUserGroup,
} from "@douyinfe/semi-icons";
import { Button, Layout, Space, Typography } from "@douyinfe/semi-ui";
import { useAuth } from "../auth";

const { Header, Content } = Layout;
const { Text } = Typography;

function BalanceMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M5 7h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 7 5.5 12h5L8 7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="m16 7-2.5 5h5L16 7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 7v12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 21h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

const navLinkStyle = ({
  isActive,
}: {
  isActive: boolean;
}): React.CSSProperties => ({
  position: "relative",
  fontWeight: isActive ? 600 : 500,
  color: isActive ? "#111111" : "rgba(15, 23, 42, 0.72)",
  textDecoration: "none",
  padding: "10px 12px 12px",
  borderRadius: 0,
  border: "none",
  background: "transparent",
  boxShadow: isActive ? "inset 0 -2px 0 #111111" : "none",
  transition: "color 180ms ease",
});

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const preReviewTasksActive =
    location.pathname === "/tasks/pre-review" || location.pathname.startsWith("/tasks/pre-review/");
  const implementationTasksActive =
    location.pathname === "/tasks/implementation" || location.pathname.startsWith("/tasks/implementation/");
  const criteriaActive = location.pathname.startsWith("/review-criteria");
  const methodsActive = location.pathname.startsWith("/methods");
  const usersActive = location.pathname.startsWith("/users");

  return (
    <div className="app-semi-shell">
      <Layout className="min-h-screen">
        <Header
          className="app-semi-header"
          style={{
            background:
              "linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0.54))",
            backdropFilter: "blur(20px)",
            borderBottom: "1px solid rgba(15, 23, 42, 0.06)",
            height: "auto",
            paddingTop: 6,
          }}
        >
          <div
            style={{
              maxWidth: 1400,
              margin: "0 auto",
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              padding: "0 20px",
              height: 56,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 32, minWidth: 0 }}>
              <Link
                to="/"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  textDecoration: "none",
                  color: "#111111",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "linear-gradient(180deg, rgba(255,255,255,0.92), rgba(247,248,255,0.72))",
                    border: "1px solid rgba(255, 255, 255, 0.92)",
                    boxShadow: "0 10px 30px rgba(148, 163, 255, 0.14)",
                  }}
                >
                  <span style={{ display: "inline-flex", color: "#4f46e5" }}>
                    <BalanceMark />
                  </span>
                </span>
                <div>
                  <Text
                    style={{
                      display: "block",
                      fontSize: 11,
                      letterSpacing: "0.16em",
                      color: "rgba(79, 70, 229, 0.72)",
                    }}
                  >
                    PROJECT REVIEW HUB
                  </Text>
                  <Text strong style={{ fontSize: 16, letterSpacing: "-0.02em", color: "#111111" }}>
                    项目方案评审平台
                  </Text>
                </div>
              </Link>
              <nav
                className="hidden md:flex"
                style={{
                  alignItems: "center",
                  gap: 18,
                  padding: 0,
                  borderRadius: 0,
                  background: "transparent",
                  border: "none",
                  boxShadow: "none",
                }}
              >
                <NavLink to="/" end style={navLinkStyle}>
                  <Space spacing={8} style={{ position: "relative" }}>
                    <IconHome style={{ fontSize: 16 }} />
                    <span>首页</span>
                  </Space>
                </NavLink>
                <NavLink
                  to="/tasks/pre-review"
                  style={() => navLinkStyle({ isActive: preReviewTasksActive })}
                >
                  <Space spacing={8} style={{ position: "relative" }}>
                    <IconList style={{ fontSize: 16 }} />
                    <span>方案预审</span>
                  </Space>
                </NavLink>
                <NavLink
                  to="/tasks/implementation"
                  style={() => navLinkStyle({ isActive: implementationTasksActive })}
                >
                  <Space spacing={8} style={{ position: "relative" }}>
                    <IconList style={{ fontSize: 16 }} />
                    <span>实施方案</span>
                  </Space>
                </NavLink>
                <NavLink
                  to="/review-criteria"
                  style={() => navLinkStyle({ isActive: criteriaActive })}
                >
                  <Space spacing={8} style={{ position: "relative" }}>
                    <IconFile style={{ fontSize: 16 }} />
                    <span>审核要点</span>
                  </Space>
                </NavLink>
                <NavLink
                  to="/methods"
                  style={() => navLinkStyle({ isActive: methodsActive })}
                >
                  <Space spacing={8} style={{ position: "relative" }}>
                    <IconSetting style={{ fontSize: 16 }} />
                    <span>智能体配置</span>
                  </Space>
                </NavLink>
                {user?.role === "admin" ? (
                  <NavLink
                    to="/users"
                    style={() => navLinkStyle({ isActive: usersActive })}
                  >
                    <Space spacing={8} style={{ position: "relative" }}>
                      <IconUserGroup style={{ fontSize: 16 }} />
                      <span>用户管理</span>
                    </Space>
                  </NavLink>
                ) : null}
              </nav>
            </div>
            <Space spacing={8}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 12px",
                  borderRadius: 999,
                  background: "rgba(255, 255, 255, 0.7)",
                  border: "1px solid rgba(255, 255, 255, 0.88)",
                }}
                >
                  <BalanceMark />
                  <Text size="small" className="hidden sm:inline" style={{ color: "#111111" }}>
                    {user?.display_name || user?.username || "未登录"}
                  </Text>
                </div>
              <Button
                size="small"
                theme="light"
                type="tertiary"
                style={{
                  borderRadius: 999,
                  background: "rgba(255, 255, 255, 0.72)",
                  border: "1px solid rgba(255, 255, 255, 0.88)",
                }}
                onClick={() => void logout()}
              >
                退出登录
              </Button>
            </Space>
          </div>
          <div
            className="md:hidden"
            style={{
              borderTop: "1px solid rgba(15, 23, 42, 0.06)",
              padding: "8px 16px 10px",
            }}
          >
            <nav
              style={{
                display: "flex",
                gap: 14,
                overflowX: "auto",
                maxWidth: 1400,
                margin: "0 auto",
                padding: 0,
                borderRadius: 0,
                background: "transparent",
                border: "none",
              }}
            >
              <NavLink to="/" end style={navLinkStyle}>
                首页
              </NavLink>
              <NavLink
                to="/tasks/pre-review"
                style={() => navLinkStyle({ isActive: preReviewTasksActive })}
              >
                方案预审
              </NavLink>
              <NavLink
                to="/tasks/implementation"
                style={() => navLinkStyle({ isActive: implementationTasksActive })}
              >
                实施方案
              </NavLink>
              <NavLink
                to="/review-criteria"
                style={() => navLinkStyle({ isActive: criteriaActive })}
              >
                审核要点
              </NavLink>
              <NavLink
                to="/methods"
                style={() => navLinkStyle({ isActive: methodsActive })}
              >
                智能体配置
              </NavLink>
              {user?.role === "admin" ? (
                <NavLink
                  to="/users"
                  style={() => navLinkStyle({ isActive: usersActive })}
                >
                  用户管理
                </NavLink>
              ) : null}
            </nav>
          </div>
        </Header>
        <Content
          className="app-semi-main"
          style={{
            padding: "24px 20px",
            background:
              "radial-gradient(circle at 14% 18%, rgba(135, 183, 255, 0.54), transparent 28%), radial-gradient(circle at 78% 10%, rgba(133, 121, 255, 0.48), transparent 26%), radial-gradient(circle at 50% 38%, rgba(255, 255, 255, 0.92), rgba(245, 247, 255, 0.84) 45%, rgba(235, 240, 255, 0.82) 100%)",
          }}
        >
          <div style={{ maxWidth: 1400, margin: "0 auto" }}>{children}</div>
        </Content>
      </Layout>
    </div>
  );
}
