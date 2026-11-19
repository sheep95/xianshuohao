# 前端视觉与交互精修

仅修改前端，后端 API、数据库和业务数据流未改动。

## 素材
- 图标：lucide-react 1.75.0（ISC 许可），替换界面里的 Emoji 图标。
- 照片：`frontend/public/images/shared-home.jpg`，来自 Unsplash（photo-1522708323590-d24dbb6b0267，Unsplash License），用于首页。
- 点阵背景、胶带、便签阴影由 CSS 实现。

## 动画
- 路由：React 19.3 `<ViewTransition>` 配合 Next 16 `transitionTypes`。首页到创建页、创建页到房间、房间到约定卡向前滑入，回首页向后滑入，其余情况淡入上浮。不支持的浏览器直接切换，不会白屏。
- 折叠：边界选项和首页示例使用 `::details-content` 高度过渡。
- 反馈：按钮悬浮上浮、按下缩小到 0.95；认领成功后盖章并撒花，换条成功后卡片描边高亮、对勾弹入。
- 开启“减少动态效果”时，以上动画全部关闭。

## 认领页
单列留言墙：每行一张横向便签，左侧是图标和序号，中间是规则，右侧是操作。认领后，左侧变为薄荷色。768 像素宽时操作按钮移到正文下方，手机上整张卡片纵向堆叠。

## 文件
新增 `src/app/studio.css`、`src/components/page-transition.tsx`、`src/lib/presentation.tsx`（替换 `.ts`）、`public/images/shared-home.jpg`。
修改 `layout.tsx`、`page.tsx`、`example-explorer.tsx`、`constitution-card.tsx`、`create-flow.tsx`、`room-client.tsx`、`swap-sheet.tsx`、`final-constitution.tsx`、`workflow-shell.tsx`、`package.json`、`tests/workflow.spec.ts`（布局断言改为单列）。

## 验证
lint、typecheck、build 通过；Playwright 43/43 通过。截图见 `docs/screenshots/studio-*.png`。
