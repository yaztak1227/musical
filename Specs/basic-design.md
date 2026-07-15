# Musical 基本設計書

この文書は、現在の仕様とコードから見た Musical の基本設計をまとめたものです。
実装変更時は、該当するコード、仕様、機能一覧、基本設計の差分が一致するように更新します。

## 1. システム概要

Musical はデスクトップ音楽プレイヤーを中心に、ブラウザリモート操作と Fire TV 表示を持つローカルファーストなアプリケーションです。

```mermaid
flowchart LR
  Desktop["Tauri Desktop App"]
  ReactMain["React Main UI"]
  Rust["Rust Backend"]
  LocalServer["Local HTTP/WebSocket Server"]
  Browser["Browser Remote UI"]
  FireTv["Fire TV Android Shell"]
  TvRoute["React /tv Route"]
  Library["Music Library + .musical Data"]

  Desktop --> ReactMain
  Desktop --> Rust
  Rust --> Library
  Rust --> LocalServer
  Browser --> LocalServer
  FireTv --> TvRoute
  TvRoute --> LocalServer
```

中心責務:

- Desktop app: ライブラリ管理、実音声再生、編集、ローカルサーバー公開。
- Browser app: mock 検証、または desktop backend への remote control。
- Fire TV app: テレビ向け UI と WebView audio によるローカル再生。
- Rust backend: スキャン、DB/ファイル操作、タグ/アートワーク更新、音声解析、local API。

## 2. ランタイム構成

| ランタイム | 実装入口 | 役割 |
| --- | --- | --- |
| React main UI | `src/App.tsx`, `src/app/AppShell.tsx` | デスクトップ/ブラウザ共通 UI |
| React feature hooks | `src/features/**` | library, playback, remote-player, tag-editing, tv-display の責務分割 |
| Tauri backend | `src-tauri/src/lib.rs` | Tauri command と plugin setup |
| Library backend | `src-tauri/src/library.rs`, `src-tauri/src/library/**` | scan, snapshot, playlist, tag, artwork, storage |
| Audio analysis backend | `src-tauri/src/audio_analysis.rs` | FFT bucket 生成と cache |
| Local server | `src-tauri/src/local_server.rs` | `/api/*`, `/tv`, WebSocket, media streaming, MCP sidecar lifecycle/proxy |
| MCP sidecar | `src/mcp/**`, `dist/mcp/server.js` | MCP SDK server, AI SDK V7 compatible tool catalog, internal bridge client |
| Fire TV shell | `apps/firetv/app/src/main/java/app/musical/firetv/**` | Android native shell, discovery, Settings, key bridge |
| TV route | `src/features/tv-display/presentation/TvDisplayApp.tsx` | Fire TV/TV browser UI |

## 3. レイヤ設計

### 3.1 React Main UI

`AppShell` は controller から受け取った状態と handler を UI component へ配線します。

主な component:

- `LibrarySidebar`: ライブラリ、設定、テーマ、リモートアクセス導線。
- `AlbumBrowser`: アルバム/曲/プレイリストの一覧、検索、ソート、再生入口。
- `SelectedAlbumPanel`: 選択アルバムの曲、タグ編集導線、詳細表示導線。
- `SelectedPlaylistPanel`: プレイリスト曲の表示、追加、削除、並べ替え。
- `PlayerBar`: 再生状態、キュー、シーク、音量、Player mode 導線。
- `PlayerVisualizerOverlay`: Player mode、ビジュアライザ、歌詞、キュー。
- `TrackDetailDialog`: 曲情報、歌詞、アートワーク候補検索、アートワーク、タグ編集。
- `ArtworkCandidateDialog`: MusicBrainz / Cover Art Archive 由来の候補検索、検索中の進捗表示、候補比較、preview、保存導線。

`src/features/**` は UI から切り出した領域別ロジックです。

- `library`: library selection と Tauri repository。
- `playback`: queue resolution、preferences、HTML audio、Media Session。
- `remote-player`: remote command、remote playback clock、analysis sync。
- `tag-editing`: album/track tag、artwork、user state 更新。
- `tv-display`: TV display message と `/tv` UI。
- `ui-interactions`: mobile/touch gesture。

### 3.2 Tauri/Rust Backend

`src-tauri/src/lib.rs` は Tauri command を定義し、Rust の各 module へ委譲します。

主な command:

