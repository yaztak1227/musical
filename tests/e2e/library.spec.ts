import { expect, test } from "@playwright/test";

test("filters albums, selects a track, and opens track details", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("musical.locale", "en"));
  await page.goto("/");

  await expect(page.getByText("3 albums")).toBeVisible();
  await expect(page.getByRole("button", { name: /Midnight Transit/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Large icons" })).toBeVisible();
  await expect(page.getByLabel("Selected album").getByRole("button", { name: "Station Lights", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show lyrics for Station Lights" })).toBeVisible();
  await page.getByRole("button", { name: "Show lyrics for Station Lights" }).click();
  await expect(page.getByRole("dialog", { name: "Track details" })).toBeVisible();
  await expect(page.getByText("Station lights are passing slow")).toBeVisible();
  await page.getByRole("button", { name: "Close track details" }).click();

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
  await page.getByRole("button", { name: "Show albums with lyrics" }).click();
  await expect(page.getByRole("row", { name: /Station Lights/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Last Train Home/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Show albums with lyrics" }).click();
  await page.getByRole("tab", { name: "Albums" }).click();
  const northWindowRow = page.getByRole("row", { name: /North Window/ });
  await northWindowRow.click();
  await expect(page.getByRole("region", { name: "Selected album" })).toContainText("North Window");
  await northWindowRow.getByRole("button", { name: "Play album" }).click();
  await expect(page.getByLabel("Player")).toContainText("First Snow");
  await expect(northWindowRow.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(page.getByLabel("Player").getByRole("button", { name: "Pause" })).toBeVisible();
  await page.getByLabel("Player").getByRole("button", { name: "Pause" }).click();
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

test("restores playback preferences", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("musical.locale", "en");
    window.localStorage.setItem(
      "musical.playbackPreferences",
      JSON.stringify({
        isShuffle: true,
        playbackAlbumId: 3,
        repeatMode: "all",
        selectedAlbumId: 2,
      }),
    );
  });
  await page.goto("/");

  await expect(page.getByRole("region", { name: "Selected album" })).toContainText("Room Tone");
  await expect(page.getByLabel("Player")).toContainText("First Snow");
  await expect(page.getByRole("button", { name: "Shuffle" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Repeat all" })).toBeVisible();
});

test("syncs system media session playback actions", async ({ page }) => {
  await page.addInitScript(() => {
    const testWindow = window as Window & {
      MediaMetadata: typeof MediaMetadata;
      __mediaSessionHandlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler | null>>;
    };
    testWindow.__mediaSessionHandlers = {};
    testWindow.MediaMetadata = class {
      album?: string;
      artist?: string;
      title?: string;

      constructor(metadata: MediaMetadataInit) {
        Object.assign(this, metadata);
      }
    } as typeof MediaMetadata;

    Object.defineProperty(navigator, "mediaSession", {
      configurable: true,
      value: {
        metadata: null,
        playbackState: "none",
        setActionHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null) {
          testWindow.__mediaSessionHandlers[action] = handler;
        },
      },
    });
    window.localStorage.setItem("musical.locale", "en");
  });
  await page.goto("/");

  await page.getByLabel("Player").getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByLabel("Player").getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(page.evaluate(() => navigator.mediaSession.playbackState)).resolves.toBe("playing");

  await page.evaluate(() => {
    const testWindow = window as Window & {
      __mediaSessionHandlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler | null>>;
    };
    testWindow.__mediaSessionHandlers.pause?.({ action: "pause" });
  });
  await expect(page.getByLabel("Player").getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await expect(page.evaluate(() => navigator.mediaSession.playbackState)).resolves.toBe("paused");

  await page.evaluate(() => {
    const testWindow = window as Window & {
      __mediaSessionHandlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler | null>>;
    };
    testWindow.__mediaSessionHandlers.play?.({ action: "play" });
  });
  await expect(page.getByLabel("Player").getByRole("button", { name: "Pause" })).toBeVisible();

  await page.evaluate(() => {
    const testWindow = window as Window & {
      __mediaSessionHandlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler | null>>;
    };
    testWindow.__mediaSessionHandlers.stop?.({ action: "stop" });
  });
  await expect(page.getByLabel("Player").getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await expect(page.getByLabel("Player")).toContainText("Station Lights");
});

test("advances to the next track when playback reaches the end", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("musical.locale", "en"));
  await page.goto("/");

  await page.getByLabel("Player").getByRole("button", { name: "Play", exact: true }).click();
  const seekSlider = page.getByLabel("Seek");
  const seekSliderBox = await seekSlider.boundingBox();
  expect(seekSliderBox).not.toBeNull();
  await seekSlider.click({ position: { x: (seekSliderBox?.width ?? 1) - 1, y: (seekSliderBox?.height ?? 1) / 2 } });

  await expect(page.getByLabel("Player")).toContainText("Last Train Home", { timeout: 2500 });
  await expect(page.getByLabel("Player").getByRole("button", { name: "Pause" })).toBeVisible();
});

test("advances to the next track on the audio ended event", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("musical.locale", "en"));
  await page.goto("/");

  await page.getByLabel("Player").getByRole("button", { name: "Play", exact: true }).click();
  await page.locator("audio").evaluate((audio) => audio.dispatchEvent(new Event("ended")));

  await expect(page.getByLabel("Player")).toContainText("Last Train Home");
  await expect(page.getByLabel("Player").getByRole("button", { name: "Pause" })).toBeVisible();
});
