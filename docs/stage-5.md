# 阶段 5：定稿与最终宪法卡

2026-11-18，阶段目标达成。已实现定稿、公开最终卡、宣誓句、复制全文、PNG 下载、分享链接和另开草案。没有修改后端 Python 业务逻辑或现有房间记录。

## 本阶段行为

1. 五条均有认领后，创建者勾选确认，再点击“定稿，生成宪法卡”。确认绑定当前房间版本，人数或规则发生变化后需要重新确认。连点仅提交一次；定稿响应丢失时读取已保存结果并提供卡片入口。
2. 最终卡在 `/room/[code]/card`，不登录、不加入房间也能阅读。使用后端已有的不可变快照，包括群名、空间、期限、真实参与人数、五条完整规则与执行接口、宣誓句及北京时间生效区间。认领昵称不进入最终卡。
3. 正常阅读模式适配窄屏并允许滚动；整卡预览按当前宽高缩放完整纸张，可随时切回阅读。最长群名和条文均不截断。
4. 保存图片在浏览器内进行，按需加载 html-to-image，固定 720px 布局、2 倍像素输出为 1440px 宽 PNG，高度随内容变化。图片与页面使用同一卡组件和快照。等待超过 20 秒或生成失败后，可重试、复制全文或整卡截图。
5. 复制包括全部条文、接口、宣誓句、期限与房间码。剪贴板被拒绝时显示可手动选中的完整文本。分享优先打开浏览器原生面板，否则复制公开卡片链接；取消分享不会显示成功。
6. “换一批，另开草案”保留当前空间进入创建页，原卡保持不变。已通过只表示至少一人认领，页面与导出均说明不代表全员一致同意。

## 实际新增与修改文件

新增：

- `frontend/src/app/room/[code]/card/page.tsx`：最终卡路由、格式校验与禁止索引。
- `frontend/src/components/card-client.tsx`：加载、故障恢复、缩放预览、复制、分享与图片下载。
- `frontend/src/components/final-constitution.tsx`：只接收定稿快照的卡片。
- `frontend/src/components/finalize-panel.tsx`：权限、认领完成条件及版本确认。
- `frontend/src/lib/card-content.ts`：条文排序、标题拆分、北京时间与完整文本。
- `frontend/src/app/card.css`：纸张卡、定稿面板、导出布局及窄屏适配。
- `frontend/tests/card.spec.ts`：13 项真实后端浏览器验收。
- `docs/stage-5.md`：本记录。
- `docs/screenshots/stage-5-card-export.png`：浏览器实际下载的 PNG。
- `docs/screenshots/stage-5-card-export-long-name.png`：长群名导出。
- `docs/screenshots/stage-5-card-mobile.png`：390px 正常阅读截图。
- `docs/screenshots/stage-5-card-overview-mobile.png`：320px 整卡截图。
- `docs/screenshots/stage-5-card-overview-desktop.png`：1280px 整卡截图。

修改：

- `frontend/src/components/room-client.tsx`：接入定稿、幂等请求与卡片跳转。
- `frontend/src/lib/room-api.ts`：完整快照类型。
- `frontend/src/app/layout.tsx`：引入卡片样式。
- `frontend/package.json`、`frontend/package-lock.json`：锁定 html-to-image 1.11.13。
- `scripts/check.ps1`：阶段 5 验收提示。
- `scripts/smoke_api.py`：输出新卡片路径，移除过期的“没有前端房间页”说明。
- `README.md`、`docs/architecture.md`、`docs/acceptance.md`：更新当前能力、快照与导出架构及验收入口。

后端已有 30 个 Python 文件与此前基线逐一核对，哈希全部相同。浏览器测试使用独立临时库，不触碰 `backend/data/app.db`；现有 `.env` 和 `.env.local` 未修改。

## 本地运行

在 `D:\比赛\Qoder\源代码` 下，两个终端分别运行；已有服务时不用重复启动：

```powershell
npm.cmd --prefix frontend run dev
```