- `library_snapshot`
- `scan_music_folder`
- `track_lyrics`
- `create_playlist`
- `add_track_to_playlist`
- `add_tracks_to_playlist`
- `rename_playlist`
- `delete_playlist`
- `remove_playlist_track`
- `reorder_playlist_track`
- `create_playlist_from_album`
- `update_album_tags`
- `update_track_tags`
- `search_artwork_candidates`
- `preview_artwork_candidate`
- `update_album_artwork`
- `update_track_artwork`
- `update_playlist_artwork`
- `update_track_user_state`

Backend の永続化方針:

- ライブラリ DB と解析 cache はライブラリ配下の `.musical` に置く。
- ライブラリと cache を音源ファイルと一緒に持ち運べるようにする。
- app process 内だけで十分な remote state は in-memory に保持する。

### 3.3 Local HTTP/WebSocket Server

Tauri setup 時に local server を開始し、desktop/browser/Fire TV の接続点になります。

主な API:

- `GET /api/app_status`
- `GET /api/library_snapshot`
- `GET /api/tv/libraries`
- `GET /api/track_lyrics`
- `GET /api/track_analysis`
- `GET /api/track_analysis_bytes`
- `GET /api/media`
- `GET /api/player_state`
- `POST /api/player_state`
- `POST /api/player_command`
- `GET /api/player_commands`
- `POST /api/tv/player_event`
- `GET /api/mcp-settings`
- `POST /api/mcp-settings`
- `POST /api/_mcp/tools/{toolName}` internal bridge, loopback + token only
- `POST /mcp` MCP sidecar proxy, loopback only
- `GET /tv`
- `GET /tv/sessions/{sessionId}` WebSocket

アクセス制御:

- local request は許可する。
- LAN access が明示的に有効になるまで非ローカル request は拒否する。
- `/mcp` と `/api/mcp-settings` は LAN access と独立して local-only のままにする。
- MCP enabled 時、Tauri は `dist/mcp/server.js` を Node sidecar として起動し、`/mcp` request を sidecar の loopback port へ proxy する。
- MCP sidecar は `@modelcontextprotocol/sdk` の Streamable HTTP server を使い、AI SDK V7 `@ai-sdk/mcp` client から `mcpClient.tools()` / `callTool()` で検証する。
- `dev:public` は Vite 起動前に MCP sidecar を build し、production build は Vite が `dist` を生成した後に `dist/mcp/server.js` を出力する。これにより Vite の出力 cleanup で sidecar が欠落しないようにする。
- MCP internal bridge API は sidecar に渡した per-process token (`X-Musical-MCP-Token`) を要求する。
- media は server が公開した file/API 経由でのみ取得できる。
- アートワーク候補検索と候補画像 download は Tauri command 専用で、local server API には公開しない。

### 3.4 Fire TV Android Shell

Fire TV app は Android/Kotlin native shell と WebView の組み合わせです。

Native shell の責務:

- explicit intent/deep-link display URL を解決する。
- 保存済み server/library/locale を SharedPreferences で保持する。
- local IPv4 subnet の port `1422` を probe し desktop server を検出する。
- `/api/tv/libraries` を読み、Settings に server/library candidates を表示する。
- native tabs: Settings, Albums, Tracks, Player を表示する。
- DPAD、Enter、media keys、number keys、Back を WebView または native shell 操作に変換する。
- WebView lifecycle、splash、status、exit confirmation、memory diagnostics を管理する。
- WebView automatic darkening を無効化する。

WebView `/tv` の責務:

- library snapshot、lyrics、media、analysis を local server から取得する。
- Albums/Tracks/Player の TV surface を描画する。
- WebView `<audio>` で Fire TV local playback を行う。
- TV visualizer を 30 fps 上限で描画し、古い frames は decay/clear する。
- WebSocket session がある場合は display messages を適用する。

## 4. データモデル概要

### 4.1 Library

- Album: id, title, album artist, year, genre, artwork, tracks。
- Track: id, title, artist, duration, track/disc number, file path, lyrics presence, favorite, rating。
- Playlist: id, name, artwork, ordered track paths, resolved tracks, missing tracks。

### 4.2 Playback

- `currentTrack`
- `playbackAlbumId` / playback album context
- `playbackPlaylistId` / playback playlist context
- `playbackQueueTrackIds`
- `isPlaying`
- `isShuffle`
- `repeatMode`: `off`, `all`, `one`
- `currentTime`
- `volume`

### 4.3 Audio Analysis

- Analysis packet は track id、frame interval、frames、complete flag を持つ。
- Frame は time, frequency bands, peak, rms を持つ。
- Frontend は再生時刻の周辺 frame を補間して描画する。
- Fire TV は短い analysis window を繰り返し取得する。

