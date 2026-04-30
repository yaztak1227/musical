import { expect, test } from "@playwright/test";

test("filters albums and plays a track", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Midnight Transit/ })).toBeVisible();

  await page.getByLabel("Search albums").fill("north");
  await expect(page.getByRole("button", { name: /North Window/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Room Tone/ })).toHaveCount(0);

  await page.getByRole("button", { name: /North Window/ }).click();
  await page.getByRole("button", { name: /Glass Echo/ }).click();

  await expect(page.getByLabel("Player")).toContainText("Glass Echo");
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
});
