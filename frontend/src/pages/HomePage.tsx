import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconArrowRight,
} from "@douyinfe/semi-icons";
import { Button, Card, Space, Typography } from "@douyinfe/semi-ui";
import { getMonthlyCostSummary, listTasks } from "../api";
import type { MonthlyCostSummary, ReviewTask } from "../types";

const { Text, Title } = Typography;

export default function HomePage() {
  const nav = useNavigate();
  const [items, setItems] = useState<ReviewTask[]>([]);
  const [monthlyCost, setMonthlyCost] = useState<MonthlyCostSummary | null>(null);

  function formatMoney(value: number | null | undefined, currency: "USD" | "CNY") {
    if (value == null || Number.isNaN(value)) return "—";
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency,
      minimumFractionDigits: value < 1 ? 4 : 2,
      maximumFractionDigits: value < 1 ? 4 : 2,
    }).format(value);
  }

  useEffect(() => {
    void Promise.all([
      listTasks().catch(() => []),
      getMonthlyCostSummary().catch(() => null),
    ]).then(([tasks, monthly]) => {
      setItems(tasks);
      setMonthlyCost(monthly);
    });
  }, []);

  const completed = items.filter((x) => x.review_status === "completed").length;
  const running = items.filter((x) => x.review_status === "in_progress").length;

  return (
    <Card
      bordered={false}
      className="tech-enter tech-enter-1"
      style={{
        borderRadius: 28,
        border: "1px solid rgba(255, 255, 255, 0.9)",
        background: "linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(247, 248, 255, 0.88))",
        boxShadow: "0 24px 60px rgba(111, 123, 168, 0.14)",
      }}
      bodyStyle={{ padding: "24px 24px 26px" }}
    >
        <Title heading={2} style={{ color: "#0f172a", margin: "0 0 18px" }}>
          项目评审任务控制台
        </Title>

        <div className="taskhome-stat-row">
          <div className="taskhome-stat-card">
            <Text className="taskhome-stat-label">任务总数</Text>
            <div className="taskhome-stat-value">{items.length}</div>
          </div>
          <div className="taskhome-stat-card">
            <Text className="taskhome-stat-label">评审中</Text>
            <div className="taskhome-stat-value">{running}</div>
          </div>
          <div className="taskhome-stat-card">
            <Text className="taskhome-stat-label">已完成</Text>
            <div className="taskhome-stat-value">{completed}</div>
          </div>
          <div className="taskhome-stat-card">
            <Text className="taskhome-stat-label">本月预计成本</Text>
            <div className="taskhome-stat-value" style={{ fontSize: 24 }}>
              {formatMoney(monthlyCost?.estimated_cost_high_cny ?? 0, "CNY")}
            </div>
          </div>
        </div>

        {monthlyCost ? (
          <div style={{ marginTop: 14, color: "rgba(71, 85, 105, 0.88)", fontSize: 14, textAlign: "center" }}>
            {monthlyCost.month} 已创建 {monthlyCost.task_count} 个任务，累计约 {monthlyCost.total_llm_tokens} tokens，
            费用区间 {formatMoney(monthlyCost.estimated_cost_low_cny, "CNY")} ~ {formatMoney(monthlyCost.estimated_cost_high_cny, "CNY")}。
          </div>
        ) : null}

        <Space wrap spacing="medium" style={{ marginTop: 26, justifyContent: "center", width: "100%" }}>
          <Button
            theme="solid"
            type="primary"
            size="large"
            icon={<IconArrowRight />}
            onClick={() => nav("/tasks/implementation/new")}
            style={{
              height: 48,
              paddingInline: 22,
              borderRadius: 999,
              background: "linear-gradient(90deg, #20d2cc, #2c7ef8)",
              border: "none",
              boxShadow: "0 14px 28px rgba(35, 157, 226, 0.35)",
            }}
          >
            新建实施方案审核
          </Button>
          <Button
            size="large"
            theme="light"
            type="tertiary"
            onClick={() => nav("/tasks/pre-review/new")}
            style={{
              height: 48,
              paddingInline: 22,
              borderRadius: 999,
              color: "#0f172a",
              background: "rgba(255, 255, 255, 0.82)",
              border: "1px solid rgba(203, 213, 225, 0.92)",
            }}
          >
            新建方案预审
          </Button>
          <Button
            size="large"
            theme="light"
            type="tertiary"
            onClick={() => nav("/methods")}
            style={{
              height: 48,
              paddingInline: 22,
              borderRadius: 999,
              color: "#0f172a",
              background: "rgba(255, 255, 255, 0.82)",
              border: "1px solid rgba(203, 213, 225, 0.92)",
            }}
          >
            配置审查智能体
          </Button>
        </Space>
    </Card>
  );
}
