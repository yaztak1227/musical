# Musical

Musical は、ローカルの音楽フォルダを読み込んでアルバム単位で管理する Tauri 製のデスクトップ音楽プレイヤーです。フロントエンドは React / TypeScript、ローカルファイルのスキャンやタグ処理は Rust 側で行います。

## アプリ概要

主な機能:

- 音楽フォルダをスキャンしてライブラリ化
- アルバム、曲、アーティスト、年、ジャンル、歌詞、アートワークの表示
- アルバム検索、表示サイズ切り替え、リスト表示、曲リスト表示
- タイトル、アーティスト、年、ジャンルなどのタグ編集
- アルバムアートワークの抽出と差し替え
- 再生、一時停止、前後の曲、シーク、音量、シャッフル、リピート
- 日本語 / 英語の表示切り替え
- 複数テーマの切り替え
- Web モード用のモックライブラリ

デスクトップモードでは Tauri API を使い、実際のローカル音楽ファイルをスキャン、再生、タグ更新します。Web モードでは UI 開発と E2E テスト向けにモックデータを表示します。

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

## 起動方法

### Web モード

```bash
npm run dev
```

ブラウザで開きます。

```text
http://127.0.0.1:1420/
```

Web モードは UI 開発や Playwright 検証向けです。Tauri API が使えないため、ローカルフォルダのスキャン、実ファイル再生、タグの実保存は行わず、モックアルバムを表示します。

### デスクトップモード

```bash
npm run tauri dev
```

Tauri のデスクトップアプリとして起動します。ローカルフォルダのスキャン、音声ファイルの再生、タグ編集、アートワーク保存などはこのモードで利用します。

## 使い方

### ライブラリを作成する

1. `npm run tauri dev` でデスクトップアプリを起動します。
2. `音楽フォルダ` に読み込みたいフォルダパスを入力するか、フォルダ指定ボタンから選択します。
3. `ライブラリをスキャン` を押します。
4. スキャン完了後、アルバム一覧と曲一覧が表示されます。

スキャン時に対応している主な拡張子:

- `mp3`
- `flac`
- `m4a`
- `mp4`
- `ogg`
- `opus`
- `wav`
- `aif`
- `aiff`

### アルバムや曲を探す

- 検索欄でアルバム名やアーティスト名を絞り込みます。
- 表示モードで大きいアイコン、小さいアイコン、リストを切り替えます。
- リスト表示ではアルバム一覧と曲一覧を切り替えられます。
- 歌詞アイコンのフィルターで、歌詞を持つ曲が含まれる項目に絞り込めます。
- 並び替えでタイトル、アーティスト、年を切り替えられます。

### 再生する

- アルバムの再生ボタンでアルバム再生を開始します。
- 曲の再生ボタンでその曲から再生します。
- 下部のプレイヤーで再生 / 一時停止、前の曲、次の曲、シーク、音量、シャッフル、リピートを操作します。

### タグやアートワークを編集する

- 選択中アルバムの編集ボタンから、アルバム名、アルバムアーティスト、アーティスト、年、ジャンルを編集できます。
- 曲名を右クリックすると曲詳細を開けます。
- 曲詳細では曲情報、歌詞、アートワークのタブを切り替えられます。
- 曲情報タブではタイトル、アーティスト、アルバム、年、ジャンル、トラック番号、ディスク番号を編集できます。
- アートワークタブでは画像を選択して保存できます。

## 開発コマンド

### フロントエンドをビルド

```bash
npm run build
```

### デスクトップアプリをビルド

```bash
npm run tauri build
```

### E2E テスト

```bash
npm run test:e2e
```

### Playwright UI モード

```bash
npm run test:e2e:ui
```

## 主なファイル

- [src/App.tsx](/Users/takumi/git/musical/src/App.tsx)
- [src/App.css](/Users/takumi/git/musical/src/App.css)
- [src/components/AlbumBrowser.tsx](/Users/takumi/git/musical/src/components/AlbumBrowser.tsx)
- [src/lib/tagEditing.ts](/Users/takumi/git/musical/src/lib/tagEditing.ts)
- [src-tauri/src/lib.rs](/Users/takumi/git/musical/src-tauri/src/lib.rs)
- [src-tauri/src/library.rs](/Users/takumi/git/musical/src-tauri/src/library.rs)
- [src-tauri/Cargo.toml](/Users/takumi/git/musical/src-tauri/Cargo.toml)
- [playwright.config.ts](/Users/takumi/git/musical/playwright.config.ts)

## メモ

- Web モードは主に UI 開発と Playwright 検証用です。
- ローカルファイル操作、実再生、タグ保存は `npm run tauri dev` で起動したデスクトップアプリで確認します。
- スキャン結果は SQLite に保存され、次回起動時に読み込まれます。
- スキャン時はライブラリ内容を再構築します。
