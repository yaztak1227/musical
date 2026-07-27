fn main() {
    // Preserve Tauri's generated build metadata; the macOS development
    // application wrapper is applied by the workspace exec-style Cargo runner.
    tauri_build::build()
}
