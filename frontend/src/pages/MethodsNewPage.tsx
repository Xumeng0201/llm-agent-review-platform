import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Input, Select, Space, TextArea, Typography } from "@douyinfe/semi-ui";
import { createAgent } from "../api";
import type { LlmProvider } from "../types";
import { RECOMMENDED_ISSUE_REVIEW_PROMPT } from "./agentShared";

const { Title, Paragraph, Text } = Typography;

export default function MethodsNewPage() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<LlmProvider>("deepseek");
  const [apiBase, setApiBase] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("deepseek-chat");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (provider === "deepseek") setModel("deepseek-chat");
    else if (provider === "openai") setModel("gpt-4o-mini");
  }, [provider]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await createAgent({
        name: name.trim(),
        provider,
        api_base: provider === "custom" ? apiBase.trim() || null : null,
        api_key: apiKey,
        model: model.trim(),
        system_prompt: systemPrompt.trim() || null,
      });
      nav("/methods");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "创建失败");
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
              CREATE REVIEW AGENT
            </Text>
            <Title heading={2} style={{ margin: "8px 0 10px", color: "#0f172a" }}>
              新增审核智能体
            </Title>
            <Paragraph style={{ color: "rgba(51, 65, 85, 0.88)", margin: 0, lineHeight: 1.85 }}>
              配置模型提供方、模型名、密钥和审查口径提示词。创建完成后，这个智能体就可以在评审任务中绑定使用。
            </Paragraph>
          </div>

          <Button onClick={() => nav("/methods")} style={{ borderRadius: 999 }}>
            返回列表
          </Button>
        </div>

        {err ? <div style={alertDanger}>{err}</div> : null}

        <form onSubmit={(e) => void onSubmit(e)}>
          <div
            style={{
              display: "grid",
              gap: 16,
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            }}
          >
            <div>
              <Text strong style={{ display: "block", marginBottom: 8 }}>
                显示名称
              </Text>
              <Input value={name} onChange={setName} placeholder="如：DeepSeek 评审" style={techInputStyle} />
            </div>
            <div>
              <Text strong style={{ display: "block", marginBottom: 8 }}>
                提供方
              </Text>
              <Select
                value={provider}
                onChange={(v) => setProvider(v as LlmProvider)}
                style={{ width: "100%" }}
                optionList={[
                  { label: "DeepSeek", value: "deepseek" },
                  { label: "OpenAI", value: "openai" },
                  { label: "自定义 Base", value: "custom" },
                ]}
              />
            </div>
            <div>
              <Text strong style={{ display: "block", marginBottom: 8 }}>
                模型名
              </Text>
              <Input
                value={model}
                onChange={setModel}
                placeholder="deepseek-chat / gpt-4o-mini"
                style={techInputStyle}
              />
            </div>
            {provider === "custom" ? (
              <div style={{ gridColumn: "1 / -1" }}>
                <Text strong style={{ display: "block", marginBottom: 8 }}>
                  API Base URL
                </Text>
                <Input
                  value={apiBase}
                  onChange={setApiBase}
                  placeholder="https://api.example.com/v1"
                  style={techInputStyle}
                />
              </div>
            ) : null}
            <div style={{ gridColumn: "1 / -1" }}>
              <Text strong style={{ display: "block", marginBottom: 8 }}>
                API Key
              </Text>
              <Input
                mode="password"
                value={apiKey}
                onChange={setApiKey}
                placeholder="sk-…"
                autoComplete="off"
                style={techInputStyle}
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <Text strong style={{ display: "block", marginBottom: 8 }}>
                角色与审查口径（可选，system 提示词）
              </Text>
              <Paragraph size="small" style={{ margin: "0 0 8px", color: "rgba(71, 85, 105, 0.86)" }}>
                建议写“你是谁、偏重哪些风险、遇到材料缺失时如何判断”，不要再要求模型输出分数或自己定义 JSON 格式。
              </Paragraph>
              <TextArea
                value={systemPrompt}
                onChange={setSystemPrompt}
                placeholder="例如：你负责政企大模型项目方案审查，重点关注数据合规、安全边界、验收可操作性；材料缺失时明确写“未见材料说明”。"
                rows={10}
                style={{ ...techInputStyle, fontFamily: "monospace", fontSize: 12 }}
              />
              <Space style={{ marginTop: 10 }}>
                <Button
                  theme="light"
                  type="tertiary"
                  onClick={() => setSystemPrompt(RECOMMENDED_ISSUE_REVIEW_PROMPT)}
                >
                  填入推荐提示词
                </Button>
              </Space>
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
            <Paragraph style={{ margin: 0, color: "rgba(71, 85, 105, 0.86)" }}>
              创建后可在评审任务中直接绑定使用。
            </Paragraph>
            <Button htmlType="submit" theme="solid" type="primary" loading={busy} style={techPrimaryBtn}>
              新增审核智能体
            </Button>
          </div>
        </form>
      </Space>
    </Card>
  );
}

const pageShell = {
  width: "100%",
  borderRadius: 26,
  border: "1px solid rgba(255, 255, 255, 0.9)",
  background:
    "radial-gradient(circle at top left, rgba(56, 189, 248, 0.14), transparent 24%), linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(247, 248, 255, 0.88))",
  boxShadow: "0 24px 60px rgba(111, 123, 168, 0.14)",
} as const;

const techInputStyle = {
  background: "rgba(255, 255, 255, 0.9)",
  border: "1px solid rgba(203, 213, 225, 0.9)",
  color: "#0f172a",
} as const;

const techPrimaryBtn = {
  borderRadius: 999,
  background: "linear-gradient(90deg, #20d2cc, #2c7ef8)",
  border: "none",
  boxShadow: "0 12px 28px rgba(35, 157, 226, 0.28)",
} as const;

const alertDanger = {
  padding: "10px 12px",
  borderRadius: 6,
  background: "rgba(80, 22, 26, 0.65)",
  border: "1px solid rgba(255, 122, 122, 0.2)",
  color: "#ffd7d7",
  fontSize: 14,
  width: "100%",
} as const;
