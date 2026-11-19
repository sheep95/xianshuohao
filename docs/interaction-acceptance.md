# 先说好 · 交互验收

2026 年 11 月 18 日，本机生产构建与 Edge 浏览器验收通过。前端继续使用 Next.js，界面通过 CSS 完成入场、折叠和保存反馈。新增 Toast 共用于房间和定稿卡。

| 操作 | 实测结果 |
| --- | --- |
| 从首页创建短租房间 | 选择空间、勾选一项边界、确认四项建议后生成五条草案 |
| 第二人加入并认领 | 两个独立浏览器上下文分别认领，双方均在可见页面的 8 秒轮询中自动看到对方昵称 |
| 双方刷新再定稿 | 刷新后各自 participant_id、创建者权限和自己的认领都保持。定稿后同伴自动看到已定稿，快照记录两人五条 |
| 无模型密钥 | 浏览器测试服务明确关闭密钥，五条 source 均为 template，双人走完定稿流程 |
| 模型超时与失败 | pytest 使用模拟供应商验证网络故障、错误响应、超时取消、模板持久化与幂等重试，并验证回退草案可继续认领和定稿 |
| 认领并发 | 同一房间的 8 位成员并发认领每条规则，再完整重放一轮。80 次请求均成功，最终五条各 8 个认领，房间版本只累计 8 次加入与 40 次有效认领 |
| 布局与动效 | 浏览器测量每行卡片实际位置，1280 像素为 3+2，768 为 2+2+1，390 和 320 为单列，各行居中误差小于 1 像素。逐帧测得边界展开及收起均经过中间高度，减少动态效果时直接完成 |
| 导出与反馈 | 定稿后可保存 PNG、复制全文和分享链接。已覆盖实际 PNG 下载、剪贴板拒绝与手动复制、分享取消和生成失败重试 |

结果为 133 项 pytest、43 项 Playwright 浏览器及接口场景全部通过。规则库同步、Ruff、ESLint、TypeScript 和 Next 生产构建通过。pytest 有一条已有的 Starlette/httpx 测试适配弃用提示。并发结果针对本机独立 SQLite 测试库，未测公网容量。暂不支持原生高度插值的浏览器使用原生即时折叠。第三方模型故障通过模拟注入验证。

启动方式见 [README](../README.md)。运行完整复查时，先在项目根目录执行 `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\check.ps1`，再确保测试端口 3100 和 8000 空闲，执行 `npm.cmd --prefix frontend run test:e2e`。

本次新增 `frontend/src/components/toast.tsx`、`frontend/tests/interaction.spec.ts` 和本记录。改动位于 `frontend/src/app/playful.css`、`frontend/src/components/create-flow.tsx`、`frontend/src/components/room-client.tsx`、`frontend/src/components/card-client.tsx`、`frontend/tests/card.spec.ts` 和 `frontend/tests/workflow.spec.ts`。
