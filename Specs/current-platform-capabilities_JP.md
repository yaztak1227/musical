# 現行プラットフォーム仕様

この文書は、Musical の現在の挙動をランタイム別に記録し、今後の設計変更でデグレを確認できるようにするための仕様です。将来構想ではなく、現時点で実装されているプロダクト面を対象にします。

## 対象範囲

対象プラットフォーム:

- デスクトップ版: Windows、macOS、Linux 上の Tauri ランタイム。
- ブラウザ版: 通常のブラウザで開く React/Vite アプリ。
- Fire TV 版: `/tv` の React 表示を Android/Kotlin の Fire TV シェル内 WebView でホストするアプリ。

主な実装参照:

- デスクトップ/ブラウザのシェル: `src/app/AppShell.tsx`, `src/app/hooks/useAppController.ts`
- バックエンドランタイム判定: `src/lib/backend.ts`
- デスクトップローカル HTTP サーバー: `src-tauri/src/local_server.rs`
- ライブラリバックエンド: `src-tauri/src/library.rs`
- TV 表示ルート: `src/features/tv-display/presentation/TvDisplayApp.tsx`
- Fire TV シェル: `apps/firetv/app/src/main/java/app/musical/firetv/MainActivity.kt`
- Fire TV 検出/設定: `apps/firetv/app/src/main/java/app/musical/firetv/FireTvDiscoveryRepository.kt`,
  `apps/firetv/app/src/main/java/app/musical/firetv/FireTvSettingsPanel.kt`

## 共通プロダクトモデル

アプリは音楽を次の単位で整理します。

- アルバム: タイトル、アルバムアーティスト、年、ジャンル、アートワーク、曲を持つ。
- 曲: タイトル、アーティスト、長さ、トラック番号/ディスク番号、ファイルパス、歌詞有無、お気に入り状態、任意のレーティングを持つ。
- プレイリスト: 名前、アートワーク、順序付きトラックパス、見つからない曲の報告、解決済みトラックを持つ。

現在対応しているライブラリ音声拡張子:

- `aac`, `aif`, `aiff`, `alac`, `ape`, `flac`, `m4a`, `m4b`, `mka`, `mp3`,
  `mp4`, `oga`, `ogg`, `opus`, `wav`, `wma`

共通の再生モデル:

- 現在の曲。
- 再生中のアルバムまたはプレイリスト文脈。
- キュー内のトラック ID。
- 再生/一時停止状態。
- シャッフル状態。
- リピートモード: `off`, `all`, `one`。
- 現在時刻と音量。

## デスクトップ版

### できること

ライブラリ:

- Tauri のネイティブフォルダピッカーでローカル音楽フォルダを選択する。
- フォルダを再帰的にスキャンし、インデックス化したライブラリをライブラリ配下の `.musical` データ領域にあるローカル SQLite データベースへ保存する。
- 起動時に最後にスキャンしたライブラリを再読み込みする。
- ファイル探索、タグ読み取り、DB 書き込み、アートワークアクセス準備中にスキャン/読み込み進捗を発行して表示する。
- 埋め込みメタデータ、長さ、歌詞有無、アートワークを読み取る。
- スキャン済みライブラリのアートワークを表示用にキャッシュ/公開する。

閲覧と選択:

- アルバムを大アイコン、小アイコン、アルバム表、曲表、プレイリスト表示で閲覧する。
- アクティブな表示に応じて、アルバム、アーティスト、年、プレイリスト、曲名、曲アーティスト、ファイルパスを検索する。
- アルバムをタイトル、アーティスト、年で昇順/降順ソートする。
- 歌詞があるアルバム/曲だけに絞り込む。
- 現在の再生キューを変えずにアルバムを選択する。
- 再生を変えずに曲タイトルを選択する。
- デスクトップのクリック/コンテキスト操作、狭いレイアウトでのモバイル風長押しから曲詳細を開く。
- 狭いレスポンシブレイアウトでは、アルバムパネルを縦スワイプで折りたたみ/展開する。

再生:

- カード、表の行、選択アルバム操作からアルバムを再生する。
- 個別曲を再生し、その曲のアルバム文脈からキューを作る。
- プレイリストを保存順に再生する。
- 再生/一時停止、前へ、次へ、シーク、ミュート、音量、シャッフル、リピートを操作する。
- 再生位置が 3 秒を超えている状態で前へを押すと、現在曲の先頭へ戻る。
- 曲終了後はリピート/シャッフル規則に従って続行する。
- プレイヤーからキューポップオーバーを表示する。
- Player mode を開き、アートワーク、ビジュアライザ、歌詞パネル、キュー操作、再生操作を表示する。
- 利用可能な場合はブラウザ Media Session API で再生メタデータと play/pause/stop アクションを同期する。
- 実音声の読み込みは Tauri ランタイムでのみ行い、Tauri のファイルアセット変換を使う。

