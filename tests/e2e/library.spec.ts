import { expect, test, type Page } from "@playwright/test";

async function clickFirstAlbumPlayButton(page: Page) {
  await page.locator(".album-card").first().hover();
  await page.locator(".album-hover-play").first().click();
}

async function playTrackFromTrackTable(page: Page, trackTitle: string) {
  await page.getByRole("tab", { name: "Album list" }).click();
  await page.getByRole("tab", { name: "Tracks" }).click();
  await page.locator(".album-list-table.tracks .album-table-row").filter({ hasText: trackTitle }).getByRole("button", { name: "Play" }).click();
}

test("filters albums, selects a track, and opens track details", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("musical.locale", "en"));
  await page.goto("/");

  await expect(page.getByText("13 albums")).toBeVisible();
  await expect(page.getByRole("region", { name: "Album library" }).getByRole("button", { name: /Midnight Transit/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Large icons" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Selected album" }).getByRole("button", { name: "Station Lights", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show lyrics for Station Lights" })).toBeVisible();
  await page.getByRole("button", { name: "Show lyrics for Station Lights" }).click();
  await expect(page.getByRole("dialog", { name: "Track details" })).toBeVisible();
  await expect(page.getByText("Station lights are passing slow")).toBeVisible();
  await page.getByRole("button", { name: "Close track details" }).click();

  await page.getByRole("button", { name: "Show albums with lyrics" }).click();
  await expect(page.getByText("1 albums")).toBeVisible();
  await expect(page.getByRole("region", { name: "Album library" }).getByRole("button", { name: /Midnight Transit/ })).toBeVisible();
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
  await expect(page.getByRole("region", { name: "Album library" }).getByRole("button", { name: /North Window/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Room Tone/ })).toHaveCount(0);

  await page.getByRole("region", { name: "Album library" }).getByRole("button", { name: /North Window/ }).click();
  await page.getByRole("button", { name: "Glass Echo", exact: true }).click();

  await expect(page.getByLabel("Player")).toContainText("First Snow");
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await page.getByRole("listitem").filter({ hasText: "Glass Echo" }).hover();
  await page.getByRole("region", { name: "Selected album" }).getByRole("button", { name: "Play Glass Echo" }).click();
  await expect(page.getByLabel("Player")).toContainText("Glass Echo");
  await expect(page.getByLabel("Player").getByRole("button", { name: "Pause" })).toBeVisible();
  await page.getByLabel("Player").getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("button", { name: "Previous" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next" })).toBeVisible();
  await expect(page.getByLabel("Seek")).toBeVisible();
  await expect(page.getByLabel("Volume")).toBeVisible();
  await expect(page.getByText("Queue / 3 tracks")).toBeVisible();

  await page.getByRole("region", { name: "Selected album" }).getByRole("button", { name: "Glass Echo", exact: true }).click({ button: "right" });
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

  await expect(page.getByText("13 件")).toBeVisible();
  await expect(page.getByRole("button", { name: /ライブラリ設定を開く/ })).toBeVisible();
  await expect(page.getByText("音楽フォルダ")).toBeVisible();
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

test("mirrors play and pause state across player and album controls", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("musical.locale", "en"));
  await page.goto("/");

  const firstAlbumPlayButton = page.locator(".album-hover-play").first();
  await expect(firstAlbumPlayButton).toHaveAttribute("aria-label", "Play album");
  await expect(page.getByLabel("Player").getByRole("button", { name: "Play", exact: true })).toBeVisible();

  await page.locator(".album-card").first().hover();
  await firstAlbumPlayButton.click();
  await expect(firstAlbumPlayButton).toHaveAttribute("aria-label", "Pause");
  await expect(page.getByLabel("Player").getByRole("button", { name: "Pause" })).toBeVisible();

  await page.getByLabel("Player").getByRole("button", { name: "Pause" }).click();
  await expect(firstAlbumPlayButton).toHaveAttribute("aria-label", "Play album");
  await expect(page.getByLabel("Player").getByRole("button", { name: "Play", exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Album list" }).click();
  const midnightTransitRow = page.getByRole("row", { name: /Midnight Transit/ });
  await midnightTransitRow.getByRole("button", { name: "Play album" }).click();
  await expect(midnightTransitRow.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.getByLabel("Player").getByRole("button", { name: "Pause" }).click();
  await expect(midnightTransitRow.getByRole("button", { name: "Play album" })).toBeVisible();
});

test("does not update playback or queue when selecting a track title", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("musical.locale", "en"));
  await page.goto("/");

  await page.getByRole("region", { name: "Selected album" }).getByRole("button", { name: "Last Train Home", exact: true }).click();
  await expect(page.getByLabel("Player")).toContainText("Station Lights");
  await expect(page.getByLabel("Player").getByRole("button", { name: "Play", exact: true })).toBeVisible();

  await clickFirstAlbumPlayButton(page);
  await expect(page.getByLabel("Player")).toContainText("Station Lights");
  await expect(page.getByLabel("Player").getByRole("button", { name: "Pause" })).toBeVisible();

  await page.getByRole("region", { name: "Selected album" }).getByRole("button", { name: "Last Train Home", exact: true }).click();
  await expect(page.getByLabel("Player")).toContainText("Station Lights");
  await expect(page.getByLabel("Player").getByRole("button", { name: "Pause" })).toBeVisible();

  await page.getByRole("listitem").filter({ hasText: "Last Train Home" }).hover();
  await page.getByRole("region", { name: "Selected album" }).getByRole("button", { name: "Play Last Train Home" }).click();
  await expect(page.getByLabel("Player")).toContainText("Last Train Home");
  await expect(page.getByLabel("Player").getByRole("button", { name: "Pause" })).toBeVisible();
});

test("updates selected album artwork when the album selection changes", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("musical.locale", "en"));
  await page.goto("/");

  const selectedAlbum = page.getByRole("region", { name: "Selected album" });
  await expect(selectedAlbum.getByRole("img", { name: "Midnight Transit artwork" })).toBeVisible();
  const firstArtworkSrc = await selectedAlbum.getByRole("img", { name: "Midnight Transit artwork" }).getAttribute("src");

  await page.getByRole("button", { name: /North Window/ }).click();
  await expect(selectedAlbum).toContainText("North Window");
  await expect(selectedAlbum.getByRole("img", { name: "North Window artwork" })).toBeVisible();
  await expect(selectedAlbum.getByRole("img", { name: "North Window artwork" })).not.toHaveAttribute("src", firstArtworkSrc ?? "");
});

test("keeps the centered album play button as a playback action only", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("musical.locale", "en"));
  await page.goto("/");

  const roomToneCard = page.locator(".album-card[data-album-id='2']");
  const roomToneCardBox = await roomToneCard.boundingBox();
  expect(roomToneCardBox).not.toBeNull();
  await roomToneCard.click({
    position: {
      x: (roomToneCardBox?.width ?? 1) / 2,
      y: (roomToneCardBox?.width ?? 1) / 2,
    },
  });

  await expect(page.getByRole("region", { name: "Selected album" })).toContainText("Midnight Transit");
  await expect(page.getByLabel("Player")).toContainText("Soft Machines");
  await expect(page.getByLabel("Player").getByRole("button", { name: "Pause" })).toBeVisible();
});

test("switches the selected album with one card body click", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("musical.locale", "en"));
  await page.goto("/");

  const roomToneCard = page.locator(".album-card[data-album-id='2']");
  const roomToneCardBox = await roomToneCard.boundingBox();
  expect(roomToneCardBox).not.toBeNull();
  await roomToneCard.click({
    position: {
      x: (roomToneCardBox?.width ?? 1) / 2,
      y: (roomToneCardBox?.height ?? 1) - 24,
    },
  });

  await expect(page.getByRole("region", { name: "Selected album" })).toContainText("Room Tone");
  await expect(page.getByLabel("Player")).toContainText("Station Lights");
  await expect(page.getByLabel("Player").getByRole("button", { name: "Play", exact: true })).toBeVisible();
});

