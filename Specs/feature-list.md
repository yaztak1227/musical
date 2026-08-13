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
- MCP からローカル多言語 embedding を用いて、曲メタデータと保存済み歌詞を semantic / hybrid 検索する。
- 自然言語の気分指定から曲候補を返し、再生時間、アーティスト重複、評価、お気に入り、除外曲で絞り込む。
- semantic search index はライブラリごとの `.musical/search_index.sqlite3` に永続化し、ライブラリ読込み、再スキャン、検索対象のタグ・評価・お気に入り・歌詞本文更新後にバックグラウンドで作成・差分更新する。変更のない歌詞chunkのembeddingは再利用する。embedding modelは固定commitと固定SHA-256 manifestで検証し、model IDへFastEmbed/tokenizers exact version、pooling、max length、E5 prefix、出力正規化を含むpipeline IDも組み込む。
- 保存済み歌詞は、空行の連続を stanza 境界とし、6非空行を上限とする非overlap blockへ分割して日本語感情極性を解析する。CRLFはLFへ統一し、解析用copyだけをNFKC正規化してsource順と1-based行範囲を保持する。曲集約はscored token数で加重し、eligible/matched/scored token数、positive/negative数、coverage、解析不能時の`unknown`診断を返す。
- `search_tracks`（感情weight既定値`0`）と`recommend_tracks`（既定値`0.15`）は、`0..=0.3`の明示weightとquery/曲双方のcoverageに基づいて感情類似度を既存scoreへ混合する。weight `0`、coverage `0`、辞書取得不能のいずれでも従来scoreと順位を維持する。
- MCPの`search_lyrics_by_mood`は歌詞の意味、感情、情景、覚えている一節から候補だけを返すread toolである。`play_lyrics_by_mood`は同じ歌詞検索から再生時間とartist分散を満たすqueueをserver operation内で確定し、先頭曲から再生するplayback toolである。正確な曲名またはartistだけの検索には`search_library`、正確な曲名、album、artistの再生には`play_search`を使う。
- 明示的なgrief、悲哀、哀歌、追悼、死別など、または喪失・別れ・さよなら等のloss/separation語と涙・悲しみ・孤独等のsorrow語をともに含む要求だけで、上記2つの音声向け歌詞検索はboundedなtopic-aware soft rerankingを使う。単なる「悲しい歌」、generic mood、`relativeToCurrent`には適用しない。歌詞の複数blockかつ複数の証拠familyでcoreが成立した場合だけ、持続する喪失を上限付きで正加点する。core未達はhard rejectせず正加点を行わない一方、強い喪失を伴わない解決・恋愛追求、自己肯定、闘志・前進へのanti-theme減点とlow-specificity減点は適用できる。grief voiceの2 toolだけは同一lyrics hashまたは高いcontent containmentの別音源を1結果へ集約し、boundedにoversampleした候補pool内で可能な範囲だけ別候補を補充する。極端に重複が多い場合は結果が指定limit未満になり得る。generic検索では重複を保持する。正確な曲名・artistのtool選択も従来どおりで、既存の感情解析とsemantic index cacheを再利用するためDBまたはembedding indexのrebuildは要しない。比喩的な表現や語彙の少ない歌詞では決定論的heuristicの判定が限定的で、exactな8曲構成や歌詞全体の意図を保証しない。
- `moodStrength: strong`の悲哀指定に限り、喪失対象・不可逆性・追悼などの具体性と、悲哀の証拠を含む歌詞blockの占有率がともに低いsemantic false positiveへ、上限付きlow-specificity減点を加える。これは全面的な物語分類やC評価曲の排除保証ではなく、S/A/B相当の特徴が重なる候補を壊さない境界で適用し、hard rejectは行わない。near-identicalな別音源の集約はlyrics hashと行containmentに加え、十分長く長さの近い正規化全文同士の5-character gram containmentで表記差を吸収する。
- 音声向けtoolは`moodStrength`を既存のvalence sentiment blendでは`subtle: 0.08`、`balanced: 0.15`、`strong: 0.30`へ、追加のgrief theme correctionでは`subtle: 0.08`、`balanced: 0.14`、`strong: 0.20`へ別々に写像する。strong時のlow-specificity追加減点は最大`0.12`とする。voice schemaに`sentimentWeight`は公開しない。`relativeToCurrent`は現在曲の歌詞感情を基準にし、`similar`は同じ値、`brighter`は`+0.25`、`darker`は`-0.25`（いずれも`-1..=1`へclamp）をranking targetにする。現在曲または参照感情がない場合は構造化statusを返す。
- 音声向けtoolは`ok`、`playing`、`noMatch`、`indexNotReady`、`needsCurrentTrack`、`referenceSentimentUnavailable`を区別する。index未準備時は無断でmodel download/buildやqueue変更を行わず、`canBuild`と理由を返す。結果は短い歌詞抜粋とcompactな感情summaryだけを含み、歌詞全文や内部diagnosticを返さない。
- 感情結果はsearch index schema v2の独立tableへ保存し、embedding用の6行・2行overlap chunkとライブラリDBは変更しない。
- analyzer IDはexact Lindera/dictionary/IPADIC crate version、embedded IPADIC artifact generation/hash、unicode-normalization versionを含む。不一致中は旧semantic indexを検索可能なままbackground rebuildし、旧感情値だけをscoreへ混合しない。一時的な辞書失敗で保存した`unknown`は60秒cooldown後にsingle-flightで遅延再分析する。
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
- 開発版では次曲への切り替え時に Performance API の measure entries を確認し、50万件以上なら消去して WebKit の計測ヒープ増大を抑止する。
- キューポップオーバーを hover または click/tap で表示する。
- 利用可能な環境では Media Session API に再生メタデータと操作を同期する。

