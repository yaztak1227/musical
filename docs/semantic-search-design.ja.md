# Semantic Search Design

## 目的

Musical の MCP client が、曲名の完全一致だけでなく、保存済み歌詞の意味や自然言語で表した気分からローカル曲を検索できるようにする。

検索要求ごとに全歌詞をmodelへ入力せず、事前計算したembeddingを永続cacheとmemoryから再利用する。

## 責務

- Rust backendがlibrary database、embedding model、search index、query cacheを所有する。
- TypeScript MCP sidecarはtool schemaとinternal bridgeの転送だけを担当する。
- `.musical/musical.sqlite3` はライブラリの正本とする。
- `.musical/search_index.sqlite3` は削除・再生成可能な派生cacheとする。
- search indexはlibrary databaseの兄弟fileとしてpath APIで決定し、Windows/macOSともlibraryごとに同じ相対配置を使う。
- embedding modelはTauriのapplication cache directoryに保存し、ライブラリ間で共有する。
- 日本語歌詞感情analyzerと辞書cacheはRust backendが所有し、MCP sidecarは解析を行わない。

## Index document

各曲から次のdocumentを生成する。

- `metadata`: title、artist、album title、album artist、genre。
- `lyrics`: 空行を除外した歌詞を6行単位、2行overlapで分割したchunk。

document hashはsearch index schema version、embedding model ID、document kind、textから計算する。

再build時に同じkeyとhashを持つdocumentは保存済みembeddingを再利用する。

## Lyrics sentiment block

感情解析用blockはembedding用lyrics chunkとは別に生成する。

- CRLFをLFへ統一し、解析用copyだけをNFKC正規化する。
- 空行の連続をstanza境界とする。各stanzaは1 blockとし、6非空行を超える場合だけ6行ずつの非overlap blockへ分割する。
- 空blockを除外し、source順、1-basedの`startLine` / `endLine`、block textを保持する。
- embedding用の6行・2行overlap chunk規則は変更せず、感情集約にも流用しない。

形態素解析にはexact pinしたLindera、lindera-dictionary、lindera-ipadic 5.1.0と`embed-ipadic`を使用し、process内でsegmenter/dictionaryを再利用する。embedded artifactは`mecab-ipadic-2.7.0-20250920.tar.gz`（MD5 `a95c409f12f1023fce8ef91f991ef042`、SHA-256 `a7ba9f645ffe7094e56ae1c4a81d100df8fbb1e28bbe1792622e9728e162db3d`）、NFKC実装はexact pinしたunicode-normalization 0.1.25である。これらのversion/artifact identityをanalyzer IDへ含め、変更時は保存済みanalysisを再利用しない。基本形を照合keyとし、名詞・動詞・形容詞・副詞をeligible tokenとする。辞書の明示的な複合表現は最長一致を優先し、複合表現が未登録の場合だけ直後の`ない`、`ぬ`、`ず`、`ん`で極性を反転する。

極性辞書は東北大学 乾・岡崎研究室の公式2ファイルを初回解析時にHTTPS取得する。

- `wago.121808.pn`: `https://www.cl.ecei.tohoku.ac.jp/resources/sent_lex/wago.121808.pn`、SHA-256 `968b8f758e79531a70b26600e943f11e9fc2962c5c30174b2bc96a342c1bb8b4`
- `pn.csv.m3.120408.trim`: `https://www.cl.ecei.tohoku.ac.jp/resources/sent_lex/pn.csv.m3.120408.trim`、SHA-256 `94f545a49028c8a07929c0ac35afa56fbfce9e8a277ce70233c6340845439ae3`

取得はprocess内single-flightとし、固定SHA-256を検証してTauri application cacheへatomic保存する。部分fileを正式cacheとして扱わず、raw辞書はrepositoryや配布物へ同梱しない。HTTP、hash、parseの失敗はsemantic index build全体へ波及させず、diagnostic付き`unknown`へ縮退する。同じprocess内では失敗後60秒のcooldownを設け、その間は同じ診断を返して公式endpointへの連続再試行を抑える。cooldown終了後の次回解析で取得を再試行する。

