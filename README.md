# Musical

Lightweight cross-platform music player and album manager built with Tauri, React, TypeScript, and Rust.

## Stack

- Tauri 2
- React 19
- TypeScript
- Vite
- Rust stable
- Playwright
- npm

## Environment

Recommended runtime versions are pinned for common version managers.

| Tool | Version |
| --- | --- |
| Node.js | 22.12.0 or newer 22 LTS |
| npm | 10.x |
| Rust | stable |

This repository includes:

- `.mise.toml` for mise
- `.node-version` for nodenv, mise, and compatible tools
- `.nvmrc` for nvm
- `rust-toolchain.toml` for rustup-compatible Rust toolchains

## Setup

```bash
npm install
```

## Web development

```bash
npm run dev
```

The web app runs on `http://127.0.0.1:1420`.

## Desktop development

```bash
npm run tauri dev
```

## Build

```bash
npm run build
npm run tauri build
```

## E2E tests

```bash
npx playwright install chromium
npm run test:e2e
```

## Current template scope

The current template has a mock music library, album search, track selection, and player state. Local music folder scanning, tag reading/writing, SQLite storage, and audio playback should be added through the Tauri/Rust side.
