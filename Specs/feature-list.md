# Musical 機能一覧

この文書は、現在の仕様書とコードをもとにした Musical の機能棚卸しです。
将来案ではなく、現時点で実装済みまたは実装中のプロダクト面を記録します。

主な参照元:

- `Specs/current-platform-capabilities.md`
- `Specs/current-platform-capabilities_JP.md`
- `Specs/playback-sequences.md`
- `docs/visualizer-design.ja.md`
- `docs/firetv-display-architecture.md`
- `docs/firetv-display-protocol.md`
- `docs/firetv-tv-ui-design.md`
- `src/app/AppShell.tsx`
- `src/features/**`
- `src-tauri/src/**`
- `apps/firetv/app/src/main/java/app/musical/firetv/**`

## 対象プラットフォーム

| プラットフォーム | 役割 | 主な実行環境 |
| --- | --- | --- |
| デスクトップアプリ | ライブラリ管理、実音声再生、編集、ローカルサーバー提供 | Tauri on Windows / macOS / Linux |
| ブラウザアプリ | Mock 検証、またはデスクトップローカルサーバーへのリモート操作 | Vite/React in browser |
| Fire TV アプリ | テレビ向け再生画面、キュー、歌詞、アルバム/曲選択、ローカル TV 再生 | Android/Kotlin shell + WebView `/tv` |

## ライブラリ管理

- ローカル音楽フォルダを選択して再帰スキャンする。
- スキャン済みライブラリをライブラリ配下の `.musical` データ領域に保存する。
- 起動時に最後のライブラリを再読み込みする。
- ファイル探索、タグ読み取り、DB 書き込み、アートワーク準備の進捗を表示する。
- アルバム、曲、プレイリストを共通モデルで扱う。
- 埋め込みメタデータ、曲長、歌詞有無、アートワークを読み取る。
- 対応音声拡張子は `aac`, `aif`, `aiff`, `alac`, `ape`, `flac`, `m4a`, `m4b`, `mka`, `mp3`, `mp4`, `oga`, `ogg`, `opus`, `wav`, `wma`。

## 閲覧と検索

- アルバムを大アイコン、小アイコン、アルバム表、曲表、プレイリスト表示で切り替える。
- アルバム、アーティスト、年、プレイリスト、曲名、曲アーティスト、ファイルパスを検索する。
- アルバムをタイトル、アーティスト、年で昇順/降順ソートする。
- 歌詞ありのアルバム/曲に絞り込む。
- アルバム選択、曲選択、曲詳細表示を再生状態と独立して操作する。
- 狭い画面ではアルバムパネルを縦スワイプで折りたたみ/展開する。

## 再生

- アルバム、曲、プレイリストを再生する。
- 再生、一時停止、前へ、次へ、シーク、ミュート、音量、シャッフル、リピートを操作する。
- 現在曲、再生元アルバム/プレイリスト、キュー、再生状態、音量、現在時刻を保持する。
- 前へ操作は、再生位置が 3 秒を超えていれば同一曲の先頭へ戻り、それ以外は前のキュー項目へ移動する。
- 曲終了時は一度停止状態を経由し、リピート/シャッフル/キュー規則に従って次の状態へ遷移する。
- キューポップオーバーを hover または click/tap で表示する。
- 利用可能な環境では Media Session API に再生メタデータと操作を同期する。

## Player Mode とビジュアライザ