```powershell
.\backend\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

打开 http://127.0.0.1:3000 。同一流程不要混用 localhost 与 127.0.0.1，以免使用不同匿名身份。

## 手动验收

1. 首页点“开始立宪”，完成空间、边界与五条确认，生成房间。
2. 认领五条；可以由一个人认领，人数仍为 1。勾选定稿确认，点击“定稿，生成宪法卡”。
3. 应跳到 `/room/房间码/card`，看到完整五条、执行接口、宣誓句与有效时间。窄屏点击“整卡预览”，整张纸缩小显示；点击“放大阅读”恢复。
4. 点击“复制全文”并粘贴到记事本；点击“保存图片”打开下载 PNG，检查第五条与宣誓句没有裁掉。点击“分享链接”，复制后用无痕窗口打开，无需加入即可看到同一份卡。
5. 点击“换一批，另开草案”，进入原空间的创建流程；回到原卡，应保持原规则、人数与日期。尚未定稿的房间访问 `/card` 会提示返回草案，不显示伪造最终卡。

也可运行 `scripts/smoke_api.py --base-url http://127.0.0.1:3000`，在当前数据库新增一个明确命名为“接口验收示例”的演示房间，输出可公开读取的卡片路径。该脚本会写入演示数据，不用于无写入检查。

本次已恢复本地 3000/8000 预览服务，首页与健康检查均返回 200；运行上述脚本得到 PASS，并新增一份演示卡：http://127.0.0.1:3000/room/GXU6QA9VVJ/card 。没有修改已有用户房间。服务停止后按本页命令重启，保留数据库即可继续查看。

## 实际验收结果

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\check.ps1
npm.cmd --prefix frontend run test:e2e
npm.cmd --prefix frontend audit --omit=dev --cache .cache/npm
```

浏览器测试前确保 8000、3100 空闲，自动启动独立测试服务，结束自动关闭。测试使用生产构建，不复用用户数据库。

- 规则数据同步、Ruff、ESLint、TypeScript、Next.js 生产构建通过。
- 61 项 pytest 通过，保留一项已有 Starlette TestClient 弃用提示。
- 35 项 Playwright 全部通过，最后一轮 12.0 秒、退出码 0。包含此前 22 项与新增 13 项。
- 新增覆盖：五条认领条件、创建者权限、定稿连点、响应丢失恢复、旧版本重新确认、公开查看、草案不冒充最终卡、复制全文及拒绝回退、分享取消及调用数据、只读快照、404/503 恢复、图片失败后实际重试下载。
- 320、390、1280px 下分别真实下载 PNG，检查 PNG 签名、宽度 1440px、高度和非空内容；阅读与整卡模式没有横向溢出，整卡高度符合 900px 视口。320px 使用接近长度上限的群名。
- 人工查看实际 PNG、长群名 PNG、手机阅读与手机/桌面整卡截图，五条及底部宣誓句完整，无按钮或昵称混入。
- 运行依赖审计 0 项告警。安装图片库时完整开发工具链仍有此前 14 项 high 告警，未通过升级全套框架来扩大本阶段范围。

## 已知问题与下一阶段

- 目前是本地可运行版本，未部署公网；本地链接不能直接发给其他电脑访问。当前生成仍用模板，AI 在阶段 6 接入。
- 实际浏览器与下载验证为 Windows Edge；原生分享面板的成功/取消分支由浏览器桩验证，没有向其他应用或联系人发送内容。iOS Safari、微信内置浏览器及真实系统分享仍需部署后检查。
- PNG 使用系统字体，不同系统字形可能略有不同；浏览器可能要求用户确认保存位置。整卡模式文字会缩小，长文本请切回阅读或打开导出图放大。
- 剪贴板与原生分享能力受浏览器权限及 HTTPS 条件影响，已提供完整文本/链接回退。最终卡访问仍依赖后端，服务不可用时提供重试；静态首页始终独立可用。
- 没有重新核验此前设计插件渲染检查失败，不宣称插件全套审查通过；本次验收依据实际 Edge 测试和截图。
- 清除 Cookie 无法恢复旧创建者权限，沿用此前匿名模式边界。PostgreSQL、容器与公网部署尚待阶段 7 验证。

本阶段结束暂停。下一阶段 6：模型约束改写、自检、后端输出校验、3 秒超时及无密钥模板回退。
