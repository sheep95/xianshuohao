# 阶段 7 联调与部署验收

本地联调和部署配置已完成。公网部署、真实 PostgreSQL 和 Docker 运行验收待完成。

| 验收项 | 结果 |
| --- | --- |
| 本地开发服务 | 127.0.0.1:3000 前端、127.0.0.1:8000 后端，数据库就绪检查通过 |
| 本地真实入口 | 带 3000 端口的 Origin，通过前端转发完成创建、生成、预览换条、认领、定稿和匿名读取 |
| 后端与构建 | 134 项 pytest 通过；Ruff、示例数据同步、前端 lint、TypeScript、生产构建通过 |
| 浏览器 | 46 项 Playwright 通过，覆盖动画、示例离线、双人同步、刷新保留身份、无密钥模板回退、换条和 PNG 导出 |
| 写入保护 | 明确来源名单、未知来源 403、生产 Cookie 的 Secure 标志、限流 429 与 Retry-After 均有测试 |
| 部署配置 | Blueprint YAML 可解析、路径存在、入口脚本语法检查通过；Alembic 可离线生成 PostgreSQL 迁移 SQL |
| 真实部署环境 | 当前没有 Docker、PostgreSQL 服务及已连接的部署平台项目，尚无公网 URL，也未验证容器镜像构建与真实数据库迁移 |

改动文件：

- 部署：根目录 `render.yaml` 和 `.gitattributes`，以及 `backend/Dockerfile`、`backend/.dockerignore`、`backend/docker-start.sh`。
- 服务：`backend/app/api/health.py` 增加就绪检查，`backend/app/core/database.py` 串行化 PostgreSQL 迁移，`backend/app/core/security.py` 收紧写入来源。
- 交互和测试：`frontend/src/components/create-flow.tsx` 区分建房被拒绝和结果未知，修改 `backend/tests/test_health.py`、`backend/tests/test_database.py`、`scripts/smoke_api.py` 和 `scripts/check.ps1`。
- 配置和说明：根目录与后端的 `.env.example`、`README.md`、`docs/architecture.md`、`docs/deployment.md` 和本文件。

本地命令见 [README](../README.md#本地运行)。从 `http://127.0.0.1:3000` 打开，点「一起说好 5 件事」，确认五条后点「生成我的约定」。看到真实房间码和可认领的五条规则，即可继续验证换条及定稿。也可直接打开此次接入验收生成的卡片 `/room/7TX7PE6D8C/card`。

后续按 [公网部署](deployment.md) 创建平台项目，接通数据库和前端域名，跑完真实 HTTPS 验收。检查冷启动和多个网络同时写入时的限流表现。阶段 8 将交付作品帖和 30 秒演示路径。
