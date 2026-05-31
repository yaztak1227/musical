import { expect, test } from "@playwright/test";

test("filters albums, selects a track, and opens track details", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("musical.locale", "en"));
  await page.goto("/");

  await expect(page.getByText("3 albums")).toBeVisible();
  await expect(page.getByRole("button", { name: /Midnight Transit/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Large icons" })).toBeVisible();
  await expect(page.getByLabel("Selected album").getByRole("button", { name: /Station Lights.*歌詞/ })).toBeVisible();

  await page.getByRole("button", { name: "Show albums with lyrics" }).click();
  await expect(page.getByText("1 albums")).toBeVisible();
  await expect(page.getByRole("button", { name: /Midnight Transit/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Room Tone/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Show albums with lyrics" }).click();

  await page.getByRole("tab", { name: "Album list" }).click();
  await expect(page.getByRole("table", { name: "Album table" })).toBeVisible();
  await page.getByRole("tab", { name: "Tracks" }).click();
  await expect(page.getByRole("table", { name: "Track table" })).toBeVisible();
  await expect(page.getByRole("row", { name: /Station Lights/ })).toBeVisible();
  await page.getByRole("tab", { name: "Albums" }).click();
  const northWindowRow = page.getByRole("row", { name: /North Window/ });
  await northWindowRow.click();
  await expect(page.getByRole("region", { name: "Selected album" })).toContainText("North Window");
  await northWindowRow.getByRole("button", { name: "Play album" }).click();
  await expect(page.getByLabel("Player")).toContainText("First Snow");
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByRole("tab", { name: "Large icons" }).click();

  await page.getByLabel("Search albums").fill("north");
  await expect(page.getByRole("button", { name: /North Window/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Room Tone/ })).toHaveCount(0);

  await page.getByRole("button", { name: /North Window/ }).click();
  await page.getByRole("button", { name: /Glass Echo/ }).click();

  await expect(page.getByLabel("Player")).toContainText("Glass Echo");
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next" })).toBeVisible();
  await expect(page.getByLabel("Seek")).toBeVisible();
  await expect(page.getByLabel("Volume")).toBeVisible();
  await expect(page.getByText("Queue / 3 tracks")).toBeVisible();

  await page.getByLabel("Selected album").getByRole("button", { name: /Glass Echo/ }).click({ button: "right" });
  await expect(page.getByRole("dialog", { name: "Track details" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Info" })).toBeVisible();
  await page.getByRole("tab", { name: "Lyrics" }).click();
  await expect(page.getByText("No lyrics are saved in this track.")).toBeVisible();
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