デスクトップの再生ボタンとコントロール:

- アルバムカード中央の再生ボタン:
  - そのアルバムのキュー先頭曲から再生する。
  - ボタン自体を押してもアルバム選択は変更しない。
  - 同じアルバムが再生アルバムで、かつ再生中の場合は一時停止ボタンに変わる。
- アルバムカード本体:
  - アルバムを選択する。
  - 再生を開始してはいけない。
- アルバム表の行内再生ボタン:
  - そのアルバムを再生または一時停止する。
  - アクティブなアルバムについて、下部プレイヤー状態と一致していなければならない。
- 選択アルバムパネル内の曲行/タイトルボタン:
  - 詳細文脈用に曲を選択する。
  - 現在の再生曲を変更してはいけない。
- 曲 hover 再生ボタン:
  - その曲から再生を開始し、アルバム文脈からキューを作り直す。
- Player bar の再生/一時停止ボタン:
  - 現在曲がなく、アルバムが選択されている場合は、選択アルバムを開始する。
  - それ以外は現在曲の `isPlaying` を切り替える。
- 前へボタン:
  - 現在の再生時刻が 3 秒より大きい場合は `0` へシークする。
  - それ以外は前のキュー項目へ移動し、先頭では最後の項目へ折り返す。
- 次へボタン:
  - キュー/リピート規則に従って移動する。
  - 規則上次の曲が存在しない場合は、再生を停止して `0` へシークする。
- シーク操作:
  - Player bar 経由で audio 要素の再生位置を更新する。
  - ジャンプ後に古いフレームでビジュアライザが動き続けないよう、現在の音声解析パケットをクリアする。
- 音量/ミュート操作:
  - デスクトップモードでは Player bar/audio 要素だけを更新する。
  - ブラウザバックエンドモードではデスクトッププレイヤーへ remote command を送る。
- シャッフルボタン:
  - 現在曲を軸にキュー順を作り直す。
  - リモートブラウザとして動作している場合は、次の `queueTrackIds` を含む remote command を送る。
- リピートボタン:
  - `off -> all -> one -> off` の順で切り替える。
- キュートグル:
  - hover でキューポップオーバーを表示する。
  - click でキューポップオーバーを固定/解除する。
- Player mode ボタン:
  - 全画面の `PlayerVisualizerOverlay` を開く。
  - 背後の現在曲、キュー、再生/一時停止状態、Player bar 状態を維持する。

デスクトップ Player mode のボタンとタブ:

- 閉じるボタン:
  - ビジュアライザ overlay を閉じる。Escape でも閉じる。
- Chibi mode ボタン:
  - ビジュアライザ内のキャラクター描画を切り替える。
  - `localStorage` の `musical.visualizerChibiMode` に保存する。
- ビジュアライザモードボタン:
  - `Wave` は波形ビジュアライゼーションを描く。
  - `Spectrum` はバー/スペクトラムビジュアライゼーションを描き、デフォルトモードである。
  - `Circle` は円形ビジュアライゼーションを描く。
  - 選択したモードは再生状態を変えず即座に反映される。
- Player mode の再生操作:
  - 前へ、再生/一時停止、次へは Player bar と同じハンドラを呼ぶ。
  - 現在曲がない場合、ボタンは無効になる。
- Player mode のキュー:
  - 現在のキューを順番に一覧する。
  - 現在曲は current として表示される。
  - 現在行の再生ボタンは再生/一時停止を切り替え、別の行の再生ボタンはそのキュー曲へ切り替える。
- Player mode の歌詞パネル:
  - 現在曲の読み込み済み歌詞が空でない場合のみ表示される。
  - Player mode を開いたとき、および Player mode を開いたまま現在曲が変わったときに歌詞を読み込む。

デスクトップビジュアライザ描画:

- overlay は常に canvas を作成する。
- 再生が live でない場合、canvas は idle 状態を描く。
  - Wave mode では idle wave。
  - Circle mode では idle circle。
  - Spectrum mode では idle spectrum。
  - Chibi mode が有効な場合は、通常の idle scene ではなく、周波数値をゼロにした対応キャラクター scene を描く。
- 再生が live の場合、`requestAnimationFrame` でアニメーションする。
- ビジュアライザが live とみなされるのは、`isPlaying` が true かつ以下のいずれかが true のときだけ。
  - Web Audio analyser が利用可能。
  - そのランタイムで remote/offline analysis を優先する。
  - 音声解析パケットに既にフレームがある。
- 現在のデスクトップ/ブラウザバックエンド用途では remote/offline analysis を優先するため、canvas はキャッシュ済み/デコード済み解析フレームを先に使う。解析フレームがまだ無い場合、デスクトップ renderer は Web Audio で live の `<audio>` 要素を fallback サンプリングできる。
- remote/offline analysis フレームがある場合、推定再生時刻の周辺フレーム timecode 間を補間して描画する。
- remote/offline フレームがなく Web Audio が利用可能な場合は、`AnalyserNode.getByteFrequencyData` をサンプリングする。
- 周波数データは平滑化、動的拡張されたうえで、アクティブなビジュアライザモードに描画される。

