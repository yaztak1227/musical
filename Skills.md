# Skills

## Windows 版を作ってと言われたとき

このプロジェクトは Tauri v2 アプリなので、Windows 版の正式なビルドは Windows 環境で行うのを基本にする。macOS からのクロスビルドは NSIS インストーラーのみを対象にした最後の手段として扱う。

### 事前確認

- `package.json` の Node 要件は `>=24.0.0`
- `packageManager` は `npm@11.12.1`
- Rust は `rust-toolchain.toml` に従う
- `src-tauri/tauri.conf.json` の `bundle.targets` は現在 `all`
- Windows の `.msi` は Windows 上でのみ作成する
- macOS/Linux から作る場合は `.msi` ではなく NSIS の `-setup.exe` を作る

### Windows PC で作る手順

1. Windows に Microsoft C++ Build Tools を入れる
   - Visual Studio Build Tools で `Desktop development with C++` を選ぶ
2. WebView2 Runtime を確認する
   - Windows 10 1803 以降と Windows 11 では通常インストール済み
3. MSI も作る場合は VBSCRIPT optional feature が有効か確認する
   - `targets: "all"` または `targets: "msi"` の場合に必要
4. 依存関係を入れる

```powershell
npm install
```

5. 通常の検証を通す

```powershell
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
npm run test:e2e
```

6. Windows 版をビルドする

```powershell
npm run tauri build
```

7. 成果物を確認する

```text
src-tauri\target\release\bundle\
```

代表的な成果物:

- `bundle\msi\*.msi`
- `bundle\nsis\*-setup.exe`

### macOS から NSIS 版だけ作る手順

公式には Windows 上でのビルドが推奨。macOS からの Windows クロスビルドは、ローカル VM や GitHub Actions が使えない場合だけにする。

1. NSIS と LLVM を入れる

```bash
brew install nsis llvm
```

2. Homebrew の LLVM を PATH に追加する

```bash
export PATH="/opt/homebrew/opt/llvm/bin:$PATH"
```

3. Windows Rust target を追加する

```bash
rustup target add x86_64-pc-windows-msvc
```

4. `cargo-xwin` を入れる

```bash
cargo install --locked cargo-xwin
```

5. NSIS の Windows 版をビルドする

```bash
npm run tauri build -- --runner cargo-xwin --target x86_64-pc-windows-msvc --bundles nsis
```

6. 成果物を確認する

```text
src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/
```

### 注意点

- `.msi` が必要なら Windows PC または Windows の CI で作る
- `bundle.targets` が `all` のままだと MSI も対象になるため、macOS クロスビルドでは `--bundles nsis` を付ける
- 署名なしの Windows アプリは SmartScreen 警告が出る可能性がある
- 配布用にするなら Windows code signing の証明書と署名手順を別途用意する
- Windows 7 対応は現時点では優先しない。必要になった場合だけ WebView2 install mode を検討する

### 参照

- Tauri v2 Windows Installer: https://v2.tauri.app/distribute/windows-installer/
- Tauri v2 Windows Prerequisites: https://v2.tauri.app/start/prerequisites/
- Tauri v2 Windows Code Signing: https://v2.tauri.app/distribute/sign/windows/
