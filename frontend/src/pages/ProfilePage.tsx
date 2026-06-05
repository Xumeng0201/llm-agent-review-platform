import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Input, Toast, Typography } from "@douyinfe/semi-ui";
import { updateMyProfile, uploadMyAvatar } from "../api";
import { useAuth } from "../auth";
import UserAvatar from "../components/UserAvatar";
import type { UserRole } from "../types";

const { Title } = Typography;

function roleLabel(role: UserRole): string {
  return role === "admin" ? "管理员" : "普通用户";
}

export default function ProfilePage() {
  const { user, refreshMe } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarKey, setAvatarKey] = useState(0);

  useEffect(() => {
    setDisplayName(user?.display_name ?? "");
  }, [user?.display_name]);

  if (!user) return null;

  async function saveProfile() {
    const dn = displayName.trim();
    if (!dn) {
      Toast.warning("显示名不能为空");
      return;
    }
    setSaving(true);
    try {
      await updateMyProfile({ display_name: dn });
      await refreshMe();
      Toast.success("个人资料已保存");
    } catch (e) {
      Toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function onAvatarSelected(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      await uploadMyAvatar(file);
      await refreshMe();
      setAvatarKey((k) => k + 1);
      Toast.success("头像已更新");
    } catch (e) {
      Toast.error(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="profile-page tech-enter">
      <div className="profile-page-shell">
        <header className="profile-page-header">
          <Title heading={3} className="profile-page-title">
            个人中心
          </Title>
          <Link to="/" className="profile-back-link">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path
                d="M8.5 2.5 4 7l4.5 4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            返回首页
          </Link>
        </header>

        <div className="profile-page-body">
          <aside className="profile-side-card">
            <div className="profile-avatar-ring">
              <UserAvatar
                key={avatarKey}
                displayName={user.display_name}
                username={user.username}
                hasAvatar={Boolean(user.avatar_url)}
                avatarUrl={user.avatar_url}
                size={96}
              />
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              hidden
              onChange={(e) => void onAvatarSelected(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              className="profile-change-avatar-btn"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? "上传中…" : "更换头像"}
            </button>
            <p className="profile-avatar-hint">PNG / JPG / WEBP / GIF · 最大 2MB</p>

            <div className="profile-info-rows">
              <div className="profile-info-row">
                <span className="profile-info-label">登录账号</span>
                <strong className="profile-info-value">{user.username}</strong>
              </div>
              <div className="profile-info-row">
                <span className="profile-info-label">账户角色</span>
                <strong className="profile-info-value">{roleLabel(user.role)}</strong>
              </div>
            </div>
          </aside>

          <section className="profile-form-card">
            <label className="profile-field-label" htmlFor="profile-username">
              用户名
            </label>
            <Input
              id="profile-username"
              value={user.username}
              disabled
              size="large"
              className="profile-field-input profile-field-input-readonly"
            />

            <label className="profile-field-label" htmlFor="profile-display-name">
              显示名
            </label>
            <Input
              id="profile-display-name"
              value={displayName}
              onChange={setDisplayName}
              size="large"
              className="profile-field-input"
              placeholder="在顶栏与任务中展示的名称"
            />

            <Button
              theme="solid"
              type="primary"
              size="large"
              loading={saving}
              className="profile-save-btn"
              onClick={() => void saveProfile()}
            >
              保存资料
            </Button>
          </section>
        </div>
      </div>
    </div>
  );
}