positiveを`+1`、negativeを`-1`として扱う。neutral/eはmatched tokenとcoverageへ含めるがscore分母から外し、未知語をneutralとは数えない。scoreはscored tokenの平均、coverageは`matchedTokenCount / eligibleTokenCount`とする。scored tokenが0件ならscoreを持たない`unknown`とする。labelはscoreが`> 0.05`なら`positive`、`< -0.05`なら`negative`、それ以外は`neutral`である。blockと曲はいずれもscored token数による加重平均で集約し、eligible/matched/scored、positive/negativeの各count、coverage、analyzer ID、任意diagnosticを返す。

search index schema v2は`track_lyrics_sentiment`と`lyrics_sentiment_blocks`を独立tableとして作成する。library DBには触れず、v1 cacheも`CREATE TABLE IF NOT EXISTS`で新tableを初期化し、次回buildで派生分析を生成する。analysis hashにはtokenization/NFKC pipeline identityを持つanalyzer ID、analyzer version、segmentation version、公式2辞書のhash、各blockのsource text・正規化text・ordinal/source行範囲を含め、曲全体のhashが一致するanalysisだけを再利用する。

## Model

既定modelは `intfloat/multilingual-e5-small` のcommit `614241f622f53c4eeff9890bdc4f31cfecc418b3` に固定する。model IDはこのcommit、5 artifact manifestのSHA-256 `a1c9fc0930d0049c947ecd9e0207a1d20772977ac50b17dc3bd72a06d963bf37`、およびembedding生成pipeline IDを含む。pipeline IDはexact pinしたFastEmbed 5.17.4とtokenizers 0.22.2、mean pooling、max length 512、E5の`query: ` / `passage: ` prefix、FastEmbedがpool後に行うL2正規化（epsilon `1e-12`）を識別する。tokenizersはFastEmbedと同じく既定featureを無効化して`onig`だけを有効にし、実行時に使わない`esaxx_fast`のC++学習器をbuild対象へ含めない。これによりWindowsでは`esaxx-rs`の静的MSVC CRTとdownload済みONNX Runtimeの動的MSVC CRTを同一binaryへリンクしない。FastEmbedへ渡す直前にNFKC、lowercase、whitespace collapse等の追加正規化は行わない。

- document inputには `passage: ` prefixを付ける。
- query inputには `query: ` prefixを付ける。
- 最初に必要となった自動buildまたは `build_search_index` でmodelをdownloadする。
- hf-hubは固定revisionから`onnx/model.onnx`、`tokenizer.json`、`config.json`、`special_tokens_map.json`、`tokenizer_config.json`だけを専用cacheへ取得する。各fileのsizeとSHA-256を固定manifestに照合し、FastEmbed用`refs/main`を同commitへatomicに固定する。既存cacheはnetworkより先に検証して再利用し、改変、欠落、hash不一致はmodel採用前後の検証で拒否する。
- 固定artifactは`onnx/model.onnx`=`ca456c06b3a9505ddfd9131408916dd79290368331e7d76bb621f1cba6bc8665`、`tokenizer.json`=`0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39`、`config.json`=`69137736cab8b8903a07fe8afaafdda25aac55415a12a55d1bffa9f581abf959`、`special_tokens_map.json`=`d05497f1da52c5e09554c0cd874037a083e1dc1b9cfd48034d1c717f1afc07a7`、`tokenizer_config.json`=`a1d6bc8734a6f635dc158508bef000f8e2e5a759c7d92f984b2c86e5ff53425b`である。
- FastEmbed 5.17はprocess環境の`HF_HOME`を明示cache directoryより優先するため、共有Hugging Face cacheを変更しないよう、`HF_HOME`設定中のsemantic model初期化は明確なerrorで拒否する。Musical専用application cacheを使うには、Musical processを`HF_HOME`未設定で起動する必要がある。Musical自身や通常launcherが設定済みの環境変数を解除することはない。
- index status取得や通常再生だけではmodelを初期化しない。

## Search flow

