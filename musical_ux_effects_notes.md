# Musical UXエフェクト改善メモ

## 対象

GitHubリポジトリ: `yaztak1227/musical`

Tauri 2 + React / TypeScript + Rust で構成された、ローカル音楽ライブラリ管理・再生アプリ向けのUX改善案。

主な既存機能として、アルバム一覧、曲一覧、プレイヤーバー、詳細ダイアログ、テーマ切替、タグ編集、アートワーク差し替えなどがある前提で、ユーザー体験を上げるエフェクト案を整理する。

---

# 1. 全体的に入れたいUXエフェクト

## 1.1 再生中アルバムの“呼吸する”発光

### 狙い

現在再生中のアルバムが視覚的に分かるようにする。
音楽アプリでは「今鳴っているもの」が自然に目に入るだけで体験がかなり良くなる。

### エフェクト内容

- 再生中のアルバムカードだけ、アートワーク周辺に薄いグローを出す
- ゆっくり明滅させる
- 少しだけ浮いているように見せる

```css
.playing-album {
  box-shadow: 0 0 24px color-mix(in srgb, var(--primary) 36%, transparent);
  animation: albumPulse 2.8s ease-in-out infinite;
}

@keyframes albumPulse {
  0%, 100% {
    transform: translateY(0);
    filter: brightness(1);
  }
  50% {
    transform: translateY(-2px);
    filter: brightness(1.06);
  }
}
```

### 優先度

高。
実装コストが低く、効果が分かりやすい。

---

## 1.2 アートワーク背景のぼかし拡張

### 狙い

選択中アルバムや再生中トラックの雰囲気を画面全体に広げ、音楽アプリらしさを強める。

### エフェクト内容

```text
画面背景
  = 現在のアルバムアートを拡大
  + blur(32px)
  + opacity 0.18
  + theme color overlay
```

### 適用候補

- プレイヤーバー
- 選択中アルバムパネル
- 曲詳細ダイアログ

### 注意点

全画面に常時かけると重くなる可能性がある。
まずは「再生中のみ」または「選択中アルバムパネルのみ」から始めるのが良い。

### 優先度

中〜高。
見た目の完成度は大きく上がるが、軽量化には注意。

---

## 1.3 アルバムカードのホバー時“ジャケット浮き”

### 狙い

アルバム一覧を操作しているときの手触りを良くする。

### エフェクト内容

- カード全体を少し浮かせる
- ジャケットの彩度とコントラストを少し上げる
- 拡大率は控えめにする

```css
.album-card {
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    filter 180ms ease;
}

.album-card:hover {
  transform: translateY(-4px) scale(1.015);
  box-shadow: 0 12px 36px rgb(0 0 0 / 0.22);
}

.album-card:hover .album-artwork {
  filter: saturate(1.08) contrast(1.04);
}
```

### 注意点

拡大しすぎると安っぽくなる。
1〜2%程度の拡大に抑えると上品。

### 優先度

高。
低コストで操作感が良くなる。

---

## 1.4 再生ボタンの波紋 / リップル

### 狙い

再生ボタンを押したときの「押した感」を強める。

### エフェクト内容

- 再生ボタンを押した瞬間、丸い波紋がふわっと広がる
- 常時ではなく、クリック時だけ発火

### 適用候補

- アルバム再生ボタン
- 曲再生ボタン
- 下部プレイヤーの再生ボタン

### 優先度

高。
音楽アプリの中核操作なので、特別扱いしてよい。

---

## 1.5 曲切り替え時のタイトルスライド

### 狙い

曲が切り替わった瞬間を自然に伝える。

### エフェクト内容

プレイヤーバーの曲名・アーティスト名を、軽く横からフェードインさせる。

```css
.now-playing-title {
  animation: trackEnter 220ms ease-out;
}

@keyframes trackEnter {
  from {
    opacity: 0;
    transform: translateX(8px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
```

### 優先度

高。
プレイヤー体験が自然に良くなる。

---

## 1.6 歌詞ありアイコンの微発光

### 狙い

歌詞がある曲を見つけやすくする。

### エフェクト内容

```css
.has-lyrics-icon {
  filter: drop-shadow(0 0 6px color-mix(in srgb, var(--primary) 50%, transparent));
}
```

### 注意点

発光を強くしすぎると一覧がうるさくなる。
歌詞表示は“読む体験”なので、落ち着いたフェードが合う。

### 優先度

中。
歌詞機能を強めたい場合に有効。

---

## 1.7 タグ保存成功時の控えめな完了エフェクト

### 狙い

