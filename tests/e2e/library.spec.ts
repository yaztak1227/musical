import { expect, test, type Page } from "@playwright/test";
import { resolveAuroraVisualProfile } from "../../src/lib/auroraWebgl";
import { captureScatteredAngularEnergy, scatteredFrequencyIndexAt } from "../../src/lib/starfieldWebgl";

async function clickFirstAlbumPlayButton(page: Page) {
  await page.locator(".album-card").first().hover();
  await page.locator(".album-hover-play").first().click();
}

async function playTrackFromTrackTable(page: Page, trackTitle: string) {
  await page.getByRole("tab", { name: "Album list" }).click();
  await page.getByRole("tab", { name: "Tracks" }).click();
  await page.locator(".album-list-table.tracks .album-table-row").filter({ hasText: trackTitle }).getByRole("button", { name: "Play" }).click();
}

async function visualizerCanvasSignature(page: Page) {
  const activeWebglCanvas = page.locator(".visualizer-aurora-canvas.active, .visualizer-starfield-canvas.active, .visualizer-helix-canvas.active, .visualizer-warp-hole-canvas.active");
  if (await activeWebglCanvas.count()) {
    const screenshot = await activeWebglCanvas.screenshot();
    let hash = 0;
    const stride = Math.max(1, Math.floor(screenshot.length / 2400));
    for (let index = 0; index < screenshot.length; index += stride) hash = (hash * 31 + (screenshot[index] ?? 0)) >>> 0;
    return { changedPixels: screenshot.length, hash };
  }

  return page.locator(".visualizer-canvas:not(.visualizer-aurora-canvas):not(.visualizer-starfield-canvas):not(.visualizer-helix-canvas):not(.visualizer-warp-hole-canvas)").evaluate((canvasElement) => {
    const canvas = canvasElement as HTMLCanvasElement;
    const context = canvas.getContext("2d");
    if (!context || canvas.width === 0 || canvas.height === 0) return { changedPixels: 0, hash: 0 };

    const image = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 0;
    let changedPixels = 0;
    const stride = Math.max(4, Math.floor(image.length / 1800 / 4) * 4);

    for (let index = 0; index < image.length; index += stride) {
      const alpha = image[index + 3] ?? 0;
      if (alpha > 0) changedPixels += 1;
      hash = (hash * 31 + (image[index] ?? 0) * 3 + (image[index + 1] ?? 0) * 5 + (image[index + 2] ?? 0) * 7 + alpha) >>> 0;
    }

    return { changedPixels, hash };
  });
}

async function visualizerCompositeSignature(page: Page) {
  const screenshot = await page.getByRole("dialog", { name: "Player visualizer" }).screenshot({ animations: "disabled" });
  let hash = 0;
  for (let index = 0; index < screenshot.length; index += 1) {
    hash = (hash * 31 + (screenshot[index] ?? 0)) >>> 0;
  }
  return hash;
}

test("filters albums, selects a track, and opens track details", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("musical.locale", "en"));
  await page.goto("/");

  await expect(page.getByText("13 albums")).toBeVisible();
  const initialAlbumCards = page.locator(".album-grid.large .album-card");
  await expect(initialAlbumCards).toHaveCount(13);
  const initialCardLabels = await initialAlbumCards.allTextContents();
  expect(new Set(initialCardLabels).size).toBe(initialCardLabels.length);
  await expect(initialAlbumCards.first()).toHaveAttribute("data-album-index-row", "0");
  await expect
    .poll(() => initialAlbumCards.evaluateAll((cards) => cards.every((card) => card.hasAttribute("data-album-index-row"))))
    .toBe(true);
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

