# 先说好

刚凑齐的室友、旅伴和社团同伴，花 3 分钟说好 5 件小事。用幽默提前写明具体行为，用认领找到做得到的约定。

## 当前进度：阶段 7 本地联调与部署准备

本地完整流程从 `http://127.0.0.1:3000` 进入。阶段 7 提供后端 Docker 镜像配置、Render Blueprint 和 Vercel + Supabase 部署步骤。状态和验证结果见 [阶段 7 验收](docs/stage-7.md)，正式上线操作见 [公网部署](docs/deployment.md)。

首页点击“一起说好 5 件事”，即可选空间、选具体边界、确认五条并创建真实房间。品牌改为「先说好」，使用暖米白、纯白便签和薄荷绿主按钮。首页示例默认展开一条，可逐条展开或展开全部；不到一秒的开场、按压反馈和成功认领后的撒花均支持减少动态效果设置。最新文件清单、截图及验收见 [阶段 2.6](docs/stage-2.6.md)。

房间支持匿名加入、认领、独立换条抽屉、自动刷新和邀请链接。抽屉保留边界对比及清空认领确认，预览后新增认领会使确认失效。五条都有人认领后，由创建者确认定稿；最终卡支持复制全文、保存 PNG 和分享链接。新定稿使用新口号，旧快照原文不变。创建认领流程见 [阶段 4](docs/stage-4.md)，导出见 [阶段 5](docs/stage-5.md)，此前文案来源见 [阶段 2.5](docs/stage-2.5.md)。

已完成阶段 1 基础首页、15×3 规则库、四列表与 9 套静态示例，并在阶段 2 实现 SQLite 持久化、Alembic 迁移、匿名房间、模板生成、认领、替换、定稿快照和 API 测试。

三个空间各有三套静态示例，点击骰子“换一组灵感”即可本地切换，不调用 API 或 AI。刷新保留当前示例。默认便签在 1280×800 桌面首屏内完整展示；手机端保留主入口、允许自然滚动，展开内容不截断。关闭 JavaScript 仍可用原生折叠区阅读五条示例。

创建入口 `/create`，草案入口 `/room/[code]`，最终卡 `/room/[code]/card`。条文、人数、日期、复制全文和导出图均来自同一份不可变定稿快照。正常阅读保留完整文字，可切换“整卡预览”截图；PNG 固定为 1440 像素宽，不受手机屏幕宽度影响。阶段 6 已接入模型：只改写幽默标题，动作与执行接口原样保留；失败自动回退，当前本机未配置模型，仍可完整体验。尚未部署公网。最新验收见 [阶段 6](docs/stage-6.md)，此前首页验收见 [阶段 3](docs/stage-3.md)。

## 环境与安装

Windows PowerShell：Node.js 24、Python 3.12。前后端准确依赖分别锁定在 frontend/package-lock.json 和 backend/requirements.lock.txt。当前无需 Docker、PostgreSQL 服务或模型密钥。

```powershell
Set-Location 'D:\比赛\Qoder\源代码'
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup.ps1
```

脚本创建项目内 backend/.venv，将安装缓存放入 .cache，保留已有配置文件，不修改系统 PATH 或全局执行策略。找不到 Python 时：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup.ps1 -PythonExecutable 'D:\Python312\python.exe'
```

## 本地运行

在项目根目录打开两个终端，分别启动：

```powershell
npm.cmd --prefix frontend run dev
```

```powershell
.\backend\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
```

- 首页：http://localhost:3000
- 创建流程：http://localhost:3000/create
- 接口操作入口：http://localhost:8000/docs
- 存活检查：http://localhost:8000/health（stage=6，只表示服务存活）
- 就绪检查：http://localhost:8000/ready（同时检查数据库连接）
- 行为库：http://localhost:8000/api/rule-library

同一次接口流程请使用同一个域名。localhost 和 127.0.0.1 的浏览器身份不通用。已有进程占用端口时先停止旧进程，不要重复启动。

开发启动会自动创建 backend/data/app.db 并升级数据库，重启保留数据。数据库和 Cookie 不是源码：不要删除数据文件来“重置错误”，也不要提交到仓库。清除 Cookie 后无法找回旧创建者权限。

## 验收与数据库迁移

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\check.ps1
```

执行规则数据同步检查、Ruff、pytest、前端静态检查和生产构建。后端测试使用临时数据库，不改本地使用数据。

前后端浏览器测试（先完成生产构建，8000 和 3100 端口均需空闲）：