- Player mode でアートワーク、ビジュアライザ、歌詞パネル、キュー、再生操作を全画面表示する。
- PlayerBarのキューは可変幅オプションから分離し、Player mode入口はグリッド自動配置から外してPlayerBar右端へ固定する。入口とフォーカス外枠分の右余白をキュー領域へ確保し、通常幅、Tauriの1226×768前後、タブレット、モバイルで完全表示する。Player mode入口は明示的なaccessible name、マウス・キーボード操作、可視のフォーカス状態を持つ。
- 表示モードボタンは `Wave`, `Spectrum`, `Circle`, `Peaks`, `Aurora`, `Starfield`, `DNA Helix`, `Flowing ink`, `VU meters`, `Warp Hole` を持つ。`Aurora` は専用の Three.js/WebGL2 シェーダーで低域から高域までの5帯域を連続した色・エネルギーマップへ補間し、発光する上端、半透明の面光、縦フィラメント、縦横のカラーグラデーション、薄い bloom へ周波数履歴を重ねる。`Starfield` は専用シェーダーで5層の星を消失点から放射し、長い光跡、星間ダスト、色付きハロー、中心フレア、衝撃波リングを合成してワープ航行の疾走感を表す。周波数 bucket は `1,33,65,2,34,66…` 型で32方向へ散らし、各方向のエネルギーと音の立ち上がりで光跡の出現数、長さ、太さ、輝度、bloom を変える。`DNA Helix` は専用の単一パス WebGL シェーダーで、横線ごとに1時点の低音から高音までの周波数分布を表し、新しい履歴を下側へ追加して古い履歴を上側へ送る。中央・左右の二重螺旋へ霧状のカーテン、音に反応する水平光条、250〜450個相当の微粒子、40〜80本相当の短い尾、同時に2〜4本読める外向き波面を重ねる。低エネルギー時の視認性は最低輝度と履歴差分の感度で確保し、静止ノイズを音声反応として増幅しない。`Warp Hole` は左寄りの暗い消失孔へ遠近圧縮した14本の螺旋レールと、下左右から入って共通の内向きカールへ収束するシアン/マゼンタの2本の流れを単一パスで合成する。粒子と短い微細スパイクは近い流れへ付着し、寒色スペクトルの固有色へ選択配色を微かに加える。4モードとも WebGL を利用できない場合は Canvas 2D へ fallback する。
- モードと配色は、ビジュアライザ描画領域の下に分離したアイコン専用UIで選択する。通常幅では10モードと4配色をそれぞれ横一列、狭い画面ではモードを3列、配色を2×2とし、右向き矢印を挟んで並べる。再生操作はその下段に置く。
- 配色は従来の連続色相または寒色パレットを使うオリジナル、テーマ追従、アートワーク抽出、ライムからローズまでを連続させるレインボーから選択し、モードとともに `localStorage` へ保存する。
- Chibi mode を切り替え、`localStorage` の `musical.visualizerChibiMode` に保存する。
- Chibi mode ボタンのダブルクリック/ダブルタップで、非表示の Chibi orchestra mode を切り替える。
- Chibi character と chibi orchestra のビジュアルアセットを使う。
- OS の低モーション設定では、連続移動を伴う描画の速度と要素数を抑える。
- 再生中は remote/offline analysis frame、または Web Audio analyser fallback で描画する。
- 停止中や解析未取得時は idle 表示に落とす。
- シークや曲変更時は古い解析フレームをクリアし、別曲の stale frame を描画しない。
- 解析フレームは Rust backend が生成し、ライブラリ配下の `.musical/audio_analysis.sqlite3` にキャッシュする。

## 曲情報とタグ編集

- アルバムタイトル、アルバムアーティスト、曲アーティスト、年、ジャンルをアルバム単位で編集する。
- 曲タイトル、アーティスト、アルバムタイトル、年、ジャンル、トラック番号、ディスク番号を曲単位で編集する。
- 必須項目を検証してから保存する。
- Rust backend 経由で音声ファイルへタグ変更を書き込む。
- 曲アートワークとプレイリストアートワークをネイティブ画像ピッカーから更新する。
- デスクトップ Tauri では MusicBrainz / Cover Art Archive 由来のアートワーク候補をアプリ内で閲覧し、検索中の処理内容と進捗を表示しながら、選択候補をアルバム全曲のアートワークとして保存する。
- Google 画像検索は既定ブラウザで開く補助導線として提供し、Google Images の検索結果をアプリ内で scraping しない。
- 曲のお気に入りとレーティングを設定/解除する。
- 保存済み歌詞を曲詳細と Player mode に表示する。

## プレイリスト

- 空のプレイリストを作成する。
- 選択アルバムからプレイリストを作成する。
- プレイリストの改名、削除、アートワーク更新を行う。
- アルバム内の 1 曲または全曲をプレイリストへ追加する。
- 重複追加を UI で防ぐ。
- プレイリスト曲を削除、上下並べ替えする。
- プレイリスト曲から元アルバムへ移動する。
- 見つからない曲を表示し、ファイル復元後に再読み込みできる。