test("reflows large album cards when the library panel opens and closes", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("musical.locale", "en");
    window.localStorage.setItem("musical.sidebarCollapsed", "true");
  });
  await page.setViewportSize({ width: 1180, height: 760 });
  await page.goto("/");

  const albumGrid = page.locator(".album-grid.large");
  const albumCards = albumGrid.locator(".album-card");
  const firstCard = albumCards.first();
  const cardPartsHaveStableSpacing = () =>
    albumCards.evaluateAll((cards) =>
      cards.every((card) => {
        const cardRect = card.getBoundingClientRect();
        const cover = card.querySelector<HTMLElement>(".album-cover-wrap")?.getBoundingClientRect();
        const title = card.querySelector<HTMLElement>(".album-card-title")?.getBoundingClientRect();
        const meta = card.querySelector<HTMLElement>(".album-card-meta")?.getBoundingClientRect();
        if (!cover || !title || !meta) return false;
        const coverToTitleGap = title.top - cover.bottom;
        const titleToMetaGap = meta.top - title.bottom;
        const expectedMaximumHeight = cover.height + title.height + meta.height + 56;
        return (
          coverToTitleGap >= 0 &&
          coverToTitleGap <= 12 &&
          titleToMetaGap >= 0 &&
          titleToMetaGap <= 12 &&
          cardRect.height <= expectedMaximumHeight
        );
      }),
    );

  await expect(albumGrid).toHaveCSS("grid-template-columns", /\S+ \S+ \S+ \S+/);
  await expect.poll(cardPartsHaveStableSpacing).toBe(true);
  await expect(firstCard).toHaveAttribute("data-album-index-row", "0");

  const fontLayout = await firstCard.evaluate(async (card) => {
    const readGeometry = () => {
      const cardRect = card.getBoundingClientRect();
      const titleRect = card.querySelector<HTMLElement>(".album-card-title")?.getBoundingClientRect();
      return {
        cardHeight: cardRect.height,
        titleTop: titleRect?.top ?? 0,
      };
    };
    const before = readGeometry();
    await document.fonts.ready;
    const after = readGeometry();
    return {
      after,
      before,
      fontFamily: getComputedStyle(card).fontFamily,
    };
  });
  expect(fontLayout.fontFamily).toMatch(/Inter|system-ui|-apple-system|sans-serif/);
  expect(Math.abs(fontLayout.after.cardHeight - fontLayout.before.cardHeight)).toBeLessThan(1);
  expect(Math.abs(fontLayout.after.titleTop - fontLayout.before.titleTop)).toBeLessThan(1);

  for (let cycle = 0; cycle < 2; cycle += 1) {
    await page.getByRole("button", { name: "Expand library panel" }).click();
    await expect(albumGrid).toHaveCSS("grid-template-columns", /\S+ \S+/);
    await expect.poll(cardPartsHaveStableSpacing).toBe(true);
    await expect(firstCard).toHaveAttribute("data-album-index-row", "0");

    await page.getByRole("button", { name: "Collapse library panel" }).click();
    await expect(albumGrid).toHaveCSS("grid-template-columns", /\S+ \S+ \S+ \S+/);
    await expect.poll(cardPartsHaveStableSpacing).toBe(true);
    await expect(firstCard).toHaveAttribute("data-album-index-row", "0");
  }

  for (const width of [1040, 1100, 1120, 1160, 1200, 1280]) {
    await page.setViewportSize({ width, height: 760 });
    await expect.poll(cardPartsHaveStableSpacing).toBe(true);

    await page.getByRole("button", { name: "Expand library panel" }).click();
    await expect.poll(cardPartsHaveStableSpacing).toBe(true);

    await page.getByRole("button", { name: "Collapse library panel" }).click();
    await expect.poll(cardPartsHaveStableSpacing).toBe(true);
  }
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

