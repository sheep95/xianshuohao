# 阶段 1 实际文件清单

以下是本阶段创建的源代码、依赖清单、配置模板与文档；不包含依赖目录、构建产物、缓存或截图。

```text
.editorconfig
.env.example
.gitignore
README.md
backend/.env.example
backend/app/__init__.py
backend/app/api/__init__.py
backend/app/api/health.py
backend/app/core/__init__.py
backend/app/core/config.py
backend/app/data/__init__.py
backend/app/data/rule_library.json
backend/app/main.py
backend/app/models/__init__.py
backend/app/schemas/__init__.py
backend/app/schemas/health.py
backend/app/schemas/library.py
backend/app/services/__init__.py
backend/app/services/rule_library.py
backend/pyproject.toml
backend/requirements.lock.txt
backend/tests/conftest.py
backend/tests/test_health.py
backend/tests/test_rule_library.py
backend/tests/test_settings.py
docs/acceptance.md
docs/api.md
docs/architecture.md
docs/friction-matrix.md
docs/rule-engine.md
docs/stage-1-files.md
frontend/.env.example
frontend/.npmrc
frontend/eslint.config.mjs
frontend/next-env.d.ts
frontend/next.config.ts
frontend/package-lock.json
frontend/package.json
frontend/postcss.config.mjs
frontend/src/app/globals.css
frontend/src/app/icon.svg
frontend/src/app/layout.tsx
frontend/src/app/page.tsx
frontend/src/data/examples.json
frontend/tsconfig.json
scripts/check.ps1
scripts/setup.ps1
scripts/sync_examples.py
```

安装脚本另生成 backend/.env、frontend/.env.local（仅本地配置，不提交）、backend/.venv 和依赖 / 缓存目录。

本机页面验证截图保存在 .cache/qa/，属于可重新生成的本地验收产物。
