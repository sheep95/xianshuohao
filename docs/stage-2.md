# 阶段 2：后端可运行闭环

## 目标与结果

实现数据库模型、迁移、房间、匿名加入、模板生成、认领、换条、定稿与基础测试。前端保持阶段 1，不提前进入阶段 3；本阶段无需模型密钥或登录。

## 实际新增文件

```text
backend/alembic.ini
backend/alembic/env.py
backend/alembic/script.py.mako
backend/alembic/versions/0001_initial_rooms.py
backend/app/api/rooms.py
backend/app/core/database.py
backend/app/core/errors.py
backend/app/core/migrate.py
backend/app/core/security.py
backend/app/models/entities.py
backend/app/schemas/rooms.py
backend/app/services/rooms.py
backend/app/services/rule_engine.py
backend/tests/test_rooms.py
backend/tests/test_database.py
scripts/smoke_api.py
docs/stage-2.md
```

## 实际修改文件

```text
backend/pyproject.toml
backend/requirements.lock.txt
backend/.env.example
backend/app/main.py
backend/app/core/config.py
backend/app/schemas/health.py
backend/tests/conftest.py
backend/tests/test_health.py
scripts/sync_examples.py
scripts/check.ps1
README.md
docs/api.md
docs/architecture.md
docs/rule-engine.md
docs/acceptance.md
```

另产生被忽略的 backend/data/app.db、虚拟环境和测试缓存。库内示例和 frontend/src/data/examples.json 内容保持一致，未修改网页设计。

## 本地运行与验收

项目根目录分别运行：

```powershell
npm.cmd --prefix frontend run dev
.\backend\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
```

打开 http://localhost:8000/docs，按 [API 文档的五步验收](api.md)创建房间、生成 5 条规则、逐条认领并定稿。所有 POST 的 X-CSRF-Protection 填 1，生成/定稿/确认换条带独立 Idempotency-Key。

自动走通真实服务（会写入一个“接口验收示例”房间）：

```powershell
.\backend\.venv\Scripts\python.exe scripts/smoke_api.py
.\backend\.venv\Scripts\python.exe scripts/smoke_api.py --base-url http://127.0.0.1:3000
```

预期输出 PASS、finalized、5 条规则、1 位参与者及可读取的房间 API 链接。它是接口数据链接，尚不是前端宪法卡页面。

完整代码检查：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\check.ps1
```

## 验证记录

本轮已实际完成：

| 检查 | 结果 |
| --- | --- |
| pytest | 61 项通过；保留 1 项上游 TestClient 弃用提示 |
| Ruff、TypeScript、ESLint | 全部通过 |
| Next.js 生产构建 | 通过，首页保持静态 |
| 迁移 | 临时 SQLite 库 upgrade / downgrade / upgrade 通过，重复升级安全，与 SQLModel 元数据一致 |
| 持久化 | 重启后房间、规则及创建者身份保持一致 |
| 权限 | 同名不冒认、跨房间拒绝操作、非创建者拒绝定稿、公开响应隐藏昵称 |
| 并发与幂等 | 并发重复生成/认领不重复，竞争替换只成功一次，旧版本请求返回 409 |
| 条文约束 | 替换表达保留动作；水位变更需确认；旧认领清空；未全部认领不能定稿 |
| 日期 | 北京时间通过日期与 UTC 时间戳、有效期计算通过 |
| 静态数据 | 9 套示例与前端 JSON 一致，未调用模型 |
| 依赖 | pip check 通过，锁文件包含 40 项依赖 |
| 真实 HTTP 全流程 | 直接访问 8000 和经过前端 3000 的 /api 转发均 PASS |

本轮保留两个标为“接口验收示例”的本地定稿房间：J99EGUVUZA（直接后端）和 WRJVGKKPJ8（经前端转发），用于检查返回的 snapshot。它们是本地数据，不是公网发布。

## 已知问题与下一阶段

- 尚未连接真实 PostgreSQL；目前使用 SQLite，迁移往返及模型一致性在临时 SQLite 库验证。
- 限流为单进程窗口，反向代理后的真实客户端 IP 和多实例共享限流留待部署阶段。
- 无账户模式不提供创建者凭证找回，清除 Cookie 或超过 180 天有效期后不能恢复原创建者权限。
- 上游 TestClient 弃用提示未隐藏。历史 npm 告警见 README，本阶段未重新审计未变更的前端依赖。
- 创建、认领、卡片等前端页面尚未实现；AI 尚未接入；未部署公网。
- 下一阶段：正式首页、完整静态宪法卡与换示例按钮，结合两个设计 skill 改善视觉，仍保持首屏不依赖后端或模型。
