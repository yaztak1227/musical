# Musical Development

Musical uses React / TypeScript for the frontend and Rust for local file scanning, tag handling, playback integration, and Tauri commands.

## Stack

- Tauri 2
- React 19
- TypeScript
- Vite
- Rust stable
- SQLite via `rusqlite`
- Audio tag reading / writing via `lofty`
- Playwright

## Recommended Tools

| Tool | Version |
| --- | --- |
| Node.js | 24.x |
| npm | 11.x |
| Rust | stable |

Version files in this repository:

- `.mise.toml`
- `.node-version`
- `.nvmrc`
- `rust-toolchain.toml`

## Setup

Install dependencies:

```bash
npm install
```

Install the Playwright browser if needed:

```bash
npx playwright install chromium
```

## Desktop Mode

```bash
npm run tauri dev
```

This runs the real Tauri desktop app. Use it for local folder scanning, audio playback, tag editing, and artwork saving.

The dev browser route does not open automatically by default. To open it at startup:

```bash
MUSICAL_OPEN_DEV_BROWSER=1 npm run tauri dev
```

Or pass the app flag:

```bash
npm run tauri -- dev -- --open-dev-browser
```

## Mock Web Mode

```bash
VITE_MOCK_DATA=true npm run dev -- --host 127.0.0.1 --port 1423
```

Open:

```text
http://127.0.0.1:1423/
```

Mock web mode is for UI development and Playwright validation. It does not scan local folders, play real local files, or save tags through Tauri APIs.

## Commands

Build the frontend:

```bash
npm run build
```

Build the desktop app:

```bash
npm run tauri build
```

Run E2E tests:

```bash
npm run test:e2e
```

Run Playwright UI mode:

```bash
npm run test:e2e:ui
```

## Key Files

- [src/App.tsx](/Users/takumi/git/musical/src/App.tsx)
- [src/App.css](/Users/takumi/git/musical/src/App.css)
- [src/components/AlbumBrowser.tsx](/Users/takumi/git/musical/src/components/AlbumBrowser.tsx)
- [src/lib/tagEditing.ts](/Users/takumi/git/musical/src/lib/tagEditing.ts)
- [src-tauri/src/lib.rs](/Users/takumi/git/musical/src-tauri/src/lib.rs)
- [src-tauri/src/library.rs](/Users/takumi/git/musical/src-tauri/src/library.rs)
- [src-tauri/Cargo.toml](/Users/takumi/git/musical/src-tauri/Cargo.toml)
- [playwright.config.ts](/Users/takumi/git/musical/playwright.config.ts)
