import { useEffect, useState } from "react";
import { IconEditStroked, IconDeleteStroked } from "@douyinfe/semi-icons";
import {
  Button,
  Card,
  Input,
  Select,
  Space,
  Spin,
  Table,
  TextArea,
  Typography,
} from "@douyinfe/semi-ui";
import { createAgent, deleteAgent, listAgents, updateAgent } from "../api";
import type { LlmAgent, LlmProvider } from "../types";

const { Title, Paragraph, Text } = Typography;

const providerLabel: Record<LlmProvider, string> = {
  deepseek: "DeepSeek",
  openai: "OpenAI",
  custom: "自定义（OpenAI 兼容）",
};

const RECOMMENDED_ISSUE_REVIEW_PROMPT = `你是一名政府和大型企事业单位项目方案审查专家，负责审查大模型、智能体类项目方案。

你的工作目标不是给方案打分，而是输出“问题清单”和“整改建议”。请始终坚持以下口径：
1. 只指出问题，不主动输出总分、分数、通过率或评分制结论。
2. 必须依据证据判断；材料未体现时，只能写“未见材料说明”，不能主观脑补。
3. 问题必须分为：严重问题、一般问题、轻微问题。
4. 严重问题仅用于合规、安全、数据治理、可实施性、验收机制等会显著影响项目推进的重大缺口。
5. 一般问题用于关键论证不足、机制不完整、支撑材料不充分。
6. 轻微问题用于表述、结构、术语、细节完整性方面的问题。
7. 整改建议必须具体、克制、可执行，优先写“应补充什么材料、补足什么机制、澄清什么边界”。
8. 语气保持专业、审慎、书面化，不夸张，不泛泛而谈。

如果系统已经给出审查维度、重点关注项、严重/一般/轻微问题参考规则，你必须优先服从这些系统约束。你的任务是沿着这些维度发现问题，而不是另起一套评价体系。`;

