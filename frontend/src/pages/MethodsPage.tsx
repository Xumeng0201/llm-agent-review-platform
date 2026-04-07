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
      setMsg("已添加测评智能体。");
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

  const columns = [
    { title: "名称", dataIndex: "name", key: "name" },
    {
      title: "提供方",
      dataIndex: "provider",
      key: "provider",
      width: 160,
      render: (p: LlmProvider) => providerLabel[p],
    },
    {
      title: "模型",
      dataIndex: "model",
      key: "model",
      render: (m: string) => (
        <span style={{ fontFamily: "monospace", fontSize: 12 }}>{m}</span>
      ),
    },
    {
      title: "提示词",
      key: "prompt",
      width: 100,
      render: (_: unknown, r: LlmAgent) => (
        <Text type="tertiary" size="small">
          {(r.system_prompt ?? "").trim() ? "已自定义" : "默认角色"}
        </Text>
      ),
    },
    {
      title: "Key",
      dataIndex: "key_hint",
      key: "key_hint",
      render: (h: string) => (
        <Text type="tertiary" size="small" style={{ fontFamily: "monospace" }}>
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
        bordered
        shadows="hover"
        style={fullWidthCard}
        title={<Title heading={5}>测评方法 · 测评智能体</Title>}
      >
        <Paragraph type="secondary" style={{ marginBottom: 20 }}>
          配置多家大模型（DeepSeek、OpenAI 或任意 OpenAI 兼容接口）。API Key
          仅存于本机数据库，请勿在生产环境明文存储敏感密钥。可在下方填写「角色与评审要求」提示词；留空则使用内置评审专家角色。智能体可生成分项建议或完整评审报告（含分项意见），最终结论建议人工复核。
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
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <Text strong style={{ display: "block", marginBottom: 8 }}>
                角色与评审要求（可选，system 提示词）
              </Text>
              <TextArea
                value={systemPrompt}
                onChange={setSystemPrompt}
                placeholder="例如：你负责某市政务云项目方案评审，侧重数据主权与等保合规；语气正式、结论明确。"
                rows={4}
                style={{ fontFamily: "monospace", fontSize: 12 }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <Button
                htmlType="submit"
                theme="solid"
                type="primary"
                loading={busy}
              >
                添加智能体
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
            background: "rgba(var(--semi-red-0), 1)",
            border: "1px solid rgba(var(--semi-red-2), 1)",
            color: "rgba(var(--semi-red-9), 1)",
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
            background: "rgba(var(--semi-green-0), 1)",
            border: "1px solid rgba(var(--semi-green-2), 1)",
            color: "rgba(var(--semi-green-9), 1)",
            fontSize: 14,
            width: "100%",
          }}
        >
          {msg}
        </div>
      ) : null}

      {editId != null ? (
        <Card
          bordered
          shadows="hover"
          style={fullWidthCard}
          title={<Title heading={6}>编辑提示词</Title>}
        >
          <Paragraph type="tertiary" size="small" style={{ marginTop: -8 }}>
            正在编辑 ID {editId} 的智能体。保存后，后续「打分建议」与「完整评审报告」均会附带此说明（输出格式仍由系统约束）。
          </Paragraph>
          <TextArea
            value={editPrompt}
            onChange={setEditPrompt}
            rows={6}
            style={{ fontFamily: "monospace", fontSize: 12, marginBottom: 12 }}
            placeholder="角色、侧重点、行业要求…"
          />
          <Space>
            <Button
              theme="solid"
              type="primary"
              loading={editBusy}
              onClick={() => void saveEditPrompt()}
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
        bordered
        shadows="hover"
        style={fullWidthCard}
        title={<Title heading={6}>已配置智能体</Title>}
        bodyStyle={{
          padding: loading ? 24 : agents.length ? 0 : 24,
          width: "100%",
        }}
      >
        {loading ? (
          <Spin size="large" style={{ display: "block", margin: "24px auto" }} />
        ) : agents.length === 0 ? (
          <Text type="tertiary">暂无配置，请在上方添加。</Text>
        ) : (
          <Table
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