### 4.4 TV Display

- `TvDisplayEnvelope` が session id、sentAt、message を包む。
- message は session snapshot、player state、lyrics state、queue state、analysis packet、command result、candidate prompt、session close を扱う。
- direct `/tv?libraryId=...` flow では HTTP polling も併用する。

## 5. 主要シーケンス

### 5.1 デスクトップ起動

```mermaid
sequenceDiagram
  participant App as Tauri App
  participant Rust as Rust Backend
  participant Server as Local Server
  participant UI as React UI
  participant Library as Library DB

  App->>Rust: setup
  Rust->>Server: start local HTTP server
  UI->>Rust: library_snapshot
  Rust->>Library: load last scanned library
  Library-->>Rust: snapshot
  Rust-->>UI: albums/tracks/playlists
```

### 5.2 ライブラリスキャン

```mermaid
sequenceDiagram
  participant User
  participant UI as React UI
  participant Rust as Rust Library Backend
  participant Files as Music Folder
  participant DB as .musical DB

  User->>UI: choose folder / scan
  UI->>Rust: scan_music_folder(folderPath)
  Rust->>Files: recursive scan
  Rust->>Files: read tags/artwork/lyrics presence
  Rust->>DB: write library rows
  Rust-->>UI: ScanSummary + snapshot
```

### 5.3 再生と曲終了

```mermaid
sequenceDiagram
  participant User
  participant UI as React UI
  participant Player as PlayerBar
  participant Audio as HTMLAudioElement

  User->>UI: play album/track/playlist
  UI->>Player: currentTrack + queue + isPlaying
  Player->>Audio: load/play
  Audio-->>Player: timeupdate / ended
  Player->>UI: onEnded once
  UI->>UI: stop current track
  UI->>UI: resolve repeat/shuffle/queue
  UI->>Player: next state
```

### 5.4 ビジュアライザ解析

iTunes由来の `ID3v2 + RIFF/RMP3` wrapper は、ID3 header の syncsafe size からタグ終端へ seek し、`data` chunk 以降をMP3としてprobeする。ブラウザ側の解析取得が一時失敗した場合は上限付きbackoffで再試行し、停止・曲変更時に再試行を解除する。

```mermaid
sequenceDiagram
  participant UI as React UI
  participant Server as Local API
  participant Analyzer as Rust Audio Analysis
  participant Cache as Analysis Cache
  participant Viz as Visualizer

  UI->>Server: GET /api/track_analysis
  Server->>Cache: lookup
  alt cache hit
    Cache-->>Server: frames
  else cache miss
    Server->>Analyzer: decode/analyze
    Analyzer->>Cache: save frames
    Analyzer-->>Server: frames
  end
  Server-->>UI: analysis packet
  UI->>Viz: render by playback time
```

`PlayerVisualizerOverlay` は解析 bucket を共通入力として、波、スペクトラム、サークル、山脈、DNA 螺旋、墨流し、VU メーターを Canvas 2D で描画する。オーロラとスターフィールドはそれぞれ専用の Three.js/WebGL2 canvas で GLSL シェーダーを実行し、WebGL 初期化に失敗した場合だけ Canvas 2D 描画へ fallback する。ちびキャラオーケストラは通常のモードボタンへ出さず、Chibi mode ボタンのダブルクリック/ダブルタップで一時的に切り替える。山脈は下端へ閉じる面の起伏として描く。

overlay の stacking context はブラウザ間で同じ合成結果になるよう、アートワーク背景、装飾背景、Canvas、vignette、操作 UI、closeボタンの順を非負の `z-index` で明示する。Canvasと装飾レイヤーは `pointer-events: none` とし、closeボタンを常にクリック可能な最前面へ置く。Canvas 内部のピクセル検査に加え、overlay 全体の screenshot が再生中に変化することとcloseボタンでoverlayを閉じられることをブラウザ回帰テストで検証し、親背景の背面へ Canvas が隠れる不具合と透明レイヤーが操作を遮る不具合を検出する。