音楽解析タイミング:

- 解析フレーム間隔は 33 ms。
- 解析 bucket 数は 256。
- バックエンド FFT size は 512。
- バックエンド analyser 範囲は `-88 dB` から `-18 dB`、smoothing constant は `0.58`。
- フロントエンドの remote-analysis request は 30 秒チャンクを使う。
- 要求する解析 duration は `max(15 minutes, track duration + 2 seconds)`。
- フロントエンドは完了済み解析パケットを最大 5 件までメモリ保持する。
- `currentTrack` が変わったとき:
  - 再生エラーをクリアする。
  - Player position をリセットする。
  - Tauri ランタイムでは HTML audio source を差し替える。
  - 現在の解析パケットを即座にクリアする。
- Tauri またはブラウザバックエンドランタイムで、現在曲がある状態で `isPlaying` が true になったとき:
  - `loadTrackAnalysis(currentTrack)` が走る。
  - その曲の完了済みパケットがメモリキャッシュにある場合は、それを再利用し現在の再生時刻に rebase する。
  - 同じ曲が既にロード中の場合、フロントエンド側で重複ロードは開始しない。
  - それ以外の場合、`/api/track_analysis` へ 30 秒チャンクで曲を要求する。
  - 返ってきた各チャンクごとに partial packet を `audioAnalysisPacketRef` へ書き込み、全トラック要求が完了する前でもビジュアライザが動き始められるようにする。
  - メモリ内 packet cache に保存するのは完了済みパケットだけ。
- `isPlaying` が false になったとき、または現在曲がないとき:
  - `audioAnalysisPacketRef` をクリアする。
  - active analysis load state をクリアする。
  - loaded analysis track marker をクリアする。
  - 完了済み packet cache をクリアする。
  - つまり pause/stop は、フロントエンドメモリ上のビジュアライザ packet を意図的に削除する。
- Tauri デスクトップ再生中:
  - 現在曲の analysis cache を best-effort で warm する。
  - 現在曲の次のキュー項目を best-effort で warm する。
  - 現在曲がない、再生が停止中、またはその曲が既に warming 中の場合、warmup はスキップされる。
  - warmup error は無視され、再生は継続する。
- バックエンド `/api/track_analysis` の挙動:
  - `trackId`, `from`, `duration`, 任意の `totalDuration`, 任意の `compact` を読む。
  - `duration` は 0.25 秒から 4 時間に clamp する。
  - `totalDuration` は少なくとも `duration`、最大 4 時間に clamp する。
  - 要求ファイル/バージョン/duration の完全キャッシュがある場合は cached frames を返し、`isComplete: true` を付ける。
  - 完全キャッシュがない場合は、要求 total duration について先頭から decode/analyze し、結果を保存し、その request path からは `isComplete: true` として返す。
  - 同じ track への同時解析 request は `active_track_analysis_loads` で dedupe され、後続 request は先行処理の完了を待って cache を読む。
  - track analysis request を返した後、公開済み desktop `player_state.queueTrackIds` を基に次曲 prefetch を試みる。
- バックエンド次曲 prefetch:
  - `player_state` が存在し、要求/解析された track の次曲がその queue にある場合のみ走る。
  - track duration + 2 秒を使う。
  - active prefetch は `active_track_analysis_prefetches` で dedupe する。
  - error は log して skip し、元の analysis request は失敗させない。
- Mock web mode:
  - 再生中は現在曲の mock analysis packet を作る。
  - 停止中、または現在曲がない場合は mock analysis packet をクリアする。
- Browser-backend remote mode:
  - `/api/player_state` から 250 ms ごとに再生状態を同期する。
  - 再生中は remote playback clock で現在時刻を推定する。
  - remote clock が別 track に変わった場合、analysis load を cancel/ignore する。
- Player mode 遷移要件:
  - track 再生中に Player mode を開いた場合、既存 analysis packet を再利用するか、現在曲 analysis を開始/継続し、ビジュアライザが動き始めること。
  - 次曲へ移動した場合、古い frame をクリアし、新しい track の load を開始し、次の queue item を best-effort で warm すること。
  - pause/stop 中は前回再生状態の古い frequency movement ではなく、idle visualizer motion を表示すること。

タグ付けとメタデータ:

