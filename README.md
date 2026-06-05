# 大模型 / 智能体建设方案评审（前后端分离）

以**评审任务**为单位：填写任务名称 → 上传项目方案（及说明）→ 按内置审查维度做**问题清单式审查**（严重 / 一般 / 轻微等问题项与依据）→ 一键下载 **审查意见书**（HTML / Word，可用浏览器打印为 PDF）。

前端 UI 基于 [Semi Design](https://semi.design)（抖音前端团队）组件库，并配合 Tailwind 做少量布局；全局为**浅紫渐变**背景，通过覆盖 Semi 的 `--semi-blue-`* 色阶将主色映射为紫罗兰色系。

## 技术栈

- **后端**：Python 3.9+、FastAPI、SQLAlchemy、SQLite（`backend/data/`）、httpx（调用 OpenAI 兼容大模型接口）
- **前端**：React 18、TypeScript、Vite 5、`@douyinfe/semi-ui` + `@douyinfe/semi-icons`、Tailwind CSS（基础样式与渐变壳层）

## 重要：数据库结构升级

`v0.2` 起使用新表 `review_tasks`（替代原 `projects` 流程）。启动时若检测到旧版 SQLite 中的 `indicator_scores` 表，会自动 **DROP**（已不再使用分项 0～10 打分）。若你本地仍有极旧版 `backend/data/app.db` 且迁移异常，可**删除该文件**后重启后端，以自动创建新库表。

**附件表列名**：若你曾用过更早期的 `/api/projects` 版本，SQLite 里的 `attachments` 可能仍是 `project_id`。当前代码使用 `task_id`，会导致进入任务详情、加载附件列表时出现 **500 Internal Server Error**。启动后端时会自动执行 `ALTER TABLE ... RENAME COLUMN project_id TO task_id`（需 SQLite 3.25+）；**重启一次 uvicorn** 即可。若迁移失败，可删除 `backend/data/app.db` 后重启。

**测评智能体**：会新建表 `llm_agents`，并为 `review_tasks` 增加可选字段 `llm_agent_id`（启动时 `ALTER TABLE`）。**API Key 以明文写入本地 SQLite，仅适合内网/开发**；生产环境请改用密钥管理服务或对字段加密。

**提示词（v0.2+）**：启动时会为 `llm_agents` 增加 `system_prompt`（`ALTER TABLE`，**重启一次 uvicorn** 即可）。`system_prompt` 用于自定义智能体角色与审查侧重点；留空则使用内置专家角色。任务上的 `review_summary`、亮点与问题等字段仍可供人工或后续流程填写，与**问题审查意见书**导出配合使用。

## 测评智能体（DeepSeek / OpenAI / 自定义）

1. 打开前端 **测评方法**（`/methods`），添加智能体：
  - **DeepSeek**：提供方选 DeepSeek，模型填 `deepseek-chat`（或官方文档中的模型名），API Key 使用你在 DeepSeek 控制台申请的 Key；请求走 `https://api.deepseek.com/v1`（OpenAI 兼容 Chat Completions）。  
  - **OpenAI**：提供方选 OpenAI，模型如 `gpt-4o-mini`。  
  - **自定义**：任意 OpenAI 兼容网关，填写完整 **API Base**（含 `/v1`）与模型名。
2. **新建评审任务**时可绑定默认智能体；在任务详情中发起**文档解析与问题审查**时使用该智能体（亦可在审查请求中临时指定其他智能体）。
3. 在 **测评方法** 中可为每个智能体填写 **角色与审查要求**（创建时或表格中铅笔图标编辑）；问题审查的 JSON 结构由后端固定，以保证解析与落库一致。
4. 审查完成后可在任务中导出 **审查意见书**（问题列表、严重度、依据与建议等），不再提供「按一级指标打 0～10 分」或基于分值的综合结论页。

## 本地运行

### 手动启动操作指南（自己跑起来）

下面假设项目在本机的路径为 **`llm-agent-review-platform` 根目录**（即同时包含 `backend/` 与 `frontend/` 的那一层）。

#### 0. 环境要求

| 组件 | 说明 |
|------|------|
| **Python** | 3.9 或以上（与 `backend` 一致即可） |
| **Node.js** | 建议 18 LTS 或以上（用于运行 Vite / npm） |
| **终端** | macOS / Linux 用「终端」；Windows 用 PowerShell 或 CMD |

端口约定：**后端 8099**，**前端 5173**（见 `frontend/vite.config.ts` 里对 `/api` 的代理目标）。

#### 1. 第一次使用项目时（每台电脑只需做一次）

在项目**根目录**打开终端，依次执行。

**（1）后端：虚拟环境 + 依赖**

```bash
cd backend
python3 -m venv .venv
```

激活虚拟环境：

- **macOS / Linux**：`source .venv/bin/activate`
- **Windows（CMD）**：`.venv\Scripts\activate.bat`
- **Windows（PowerShell）**：`.venv\Scripts\Activate.ps1`

然后安装依赖（若安装 `lxml` / `python-docx` 报错，先升级 pip 再装）：

```bash
python -m pip install -U pip
pip install -r requirements.txt
```

**（2）前端：安装 npm 包**

```bash
cd ../frontend
npm install
```

#### 2. 以后每次手动启动（需要两个终端窗口）

**必须先起后端，再开前端**（或两个都开着即可；前端通过代理访问后端）。

**终端 A —— 启动后端 API**

```bash
cd /你的路径/llm-agent-review-platform/backend
source .venv/bin/activate          # Windows 改用上一节的 activate 命令
uvicorn app.main:app --reload --host 127.0.0.1 --port 8099
```

看到类似 `Uvicorn running on http://127.0.0.1:8099` 即表示后端已监听。

**终端 B —— 启动前端开发服务器**

```bash
cd /你的路径/llm-agent-review-platform/frontend
npm run dev
```

看到 `Local: http://localhost:5173/` 后，用浏览器打开：

- **应用首页**：[http://127.0.0.1:5173](http://127.0.0.1:5173)

前端会把以 `/api` 开头的请求**代理到** `http://127.0.0.1:8099`，因此一般**不需要**单独在浏览器里打开 8099 来使用界面。

#### 3. 确认是否启动成功

- 后端健康检查：[http://127.0.0.1:8099/api/health](http://127.0.0.1:8099/api/health)
- 后端接口文档：[http://127.0.0.1:8099/docs](http://127.0.0.1:8099/docs)
- 前端能打开且「评审任务」等页面不报网络错误，即代理与后端正常。

#### 4. 如何停止

在运行 `uvicorn` 或 `npm run dev` 的终端里按 **`Ctrl + C`** 结束对应进程。两个终端各按一次，前后端就都停了。

#### 5. 常见问题

- **端口被占用**：若 8099 或 5173 已被占用，可关掉占用程序，或自行改端口（改后端启动参数，并同步修改 `frontend/vite.config.ts` 里 `proxy["/api"].target`）。
- **`ModuleNotFoundError: No module named 'docx'`**：在已激活的 `backend` 虚拟环境里执行 `pip install -r requirements.txt`；仍失败时先 `python -m pip install -U pip`。
- **前端能开但接口全失败**：确认终端 A 里后端仍在运行，且地址为 **127.0.0.1:8099**。

---

### 命令速查（与上文一致）

**后端**

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8099
```

- 健康检查：[http://127.0.0.1:8099/api/health](http://127.0.0.1:8099/api/health)
- OpenAPI：[http://127.0.0.1:8099/docs](http://127.0.0.1:8099/docs)
- 主要 API 前缀：`/api/review-tasks`、`/api/llm-agents`、`/api/framework`

**前端**

```bash
cd frontend
npm install
npm run dev
```

浏览器：[http://127.0.0.1:5173](http://127.0.0.1:5173)（`/api` 由 Vite 代理到 8099）

**前端路由（摘要）**：`/` 首页；`/tasks` 评审任务列表；`/methods` 测评智能体；`/tasks/new` 新建任务；`/tasks/:id` 任务详情（材料、解析、问题审查与意见书导出等步骤）。

### 生产构建

```bash
cd frontend && npm run build
```

静态资源托管 `frontend/dist`，并将 `/api` 反向代理到 FastAPI。

## 目录说明


| 路径                                           | 说明                        |
| -------------------------------------------- | ------------------------- |
| `backend/app/framework.json`                 | 审查框架（审查维度 `dimensions`、原则等；`indicators` 为历史兼容字段） |
| `backend/app/issue_report.py`                | 审查意见书 HTML / Word 生成        |
| `frontend/tailwind.config.cjs`               | Tailwind 主题变量（与 Semi 并存）  |
| `frontend/src/semi-theme.css`                | 浅紫渐变壳层 + Semi 主色（紫罗兰）覆盖   |
| `frontend/src/providers/SemiAppProvider.tsx` | `ConfigProvider` 中文语言包    |


## 后续可扩展

- 登录与角色（申报方 / 审核员 / 管理员）
- 更细粒度的审查清单与权重（仍可为问题清单式，不必回到分项打分）
- 服务端 PDF 生成（当前推荐用审查意见书 HTML + 浏览器打印为 PDF）
