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
| Node.js | 24.15.0 |
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

In debug builds, the Web app opened from `http://127.0.0.1:1422/` or its LAN URL reads the current workspace `dist` with no-cache headers. Run `npm run build` after frontend changes to update that Web view. Audio-analysis APIs and remote-player transport remain unchanged. Release builds serve the `dist` embedded in the executable.

MCP packaging and runtime:

- Development uses Node `24.15.0` and resolves the generated sidecar from the workspace.
- Release packaging produces one dependency-bundled `server.mjs`, places it at the Tauri resource path `mcp/server.mjs`, and includes the Node `24.15.0` runtime in `externalBin`.
- Release sidecar paths are resolved from the app `resource_dir`; no system Node or build-machine absolute path is required. The MCP URL, settings, and 51-tool catalog are unchanged.
- CI checks the MCP tests and the real bundle assets, including the sidecar, Node runtime, frontend assets, and NOTICE files.

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

Validate the Agent Plugins 1.0 package without building the app:

```bash
npm run test:agent-plugin
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

Inspect development build-cache usage:

```bash
npm run cache:status
```

Before `npm run tauri -- ...` and the Windows development launcher start, Musical checks `src-tauri/target`. If it exceeds 8 GiB by default and no workspace Musical process is running, it runs `cargo clean`. Override the limit with `MUSICAL_BUILD_CACHE_LIMIT_GB`, or use `npm run cache:prune` for an explicit cleanup while the app is stopped. Development and test profiles omit full dependency debug symbols to reduce growth across build generations.

## Key Files

- [src/App.tsx](src/App.tsx)
- [src/App.css](src/App.css)
- [src/components/AlbumBrowser.tsx](src/components/AlbumBrowser.tsx)
- [src/lib/tagEditing.ts](src/lib/tagEditing.ts)
- [src-tauri/src/lib.rs](src-tauri/src/lib.rs)
- [src-tauri/src/library.rs](src-tauri/src/library.rs)
- [src-tauri/Cargo.toml](src-tauri/Cargo.toml)
- [playwright.config.ts](playwright.config.ts)
