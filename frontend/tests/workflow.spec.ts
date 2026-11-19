import { expect, test, type Page } from "@playwright/test";
import type { Room } from "../src/lib/room-api";

const headers = { "X-CSRF-Protection": "1" };
async function seed(page: Page, generate = true) {
  const response = await page.request.post("/api/rooms", { headers, data: { space_type: "shared_home", group_name: "浏览器验收小分队", nickname: "创建者" } });
  expect(response.status()).toBe(201);
  let room: Room = await response.json();
  if (generate) {
    const generated = await page.request.post("/api/rooms/" + room.code + "/generate", { headers: { ...headers, "Idempotency-Key": crypto.randomUUID() }, data: { expected_revision: room.revision, confirm_suggestions: true } });
    expect(generated.ok()).toBe(true); room = await generated.json();
  }
  return room;
}

test("create from homepage, confirm suggested boundaries, save and reload claims", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("link", { name: "一起说好 5 件事" }).click();
  await expect(page.locator(".scene-choices")).not.toContainText(/一周|三天|一学期/);
  await page.getByRole("textbox", { name: /房间号/ }).fill("周末新入住");
  await page.getByRole("textbox", { name: /你的昵称/ }).fill("橘子");
  await page.getByRole("button", { name: "下一步，选在意的点" }).click();
  const sound = page.locator('[data-friction="night_sound"]');
  await sound.getByRole("radio").first().check();
  await expect(sound.locator(".behavior-choice").first().getByRole("textbox", { name: /自定义退路/ }))
    .toHaveAttribute("placeholder", "例如：耳机没电就先开字幕、把声音关掉");
  await sound.getByRole("radio").nth(1).check();
  const customHint = "先静音，群里回一个收到。";
  const customField = sound.locator(".behavior-choice").nth(1).getByRole("textbox", { name: /自定义退路/ });
  await expect(customField).toHaveAttribute("placeholder", "例如：想继续听就戴耳机，找不到就先看字幕");
  await customField.fill(customHint);
  await expect(page.getByText("已选 1/5", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "下一步，看看这五条" }).click();
  await expect(page.locator(".suggested-label")).toHaveCount(4);
  await expect(page.locator(".review-selections")).toContainText(customHint);
  await page.getByRole("checkbox", { name: /我看过这 4 条补充建议/ }).check();
  let creates = 0;
  page.on("request", (request) => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/rooms") creates++; });
  await page.getByRole("button", { name: "生成我的约定" }).dblclick();
  await expect(page).toHaveURL(new RegExp("/room/[A-Z0-9]{10}$"));
  await expect(page.locator(".draft-rule")).toHaveCount(5);
  expect(creates).toBe(1);
  await expect(page.getByTestId("participant-count")).toHaveText("1 人已加入");
  await page.getByRole("button", { name: "我来认领这条", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "我已认领", exact: true })).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".draft-interface").first()).toContainText(customHint);
  await expect(page.getByRole("button", { name: "我已认领", exact: true })).toHaveCount(1);
  await expect(page.getByText("橘子", { exact: false }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("five friction limit, cancellation and space change reset", async ({ page }) => {
  await page.goto("/create");
  await page.getByRole("button", { name: "下一步，选在意的点" }).click();
  const sections = page.locator(".friction-choice");
  for (let i = 0; i < 5; i++) {
    const section = sections.nth(i);
    if (!(await section.getAttribute("open"))) { if (!(await section.evaluate((el) => (el as HTMLDetailsElement).open))) await section.locator("summary").click(); }
    await section.getByRole("radio").first().check();
  }
  await expect(page.getByText("已选 5/5", { exact: true })).toBeVisible();
  const sixth = sections.nth(5);
  await sixth.locator("summary").click();
  await expect(sixth.getByRole("radio").first()).toBeDisabled();
  await sections.first().getByRole("button", { name: "取消这项" }).click();
  await expect(sixth.getByRole("radio").first()).toBeEnabled();
  await page.getByRole("button", { name: "上一步", exact: true }).click();
  await page.getByRole("radio", { name: /短租/ }).check();
  await page.getByRole("button", { name: "下一步，选在意的点" }).click();
  await expect(page.getByText("已选 0/5", { exact: true })).toBeVisible();
});

test("independent participants, owner-only swap, explicit boundary change and re-claim", async ({ page, browser }) => {
  const room = await seed(page);
  const url = "http://127.0.0.1:3100/room/" + room.code;
  await page.goto(url);
  const first = page.locator(".draft-rule").first();
  await first.getByRole("button", { name: "我来认领这条" }).click();
  const context = await browser.newContext();
  const guest = await context.newPage();
  try {
    await guest.goto(url);
    await expect(guest.locator(".claim-details").first()).not.toContainText("创建者");
    await guest.getByRole("textbox", { name: "你的昵称" }).fill("同伴乙");
    await guest.getByRole("button", { name: "匿名加入房间" }).click();
    await expect(guest.getByTestId("participant-count")).toHaveText("2 人已加入");
    const guestFirst = guest.locator(".draft-rule").first();
    await guestFirst.getByRole("button", { name: "这条我做不到，换一条" }).click();
    await expect(guest.locator(".swap-candidate")).toBeVisible();
    await expect(guest.getByRole("dialog").getByRole("button", { name: "就换这条" })).toBeDisabled();
    await expect(guest.getByRole("dialog").getByText("这条已有认领，需要创建者确认替换。")).toBeVisible();
    await first.getByRole("button", { name: "这条我做不到，换一条" }).click();
    await page.locator('.swap-options input[value="headphones_2200"]').check();
    await expect(page.locator(".swap-candidate")).toBeVisible();
    await expect(page.getByRole("dialog").getByText(/边界改变：/)).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("button", { name: "就换这条" })).toBeDisabled();
    await page.getByRole("dialog").getByRole("checkbox").check();
    await page.getByRole("dialog").getByRole("button", { name: "就换这条" }).click();
    await expect(first).toHaveAttribute("data-version", "2");
    await expect(first.locator(".rule-status")).toHaveText("待议");
    await expect(first.getByRole("button", { name: "我来认领这条" })).toBeEnabled();
    await guest.getByRole("dialog").getByRole("button", { name: "算了，还是忍一忍" }).click();
    await guest.getByRole("button", { name: "刷新最新状态" }).click();
    await expect(guestFirst).toHaveAttribute("data-version", "2");
    await guestFirst.getByRole("button", { name: "我来认领这条" }).click();
    await expect(guestFirst.locator(".rule-status")).toHaveText("已通过");
    await page.getByRole("button", { name: "刷新最新状态" }).click();
    await expect(first.locator(".claim-details")).toContainText("同伴乙");
    await expect(page.getByTestId("participant-count")).toHaveText("2 人已加入");
  } finally { await context.close(); }
});

test("same-boundary wording preview, cancel and stale rule recovery", async ({ page }) => {
  const room = await seed(page);
  await page.goto("/room/" + room.code);
  const first = page.locator(".draft-rule").first();
  await first.getByRole("button", { name: "这条我做不到，换一条" }).click();
  await expect(page.locator(".swap-candidate")).toBeVisible();
  await expect(page.getByRole("dialog").getByText("边界不变，只换个说法。")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "算了，还是忍一忍" }).click();
  await expect(first).toHaveAttribute("data-version", "1");
  // Another tab replaces the rule after this tab has read version 1.
  await page.request.post("/api/rules/" + room.rules[0].id + "/swap", { headers: { ...headers, "Idempotency-Key": crypto.randomUUID() }, data: { mode: "apply", confirmed: true, expected_version: 1 } });
  await first.getByRole("button", { name: "我来认领这条" }).click();
  await expect(page.locator(".feedback[role=alert]")).toContainText("条文已更换");
  await expect(first).toHaveAttribute("data-version", "2");
  await expect(first.getByRole("button", { name: "我来认领这条" })).toBeEnabled();
});

