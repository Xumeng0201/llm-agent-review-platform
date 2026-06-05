import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  IconGridStroked,
  IconHomeStroked,
  IconLineChartStroked,
  IconOrderedListStroked,
  IconSettingStroked,
  IconTemplateStroked,
  IconUserListStroked,
} from "@douyinfe/semi-icons";
import { useAuth } from "../auth";
import brandLogo from "../assets/brand-logo.png";
import UserMenu from "./UserMenu";
import { pageContentMaxWidth, pageContentWrapStyle } from "../theme/pageChrome";

const navIconStyle = { fontSize: 18 } as const;

export default function AppLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const pathname = location.pathname;

  const navItems = [
    {
      key: "home",
      label: "首页",
      to: "/",
      icon: <IconHomeStroked style={navIconStyle} />,
      active: pathname === "/",
    },
    {
      key: "pre-review",
      label: "方案预审",
      to: "/tasks/pre-review",
      icon: <IconOrderedListStroked style={navIconStyle} />,
      active: pathname === "/tasks/pre-review" || pathname.startsWith("/tasks/pre-review/"),
    },
    {
      key: "implementation",
      label: "实施方案",
      to: "/tasks/implementation",
      icon: <IconGridStroked style={navIconStyle} />,
      active: pathname === "/tasks/implementation" || pathname.startsWith("/tasks/implementation/"),
    },
    {
      key: "criteria",
      label: "审核要点",
      to: "/review-criteria",
      icon: <IconTemplateStroked style={navIconStyle} />,
      active: pathname.startsWith("/review-criteria"),
    },
    {
      key: "memory",
      label: "记忆比对",
      to: "/memory",
      icon: <IconLineChartStroked style={navIconStyle} />,
      active: pathname.startsWith("/memory"),
    },
    {
      key: "methods",
      label: "智能体配置",
      to: "/methods",
      icon: <IconSettingStroked style={navIconStyle} />,
      active: pathname.startsWith("/methods"),
    },
  ];

  if (user?.role === "admin") {
    navItems.push({
      key: "users",
      label: "用户管理",
      to: "/users",
      icon: <IconUserListStroked style={navIconStyle} />,
      active: pathname.startsWith("/users"),
    });
  }

  return (
    <div className="app-shell-v2">
      <div className="app-shell-horizontal" style={{ maxWidth: pageContentMaxWidth }}>
        <header className="app-topbar">
          <div className="app-topbar-left">
            <Link to="/" className="app-topbar-brand">
              <span className="app-topbar-brand-mark">
                <img src={brandLogo} width={40} height={40} alt="" aria-hidden="true" />
              </span>
              <span className="app-topbar-brand-title">项目方案评审平台</span>
            </Link>

            <nav className="app-topbar-nav" aria-label="主导航">
              {navItems.map((item) => (
                <NavLink
                  key={item.key}
                  to={item.to}
                  className={({ isActive }) =>
                    `app-topbar-link ${isActive || item.active ? "is-active" : ""}`
                  }
                >
                  <span className="app-topbar-link-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="app-toolbar-right">
            <UserMenu />
          </div>
        </header>

        <section className="app-workspace">
          <div className="app-workspace-panel">
            <div className="app-workspace-body" style={pageContentWrapStyle}>
              <Outlet />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
