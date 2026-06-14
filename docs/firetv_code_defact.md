# Fire TV Android Code De Facto

この文書は Fire TV アプリ (`apps/firetv`) の実装規約です。Android Developers の推奨アーキテクチャ、UI layer / data layer / domain layer、Kotlin style guide を基準に、このリポジトリの薄い Fire TV WebView wrapper へ適用できる形に落とし込む。

## 参照元

- Android app architecture: https://developer.android.com/topic/architecture
- Architecture recommendations: https://developer.android.com/topic/architecture/recommendations
- UI layer: https://developer.android.com/topic/architecture/ui-layer
- Data layer: https://developer.android.com/topic/architecture/data-layer
- Domain layer: https://developer.android.com/topic/architecture/domain-layer
- Kotlin style guide: https://developer.android.com/kotlin/style-guide
- Kotlin-first Android: https://developer.android.com/kotlin/first

## 基本方針

- UI layer は画面表示、入力処理、Android lifecycle の調整に集中させる。
- data layer は HTTP、LAN discovery、SharedPreferences、JSON parsing など外部データとの接点を担当する。
- domain layer は library selection、URL 生成、subnet candidate 生成など、Android UI に依存しない判断を置く。
- domain layer は任意だが、複数画面やテストで再利用する判断ロジックは Activity から切り出す。
- Activity は coordinator として扱い、肥大化させない。目安として 500 行を超えたら責務分割を検討する。
- Fire TV 固有の DPAD / Back / media key の挙動は UI layer に閉じ込め、WebView へ渡すイベントは bridge クラスで明示する。

## パッケージと責務

- `MainActivity`: lifecycle、ルート View の組み立て、tab 遷移、repository / panel / bridge の接続。
- `FireTvDiscoveryRepository`: Musical desktop server discovery、reachability check、library list fetch。
- `FireTvSettingsPanel`: Settings tab の View 作成、Settings 表示更新、Settings 内 focus/click 補助。
- `FireTvWebBridge`: WebView へ送る JavaScript event と locale 適用。
- `FireTvSelectionPolicy`: 保存済み library selection の復元判断。
- `FireTvUrlHelpers`: server base URL、TV URL、`libraryId` query composition。
- `FireTvSubnetCandidates`: LAN scan 候補生成。
- `FireTvModels`: UI/data/domain 間で共有する小さな immutable model。

## UI layer 指針

- Activity で直接大量の View を作らない。再利用可能な画面領域は panel/builder クラスへ分ける。
- Focus state と selected state は別概念として扱い、Fire TV remote 操作で視覚的に区別できるようにする。
- Settings tab では DPAD/Select/Back を Settings 内で完結させ、WebView に漏らさない。
- WebView tab では DPAD/media/number keys を `FireTvWebBridge` 経由で渡す。
- Status message、splash、fallback など一時 UI は消える条件と timeout を明確にする。
- 文字列を追加する場合は Android resource string を使う。Web UI 側の locale 変更では通常 `src/locales/en.xml` と `src/locales/ja.xml` のみを更新する。

## Data layer 指針

- HTTP access は repository に集約し、UI class から `HttpURLConnection` を直接扱わない。
- repository は `DiscoveredServer` や `RemoteLibrary` のような model を返し、View そのものを返さない。
- timeout、HTTP status、parse error は crash させず `Result` や nullable/error field として UI に伝える。
- LAN scan の executor は lifecycle に合わせて shutdown できるよう repository に明示的な `shutdown()` を持たせる。
- discovery 結果の世代管理は UI coordinator で行い、古い scan が新しい UI state を上書きしないようにする。

## Domain layer 指針

- URL composition、saved selection restore、subnet candidate 生成は Android View / Context に依存させない。
- domain logic は JVM unit test で検証する。
- library id や query value は必ず URL encode する。
- 保存済み library id が見つからない場合、暗黙に先頭 library を選ばず、明示選択待ちに戻す。

## Kotlin / Android style

- Google Android Kotlin style guide を基準にする。
- top-level object / small class を使い、巨大な private method 群を 1 file に集めない。
- mutable state は Activity など lifecycle owner に最小限だけ保持する。
- `internal` を基本にし、module 外へ公開しない。
- null / blank input は境界で扱い、domain helper は crash しにくい API にする。
- コメントは複雑な lifecycle / threading / focus の意図を補う場合だけ書く。

## Test policy

- domain/data helper は JVM unit test を追加する。
- Activity 変更時は少なくとも `:app:testDebugUnitTest` と `:app:assembleDebug` を通す。
- 実機確認では real Tauri/local backend を使う。mock data は validation/test run のみ `VITE_MOCK_DATA=true` で使う。
- Fire TV 実機では Player、Settings、Albums、Tracks、Back、DPAD、library persistence、restart restore を確認する。
