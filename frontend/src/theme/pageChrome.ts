/**
 * 全局页面壳层与常用控件表面样式，避免在各 Page 内复制粘贴。
 */

/** 主内容区最大宽度（顶栏、页面主体共用） */
export const pageContentMaxWidth = "100%";

export const pageContentWrapStyle = {
  width: "100%",
  maxWidth: pageContentMaxWidth,
  margin: "0 auto",
} as const;

/** 列表页统一圆角 */
export const listPageRadius = 8;

/** 输入框 / 搜索框：胶囊形圆角 */
export const inputFieldRadius = 999;

/** 下拉框触发器：小圆角矩形 */
export const selectFieldRadius = 6;

/** 新建/编辑表单 Input、TextArea：与项目背景说明一致 */
export const formFieldRadius = 6;

/** 列表 / 工具栏外层的白色玻璃卡片（任务列表、用户、智能体、审核要点等） */
export const pageShellList = {
  width: "100%",
  borderRadius: listPageRadius,
  border: "1px solid rgba(226, 232, 240, 0.92)",
  background: "#ffffff",
  boxShadow: "0 18px 50px rgba(15, 23, 42, 0.06)",
} as const;

/** 任务详情等主内容区卡片（白底略实于列表壳） */
export const pageShellDetail = {
  width: "100%",
  borderRadius: 24,
  border: "1px solid rgba(226, 232, 240, 0.92)",
  background: "#ffffff",
  boxShadow: "0 18px 50px rgba(15, 23, 42, 0.06)",
} as const;

/** 新建 / 编辑表单整页卡片（大圆角 + 角部光晕） */
export const pageShellForm = {
  width: "100%",
  borderRadius: 28,
  border: "1px solid rgba(226, 232, 240, 0.92)",
  background:
    "radial-gradient(circle at top left, rgba(96, 165, 250, 0.08), transparent 24%), #ffffff",
  boxShadow: "0 18px 50px rgba(15, 23, 42, 0.06)",
} as const;

/** 详情页内嵌区块卡（分项、筛选卡片等） */
export const pageShellSoft = {
  width: "100%",
  borderRadius: formFieldRadius,
  border: "1px solid rgba(226, 232, 240, 0.95)",
  background: "linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(248, 250, 252, 0.92))",
} as const;

export const techPrimaryButton = {
  borderRadius: 999,
  background: "linear-gradient(90deg, #3c82f6, #3868f4)",
  border: "none",
  boxShadow: "0 16px 28px rgba(56, 104, 244, 0.22)",
} as const;

/** 描边胶囊次要按钮（与主按钮成对出现） */
export const secondaryPillButton = {
  borderRadius: 999,
  border: "1px solid rgba(203, 213, 225, 0.95)",
  background: "#ffffff",
  color: "#0f172a",
} as const;

/** 表单页 Input / TextArea 表面样式 */
export const formFieldSurface = {
  background: "#ffffff",
  border: "1px solid rgba(203, 213, 225, 0.95)",
  color: "#0f172a",
  borderRadius: formFieldRadius,
} as const;

/** 列表页工具栏搜索框等：胶囊形 */
export const techFieldSurface = {
  background: "#ffffff",
  border: "1px solid rgba(203, 213, 225, 0.95)",
  color: "#0f172a",
  borderRadius: inputFieldRadius,
} as const;

/** 新建/编辑表单：三列字段网格（与新增智能体页一致） */
export const formFieldGridStyle = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
} as const;

export const formFieldSpanAll = { gridColumn: "1 / -1" } as const;

/** 表单内两字段等宽平铺（如项目名称 + 版本） */
export const formFieldPairGridStyle = {
  gridColumn: "1 / -1",
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
} as const;

export const formFieldLabelStyle = {
  display: "block",
  marginBottom: 8,
  color: "#0f172a",
} as const;

/** 不可编辑表单字段（如编辑用户时的用户名） */
export const formFieldReadonlySurface = {
  ...techFieldSurface,
  background: "rgba(248, 250, 252, 0.98)",
  color: "rgba(100, 116, 139, 0.92)",
  cursor: "not-allowed",
} as const;

/** 列表页工具栏搜索框 */
export const toolbarSearchInput = {
  ...techFieldSurface,
  width: 280,
} as const;
