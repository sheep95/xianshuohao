import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { Room } from "../src/lib/room-api";
import { cardPlainText, orderedCardRules } from "../src/lib/card-content";

const headers = { "X-CSRF-Protection": "1" };
async function draft(page: Page, claimed = 5, groupName = "一起住的橘子小队") {
  const created = await page.request.post("/api/rooms", { headers, data: { space_type: "shared_home", group_name: groupName, nickname: "仅成员可见的昵称" } });
  expect(created.status()).toBe(201);
  let room: Room = await created.json();
  const generated = await page.request.post("/api/rooms/" + room.code + "/generate", { headers: { ...headers, "Idempotency-Key": crypto.randomUUID() }, data: { expected_revision: room.revision, confirm_suggestions: true } });
  room = await generated.json();
  for (const rule of room.rules.slice(0, claimed)) {
    const response = await page.request.post("/api/rules/" + rule.id + "/claim", { headers, data: { expected_version: rule.version } });
    expect(response.ok()).toBe(true); room = await response.json();
  }
  return room;
}
async function finalized(page: Page, groupName?: string) {
  const room = await draft(page, 5, groupName);
  const result = await page.request.post("/api/rooms/" + room.code + "/finalize", { headers: { ...headers, "Idempotency-Key": crypto.randomUUID() }, data: { expected_revision: room.revision } });
  expect(result.ok()).toBe(true);
  return await result.json() as Room;
}

test("owner confirms finalization once; public card matches the immutable snapshot", async ({ page, browser }) => {
  const room = await draft(page, 4);
  await page.goto("/room/" + room.code);
  await expect(page.getByRole("button", { name: "定稿，生成约定卡" })).toBeDisabled();
  await page.getByRole("button", { name: "我来认领这条", exact: true }).click();
  await page.getByRole("checkbox", { name: /我确认定稿当前五条/ }).check();
  let requests = 0;
  page.on("request", (request) => { if (request.method() === "POST" && request.url().endsWith("/finalize")) requests++; });
  await page.getByRole("button", { name: "定稿，生成约定卡" }).dblclick();
  await expect(page).toHaveURL(new RegExp("/room/" + room.code + "/card$"));
  await expect(page.locator(".card-view .final-card-rules li")).toHaveCount(5);
  expect(requests).toBe(1);
  const saved: Room = await (await page.request.get("/api/rooms/" + room.code)).json();
  const snapshot = saved.snapshot!;
  await expect(page.locator(".card-view .final-oath")).toHaveText(snapshot.oath);
  for (const [index, rule] of orderedCardRules(snapshot).entries()) {
    const row = page.locator(".card-view .final-card-rules li").nth(index);
    const text = (await row.locator("h3").innerText()) + (await row.locator(".final-rule-action").innerText());
    expect(text.replace(/\s/g, "")).toBe(rule.text.replace(/\s/g, ""));
    await expect(row.locator(".final-rule-hint")).toContainText(rule.execution_hint);
  }
  await expect(page.locator(".card-view")).not.toContainText("仅成员可见的昵称");
  const context = await browser.newContext();
  try {
    const publicPage = await context.newPage();
    await publicPage.goto(page.url());
    await expect(publicPage.locator(".card-view .final-oath")).toHaveText(snapshot.oath);
    await expect(publicPage.getByRole("button", { name: "保存图片" })).toBeVisible();
    await expect(publicPage.getByRole("button", { name: "匿名加入房间" })).toHaveCount(0);
    await expect(publicPage.locator(".card-view")).not.toContainText("仅成员可见的昵称");
    await publicPage.getByRole("link", { name: "换一批，另开草案" }).click();
    await expect(publicPage).toHaveURL(/create\?space=shared_home/);
  } finally { await context.close(); }
  expect((await (await page.request.get("/api/rooms/" + room.code)).json()).snapshot).toEqual(snapshot);
});

test("members cannot finalize and a draft URL cannot masquerade as a final card", async ({ page, browser }) => {
  const room = await draft(page);
  const context = await browser.newContext();
  try {
    const guest = await context.newPage();
    await guest.goto("http://127.0.0.1:3100/room/" + room.code);
    await guest.getByRole("button", { name: "匿名加入房间" }).click();
    await expect(guest.getByText("等创建者确认定稿，就能拿到最终卡片。")).toBeVisible();
    await expect(guest.getByRole("button", { name: "定稿，生成约定卡" })).toHaveCount(0);
    await guest.goto("http://127.0.0.1:3100/room/" + room.code + "/card");
    await expect(guest.getByRole("heading", { name: "这份草案，还没定稿。" })).toBeVisible();
    await expect(guest.getByRole("button", { name: "保存图片" })).toHaveCount(0);
  } finally { await context.close(); }
});