専用 WebGL canvas が利用できる間、基本の Canvas 2D canvas はモード移行時に一度だけ消去し、毎フレームの全面消去を行わない。WebGL の論理サイズは `ResizeObserver` で保持し、DPR が変わらないフレームでは layout 寸法を読み直さない。全画面 post-processing は深度を使わないため renderer、composer、bloom の中間 target に深度 buffer を持たせず、色 target、DPR 上限、bloom pass 数と target 構成は維持する。周波数履歴、方向別エネルギー、palette は再利用 buffer へ書き込み、変更された uniform だけを GPU へ転送する。オーロラは音声解析処理と履歴の取得間隔を維持しながら、GPU の composer 描画だけを最大30 fpsへ制限する。オーロラは選択中の配色側だけの FBM envelope を評価し、スターフィールドは presence または halo が厳密にゼロの星候補を後続計算から除外する。オーロラの Theme/レインボーとスターフィールドは最適化前の最終 RGBA とフレーム進行を維持し、オリジナル/アートワークだけは後述する霧調プロファイルの高輝度抑制を適用する。

ビジュアライザの control dock は、通常幅では9モードを1×9、4配色を1×4で上段へ横並びにし、再生操作を最下段に保つ。モードボタンは24×24の共通 viewBox と線幅を持つ専用 SVG で、波形、スペクトラムバー、放射円、山形、オーロラカーテン、放射状ワープ、二重螺旋、墨の渦、2連メーターをそれぞれ表す。アートワーク配色はジャケットの縮小画像をボタンへ表示せず、画像枠と抽出色3点の SVG で「画像からの色抽出」を表す。幅680px以下ではそれぞれ3×3、2×2へ戻す。外周余白、段間、ボタン寸法を抑え、overlay の残りの高さを `visualizer-stage` へ割り当てる。stage 内の歌詞とキューの配置は変更しない。

オーロラは解析 bucket を低域から高域まで5帯域へ要約し、横方向へ連続する色・エネルギーマップとして補間する。GPU シェーダーは5フレームの周波数履歴、FBM ノイズ、蛇行する発光上端、多数の縦フィラメント、半透明の面光、暗部へ溶ける不規則な下端を合成する。色は横方向のオーロラパレットに加え、上端の淡い色から下端の隣接色相へ移る縦グラデーションを持つ。レインボー選択時はライムからグリーン、アクア、ブルー、バイオレット、マゼンタ、ローズへ進む8色を左から右へ補間し、オリジナル選択時の寒色中心パレットと明確に区別する。オリジナルとアートワークは霧調プロファイルを使い、細い白い芯、露出、bloom を抑えながら低輝度の面光、カーテン周辺の拡散光、半透明の霞を残す。Theme は従来の非レインボー描画、レインボーは細線主体の形状、専用露出、専用 bloom を維持する。レインボーの解析履歴は約48 ms間隔で更新し、帯域エネルギーを上端位置、フィラメント長、輝度へ強く反映する。`EffectComposer` の `UnrealBloomPass` は高輝度の芯だけへ薄い bloom を加え、面全体の白飛びを避ける。Canvas 2D fallback でも霧調プロファイルでは加算合成の不透明度と白混合を下げ、面の blur を広げる。帯域の強度はフィラメントの丈、輝度、太さ、揺れへ反映する。DNA 螺旋は一定間隔で解析 bucket を周波数履歴へ取り込み、低音から高音へ分割した1時点のスナップショットを横線1本として描く。新しい横線は下側、古い横線は上側へ配置し、両端を逆位相の二重螺旋で結ぶ。描画モードと配色モードは独立したボタングループで選択する。配色は旧来の時間変化する HSL 配色を再現するオリジナル、アプリテーマ、アートワークから抽出した代表色、固定レインボーから選択する。通常モードの選択値は `localStorage` へ保存し、`prefers-reduced-motion` が有効な場合は粒子数、回転、移動速度、bloom 強度を抑制する。

スターフィールドは画面中央付近の消失点から星を手前へ射出するワープ航行表現とする。GPU シェーダーは距離と速度の異なる5層の放射状光跡、中心付近の微細な星間ダスト、色付きのハロー、中心フレア、薄い衝撃波リングを合成する。周波数 bucket は32方向へ割り当てる前に、完全な32分割を列方向へ読む `1,33,65,2,34,66…` 型の順序へ並べ替える。これにより隣接する周波数値を角度方向へ散らし、特定帯域が強い場合も一方向だけへ光跡が偏ることを防ぐ。各方向の平滑化エネルギーは光跡の出現数、長さ、太さ、輝度を制御し、全体エネルギーと正の差分から求めた立ち上がり成分は一時的に光跡数、中心フレア、衝撃波、bloom を強める。停止時は平滑化済みエネルギーと立ち上がり状態をリセットし、音声連動光跡を残留させない。低域は加速度、中域は空間の霞、高域は微細星と瞬きにも反映する。`UnrealBloomPass` は光跡の芯だけを発光させ、背景の黒とUI文字の可読性を保つ。低モーション設定では移動速度、光跡長、衝撃波、立ち上がり反応、bloom 強度を抑える。