1. library snapshotの初回読込み、folder scan完了、tag変更、favorite/rating変更でbackground refreshを予約する。
2. refresh coordinatorはlibrary単位で重複要求をまとめ、未構築またはstaleの場合だけ差分buildする。
3. `get_search_index_status` でready / stale / generationを確認でき、`build_search_index` で手動再buildもできる。
4. `search_tracks` がpersistent indexをgeneration単位でmemoryへloadする。
5. modelへ渡した`query: `付き完全query inputをkeyとしてembeddingを最大128件のLRU cacheへ保持する。大小文字や空白列が異なる入力を同一keyへ畳み込まない。
6. lyrics / metadata documentとのcosine similarityを計算する。
7. hybrid modeではsemantic scoreを85%、簡易lexical scoreを15%として統合する。
8. queryも歌詞と同じ感情analyzerで解析する。
9. 曲ごとに最も高いdocumentを採用し、matched textとscore内訳を返す。
10. queryと曲の双方に感情scoreがある場合だけ、感情類似度を既存base scoreへ混合する。

感情類似度と実効weightは次の式を使う。

- `similarity = 1 - abs(queryScore - trackScore) / 2`
- `effectiveWeight = requestedWeight * min(queryCoverage, trackCoverage)`
- `finalScore = baseScore * (1 - effectiveWeight) + similarity * effectiveWeight`

`search_tracks.sentimentWeight`の既定値は`0`、許容範囲は`0..=0.3`である。weightが`0`、いずれかのcoverageが`0`、または辞書を利用できない場合は感情値を加算せず、従来のbase score計算とsort順をbit-for-bitで維持する。実際に感情値が寄与した結果だけreasonへ記録し、検索・推薦responseにはquery sentiment、各曲のsentiment、任意のsentiment similarityを含める。

## Mood recommendation

`recommend_tracks` はmetadataと保存済み歌詞に対するsemantic similarityを用いる。

favorite、rating、genre、除外曲、目標再生時間、artistごとの最大曲数を指定できる。

`recommend_tracks.sentimentWeight`の既定値は`0.15`、許容範囲は`0..=0.3`であり、検索と同じcoverage補正済みの式を使う。

現段階では歌詞とmetadataに基づく気分推薦であり、BPM、key、音圧、音響embeddingは含まない。

## Cache invalidation

source revisionはtrack UUID、検索対象metadata、歌詞本文、file mtime、file size、Musical user-state updated timestampから算出する。これによりaudio fileやtagの時刻が変わらない歌詞だけの更新もstaleとして検出する。

source revision、model ID、schema version、またはanalyzer IDがindex metadataと異なる場合、statusはstaleを返す。source revisionまたはanalyzer IDだけの不一致は直前generationを検索可能な`ready`状態で保持する。ただしanalyzer ID不一致中は旧曲感情値とcurrent query感情値を混合せず、base scoreとsort順をbit-for-bitで維持する。一方、model IDまたはschema versionが異なるembeddingは現在のquery embeddingと互換とみなさず、`ready: false`として再build完了まで検索へ使用しない。

辞書取得など一時的な失敗でretryableな`unknown`をcommitした場合、index metadataへ件数とretry時刻を保存する。60秒cooldown中はstatusを検索可能なまま維持し、期限後にrefresh coordinatorへlibraryを1回だけ再投入する。再試行は既存のlibrary単位single-flightとbuild lockを使い、busy loopを行わない。process再起動後もmetadataの期限を読み、未到来ならtimerを再設定し、到来済みならstaleとして再buildする。SQLite busyや一時I/Oなどrefresh自体の失敗も、state lockを解放した後に61秒開始・最大1時間の指数backoffでin-memory timerへ再登録し、別のlibrary mutationがなくても再試行を継続する。background/手動buildの成功または明示的なforce/library mutationでfailure streakをresetするため、一時障害の復旧後は初期delayへ戻り、恒久障害では毎分のbuildを続けない。

stale indexはbackground refreshが新しいgenerationをcommitするまで保持されるため、途中失敗で既存indexが失われない。手動buildとbackground refreshは同じlockで直列化する。

## MCP tools

