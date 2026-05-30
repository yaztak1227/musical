import { expect, test } from "@playwright/test";

test("filters albums and plays a track", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("musical.locale", "en"));
  await page.goto("/");

  await expect(page.getByText("3 albums")).toBeVisible();
  await expect(page.getByRole("button", { name: /Midnight Transit/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Large icons" })).toBeVisible();

  await page.getByLabel("Search albums").fill("north");
  await expect(page.getByRole("button", { name: /North Window/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Room Tone/ })).toHaveCount(0);

  await page.getByRole("button", { name: /North Window/ }).click();
  await page.getByRole("button", { name: /Glass Echo/ }).click();

  await expect(page.getByLabel("Player")).toContainText("Glass Echo");
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next" })).toBeVisible();
  await expect(page.getByLabel("Seek")).toBeVisible();
  await expect(page.getByLabel("Volume")).toBeVisible();
  await expect(page.getByText("Queue / 3 tracks")).toBeVisible();
});

test("switches the interface language", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("musical.locale", "en"));
  await page.goto("/");

  await page.getByLabel("Language").click();
  await page.getByRole("option", { name: "日本語" }).click();

  await expect(page.getByText("3 件")).toBeVisible();
  await expect(page.getByLabel("音楽フォルダ")).toBeVisible();
  await expect(page.getByRole("button", { name: "ライブラリをスキャン" })).toBeVisible();
});
