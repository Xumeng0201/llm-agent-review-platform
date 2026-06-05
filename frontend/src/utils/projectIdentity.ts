/** 与 backend/app/project_identity.py 规则保持一致 */

export function parseProjectIdentity(name: string): {
  project_key: string | null;
  version: string | null;
} {
  const text = (name || "").trim();
  if (!text) return { project_key: null, version: null };

  const m4 = text.match(/^(.+?)(\d{4})$/);
  if (m4 && m4[1].trim()) {
    return { project_key: m4[1].trim(), version: m4[2] };
  }

  const mv = text.match(/^(.+?)[-_\s]?[vV](\d+)$/);
  if (mv && mv[1].trim()) {
    return { project_key: mv[1].trim(), version: `v${mv[2]}` };
  }

  return { project_key: text, version: null };
}