## Player Mode とビジュアライザ

- Player mode でアートワーク、ビジュアライザ、歌詞パネル、キュー、再生操作を全画面表示する。
- PlayerBarのキューは可変幅オプションから分離し、Player mode入口はグリッド自動配置から外してPlayerBar右端へ固定する。入口とフォーカス外枠分の右余白をキュー領域へ確保し、通常幅、Tauriの1226×768前後、タブレット、モバイルで完全表示する。Player mode入口は明示的なaccessible name、マウス・キーボード操作、可視のフォーカス状態を持つ。入口にはリップル、押下移動、scale、transitionを適用せず、色・枠・フォーカスだけで静的に状態を示す。
- アプリ起動直後に軽量な Player mode の画面 module を、選曲時に現在曲の歌詞を非同期で事前ロードする。Player mode の開閉 state はライブラリ全体から隔離し、押下時は軽量な全画面 shell を同期表示してから次の描画フレームでCanvas、音声解析、描画 loop などのビジュアライザ実体を生成する。画面 module の事前ロードが完了していない場合も、クリック時のモジュール準備より先に閉じる操作を持つ shell を表示し、元画面に無反応のまま残らない。
- Three.js/WebGL 実装は Aurora、Starfield、DNA Helix、Warp Hole の選択時だけ、Chibi character、spectrum、orchestra、surf の画像群は該当表示を有効にした時だけロードする。
- 表示モードボタンは `Wave`, `Spectrum`, `Circle`, `Peaks`, `Aurora`, `Starfield`, `DNA Helix`, `Color flow`, `VU meters`, `Warp Hole` を持つ。`Color flow`（日本語名はカラーフロー、内部IDは `ink`）は、周波数域を5ブロックへ分割し、各ブロックを中央へ集まる1つの大きな半透明の雫として見せる。各雫は、そのブロックに含まれる周波数値の正規化合計を時定数付きで平滑化したenergyに合わせ、急変せず呼吸するように膨縮する。外側の広いhaloは外縁へ向けて透明にし、内側は弱いblurと低輝度の細い外周で有機的な形を残す。隣接ブロックの接触部だけに短いレンズ状の半透明膜を描くが、中央へ集まる小光点、点状の接点光、直線状の境界ハイライトは描かない。`Aurora` は専用の Three.js/WebGL2 シェーダーで低域から高域までの5帯域を連続した色・エネルギーマップへ補間し、発光する上端、半透明の面光、縦フィラメント、縦横のカラーグラデーション、薄い bloom へ周波数履歴を重ねる。`Starfield` は専用シェーダーで5層の星を消失点から放射し、長い光跡、星間ダスト、色付きハロー、中心フレア、衝撃波リングを合成してワープ航行の疾走感を表す。周波数 bucket は `1,33,65,2,34,66…` 型で32方向へ散らし、各方向のエネルギーと音の立ち上がりで光跡の出現数、長さ、太さ、輝度、bloom を変える。`DNA Helix` は専用の単一パス WebGL シェーダーで、横線ごとに1時点の低音から高音までの周波数分布を表し、新しい履歴を下側へ追加して古い履歴を上側へ送る。中央・左右の二重螺旋へ霧状のカーテン、音に反応する水平光条、250〜450個相当の微粒子、40〜80本相当の短い尾、同時に2〜4本読める外向き波面を重ねる。各螺旋の背骨は6本、横桟は3本の細い発光繊維束とし、低周波wanderとfine flutterを個別位相で合成する。8帯域のenergyと正のriseは対応する繊維の揺れと輝度へ反映し、Auroraと同じ8 stop paletteを横桟の低域から高域へ割り当てる。RGBは0.88、alphaは0.84を上限に色相を保ったhighlight圧縮を行い、低エネルギー時の視認性を残しつつ白飛びを防ぐ。`Warp Hole` は左寄りの小さな暗い消失孔へ対数遠近圧縮した8群の螺旋カーテンを収束させ、各群を可変密度cellへ分けた多数の連続procedural hairと、片側へ減衰する半透明のveil/mistを合成する。fragmentごとに最寄り3 cellだけを評価し、cell固有のwander、drift、flutterで細線を独立して揺らす。20周波数ブロック×32履歴を5つの飛び石集合へ分け、energyとriseでカーテンごとの輝度、長さ、蛇行を変える。4配色ともAuroraと同じpalette変換、8 stop補間、mist/standard/rainbow profileを使い、重なるfamilyは画面横方向の共有色相を参照して補色加算による白・灰化を避ける。Auroraと同じthreshold 0.34、Rainbow bloom strength 0.31、radius 0.62を高輝度の細線へだけ適用し、post bloomの色相保存型highlight compressionとalpha 0.84上限で白飛びを抑える。4モードとも WebGL を利用できない場合は Canvas 2D へ fallback する。
- `Peaks` は遠景から近景の順で山体を描き、加算 glow の後に `source-over` の山体を重ねる。最も近い山体は最後に不透明度の高い面と稜線を描き、ほかの山脈レイヤーの背面へ回らない。
- `Warp Hole` は20周波数ブロック×32履歴を5 RGBA texel×32行の固定長DataTextureへ保持する。20ブロックは `1,6,11,16` / `2,7,12,17` / `3,8,13,18` / `4,9,14,19` / `5,10,15,20` の5集合とし、4値のmeanとpeakを混合する。fragment shaderは現在行と過去行の各5 texelを一度ずつ読み、従来の重複sampleを避ける。各親カーテンの可変密度cell fieldからfragmentごとに最寄り3 cellだけを評価し、安定hashで周波数集合、低周波wander、中周波drift、fine flutter、濃淡、開始・終了深度を割り当てる。密度も長周期で変調し、hairは `fwidth` によるAA幅をcell座標0.015〜0.11へ制限する。消失孔近傍では重なりを段階的に減衰し、family間には低alphaのmistを残す。旧来の横断放出線、ring rail、粒子、spike、starは主形状と競合しないよう無効化する。
- `Warp Hole` の音声役割は1〜4を低域、5〜9を中低域、10〜15を中高域、16〜20を高域へ集約し、energyと正のriseを個別に平滑化する。低域は消失孔・捻れ・奥行き、中低域はveil/mist、中高域はhairの揺れと集散、高域は既存hair上の色付きshimmerを担当する。履歴riseは外周から消失孔へ進む光波とし、全画面フラッシュや追加粒子へ置き換えない。
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
- 曲の削除後は対象プレイリストだけを再読み込みして右パネルへ反映し、ライブラリ全体は再読み込みしない。
- プレイリスト曲から元アルバムへ移動する。
- プレイリスト詳細では曲名とアーティスト/アルバムを優先して2行まで表示し、元アルバム表示、並べ替え、削除は曲ごとの操作メニューへまとめる。
- 見つからない曲を表示し、ファイル復元後に再読み込みできる。

