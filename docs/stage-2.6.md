# 阶段 2.6：先说好 / 视觉游戏化与交互降噪

目标达成。2026-11-18 在已完成阶段 6 的基础上插入本阶段，阶段 7 部署暂停。新工作名称为「先说好」，表达相处开始前把小事提前说清，不改变规则的具体性、匿名认领、换条确认和不可变定稿流程。

## 本次实现

- 暖浅米色背景、纯白大圆角便签、薄荷绿主按钮、轻暖阴影；主入口「一起说好 5 件事」。品牌、页面标题、复制/分享名称和导出文件名统一。
- 首页右侧便签缩小，五条标题默认展开第一条，可单独点开或展开全部；具体动作和退路没有裁切。九组示例切换仍全部在浏览器内完成，不依赖后端和模型。
- 850ms 品牌开场、便签入场、按钮按压、骰子悬停、成功认领后一次 CSS 撒花；用户设置减少动态效果时静止呈现，无必须点击的封面。
- 空间和 15 个摩擦点提供 Emoji，执行接口显示为「退路 💡」，创建页保持三步，边界区默认只展开第一项；显示已选 n/5 和鼓励文案。
- 换条改为底部抽屉：灰色原版/划线动作、箭头、橘色边界变更、新版浅绿卡、明确清空旧认领的复选框。底部只有确认和取消；正文可滚动，底部操作留在可视区。
- 抽屉支持键盘焦点循环、Esc、遮罩关闭、请求中止及焦点恢复。预览失败可重试；提交失败且版本未变时，可用同一幂等编号重试。
- 预览后新增认领会使旧确认失效；新增兼容字段 expected_claim_count 在服务端事务内检查，避免浏览器尚未刷新时清空刚出现的认领。无数据库结构迁移。
- 新定稿口号为「我们，…，于 … 说好这五条。约定生效时刻：现在。」旧快照原文保留，没有批量改写历史房间。

## 实际创建/修改文件

以下路径均相对于项目根目录 `D:\比赛\Qoder\源代码`。

新增：

- `design.md`
- `frontend/src/app/playful.css`
- `frontend/src/components/brand-mark.tsx`
- `frontend/src/components/swap-sheet.tsx`
- `frontend/src/lib/presentation.ts`
- `docs/stage-2.6.md`

修改前端：

- `frontend/src/app/page.tsx`
- `frontend/src/app/layout.tsx`
- `frontend/src/app/icon.svg`
- `frontend/src/app/create/page.tsx`
- `frontend/src/app/room/[code]/page.tsx`
- `frontend/src/app/room/[code]/card/page.tsx`
- `frontend/src/components/example-explorer.tsx`
- `frontend/src/components/constitution-card.tsx`
- `frontend/src/components/create-flow.tsx`
- `frontend/src/components/room-client.tsx`
- `frontend/src/components/card-client.tsx`
- `frontend/src/components/final-constitution.tsx`
- `frontend/src/components/finalize-panel.tsx`
- `frontend/src/components/workflow-shell.tsx`
- `frontend/src/lib/card-content.ts`
- `frontend/tests/homepage.spec.ts`
- `frontend/tests/workflow.spec.ts`
- `frontend/tests/card.spec.ts`

修改后端与交付文档：

- `backend/app/schemas/rooms.py`：可选 expected_claim_count。
- `backend/app/services/rooms.py`：新定稿口号、原有事务内的认领人数检查。
- `backend/tests/test_rooms.py`：新口号断言、旧快照兼容、认领变化及重试保护。
- `README.md`
- `docs/architecture.md`
- `docs/api.md`
- `docs/acceptance.md`
- `scripts/check.ps1`

截图文件见下方链接。没有改写 `backend/data/app.db` 内已有房间，没有覆盖 `.env` / `.env.local`，没有新增 npm 依赖。

## 运行与验收

在项目根目录开两个终端：

```powershell
Set-Location 'D:\比赛\Qoder\源代码'
npm.cmd --prefix frontend run build
npm.cmd --prefix frontend run start
```

