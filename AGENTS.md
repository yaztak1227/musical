# Agent Instructions

- When adding or changing UI copy, update only the English and Japanese locale files (`src/locales/en.xml` and `src/locales/ja.xml`) during normal implementation.
- Run the app against the real Tauri/local backend by default. Enable mock data only for validation/test runs by setting `VITE_MOCK_DATA=true`.
- When preparing a push, read `.codex/push.md` and apply its push-only checklist.
- Treat `tasklist/` as local-only working notes. Do not stage, commit, or push files under `tasklist/` unless the user explicitly requests that exact path.