## ローカライズと設定

- メイン UI は日本語/英語を切り替える。
- テーマは crimson, ocean, violet, forest, amber, mono を選択する。
- locale、theme、sidebar state、library menu state、playback preferences を local storage に保存する。
- UI 文言を通常実装で追加/変更する場合は `src/locales/en.xml` と `src/locales/ja.xml` のみを更新する。

## ローカルサービスとリモート操作

- Tauri 起動時にローカル HTTP サーバーを開始する。
- `/api/*` で library snapshot、lyrics、media file、audio analysis、player state、command queue を提供する。
- media file は HTTP byte-range に対応する。
- LAN access が有効になるまで非ローカル HTTP client を拒否する。
- LAN/public control URL の QR code を表示する。
- dev mode では public dev tunnel を任意で公開する。
- ローカル MCP endpoint を切り替える。無効時の `/mcp` は 404 を返す。
- MCP endpoint は AI SDK V7 compatible な TypeScript sidecar と MCP SDK server で提供し、Tauri local server は `/mcp` を sidecar へ proxy する。
- MCP sidecar は loopback だけに bind し、Tauri internal bridge は per-process token で保護する。
- MCP tools は player/library read、album/track/artist discovery、playback/queue command、favorites、playlist mutation、tag/artwork/user-state mutation を公開し、AI SDK `createMCPClient` で tool discovery と `structuredContent` を検証する。
- ブラウザバックエンドモードでは、ブラウザが再生を所有せず、デスクトップへ remote player command を送る。

## Fire TV

- Android/Fire TV アプリとして起動し、React `/tv` route を WebView でホストする。
- JavaScript、DOM storage、mixed content、ユーザー gesture なし media playback を有効にする。
- Android WebView の自動 darkening を無効化し、TV CSS の色を維持する。
- Native top tab shell は Settings, Albums, Tracks, Player を持つ。
- Settings で Musical desktop server を検出し、ライブラリを選択する。
- 明示的な `display_url` intent extra または `musical-firetv://display` deep link を受け取る。
- `/api/tv/libraries` からライブラリ一覧を取得し、選択した `libraryId` を `/tv?libraryId=...` に渡す。
- Player では Now Playing、アートワーク backdrop、キュー、歌詞、再生操作、前後曲ヒント、メモリ診断 overlay を表示する。
- WebView 内の `<audio>` が Fire TV local playback を所有する。
- `/api/media`, `/api/track_lyrics`, `/api/track_analysis_bytes`, `/api/track_analysis` を使う。
- Fire TV remote の DPAD、Enter、media keys、number keys を WebView または native shell の操作へ変換する。
- `sessionId` がある場合は `/tv/sessions/{sessionId}` WebSocket に接続し、session snapshot や display messages を適用する。
- `color-mix(in oklch, ...)` 非対応 WebView でも TV player の視認性を保つ fallback color を持つ。

## Mock / 検証モード

- `VITE_MOCK_DATA=true` で mock data runtime を起動する。
- Mock web mode では実ファイルスキャン、実音声再生、タグ書き込み、アートワーク書き込みは行わない。
- Mock playback と mock audio analysis により UI regression test と Player mode 検証を行う。
- 通常の開発確認は real Tauri/local backend を使う。

## 現在の主な制約

- 実スキャン、ファイル再生、タグ/アートワーク書き込み、フォルダ/画像ピッカーは Tauri が必要。
- アートワーク候補検索、候補画像 download、アルバム全曲へのアートワーク保存は Tauri main window 専用で、local server API には公開しない。
- Remote HTTP state、queued player commands、display devices、TV player events は現 app process 内 in-memory。
- Fire TV は到達可能な desktop local server に依存する。
- Fire TV discovery は現在 local IPv4 subnet の port `1422` を対象にする。
- Fire TV は tag、artwork、rating、favorite、playlist、library scan settings を編集しない。
- Fire TV WebView playback は Android WebView の codec/support behavior に依存する。
- Production Alexa/DIAL flow は未完成で、現状は command enqueue と state 記録が中心。
