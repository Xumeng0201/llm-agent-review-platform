import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Card, Modal, Space, Spin, TextArea, Toast, Typography } from "@douyinfe/semi-ui";
import { IconArticle, IconUpload } from "@douyinfe/semi-icons";
import { getFrameworkCriteriaPreview, getFrameworkCurrent, uploadReviewFrameworkDocx } from "../api";
import { useAuth } from "../auth";
import type { FrameworkCriteriaPreview, FrameworkCurrentResponse, FrameworkVersionInfo, ReviewPhase } from "../types";
import { pageShellList, secondaryPillButton, techPrimaryButton } from "../theme/pageChrome";

const { Title, Text } = Typography;

const cardBodyPadding = "24px 28px";

function formatDateTimeBeijing(iso: string | null | undefined): string {
  if (!iso) return "—";
  const normalized =
    /(?:Z|[+-]\d{2}:\d{2})$/.test(iso) || iso.includes("/")
      ? iso
      : `${iso.replace(" ", "T")}Z`;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(d)
    .replace(/\//g, "-");
}

function formatCharCount(count: number): string {
  if (count >= 10000) return `${(count / 10000).toFixed(1)} 万`;
  return count.toLocaleString("zh-CN");
}

function PhaseDocIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 3h8l4 4v14a1 1 0 0 1-1 1H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M16 3v4h4" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function MetaItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="review-criteria-meta-item">
      <span className="review-criteria-meta-label">{label}</span>
      <span className="review-criteria-meta-value">{value}</span>
    </div>
  );
}

function PhaseMetaGrid({ cur }: { cur: FrameworkVersionInfo }) {
  return (
    <div className="review-criteria-meta-grid">
      <MetaItem label="正文字数" value={`${formatCharCount(cur.text_char_count)} 字`} />
      <MetaItem label="更新时间" value={formatDateTimeBeijing(cur.created_at)} />
      <MetaItem
        label="更新人"
        value={cur.username && cur.username !== "—" ? cur.username : "—"}
      />
      <MetaItem label="归档方式" value="全文入库" />
    </div>
  );
}