- アルバムタイトル、アルバムアーティスト、アルバム内の曲アーティスト、年、ジャンルを編集する。
- 曲タイトル、アーティスト、アルバムタイトル、年、ジャンル、トラック番号、ディスク番号を編集する。
- 保存前に必須のアルバムタイトルと曲タイトルを検証する。
- Rust バックエンド経由でタグ変更を音声ファイルへ永続化する。
- 一部ファイルを書き込めなかった場合、アルバムタグ保存の partial failure を報告する。
- ネイティブ画像ファイルピッカーから曲アートワークを更新する。
- Tauri main window 内で MusicBrainz / Cover Art Archive 由来のアートワーク候補を閲覧し、選択候補を preview してアルバム内トラック全体のアートワークとして保存する。
- Google 画像検索は補助導線として既定ブラウザで開き、アプリ内では Google Images の検索結果を scraping しない。
- ネイティブ画像ファイルピッカーからプレイリストアートワークを更新する。
- 曲をお気に入り/お気に入り解除する。
- 曲のレーティングを設定/クリアする。
- 保存済み曲歌詞を読み込んで表示する。

プレイリスト:

- 空のプレイリストを作成する。
- 選択アルバムからプレイリストを作成する。
- プレイリスト名を変更、削除する。
- 1 曲、またはアルバム全曲をプレイリストへ追加する。
- UI 上で重複追加を防ぐ。
- プレイリスト曲を削除する。
- プレイリスト曲を上下に並べ替える。
- プレイリスト曲から元アルバムへジャンプする。
- 見つからないプレイリスト曲を表示し、ファイル復元後に reload できる。

ローカライズと設定:

- メイン UI を日本語/英語で切り替える。
- locale、theme、sidebar state、library menu state、playback preferences を local storage に保存する。
- theme は crimson, ocean, violet, forest, amber, mono を選択できる。

アップデートとローカルサービス:

- サポートされる場合、Tauri updater 経由でアップデート確認/インストールを行う。
- ローカル HTTP サーバーの LAN access を切り替える。
- dev mode では dev tunnel API が利用可能な場合に public dev tunnel を任意で公開する。
- LAN/public control URL の QR code を表示する。
- ローカル MCP endpoint を切り替える。`/mcp` endpoint は local-only で、無効時は 404 を返す。

リモートブラウザ操作:

- player state をローカル desktop HTTP server へ publish する。
- remote browser command を poll し、desktop player に適用する。
- `/api/*` 経由で library snapshot、lyrics、media file、audio analysis segment、player state、command queue を提供する。
- stream client 向けに media file を HTTP byte-range 対応で提供する。
- LAN access が明示的に有効化されるまでは、非ローカル HTTP access を拒否する。

TV/Fire TV 対応:

- ローカルサーバーから `/tv` と static frontend assets を提供する。
- 現在スキャン済みのライブラリを `/api/tv/libraries` で公開する。
- `/api/library_snapshot` で `libraryId` を受け取り、不一致の library ID を拒否する。
- TV client 向けに `/api/media`, `/api/track_lyrics`, `/api/track_analysis`, `/api/track_analysis_bytes` を提供する。
- `/tv/sessions/{sessionId}` の WebSocket 接続を受け取り、初期 `session_ready` と `session_snapshot` を送る。
- HTTP または WebSocket client から TV player event を記録する。
- display device registration と fuzzy resolution API を in-memory で保持する。
- Fire TV launch と voice-command request を player command として queue に入れる。

### デスクトップ版の制約

- 実スキャン、ファイル再生、タグ書き込み、アートワーク書き込み、アップデート確認、フォルダピッカー、プレイリスト永続化には Tauri が必要。
- アートワーク候補検索、候補画像 download、アルバム全体へのアートワーク保存は Tauri main window 専用で、local HTTP server には公開しない。
- Remote HTTP state、queued player commands、display devices、TV player events は現在の app process 内 in-memory。
- LAN access が有効になるまで、非ローカル HTTP client は `403 remote access is private` を受け取る。
- LAN access には検出可能な LAN IPv4 address が必要。
- MCP settings と `/mcp` は local-only。
- Public tunnel support は development-only で、dev server が `/api/public-dev-tunnel` を公開していることに依存する。
- WebSocket TV session は現在 initial snapshot を送る。継続的な TV state sync は限定的で、TV route は HTTP endpoint の poll も使う。
- Fire TV/DIAL launch と voice command endpoint は現在 command enqueue と state 記録を行うが、production Alexa/DIAL flow 全体を表すものではない。

## ブラウザ版

ブラウザ版には現在 2 つの動作モードがあります。

### Mock Web Mode

起動方法:

```bash
VITE_MOCK_DATA=true npm run dev -- --host 127.0.0.1 --port 1423
```

できること:

- bundled mock albums に対してメイン UI 全体を描画する。
- 閲覧、検索、ソート、歌詞フィルタ、アルバム/曲選択、曲詳細、言語切替、theme 切替を行う。
- 実ローカル音声ファイルを読み込まずに playback state を UI 上で動かす。
- Player mode と animated mock audio analysis を動かす。
- mock playlist をメモリ上で作成、改名、削除、並べ替え、再生する。
- tag、favorite/rating、非 artwork playlist changes をメモリ上で simulate する。
- Playwright UI regression tests を実行する。

