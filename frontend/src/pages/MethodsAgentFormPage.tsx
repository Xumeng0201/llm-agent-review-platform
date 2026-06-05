import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Card, Input, Select, Space, Spin, TextArea, Toast, Typography } from "@douyinfe/semi-ui";
import { createAgent, getAgent, updateAgent } from "../api";
import type { LlmProvider } from "../types";
import { pageShellForm, formFieldGridStyle, formFieldLabelStyle, techFieldSurface, techPrimaryButton } from "../theme/pageChrome";
import { RECOMMENDED_ISSUE_REVIEW_PROMPT } from "./agentShared";

const { Title, Text } = Typography;

const alertDanger = {
  padding: "10px 12px",
  borderRadius: 6,
  background: "rgba(80, 22, 26, 0.65)",
  border: "1px solid rgba(255, 122, 122, 0.2)",
  color: "#ffd7d7",
  fontSize: 14,
  width: "100%",
} as const;

const topFieldGridStyle = formFieldGridStyle;

export default function MethodsAgentFormPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const isNew = id == null;

  const [name, setName] = useState("");
  const [provider, setProvider] = useState<LlmProvider>("deepseek");
  const [apiBase, setApiBase] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("deepseek-chat");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [loading, setLoading] = useState(!isNew);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    const agentId = Number(id);
    if (!Number.isFinite(agentId)) {
      Toast.error("无效的智能体 ID");
      nav("/methods", { replace: true });
      return;
    }
    setLoading(true);
    setErr(null);
    getAgent(agentId)
      .then((a) => {
        setName(a.name);
        setProvider(a.provider);
        setApiBase(a.api_base ?? "");
        setModel(a.model);
        setSystemPrompt(a.system_prompt ?? "");
        setApiKey("");
      })
      .catch((e) => {
        Toast.error(e instanceof Error ? e.message : "加载失败");
        nav("/methods", { replace: true });
      })
      .finally(() => setLoading(false));
  }, [id, isNew, nav]);

  useEffect(() => {
    if (!isNew) return;
    if (provider === "deepseek") setModel("deepseek-chat");
    else if (provider === "openai") setModel("gpt-4o-mini");
  }, [provider, isNew]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (isNew) {
        await createAgent({
          name: name.trim(),
          provider,
          api_base: provider === "custom" ? apiBase.trim() || null : null,
          api_key: apiKey,
          model: model.trim(),
          system_prompt: systemPrompt.trim() || null,
        });
        Toast.success("已添加审查智能体");
        nav("/methods");
        return;
      }
      const agentId = Number(id);
      const patch: Parameters<typeof updateAgent>[1] = {
        name: name.trim(),
        provider,
        api_base: provider === "custom" ? apiBase.trim() || null : null,
        model: model.trim(),
        system_prompt: systemPrompt.trim() || null,
      };
      const keyTrim = apiKey.trim();
      if (keyTrim.length > 0) patch.api_key = keyTrim;
      await updateAgent(agentId, patch);
      Toast.success("已保存");
      nav("/methods");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  if (!isNew && loading) {
    return (
      <Card bordered={false} style={pageShellForm} className="tech-enter tech-enter-1" bodyStyle={{ padding: 48 }}>
        <Spin size="large" style={{ display: "block", margin: "0 auto" }} />
      </Card>
    );
  }

  const submitDisabled =
    isNew && (!name.trim() || !apiKey.trim() || !model.trim());

  return (
    <Card
      bordered={false}
      style={{ ...pageShellForm, minHeight: "calc(100vh - 168px)" }}
      className="tech-enter tech-enter-1"
      bodyStyle={{ padding: "clamp(22px, 4vw, 44px)", minHeight: "calc(100vh - 168px)" }}
    >
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
            <Title heading={2} style={{ margin: 0, color: "#0f172a" }}>
              {isNew ? "新增审查智能体" : `编辑审查智能体 · ${name}`}
            </Title>
          </div>

          <Button onClick={() => nav("/methods")} style={{ borderRadius: 999 }}>
            返回列表
          </Button>
        </div>

        {err ? <div style={alertDanger}>{err}</div> : null}

        <form
          onSubmit={(e) => void onSubmit(e)}
          style={{
            display: "flex",
            flexDirection: "column",
            minHeight: "calc(100vh - 290px)",
          }}
        >
          <div
            style={topFieldGridStyle}
          >
            <div>
              <Text strong style={formFieldLabelStyle}>
                显示名称
              </Text>
              <Input value={name} onChange={setName} placeholder="如：DeepSeek 评审" style={techFieldSurface} />
            </div>
            <div>
              <Text strong style={{ display: "block", marginBottom: 8 }}>
                提供方
              </Text>
              <Select
                value={provider}
                onChange={(v) => setProvider(v as LlmProvider)}
                className="taskhome-filter-select"
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
                style={techFieldSurface}
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
                  style={techFieldSurface}
                />
              </div>
            ) : null}
            <div style={{ gridColumn: "1 / -1" }}>
              <Text strong style={{ display: "block", marginBottom: 8 }}>
                API Key{isNew ? "" : "（可选）"}
              </Text>
              <Input
                mode="password"
                value={apiKey}
                onChange={setApiKey}
                placeholder={isNew ? "sk-…" : "留空则不修改"}
                autoComplete="off"
                style={techFieldSurface}
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <Text strong style={{ display: "block", marginBottom: 8 }}>
                角色与审查口径（可选，system 提示词）
              </Text>
              <TextArea
                value={systemPrompt}
                onChange={setSystemPrompt}
                placeholder="例如：你负责政企大模型项目方案审查，重点关注数据合规、安全边界、验收可操作性；材料缺失时明确写“未见材料说明”。"
                rows={16}
                style={{
                  ...techFieldSurface,
                  fontSize: 12,
                  borderRadius: 6,
                  minHeight: "min(50vh, 460px)",
                }}
              />
              <Space style={{ marginTop: 10 }}>
                <Button theme="light" type="tertiary" onClick={() => setSystemPrompt(RECOMMENDED_ISSUE_REVIEW_PROMPT)}>
                  填入推荐提示词
                </Button>
              </Space>
            </div>
          </div>

          <div
            style={{
              marginTop: "auto",
              paddingTop: 28,
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <Button
              htmlType="submit"
              theme="solid"
              type="primary"
              loading={busy}
              disabled={submitDisabled}
              style={techPrimaryButton}
            >
              {isNew ? "新增审查智能体" : "保存更改"}
            </Button>
          </div>
        </form>
      </Space>
    </Card>
  );
}