## ローカライズと設定

- メイン UI は日本語/英語を切り替える。
- テーマは crimson, ocean, violet, forest, amber, mono を選択する。
- locale、theme、sidebar state、library menu state、playback preferences を local storage に保存する。
- UI 文言を通常実装で追加/変更する場合は `src/locales/en.xml` と `src/locales/ja.xml` のみを更新する。

## ローカルサービスとリモート操作

- Tauri 起動時にローカル HTTP サーバーを開始する。
- `/api/*` で library snapshot、lyrics、歌詞感情分析、media file、audio analysis、player state、command queue を提供する。歌詞感情分析は `GET` / `POST /api/track_lyrics_analysis` から読み取れる。
- media file は HTTP byte-range に対応する。
- LAN access が有効になるまで非ローカル HTTP client を拒否する。
- LAN/public control URL の QR code を表示する。
- dev mode では public dev tunnel を任意で公開する。
- ローカル MCP endpoint を切り替える。無効時の `/mcp` は 404 を返す。
- MCP endpoint は AI SDK V7 compatible な TypeScript sidecar と MCP SDK server で提供し、Tauri local server は `/mcp` を sidecar へ proxy する。
- MCP sidecar は loopback だけに bind し、Tauri internal bridge は per-process token で保護する。
- MCP tools は player/library read、album/track/artist discovery、semantic/hybrid search、気分推薦、`get_track_lyrics_analysis` による歌詞感情分析read、playback/queue command、favorites、playlist mutation、tag/artwork/user-state mutation を公開し、AI SDK `createMCPClient` で tool discovery、引数転送、`structuredContent` を検証する。
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
- AIによる非視覚の起動確認は、別identifierとポート`1430`を使う非表示・非フォーカスのMock Tauriアプリでバックグラウンド実行し、実アプリの`1420`、local serverの`1422`、MCP sidecar、dev browserと競合させない。
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