- `get_search_index_status`: index状態の取得。
- `build_search_index`: model初期化と差分index build。
- `search_tracks`: semantic / hybrid検索。
- `recommend_tracks`: 自然言語の気分に応じた候補生成。
- `get_track_lyrics_analysis { trackId }`: 保存歌詞のblock/曲感情分析を読み取る。
- `search_lyrics_by_mood`: 歌詞の意味、感情、情景、覚えている一節から候補だけを返すread tool。`hybrid`、lyrics target、lyricsOnlyを固定する。正確な曲名またはartistだけの検索には`search_library`を使う。
- `play_lyrics_by_mood`: 同じlyrics-only検索から目標再生時間とartist分散を適用し、結果の順序を保ったqueueをserver operation内で確定して先頭曲から再生するplayback tool。正確な曲名、album、artistの再生には`play_search`を使う。1曲だけなら`limit: 1`、30分程度なら`durationMinutes: 30`を指定する。
- 両toolは、promptがgrief、悲哀、哀歌、追悼、死別等を明示するか、loss/separation（喪失、別れ、さよなら等）とsorrow（涙、悲しみ、孤独等）の両方を含む場合だけboundedなtopic-aware soft rerankingを有効にする。単なる「悲しい歌」、generic mood、`relativeToCurrent`には適用しない。複数blockかつ複数の証拠familyでcoreが成立した場合だけ正加点し、core未達はhard rejectせず正加点を行わないが、anti-themeとlow-specificityの上限付き減点は許容する。grief voiceの2 toolだけは同一lyrics hashまたは高いcontent containmentの別音源を1結果へ集約し、boundedにoversampleした候補pool内で可能な範囲だけ別候補を補充する。極端に重複が多い場合は結果が指定limit未満になり得る。generic検索は重複を保持する。正確な曲名・artistのtool選択にも影響せず、既存の感情解析・semantic index cacheを再利用するためDBまたはembedding indexのrebuildは不要である。比喩的な表現や語彙の少ない歌詞では決定論的heuristicに限界があり、exactな8曲構成や意図を完全には保証しない。
- `moodStrength`は、既存valence sentiment blendでは`subtle: 0.08`、`balanced: 0.15`、`strong: 0.30`へ、grief theme correctionでは`subtle: 0.08`、`balanced: 0.14`、`strong: 0.20`へ写像する。strong時のlow-specificity追加減点は最大`0.12`で、voice schemaに`sentimentWeight`は公開しない。
- `moodStrength: strong`の悲哀指定では、喪失の具体性と悲哀証拠blockの占有率がともに低いsemantic false positiveへだけ上限付きlow-specificity減点を加える。全面的な物語分類やC評価候補の排除保証ではなく、S/A/B相当の特徴が重なる候補を壊さない境界で適用し、hard rejectは行わない。near-identical dedupeはlyrics hashと行containmentに加え、十分長く長さの近い正規化全文の5-character gram containmentを使い、句読点、空白、表記差を吸収する。generic検索、`relativeToCurrent`、公開schema、DB/index cacheは不変で、決定論的heuristicの限界も残る。
- 両toolの`relativeToCurrent`はremote player stateのcurrent trackを基準にする。`similar`は現在曲と同じ感情score、`brighter`は`score + 0.25`、`darker`は`score - 0.25`を`-1..=1`へclampしたtargetを使う。reference coverageは感情weightの信頼度として保持する。現在曲がない場合は`needsCurrentTrack`、scoreがないかcoverageが0の場合は`referenceSentimentUnavailable`を返す。
- 音声向けresponseは`ok`、`playing`、`noMatch`、`indexNotReady`、`needsCurrentTrack`、`referenceSentimentUnavailable`を区別する。index未準備時は`canBuild`と理由を返し、model download、index build、queue変更を行わない。結果はtrack ID、title、artist、album title、duration、短いmatched text、理由、compactな感情summaryだけを返し、歌詞全文、model/analyzer ID、diagnostic、token countを返さない。

検索結果のtrack IDを既存の `set_queue` または `play_track` へ渡すことで、検索と再生を分離する。

同じ分析はTauri command `track_lyrics_analysis`と`GET` / `POST /api/track_lyrics_analysis`でも取得できる。cached analysisがあれば返し、なければ保存歌詞をon-demand解析する。track不在、歌詞なし、index不在、辞書利用不能はpanicさせず、既存の`track_lyrics` APIも変更しない。