test("library outage can retry and setup room can resume generation", async ({ page }) => {
  await page.route("**/api/rule-library", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: { message: "选项服务暂不可用" } }) }));
  await page.goto("/create");
  await expect(page.locator(".feedback[role=alert]")).toContainText("选项服务暂不可用");
  await page.unroute("**/api/rule-library");
  await page.getByRole("button", { name: "重新加载选项" }).click();
  await expect(page.getByRole("button", { name: "下一步，选在意的点" })).toBeVisible();
  const room = await seed(page, false);
  await page.goto("/room/" + room.code);
  await page.getByRole("checkbox", { name: /我已经看过这五条/ }).check();
  await page.getByRole("button", { name: "生成我的约定" }).click();
  await expect(page.locator(".draft-rule")).toHaveCount(5);
});

test("missing room and invalid room code have recoverable pages", async ({ page }) => {
  await page.goto("/room/ZZZZZZZZZZ");
  await expect(page.getByRole("heading", { name: "这个房间还没找到。" })).toBeVisible();
  await expect(page.getByRole("link", { name: "回首页输入房间码" })).toBeVisible();
  await page.goto("/room/bad");
  await expect(page.getByRole("heading", { name: "这个房间码不太对。" })).toBeVisible();
});

for (const width of [320, 390, 768, 1280]) test("workflow layout at " + width, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/create?space=short_stay");
  await expect(page.getByRole("radio", { name: /短租/ })).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("create-" + width + ".png"), fullPage: true });
  await page.getByRole("button", { name: "下一步，选在意的点" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "下一步，看看这五条" }).click();
  await expect(page.locator(".review-selections li")).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("review-" + width + ".png"), fullPage: true });
  const room = await seed(page);
  await page.goto("/room/" + room.code);
  await expect(page.locator(".draft-rule")).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("room-" + width + ".png"), fullPage: true });
  const bounds = await page.locator(".draft-rules").evaluate(list => {
    const rect = list.getBoundingClientRect();
    const rows = new Map<number, DOMRect[]>();
    for (const item of list.children) {
      const card = item.getBoundingClientRect();
      const y = Math.round(card.y);
      rows.set(y, [...(rows.get(y) ?? []), card]);
    }
    return Array.from(rows.values(), row => ({
      count: row.length,
      centerOffset: (row[0].left + row[row.length - 1].right - rect.left - rect.right) / 2,
    }));
  });
  // Single-column claim wall: one full-width note per row at every width.
  expect(bounds.map(row => row.count)).toEqual([1, 1, 1, 1, 1]);
  for (const row of bounds) expect(Math.abs(row.centerOffset)).toBeLessThan(1);
  const widths = await page.locator(".draft-rule").evaluateAll(cards => cards.map(card => card.getBoundingClientRect().width));
  const listWidth = await page.locator(".draft-rules").evaluate(list => list.getBoundingClientRect().width);
  for (const cardWidth of widths) expect(Math.abs(cardWidth - listWidth)).toBeLessThan(1);
  const first = page.locator(".draft-rule").first();
  await first.getByRole("button", { name: "这条我做不到，换一条" }).click();
  await page.locator('.swap-options input[value="headphones_2200"]').check();
  await expect(page.locator(".swap-candidate")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("dialog").screenshot({ path: testInfo.outputPath("swap-" + width + ".png") });
});

