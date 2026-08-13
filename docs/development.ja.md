# Musical 開発者向け情報

Musical はフロントエンドに React / TypeScript、ローカルファイルのスキャン、タグ処理、再生連携、Tauri コマンドに Rust を使っています。

## 技術スタック

- Tauri 2
- React 19
- TypeScript
- Vite
- Rust stable
- SQLite via `rusqlite`
- Audio tag reading / writing via `lofty`
- Playwright

## 推奨環境

| Tool | Version |
| --- | --- |
| Node.js | 24.x |
| npm | 11.x |
| Rust | stable |

このリポジトリには以下のバージョン管理ファイルがあります。

- `.mise.toml`
- `.node-version`
- `.nvmrc`
- `rust-toolchain.toml`

## セットアップ

依存関係をインストールします。

```bash
npm install
```

Playwright のブラウザが未インストールの場合は追加します。

```bash
npx playwright install chromium
```

## デスクトップモード

```bash
npm run tauri dev
```

Tauri のデスクトップアプリとして起動します。ローカルフォルダのスキャン、音声ファイルの再生、タグ編集、アートワーク保存などはこのモードで利用します。

`http://127.0.0.1:1422/` またはLAN URLで開くWeb版は、debug buildではworkspaceの現在の `dist` をno-cacheで読みます。ビジュアライザなどのfrontend変更をWeb版へ反映するときは `npm run build` を実行してください。音声解析APIやremote playerの送信経路は変わりません。release buildは実行ファイルへ埋め込んだ `dist` を配信します。

開発用ブラウザルートはデフォルトでは自動で開きません。起動時に同時に開きたい場合:

```bash
MUSICAL_OPEN_DEV_BROWSER=1 npm run tauri dev
```

またはアプリ引数で指定します。

```bash
npm run tauri -- dev -- --open-dev-browser
```

## モック Web モード

```bash
VITE_MOCK_DATA=true npm run dev -- --host 127.0.0.1 --port 1423
```

ブラウザで開きます。

```text
http://127.0.0.1:1423/
```

モック Web モードは UI 開発や Playwright 検証向けです。Tauri API が使えないため、ローカルフォルダのスキャン、実ファイル再生、タグの実保存は行わず、モックアルバムを表示します。

## 開発コマンド

フロントエンドをビルド:

```bash
npm run build
```

デスクトップアプリをビルド:

```bash
npm run tauri build
```

E2E テスト:

```bash
npm run test:e2e
```

Playwright UI モード:

```bash
npm run test:e2e:ui
```

ビルドキャッシュの使用量を確認:

```bash
npm run cache:status
```

`npm run tauri -- ...` とWindows開発ランチャーは、起動前に `src-tauri/target` を確認します。既定の8 GiBを超え、workspaceのMusicalが実行中でなければ `cargo clean` を自動実行します。上限は `MUSICAL_BUILD_CACHE_LIMIT_GB` で変更でき、停止中に明示的に削除する場合は `npm run cache:prune` を使います。依存crateの完全なdebug symbolは開発/test profileで生成せず、世代ごとの成果物が膨らみにくい構成です。

## 主なファイル

- [src/App.tsx](src/App.tsx)
- [src/App.css](src/App.css)
- [src/components/AlbumBrowser.tsx](src/components/AlbumBrowser.tsx)
- [src/lib/tagEditing.ts](src/lib/tagEditing.ts)
- [src-tauri/src/lib.rs](src-tauri/src/lib.rs)
- [src-tauri/src/library.rs](src-tauri/src/library.rs)
- [src-tauri/Cargo.toml](src-tauri/Cargo.toml)
- [playwright.config.ts](playwright.config.ts)
