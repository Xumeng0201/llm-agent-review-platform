import { Component, Suspense, lazy } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { useAuth } from "./auth";
import Layout from "./components/Layout";
import MethodsAgentFormPage from "./pages/MethodsAgentFormPage";
import MethodsPage from "./pages/MethodsPage";

const HomePage = lazy(() => import("./pages/HomePage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const TaskHome = lazy(() => import("./pages/TaskHome"));
const TaskNew = lazy(() => import("./pages/TaskNew"));
const TaskDetail = lazy(() => import("./pages/TaskDetail"));
const UsersPage = lazy(() => import("./pages/UsersPage"));
const UserFormPage = lazy(() => import("./pages/UserFormPage"));
const ReviewCriteriaPage = lazy(() => import("./pages/ReviewCriteriaPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const MemoryComparePage = lazy(() => import("./pages/MemoryComparePage"));

/** `/tasks/:id` → 第一步（上传文件） */
function TaskDetailDefaultStep() {
  const { id } = useParams();
  return <Navigate to={`/tasks/${id}/materials`} replace />;
}

function ProtectedShell() {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Layout />;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <RouteLoadingShell />;
  }

  return (
    <RouteErrorBoundary>
      <Suspense fallback={<RouteLoadingShell />}>
        <Routes>
          <Route
            path="/login"
            element={user ? <Navigate to="/" replace /> : <LoginPage />}
          />
          <Route element={<ProtectedShell />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/tasks/pre-review" element={<TaskHome phase="pre_review" />} />
            <Route path="/tasks/implementation" element={<TaskHome phase="implementation" />} />
            <Route path="/tasks/pre-review/new" element={<TaskNew phase="pre_review" />} />
            <Route path="/tasks/implementation/new" element={<TaskNew phase="implementation" />} />
            <Route path="/review-criteria" element={<ReviewCriteriaPage />} />
            <Route path="/memory" element={<MemoryComparePage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/tasks" element={<Navigate to="/tasks/implementation" replace />} />
            <Route path="/tasks/new" element={<Navigate to="/tasks/implementation/new" replace />} />
            <Route path="/methods/new" element={<MethodsAgentFormPage />} />
            <Route path="/methods/:id/edit" element={<MethodsAgentFormPage />} />
            <Route path="/methods" element={<MethodsPage />} />
            <Route path="/users/new" element={<UserFormPage />} />
            <Route path="/users/:id/edit" element={<UserFormPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/tasks/:id" element={<TaskDetailDefaultStep />} />
            <Route path="/tasks/:id/:step" element={<TaskDetail />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </RouteErrorBoundary>
  );
}

function RouteLoadingShell() {
  return (
    <div className="route-loading-shell">
      <div className="route-loading-panel">
        <span className="route-loading-dot" />
        <span className="route-loading-text">正在加载项目方案评审平台…</span>
      </div>
    </div>
  );
}

class RouteErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Route render failed", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="route-loading-shell">
          <div className="route-loading-panel" style={{ maxWidth: 720, textAlign: "left" }}>
            <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>页面加载失败</div>
            <div style={{ color: "rgba(51, 65, 85, 0.88)", lineHeight: 1.7 }}>
              当前页面触发了前端异常，所以你看到的是空白页。通常是浏览器缓存了旧的路由脚本，或者页面里的运行时代码报错。
            </div>
            <div style={{ marginTop: 10, color: "#b91c1c", whiteSpace: "pre-wrap", fontSize: 13 }}>
              {this.state.error.message || "未知前端错误"}
            </div>
            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: 16,
                borderRadius: 999,
                border: "none",
                padding: "10px 16px",
                background: "linear-gradient(90deg, #20d2cc, #2c7ef8)",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              刷新页面
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