test("swap drawer traps focus, cancels an in-flight preview and restores its trigger", async ({ page }) => {
  const room = await seed(page);
  await page.goto("/room/" + room.code);
  let release!: () => void;
  const paused = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/rules/*/swap", async (route) => {
    await paused;
    // Escape already aborts this request in the app; Playwright may mark it handled.
    try { await route.abort(); }
    catch (error) { if (!(error instanceof Error) || !error.message.includes("already handled")) throw error; }
  });
  const trigger = page.locator(".draft-rule").first().getByRole("button", { name: "这条我做不到，换一条" });
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "正在翻出" })).toBeVisible();
  await page.getByRole("button", { name: "算了，还是忍一忍" }).focus();
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest("dialog")))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  release();
  await page.unrouteAll({ behavior: "wait" });
  await trigger.click();
  await expect(page.locator(".swap-candidate")).toBeVisible();
  await page.getByRole("button", { name: "算了，还是忍一忍" }).click();
  await expect(trigger).toBeFocused();
  await expect(page.locator(".draft-rule").first()).toHaveAttribute("data-version", "1");
});

for (const refreshed of [true, false]) test(`new claims invalidate swap consent, refreshed=${refreshed}`, async ({ page }) => {
  const room = await seed(page);
  await page.goto("/room/" + room.code);
  await page.locator(".draft-rule").first().getByRole("button", { name: "这条我做不到，换一条" }).click();
  await expect(page.locator(".swap-candidate")).toBeVisible();
  await page.getByRole("dialog").getByRole("checkbox").check();
  const claimed = await page.request.post(`/api/rules/${room.rules[0].id}/claim`, { headers, data: { expected_version: 1 } });
  expect(claimed.ok()).toBe(true);
  if (refreshed) {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByText("条文或认领人数已经更新，请重新查看并确认。")).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("checkbox")).not.toBeChecked();
    await expect(page.getByRole("button", { name: "就换这条" })).toBeDisabled();
  } else {
    // New claim has not reached this browser; the server must reject stale consent too.
    await page.getByRole("button", { name: "就换这条" }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText("认领人数已经更新");
    await expect(page.locator(".draft-rule").first().locator(".rule-status")).toHaveText("已通过");
  }
  await page.getByRole("button", { name: "重新看候选" }).click();
  await expect(page.getByText("1 个认领会清空，换好后重新认领。")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("checkbox")).not.toBeChecked();
  await page.getByRole("dialog").getByRole("checkbox").check();
  await page.getByRole("button", { name: "就换这条" }).click();
  await expect(page.locator(".draft-rule").first()).toHaveAttribute("data-version", "2");
});

test("claim celebrates only after a successful save", async ({ page }) => {
  const room = await seed(page);
  await page.goto("/room/" + room.code);
  await page.route("**/api/rules/*/claim", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: { message: "暂时无法认领" } }) }));
  const claim = page.getByRole("button", { name: "我来认领这条", exact: true }).first();
  await claim.click();
  await expect(page.locator('.feedback[role="alert"]')).toContainText("暂时无法认领");
  await expect(page.locator(".claim-pop")).toHaveCount(0);
  await page.unroute("**/api/rules/*/claim");
  await claim.click();
  await expect(page.locator(".claim-pop")).toBeVisible();
  await expect(page.locator(".claim-pop")).toHaveCount(0);
});




test("lost generation response recovers the same saved room without a second generation", async ({ page }) => {
  let creates = 0;
  let generations = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/rooms") creates++;
    if (request.method() === "POST" && request.url().endsWith("/generate")) generations++;
  });
  await page.route("**/api/rooms/*/generate", async (route) => {
    await route.fetch(); // The database committed, but the browser lost the reply.
    await route.abort("failed");
  });
  await page.goto("/create");
  await page.getByRole("button", { name: "下一步，选在意的点" }).click();
  await page.getByRole("button", { name: "下一步，看看这五条" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "生成我的约定" }).click();
  await expect(page).toHaveURL(new RegExp("/room/[A-Z0-9]{10}$"));
  await expect(page.locator(".draft-rule")).toHaveCount(5);
  expect(creates).toBe(1);
  expect(generations).toBe(1);
});

test("lost swap response retries with the same operation key", async ({ page }) => {
  const room = await seed(page);
  await page.goto("/room/" + room.code);
  const keys: string[] = [];
  let firstReply = true;
  await page.route("**/api/rules/*/swap", async (route) => {
    if (route.request().postDataJSON().mode !== "apply") return route.continue();
    keys.push(route.request().headers()["idempotency-key"]);
    if (firstReply) {
      firstReply = false;
      return route.abort("failed");
    }
    return route.continue();
  });
  const first = page.locator(".draft-rule").first();
  await first.getByRole("button", { name: "这条我做不到，换一条" }).click();
  await expect(page.locator(".swap-candidate")).toBeVisible();
  await page.getByRole("dialog").getByRole("checkbox").check();
  await page.getByRole("dialog").getByRole("button", { name: "就换这条" }).click();
  await expect(page.locator('.feedback[role="alert"]')).toContainText("连接中断");
  await expect(first).toHaveAttribute("data-version", "1");
  await page.getByRole("dialog").getByRole("button", { name: "就换这条" }).click();
  await expect(first).toHaveAttribute("data-version", "2");
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  expect(keys[0]).toMatch(/^[A-Za-z0-9_-]{8,80}$/);
});

test("all five claims count participants correctly; finalized room becomes read-only", async ({ page, browser }) => {
  const initial = await seed(page);
  await page.goto("/room/" + initial.code);
  for (let index = 0; index < 5; index++) {
    const rule = page.locator(".draft-rule").nth(index);
    await rule.getByRole("button", { name: "我来认领这条" }).click();
    await expect(rule.getByRole("button", { name: "我已认领" })).toBeDisabled();
  }
  await expect(page.getByText("5/5 已通过", { exact: true })).toBeVisible();
  await expect(page.getByTestId("participant-count")).toHaveText("1 人已加入");
  const current: Room = await (await page.request.get("/api/rooms/" + initial.code)).json();
  const finalized = await page.request.post("/api/rooms/" + initial.code + "/finalize", { headers: { ...headers, "Idempotency-Key": crypto.randomUUID() }, data: { expected_revision: current.revision } });
  expect(finalized.ok()).toBe(true);
  await page.reload();
  await expect(page.locator(".room-state")).toHaveText("已定稿");
  await expect(page.getByRole("button", { name: "这条我做不到，换一条" })).toHaveCount(0);
  const context = await browser.newContext();
  try {
    const visitor = await context.newPage();
    await visitor.goto("http://127.0.0.1:3100/room/" + initial.code);
    await expect(visitor.locator(".room-state")).toHaveText("已定稿");
    await expect(visitor.getByRole("button", { name: "匿名加入房间" })).toHaveCount(0);
    await expect(visitor.locator(".saved-note")).toContainText("约定生效时刻：现在");
  } finally { await context.close(); }
});



