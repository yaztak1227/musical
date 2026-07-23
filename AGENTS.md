# Agent Instructions

- When adding or changing UI copy, update only the English and Japanese locale files (`src/locales/en.xml` and `src/locales/ja.xml`) during normal implementation.
- Run the app against the real Tauri/local backend by default. Enable mock data only for validation/test runs by setting `VITE_MOCK_DATA=true`.
- For tasks with a graphics or visual-quality goal, verify against the real Tauri app. Before starting anything, check whether port `1420` or this workspace's `target/debug/musical` is already running. If the existing process is the real Tauri app for this workspace, reuse it and do not start another instance; only run `npm run tauri dev` when no reusable real app exists.
- For routine launch, dependency-resolution, or non-visual smoke checks, use the isolated mock Tauri app (`npm run tauri:dev:ai-test`) on port `1430` instead of starting the real app. This test app runs hidden and unfocused in the background, uses mock data and a separate app identifier, never opens the dev browser, and does not start the local server or MCP sidecar on port `1422`.
- Stop only the dev process started by the current task after verification. Never stop a reused process owned by another task or the user.
- When changing features, behavior, UI/UX, APIs, data structures, or runtime responsibilities, update the matching specs/docs in the same change set. Use `Specs/feature-list.md` for feature inventory changes, `Specs/basic-design.md` for basic design changes, and the relevant detailed `Specs/*.md` or `docs/*.md` file for behavior-specific changes.
- When preparing a push, read `.codex/push.md` and apply its push-only checklist. For tag pushes, validate every locale file under `src/locales/`, not only English and Japanese.
- Name release tags using `v{major version}.{minor version}.{bugfix version}` (for example, `v1.2.3`).
- Before choosing or changing a release version, fetch Git tags and inspect the tags and release history reachable from the current branch. Base major, minor, or bugfix increments on the latest applicable Git release tag rather than only on version strings in working-tree files.
- Treat an instruction to update the version as authorization to validate and commit the release changes, push the current branch, create the matching `v{major}.{minor}.{bugfix}` tag, and push that tag unless the user explicitly limits the scope.
- Do not satisfy missing locale keys with English fallback text. Missing keys in non-English locale files must be translated, and placeholders such as `{count}` and `{message}` must match the English source.
- Treat `tasklist/` as local-only working notes. Do not stage, commit, or push files under `tasklist/` unless the user explicitly requests that exact path.