test("keeps narrow layouts flush with the viewport bottom", async ({ page }) => {
  await page.setViewportSize({ width: 599, height: 863 });
  await page.addInitScript(() => window.localStorage.setItem("musical.locale", "en"));
  await page.goto("/");

  const layout = await page.evaluate(() => ({
    bodyHeight: document.body.getBoundingClientRect().height,
    shellHeight: document.querySelector(".app-shell")?.getBoundingClientRect().height ?? 0,
    viewportHeight: window.innerHeight,
  }));

  expect(layout.bodyHeight).toBe(layout.viewportHeight);
  expect(layout.shellHeight).toBe(layout.viewportHeight);
});

test("keeps playback entry points visible on desktop and mobile", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("musical.locale", "en"));
  await page.goto("/");

  await expect(page.locator(".album-hover-play").first()).toBeVisible();
  await expect(page.getByLabel("Player").getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Album library" }).getByRole("button", { name: /Midnight Transit/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Selected album" }).getByRole("button", { name: "Station Lights", exact: true })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Station Lights" }).locator(".track-number")).toBeVisible();
  await page.getByRole("listitem").filter({ hasText: "Station Lights" }).hover();
  await expect(page.getByRole("region", { name: "Selected album" }).getByRole("button", { name: "Play Station Lights" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 800 });
  await expect(page.locator(".album-hover-play").first()).toBeVisible();
  await expect(page.getByLabel("Player").getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Album library" }).getByRole("button", { name: /Midnight Transit/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Selected album" }).getByRole("button", { name: "Station Lights", exact: true })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Station Lights" }).locator(".track-number")).toBeVisible();
  await page.getByRole("listitem").filter({ hasText: "Station Lights" }).hover();
  await expect(page.getByRole("region", { name: "Selected album" }).getByRole("button", { name: "Play Station Lights" })).toBeVisible();
});

