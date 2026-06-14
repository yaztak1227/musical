# Fire TV Android Test Perspectives

## 目的

- Fire TV tab / Settings / library selection 実装時の Android 側テスト観点を整理する。
- `tasklist/Nexttask.md` の P0-P9 に対応し、実装タスク完了時に確認すべき観点を明確にする。
- real Tauri/local backend を通常確認の前提にする。mock data は validation/test run のみ `VITE_MOCK_DATA=true` で使う。

## 前提環境

- 対象 app: `apps/firetv`
- 主対象 file: `apps/firetv/app/src/main/java/app/musical/firetv/MainActivity.kt`
- 通常 backend: real Tauri/local backend
- Android build:

```bash
cd apps/firetv
gradle :app:assembleDebug
```

## P0: 既存 UI と API 確認のテスト観点

- `/tv` の下部 3 要素が Android native 側ではなく WebView 内で描画されている場合、native tab 追加で WebView の表示領域が意図せず欠けないか。
- 下部 3 要素が `/tv` 側にある場合、native tab と `/tv` 側 navigation が二重管理にならないか。
- library list API が存在する場合、Fire TV WebView / Android shell から同一 LAN 上で到達できるか。
- `libraryId` query parameter が既存 `/tv` route に無視されても壊れないか。
- API 未整備時の一時 fallback が、Settings UI 上で未取得状態として明確に見えるか。

## P1: Native Tab Shell のテスト観点

### 表示

- 起動直後に上部 tab bar が表示されるか。
- tab bar が WebView のコンテンツを不自然に覆わないか。
- 16:9 TV viewport で tab label が切れないか。
- Android status/navigation bar の有無で layout が崩れないか。
- overscan 気味の TV 表示でも tab が端に寄りすぎないか。

### 状態

- 初期 tab が設計通りになるか。
- Player tab 選択時に既存 `/tv` WebView が表示されるか。
- Activity 再生成時に selected tab が極端に不自然な状態へ戻らないか。
- screen rotation / configuration change が発生しても crash しないか。

### WebView

- tab shell 追加後も `onPageFinished` が呼ばれるか。
- `APP_READY` bridge が従来通り送られるか。
- `onReceivedError` 時の status 表示が tab shell と重なって読めなくならないか。

## P2: Remote Key Routing のテスト観点

### DPAD

- Left / Right で tab focus が移動するか。
- Select / Enter で focused tab が selected になるか。
- Settings tab 内で Up / Down が list focus に使えるか。
- Settings tab 内の DPAD 操作が WebView に漏れないか。
- Player tab 内では従来の WebView remote key bridge が動くか。

### Media Keys

- Play / Pause が Player tab で従来通り WebView に渡るか。
- Media next / previous が Player tab で従来通り WebView に渡るか。
- Settings tab で media keys を押した場合に意図しない再生操作が起きないか。

### Back

- Settings tab で Back を押すと Player tab に戻るか。
- Player tab で WebView history がある場合に `webView.goBack()` されるか。
- WebView history がない場合に Android default behavior へ落ちるか。
- Back 長押しや連打で state が壊れないか。

## P3: Settings Tab UI のテスト観点

### 表示状態

- server 未検出状態が表示されるか。
- discovery 実行中状態が表示されるか。
- server 到達済み状態が表示されるか。
- library list 取得中状態が表示されるか。
- library list 取得失敗状態が server unreachable と分けて表示されるか。
- fallback URL 使用中であることが分かるか。

### Focus

- server list と library list の focus 移動が DPAD で破綻しないか。
- list が空のときに focus が行方不明にならないか。
- rescan 操作へ focus できるか。
- focus 中 item と selected item が視覚的に区別できるか。

### Text

- 長い server URL が画面外へはみ出さないか。
- 長い library name が tab / list item 内で破綻しないか。
- Fire TV の標準フォントサイズでも可読性があるか。

## P4: Discovery State のテスト観点

### 保存済み URL

- 保存済み URL が到達可能な場合、LAN scan 前に再利用されるか。
- 保存済み URL が不通の場合、LAN discovery に落ちるか。
- 保存済み URL が malformed の場合に crash しないか。
- 保存済み URL の検証中に UI が固まらないか。

### LAN Scan

- local IPv4 が 0 件の場合に crash しないか。
- 複数 network interface がある場合に候補が重複しないか。
- discovery timeout 後に executor が残り続けないか。
- Activity destroy 時に discovery executor が shutdown されるか。
- scan 中に rescan しても古い結果が後から UI を上書きしないか。

### 複数候補

