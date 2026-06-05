# 项目方案评审平台

面向政务 / 信息化项目方案的 **LLM 辅助评审** 系统。以**评审任务**为单位，支持方案预审与实施方案审核两阶段，完成材料解析、问题清单式审查、审查意见书导出，并提供跨项目**记忆比对**能力。

前端基于 [Semi Design](https://semi.design) + React；后端为 FastAPI + SQLite，通过 OpenAI 兼容接口调用 DeepSeek / OpenAI 等模型。

---

## 功能概览

| 模块 | 说明 |
|------|------|
| **首页控制台** | 任务总数 / 评审中 / 已完成统计，本月 Token 与费用估算 |
| **方案预审** | 阶段 `pre_review`，独立任务列表与新建入口 |
| **实施方案审核** | 阶段 `implementation`，独立任务列表与新建入口 |
| **评审任务** | 新建时填写任务名称、项目名称、版本，上传 `.docx` 方案与背景说明，绑定审查智能体 |
| **任务详情（三步）** | ① 解析材料 → ② 查看评审结果 → ③ 编辑并下载报告（HTML / Word 审查意见书） |
| **审核要点** | 按阶段上传审核要点 Word，新任务绑定当前版本；支持预览提取文本 |
| **记忆比对** | 方案库浏览、相似检索、两份方案并排对比、全库重建索引 |
| **智能体配置** | 管理 DeepSeek / OpenAI / 自定义 OpenAI 兼容网关及系统提示词 |
| **用户管理** | 管理员创建 / 编辑用户（`admin` / `user`） |
| **个人中心** | 修改显示名、上传头像 |

### 审查方式

- 按内置**审查维度**输出**问题清单**（严重 / 一般 / 轻微），含依据、建议、是否需补材料等字段。
- **不再**使用「一级指标 0～10 分」式打分；导出物为**审查意见书**（问题列表 + 总体判断）。
- 支持 Token 用量估算、按维度拆分估算；匹配价目表时可显示费用区间。

### 权限与登录

- 首次启动无用户时，登录页引导**初始化管理员**。
- 普通功能需登录；`/users` 等管理接口仅 **admin** 可访问。
- 会话 Token 存于浏览器 `localStorage`，请求头 `Authorization: Bearer …`。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Python 3.9+、FastAPI、SQLAlchemy、SQLite（`backend/data/app.db`）、httpx |
| 文档 | python-docx、lxml、pypdf；可选 `unstructured` 增强 DOCX 结构化切分 |
| OCR / 图片 | Pillow、pytesseract、pypdfium2（按需） |
| 前端 | React 18、TypeScript、Vite 5、React Router 6 |
| UI | `@douyinfe/semi-ui`、`@douyinfe/semi-icons`；Tailwind CSS + 自定义 `index.css` 主题 |

默认端口：**后端 `8099`**，**前端开发服 `5173`**（Vite 将 `/api` 代理到后端）。

---

## 目录结构

```
llm-agent-review-platform/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI 入口与 REST API
│   │   ├── models.py            # SQLAlchemy 模型
│   │   ├── database.py          # SQLite 连接与启动迁移
│   │   ├── review_engine.py     # 问题审查流水线
│   │   ├── doc_parse.py         # 材料解析
│   │   ├── issue_report.py      # 审查意见书 HTML / Word
│   │   ├── cross_project_memory.py  # 记忆比对与向量检索
│   │   ├── token_estimator.py   # Token / 费用估算
│   │   ├── framework.json       # 默认审查框架（实施方案）
│   │   └── framework_pre_review.json
│   ├── data/                    # SQLite、上传文件（gitignore，运行时生成）
│   └── requirements.txt
├── frontend/
│   ├── public/                  # favicon、静态登录背景等
│   ├── src/
│   │   ├── App.tsx              # 路由
│   │   ├── api.ts               # API 客户端
│   │   ├── pages/               # 各业务页面
│   │   ├── components/          # Layout、UserMenu 等
│   │   └── theme/pageChrome.ts  # 列表 / 表单 / 详情壳层样式常量
│   ├── index.html
│   └── vite.config.ts
└── scripts/
    └── tunnel-dxg-con.sh        # 可选：SSH 本地端口转发脚本
```

---

## 本地运行

### 环境要求

| 组件 | 版本建议 |
|------|----------|
| Python | 3.9+ |
| Node.js | 18 LTS+ |
| 操作系统 | macOS / Linux / Windows |

### 首次安装

**后端**

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
python -m pip install -U pip
pip install -r requirements.txt
```

**前端**

```bash
cd frontend
npm install
```

### 日常启动（两个终端）

**终端 A — 后端**

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8099
```

**终端 B — 前端**

```bash
cd frontend
npm run dev
```

浏览器打开 [http://127.0.0.1:5173](http://127.0.0.1:5173)。

### 验证

| 地址 | 说明 |
|------|------|
| [http://127.0.0.1:8099/api/health](http://127.0.0.1:8099/api/health) | 健康检查 |
| [http://127.0.0.1:8099/docs](http://127.0.0.1:8099/docs) | Swagger 文档 |

停止服务：在对应终端按 `Ctrl + C`。

---

## 前端路由

| 路径 | 页面 |
|------|------|
| `/login` | 登录 / 初始化管理员 |
| `/` | 首页控制台 |
| `/tasks/pre-review` | 方案预审任务列表 |
| `/tasks/implementation` | 实施方案任务列表 |
| `/tasks/pre-review/new` | 新建方案预审任务 |
| `/tasks/implementation/new` | 新建实施方案任务 |
| `/tasks/:id/materials` | 任务详情 · 解析材料 |
| `/tasks/:id/result` | 任务详情 · 评审结果 |
| `/tasks/:id/report` | 任务详情 · 下载意见书 |
| `/review-criteria` | 审核要点（分阶段） |
| `/memory` | 记忆比对 |
| `/methods` | 智能体列表 |
| `/methods/new`、`/methods/:id/edit` | 新增 / 编辑智能体 |
| `/users` | 用户管理（admin） |
| `/users/new`、`/users/:id/edit` | 新增 / 编辑用户 |
| `/profile` | 个人中心 |

兼容跳转：`/tasks` → `/tasks/implementation`，`/tasks/new` → `/tasks/implementation/new`。

---

## 主要 API（前缀 `/api`）

| 分组 | 代表接口 |
|------|----------|
| 认证 | `POST /auth/login`、`POST /auth/bootstrap-admin`、`GET /auth/me` |
| 用户 | `GET/POST /users`、`PATCH /users/{id}`（分页 + 搜索） |
| 智能体 | `GET/POST /llm-agents`、`PATCH/DELETE /llm-agents/{id}` |
| 任务 | `GET /review-tasks`（分页、阶段、状态、关键词）、`POST /review-tasks`、`GET/PATCH/DELETE /review-tasks/{id}` |
| 任务指标 | `GET /review-tasks/metrics` |
| 解析与审查 | `POST /review-tasks/{id}/analyze`、`POST /review-tasks/{id}/review/run` |
| 问题与报告 | `GET /review-tasks/{id}/issues`、`GET …/issues/report/html|word` |
| 附件 | `POST/GET/DELETE /review-tasks/{id}/attachments` |
| 费用 | `GET /review-costs/task-overview?task_ids=…`、`GET /review-costs/monthly-summary` |
| 审核要点 | `GET /review-framework/{phase}/current`、`POST /review-framework/{phase}/upload` |
| 记忆 | `GET /memory/library`、`GET /memory/tasks/{id}/similar`、`POST /memory/compare` |

完整定义见 Swagger：`/docs`。

---

## 智能体配置

1. 进入 **智能体配置** → **新增审查智能体**。
2. 选择提供方并填写模型与 API Key：
   - **DeepSeek**：模型如 `deepseek-chat`，默认 Base `https://api.deepseek.com/v1`
   - **OpenAI**：如 `gpt-4o-mini`
   - **自定义**：填写完整 OpenAI 兼容 **API Base**（含 `/v1`）与模型名
3. 可选填写 **系统提示词**，定制审查角色与侧重点；留空使用内置专家角色。
4. 新建任务时选择绑定的智能体；解析与问题审查均使用该配置。

> **安全提示**：API Key 以明文写入本地 SQLite，仅适用于内网 / 开发。生产环境请使用密钥管理服务或加密存储。

---

## 生产构建

```bash
cd frontend
npm run build
```

产物在 `frontend/dist/`。部署方式：

1. 静态托管 `dist`（Nginx、Caddy 等）
2. 将 `/api` 反向代理到 FastAPI（`8099`）
3. SPA 需配置 fallback 到 `index.html`

Logo、favicon 等资源位于 `public/`，导航栏 Logo 通过 Vite 打包 `src/assets/brand-logo.png` 引入。

---

## 数据库与迁移

- 数据库文件：`backend/data/app.db`（首次启动自动建表）
- 启动时执行 `migrate_sqlite_schema()`，对 SQLite 做轻量 `ALTER TABLE`（如历史 `attachments.project_id` → `task_id`、新增 `llm_agent_id` 等）
- 若本地库来自极旧版本且迁移失败，可**备份后删除** `backend/data/app.db` 再重启（会丢失本地数据）
- 上传的方案、头像、审核要点 Word 等亦保存在 `backend/data/` 下

---

## 常见问题

| 现象 | 处理 |
|------|------|
| 前端能开但接口全失败 | 确认后端在 `127.0.0.1:8099` 运行；检查 Vite `proxy["/api"].target` |
| 端口占用 | 修改 uvicorn 端口，并同步 `frontend/vite.config.ts` 代理目标 |
| `ModuleNotFoundError: docx` | 在 backend 虚拟环境中 `pip install -r requirements.txt` |
| 导航 Logo 不显示 | 执行 `npm run build` 或重启 `npm run dev`；硬刷新浏览器缓存 |
| 进入任务详情 500 | 多为旧库 schema 不兼容，重启后端触发迁移或重建 `app.db` |

---

## 开发说明

- 审查框架 JSON：`backend/app/framework.json`（实施方案）、`framework_pre_review.json`（方案预审）
- 前端主题与列表圆角等：`frontend/src/theme/pageChrome.ts`、`frontend/src/index.css`
- Semi 主题覆盖：`frontend/src/semi-theme.css`
- CORS 开发环境允许 `http://localhost:5173`、`http://127.0.0.1:5173`

---

## 许可证

内部项目；部署与密钥管理请遵循组织安全规范。