test("shows and toggles the player queue popover", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("musical.locale", "en"));
  await page.goto("/");

  const queueToggle = page.getByRole("button", { name: "Show or hide queue" });
  const queuePopover = page.getByRole("region", { name: "Queue" });

  await queueToggle.hover();
  await expect(queuePopover).toBeVisible();
  await expect(queuePopover).toContainText("Station Lights");
  await expect(queuePopover).toContainText("Last Train Home");

  await page.mouse.move(20, 20);
  await expect(queuePopover).not.toBeVisible();

  await queueToggle.click();
  await expect(queuePopover).toBeVisible();
  await queueToggle.click();
  await expect(queuePopover).not.toBeVisible();
});

test("collapses and expands the mobile album panel with vertical swipes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.addInitScript(() => window.localStorage.setItem("musical.locale", "en"));
  await page.goto("/");

  const albumPanel = page.locator(".album-panel");
  await expect(albumPanel).toHaveAttribute("data-state", "expanded");
  await expect(page.getByRole("region", { name: "Selected album" }).getByRole("button", { name: "Station Lights", exact: true })).toBeVisible();

  const expandedBox = await albumPanel.boundingBox();
  expect(expandedBox).not.toBeNull();
  await page.mouse.move((expandedBox?.x ?? 0) + (expandedBox?.width ?? 1) / 2, (expandedBox?.y ?? 0) + 24);
  await page.mouse.down();
  await page.mouse.move((expandedBox?.x ?? 0) + (expandedBox?.width ?? 1) / 2, (expandedBox?.y ?? 0) + 120);
  await page.mouse.up();

  await expect(albumPanel).toHaveAttribute("data-state", "collapsed");
  await expect(page.getByRole("region", { name: "Selected album" }).getByRole("button", { name: "Station Lights", exact: true })).not.toBeVisible();
  await expect(page.getByRole("region", { name: "Selected album" })).toContainText("Midnight Transit");

  const collapsedBox = await albumPanel.boundingBox();
  expect(collapsedBox).not.toBeNull();
  await page.mouse.move((collapsedBox?.x ?? 0) + (collapsedBox?.width ?? 1) / 2, (collapsedBox?.y ?? 0) + 80);
  await page.mouse.down();
  await page.mouse.move((collapsedBox?.x ?? 0) + (collapsedBox?.width ?? 1) / 2, (collapsedBox?.y ?? 0) + 8);
  await page.mouse.up();

  await expect(albumPanel).toHaveAttribute("data-state", "expanded");
  await expect(page.getByRole("region", { name: "Selected album" }).getByRole("button", { name: "Station Lights", exact: true })).toBeVisible();
});

