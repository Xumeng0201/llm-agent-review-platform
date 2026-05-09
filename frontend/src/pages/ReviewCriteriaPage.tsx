import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Space, Toast, Typography } from "@douyinfe/semi-ui";
import { IconUpload } from "@douyinfe/semi-icons";
import { getFrameworkCurrent, uploadReviewFrameworkDocx } from "../api";
import { useAuth } from "../auth";
import type { FrameworkCurrentResponse, ReviewPhase } from "../types";

const { Title, Paragraph, Text } = Typography;

const shellCard = {
  width: "100%",
  borderRadius: 26,
  border: "1px solid rgba(255, 255, 255, 0.9)",
  background:
    "radial-gradient(circle at top left, rgba(56, 189, 248, 0.14), transparent 24%), linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(247, 248, 255, 0.88))",
  boxShadow: "0 24px 60px rgba(111, 123, 168, 0.14)",
} as const;

function PhaseBlock({
  phase,
  label,
  admin,
  onUploaded,
}: {
  phase: ReviewPhase;
  label: string;
  admin: boolean;
  onUploaded: () => void;
}) {
  const [data, setData] = useState<FrameworkCurrentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getFrameworkCurrent(phase));
    } catch (e) {
      Toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [phase]);

  useEffect(() => {
    void load();
  }, [load]);

  const cur = data?.current;

  return (
    <Card
      bordered={false}
      style={shellCard}
      title={<Title heading={6} style={{ margin: 0, color: "#0f172a" }}>{label}</Title>}
      headerLine={false}
      bodyStyle={{ padding: "20px 24px" }}
    >
      <Paragraph size="small" style={{ marginTop: -6, color: "rgba(71, 85, 105, 0.88)" }}>
        上传新的 <Text strong>.docx</Text> 后，将覆盖本阶段的「当前文件」副本，并生成新版本。
        <Text strong> 仅此后新创建的该阶段任务</Text>
        会绑定新要点；已有任务仍使用创建时的版本。
      </Paragraph>
      {loading ? (
        <Text type="tertiary">加载中…</Text>
      ) : cur ? (
        <div style={{ marginBottom: 12, fontSize: 13, color: "rgba(51, 65, 85, 0.9)" }}>
          <div>
            当前版本：<Text strong>v{cur.version_seq}</Text>（{cur.original_filename}）
          </div>
          <div style={{ marginTop: 4 }}>
            正文约 <Text strong>{cur.text_char_count}</Text> 字，已用于 AI 问题审查提示词补充。
          </div>
          {cur.created_at ? (
            <div style={{ marginTop: 4, fontFamily: "monospace", fontSize: 12 }}>
              上传时间：{cur.created_at}
            </div>
          ) : null}
        </div>
      ) : (
        <Text type="tertiary" style={{ display: "block", marginBottom: 12 }}>
          尚未上传审核要点 Word，问题审查将仅使用系统内置维度规则（不含本阶段公文要点全文）。
        </Text>
      )}
      {admin ? (
        <>
          <input
            ref={fileRef}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              if (!f.name.toLowerCase().endsWith(".docx")) {
                Toast.warning("请上传 .docx 文件");
                return;
              }
              setUploading(true);
              void uploadReviewFrameworkDocx(phase, f)
                .then(() => {
                  Toast.success("已上传并解析，新版本对新任务生效");
                  onUploaded();
                  void load();
                })
                .catch((err) => Toast.error(err instanceof Error ? err.message : "上传失败"))
                .finally(() => setUploading(false));
            }}
          />
          <Button
            icon={<IconUpload />}
            loading={uploading}
            theme="solid"
            type="primary"
            onClick={() => fileRef.current?.click()}
          >
            上传 / 覆盖 审核要点 Word
          </Button>
        </>
      ) : (
        <Text type="tertiary" size="small">
          仅管理员可上传或覆盖审核要点文件。
        </Text>
      )}
    </Card>
  );
}

export default function ReviewCriteriaPage() {
  const { user } = useAuth();
  const admin = user?.role === "admin";
  const [, bump] = useState(0);
  const onUploaded = () => bump((n) => n + 1);

  return (
    <Space vertical spacing="loose" style={{ width: "100%", alignItems: "stretch" }}>
      <Card bordered={false} style={shellCard} bodyStyle={{ padding: "clamp(22px, 4vw, 36px)" }}>
        <Title heading={4} style={{ color: "#0f172a" }}>
          审核要点配置
        </Title>
        <Paragraph style={{ color: "rgba(51, 65, 85, 0.88)", maxWidth: 720 }}>
          按阶段维护《预审审核要点》《实施方案审核要点》等 Word。解析后的正文会注入对应阶段的 AI
          问题清单审查提示词，与系统内置审查维度一并使用。
        </Paragraph>
      </Card>
      <PhaseBlock phase="pre_review" label="方案预审 — 审核要点" admin={admin} onUploaded={onUploaded} />
      <PhaseBlock
        phase="implementation"
        label="实施方案审核 — 审核要点"
        admin={admin}
        onUploaded={onUploaded}
      />
    </Space>
  );
}
