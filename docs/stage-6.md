# 阶段 6：大模型改写、自检、校验与回退

2026-11-18，阶段实现与本地验收目标达成。代码已接入 OpenAI 兼容 Chat Completions，具备 3 秒总预算、严格输出校验与模板回退。本机没有配置 LLM_API_KEY 和 LLM_MODEL，因此没有向外部模型发起真实请求；已验证本地兼容 HTTP 服务到数据库的完整链路，不将模拟结果等同于外部服务成功。

## 已实现

- 仅主动生成草案时，为五条合并发出一次请求。首页、示例 API、房间读取、加入、认领、换条、定稿与导出不请求模型。权限、建议确认、版本及幂等检查在请求前完成。
- 模型只改幽默标题。已经确认的动作、时间/数量阈值及执行接口逐字保持；真实摩擦由内部字段提供，群名、昵称、房间码和 Cookie 不进入模型请求。
- 提示词要求在一次回答内自检并重写：可观察性、低成本替代动作、不需要解释、不针对个人、不惩罚羞辱。后端独立校验，不相信模型的“自检通过”声明。
- 一次 3 秒预算覆盖建立连接和完整读取，逐块返回不能重置期限；超时取消并关闭连接。没有后台迟到补写、自动重试、重定向或兼容参数探测重试。
- 无密钥/模型、连接失败、429/5xx、拒答、截断、无效 JSON、重复 JSON 键、超大响应等整份回退；单条违反结构、长度、标识、固定动作/接口或标题过滤，只回退该条。
- 每条 source 为 llm/template；换条始终使用模板，并更新来源。模型标题恰好等于下一条模板时，仍选择不同表达。换边界、撤销认领与定稿快照沿用原有约束。
- 规则数据、静态示例、已有房间和最终卡不会因接入模型而重写；本阶段没有新增数据库迁移。

## 实际文件清单

新增：

- `backend/app/services/llm.py`：兼容接口、系统提示词、总截止时间、响应大小限制及固定结果码。
- `backend/app/schemas/llm.py`：严格模型条目结构。
- `backend/tests/test_llm.py`：70 个模型请求、校验、回退与 API 集成测试用例（含参数化）。
- `docs/stage-6.md`：本记录。

修改：

- `backend/app/services/rule_engine.py`：模型输入组装、逐条验证与模板替换。
- `backend/app/services/rooms.py`：生成时接入规则引擎、换条来源和避免同文替换。
- `backend/app/api/rooms.py`：传递服务端配置。
- `backend/app/core/config.py`：基址格式、HTTPS 和凭证位置检查。
- `backend/app/schemas/rooms.py`：响应支持 llm 来源。
- `backend/app/schemas/health.py`、`backend/app/main.py`：健康阶段 6、API 版本 0.6.0 与描述。
- `backend/tests/conftest.py`：测试隔离真实模型环境变量。
- `backend/tests/test_health.py`：对应健康阶段断言。
- `backend/.env.example`：真实模型配置说明。
- `backend/pyproject.toml`：httpx/anyio 显式作为运行依赖，版本 0.6.0。
- `backend/requirements.lock.txt`：说明更新，原有锁定包版本保持；本机已重装本项目可编辑包。
- `frontend/src/lib/room-api.ts`：source 收紧为 llm/template 联合类型。
- `scripts/check.ps1`：阶段 6 验收提示。
- `README.md`、`docs/api.md`、`docs/architecture.md`、`docs/rule-engine.md`、`docs/acceptance.md`：当前能力、调用契约、配置步骤与边界。

未改用户 `.env`、`.env.local`，也未替换规则库文案和页面视觉。

## 本地运行

工作目录 `D:\比赛\Qoder\源代码`，两个终端分别启动；已有服务时不要重复启动：

```powershell
npm.cmd --prefix frontend run dev
```

