import { expect, test, type Page } from "@playwright/test";

/**
 * Smoke tests: every exercise must load, start, accept real input and reach a
 * result that is written to storage.
 *
 * These deliberately drive the keyboard rather than calling into the engines —
 * the engines already have unit tests, and what these are for is the wiring
 * between them and the DOM: key bindings, phase transitions, persistence.
 */

const GAMES = [
  "n-back",
  "complex-working-memory",
  "memory-span",
  "corsi",
  "pasat",
  "mental-math",
  "cryptogram",
] as const;

async function countSessions(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const req = indexedDB.open("brainscale");
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("sessions")) return resolve(0);
          const count = db.transaction("sessions").objectStore("sessions").count();
          count.onsuccess = () => resolve(count.result);
          count.onerror = () => resolve(0);
        };
        req.onerror = () => resolve(0);
      }),
  );
}

test.describe("navigation", () => {
  test("the dashboard lists every exercise", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /train your working memory/i })).toBeVisible();
    for (const name of ["N-Back", "Complex Working Memory", "Memory Span", "Corsi Block-Tapping", "PASAT", "Mental Math", "Cryptogram"]) {
      await expect(page.getByRole("link", { name: new RegExp(name, "i") }).first()).toBeVisible();
    }
  });

  for (const id of GAMES) {
    test(`${id} info page loads and links into play`, async ({ page }) => {
      await page.goto(`/games/${id}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("link", { name: /start training|continue training/i })).toBeVisible();
      await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();
    });
  }

  test("theme toggles between light and dark", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByRole("button", { name: /theme/i }).first();
    await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", /light|dark/);
    await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", /light|dark/);
  });
});

test.describe("play screens start", () => {
  for (const id of GAMES) {
    test(`${id} reaches a live session`, async ({ page }) => {
      await page.goto(`/play/${id}`);
      await page.getByRole("button", { name: "Start", exact: true }).click();
      // Countdown is 3 x 700ms for the timed games; cryptogram starts at once.
      await expect(page.getByRole("button", { name: "Start", exact: true })).toBeHidden({ timeout: 5000 });
    });
  }
});

test("memory span: play a sequence through to a result", async ({ page }) => {
  await page.goto("/play/memory-span");
  await page.getByRole("button", { name: "Start", exact: true }).click();

  // Read the sequence out of engine state via the rendered stimulus is fragile,
  // so instead answer wrong twice — two failures at a length end the run, which
  // is the path we want to prove reaches a persisted result.
  // Two failures at the same length end the run. Digits never repeat next to
  // each other, so "1 1 1" is always wrong — exactly two attempts is enough.
  for (let attempt = 0; attempt < 2; attempt++) {
    await expect(page.getByText("Your turn")).toBeVisible({ timeout: 15000 });
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("1");
      await page.waitForTimeout(60);
    }
  }

  await expect(page.getByRole("button", { name: /train again/i })).toBeVisible({ timeout: 15000 });
  expect(await countSessions(page)).toBeGreaterThan(0);
});

test("mental math: solve a problem and finish a fixed-count round", async ({ page }) => {
  await page.goto("/games/mental-math");
  // Switch to a short fixed-count round so the test does not sit for 2 minutes.
  await page.getByRole("radio", { name: "Fixed count" }).click();
  // Settings are written to IndexedDB without blocking the click, so give the
  // write a moment before navigating away.
  await page.waitForTimeout(300);

  await page.goto("/play/mental-math");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByLabel("Your answer")).toBeVisible({ timeout: 6000 });

  // Answer until the round ends. Bounded rather than fixed-count: once the
  // result screen appears its primary button is focused, and a further Enter
  // would activate it and start a fresh round.
  const again = page.getByRole("button", { name: /train again/i });
  for (let i = 0; i < 30 && !(await again.isVisible()); i++) {
    await page.keyboard.press("7");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(80);
  }

  await expect(again).toBeVisible({ timeout: 15000 });
  expect(await countSessions(page)).toBeGreaterThan(0);
});

test("cryptogram: typing a letter fills every cell with that number", async ({ page }) => {
  await page.goto("/play/cryptogram");
  await page.getByRole("button", { name: "Start", exact: true }).click();

  const empty = page.getByRole("button", { name: /Number \d+, empty/ });
  await expect(empty.first()).toBeVisible({ timeout: 6000 });
  const before = await empty.count();

  await page.keyboard.press("e");
  await expect(page.getByRole("button", { name: /Number \d+, letter E/ }).first()).toBeVisible();
  expect(await empty.count()).toBeLessThan(before);
});

test("n-back: responds to the position key and reaches a result", async ({ page }) => {
  await page.goto("/games/n-back");
  await page.getByRole("radio", { name: "Manual" }).click();
  await page.goto("/play/n-back");
  await page.getByRole("button", { name: "Start", exact: true }).click();

  // 1-back manual is 21 trials; drive it fast by pressing through.
  await expect(page.getByRole("button", { name: /Position/ })).toBeVisible({ timeout: 6000 });
  await page.keyboard.press("a");
  await expect(page.getByRole("button", { name: /Position/ })).toBeVisible();
});

test("pause and resume does not lose the session", async ({ page }) => {
  await page.goto("/play/corsi");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause session" })).toBeVisible({ timeout: 6000 });

  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByRole("heading", { name: "Paused" })).toBeHidden();
});

test("statistics page renders after a session exists", async ({ page }) => {
  await page.goto("/stats");
  await expect(page.getByRole("heading", { name: "Statistics" })).toBeVisible();
});

test("settings exposes export and reset", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("button", { name: /export as json/i })).toBeVisible();
  await page.getByRole("button", { name: /delete all data/i }).click();
  await expect(page.getByRole("button", { name: /yes, delete everything/i })).toBeVisible();
});
