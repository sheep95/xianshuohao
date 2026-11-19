import { expect, request, test } from "@playwright/test";
import type { Room } from "../src/lib/room-api";

const headers = { "X-CSRF-Protection": "1" };

test("two browsers create, sync, retain identity and finalize a template draft", async ({ page, browser, baseURL }) => {
  test.setTimeout(65_000);
  await page.goto("/");
  await page.getByRole("link", { name: "一起说好 5 件事" }).click();
  await page.getByRole("radio", { name: /短租/ }).check();
  await page.getByRole("textbox", { name: /你的昵称/ }).fill("橘子");
  await page.getByRole("button", { name: "下一步，选在意的点" }).click();
  const firstChoice = page.locator(".friction-choice").first();
  await firstChoice.getByRole("radio").first().check();
  await page.getByRole("button", { name: "下一步，看看这五条" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "生成我的约定" }).click();
  await expect(page.locator(".draft-rule")).toHaveCount(5);
  const roomURL = page.url();
  const apiPath = new URL(roomURL).pathname.replace("/room/", "/api/rooms/");
  const ownerRoom: Room = await (await page.request.get(apiPath)).json();
  expect(ownerRoom.space_type).toBe("short_stay");
  expect(ownerRoom.rules.every(rule => rule.source === "template")).toBe(true);

  const guestContext = await browser.newContext({ baseURL });
  try {
    const guest = await guestContext.newPage();
    await guest.goto(roomURL);
    await guest.getByRole("textbox", { name: "你的昵称" }).fill("柚子");
    await guest.getByRole("button", { name: "匿名加入房间" }).click();
    await guest.locator(".draft-rule").first().getByRole("button", { name: "我来认领这条" }).click();
    await expect(page.locator(".claim-details").first()).toContainText("柚子", { timeout: 13_000 });
    await expect(page.getByTestId("participant-count")).toHaveText("2 人已加入");
    await page.locator(".draft-rule").nth(1).getByRole("button", { name: "我来认领这条" }).click();
    await expect(guest.locator(".claim-details").nth(1)).toContainText("橘子", { timeout: 13_000 });
    const guestRoom: Room = await (await guest.request.get(apiPath)).json();
    expect(guestRoom.viewer?.participant_id).not.toBe(ownerRoom.viewer?.participant_id);
    await Promise.all([page.reload(), guest.reload()]);
    for (const [tab, before, mine] of [[page, ownerRoom, 1], [guest, guestRoom, 0]] as const) {
      await expect(tab.locator(".draft-rule").nth(mine).getByRole("button", { name: "我已认领" })).toBeDisabled();
      const after: Room = await (await tab.request.get(apiPath)).json();
      expect(after.viewer).toEqual(before.viewer);
      expect(after.participant_count).toBe(2);
    }
    for (const row of (await page.locator(".draft-rule").all()).slice(2)) {
      await row.getByRole("button", { name: "我来认领这条" }).click();
    }
    await page.getByRole("checkbox", { name: /我确认定稿/ }).check();
    await page.getByRole("button", { name: "定稿，生成约定卡" }).click();
    await expect(page.getByRole("button", { name: "保存图片" })).toBeVisible();
    await expect(page.getByRole("button", { name: "复制全文" })).toBeVisible();
    await expect(guest.locator(".room-state")).toHaveText("已定稿", { timeout: 13_000 });
    const final: Room = await (await guest.request.get(apiPath)).json();
    expect(final.snapshot?.rules).toHaveLength(5);
    expect(final.snapshot?.participant_count).toBe(2);
  } finally {
    await guestContext.close();
  }
});

test("eight independent members concurrently claim five rules without lost or duplicate claims", async ({ page, baseURL }) => {
  const created = await page.request.post("/api/rooms", { headers, data: { space_type: "club_room" } });
  expect(created.status()).toBe(201);
  const setup: Room = await created.json();
  const path = "/api/rooms/" + setup.code;
  const generated = await page.request.post(path + "/generate", {
    headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
    data: { expected_revision: setup.revision, confirm_suggestions: true },
  });
  expect(generated.ok()).toBe(true);
  const room: Room = await generated.json();
  const members = await Promise.all(Array.from({ length: 8 }, () => request.newContext({ baseURL })));
  try {
    await Promise.all(members.map(async (member, index) => {
      expect((await member.post(path + "/join", { headers, data: { nickname: "同伴" + index } })).ok()).toBe(true);
    }));
    for (let round = 0; round < 2; round++) {
      for (const rule of room.rules) {
        await Promise.all(members.map(async member => {
          const response = await member.post("/api/rules/" + rule.id + "/claim", { headers, data: { expected_version: rule.version } });
          expect(response.status()).toBe(200);
        }));
      }
    }
    const saved: Room = await (await page.request.get(path)).json();
    expect(saved.participant_count).toBe(9);
    expect(saved.rules.map(rule => rule.claim_count)).toEqual([8, 8, 8, 8, 8]);
    expect(saved.revision).toBe(room.revision + 8 + 40);
  } finally {
    await Promise.all(members.map(member => member.dispose()));
  }
});

test("boundary disclosure animates both heights and honours reduced motion", async ({ page }) => {
  await page.goto("/create");
  await page.getByRole("button", { name: "下一步，选在意的点" }).click();
  const details = page.locator(".friction-choice").nth(1);
  const heights = await details.evaluate(async node => {
    const summary = node.querySelector("summary")!;
    const measure = () => node.getBoundingClientRect().height;
    const closed = measure();
    const toggle = async () => {
      const samples = [measure()];
      summary.click();
      const started = performance.now();
      do {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        samples.push(measure());
      } while (performance.now() - started < 350);
      return samples;
    };
    const opening = await toggle();
    const closing = await toggle();
    return { closed, opening, open: opening.at(-1)!, closing, end: closing.at(-1)! };
  });
  for (const samples of [heights.opening, heights.closing]) {
    expect(samples.some(height => height > heights.closed + 1 && height < heights.open - 1)).toBe(true);
  }
  expect(heights.end).toBeCloseTo(heights.closed);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await details.locator("summary").click();
  expect(await details.evaluate(node => node.getAnimations({ subtree: true }).length)).toBe(0);
});