制約:

- ローカルフォルダをスキャンしない。
- 実ライブラリ DB を永続化しない。
- 実ローカルファイルを再生しない。
- 音声タグやアートワークを書き込まない。
- ネイティブフォルダ/画像ピッカーは利用できない。
- update check は desktop-only として報告される。
- mock playlist と mock tag changes は、local storage が UI preferences を保持する場合を除き、ブラウザセッションを越えて durable ではない。

Mock browser のコントロールとビジュアライザ:

- ネイティブ機能が不要な範囲では、メイン tab と button はデスクトップ UI と同じように動く。
- Player bar の play/pause、previous、next、shuffle、repeat、queue popover、Player mode は React playback state だけを更新する。
- mock playback 中に Player mode を開くと、現在曲の mock analysis packet を作り、animated visualizer movement を描画する。
- mock analysis は current track/play state change ごとに `getMockAudioAnalysisSegment(currentTrack.id, 0, duration)` から 1 回生成される。
- mock analysis duration は desktop remote analysis と同じ frontend rule、つまり `max(15 minutes, track duration + 2 seconds)` を使う。
- 再生停止、または現在曲がなくなると mock packet をクリアする。
- Desktop-only button:
  - Folder picker は disabled。
  - Artwork picker は desktop-only と報告する。
  - Update check は desktop-only と報告する。
  - Mock tag/playlist changes は画面状態を更新できるが、実ファイル書き込みではない。

### Browser Backend Mode

先に desktop local server を起動し、通常はローカルの `http://127.0.0.1:1422/`、または LAN access 有効後の LAN URL から、desktop server が配信する app を開く。

できること:

- HTTP 経由で実 library snapshot を読み込む。
- デスクトップアプリが公開する同じ album/playlist を閲覧する。
- local server 経由で lyrics、artwork/media URL、audio-analysis data を要求する。
- ローカル再生を自分で行わず、desktop app へ remote player command を送る: play, pause, previous, next, seek, volume, mute, shuffle, repeat, play album, play track, select album, select track, refresh library。
- `/api/player_state` と command queue から表示状態を同期する。
- LAN access が有効な場合、別端末から remote control として動作する。

制約:

- browser backend runtime は remote/control surface であり、local desktop playback の owner ではない。
- Tauri native dialog は使えない。
- artwork selection は desktop-only。
- main app の実音声読み込みは Tauri runtime check で guarded されているため、browser main route を standalone local-file player として扱ってはいけない。
- 非ローカル client には remote access を明示的に有効化する必要がある。
- network client がアクセスできるのは desktop local server が公開した file/API のみ。

Browser backend のボタンとタイミング:

- main playback button は、local audio playback を直接変更せず `/api/player_command` message を送る。
- browser は `/api/player_state` を 250 ms ごとに poll し、desktop player の current track、queue、play state、shuffle、repeat、time、volume を適用する。
- browser は library refresh command 用に `/api/player_commands` を 1000 ms ごとに poll する。
- state poll 間の current-time 表示と visualizer timing は remote playback clock から推定する。
- analysis request 中に remote player が別 track へ変わった場合、stale response は無視する。
- seek、next、previous、play、pause、volume、mute、shuffle、repeat、play-album、play-track はこのモードでは command-based のままでなければならない。

## Fire TV 版

### できること

Native shell:

- Android/Fire TV アプリとして起動する。
- React `/tv` route を WebView 内でホストする。
- JavaScript、DOM storage、no-cache loading、mixed-content compatibility、ユーザー gesture なしの media playback を有効にする。
- Android WebView の自動 darkening を無効化し、TV player surface の色をアプリ定義の CSS で維持する。
- Player、Albums、Tracks、Settings を持つ native top tab shell を表示する。
- WebView 起動中に splash overlay を表示する。
- loading、discovery、error、shutdown の status message を表示する。
- 終了確認を出し、確認された場合は WebView player に shutdown を要求してから WebView surface を破棄する。
- native memory diagnostics を 3 秒ごとに WebView へ送る。
- display URL、selected library ID、selected locale を Android shared preferences に保存する。

Discovery と Settings:

- 明示的な `display_url` intent extra、または `musical-firetv://display` deep link URL を受け取る。
- saved server を `/api/app_status` で検証する。
- local IPv4 subnet 上の Musical desktop server を port `1422` probe で検出する。
- `/api/tv/libraries` から libraries を取得する。
- native Settings に detected servers、TV URLs、reachability、fallback state、libraries、selected library を表示する。
- library を選択し `/tv?libraryId={id}` を読み込む。
- saved library は server がまだ報告している場合のみ再利用する。
- Settings から server rescan する。
- Fire TV UI locale を English/Japanese で切り替え、WebView へ転送する。

Remote control bridge:

