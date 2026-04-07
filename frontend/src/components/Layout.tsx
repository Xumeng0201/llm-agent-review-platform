import { Link, NavLink, useLocation } from "react-router-dom";
import {
  IconSearch,
  IconMaximize,
  IconUser,
  IconList,
  IconHome,
  IconSetting,
} from "@douyinfe/semi-icons";
import { Button, Layout, Space, Typography } from "@douyinfe/semi-ui";

const { Header, Content } = Layout;
const { Text } = Typography;

const navLinkStyle = ({
  isActive,
}: {
  isActive: boolean;
}): React.CSSProperties => ({
  fontWeight: isActive ? 600 : 500,
  color: isActive ? "rgba(var(--semi-blue-7), 1)" : "rgba(var(--semi-grey-8), 1)",
  textDecoration: "none",
  padding: "6px 4px",
  borderBottom: isActive
    ? "2px solid rgba(var(--semi-blue-5), 1)"
    : "2px solid transparent",
  marginBottom: -1,
});

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const taskSectionActive = location.pathname.startsWith("/tasks");
  const methodsActive = location.pathname.startsWith("/methods");

  return (
    <div className="app-semi-shell">
      <Layout className="min-h-screen">
        <Header className="app-semi-header">
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
                  color: "rgba(var(--semi-grey-9), 1)",
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
                    background: "rgba(var(--semi-blue-1), 1)",
                    border: "1px solid rgba(var(--semi-blue-3), 0.45)",
                  }}
                >
                  <IconList
                    style={{ fontSize: 18, color: "rgba(var(--semi-blue-6), 1)" }}
                  />
                </span>
                <Text strong style={{ fontSize: 16, letterSpacing: "-0.02em" }}>
                  方案评审
                </Text>
              </Link>
              <nav
                className="hidden md:flex"
                style={{ alignItems: "center", gap: 24 }}
              >
                <NavLink to="/" end style={navLinkStyle}>
                  <Space spacing={6}>
                    <IconHome style={{ fontSize: 16 }} />
                    <span>首页</span>
                  </Space>
                </NavLink>
                <NavLink
                  to="/tasks"
                  style={() => navLinkStyle({ isActive: taskSectionActive })}
                >
                  <Space spacing={6}>
                    <IconList style={{ fontSize: 16 }} />
                    <span>评审任务</span>
                  </Space>
                </NavLink>
                <NavLink
                  to="/methods"
                  style={() => navLinkStyle({ isActive: methodsActive })}
                >
                  <Space spacing={6}>
                    <IconSetting style={{ fontSize: 16 }} />
                    <span>测评方法</span>
                  </Space>
                </NavLink>
              </nav>
            </div>
            <Space spacing={8}>
              <Button
                icon={<IconSearch />}
                theme="borderless"
                type="tertiary"
                aria-label="搜索"
              />
              <Button
                icon={<IconMaximize />}
                theme="borderless"
                type="tertiary"
                className="hidden sm:inline-flex"
                aria-label="全屏"
              />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "4px 10px",
                  borderRadius: 8,
                  background: "rgba(var(--semi-blue-0), 1)",
                  border: "1px solid rgba(var(--semi-blue-2), 0.8)",
                }}
              >
                <IconUser style={{ fontSize: 16, color: "rgba(var(--semi-grey-7), 1)" }} />
                <Text size="small" type="secondary" className="hidden sm:inline">
                  管理员
                </Text>
              </div>
            </Space>
          </div>
          <div
            className="md:hidden"
            style={{
              borderTop: "1px solid rgba(var(--semi-blue-2), 0.5)",
              padding: "8px 16px 10px",
            }}
          >
            <nav
              style={{
                display: "flex",
                gap: 16,
                overflowX: "auto",
                maxWidth: 1400,
                margin: "0 auto",
              }}
            >
              <NavLink to="/" end style={navLinkStyle}>
                首页
              </NavLink>
              <NavLink
                to="/tasks"
                style={() => navLinkStyle({ isActive: taskSectionActive })}
              >
                评审任务
              </NavLink>
              <NavLink
                to="/methods"
                style={() => navLinkStyle({ isActive: methodsActive })}
              >
                测评方法
              </NavLink>
            </nav>
          </div>
        </Header>
        <Content className="app-semi-main" style={{ padding: "24px 20px" }}>
          <div style={{ maxWidth: 1400, margin: "0 auto" }}>{children}</div>
        </Content>
      </Layout>
    </div>
  );
}
