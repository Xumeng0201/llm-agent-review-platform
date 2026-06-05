import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { IconExit, IconUser } from "@douyinfe/semi-icons";
import { useAuth } from "../auth";
import UserAvatar from "./UserAvatar";

type MenuPosition = { top: number; right: number };

export default function UserMenu() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setMenuPos(null);
      return undefined;
    }

    const updatePosition = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!user) return null;

  const label = user.display_name || user.username;

  const menu =
    open && menuPos
      ? createPortal(
          <div
            ref={menuRef}
            className="user-menu-dropdown user-menu-dropdown-portal"
            role="menu"
            style={{ top: menuPos.top, right: menuPos.right }}
          >
            <button
              type="button"
              className="user-menu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                nav("/profile");
              }}
            >
              <IconUser />
              <span>个人中心</span>
            </button>
            <button
              type="button"
              className="user-menu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void logout();
              }}
            >
              <IconExit />
              <span>退出登录</span>
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="user-menu-wrap">
      <button
        ref={triggerRef}
        type="button"
        className="user-menu-trigger"
        aria-label="用户菜单"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <UserAvatar
          displayName={user.display_name}
          username={user.username}
          hasAvatar={Boolean(user.avatar_url)}
          avatarUrl={user.avatar_url}
          size={28}
        />
        <span className="user-menu-name">{label}</span>
        <svg className="user-menu-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {menu}
    </div>
  );
}