- Fire TV DPAD keys を `ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown`, `Enter` に map する。
- media keys を play/pause、play、pause、next、previous に map する。
- number keys `0` to `9` を candidate prompt 用に map する。
- selected native tab changes を WebView へ送る。
- Back はまず WebView focus を離し、その後 tab 切替または Player からの exit に使う。

React TV route:

- 起動時と 15 秒ごとに、任意の `libraryId` 付きで `/api/library_snapshot` を読み込む。
- albums と playlists を TV collections として描画する。
- TV collections を title、artist、year で sort し、direction を toggle する。
- remote/keyboard events で TV collections、tracks、player controls、side-panel tabs、queue、prompts を navigate する。
- artwork backdrop、title、artist、album、progress、previous/next hints、transport controls を含む Now Playing を表示する。
- `color-mix(in oklch, ...)` 非対応の WebView でも読みやすいように、player shell、panels、progress、buttons、selected/focused states、errors に明示的な fallback color を使う。
- `/api/media?path=...` を使い、WebView `<audio>` element で audio を local playback する。
- TV controls から 15 秒戻る/進む。
- albums、tracks、queue items、previous track、next track を TV UI 内で local playback する。
- Player side panel に queue と lyrics tabs を表示する。
- current track に lyrics がない場合は lyrics tab を disabled にする。
- current track の lyrics を `/api/track_lyrics` から取得する。
- `/api/track_analysis_bytes` の compact audio-analysis frames、または `/api/track_analysis` の JSON analysis を取得して Fire TV visualizer を描画する。
- `sessionId` がある場合は `/tv/sessions/{sessionId}` に接続し、session、player、lyrics、queue、analysis、command result、candidate prompt、close messages を適用する。
- TV player events を `/api/tv/player_event` へ記録する。
- command result と native memory diagnostics overlays を必要に応じて表示する。

Fire TV native tabs:

- native tab order は Settings, Albums, Tracks, Player。
- Settings は WebView surface を持たず、native settings panel を表示する。
- Albums は WebView へ `musical-firetv-tab` の `tab: "albums"` を送る。
- Tracks は WebView へ `musical-firetv-tab` の `tab: "tracks"` を送る。
- Player は WebView へ `musical-firetv-tab` の `tab: "player"` を送る。
- native tab bar 上の left/right は tab 間 focus を移動する。
- focused tab で Enter を押すと選択する。
- WebView surface から Back を押すと native tab bar に focus を戻す。
- Settings content から Back を押すと tab bar に focus を戻す。
- Player 以外の tab から Back を押すと Player を選択する。
- Player から Back を押すと exit confirmation を開く。

Fire TV Player tab のボタンとパネル:

- Rewind button は 15 秒戻る。
- Center play/pause button は WebView audio element を再生または一時停止する。
- Forward button は 15 秒進む。
- Previous adjacent-track button は selected collection 内の前曲を再生し、端では wrap around する。
- Next adjacent-track button は selected collection 内の次曲を再生し、端では wrap around する。
- Queue side-panel tab は最大 3 行の visible queue row を表示する。
- Lyrics side-panel tab は current track に lyric line がない場合 disabled。
- queue row 選択時、matching track が selected collection 内に存在すれば再生する。存在しなければ `queue_select` TV client event を送る。
- memory strip は diagnostics が利用可能な場合に native Android process memory を表示する。

Fire TV Albums tab のボタン:

- Collection tabs は Albums と Playlists を切り替える。
- Album/playlist rail は 4 columns x 2 rows、最大 8 visible collection items を表示する。
- collection を選択すると track index 0 から再生を開始する。
- Sort rail は title、artist、year をサポートする。
- active sort mode を選択すると ascending/descending direction を toggle する。
- sort 切替時は可能な限り collection ID によって selected/focused collection を維持する。

Fire TV Tracks tab のボタン:

- Tracks tab は selected collection から最大 7 visible tracks を一覧する。
- row を選択するとその track を開始し、pending autoplay を設定する。
- lyrics がある track は lyrics indicator を表示する。

Fire TV focus と remote navigation:

- focus zone は controls、collection tabs、albums、album sort、tracks、side-panel tabs、side panel、prompt。
- arrow keys は active tab に応じて zone 内または zone 間を移動する。
- Enter は focused item を activate する。
- MediaPlayPause は playback を toggle する。
- MediaPlay は playback を開始する。
- MediaPause は playback を一時停止する。
- MediaTrackPrevious と MediaTrackNext は adjacent tracks へ移動する。
- number keys は shortcut number で candidate-prompt item を選ぶ。

Fire TV audio と analysis timing:

- WebView は local `<audio preload="metadata">` element で audio を owner として扱う。
- `loadedmetadata` は audio element から duration を更新する。
- `timeupdate` は audio element から current time を更新する。
- `ended` は TV player event を報告し、次の adjacent track へ移動する。
- `error` は playback を停止し、audio error を表示し、TV player event を報告する。
- current track が変わったとき:
  - current time を `0` に reset する。
  - duration を track duration に reset する。
  - analysis frames を clear する。
  - new track の lyrics を fetch する。
  - new track の analysis loading を restart する。