test("opens track details from a mobile long press on the track title", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.addInitScript(() => window.localStorage.setItem("musical.locale", "en"));
  await page.goto("/");

  const selectedAlbum = page.getByRole("region", { name: "Selected album" });
  const trackTitle = selectedAlbum.getByRole("button", { name: "Last Train Home", exact: true });
  const trackTitleBox = await trackTitle.boundingBox();
  expect(trackTitleBox).not.toBeNull();

  await trackTitle.dispatchEvent("pointerdown", {
    bubbles: true,
    cancelable: true,
    clientX: (trackTitleBox?.x ?? 0) + (trackTitleBox?.width ?? 1) / 2,
    clientY: (trackTitleBox?.y ?? 0) + (trackTitleBox?.height ?? 1) / 2,
    pointerId: 1,
    pointerType: "touch",
  });
  await page.waitForTimeout(600);
  await trackTitle.dispatchEvent("pointerup", {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    pointerType: "touch",
  });

  await expect(page.getByRole("dialog", { name: "Track details" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Track details" })).toContainText("Last Train Home");
  await expect(page.getByRole("tab", { name: "Info" })).toBeVisible();
  await expect(page.getByLabel("Player")).toContainText("Station Lights");
});

test("scrolls the expanded mobile mock album library", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.addInitScript(() => window.localStorage.setItem("musical.locale", "en"));
  await page.goto("/");

  const albumScroller = page.locator(".albums-panel-main");
  await albumScroller.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));

  const distantSwitchboard = page.getByRole("button", { name: /Distant Switchboard/ });
  await expect(distantSwitchboard).toBeVisible();
  await distantSwitchboard.click();
  await expect(page.getByRole("region", { name: "Selected album" })).toContainText("Distant Switchboard");
  await expect(page.getByRole("region", { name: "Selected album" })).toContainText("Line Check");
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

test("keeps advancing after consecutive tracks reach the end", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("musical.locale", "en"));
  await page.goto("/");

  await page.getByLabel("Player").getByRole("button", { name: "Play", exact: true }).click();
  const seekSlider = page.getByLabel("Seek");
  const seekSliderBox = await seekSlider.boundingBox();
  expect(seekSliderBox).not.toBeNull();
  const endPosition = { x: (seekSliderBox?.width ?? 1) - 1, y: (seekSliderBox?.height ?? 1) / 2 };

  await seekSlider.click({ position: endPosition });
  await expect(page.getByLabel("Player")).toContainText("Last Train Home", { timeout: 2500 });
  await expect(page.getByLabel("Player").getByRole("button", { name: "Pause" })).toBeVisible();

  await seekSlider.click({ position: endPosition });
  await expect(page.getByLabel("Player")).toContainText("Blue Platform", { timeout: 2500 });
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

test("advances to the next track when audio time exceeds duration", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("musical.locale", "en"));
  await page.goto("/");

  await page.getByLabel("Player").getByRole("button", { name: "Play", exact: true }).click();
  await page.locator("audio").evaluate((audio) => {
    Object.defineProperty(audio, "duration", { configurable: true, value: 198 });
    audio.currentTime = 199;
    audio.dispatchEvent(new Event("timeupdate"));
  });

  await expect(page.getByLabel("Player")).toContainText("Last Train Home", { timeout: 2500 });
  await expect(page.getByLabel("Player").getByRole("button", { name: "Pause" })).toBeVisible();
});

test("stops and seeks to zero when the last track ends with repeat off", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("musical.locale", "en"));
  await page.goto("/");

  await playTrackFromTrackTable(page, "Blue Platform");
  await expect(page.getByLabel("Player")).toContainText("Blue Platform");
  await page.locator("audio").evaluate((audio) => audio.dispatchEvent(new Event("ended")));

  await expect(page.getByLabel("Player")).toContainText("Blue Platform");
  await expect(page.getByLabel("Player").getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await expect(page.getByLabel("Player")).toContainText("0:00");
});

test("wraps to the first track when the last track ends with repeat all", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("musical.locale", "en");
    window.localStorage.setItem(
      "musical.playbackPreferences",
      JSON.stringify({
        isShuffle: false,
        playbackAlbumId: 1,
        repeatMode: "all",
        selectedAlbumId: 1,
      }),
    );
  });
  await page.goto("/");

  await playTrackFromTrackTable(page, "Blue Platform");
  await page.locator("audio").evaluate((audio) => audio.dispatchEvent(new Event("ended")));

  await expect(page.getByLabel("Player")).toContainText("Station Lights");
  await expect(page.getByLabel("Player").getByRole("button", { name: "Pause" })).toBeVisible();
});