```powershell
.\backend\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

首页：http://127.0.0.1:3000 ，创建：http://127.0.0.1:3000/create ，接口文档：http://127.0.0.1:8000/docs 。后端配置只在启动时读取，修改配置后重启后端。不要混用 localhost 与 127.0.0.1 的匿名身份。

本次已恢复生产构建预览与新后端：首页和创建页返回 200，健康接口返回 stage=6。阶段 5 演示卡 GXU6QA9VVJ 仍可读取，状态 finalized、快照五条完整；此检查只读，没有修改已有房间。

## 手动验收

1. 无密钥直接打开首页；点击换批，静态例子立即切换，不等待模型。
2. 点“开始立宪”，选空间和边界，确认五条后点“生成我的宪法”。应进入真实房间，完整显示五条及接口；当前无配置时来源为 template。
3. 认领五条、定稿，继续复制全文与下载 PNG。模型未配置不会阻断这条流程。
4. 要验真实模型，在 `backend/.env` 填写提供商的 LLM_API_KEY、LLM_BASE_URL、LLM_MODEL 并重启。基址包含提供商要求的 `/v1` 等路径，不含 `/chat/completions`；远程必须 HTTPS。不要把密钥放前端或贴在公开文档。
5. 新建房间后主动生成一次；访问同一站点 `/api/rooms/房间码`，检查 rules[].source 是否为 llm（可混合 template）。这才表明模型结果被采用；健康检查正常不代表模型可用。已有草案不会因刷新重新请求模型。若模型超过 3 秒，应保存模板草案，不应白屏。

提供商须支持 Chat Completions、JSON object 输出、max_tokens 和非流式文本；若不支持会回退，本阶段不通过重复调用探测兼容选项。复制完整配置示例见 README。

## 实际测试结果

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\check.ps1
npm.cmd --prefix frontend run test:e2e
.\backend\.venv\Scripts\python.exe -m pip check
```

浏览器测试前停普通预览服务、腾出 8000/3100。测试自动建独立 SQLite、启动并结束服务，不写用户房间库。Python 测试清理真实模型环境变量，仅使用显式测试配置。

- 131 项 pytest 通过（原 61 项 + 新增 70 项），最终运行 6.67 秒；保留已有一项 Starlette TestClient 弃用提示。
- Ruff、规则静态数据同步、ESLint、TypeScript、Next.js 生产构建通过。
- 35 项 Playwright 全部通过，12.1 秒：覆盖首页无请求、完整创建/认领/替换/定稿、复制分享、实际 PNG 下载、手机布局。浏览器测试明确无真实模型配置，验证了回退可用性。
- 一项使用真实本地 HTTP 端口的兼容服务测试，走完认证请求、五条 JSON 回复、后端校验、入库和再次读取。该服务返回预设文案，没有调用真实大模型。
- 真实 3 秒总截止时间测试：模拟每 50ms 返回一个块，约 3 秒中止，检查协程取消及流关闭。另一个 API 测试压缩预算到 150ms，验证超时后保存模板、重试不再次调用。
- 并发相同生成请求只调用一次，重复请求不重生成；无权限、未确认建议、旧版本请求不调用模型。HTTP 重定向、401/429/500/503 不重试。
- 拒答、截断、各种错误结构、超长响应、攻击标题、变化阈值/接口、重复键和多余字段均有测试；单条异常保留其他四条合法改写。
- 确认请求不含群名、昵称、房间码与密钥正文；公开响应不含 real_friction，日志测试不包含密钥。
- 本地项目包重新安装为 0.6.0，pip check 无依赖冲突；没有更换锁文件中的第三方版本。

## 已知边界与下一阶段

- 未配置真实模型；外部服务的真实性能、实际输出质量和采用率尚未验证，不能宣称 AI 线上可用。没有公网部署。
- 模型仅改标题是有意收窄生成范围，以保护确认过的行为边界。过滤不能数学证明自然语言安全，未知隐喻仍可能漏检；保守过滤也可能让部分安全表达退回模板。上线前必须抽样审阅真实模型内容。
- 3 秒不含服务冷启动、数据库锁等待和用户网络。当前调用保留在既有事务中，SQLite 的其他写请求会短暂排队；阶段 7 需要验证 PostgreSQL 与并发负载。
- 外部调用成功但事务提交前进程崩溃，后续人工重试可能再次调用；正常并发、重试和已保存回退不会重复调用。不能承诺跨外部提供商和数据库的恰好一次执行。
- 此前开发工具链告警及 Safari/微信内置浏览器尚未验证的边界仍在；本阶段未增加前端依赖。

本阶段完成暂停。下一阶段 7：联调、错误处理、共享限流/可信代理、CORS、Dockerfile、render.yaml、PostgreSQL、部署文档和公网部署。
