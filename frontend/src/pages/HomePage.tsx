import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconArrowRight, IconListView } from "@douyinfe/semi-icons";
import { Button, Card, Space, Typography } from "@douyinfe/semi-ui";
import { getMonthlyCostSummary, getReviewTaskMetrics } from "../api";
import type { MonthlyCostSummary } from "../types";
import { pageShellList, secondaryPillButton, techPrimaryButton } from "../theme/pageChrome";

const { Text, Title } = Typography;

export default function HomePage() {
  const nav = useNavigate();
  const [taskMetrics, setTaskMetrics] = useState({ total: 0, in_progress: 0, completed: 0 });
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
      getReviewTaskMetrics().catch(() => ({ total: 0, in_progress: 0, completed: 0 })),
      getMonthlyCostSummary().catch(() => null),
    ]).then(([metrics, monthly]) => {
      setTaskMetrics(metrics);
      setMonthlyCost(monthly);
    });
  }, []);

  return (
    <div className="dashboard-home">
      <Card bordered={false} style={pageShellList} bodyStyle={{ padding: 30 }} className="dashboard-control-card">
        <div className="dashboard-control-head">
          <div>
            <Title heading={2} style={{ margin: "0 0 10px", color: "#111827", letterSpacing: "-0.04em" }}>
              项目评审任务控制台
            </Title>
            <Text style={{ color: "rgba(71, 85, 105, 0.92)", fontSize: 15 }}>
              查看当前任务概况、评审进度与本月模型消耗，直接从这里开始新的审核工作。
            </Text>
          </div>
        </div>

        <div className="dashboard-metrics-grid">
          <div className="dashboard-metric-card">
            <span className="dashboard-metric-label">任务总数</span>
            <strong className="dashboard-metric-value">{taskMetrics.total}</strong>
          </div>
          <div className="dashboard-metric-card">
            <span className="dashboard-metric-label">评审中</span>
            <strong className="dashboard-metric-value">{taskMetrics.in_progress}</strong>
          </div>
          <div className="dashboard-metric-card">
            <span className="dashboard-metric-label">已完成</span>
            <strong className="dashboard-metric-value">{taskMetrics.completed}</strong>
          </div>
          <div className="dashboard-metric-card dashboard-metric-card-accent">
            <span className="dashboard-metric-label">本月预计成本</span>
            <strong className="dashboard-metric-value">
              {formatMoney(monthlyCost?.estimated_cost_high_cny ?? 0, "CNY")}
            </strong>
          </div>
        </div>

        {monthlyCost ? (
          <div className="dashboard-summary-strip">
            <span>{monthlyCost.month}</span>
            <span>已创建 {monthlyCost.task_count} 个任务</span>
            <span>累计约 {monthlyCost.total_llm_tokens} tokens</span>
            <span>
              费用区间 {formatMoney(monthlyCost.estimated_cost_low_cny, "CNY")} ~{" "}
              {formatMoney(monthlyCost.estimated_cost_high_cny, "CNY")}
            </span>
          </div>
        ) : null}

        <Space wrap spacing="medium" className="dashboard-action-row">
          <Button
            theme="solid"
            type="primary"
            size="large"
            icon={<IconArrowRight />}
            onClick={() => nav("/tasks/implementation/new")}
            style={{ ...techPrimaryButton, height: 50, paddingInline: 24 }}
          >
            新建实施方案审核
          </Button>
          <Button
            size="large"
            theme="light"
            type="tertiary"
            icon={<IconListView />}
            onClick={() => nav("/tasks/pre-review/new")}
            style={{ ...secondaryPillButton, height: 50, paddingInline: 24 }}
          >
            新建方案预审
          </Button>
        </Space>
      </Card>
    </div>
  );
}