```powershell
Set-Location 'D:\比赛\Qoder\源代码'
$env:PYTHONUTF8 = '1'
.\backend\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

1. 打开 http://127.0.0.1:3000 ：看到短开场、品牌「先说好」、薄荷绿主按钮和较小的示例便签。桌面 1280×800 内主入口和默认便签完整可见。
2. 点击「换一组灵感」，示例立即变化；点任一条标题查看完整做法和退路，或展开全部。无需填写任何表格。
3. 点击「一起说好 5 件事」进入创建。选择一项边界，看到「已选 1/5」；确认补充建议并生成，进入真实房间。
4. 点击认领，保存成功后显示短暂的「接住啦！」和撒花。点击「这条我做不到，换一条」，看到抽屉；切换边界会重新预览并要求再次勾选。取消不修改原条文。
5. 五条均有人认领后定稿；检查新口号，复制全文、保存 PNG 和分享链接。旧定稿链接仍显示原快照口号。

开发模式可使用 `npm.cmd --prefix frontend run dev`，与生产预览不要同时占用 3000。

## 实测结果

- 规则库同步检查通过：9 组示例一致，内容未改动。
- Ruff、ESLint、TypeScript、Next 生产构建通过。
- pytest：**133 passed**。仍有一条既有 Starlette/httpx 测试适配弃用提示。
- Playwright / 已安装 Edge：**40 passed**，测试使用每次独立 SQLite，不触碰日常数据库。
- 首页 320、390、768、1280、1440 宽度无横向溢出，主入口位于首屏；桌面默认便签在 800px 高视口内。手机按需纵向滚动，不把整卡缩成小字。
- 九组示例全部动作/接口保持完整；无后端请求、无脚本阅读、键盘选择、减少动态效果和开场结束均通过。
- 创建/保存/刷新、独立匿名成员、认领失败不撒花、认领成功反馈、抽屉焦点循环/取消/中止/恢复、并发新增认领保护、失效重试均通过。
- 定稿、旧快照、复制拒绝回退、原生分享取消、PNG 失败重试及 320/390/1280 导出均通过。
- 已查看桌面与手机首页、手机创建页、换条抽屉、整卡预览和实际 PNG 图像；没有宣称逐帧录像验收。

复现自动验收：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\check.ps1
# 先停掉普通后端，确保 8000 与 3100 空闲
npm.cmd --prefix frontend run test:e2e
```

## 设计工具审查与限制

使用已安装的 Hallmark 与 design-taste-frontend。产品方向以用户的便签、Emoji、纯白卡、轻松对比交互为准，不增加营销区块、照片或外部字体。

Hallmark 对本次主页面/抽屉/新样式执行静态扫描和 --render：静态报告 8 FAIL / 54 REFLEX / 2 WARN。逐项归类：5 个 Emoji 和 2 个原版/新版标签是用户指定设计；1 个禁用按钮报告未合并全局 not-allowed 光标（实际有背景色/文字色/disabled 属性及 opacity:1）。其余主要是纯白卡和非 4px 微间距，保留用户要求与已实测排版。禁用态文字对比警告仅涉及不可操作按钮；主按钮正常态采用深绿文字。新标题显式分行，原样式含 balance。详见 design.md。

Hallmark 的渲染层未运行：本机该脚本找不到 puppeteer-core。Taste gate 返回 **GATE: ERROR**：浏览器检查无法遍历页面，layout checker 未识别浏览器，copy checker 未取得可检查页面。指定已安装 Edge 路径后工具仍复用错误状态；没有将其计为通过。实际浏览器验收由项目自身的 Edge Playwright 测试及截图检查完成。

只读代码复核提出的三项问题已处理：失败后可重试、并发认领会使确认失效、关闭抽屉后恢复触发按钮焦点；对应浏览器测试通过。

## 截图

- [桌面首页](screenshots/stage-2.6-home-desktop.png)
- [390 手机首页](screenshots/stage-2.6-home-mobile.png)
- [320 窄屏首页](screenshots/stage-2.6-home-320.png)
- [390 换条抽屉](screenshots/stage-2.6-swap-mobile.png)
- [320 换条抽屉](screenshots/stage-2.6-swap-320.png)
- [手机创建](screenshots/stage-2.6-create-mobile.png)
- [手机确认五条](screenshots/stage-2.6-review-mobile.png)
- [桌面草案](screenshots/stage-2.6-room-desktop.png)
- [真实导出 PNG](screenshots/stage-2.6-card-export.png)

## 已知问题与下一阶段

- 尚未部署公网；本机仍未配置真实模型，模板回退可完整体验。
- 「先说好」是本项目的新工作名称，尚未核查商标/域名。
- 手机整卡概览用于看全貌；阅读使用默认放大排版，PNG 保留 1440px 宽度。
- 样式以新文件覆盖旧设计，未来维护以 playful.css 为当前视觉系统；旧历史样式尚未进行删除清理。
- 两套技能自动渲染门禁尚未完整运行，详情如上。

本阶段结束暂停。用户确认继续后，返回阶段 7：部署配置、联调、PostgreSQL / 容器 / 公网验证；阶段 8 再完成比赛作品帖。