test("creates an empty playlist", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("musical.locale", "en"));
  await page.goto("/");

  await page.getByRole("tab", { name: "Playlists" }).click();
  await expect(page.getByText("No playlists yet.")).toBeVisible();
  await page.getByLabel("Playlist name").fill("Road Set");
  await page.getByRole("button", { name: "New playlist" }).click();

  await expect(page.getByText("1 playlists")).toBeVisible();
  await expect(page.getByRole("region", { name: "Selected playlist" })).toContainText("Road Set");
  await expect(page.getByRole("button", { name: "Choose artwork for Road Set" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Selected playlist" })).toContainText("0 tracks");
  await expect(page.getByRole("region", { name: "Selected playlist" })).toContainText("Add tracks before playing this playlist.");
  await expect(page.getByRole("region", { name: "Selected playlist" }).getByRole("button", { name: "Play", exact: true })).toBeDisabled();

  await page.getByRole("tab", { name: "Large icons" }).click();
  await page.getByRole("region", { name: "Album library" }).getByRole("button", { name: /Midnight Transit/ }).click();
  await page.getByRole("button", { name: "Add Station Lights to playlist" }).click();
  await expect(page.getByRole("menu", { name: "Choose playlist" })).toBeVisible();
  await page.getByRole("menuitem", { name: /Road Set/ }).click();
  await page.getByRole("button", { name: "Add Station Lights to playlist" }).click();
  await expect(page.getByRole("menuitem", { name: /Road Set/ })).toContainText("Already added");

  await page.getByRole("tab", { name: "Playlists" }).click();
  await page.locator(".playlist-card").first().click();
  await expect(page.getByRole("region", { name: "Selected playlist" })).toContainText("1 tracks");
  await page.getByRole("region", { name: "Selected playlist" }).getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByLabel("Player")).toContainText("From Road Set");

  const selectedPlaylistRegion = page.getByRole("region", { name: "Selected playlist" });
  await selectedPlaylistRegion.getByRole("button", { name: "Rename Road Set" }).click();
  await selectedPlaylistRegion.getByLabel("Playlist name").fill("Night Drive");
  await selectedPlaylistRegion.getByRole("button", { name: "Save" }).click();
  await expect(selectedPlaylistRegion).toContainText("Night Drive");

  await page.getByRole("button", { name: "Add tracks" }).click();
  await page.getByRole("button", { name: "Add tracks from Midnight Transit to playlist" }).click();
  await page.getByRole("menuitem", { name: /Night Drive/ }).click();
  await page.getByRole("tab", { name: "Playlists" }).click();
  await page.locator(".playlist-card").first().click();
  await expect(page.getByRole("region", { name: "Selected playlist" })).toContainText("3 tracks");

  await page.getByRole("button", { name: "Move Last Train Home up" }).click();
  const firstTrack = page.getByRole("region", { name: "Selected playlist" }).getByRole("listitem").first();
  await expect(firstTrack).toContainText("Last Train Home");

  await page.getByRole("button", { name: "Remove Last Train Home from playlist" }).click();
  await expect(page.getByRole("region", { name: "Selected playlist" })).toContainText("2 tracks");

  await page.getByRole("button", { name: "Show album Midnight Transit" }).first().click();
  await expect(page.getByRole("region", { name: "Selected album" })).toContainText("Midnight Transit");

  await page.getByRole("tab", { name: "Playlists" }).click();
  await page.locator(".playlist-card").first().click();
  await page.getByRole("button", { name: "Delete Night Drive" }).click();
  await expect(page.getByText("No playlists yet.")).toBeVisible();
});

test("keeps shuffle changes inside the active playlist queue", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
    window.localStorage.setItem("musical.locale", "en");
  });
  await page.goto("/");

  await page.getByRole("tab", { name: "Playlists" }).click();
  await page.getByLabel("Playlist name").fill("Mixed Queue");
  await page.getByRole("button", { name: "New playlist" }).click();

  await page.getByRole("tab", { name: "Large icons" }).click();
  await page.getByRole("region", { name: "Album library" }).getByRole("button", { name: /Midnight Transit/ }).click();
  await page.getByRole("button", { name: "Add Station Lights to playlist" }).click();
  await page.getByRole("menuitem", { name: /Mixed Queue/ }).click();
  await page.getByRole("region", { name: "Album library" }).getByRole("button", { name: /Room Tone/ }).click();
  await page.getByRole("button", { name: "Add Soft Machines to playlist" }).click();
  await page.getByRole("menuitem", { name: /Mixed Queue/ }).click();

  await page.getByRole("tab", { name: "Playlists" }).click();
  await page.locator(".playlist-card").first().click();
  await page.getByRole("region", { name: "Selected playlist" }).getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByLabel("Player")).toContainText("Station Lights");
  await expect(page.getByLabel("Player")).toContainText("From Mixed Queue");

  await page.getByRole("button", { name: "Shuffle" }).click();
  await page.getByLabel("Player").getByRole("button", { name: "Next" }).click();
  await expect(page.getByLabel("Player")).toContainText("Soft Machines");
  await expect(page.getByLabel("Player")).not.toContainText("Last Train Home");
});