test("restarts the same track when it ends with repeat one", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("musical.locale", "en");
    window.localStorage.setItem(
      "musical.playbackPreferences",
      JSON.stringify({
        isShuffle: false,
        playbackAlbumId: 1,
        repeatMode: "one",
        selectedAlbumId: 1,
      }),
    );
  });
  await page.goto("/");

  await playTrackFromTrackTable(page, "Last Train Home");
  await page.locator("audio").evaluate((audio) => audio.dispatchEvent(new Event("ended")));

  await expect(page.getByLabel("Player")).toContainText("Last Train Home");
  await expect(page.getByLabel("Player").getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(page.getByLabel("Player")).toContainText("0:00");
});

test("reshuffles the next cycle when the last track ends with repeat all and shuffle", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
    window.localStorage.setItem("musical.locale", "en");
    window.localStorage.setItem(
      "musical.playbackPreferences",
      JSON.stringify({
        isShuffle: true,
        playbackAlbumId: 1,
        repeatMode: "all",
        selectedAlbumId: 1,
      }),
    );
  });
  await page.goto("/");

  await clickFirstAlbumPlayButton(page);
  await expect(page.getByLabel("Player")).toContainText("Last Train Home");
  await page.getByLabel("Player").getByRole("button", { name: "Next" }).click();
  await expect(page.getByLabel("Player")).toContainText("Blue Platform");
  await page.getByLabel("Player").getByRole("button", { name: "Next" }).click();
  await expect(page.getByLabel("Player")).toContainText("Station Lights");

  await page.locator("audio").evaluate((audio) => audio.dispatchEvent(new Event("ended")));

  await expect(page.getByLabel("Player")).toContainText("Blue Platform");
  await expect(page.getByLabel("Player").getByRole("button", { name: "Pause" })).toBeVisible();
});

test("queues an album in shuffled order when shuffle is enabled", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
    window.localStorage.setItem("musical.locale", "en");
    window.localStorage.setItem(
      "musical.playbackPreferences",
      JSON.stringify({
        isShuffle: true,
        playbackAlbumId: 1,
        repeatMode: "off",
        selectedAlbumId: 1,
      }),
    );
  });
  await page.goto("/");

  await clickFirstAlbumPlayButton(page);
  await expect(page.getByLabel("Player")).toContainText("Last Train Home");

  await page.getByLabel("Player").getByRole("button", { name: "Next" }).click();
  await expect(page.getByLabel("Player")).toContainText("Blue Platform");
  await expect(page.getByLabel("Player").getByRole("button", { name: "Pause" })).toBeVisible();
});

test("shuffles the active queue when shuffle is turned on", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
    window.localStorage.setItem("musical.locale", "en");
    window.localStorage.setItem(
      "musical.playbackPreferences",
      JSON.stringify({
        isShuffle: false,
        playbackAlbumId: 1,
        repeatMode: "off",
        selectedAlbumId: 1,
      }),
    );
  });
  await page.goto("/");

  await clickFirstAlbumPlayButton(page);
  await expect(page.getByLabel("Player")).toContainText("Station Lights");

  await page.getByRole("button", { name: "Shuffle" }).click();
  await page.getByLabel("Player").getByRole("button", { name: "Next" }).click();
  await expect(page.getByLabel("Player")).toContainText("Blue Platform");
});

test("toggles shuffle from the keyboard shortcut", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
    window.localStorage.setItem("musical.locale", "en");
    window.localStorage.setItem(
      "musical.playbackPreferences",
      JSON.stringify({
        isShuffle: false,
        playbackAlbumId: 1,
        repeatMode: "off",
        selectedAlbumId: 1,
      }),
    );
  });
  await page.goto("/");

  await clickFirstAlbumPlayButton(page);
  await expect(page.getByLabel("Player")).toContainText("Station Lights");

  await page.keyboard.press("Alt+S");
  await expect(page.getByRole("button", { name: "Shuffle" })).toHaveAttribute("aria-pressed", "true");

  await page.getByLabel("Player").getByRole("button", { name: "Next" }).click();
  await expect(page.getByLabel("Player")).toContainText("Blue Platform");
});