タグ編集やアートワーク更新が成功したことを、ユーザーに分かりやすく伝える。

### エフェクト内容

```text
保存ボタンが一瞬だけチェックアイコンになる
変更された入力欄の枠が淡く光る
アルバムカード側の表示がスッと更新される
```

### ポイント

トースト通知だけより、編集対象そのものが反応したほうが気持ちいい。

### 優先度

高。
タグ編集アプリとしての安心感に直結する。

---

## 1.8 スキャン中の“音符が流れる”ローディング

### 狙い

ライブラリスキャン中の待ち時間の不安を減らす。

### エフェクト内容

```text
♪ ♫ ♬ が横に流れる
または
アルバムカードのスケルトンが順に現れる
```

### 推奨

音符だけだと少しチープになりやすい。
おすすめは、スケルトン表示を基本にして、小さな音符を添える形。

### 優先度

中〜高。
スキャン時間が長い場合ほど効果が大きい。

---

## 1.9 テーマ切替時のクロスフェード

### 狙い

テーマ切替機能の印象を良くする。

### エフェクト内容

```css
* {
  transition:
    background-color 180ms ease,
    border-color 180ms ease,
    color 180ms ease,
    box-shadow 180ms ease;
}
```

### 注意点

`transform` まで全要素に入れるのは避ける。
重くなりやすく、意図しない動きが出る。

### 優先度

中。
低コストで入れやすい。

---

## 1.10 簡易オーディオビジュアライザー

### 狙い

再生中であることを視覚的に楽しく伝える。

### エフェクト内容

プレイヤーバーやアートワーク下に、小さいバー型ビジュアライザーを表示する。

```text
▁ ▃ ▆ ▄ ▇ ▂ ▅
```

### 注意点

正確な波形解析までやると実装コストが上がる。
最初は「再生中だけ動く装飾バー」で十分。

### 優先度

中〜高。
音楽アプリ感がかなり増す。

---

## 1.11 アルバム選択時の共有要素っぽい遷移

### 狙い

アルバムカードから詳細パネルへの移動を気持ちよくする。

### エフェクト内容

```text
カードのジャケット
  ↓
選択中アルバムパネルの大きいジャケットへ
```

### 実装案

- Framer Motionを入れるなら `layoutId` が使いやすい
- 依存を増やしたくないなら、CSSのフェード + スケールでも十分

### 優先度

中。
見た目はかなり良くなるが、まずは基本操作のエフェクトを優先。

---

## 1.12 長いタイトルの自然なマーキー

### 狙い

長い曲名やアルバム名を自然に読めるようにする。

### エフェクト内容

```text
通常時: 省略
ホバー時: ゆっくりスクロール
再生中トラック: 必要なら自動スクロール
```

### 注意点

マーキーは全カードで常時動かすとノイズになる。
発火条件を絞ることが大切。

### 優先度

中。
長いタイトルが多いライブラリでは有効。

---

# 2. ボタン押下エフェクト案

## 2.1 再生ボタン: 波紋 + アイコン変形

### 狙い

再生操作を特別なものとして感じられるようにする。

### エフェクト内容

- クリックした瞬間に丸いリップルが広がる
- `Play` → `Pause` のアイコンが少し縮んで切り替わる

```css
.player-button {
  position: relative;
  overflow: hidden;
  transition:
    transform 120ms ease,
    box-shadow 160ms ease,
    background-color 160ms ease;
}

.player-button:active {
  transform: scale(0.92);
}

.player-button::after {
  content: "";
  position: absolute;
  inset: 50%;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0;
  transform: translate(-50%, -50%) scale(1);
  pointer-events: none;
}

.player-button.clicked::after {
  animation: buttonRipple 420ms ease-out;
}

@keyframes buttonRipple {
  0% {
    opacity: 0.22;
    transform: translate(-50%, -50%) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(14);
  }
}
```

### 適用候補

- 再生/停止
- 前へ
- 次へ

### 注意点

設定ボタンやタグ編集ボタンまで強い波紋にすると少しうるさい。
操作の重要度でエフェクトを分ける。

---

## 2.2 通常ボタン: 押し込み + 微グロー

### 狙い

保存、検索、スキャン、タグ編集などの通常ボタンにも軽い手触りを付ける。

### エフェクト内容

```css
.soft-button {
  transition:
    transform 120ms ease,
    box-shadow 160ms ease,
    filter 160ms ease;
}

.soft-button:hover {
  transform: translateY(-1px);
  filter: brightness(1.04);
}

.soft-button:active {
  transform: translateY(1px) scale(0.98);
  filter: brightness(0.98);
}
```

### 優先度

