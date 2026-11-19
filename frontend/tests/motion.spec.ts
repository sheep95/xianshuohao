import { expect, test, type Page } from "@playwright/test";

// Records every view transition the app starts, with its types and the
// pseudo-element animations that actually ran.
async function recordTransitions(page: Page) {
  await page.addInitScript(() => {
    const log: { types: string; animations: string }[] = [];
    (window as unknown as { __vt: typeof log }).__vt = log;
    const start = document.startViewTransition?.bind(document);
    if (!start) return;
    document.startViewTransition = ((arg: Parameters<typeof start>[0]) => {
      const transition = start(arg);
      const entry = { types: [...(transition.types ?? [])].join(","), animations: "" };
      log.push(entry);
      transition.ready.then(() => {
        entry.animations = document.getAnimations()
          .filter((animation) => (animation.effect as KeyframeEffect | null)?.pseudoElement?.startsWith("::view-transition-"))
          .map((animation) => (animation as CSSAnimation).animationName).join(" ");
      }).catch(() => {});
      return transition;
    }) as typeof document.startViewTransition;
  });
  return () => page.evaluate(() => (window as unknown as { __vt: { types: string; animations: string }[] }).__vt.map((entry) => `${entry.types}:${entry.animations}`).join(" | "));
}

test("opening, route and creation steps really animate; focus follows each step", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const transitions = await recordTransitions(page);
  await page.addInitScript(() => {
    document.addEventListener("animationstart", (event) => {
      const root = document.documentElement;
      root.dataset.played = (root.dataset.played ?? "") + " " + event.animationName;
    });
  });
  await page.goto("/?intro=1");
  const opening = page.getByRole("dialog", { name: "先说好。" });
  await expect(opening).toBeVisible();
  // Both buttons are usable from the first frame.
  await expect(opening.getByRole("button", { name: "跳过" })).toBeEnabled();
  await expect(opening.getByRole("button", { name: "进来看看" })).toBeFocused();
  await expect(page.locator("html")).toHaveAttribute("data-played", /note-stick/);
  await opening.getByRole("button", { name: "进来看看" }).click();
  await expect(opening).toBeHidden();
  await expect(page.locator("html")).toHaveAttribute("data-played", /opening-out/);
  await expect(page.locator("main")).toBeFocused();

  await page.getByRole("link", { name: "一起说好 5 件事" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/create" && url.searchParams.has("space"));
  await expect.poll(transitions).toMatch(/nav-forward:.*vt-leave.*vt-arrive|nav-forward:.*vt-arrive.*vt-leave/);

  await page.getByRole("button", { name: "下一步，选在意的点" }).click();
  await expect(page.getByRole("heading", { name: "哪些小事，值得提前说？" })).toBeFocused();
  await expect.poll(transitions).toMatch(/step-forward:.*vt-arrive/);
  const rows = page.locator(".friction-choice summary");
  await expect.poll(() => rows.evaluateAll((items) => items.every((row) => {
    const tile = row.querySelector(".friction-emoji")!;
    const icon = tile.querySelector("svg")!.getBoundingClientRect();
    const box = tile.getBoundingClientRect();
    return getComputedStyle(tile).marginLeft === "0px"
      && Math.abs(icon.x + icon.width / 2 - box.x - box.width / 2) < 1
      && Math.abs(icon.y + icon.height / 2 - box.y - box.height / 2) < 1;
  }))).toBe(true);
  await page.locator(".friction-choice").first().getByRole("radio").first().check();
  const meter = page.locator(".meter-pips");
  await expect(meter).toHaveAttribute("aria-valuenow", "1");
  await expect(meter.locator(".is-on")).toHaveCount(1);
  // The segments must actually take space: a flex fallback once collapsed them to 0px.
  expect(await meter.locator("span").first().evaluate((pip) => pip.getBoundingClientRect().width)).toBeGreaterThan(8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.getByRole("button", { name: "上一步" }).click();
  await expect(page.getByRole("heading", { name: "你们刚凑齐在哪儿？" })).toBeFocused();
  await expect.poll(transitions).toMatch(/step-back:.*vt-arrive/);
  await page.getByRole("button", { name: "下一步，选在意的点" }).click();
  await expect(page.locator(".selection-meter strong")).toHaveText("已选 1/5");

  await page.locator(".site-header .brand").click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await expect.poll(transitions).toMatch(/nav-back:.*vt-arrive/);
});

test("every document entry shows the opening, with a static version in reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const transitions = await recordTransitions(page);
  await page.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => false }));
  await page.goto("/");
  const opening = page.getByRole("dialog", { name: "先说好。" });
  await expect(opening).toBeVisible();
  expect(await opening.locator(".opening-note").first().evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  await opening.getByRole("button", { name: "跳过" }).click();
  await expect(opening).toBeHidden();
  await page.reload();
  await expect(opening).toBeVisible();
  await opening.getByRole("button", { name: "进来看看" }).click();
  await page.getByRole("link", { name: "一起说好 5 件事" }).click();
  await expect(page).toHaveURL(/\/create/);
  await expect.poll(transitions).toMatch(/nav-forward/);
  await page.reload();
  await expect(opening).toBeVisible();
  await opening.getByRole("button", { name: "进来看看" }).click();
  await expect(page.getByRole("heading", { name: "你们刚凑齐在哪儿？" })).toBeVisible();
});

test("opening never covers the static examples without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/?intro=1");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator(".constitution-rules li")).toHaveCount(5);
  await context.close();
});