test("cycles repeat from the keyboard shortcut", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("musical.locale", "en");
    window.localStorage.setItem(
      "musical.playbackPreferences",
      JSON.stringify({
        isShuffle: false,
        playbackAlbumId: 1,
        repeatMode: "off",
        selectedAlbumId: 1,
      }),
    );
  });
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Repeat off" })).toBeVisible();
  await page.keyboard.press("Alt+R");
  await expect(page.getByRole("button", { name: "Repeat all" })).toBeVisible();
  await page.keyboard.press("Alt+R");
  await expect(page.getByRole("button", { name: "Repeat one" })).toBeVisible();
});

test("restores track order in the active queue when shuffle is turned off", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
    window.localStorage.setItem("musical.locale", "en");
    window.localStorage.setItem(
      "musical.playbackPreferences",
      JSON.stringify({
        isShuffle: true,
        playbackAlbumId: 1,
        repeatMode: "off",
        selectedAlbumId: 1,
      }),
    );
  });
  await page.goto("/");

  await clickFirstAlbumPlayButton(page);
  await expect(page.getByLabel("Player")).toContainText("Last Train Home");

  await page.getByRole("button", { name: "Shuffle" }).click();
  await page.getByLabel("Player").getByRole("button", { name: "Next" }).click();
  await expect(page.getByLabel("Player")).toContainText("Blue Platform");
});

test("queues an album in track order when shuffle is disabled", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("musical.locale", "en");
    window.localStorage.setItem(
      "musical.playbackPreferences",
      JSON.stringify({
        isShuffle: false,
        playbackAlbumId: 1,
        repeatMode: "off",
        selectedAlbumId: 1,
      }),
    );
  });
  await page.goto("/");

  await clickFirstAlbumPlayButton(page);
  await expect(page.getByLabel("Player")).toContainText("Station Lights");

  await page.getByLabel("Player").getByRole("button", { name: "Next" }).click();
  await expect(page.getByLabel("Player")).toContainText("Last Train Home");

  await page.getByLabel("Player").getByRole("button", { name: "Next" }).click();
  await expect(page.getByLabel("Player")).toContainText("Blue Platform");
});

test("queues the selected track first and shuffles the rest when shuffle is enabled", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
    window.localStorage.setItem("musical.locale", "en");
    window.localStorage.setItem(
      "musical.playbackPreferences",
      JSON.stringify({
        isShuffle: true,
        playbackAlbumId: 1,
        repeatMode: "off",
        selectedAlbumId: 1,
      }),
    );
  });
  await page.goto("/");

  await page.getByRole("tab", { name: "Album list" }).click();
  await page.getByRole("tab", { name: "Tracks" }).click();
  await page.getByRole("row", { name: /Last Train Home/ }).getByRole("button", { name: "Play" }).click();
  await expect(page.getByLabel("Player")).toContainText("Last Train Home");

  await page.getByLabel("Player").getByRole("button", { name: "Next" }).click();
  await expect(page.getByLabel("Player")).toContainText("Blue Platform");

  await page.getByLabel("Player").getByRole("button", { name: "Next" }).click();
  await expect(page.getByLabel("Player")).toContainText("Station Lights");
});

test("shows current album artwork in the player and opens that album", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("musical.locale", "en"));
  await page.goto("/");

  await page.getByRole("tab", { name: "Album list" }).click();
  await page.getByRole("row", { name: /North Window/ }).getByRole("button", { name: "Play album" }).click();
  await expect(page.getByLabel("Player")).toContainText("First Snow");

  await page.getByRole("row", { name: /Room Tone/ }).click();
  await expect(page.getByRole("region", { name: "Selected album" })).toContainText("Room Tone");

  await expect(page.getByLabel("Player").getByRole("img", { name: "North Window artwork" })).toBeVisible();
  await page.getByLabel("Player").getByRole("button", { name: "Show North Window" }).click();
  await expect(page.getByRole("region", { name: "Selected album" })).toContainText("North Window");
});