高。
全体の操作感が底上げされる。

---

## 2.3 保存ボタン: 成功時にチェックへ変化

### 狙い

タグ保存やアートワーク更新が成功したことを明確に伝える。

### エフェクト内容

```text
保存
↓
✓ 保存しました
↓
保存
```

```tsx
const [saved, setSaved] = useState(false)

const handleSave = async () => {
  await saveTags()
  setSaved(true)
  window.setTimeout(() => setSaved(false), 1200)
}

<button className={saved ? "save-button saved" : "save-button"}>
  {saved ? "✓ 保存しました" : "保存"}
</button>
```

```css
.save-button.saved {
  animation: savePop 360ms ease-out;
}

@keyframes savePop {
  0% {
    transform: scale(0.96);
  }
  60% {
    transform: scale(1.04);
  }
  100% {
    transform: scale(1);
  }
}
```

### ポイント

トースト通知だけでなく、押したボタン自体が変化するほうがUXが良い。

---

## 2.4 ボタン別エフェクト分類

| ボタン | エフェクト | 理由 |
|---|---|---|
| 再生/停止 | リップル + アイコン変形 | 一番気持ちよさが欲しい |
| 前へ/次へ | 小さなリップル + スライド感 | 曲切替の感覚と合う |
| シャッフル/リピート | ON時に発光 | 状態が分かりやすい |
| 音量 | ドラッグ中だけバー発光 | 操作中が分かる |
| 保存 | チェック表示 + ポップ | 成功が分かる |
| スキャン | ボタン内ローディング | 待ち状態が分かる |
| 削除/クリア | 控えめ | 派手にすると事故りそう |

### 方針

全部のボタンに同じ演出を入れない。
操作の意味ごとにエフェクトを分けると、完成度が上がる。

---

# 3. ビジュアライザ案

## 3.1 まずはフェイクのミニビジュアライザ

### 狙い

実装コストを抑えつつ、再生中の高揚感を出す。

### 配置案

プレイヤーバー右側に小さく配置する。

```text
曲名 / アーティスト       ▁ ▃ ▆ ▄ ▇ ▂ ▅      再生ボタン
```

### 実装例

```tsx
export function MiniVisualizer({ active }: { active: boolean }) {
  const bars = [0.35, 0.7, 0.45, 0.9, 0.55, 0.8, 0.4]

  return (
    <div className={active ? "mini-visualizer active" : "mini-visualizer"}>
      {bars.map((height, index) => (
        <span
          key={index}
          style={{
            animationDelay: `${index * 80}ms`,
            height: `${height * 100}%`,
          }}
        />
      ))}
    </div>
  )
}
```

```css
.mini-visualizer {
  display: flex;
  align-items: end;
  gap: 3px;
  width: 42px;
  height: 20px;
  opacity: 0.45;
}

.mini-visualizer span {
  width: 3px;
  min-height: 4px;
  border-radius: 999px;
  background: currentColor;
  transform-origin: bottom;
}

.mini-visualizer.active span {
  animation: visualizerBounce 900ms ease-in-out infinite;
}

@keyframes visualizerBounce {
  0%, 100% {
    transform: scaleY(0.45);
  }
  50% {
    transform: scaleY(1);
  }
}
```

### 優先度

高。
音声解析なしで作れるので、最初に入れやすい。

---

## 3.2 本物の音声連動ビジュアライザ

### 狙い

実際の音に合わせて動くビジュアライザにする。

### 構成

```text
audio element
  ↓
AudioContext
  ↓
MediaElementSource
  ↓
AnalyserNode
  ↓
frequencyData
  ↓
Canvas / div bars
```

### 実装難度の分岐

| 再生方式 | ビジュアライザ実装 |
|---|---|
| `<audio>` タグで再生 | Web Audio APIでやりやすい |
| Rust/native側で再生 | React側に音声波形情報を渡す必要あり |
| Webモードはモック | フェイクビジュアライザで十分 |

### 方針

現在の再生がフロント側の `audio` 要素なら、Web Audio APIで実装しやすい。
Rust側で再生しているなら、まずはフェイクビジュアライザでよい。

---

## 3.3 Canvas版ミニビジュアライザ

### 狙い

divバーより軽量で自由度の高い描画を行う。

### 実装例

