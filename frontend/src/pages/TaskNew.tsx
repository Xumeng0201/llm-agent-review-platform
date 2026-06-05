import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconArrowRight } from "@douyinfe/semi-icons";
import { Button, Card, Input, Select, Space, TextArea, Typography } from "@douyinfe/semi-ui";
import { createTask, listAgents, updateTask, uploadAttachment } from "../api";
import type { LlmAgent, ReviewPhase } from "../types";
import { pageShellForm, formFieldGridStyle, formFieldLabelStyle, formFieldPairGridStyle, formFieldSpanAll, formFieldSurface, techPrimaryButton } from "../theme/pageChrome";
import { parseProjectIdentity } from "../utils/projectIdentity";

const { Title, Text } = Typography;

function isDocxFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".docx");
}

export default function TaskNew({ phase }: { phase: ReviewPhase }) {
  const nav = useNavigate();
  const phaseTitle = phase === "pre_review" ? "方案预审" : "实施方案审核";
  const [name, setName] = useState("");
  const [projectKey, setProjectKey] = useState("");
  const [version, setVersion] = useState("");
  const projectKeyTouched = useRef(false);
  const versionTouched = useRef(false);
  const [agents, setAgents] = useState<LlmAgent[]>([]);
  const [agentId, setAgentId] = useState<string | number | undefined>(undefined);
  const [proposalDraft, setProposalDraft] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void listAgents({ page: 1, page_size: 200 })
      .then((body) => {
        const rows = body.items;
        setAgents(rows);
        if (rows.length > 0) {
          setAgentId((current) => (current == null || current === "" ? rows[0].id : current));
        }
      })
      .catch(() => {});
  }, []);

  function applyParsedFromName(nextName: string) {
    const parsed = parseProjectIdentity(nextName);
    if (!projectKeyTouched.current && parsed.project_key) {
      setProjectKey(parsed.project_key);
    }
    if (!versionTouched.current && parsed.version) {
      setVersion(parsed.version);
    }
  }

  function onNameChange(next: string) {
    setName(next);
    applyParsedFromName(next);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const trimmedName = name.trim();
      const t = await createTask({
        name: trimmedName,
        project_key: projectKey.trim() || null,
        version: version.trim() || null,
        phase,
        llm_agent_id:
          agentId != null && agentId !== "" ? Number(agentId) : undefined,
      });
      if (proposalDraft.trim()) {
        await updateTask(t.id, { proposal_body: proposalDraft.trim() });
      }
      for (const file of selectedFiles) {
        await uploadAttachment(t.id, file, "项目方案");
      }
      nav(`/tasks/${t.id}/materials`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    name.trim().length > 0 &&
    projectKey.trim().length > 0 &&
    (selectedFiles.length > 0 || proposalDraft.trim().length > 0);

  return (
    <Card bordered={false} style={pageShellForm} className="tech-enter tech-enter-1 page-shell-form" bodyStyle={{ padding: "clamp(22px, 4vw, 44px)" }}>
      <Space vertical spacing="loose" style={{ width: "100%", alignItems: "stretch" }}>
        <TaskNewHeader phaseTitle={phaseTitle} />

        {err ? (
          <TaskNewAlert>{err}</TaskNewAlert>
        ) : null}

        <form onSubmit={(e) => void onSubmit(e)}>
          <div style={formFieldGridStyle}>
            <div style={formFieldSpanAll}>
              <Text strong style={formFieldLabelStyle}>
                任务名称
              </Text>
              <Input
                value={name}
                onChange={onNameChange}
                placeholder="例如：人才项目0512"
                autoFocus
                style={formFieldSurface}
              />
            </div>

            <ProjectIdentityFields
              projectKey={projectKey}
              version={version}
              onProjectKeyChange={(v: string) => {
                projectKeyTouched.current = true;
                setProjectKey(v);
              }}
              onVersionChange={(v: string) => {
                versionTouched.current = true;
                setVersion(v);
              }}
            />

            <AgentSelectField agents={agents} agentId={agentId} onAgentIdChange={setAgentId} />

            <div style={formFieldSpanAll}>
              <Text strong style={formFieldLabelStyle}>
                上传方案文件
              </Text>
              <TaskFilePicker
                files={selectedFiles}
                onAddFiles={(files) => {
                  if (!files.length) return;
                  setSelectedFiles((current) => {
                    const next = [...current];
                    for (const file of files) {
                      if (!next.some((item) => item.name === file.name && item.size === file.size)) {
                        next.push(file);
                      }
                    }
                    return next;
                  });
                }}
                onRemoveFile={(nameToRemove) =>
                  setSelectedFiles((current) =>
                    current.filter((file) => file.name !== nameToRemove)
                  )
                }
              />
            </div>

            <div style={formFieldSpanAll}>
              <Text strong style={formFieldLabelStyle}>
                项目背景说明
              </Text>
              <TextArea
                className="taskdetail-proposal-textarea"
                value={proposalDraft}
                onChange={setProposalDraft}
                rows={7}
                placeholder="补充项目背景、客户目标、建设范围、已知约束…"
                style={formFieldSurface}
              />
            </div>
          </div>

          <TaskNewSubmitRow busy={busy} canSubmit={canSubmit} />
        </form>
      </Space>
    </Card>
  );
}

function TaskNewHeader({ phaseTitle }: { phaseTitle: string }) {
  return (
    <div>
      <Title heading={2} style={{ margin: 0, color: "#0f172a" }}>
        新建{phaseTitle}任务
      </Title>
    </div>
  );
}

function TaskNewAlert({ children }: { children: React.ReactNode }) {
  return (
    <div className="tech-alert tech-alert-danger" role="alert">
      {children}
    </div>
  );
}

function ProjectIdentityFields(props: {
  projectKey: string;
  version: string;
  onProjectKeyChange: (v: string) => void;
  onVersionChange: (v: string) => void;
}) {
  return (
    <div style={formFieldPairGridStyle}>
      <div>
        <Text strong style={formFieldLabelStyle}>
          项目名称
        </Text>
        <Input
          value={props.projectKey}
          onChange={props.onProjectKeyChange}
          placeholder="例如：人才项目"
          style={{ ...formFieldSurface, width: "100%" }}
        />
      </div>

      <div>
        <Text strong style={formFieldLabelStyle}>
          版本
        </Text>
        <Input
          value={props.version}
          onChange={props.onVersionChange}
          placeholder="例如：0512（可留空）"
          style={{ ...formFieldSurface, width: "100%" }}
        />
      </div>
    </div>
  );
}

function AgentSelectField(props: {
  agents: LlmAgent[];
  agentId: string | number | undefined;
  onAgentIdChange: (v: string | number | undefined) => void;
}) {
  return (
    <div style={formFieldSpanAll}>
      <Text strong style={formFieldLabelStyle}>
        默认审查智能体
      </Text>
      <Select
        className="taskhome-filter-select"
        placeholder="暂不绑定"
        value={props.agentId}
        onChange={(v) => props.onAgentIdChange(v as string | number | undefined)}
        style={{ width: "100%" }}
        optionList={[
          { label: "暂不绑定", value: "" },
          ...props.agents.map((a) => ({
            label: `${a.name}（${a.model}）`,
            value: a.id,
          })),
        ]}
        showClear
      />
    </div>
  );
}

function TaskFilePicker(props: {
  files: File[];
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (filename: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <div
        className="taskdetail-upload-box"
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          props.onAddFiles(Array.from(e.dataTransfer.files).filter(isDocxFile));
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          hidden
          onChange={(e) => {
            props.onAddFiles(Array.from(e.target.files || []).filter(isDocxFile));
            e.target.value = "";
          }}
        />
        <Text style={{ color: "rgba(51, 65, 85, 0.88)", fontSize: 14 }}>
          点击选择文件，或将文件拖拽到此处上传
        </Text>
      </div>
      <div style={{ marginTop: 14 }}>
        <Text strong style={{ display: "block", marginBottom: 8 }}>
          已选择材料
        </Text>
        {props.files.length ? (
          <ul style={{ margin: 0, paddingLeft: 20, color: "rgba(71, 85, 105, 0.88)" }}>
            {props.files.map((file) => (
              <li key={`${file.name}-${file.size}`} style={{ marginBottom: 8 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <Text>{file.name}</Text>
                  <Button
                    size="small"
                    type="danger"
                    theme="borderless"
                    onClick={() => props.onRemoveFile(file.name)}
                  >
                    删除
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Text type="tertiary">暂无已选择文件</Text>
        )}
      </div>
    </div>
  );
}

function TaskNewSubmitRow({ busy, canSubmit }: { busy: boolean; canSubmit: boolean }) {
  return (
    <div style={{ marginTop: 28, display: "flex", justifyContent: "flex-end" }}>
      <Button
        htmlType="submit"
        theme="solid"
        type="primary"
        icon={<IconArrowRight />}
        loading={busy}
        disabled={!canSubmit}
        style={techPrimaryButton}
      >
        创建任务并继续
      </Button>
    </div>
  );
}