export default function MethodsPage() {
  const [agents, setAgents] = useState<LlmAgent[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<LlmProvider>("deepseek");
  const [apiBase, setApiBase] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("deepseek-chat");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      setAgents(await listAgents());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (provider === "deepseek") setModel("deepseek-chat");
    else if (provider === "openai") setModel("gpt-4o-mini");
  }, [provider]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
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
      setName("");
      setApiKey("");
      setSystemPrompt("");
      setMsg("已添加审查智能体。");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: number, n: string) {
    if (!confirm(`删除智能体「${n}」？`)) return;
    setErr(null);
    try {
      await deleteAgent(id);
      await load();
      setMsg("已删除。");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "删除失败");
    }
  }

  function openEditPrompt(a: LlmAgent) {
    setEditId(a.id);
    setEditPrompt(a.system_prompt ?? "");
    setErr(null);
  }

  async function saveEditPrompt() {
    if (editId == null) return;
    setEditBusy(true);
    setErr(null);
    try {
      await updateAgent(editId, { system_prompt: editPrompt.trim() || null });
      setEditId(null);
      setMsg("已保存该智能体的提示词。");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setEditBusy(false);
    }
  }

  function applyRecommendedPromptForCreate() {
    setSystemPrompt(RECOMMENDED_ISSUE_REVIEW_PROMPT);
    setMsg("已填入推荐的问题审查提示词模板。");
  }

  function applyRecommendedPromptForEdit() {
    setEditPrompt(RECOMMENDED_ISSUE_REVIEW_PROMPT);
    setMsg("已填入推荐的问题审查提示词模板。");
  }

  const columns = [
    {
      title: "名称",
      dataIndex: "name",
      key: "name",
      render: (text: string) => (
        <Text strong style={{ color: "#0f172a" }}>
          {text}
        </Text>
      ),
    },
    {
      title: "提供方",
      dataIndex: "provider",
      key: "provider",
      width: 160,
      render: (p: LlmProvider) => (
        <Text style={{ color: "rgba(51, 65, 85, 0.9)" }}>{providerLabel[p]}</Text>
      ),
    },
    {
      title: "模型",
      dataIndex: "model",
      key: "model",
      render: (m: string) => (
        <span style={{ fontFamily: "monospace", fontSize: 12, color: "rgba(51, 65, 85, 0.84)" }}>
          {m}
        </span>
      ),
    },
    {
      title: "提示词",
      key: "prompt",
      width: 100,
      render: (_: unknown, r: LlmAgent) => (
        <Text size="small" style={{ color: "rgba(71, 85, 105, 0.86)" }}>
          {(r.system_prompt ?? "").trim() ? "已自定义" : "默认角色"}
        </Text>
      ),
    },
    {
      title: "Key",
      dataIndex: "key_hint",
      key: "key_hint",
      render: (h: string) => (
        <Text
          size="small"
          style={{ fontFamily: "monospace", color: "rgba(51, 65, 85, 0.84)" }}
        >
          {h}
        </Text>
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: 120,
      align: "center" as const,
      render: (_: unknown, a: LlmAgent) => (
        <Space spacing={4}>
          <Button
            icon={<IconEditStroked />}
            theme="borderless"
            type="tertiary"
            aria-label="编辑提示词"
            onClick={() => openEditPrompt(a)}
          />
          <Button
            icon={<IconDeleteStroked />}
            theme="borderless"
            type="danger"
            onClick={() => void onDelete(a.id, a.name)}
          />
        </Space>
      ),
    },
  ];

  const fullWidthCard = { width: "100%" as const };

  return (
    <Space
      vertical
      spacing="loose"
      style={{ width: "100%", alignItems: "stretch" }}
    >
      <Card
        bordered={false}
        style={fullWidthCard}
        className="tech-enter tech-enter-1"
        title={<Title heading={5} style={{ color: "#0f172a" }}>智能体配置 · 审查智能体</Title>}
        headerLine={false}
        bodyStyle={{
          padding: "24px",
          background:
            "radial-gradient(circle at top left, rgba(56, 189, 248, 0.14), transparent 24%), linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(247, 248, 255, 0.88))",
          borderRadius: 24,
          border: "1px solid rgba(255, 255, 255, 0.9)",
        }}
      >
        <Paragraph style={{ marginBottom: 20, color: "rgba(51, 65, 85, 0.88)" }}>
          配置多家大模型（DeepSeek、OpenAI 或任意 OpenAI 兼容接口）。API Key
          仅存于本机数据库，请勿在生产环境明文存储敏感密钥。可在下方填写「角色与审查口径」提示词；留空则使用内置问题审查专家角色。这里更推荐你约束“审查口径、问题严重程度、证据原则”，而不是去定义输出格式，因为输出 JSON 结构和审查维度会由系统硬性控制。
        </Paragraph>
        <form onSubmit={(e) => void onCreate(e)}>
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
              <Input
                value={name}
                onChange={setName}
                placeholder="如：DeepSeek 评审"
                style={techInputStyle}
              />
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
                rows={8}
                style={{ ...techInputStyle, fontFamily: "monospace", fontSize: 12 }}
              />
              <Space style={{ marginTop: 10 }}>
                <Button theme="light" type="tertiary" onClick={applyRecommendedPromptForCreate}>
                  填入推荐提示词
                </Button>
              </Space>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <Button
              htmlType="submit"
                theme="solid"
                type="primary"
                loading={busy}
                style={techPrimaryBtn}
              >
              添加审查智能体
              </Button>
            </div>
          </div>
        </form>
      </Card>

      {err ? (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 6,
            background: "rgba(80, 22, 26, 0.65)",
            border: "1px solid rgba(255, 122, 122, 0.2)",
            color: "#ffd7d7",
            fontSize: 14,
            width: "100%",
          }}
        >
          {err}
        </div>
      ) : null}
      {msg ? (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 6,
            background: "rgba(18, 74, 57, 0.58)",
            border: "1px solid rgba(147, 251, 207, 0.18)",
            color: "#d8ffea",
            fontSize: 14,
            width: "100%",
          }}
        >
          {msg}
        </div>
      ) : null}

      {editId != null ? (
        <Card
          bordered={false}
          style={fullWidthCard}
          className="tech-enter tech-enter-2"
        title={<Title heading={6} style={{ color: "#0f172a" }}>编辑提示词</Title>}
          headerLine={false}
          bodyStyle={{
            padding: 24,
            background: "linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(247, 248, 255, 0.88))",
            borderRadius: 24,
            border: "1px solid rgba(255, 255, 255, 0.9)",
          }}
        >
          <Paragraph size="small" style={{ marginTop: -8, color: "rgba(71, 85, 105, 0.86)" }}>
            正在编辑 ID {editId} 的智能体。保存后，新的问题审查流也会使用这段提示词；系统仍会额外附加当前审查维度和输出格式约束。
          </Paragraph>
          <TextArea
            value={editPrompt}
            onChange={setEditPrompt}
            rows={10}
            style={{ ...techInputStyle, fontFamily: "monospace", fontSize: 12, marginBottom: 12 }}
            placeholder="角色、审查口径、风险偏好、材料缺失时的判断原则…"
          />
          <Space>
            <Button theme="light" type="tertiary" onClick={applyRecommendedPromptForEdit}>
              填入推荐提示词
            </Button>
            <Button
              theme="solid"
              type="primary"
              loading={editBusy}
              onClick={() => void saveEditPrompt()}
              style={techPrimaryBtn}
            >
              保存
            </Button>
            <Button disabled={editBusy} onClick={() => setEditId(null)}>
              取消
            </Button>
          </Space>
        </Card>
      ) : null}

      <Card
        bordered={false}
        style={fullWidthCard}
        className="tech-enter tech-enter-3"
        title={<Title heading={6} style={{ color: "#0f172a" }}>已配置智能体</Title>}
        headerLine={false}
        bodyStyle={{
          padding: loading ? 24 : agents.length ? 0 : 24,
          width: "100%",
          background: "linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(247, 248, 255, 0.88))",
          borderRadius: 24,
          border: "1px solid rgba(255, 255, 255, 0.9)",
        }}
      >
        {loading ? (
          <Spin size="large" style={{ display: "block", margin: "24px auto" }} />
        ) : agents.length === 0 ? (
          <Text style={{ color: "rgba(71, 85, 105, 0.86)" }}>暂无配置，请在上方添加。</Text>
        ) : (
          <Table
            className="taskhome-table"
            columns={columns}
            dataSource={agents.map((a) => ({ ...a, key: a.id }))}
            pagination={false}
            size="small"
            style={{ width: "100%" }}
          />
        )}
      </Card>
    </Space>
  );
}

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
