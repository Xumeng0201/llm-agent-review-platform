import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import HomePage from "./pages/HomePage";
import MethodsPage from "./pages/MethodsPage";
import TaskHome from "./pages/TaskHome";
import TaskNew from "./pages/TaskNew";
import TaskDetail from "./pages/TaskDetail";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/tasks" element={<TaskHome />} />
        <Route path="/methods" element={<MethodsPage />} />
        <Route path="/tasks/new" element={<TaskNew />} />
        <Route path="/tasks/:id" element={<TaskDetail />} />
        <Route path="*" element={<Navigate to="/tasks" replace />} />
      </Routes>
    </Layout>
  );
}
