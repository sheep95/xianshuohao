import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  outputDir: "../.cache/playwright/results",
  reporter: [["list"], ["json", { outputFile: "../.cache/playwright/report.json" }]],
  fullyParallel: true,
  workers: 2,
  use: {
    baseURL: "http://127.0.0.1:3100",
    channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === "win32" ? "msedge" : "chromium"),
    trace: "retain-on-failure",
  },
  webServer: [{
    command: process.platform === "win32" ? '"../backend/.venv/Scripts/python.exe" "../scripts/serve_e2e.py"' : "../backend/.venv/bin/python ../scripts/serve_e2e.py",
    url: "http://127.0.0.1:8000/health",
    reuseExistingServer: false,
    timeout: 30_000,
    env: { PYTHONUTF8: "1" },
  }, {
    command: "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 30_000,
    // Homepage tests independently block and reject API calls.
    env: { BACKEND_URL: "http://127.0.0.1:8000" },
  }],
});
