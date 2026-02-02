import { test, expect } from "@playwright/test";

test.describe("Asteria Desktop App", () => {
  test("app opens and shows navigation", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    const nav = page.getByRole("navigation", { name: /main navigation/i });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("button", { name: /projects/i }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /projects/i }).first()).toBeVisible();
  });

  test("command palette opens with keyboard", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    await page.keyboard.press("Control+K");
    await expect(page.getByRole("dialog", { name: /command palette/i })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /command search/i })).toBeVisible();
  });

  test("review queue screen is reachable", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    await page
      .getByRole("button", { name: /review queue/i })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: /no pages need review/i })).toBeVisible();
  });
});
