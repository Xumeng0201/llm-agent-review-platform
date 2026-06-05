import { useEffect, useState } from "react";
import { fetchMyAvatarObjectUrl } from "../api";

function initialsFromUser(displayName: string, username: string): string {
  const name = (displayName || username || "?").trim();
  if (!name) return "?";
  if (/^[\u4e00-\u9fff]/.test(name)) return name.slice(0, 1);
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function UserAvatar({
  displayName,
  username,
  hasAvatar,
  avatarUrl,
  size = 32,
  className,
}: {
  displayName: string;
  username: string;
  hasAvatar?: boolean;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    if (!hasAvatar) {
      setSrc(null);
      return undefined;
    }
    void fetchMyAvatarObjectUrl()
      .then((url) => {
        if (cancelled) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [hasAvatar, avatarUrl, displayName, username]);

  const label = initialsFromUser(displayName, username);

  return (
    <span
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: src ? "transparent" : "linear-gradient(135deg, #ffb4c4, #ff8fab)",
        color: "#fff",
        fontSize: size <= 32 ? 13 : 18,
        fontWeight: 600,
      }}
    >
      {src ? (
        <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        label
      )}
    </span>
  );
}
