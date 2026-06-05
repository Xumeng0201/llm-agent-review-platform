import type { ReactNode } from "react";

export type TableActionTone = "primary" | "detail" | "success" | "danger";

const toneClass: Record<TableActionTone, string> = {
  primary: "table-action-btn--primary",
  detail: "table-action-btn--detail",
  success: "table-action-btn--success",
  danger: "table-action-btn--danger",
};

export function TaskDetailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

export function TableActionButton({
  icon,
  tone = "primary",
  label,
  onClick,
  disabled,
  showLabel = false,
}: {
  icon: ReactNode;
  tone?: TableActionTone;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  showLabel?: boolean;
}) {
  return (
    <button
      type="button"
      className={`table-action-btn ${toneClass[tone]}${showLabel ? " table-action-btn--with-label" : ""}`}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="table-action-btn-icon">{icon}</span>
      {showLabel ? <span className="table-action-btn-text">{label}</span> : null}
    </button>
  );
}

export function TableActionGroup({ children }: { children: ReactNode }) {
  return <div className="table-action-group">{children}</div>;
}