```tsx
function AudioVisualizer({
  audioElement,
  active,
}: {
  audioElement: HTMLAudioElement | null
  active: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!audioElement || !active) return

    const audioContext = new AudioContext()
    const source = audioContext.createMediaElementSource(audioElement)
    const analyser = audioContext.createAnalyser()

    analyser.fftSize = 64
    source.connect(analyser)
    analyser.connect(audioContext.destination)

    const data = new Uint8Array(analyser.frequencyBinCount)
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")

    let frameId = 0

    const render = () => {
      if (!canvas || !ctx) return

      analyser.getByteFrequencyData(data)

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const barWidth = canvas.width / data.length

      data.forEach((value, index) => {
        const height = (value / 255) * canvas.height
        ctx.fillRect(
          index * barWidth,
          canvas.height - height,
          Math.max(1, barWidth - 2),
          height
        )
      })

      frameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(frameId)
      source.disconnect()
      analyser.disconnect()
      audioContext.close()
    }
  }, [audioElement, active])

  return <canvas ref={canvasRef} width={120} height={28} />
}
```

### 注意点

このまま入れる前に、以下の管理が必要。

- `AudioContext` の二重生成を避ける
- 同じ `audio` 要素に `createMediaElementSource` を複数回使わない
- `useAudioAnalyzer` のようなhookに切り出す

---

# 4. ビジュアライザの配置案

## A. プレイヤーバー内

一番おすすめ。
邪魔にならず、再生中であることが自然に伝わる。

```text
[Artwork] Song title
          Artist
          ▁ ▃ ▆ ▄ ▇ ▂ ▅
[Prev] [Play] [Next] [Volume]
```

## B. 再生中アルバムカード上

一覧上で「今これが鳴っている」が分かりやすい。

```text
[ Album Art ]
[ ▁ ▃ ▆ ▄ ▇ ]
Album name
Artist
```

## C. 選択中アルバム詳細パネル

一番雰囲気が出る。
ただし、最初から大きく入れると少し重く感じる可能性がある。

```text
ジャケット
アルバム名
アーティスト
━━━━━━━━━━━━━━
波形 / ビジュアライザ
```

---

# 5. 実装優先順位

## 最初に入れるセット

```text
1. 再生ボタンのリップル
2. 通常ボタンの押し込み
3. 保存成功時のチェック演出
4. プレイヤーバー内のフェイクミニビジュアライザ
```

このセットは軽く、UX改善が分かりやすい。

## 次に入れるセット

```text
5. 再生中アルバムカードにもミニビジュアライザ
6. Web Audio API連動の本物ビジュアライザ
7. 曲切替時にビジュアライザが一瞬フェード
```

---

# 6. 全体優先度表

| 優先 | エフェクト | 効果 | 実装コスト |
|---:|---|---|---:|
| 1 | 再生中アルバムの発光 | 今どれが鳴っているか分かる | 低 |
| 2 | 曲切替時のタイトルフェード | プレイヤー体験が良くなる | 低 |
| 3 | アルバムカードホバー | 操作が気持ちよくなる | 低 |
| 4 | 保存成功エフェクト | タグ編集の安心感 | 中 |
| 5 | 再生ボタンのリップル | 押した感が出る | 低〜中 |
| 6 | 通常ボタンの押し込み | 全体の操作感が良くなる | 低 |
| 7 | プレイヤーバー内ミニビジュアライザ | 音楽アプリ感が出る | 低〜中 |
| 8 | アートワーク背景ぼかし | 完成品感が増す | 中 |
| 9 | スキャン中スケルトン | 待ち時間の不安を減らす | 中 |
| 10 | テーマ切替クロスフェード | テーマ機能が映える | 低 |
| 11 | 本物の音声連動ビジュアライザ | 高揚感が増す | 中〜高 |

---

# 7. モーション設定の注意

音楽アプリは長時間開きっぱなしになるため、常時動くエフェクトは少なめにする。

基本方針は以下。

```text
再生中だけ動く
押した時だけ動く
保存時だけ光る
```

また、アクセシビリティのために `prefers-reduced-motion` 対応を入れる。

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
}
```

---

# 8. 推奨する方向性

このアプリには、派手な演出よりも、以下の方向性が合う。

```text
Apple Music風の滑らかさ
+
ローカル音楽管理アプリの落ち着き
```

キラキラさせすぎるより、再生中だけ少し息づくくらいがちょうど良い。

まずは以下から実装するのがおすすめ。

```text
1. 再生中アルバムカードの発光
2. プレイヤーバーの曲切替フェード
3. アルバムカードの軽いホバー
4. タグ保存成功時のチェック演出
5. スキャン中スケルトン
6. 再生ボタンのリップル
7. プレイヤーバー内のフェイクミニビジュアライザ
```

その後に、アートワーク背景ぼかしと本物の音声連動ビジュアライザを追加すると、かなり完成品らしい印象になる。