test("shows playlists as playable collections on the TV display", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("musical.locale", "en"));

  await page.goto("/tv?tab=albums&mockData=true");
  await expect(page.getByLabel("Playlists", { exact: true })).toContainText("Road Set");
  await expect(page.getByLabel("Playlists", { exact: true })).toContainText("1 playlists");

  await page.getByRole("button", { name: /Road Set/ }).click();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("musical-firetv-tab", { detail: { tab: "player" } })));
  await expect(page.getByRole("region", { name: "Now playing" })).toContainText("Station Lights");
  await expect(page.getByRole("complementary", { name: "Up next" })).toContainText("Last Train Home");
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

test("keeps the player mode entry visible and keyboard reachable at Tauri-sized widths", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("musical.locale", "ja"));

  for (const viewport of [
    { width: 1180, height: 768 },
    { width: 1226, height: 768 },
    { width: 900, height: 768 },
    { width: 390, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const player = page.getByLabel("プレイヤー");
    const queueButton = player.getByRole("button", { name: "キューの表示を切り替え" });
    const playerModeButton = player.getByRole("button", { name: "ビジュアライザーを開く" });
    await expect(queueButton).toBeVisible();
    await expect(playerModeButton).toBeVisible();
    await expect(playerModeButton).toHaveAccessibleName("ビジュアライザーを開く");

    const bounds = await playerModeButton.boundingBox();
    const playerBounds = await player.boundingBox();
    expect(bounds).not.toBeNull();
    expect(playerBounds).not.toBeNull();
    expect(bounds!.width).toBe(34);
    expect(bounds!.height).toBe(34);
    await expect(playerModeButton).toHaveCSS("position", "absolute");
    const queueBounds = await queueButton.boundingBox();
    expect(queueBounds).not.toBeNull();
    expect(queueBounds!.x + queueBounds!.width).toBeLessThanOrEqual(bounds!.x);

    await queueButton.focus();
    await page.keyboard.press("Tab");
    await expect(playerModeButton).toBeFocused();
    await expect(playerModeButton).toHaveCSS("outline-style", "solid");
    await expect(playerModeButton).toHaveCSS("outline-width", "3px");
    const focusOuterMargin = 5;
    expect(bounds!.x - focusOuterMargin).toBeGreaterThanOrEqual(playerBounds!.x);
    expect(bounds!.y - focusOuterMargin).toBeGreaterThanOrEqual(playerBounds!.y);
    expect(bounds!.x + bounds!.width + focusOuterMargin).toBeLessThanOrEqual(playerBounds!.x + playerBounds!.width);
    expect(bounds!.y + bounds!.height + focusOuterMargin).toBeLessThanOrEqual(playerBounds!.y + playerBounds!.height);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "プレイヤービジュアライザ" })).toBeVisible();
  }
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

