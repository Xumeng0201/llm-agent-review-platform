import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconArrowRight, IconList, IconPulse, IconSetting } from "@douyinfe/semi-icons";
import { Button, Card, Input, Select, Space, Typography } from "@douyinfe/semi-ui";
import { createTask, listAgents, listReviewProjects } from "../api";
import type { LlmAgent, ReviewPhase, ReviewProject } from "../types";

const { Title, Paragraph, Text } = Typography;

const pageShell = {
  width: "100%",
  borderRadius: 26,
  border: "1px solid rgba(255, 255, 255, 0.9)",
  background:
    "radial-gradient(circle at top left, rgba(56, 189, 248, 0.14), transparent 24%), linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(247, 248, 255, 0.88))",
  boxShadow: "0 24px 60px rgba(111, 123, 168, 0.14)",
} as const;

export default function TaskNew({ phase }: { phase: ReviewPhase }) {
  const nav = useNavigate();
  const phaseTitle = phase === "pre_review" ? "方案预审" : "实施方案审核";
  const [name, setName] = useState("");
  const [agents, setAgents] = useState<LlmAgent[]>([]);
  const [projects, setProjects] = useState<ReviewProject[]>([]);
  const [projectId, setProjectId] = useState<string | number | undefined>(undefined);
  const [agentId, setAgentId] = useState<string | number | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void listAgents()
      .then((rows) => {
        setAgents(rows);
        if (rows.length > 0) {
          setAgentId((current) => (current == null || current === "" ? rows[0].id : current));
        }
      })
      .catch(() => {});
    void listReviewProjects()
      .then(setProjects)
      .catch(() => {});
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const t = await createTask({
        name: name.trim(),
        phase,
        project_id:
          projectId != null && projectId !== "" ? Number(projectId) : undefined,
        llm_agent_id:
          agentId != null && agentId !== "" ? Number(agentId) : undefined,
      });
      nav(`/tasks/${t.id}/materials`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card bordered={false} style={pageShell} className="tech-enter tech-enter-1" bodyStyle={{ padding: "clamp(22px, 4vw, 44px)" }}>
      <Space vertical spacing="loose" style={{ width: "100%", alignItems: "stretch" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            gap: 20,
            alignItems: "flex-start",
          }}
        >
          <div style={{ maxWidth: 760 }}>
            <Text style={{ color: "#0ea5a4", letterSpacing: "0.14em", fontSize: 12 }}>
              CREATE REVIEW JOB
            </Text>
            <Title heading={2} style={{ margin: "8px 0 10px", color: "#0f172a" }}>
              新建{phaseTitle}任务
            </Title>
            <Paragraph style={{ color: "rgba(51, 65, 85, 0.88)", margin: 0, lineHeight: 1.85 }}>
              创建后上传材料并解析；AI 问题清单仅供参考，「通过」结论以人工认定为准。新任务将绑定当前阶段最新上传的审核要点版本（若有）。
            </Paragraph>
          </div>

          <div
            style={{
              minWidth: 260,
              padding: 18,
              borderRadius: 20,
              border: "1px solid rgba(226, 232, 240, 0.95)",
              background: "rgba(255, 255, 255, 0.78)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.72)",
            }}
          >
            <Text style={{ color: "#2563eb", letterSpacing: "0.12em", fontSize: 12 }}>PIPELINE</Text>
            <Space vertical spacing="medium" style={{ marginTop: 14, alignItems: "stretch" }}>
              {[
                { icon: <IconList />, text: "创建任务" },
                { icon: <IconSetting />, text: "绑定审查智能体" },
                { icon: <IconPulse />, text: "上传材料后自动解析并审查" },
              ].map((item) => (
                <div key={item.text} style={{ display: "flex", gap: 10, alignItems: "center", color: "#334155" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      width: 32,
                      height: 32,
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 10,
                      background: "linear-gradient(180deg, rgba(34,211,238,0.16), rgba(59,130,246,0.14))",
                      color: "#2563eb",
                    }}
                  >
                    {item.icon}
                  </span>
                  <span>{item.text}</span>
                </div>
              ))}
            </Space>
          </div>
        </div>

        {err ? (
          <div className="tech-alert tech-alert-danger" role="alert">
            {err}
          </div>
        ) : null}

        <form onSubmit={(e) => void onSubmit(e)}>
          <div className="tech-form-grid">
            <div className="tech-form-field tech-form-field-span2">
              <Text className="tech-form-label">任务名称</Text>
              <Input
                value={name}
                onChange={setName}
                placeholder="例如：XX 单位智能客服建设方案评审"
                autoFocus
                size="large"
                style={techInputStyle}
              />
            </div>

            <div className="tech-form-field tech-form-field-span2">
              <Text className="tech-form-label">关联申报项目（可选）</Text>
              <Select
                className="tech-select"
                placeholder="不关联则仅本任务独立归档"
                value={projectId}
                onChange={(v) => setProjectId(v as string | number | undefined)}
                style={{ width: "100%" }}
                size="large"
                optionList={[
                  { label: "不关联", value: "" },
                  ...projects.map((p) => ({
                    label: p.unit_name ? `${p.name}（${p.unit_name}）` : p.name,
                    value: p.id,
                  })),
                ]}
                showClear
              />
              <Paragraph style={{ margin: "8px 0 0", color: "rgba(71, 85, 105, 0.86)" }}>
                同一项目可有多条实施方案任务；预审与实施可不设先后限制。
              </Paragraph>
            </div>

            <div className="tech-form-field tech-form-field-span2">
              <Text className="tech-form-label">默认审查智能体</Text>
              <Select
                className="tech-select"
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
              <Paragraph style={{ margin: "8px 0 0", color: "rgba(71, 85, 105, 0.86)" }}>
                {agents.length > 0 ? "已默认选中默认版智能体。" : "请先配置智能体。"}
              </Paragraph>
            </div>
          </div>

          <div
            style={{
              marginTop: 28,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <Paragraph style={{ margin: 0, color: "rgba(71, 85, 105, 0.86)" }}>创建后进入上传材料，上传后会自动解析。</Paragraph>
            <Button
              htmlType="submit"
              theme="solid"
              type="primary"
              size="large"
              icon={<IconArrowRight />}
              loading={busy}
              disabled={!name.trim()}
              style={techPrimaryBtn}
            >
              创建任务并继续
            </Button>
          </div>
        </form>
      </Space>
    </Card>
  );
}

const techInputStyle = {
  background: "rgba(255, 255, 255, 0.9)",
  border: "1px solid rgba(203, 213, 225, 0.95)",
  color: "#0f172a",
} as const;

const techPrimaryBtn = {
  borderRadius: 999,
  background: "linear-gradient(90deg, #20d2cc, #2c7ef8)",
  border: "none",
  boxShadow: "0 12px 28px rgba(35, 157, 226, 0.28)",
} as const;