remote 解析 packet の `frameTimecodes` は昇順を前提とし、推定再生時刻以上となる最初の frame を lower-bound 二分探索で求める。探索後の前後 frame と補間係数は従来どおりとし、長い曲でもフレーム数に比例する毎描画走査を行わない。

### 5.5 Browser Backend Remote Control

```mermaid
sequenceDiagram
  participant Browser
  participant Server as Local Server
  participant Desktop as Tauri Player

  Browser->>Server: GET /api/player_state polling
  Server-->>Browser: desktop playback state
  Browser->>Server: POST /api/player_command
  Desktop->>Server: GET /api/player_commands polling
  Server-->>Desktop: command
  Desktop->>Desktop: apply playback change
  Desktop->>Server: POST /api/player_state
```

### 5.6 Fire TV Direct Launch

```mermaid
sequenceDiagram
  participant FireTV as Fire TV Native Shell
  participant Server as Desktop Local Server
  participant WebView as React /tv

  FireTV->>FireTV: read saved URL/library
  FireTV->>Server: GET /api/app_status
  alt server unavailable
    FireTV->>FireTV: scan local IPv4 subnets on 1422
  end
  FireTV->>Server: GET /api/tv/libraries
  FireTV->>FireTV: user selects library
  FireTV->>WebView: load /tv?libraryId=...
  WebView->>Server: GET /api/library_snapshot?libraryId=...
  WebView->>Server: GET /api/media / lyrics / analysis
  WebView->>WebView: local audio playback
```

## 6. UI 設計方針

- デスクトップ UI は広いライブラリ閲覧と下部 player を中心に構成する。
- 狭い画面ではパネル折りたたみ、長押し、縦スワイプなど mobile-style interaction を使う。
- Player mode は実再生状態を保ったまま full-screen overlay として開く。
- Fire TV UI は 10-foot UI として、視認性、remote focus、低負荷描画を優先する。
- Fire TV の色は modern CSS color functions と fallback color の両方で成立させる。
- UI copy は通常実装では English/Japanese locale のみ更新する。

## 7. エラーとフォールバック

- 解析失敗時も再生、キュー、Player mode を壊さない。
- Remote/offline analysis がなければ Web Audio analyser、または idle 表示へ落とす。
- Browser backend では Tauri native 機能を desktop-only として扱う。
- Fire TV server discovery に失敗した場合は fallback URL と Settings を表示する。
- 保存済み Fire TV library が見つからない場合は自動で先頭 library を選ばず、明示選択を待つ。
- Android WebView の forced dark / unsupported CSS color function により TV player が読めなくならないよう fallback を持つ。

## 8. テストと確認観点

変更内容に応じて次を選択して実行する。

- `npm run build`
- `cargo check`
- `cargo test`
- `VITE_MOCK_DATA=true npx playwright test tests/e2e/library.spec.ts -g "player mode"`
- Fire TV unit tests
- Fire TV debug APK / emulator / device 確認
- real Tauri/local backend での動作確認

重点確認:

- ライブラリスキャン、再読み込み、検索、ソート。
- 再生ボタンと曲終了シーケンス。
- シーク/曲変更時の analysis frame clear。
- Player mode と Chibi visualizer。
- Browser backend remote command の即時 UI 反映。
- Fire TV discovery、library selection、remote navigation、local playback、analysis window。

## 9. ドキュメント更新ルール

機能変更、仕様変更、UI/UX 変更、API/データ構造変更、ランタイム責務変更を行う場合は、コード修正と同じ変更セットで次を確認する。

- 機能棚卸しが変わる場合は `Specs/feature-list.md` を更新する。
- 基本設計や責務分担が変わる場合は `Specs/basic-design.md` を更新する。
- 詳細仕様が変わる場合は `Specs/current-platform-capabilities.md` と `Specs/current-platform-capabilities_JP.md`、または該当する `docs/*.md` を更新する。
- Fire TV protocol / architecture / UI design が変わる場合は `docs/firetv-*.md` を更新する。
- 再生終了、キュー、ボタン状態が変わる場合は `Specs/playback-sequences.md` を更新する。
- ビジュアライザの解析・描画挙動が変わる場合は `docs/visualizer-design.ja.md` を更新する。