- 複数 server が見つかった場合に Settings に複数表示できるか。
- 最初の 1 件を自動 open する実装でも、他候補を保持できるか。
- unreachable になった候補の表示が reachable と混ざらないか。

## P5: Library List Fetch のテスト観点

### 正常系

- reachable server から library list を取得できるか。
- 複数 library が表示されるか。
- 0 件 response を空状態として扱えるか。
- description がない library でも表示が崩れないか。

### 異常系

- HTTP 404 / 500 / timeout で crash しないか。
- JSON parse failure で crash しないか。
- 不完全な library item を安全に扱えるか。
- fetch retry / rescan 後に古い error が残らないか。

### 復元

- saved library id が response にある場合だけ selected になるか。
- saved library id が response にない場合、先頭 library を勝手に選ばないか。
- server を切り替えた時、前 server の selected library が誤って残らないか。

## P6: Library Selection Persistence と `/tv` 反映のテスト観点

- library 選択時に `SharedPreferences` へ selected library id が保存されるか。
- selected server / library から生成した `/tv` URL が正しいか。
- query parameter 追加時に既存 query parameter を壊さないか。
- `libraryId` に URL encoding が必要な値が入っても壊れないか。
- `loadDisplayUrl(nextUrl, remember = true)` が 1 回だけ呼ばれるか。
- 選択後に Player tab へ戻るか。
- app 再起動後に valid な saved library が復元されるか。
- app 再起動後に invalid な saved library が Settings に誘導されるか。

## P7: `/tv` Library Context 対応のテスト観点

- `/tv?libraryId=...` で対象 library context が反映されるか。
- `libraryId` なしの従来 URL が壊れていないか。
- unknown `libraryId` の場合に UI が壊れないか。
- WebView reload 後に session / playback state が古い library と混ざらないか。
- artwork / lyrics / queue など関連データも選択 library に揃うか。

## P8: Docs / README 更新のテスト観点

- 実装で確定した endpoint と docs の記述が一致しているか。
- README の build / install / launch 手順で debug APK を作れるか。
- manual launch の `display_url` 例が library 選択後の URL 仕様と矛盾しないか。
- docs に仮の endpoint 名や仮タブ名が残っていないか。

## P9: 統合検証シナリオ

### 初回起動

- Fire TV app を fresh install する。
- desktop app を real Tauri/local backend で起動する。
- Fire TV app 起動時に LAN discovery が走る。
- Settings tab に server と library list が表示される。
- library を選択すると Player tab に戻り `/tv` が読み込まれる。

### 保存済み設定あり

- library 選択済みの状態で app を終了する。
- app を再起動する。
- 保存済み server と library が有効なら自動復元される。
- Player tab の `/tv` が selected library context で開く。

### 保存済み設定が無効

- 保存済み server を停止する、または IP を変える。
- app を再起動する。
- LAN discovery に落ちる。
- server が見つからない場合は Settings tab で rescan できる。

### Library 変更

- Settings tab へ移動する。
- 別 library を選択する。
- WebView が新しい `libraryId` 付き `/tv` で reload される。
- Player tab の表示が新しい library context に変わる。

### Network Error

- library list fetch 中に desktop server を停止する。
- Settings tab に library list fetch failure が表示される。
- app が crash しない。
- server 再起動後に rescan で復帰できる。

## 非機能テスト観点

### Performance

- discovery 中に UI thread が固まらないか。
- library list が多い場合でも DPAD focus が遅延しすぎないか。
- WebView reload 時に tab shell がちらつきすぎないか。

### Lifecycle

- app background / foreground 復帰後に selected tab と WebView が維持されるか。
- Activity destroy 後に executor / thread が残らないか。
- WebView error 後に rescan / reload で復帰できるか。

### Compatibility

- Fire TV remote と keyboard DPAD の両方で操作できるか。
- Fire TV Stick class hardware で描画と focus 移動が重くないか。
- Android WebView の mixed content / media playback 設定が従来通り効くか。

## 自動テスト候補

- `serverBaseUrl()` / URL generation の unit test。
- `subnetCandidates()` の unit test。
- saved URL / saved library 復元 policy の unit test。
- library list JSON parser の unit test。
- `DiscoveredServer` state update policy の unit test。
- `libraryId` query parameter 付与 helper の unit test。

## 手動テストで優先する項目

- DPAD focus と Back 挙動。
- Settings tab と WebView bridge の入力分離。
- 保存済み URL 不通時の discovery fallback。
- saved library id が消えた場合の明示選択。
- library 選択後の `/tv` reload と Player tab 復帰。