```powershell
npm.cmd --prefix frontend run test:e2e
```

Windows 默认使用已安装的 Edge；测试自动启动并关闭 3100 端口的前端与 8000 端口的后端，拒绝复用已有服务。测试后端由 scripts/serve_e2e.py 启动，使用 .cache/e2e-databases 中每次新建的独立 SQLite，不触碰 backend/data/app.db；测试专用限流额度不影响日常服务。构建使用默认 BACKEND_URL=http://127.0.0.1:8000，若自行改过需按该地址重建再验收。Linux / CI 先在 frontend 目录运行 `npx playwright install --with-deps chromium`。也可设置 PLAYWRIGHT_CHANNEL 选择浏览器。截图与报告写入 .cache/playwright/。受限执行环境需要允许测试启动和清理自己的子进程；普通 PowerShell 可直接运行。

启动后端后，运行真实接口流程：

```powershell
.\backend\.venv\Scripts\python.exe scripts/smoke_api.py
```

该脚本会创建一个“接口验收示例”房间，走完生成、换条、认领、定稿及公开读取，并输出 PASS 和房间链接。也可通过前端转发验收：

```powershell
.\backend\.venv\Scripts\python.exe scripts/smoke_api.py --base-url http://127.0.0.1:3000 --origin http://127.0.0.1:3000
```

生产模式不在启动时自动迁移，需要先运行：

```powershell
.\backend\.venv\Scripts\python.exe -m app.core.migrate
```

连接由 backend/.env 或服务环境变量中的 DATABASE_URL 控制。生产使用 PostgreSQL；容器入口负责执行迁移，应用会在启动时检查数据库版本。迁移回退只在测试临时库验证过，不建议对已有用户数据直接回退。

## 规则维护

唯一内容源是 backend/app/data/rule_library.json。API 示例与前端静态数据共用模板生成逻辑，不请求模型。修改规则后：

```powershell
.\backend\.venv\Scripts\python.exe scripts/sync_examples.py
.\backend\.venv\Scripts\python.exe scripts/sync_examples.py --check
```

## 文档与已知限制

- [阶段验收](docs/acceptance.md)与[阶段 2 验收记录](docs/stage-2.md)
- [API 文档和五步验收](docs/api.md)
- [系统架构](docs/architecture.md)、[规则引擎](docs/rule-engine.md)、[四列表](docs/friction-matrix.md)
- [阶段 1 文件清单](docs/stage-1-files.md)

模型配置仅在后端，绝不使用 NEXT_PUBLIC_ 暴露密钥。前端 .env.local 中仅有 BACKEND_URL 等公开或服务器端配置。

## 可选：接入真实模型

在 `backend/.env` 填写提供商给出的配置并重启后端：

```dotenv
LLM_API_KEY=你的密钥
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=该提供商可用的模型标识
```

以上 URL 是 OpenAI 示例；兼容服务使用自己的 API 基址，包含所需的 `/v1` 等前缀，不包含 `/chat/completions`。远程服务必须 HTTPS。支持 Chat Completions、`response_format: json_object`、`max_tokens` 及非流式文本输出的模型可直接使用；不支持时安全回退，不会为兼容性探测额外重试。

只有主动“生成我的宪法”会为五条合并发出一次请求。总等待预算 3 秒，连接、读取和逐块返回共用该预算；无 key/model、网络异常、拒答、截断和不合法 JSON 回退模板，单条校验失败只回退该条。首页示例、读取、认领、换条和定稿不调用模型。群名、昵称、房间码与 Cookie 不发给模型；内部真实摩擦字段不进入公开响应。

无需密钥即可完成演示。接入后创建一个新房间，在 `/api/rooms/房间码` 的 rules 中查看 `source=llm/template` 验证实际采用来源；已生成草案不会重新调用。`/health` 正常不能证明提供商可用。本次没有真实密钥，已验证本地兼容接口与失败回退，尚未验证外部服务的真实文案和速度。

当前限流为单进程内存窗口，代理后的额度分配需在公网实测，具体见部署文档。创建房间不支持幂等自动重试，生成、确认替换与定稿支持。

ESLint 9 支持期提示和 Starlette TestClient 弃用提示仍存在。安装 html-to-image 1.11.13 时，完整依赖审计仍报告开发工具链 14 项 high；阶段 5 再次执行运行依赖审计，结果为 0 项。部署前需重新检查完整依赖链。

下一阶段 8：作品帖文案和 30 秒评审演示路径。上线验收仍需平台账号与真实环境。
