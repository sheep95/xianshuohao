import { expect, test } from "@playwright/test";
import examples from "../src/data/examples.json";

test("brief entrance finishes and leaves the main action usable", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".welcome-scene")).toBeHidden({ timeout: 2000 });
  await expect(page.getByRole("link", { name: "一起说好 5 件事" })).toBeVisible();
  const animation = await page.locator(".intro").evaluate((node) => getComputedStyle(node).animationName);
  expect(animation).toBe("note-enter");
});

test("all nine examples preserve every rule and work without backend requests", async ({ page }) => {
  const unexpected: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/api/") || url.origin !== "http://127.0.0.1:3100") {
      unexpected.push(url.href);
      return route.abort();
    }
    return route.continue();
  });
  await page.goto("/");
  const cards = page.locator(".constitution");
  await expect(cards).toHaveAttribute("data-example-id", "shared_home-1");
  for (const space of ["shared_home", "short_stay", "club_room"]) {
    const batch = examples.examples.filter((item) => item.space_type === space);
    await page.getByRole("button", { name: new RegExp(batch[0].space_label) }).click();
    for (const example of batch) {
      await expect(cards).toHaveAttribute("data-example-id", example.id);
      await expect(page.locator(".constitution-rules li")).toHaveCount(5);
      await expect(page.locator(".constitution-meta")).toContainText(`${example.participant_count} 人`);
      await expect(page.locator(".constitution-meta")).not.toContainText(example.duration);
      await page.getByRole("button", { name: "展开全部 5 条" }).click();
      for (const [index, rule] of example.rules.entries()) {
        const row = page.locator(".constitution-rules li").nth(index);
        // The title/action layout must not drop a threshold or execution interface.
        const displayed = (await row.locator("h3").innerText()) + (await row.locator(".rule-boundary").innerText());
        expect(displayed.replace(/\s/g, "")).toContain(rule.text.replace(/\s/g, ""));
        await expect(row.locator(".rule-interface")).toContainText(rule.execution_hint);
      }
      const started = Date.now();
      await page.getByRole("button", { name: "换一批示例规则" }).click();
      await expect(cards).not.toHaveAttribute("data-example-id", example.id);
      expect(Date.now() - started).toBeLessThan(1000);
    }
    await expect(cards).toHaveAttribute("data-example-id", batch[0].id);
  }
  await page.getByRole("button", { name: "看一个四人宿舍示例" }).click();
  await expect(cards).toHaveAttribute("data-example-id", "shared_home-1");
  await expect(page.locator(".card-focus-target")).toBeFocused();
  expect(unexpected).toEqual([]);
  expect(errors).toEqual([]);
});

test("preview state survives reload and unknown fragments are harmless", async ({ page }) => {
  await page.goto("/#example=short_stay-3");
  await expect(page.locator(".constitution")).toHaveAttribute("data-example-id", "short_stay-3");
  await page.getByRole("button", { name: "换一批示例规则" }).click();
  await page.reload();
  await expect(page.locator(".constitution")).toHaveAttribute("data-example-id", "short_stay-1");
  await page.goto("/#example=unknown-99");
  await expect(page.locator(".constitution")).toHaveAttribute("data-example-id", "shared_home-1");
});

test("keyboard activation, selected state and live announcement", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "跳到主要内容" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  const space = page.getByRole("button", { name: /短租/ });
  await space.focus();
  await page.keyboard.press("Space");
  await expect(space).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("status")).toContainText("三人旅行示例");
  expect(await space.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
});

test("five complete rules render with JavaScript disabled", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:3100");
  await expect(page.locator(".constitution-rules li")).toHaveCount(5);
      await expect(page.locator(".claim-preview")).toHaveCount(5);
  await expect(page.locator(".rule-interface")).toHaveCount(5);
  await expect(page.locator(".noscript-note")).toContainText("启用 JavaScript");
  await context.close();
});

for (const width of [320, 390, 768, 1280, 1440]) {
  test(`layout at ${width}px with reduced motion`, async ({ page }, testInfo) => {
    const height = 800;
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const cta = await page.getByRole("link", { name: "一起说好 5 件事" }).boundingBox();
    expect(cta!.y + cta!.height).toBeLessThan(height);
    await expect(page.locator(".welcome-scene")).toBeHidden();
    await page.screenshot({ path: testInfo.outputPath(`homepage-${width}.png`), fullPage: true });
    const first = await page.locator(".constitution-rules li").first().boundingBox();
    expect(first!.y).toBeLessThan(800);
    const swap = page.getByRole("button", { name: "换一批示例规则" });
    expect((await swap.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await swap.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe("0s");
    if (width >= 1280) {
      const card = await page.locator(".constitution").boundingBox();
      expect(card!.y + card!.height).toBeLessThanOrEqual(height);
    }
    await page.screenshot({ path: testInfo.outputPath(`homepage-${width}.png`), fullPage: true });
  });
}

