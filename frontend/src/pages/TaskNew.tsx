import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createTask, listAgents } from "../api";
import type { LlmAgent } from "../types";
import { Button, Card, Input, Select, Typography } from "@douyinfe/semi-ui";

const { Title, Paragraph, Text } = Typography;

export default function TaskNew() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [agents, setAgents] = useState<LlmAgent[]>([]);
  const [agentId, setAgentId] = useState<string | number | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void listAgents().then(setAgents).catch(() => {});
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const t = await createTask({
        name: name.trim(),
        llm_agent_id:
          agentId != null && agentId !== "" ? Number(agentId) : undefined,
      });
      nav(`/tasks/${t.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      bordered
      shadows="hover"
      style={{ width: "100%" }}
      title={<Title heading={4}>新建评审任务</Title>}
      bodyStyle={{
        padding: "clamp(24px, 4vw, 40px) clamp(20px, 5vw, 48px) clamp(28px, 5vw, 48px)",
      }}
    >
      <Paragraph type="secondary" style={{ marginBottom: 24, maxWidth: 720 }}>
        请输入任务名称；可选绑定默认「测评智能体」，在分项打分时一键生成 AI
        建议（需先在「测评方法」中配置 Key）。
      </Paragraph>
      {err ? (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 12px",
            borderRadius: 6,
            background: "rgba(var(--semi-red-0), 1)",
            border: "1px solid rgba(var(--semi-red-2), 1)",
            color: "rgba(var(--semi-red-9), 1)",
            fontSize: 14,
          }}
          role="alert"
        >
          {err}
        </div>
      ) : null}
      <form onSubmit={(e) => void onSubmit(e)}>
        <div style={{ marginBottom: 20 }}>
          <Text strong style={{ display: "block", marginBottom: 8 }}>
            任务名称
          </Text>
          <Input
            value={name}
            onChange={setName}
            placeholder="例如：XX 单位大模型客服建设方案评审"
            autoFocus
            size="large"
          />
        </div>
        <div style={{ marginBottom: 28 }}>
          <Text strong style={{ display: "block", marginBottom: 8 }}>
            默认测评智能体（可选）
          </Text>
          <Select
            placeholder="暂不绑定"
            value={agentId}
            onChange={(v) => setAgentId(v as string | number | undefined)}
            style={{ width: "100%" }}
            size="large"
            optionList={[
              { label: "暂不绑定", value: "" },
              ...agents.map((a) => ({
                label: `${a.name}（${a.model}）`,
                value: a.id,
              })),
            ]}
            showClear
          />
        </div>
        <Button
          htmlType="submit"
          theme="solid"
          type="primary"
          size="large"
          loading={busy}
          disabled={!name.trim()}
        >
          创建任务
        </Button>
      </form>
    </Card>
  );
}
