# Musical

Musical is a lightweight cross-platform music player and album manager built with Tauri, React, TypeScript, and Rust.

## Current stack

- Tauri 2
- React 19
- TypeScript
- Vite
- Rust stable
- SQLite via `rusqlite`
- Audio tag reading via `lofty`
- Playwright

## Recommended environment

This repository pins common runtime versions with standard tooling files.

| Tool | Version |
| --- | --- |
| Node.js | 22.12.0 |
| npm | 10.9.x |
| Rust | stable |

Included version files:

- `.mise.toml`
- `.node-version`
- `.nvmrc`
- `rust-toolchain.toml`

## First-time setup

Install dependencies:

```bash
npm install
```

If Playwright browsers are not installed yet:

```bash
npx playwright install chromium
```

## How to start

### 1. Start as a web app

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:1420/
```

This mode is useful for UI work and Playwright checks. It uses mock album data when Tauri APIs are not available.

### 2. Start as a desktop app

```bash
npm run tauri dev
```

This launches the Tauri desktop app and enables the Rust side features such as:

- local folder scan
- audio tag reading
- SQLite-backed library loading

## How to use the current app

### Web mode

1. Run `npm run dev`
2. Open `http://127.0.0.1:1420/`
3. Browse the mock album list
4. Search albums
5. Select an album and track

### Desktop mode

1. Run `npm run tauri dev`
2. Enter a local music folder path in the `Music folder` field
3. Click `Scan library`
4. Wait for the scan to finish
5. Confirm that albums and tracks are loaded from the local database

Supported scan targets currently include common audio extensions such as:

- `mp3`
- `flac`
- `m4a`
- `mp4`
- `ogg`
- `opus`
- `wav`
- `aif`
- `aiff`

## Development commands

### Build the frontend

```bash
npm run build
```

### Build the desktop app

```bash
npm run tauri build
```

### Run E2E tests

```bash
npm run test:e2e
```

### Run Playwright UI mode

```bash
npm run test:e2e:ui
```

## Current implementation status

Implemented:

- Tauri project base
- React/Vite UI shell
- mock library for web mode
- local music folder scan from Tauri
- audio tag reading through Rust
- SQLite database creation and reload
- album and track listing after scan

Not implemented yet:

- folder picker dialog
- album artwork extraction and persistence
- audio playback engine
- tag editing and save-back
- incremental rescan
- richer library schema

## Main files

- [src/App.tsx](/Users/takumi/git/musical/src/App.tsx)
- [src/App.css](/Users/takumi/git/musical/src/App.css)
- [src-tauri/src/lib.rs](/Users/takumi/git/musical/src-tauri/src/lib.rs)
- [src-tauri/src/library.rs](/Users/takumi/git/musical/src-tauri/src/library.rs)
- [src-tauri/Cargo.toml](/Users/takumi/git/musical/src-tauri/Cargo.toml)
- [playwright.config.ts](/Users/takumi/git/musical/playwright.config.ts)

## Notes

- Web mode is mainly for UI development and Playwright verification.
- Desktop-only features require `npm run tauri dev`.
- The current library scan replaces the stored album/track contents on each scan.