test("lost finalization reply recovers the committed card without another finalize", async ({ page }) => {
  const room = await draft(page);
  let posts = 0;
  await page.route("**/api/rooms/*/finalize", async (route) => { posts++; await route.fetch(); await route.abort("failed"); });
  await page.goto("/room/" + room.code);
  await page.getByRole("checkbox", { name: /我确认定稿当前五条/ }).check();
  await page.getByRole("button", { name: "定稿，生成约定卡" }).click();
  await expect(page.getByRole("link", { name: "查看最终约定卡" })).toBeVisible();
  await page.getByRole("link", { name: "查看最终约定卡" }).click();
  await expect(page.locator(".card-view .final-oath")).toContainText("约定生效时刻：现在。");
  expect(posts).toBe(1);
});

test("stale room revision requires rereading and reconfirming before finalization", async ({ page, browser }) => {
  const room = await draft(page);
  await page.goto("/room/" + room.code);
  await page.getByRole("checkbox", { name: /我确认定稿当前五条/ }).check();
  const context = await browser.newContext();
  try {
    await context.request.post("http://127.0.0.1:3100/api/rooms/" + room.code + "/join", { headers, data: { nickname: "后来加入" } });
    await page.getByRole("button", { name: "定稿，生成约定卡" }).click();
    await expect(page.locator(".feedback[role=alert]")).toContainText("房间有新变化");
    await expect(page.getByRole("checkbox", { name: /我确认定稿当前五条/ })).not.toBeChecked();
    await expect(page.getByRole("button", { name: "定稿，生成约定卡" })).toBeDisabled();
    await expect(page.getByTestId("participant-count")).toHaveText("2 人已加入");
  } finally { await context.close(); }
});

test("copy full text and share link; fallback is complete when clipboard is denied", async ({ page, context }) => {
  const room = await finalized(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => Object.defineProperty(navigator, "share", { configurable: true, value: undefined }));
  await page.goto("/room/" + room.code + "/card");
  await page.getByRole("button", { name: "复制全文" }).click();
  await expect(page.locator(".toast-region")).toContainText("约定全文已复制");
  // Windows clipboard uses CRLF; compare the complete content after newline normalization.
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n")).toBe(cardPlainText(room.snapshot!));
  await page.getByRole("button", { name: "分享链接" }).click();
  await expect(page.locator(".toast-region")).toContainText("卡片链接已复制");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("http://127.0.0.1:3100/room/" + room.code + "/card");
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("denied")) } }));
  await page.getByRole("button", { name: "复制全文" }).click();
  await expect(page.getByRole("textbox", { name: "手动复制约定全文" })).toHaveValue(cardPlainText(room.snapshot!));
  await page.getByRole("button", { name: "分享链接" }).click();
  await expect(page.getByRole("textbox", { name: "手动复制卡片链接" })).toHaveValue("http://127.0.0.1:3100/room/" + room.code + "/card");
});

test("native sharing cancel is not reported as success", async ({ page }) => {
  const room = await finalized(page);
  await page.addInitScript(() => Object.defineProperty(navigator, "share", { configurable: true, value: () => Promise.reject(new DOMException("cancelled", "AbortError")) }));
  await page.goto("/room/" + room.code + "/card");
  await page.getByRole("button", { name: "分享链接" }).click();
  await expect(page.locator(".toast-region")).toHaveText("已取消分享，卡片仍在这里。");
});

test("native sharing receives the public final-card link", async ({ page }) => {
  const room = await finalized(page);
  await page.addInitScript(() => Object.defineProperty(navigator, "share", { configurable: true, value: async (data: ShareData) => { document.documentElement.dataset.shared = JSON.stringify(data); } }));
  await page.goto("/room/" + room.code + "/card");
  await page.getByRole("button", { name: "分享链接" }).click();
  await expect(page.locator(".toast-region")).toHaveText("分享面板已完成操作。");
  const shared = JSON.parse((await page.locator("html").getAttribute("data-shared"))!);
  expect(shared.url).toBe("http://127.0.0.1:3100/room/" + room.code + "/card");
  expect(shared.title).toBe("先说好｜" + room.snapshot!.group_name);
});