- current track の analysis fetch:
  - track selection/change 時に即座に走る。
  - track が current の間、2 秒ごとに repeat する。
  - `max(0, currentTime - 0.5)` から 4 秒 window を request する。
  - `totalDuration` には current audio duration、track duration、または `1` を送る。
  - まず `/api/track_analysis_bytes?compact=true` を試す。
  - bytes loading が失敗した場合は `/api/track_analysis?compact=true` に fallback する。
  - track が変わる、または component effect cleanup 時に in-flight request を abort する。
  - `isLoadingAnalysis` guard によって overlapping analysis loads を防ぐ。
  - new frames を current time 周辺の retained frame window に merge する。
  - fetch failure 時は current visible analysis window だけを保持する。
- Fire TV visualizer rendering:
  - target maximum 30 fps で描画する。
  - canvas size は 1280 x 720、device scale は 1 以下に cap する。
  - 32 bars を描画する。
  - playback time に最も近い analysis frame を選ぶ。
  - playback time から 900 ms より離れた frame は無視し、代わりに bars を decay する。
  - 再生中は、最後に受け取った current time と経過 wall-clock time から playback time を推定する。
  - paused 中は、playback time は最後に受け取った current time に固定する。
  - frames がなく playback が stopped の場合、canvas を clear する。

### Fire TV 版の制約

- Fire TV は real libraries、media、lyrics、artwork、audio analysis のために到達可能な desktop local server に依存する。
- Fire TV discovery は現在 local IPv4 subnet candidates の port `1422` を対象にする。explicit URL が渡されない限り任意 port は検出しない。
- server が検出されない場合、Fire TV は `BuildConfig.DEFAULT_TV_URL` に fallback し、Settings を開く。
- Fire TV は WebView 内で audio を再生する。screen mirroring ではない。
- Fire TV は WebView 内で再生している間 local play/pause/seek を owner として扱うが、desktop は library metadata と media stream URLs の source であり続ける。
- 現在の `/tv` direct-library flow は HTTP poll を使う。WebSocket support は initial session snapshots に存在するが、TV state の唯一の source ではない。
- Fire TV は tag、artwork、rating、favorite、playlist、library scan settings を編集しない。
- Fire TV は folder scan も desktop library 永続化も行わない。
- Fire TV locale choices は現在 English と Japanese のみ。
- Fire TV Settings strings は native Android resources であり、React locale XML files の一部ではない。
- Fire TV WebView playback は streamed file type に対する Android WebView codec/support behavior に依存する。

## 設計変更時の回帰チェックリスト

architecture、navigation、layout、playback、platform integration を変更する場合はこの checklist を使う。該当 platform items を満たしていない変更は non-regressing とみなさない。

### デスクトップ Main UI

- app が Tauri runtime で起動し、最後にスキャンした library を読み込むか no-library state を表示する。
- Library Settings は Tauri でのみ folder を選択でき、typed path でも scan できる。
- scan progress と load progress が表示され、localize されている。
- album large/small/list/track-list/playlist views が表示され、search、sort、lyrics filter、album selection behavior が維持されている。
- album 選択は playing track や queue を変えない。
- track title 選択は playback を変えず、track play action は playback を変える。
- album card center play と table-row play が playback action のまま。
- player controls が到達可能: play/pause、previous、next、seek、volume、mute、shuffle、repeat、queue popover、Player mode。
- playback state が album controls と player bar の間で mirror される。
- Player mode visualizer が nonblank animated content を描画し、lyrics/queue panels が使える。
- playback 中に Player mode を開くと current-track analysis が開始または継続し、full-track analysis 完了前でも canvas が動き始める。
- paused 中に Player mode を開くと idle visualization を表示し、前回再生状態の古い moving bars を出さない。
- pause 後に play を押すと current track の analysis を reload/reuse する。
- pause を押すと frontend analysis packet/cache を clear し、visualizer を idle behavior に戻す。
- next を押すと stale current-track frames を clear し、player position を reset し、新しい current track の analysis を開始し、次の queue item を warm する。
- 3 秒より後で previous を押すと 0 に seek し、current analysis packet を clear する。
- track の先頭で previous を押すと track を切り替え、新しい current track の analysis を開始する。
- seek は stale analysis packets を clear し、次の analysis load/rebase が新しい playback time と一致する。
- current-track analysis request は、同じ track が既に loading 中なら重複しない。
- partial analysis chunks は complete analysis が cached される前に visualizer に見える。
- narrow layout は viewport bottom と flush で、album panel を collapse/expand できる。
- track detail が desktop interaction と mobile long press から開く。
- album tag、track tag、favorite/rating、track artwork、playlist artwork save paths が UI を更新し remote clients に notify する。
- playlist create、add、duplicate prevention、play、rename、reorder、remove、jump-to-album、reload、delete が動く。
- English/Japanese locale switch が visible UI を更新する。
- theme と playback preferences が local storage から restore される。
- Media Session play/pause/stop handlers が UI と同期し続ける。