function PhaseBlock({
  phase,
  label,
  subtitle,
  tone,
  admin,
  enterClass,
  onUploaded,
}: {
  phase: ReviewPhase;
  label: string;
  subtitle: string;
  tone: "pre-review" | "implementation";
  admin: boolean;
  enterClass: string;
  onUploaded: () => void;
}) {
  const [data, setData] = useState<FrameworkCurrentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<FrameworkCriteriaPreview | null>(null);
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

  const openPreview = useCallback(async () => {
    if (!cur) {
      Toast.warning("尚未上传审核要点，无可预览");
      return;
    }
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewData(null);
    try {
      setPreviewData(await getFrameworkCriteriaPreview(phase));
    } catch (e) {
      Toast.error(e instanceof Error ? e.message : "加载预览失败");
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  }, [cur, phase]);

  return (
    <>
      <Card
        bordered={false}
        style={pageShellList}
        className={`review-criteria-phase-card review-criteria-phase-card--${tone} ${enterClass} page-shell-list`}
        bodyStyle={{ padding: 0 }}
      >
        <div className="review-criteria-phase-head">
          <div className="review-criteria-phase-head-main">
            <span className={`review-criteria-phase-icon review-criteria-phase-icon--${tone}`}>
              <PhaseDocIcon />
            </span>
            <div>
              <Title heading={5} style={{ margin: 0, color: "#0f172a" }}>
                {label}
              </Title>
              <Text style={{ display: "block", marginTop: 4, fontSize: 13, color: "rgba(71, 85, 105, 0.88)" }}>
                {subtitle}
              </Text>
            </div>
          </div>
          {cur ? (
            <span className={`review-criteria-version-badge review-criteria-version-badge--${tone}`}>
              v{cur.version_seq}
            </span>
          ) : null}
        </div>

        <div className="review-criteria-phase-body">
          {loading ? (
            <div className="review-criteria-loading">
              <Spin />
            </div>
          ) : cur ? (
            <>
              <div className={`review-criteria-file-chip review-criteria-file-chip--${tone}`}>
                <PhaseDocIcon />
                <Text strong ellipsis={{ showTooltip: true }} style={{ color: "#0f172a", flex: 1, minWidth: 0 }}>
                  {cur.original_filename}
                </Text>
              </div>
              <PhaseMetaGrid cur={cur} />
            </>
          ) : (
            <div className="review-criteria-empty">
              <span className={`review-criteria-phase-icon review-criteria-phase-icon--${tone}`}>
                <PhaseDocIcon />
              </span>
              <Text style={{ color: "rgba(71, 85, 105, 0.88)", fontSize: 13, lineHeight: 1.7, textAlign: "center" }}>
                尚未上传审核要点 Word
                <br />
                问题审查将仅使用系统内置维度
              </Text>
            </div>
          )}
        </div>

        <div className="review-criteria-phase-actions">
          <Button
            icon={<IconArticle />}
            theme="light"
            type="tertiary"
            disabled={!cur}
            style={secondaryPillButton}
            onClick={() => void openPreview()}
          >
            预览正文
          </Button>
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
                style={techPrimaryButton}
                onClick={() => fileRef.current?.click()}
              >
                上传 Word
              </Button>
            </>
          ) : (
            <Text type="tertiary" size="small">
              仅管理员可上传
            </Text>
          )}
        </div>
      </Card>

      <Modal
        title={`正文预览 · ${label}`}
        visible={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        footer={
          <Button type="primary" theme="solid" style={techPrimaryButton} onClick={() => setPreviewOpen(false)}>
            关闭
          </Button>
        }
        width={720}
        bodyStyle={{ paddingTop: 12 }}
      >
        {previewLoading ? (
          <Spin style={{ display: "block", margin: "32px auto" }} />
        ) : previewData ? (
          <Space vertical spacing="tight" style={{ width: "100%" }}>
            <Text size="small" type="tertiary" style={{ display: "block" }}>
              v{previewData.version_seq} · {previewData.original_filename}
              {previewData.username && previewData.username !== "—" ? ` · 更新人：${previewData.username}` : ""}
              {previewData.text_was_truncated ? (
                <Text strong style={{ marginLeft: 8, color: "#b45309" }}>
                  （以下与注入审查提示词一致，过长已截断）
                </Text>
              ) : null}
            </Text>
            <TextArea
              value={previewData.text}
              readOnly
              autosize={{ minRows: 14, maxRows: 22 }}
              className="taskdetail-proposal-textarea"
              style={{
                fontSize: 13,
                lineHeight: 1.55,
                color: "#0f172a",
                background: "rgba(255, 255, 255, 0.92)",
                border: "1px solid rgba(203, 213, 225, 0.95)",
                borderRadius: 6,
              }}
            />
          </Space>
        ) : null}
      </Modal>
    </>
  );
}

export default function ReviewCriteriaPage() {
  const { user } = useAuth();
  const admin = user?.role === "admin";
  const [, bump] = useState(0);
  const onUploaded = () => bump((n) => n + 1);

  return (
    <div className="review-criteria-page">
      <Card
        bordered={false}
        style={pageShellList}
        className="tech-enter tech-enter-1 page-shell-list review-criteria-intro-card"
        bodyStyle={{ padding: cardBodyPadding }}
      >
        <Title heading={4} style={{ color: "#0f172a", margin: 0 }}>
          审核要点配置
        </Title>
        <Text className="review-criteria-intro-text">
          按阶段分别维护审核要点 Word。上传新文件会覆盖该阶段当前生效版本；解析正文仅对
          <Text strong>之后新创建</Text>
          的该阶段任务生效，已有任务仍沿用创建时绑定的版本。解析内容会注入 AI 问题清单审查提示词，并与系统
          <Text strong>内置审查维度</Text>
          并行使用。
        </Text>
      </Card>

      <div className="review-criteria-phase-grid">
        <PhaseBlock
          phase="pre_review"
          label="方案预审"
          subtitle="预审阶段审核要点与审查维度"
          tone="pre-review"
          admin={admin}
          enterClass="tech-enter tech-enter-2"
          onUploaded={onUploaded}
        />
        <PhaseBlock
          phase="implementation"
          label="实施方案审核"
          subtitle="实施方案阶段审核要点与审查维度"
          tone="implementation"
          admin={admin}
          enterClass="tech-enter tech-enter-3"
          onUploaded={onUploaded}
        />
      </div>
    </div>
  );
}