test("failed PNG rendering restores the save button and allows a real retry", async ({ page }) => {
  const room = await finalized(page);
  await page.goto("/room/" + room.code + "/card");
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function () {
      HTMLCanvasElement.prototype.toBlob = original;
      throw new Error("test-render-failed");
    };
  });
  await page.getByRole("button", { name: "保存图片" }).click();
  await expect(page.locator(".feedback[role=alert]")).toContainText("图片暂时没生成成功");
  await expect(page.getByRole("button", { name: "保存图片" })).toBeEnabled();
  await expect(page.locator(".card-view .final-card-rules li")).toHaveCount(5);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "保存图片" }).click();
  expect((await downloading).suggestedFilename()).toContain(room.code);
  await expect(page).toHaveURL(/\/\?intro=1$/);
  await expect(page.getByRole("dialog", { name: "先说好。" })).toBeVisible();
});

test("card renders snapshot fields even when mutable room view differs", async ({ page }) => {
  const room = await finalized(page);
  await page.route("**/api/rooms/" + room.code, async (route) => {
    await route.fulfill({ json: { ...room, group_name: "错误的当前名称", participant_count: 999, duration: "错误时长", rules: room.rules.map((rule) => ({ ...rule, text: "错误草案", execution_hint: "错误接口" })) } });
  });
  await page.goto("/room/" + room.code + "/card");
  await expect(page.locator(".card-view .final-group-name")).toHaveText(room.snapshot!.group_name);
  await expect(page.locator(".card-view")).not.toContainText("错误");
  await expect(page.locator(".card-view .final-card-meta")).toContainText("1 人");
});

test("missing and temporarily unavailable cards offer a retry without false content", async ({ page }) => {
  await page.goto("/room/ZZZZZZZZZZ/card");
  await expect(page.getByRole("heading", { name: "这张卡还没找到。" })).toBeVisible();
  const room = await finalized(page);
  await page.route("**/api/rooms/" + room.code, (route) => route.fulfill({ status: 503, json: { detail: { message: "暂时无法读取" } } }));
  await page.goto("/room/" + room.code + "/card");
  await expect(page.locator("p[role=alert]")).toContainText("暂时无法读取");
  await expect(page.getByRole("button", { name: "保存图片" })).toHaveCount(0);
  await page.unroute("**/api/rooms/" + room.code);
  await page.getByRole("button", { name: "重新加载卡片" }).click();
  await expect(page.locator(".card-view .final-card-rules li")).toHaveCount(5);
});

for (const width of [320, 390, 1280]) test("readable, overview and actual PNG export at " + width, async ({ page }, testInfo) => {
  const room = await finalized(page, width === 320 ? "这是一群刚刚凑齐并且群名恰好很长但仍然要完整印在约定卡上的临时同伴们" : undefined);
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/room/" + room.code + "/card");
  await expect(page.locator(".card-view .final-card-rules li")).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("card-readable-" + width + ".png"), fullPage: true });
  await page.getByRole("button", { name: "整卡预览" }).click();
  const frame = page.locator(".card-view");
  await expect(frame).toHaveClass(/is-overview/);
  await expect.poll(async () => (await frame.boundingBox())!.height).toBeLessThanOrEqual(760);
  const card = page.locator(".card-view .final-constitution");
  const box = (await card.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("card-overview-" + width + ".png") });
  await page.getByRole("button", { name: "放大阅读" }).click();
  await expect(frame).not.toHaveClass(/is-overview/);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "保存图片" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("先说好-" + room.code + "-" + room.snapshot!.adopted_date + ".png");
  const path = testInfo.outputPath("export-" + width + ".png");
  await download.saveAs(path);
  const bytes = await readFile(path);
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(bytes.readUInt32BE(16)).toBe(1440);
  expect(bytes.readUInt32BE(20)).toBeGreaterThan(900);
  expect(bytes.length).toBeGreaterThan(30_000);
  await expect(page.getByRole("dialog", { name: "先说好。" })).toBeVisible();
});

test("finish returns to the opening without requiring an image download", async ({ page }) => {
  const room = await finalized(page);
  await page.goto("/room/" + room.code + "/card");
  await page.getByRole("link", { name: "完成，回到引导页" }).click();
  await expect(page.getByRole("dialog", { name: "先说好。" })).toBeVisible();
});