### Desktop Local Server と Remote Browser

- `/api/app_status` が ready marker を返す。
- `/api/local-dev-access` の write は local-only で、有効時に LAN URL details を返す。
- LAN access disabled 中は non-local requests が rejected される。
- `/api/library_snapshot` が current snapshot を返し、`libraryId` を尊重する。
- `/api/tv/libraries` が current library summary、または library 未スキャン時は empty list を返す。
- `/api/media` が `Accept-Ranges` 付きで files を提供し、有効な Range request を処理する。
- `/api/track_lyrics`, `/api/track_analysis`, `/api/track_analysis_bytes` が既知 track ID で動く。
- `/api/track_analysis` が 33 ms interval と 256 buckets の frames を返す。
- 同じ track に対する concurrent `/api/track_analysis` request が deduplicate される。
- track analysis request 後、backend next-track prefetch が published queue state を使い、元 request を失敗させない。
- `/api/player_state`, `/api/player_command`, `/api/player_commands` が remote browser controls と desktop player を同期し続ける。
- Browser backend mode は real local playback を own しようとせず commands を送る。
- Browser backend mode は remote desktop player が既に別 track へ移った場合に stale analysis response を無視する。
- `/mcp` は local-only のままで、MCP enabled でない限り disabled。

### Mock Browser Mode

- `VITE_MOCK_DATA=true npm run dev -- --host 127.0.0.1 --port 1423` で mock app が起動する。
- English E2E fixtures で mock albums が 13 albums として表示される。
- mock playback、queue、Player mode visualizer、lyrics filter、language switch、playlists、responsive layout tests が通る。
- Mock Player mode は playing 中だけ mock analysis を作り、stopped 中は clear する。
- desktop-only actions は明確に disabled、または desktop-only と報告される。

### Fire TV Native Shell

- Fire TV が explicit intent/deep-link display URLs を受け取る。
- saved display URLs が再利用前に validated される。
- local subnet discovery が port `1422` の reachable desktop server を見つける。
- Settings が detected servers、libraries、selected library、language、rescan action を表示する。
- library 選択でそれを persist し、`/tv?libraryId={id}` を load する。
- missing saved library は stale ID を暗黙利用せず clear される。
- native tabs が WebView surfaces と Settings を確実に切り替える。
- DPAD、Enter、media keys、number keys、Back behavior が expected WebView events または shell navigation に map され続ける。
- exit confirmation が player surface を shutdown/destroy する。
- memory diagnostics が低頻度で WebView に転送される。

### Fire TV React TV Route

- `/tv?tab=albums` が `/api/library_snapshot` から albums/playlists を描画できる。
- playlist collections が Albums surface 配下に表示され、再生できる。
- Player tab が Now Playing、transport controls、progress、next/previous hints、queue、lyrics side panel を表示する。
- Tracks tab が selected collection の tracks を一覧し、playback できる。
- TV focus navigation が controls、tabs、albums、tracks、side-panel tabs、side panel、prompts のどこにも user を閉じ込めない。
- TV playback が `/api/media?path=...` と local WebView audio を使う。
- lyrics が `/api/track_lyrics` から load され、lyrics がない場合 lyrics tab が disabled になる。
- visualizer data が compact bytes または JSON analysis endpoints から load され、Fire TV performance のため bounded である。
- Fire TV が track change 時に frames を clear し、新しい 4-second analysis window を即座に request する。
- Fire TV が current track について analysis-window request を 2 秒ごとに repeat する。
- Fire TV visualizer が、current playback time 近くの frames がある場合、playing 中は最大 30 fps で animate し続ける。
- Fire TV visualizer が frames missing、too old、または playback stopped の場合、stale frames を表示せず decay/clear する。
- Fire TV ended event が次の adjacent track へ移動し、新 track の lyrics/analysis load cycle を開始する。
- `sessionId` WebSocket connections が initial session messages を受け取り適用し続ける。
- TV player events が `/api/tv/player_event` 経由で記録され続ける。

## 推奨検証コマンド

デスクトップ/ブラウザ build:

```bash
npm run build
```

Mock browser regression:

```bash
npm run test:e2e
```

実 Tauri/local backend でのデスクトップ手動起動:

```bash
npm run tauri dev
```

Mock browser 手動起動:

```bash
VITE_MOCK_DATA=true npm run dev -- --host 127.0.0.1 --port 1423
```

Fire TV unit tests:

```bash
cd apps/firetv
gradle :app:testDebugUnitTest
```

Fire TV debug APK:

```bash
cd apps/firetv
gradle :app:assembleDebug
```
