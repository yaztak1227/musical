import { expect, test } from "@playwright/test";
import { compareVersions, isNewerVersion } from "../../src/lib/version";

test("compares release and prerelease versions", () => {
  expect(compareVersions("0.4.1", "0.4.0")).toBe(1);
  expect(compareVersions("v0.4.1", "0.4.1")).toBe(0);
  expect(compareVersions("0.4.1-beta.2", "0.4.1-beta.1")).toBe(1);
  expect(compareVersions("0.4.1", "0.4.1-beta.2")).toBe(1);
});

test("accepts only a strictly newer update version", () => {
  expect(isNewerVersion("0.4.2", "0.4.1")).toBe(true);
  expect(isNewerVersion("0.4.1", "0.4.1")).toBe(false);
  expect(isNewerVersion("0.4.0", "0.4.1")).toBe(false);
  expect(isNewerVersion("invalid", "0.4.1")).toBe(false);
});

test("shows the current version in the window title", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Musical v0.4.1");
});
