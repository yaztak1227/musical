# Agent Plugins 1.0

このリポジトリのルートは、Musical のローカル MCP endpoint を公開する [Agent Plugins 1.0.0](https://github.com/agentplugins/agent-plugins-spec/blob/bd383552095128f6effe895b9257cfd580a6d179/spec/1.0.0.md) パッケージです。

## ポータブルパッケージ

- `plugin.json` はプラグインの識別情報を持ち、Agent Plugins `1.0.0` の正規 manifest schema を指定します。
- `mcp.json` は Musical の MCP server を `http://127.0.0.1:1422/mcp` の Streamable HTTP として宣言します。
- `plugin.json.version` は Musical 自身のリリース版です。`$schema` が示す Agent Plugins 仕様版とは別に管理します。

パッケージには認証情報を埋め込みません。`mcp.json` は loopback URL だけを宣言し、Musical は `/mcp` への非 loopback request を拒否します。内部 sidecar への接続では system HTTP proxy も迂回します。

## プラグインを使う

1. 実際の Musical デスクトップアプリを起動します。
2. サイドバーの設定セクションを開き、MCP server を有効にします。
3. Streamable HTTP MCP server に対応する Agent Plugins クライアントから、このリポジトリのルートを directory plugin として読み込みます。

Musical tools の利用中はアプリを起動したままにしてください。アプリが停止しているか MCP が無効な場合もプラグイン自体は有効ですが、MCP へは接続できません。

## 変更を検証する

リポジトリ固有の適合チェックを実行します。

```bash
npm run test:agent-plugin
```

`npm run build` でもコンパイル前に同じチェックを実行します。Musical のリリース版を変更するときは、ほかのアプリ版ファイルと一緒に `plugin.json.version` も更新してください。

テストは Agent Plugins 仕様 commit `bd383552095128f6effe895b9257cfd580a6d179` から固定した公式 Draft 2020-12 schema で両ファイルを検証します。ネットワークへ接続せず、package path containment、schema versionの一致、Musicalのversion/portとの一致、loopback URL semanticsも確認します。