test("renders animated mock audio analysis in player mode", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    const testWindow = window as Window & { __musicalAudioContextCreateCount?: number };
    testWindow.__musicalAudioContextCreateCount = 0;
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: function RemoteAnalysisMustNotCreateAudioContext() {
        testWindow.__musicalAudioContextCreateCount = (testWindow.__musicalAudioContextCreateCount ?? 0) + 1;
        throw new Error("Remote analysis must not reroute playback through AudioContext");
      },
    });
  });
  await page.addInitScript(() => window.localStorage.setItem("musical.locale", "en"));
  await page.goto("/");

  await page.getByLabel("Player").getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByLabel("Player").getByRole("button", { name: "Pause" })).toBeVisible();
  await page.getByLabel("Player").getByRole("button", { name: "Open visualizer" }).click();
  await expect(page.getByRole("dialog", { name: "Player visualizer" })).toBeVisible();
  const closeButton = page.getByRole("button", { name: "Close player mode" });
  await expect(closeButton).toHaveCSS("z-index", "5");
  await closeButton.click();
  await expect(page.getByRole("dialog", { name: "Player visualizer" })).not.toBeVisible();
  await page.getByLabel("Player").getByRole("button", { name: "Open visualizer" }).click();
  await expect(page.getByRole("dialog", { name: "Player visualizer" })).toBeVisible();
  const visualizerCanvas = page.locator(".visualizer-canvas:not(.visualizer-aurora-canvas):not(.visualizer-starfield-canvas):not(.visualizer-helix-canvas):not(.visualizer-warp-hole-canvas)");
  await expect(visualizerCanvas).toBeVisible();
  await expect(visualizerCanvas).toHaveCSS("z-index", "2");
  await expect(visualizerCanvas).toHaveCSS("pointer-events", "none");

  const visualizerStage = page.locator(".visualizer-stage");
  const visualizerControls = page.locator(".visualizer-controls");
  const visualizerSettings = page.locator(".visualizer-settings");
  const transportControls = page.locator(".visualizer-transport-controls");
  const modeSwitch = page.getByRole("group", { name: "Visualizer mode" });
  const paletteSwitch = page.getByRole("group", { name: "Colors" });
  const settingsArrow = page.locator(".visualizer-settings-arrow");
  const [stageBox, canvasBox, controlsBox, settingsBox, transportBox] = await Promise.all([
    visualizerStage.boundingBox(),
    visualizerCanvas.boundingBox(),
    visualizerControls.boundingBox(),
    visualizerSettings.boundingBox(),
    transportControls.boundingBox(),
  ]);
  expect(stageBox).not.toBeNull();
  expect(canvasBox).not.toBeNull();
  expect(controlsBox).not.toBeNull();
  expect(settingsBox).not.toBeNull();
  expect(transportBox).not.toBeNull();
  expect((canvasBox?.y ?? 0) + (canvasBox?.height ?? 0)).toBeLessThanOrEqual((controlsBox?.y ?? 0) + 1);
  expect((stageBox?.y ?? 0) + (stageBox?.height ?? 0)).toBeLessThanOrEqual((controlsBox?.y ?? 0) + 1);
  expect((settingsBox?.y ?? 0) + (settingsBox?.height ?? 0)).toBeLessThanOrEqual(transportBox?.y ?? 0);
  expect(stageBox?.height ?? 0).toBeGreaterThanOrEqual(660);
  expect(controlsBox?.height ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(140);
  expect(settingsBox?.width ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(600);
  expect(await modeSwitch.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(10);
  expect(await paletteSwitch.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(4);
  await expect(modeSwitch.getByRole("button")).toHaveCount(10);
  await expect(paletteSwitch.getByRole("button")).toHaveCount(4);
  await expect(settingsArrow).toBeVisible();
  expect(await modeSwitch.getByRole("button").allTextContents()).toEqual(Array(10).fill(""));
  expect(await paletteSwitch.getByRole("button").allTextContents()).toEqual(Array(4).fill(""));

  await page.setViewportSize({ width: 900, height: 700 });
  const [mediumStageBox, mediumCanvasBox, mediumControlsBox, mediumSettingsBox, mediumTransportBox] = await Promise.all([
    visualizerStage.boundingBox(),
    visualizerCanvas.boundingBox(),
    visualizerControls.boundingBox(),
    visualizerSettings.boundingBox(),
    transportControls.boundingBox(),
  ]);
  expect((mediumCanvasBox?.y ?? 0) + (mediumCanvasBox?.height ?? 0)).toBeLessThanOrEqual((mediumControlsBox?.y ?? 0) + 1);
  expect((mediumStageBox?.y ?? 0) + (mediumStageBox?.height ?? 0)).toBeLessThanOrEqual((mediumControlsBox?.y ?? 0) + 1);
  expect((mediumSettingsBox?.y ?? 0) + (mediumSettingsBox?.height ?? 0)).toBeLessThanOrEqual(mediumTransportBox?.y ?? 0);
  expect(mediumStageBox?.height ?? 0).toBeGreaterThanOrEqual(560);
  expect(mediumControlsBox?.height ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(140);

  await page.setViewportSize({ width: 1280, height: 800 });

  await page.addStyleTag({
    content: ".visualizer-content, .visualizer-controls, .visualizer-close-button { visibility: hidden !important; }",
  });

  await page.waitForTimeout(450);
  const firstSignature = await visualizerCanvasSignature(page);
  const firstCompositeSignature = await visualizerCompositeSignature(page);
  await page.waitForTimeout(700);
  const secondSignature = await visualizerCanvasSignature(page);
  const secondCompositeSignature = await visualizerCompositeSignature(page);

  expect(firstSignature.changedPixels).toBeGreaterThan(0);
  expect(secondSignature.hash).not.toBe(firstSignature.hash);
  expect(secondCompositeSignature).not.toBe(firstCompositeSignature);
  expect(await page.evaluate(() => (window as Window & { __musicalAudioContextCreateCount?: number }).__musicalAudioContextCreateCount)).toBe(0);
});

test("scatters adjacent starfield frequency buckets across angular sectors", () => {
  const order = Array.from({ length: 6 }, (_, position) => scatteredFrequencyIndexAt(position, 100));
  expect(order).toEqual([0, 32, 64, 1, 33, 65]);

  const values = new Uint8Array(96);
  values[0] = 255;
  values[1] = 255;
  values[2] = 255;
  const activeSectors = Array.from(captureScatteredAngularEnergy(values))
    .map((energy, sector) => ({ energy, sector }))
    .filter(({ energy }) => energy > 0)
    .map(({ sector }) => sector);
  expect(activeSectors).toEqual([0, 3, 6]);
});

test("uses the mist profile only for original and artwork aurora palettes", () => {
  expect(resolveAuroraVisualProfile("original")).toBe("mist");
  expect(resolveAuroraVisualProfile("artwork")).toBe("mist");
  expect(resolveAuroraVisualProfile("theme")).toBe("standard");
  expect(resolveAuroraVisualProfile("rainbow")).toBe("rainbow");
});

test("switches every player visualizer mode and persists its color palette", async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    const clearCountWindow = window as Window & { __musicalBaseVisualizerClearCount?: number };
    const originalClearRect = CanvasRenderingContext2D.prototype.clearRect;
    clearCountWindow.__musicalBaseVisualizerClearCount = 0;
    CanvasRenderingContext2D.prototype.clearRect = function clearRect(x, y, width, height) {
      const canvas = this.canvas;
      if (
        canvas.classList.contains("visualizer-canvas")
        && !canvas.classList.contains("visualizer-aurora-canvas")
        && !canvas.classList.contains("visualizer-starfield-canvas")
        && !canvas.classList.contains("visualizer-helix-canvas")
        && !canvas.classList.contains("visualizer-warp-hole-canvas")
      ) {
        clearCountWindow.__musicalBaseVisualizerClearCount = (clearCountWindow.__musicalBaseVisualizerClearCount ?? 0) + 1;
      }
      originalClearRect.call(this, x, y, width, height);
    };
  });
  await page.addInitScript(() => window.localStorage.setItem("musical.locale", "en"));
  await page.goto("/");

  await page.getByLabel("Player").getByRole("button", { name: "Play", exact: true }).click();
  await page.getByLabel("Player").getByRole("button", { name: "Open visualizer" }).click();

  const modeNames = ["Wave", "Spectrum", "Circle", "Peaks", "Aurora", "Starfield", "DNA Helix", "Dreamflow", "VU meters", "Warp Hole"];
  const modeGroup = page.getByRole("group", { name: "Visualizer mode" });
  await expect(modeGroup.getByRole("button", { name: "Chibi orchestra mode", exact: true })).toHaveCount(0);
  await expect(modeGroup.locator("svg.visualizer-mode-glyph")).toHaveCount(10);
  await expect(page.getByRole("button", { name: "Artwork", exact: true }).locator("svg.visualizer-palette-artwork-icon")).toHaveCount(1);

  for (const modeName of modeNames) {
    const modeButton = page.getByRole("button", { name: modeName, exact: true });
    await modeButton.click();
    await expect(modeButton).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(80);
    const firstSignature = await visualizerCanvasSignature(page);
    expect(firstSignature.changedPixels).toBeGreaterThan(0);
    if (modeName === "Aurora" || modeName === "Starfield" || modeName === "DNA Helix" || modeName === "Warp Hole") {
      if (modeName === "DNA Helix") {
        await expect(page.locator(".visualizer-helix-canvas.active")).toBeVisible();
      }
      if (modeName === "Warp Hole") {
        await expect(page.locator(".visualizer-warp-hole-canvas.active")).toBeVisible();
      }
      const baseCanvasClearCount = await page.evaluate(() => (window as Window & { __musicalBaseVisualizerClearCount?: number }).__musicalBaseVisualizerClearCount ?? 0);
      await page.waitForTimeout(180);
      expect((await visualizerCanvasSignature(page)).hash).not.toBe(firstSignature.hash);
      expect(await page.evaluate(() => (window as Window & { __musicalBaseVisualizerClearCount?: number }).__musicalBaseVisualizerClearCount ?? 0)).toBe(baseCanvasClearCount);
    }
  }

  await page.getByRole("button", { name: "Aurora", exact: true }).click();
  for (const paletteName of ["Original", "Theme", "Artwork", "Rainbow"]) {
    const paletteButton = page.getByRole("button", { name: paletteName, exact: true });
    await paletteButton.click();
    await expect(paletteButton).toHaveAttribute("aria-pressed", "true");
    const auroraCanvasSize = await page.locator(".visualizer-aurora-canvas.active").evaluate((canvasElement) => {
      const canvas = canvasElement as HTMLCanvasElement;
      return { height: canvas.height, width: canvas.width };
    });
    expect(auroraCanvasSize.width).toBeGreaterThan(0);
    expect(auroraCanvasSize.height).toBeGreaterThan(0);
  }

  await page.getByRole("button", { name: "Spectrum", exact: true }).click();
  await page.getByRole("button", { name: "Chibi character mode", exact: true }).dblclick();
  await expect(page.getByRole("button", { name: "Chibi orchestra mode", exact: true })).toBeVisible();
  expect((await visualizerCanvasSignature(page)).changedPixels).toBeGreaterThan(0);
  await page.getByRole("button", { name: "VU meters", exact: true }).click();

  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("musical.visualizerMode"))).toBe("vu");
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("musical.visualizerPalette"))).toBe("rainbow");
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
  await page.addInitScript(() => {
    window.localStorage.setItem("musical.locale", "en");
    const originalGetEntriesByType = performance.getEntriesByType.bind(performance);
    const originalClearMeasures = performance.clearMeasures.bind(performance);
    Object.defineProperty(performance, "getEntriesByType", {
      configurable: true,
      value: (entryType: string) => entryType === "measure"
        ? { length: 500_000 }
        : originalGetEntriesByType(entryType),
    });
    Object.defineProperty(performance, "clearMeasures", {
      configurable: true,
      value: (measureName?: string) => {
        const instrumentedWindow = window as Window & { __performanceClearMeasuresCount?: number };
        instrumentedWindow.__performanceClearMeasuresCount = (instrumentedWindow.__performanceClearMeasuresCount ?? 0) + 1;
        originalClearMeasures(measureName);
      },
    });
  });
  await page.goto("/");

  await page.getByLabel("Player").getByRole("button", { name: "Play", exact: true }).click();
  const clearMeasuresCountBeforeTrackChange = await page.evaluate(
    () => (window as Window & { __performanceClearMeasuresCount?: number }).__performanceClearMeasuresCount ?? 0,
  );
  const seekSlider = page.getByLabel("Seek");
  const seekSliderBox = await seekSlider.boundingBox();
  expect(seekSliderBox).not.toBeNull();
  await seekSlider.click({ position: { x: (seekSliderBox?.width ?? 1) - 1, y: (seekSliderBox?.height ?? 1) / 2 } });

  await expect(page.getByLabel("Player")).toContainText("Last Train Home", { timeout: 2500 });
  await expect(page.getByLabel("Player").getByRole("button", { name: "Pause" })).toBeVisible();
  await expect.poll(() => page.evaluate(
    () => (window as Window & { __performanceClearMeasuresCount?: number }).__performanceClearMeasuresCount ?? 0,
  )).toBeGreaterThan(clearMeasuresCountBeforeTrackChange);
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
