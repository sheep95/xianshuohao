# 公网部署

采用 Vercel 前端、Render Docker 后端、Supabase PostgreSQL。浏览器始终访问前端同源的 `/api/*`，由 Next.js 转发到 Render。匿名身份 Cookie 由浏览器保存在最终使用的前端域名下。演示、建房、加入和定稿请使用同一个 HTTPS 域名。

## 1. 上传源码并预留前端地址

在 GitHub 建一个空仓库，在项目根目录执行以下命令。替换 `OWNER/REPO` 为自己的仓库。提交前用 `git status --short` 确认没有真实的 `.env`、数据库、缓存或日志。

```powershell
git init -b main
git add .
git status --short
git commit -m "Prepare Xianshuohao for deployment"
git remote add origin https://github.com/OWNER/REPO.git
git push -u origin main
```

登录 Vercel，导入该仓库。框架选 **Next.js**，Root Directory 设为 `frontend`，Node.js 版本设为与 `package.json` 一致的 **24.x**。先记下项目的正式域名。可以先完成首次部署以分配域名，首页静态示例可以打开，房间功能等后端地址配置后再验收。

## 2. 配置数据库与后端

1. 登录 Supabase，新建项目，在 **Connect** 面板复制 **Session pooler** 的 PostgreSQL URI（端口通常为 `5432`）。用项目数据库密码替换占位符。密码包含 URL 保留字符时，需要对密码部分做百分号编码。保留面板提供的用户名和主机。
2. 登录 Render，从该仓库创建 **Blueprint**。仓库根目录的 `render.yaml` 会创建一个后端服务。按表格填写环境变量。确认平台显示的计划和费用后，再执行部署。
3. 查 Render 启动日志，确认 `Database upgraded to head.`，再访问后端的 `/ready`，应返回 HTTP 200 和 `{"status":"ready"}`。容器启动先运行 Alembic 迁移，再启动单进程 API。PostgreSQL 中并发启动的迁移会排队执行。

| Render 环境变量 | 填写内容 |
| --- | --- |
| `DATABASE_URL` | Supabase 完整 URI。保留原参数，并附加 `sslmode=require` 和 `connect_timeout=5`。无查询参数时用 `?` 开始，已有参数时用 `&`。 |
| `CORS_ORIGINS` | 形如 `["https://YOUR-PROJECT.vercel.app"]` 的 JSON 数组。使用实际前端域名，带协议，无路径。 |
| `APP_ENV`、`AUTO_MIGRATE` | Blueprint 已设为 `production` 和 `false`，应用启动只检查迁移版本，迁移由容器入口执行。 |
| `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL` | 可选。先留空验收模板生成，之后在 Render 私下填写兼容服务配置。 |

如果通过 Render 界面手工创建 Docker Web Service，Build Context 填 `backend`，Dockerfile 路径指向 `backend/Dockerfile`，健康检查路径填 `/ready`。后端 /health 仅用于存活检查。

## 3. 连接前端并验收

在 Vercel 项目的 **Settings → Environment Variables** 中设置 Production 的 `BACKEND_URL=https://YOUR-API.onrender.com`，地址末尾不要加 `/api`。保存后重新部署前端，让转发目标在构建时生效。浏览器验收：

1. 打开正式首页；读示例、点「换一批」，确认可立即切换。
2. 点「一起说好 5 件事」，选边界、确认建议、生成草案。开另一个浏览器会话，用邀请链接加入并认领，检查原窗口自动同步和刷新后身份。
3. 确认换条，再认领并定稿。用无痕窗口打开最终卡，测试复制、分享与保存 PNG。首次验收模型留空，验证模板路径。
4. 在真实比赛网络再次打开链接，检查首屏、写入以及闲置后的首次请求。免费服务可能休眠，评审演示前先检查 `/ready`。如果冷启动影响体验，换常驻后端计划后重新验收。

想快速核对生产转发和房间 API，可在项目根目录执行下列命令。它会创建一条测试房间记录，不需要给出平台凭证。

```powershell
$site = 'https://YOUR-PROJECT.vercel.app'
.\backend\.venv\Scripts\python.exe scripts/smoke_api.py --base-url $site --origin $site
```

返回 `PASS` 后，用正式域名打开输出中的 `frontend_card_path`。如果报 403「此来源不能修改房间」，检查实际访问的协议、域名和端口是否都与 `CORS_ORIGINS` 一致。换过前端域名后，同步更新白名单。若看见 429，等响应的 `Retry-After` 秒数后再试。

## 4. 可选的容器验证

需要本机已有 Docker，并由环境变量提供一个**独立的 PostgreSQL 测试库**连接串。命令会真实迁移该数据库。使用 HTTPS 反代验收生产 Cookie，或按步骤 3 在部署后的 HTTPS 站点验收。

```powershell
docker build -t xianshuohao-api ./backend
docker run --rm -p 127.0.0.1:8000:8000 -e DATABASE_URL -e APP_ENV=production -e 'CORS_ORIGINS=["https://YOUR-PROJECT.vercel.app"]' xianshuohao-api
```

部署默认单实例、单进程。写入限流默认每连接 IP 每分钟 60 次，不采用任意客户端提交的转发地址。如果代理合并客户端地址，多个访客可能共用额度；公网验收须在不同网络同时操作以检查实际表现。需要扩容时，先确认可信代理边界，再换用共享限流存储。不要把 `FORWARDED_ALLOW_IPS` 设为通配符。

推送更新前先跑本地验收。数据库升级前备份。若部署失败，在平台回退到前一个应用版本，并检查该版本与已迁移的数据库是否兼容。不要为了回退应用而自动降级生产数据库。
