# Documentation Steering

Musical の改修では、コード変更と設計/仕様ドキュメント更新を同じ変更セットで扱う。

## 必須ルール

- 機能追加、仕様変更、UI/UX 変更、API/データ構造変更、ランタイム責務変更を行う場合は、該当コードと同時に関連ドキュメントも更新する。
- 機能一覧が変わる場合は `Specs/feature-list.md` を更新する。
- 基本設計、レイヤ責務、主要シーケンスが変わる場合は `Specs/basic-design.md` を更新する。
- 現行挙動の詳細が変わる場合は `Specs/current-platform-capabilities.md` と `Specs/current-platform-capabilities_JP.md`、または該当する `docs/*.md` を更新する。
- Fire TV の protocol、architecture、UI design、device registry、voice command memory が変わる場合は対応する `docs/firetv-*.md` を更新する。
- 再生終了、キュー、再生ボタン状態が変わる場合は `Specs/playback-sequences.md` を更新する。
- ビジュアライザの解析、描画、キャッシュ、Chibi 表示が変わる場合は `docs/visualizer-design.ja.md` を更新する。
- ドキュメント更新が不要なコード変更では、PR/変更説明に「仕様ドキュメント影響なし」と明記できる状態にする。

## 運用メモ

- 通常実装で UI copy を追加/変更する場合は `src/locales/en.xml` と `src/locales/ja.xml` のみ更新する。
- 実機/実バックエンド前提の変更は、mock data だけで完了扱いにしない。
- `tasklist/` は local-only working notes なので、明示依頼がない限りこのドキュメント更新運用の対象外として扱う。
