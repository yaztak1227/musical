# Agent Instructions

- When adding or changing UI copy, update only the English and Japanese locale files (`src/locales/en.xml` and `src/locales/ja.xml`) during normal implementation.
- Run the app against the real Tauri/local backend by default. Enable mock data only for validation/test runs by setting `VITE_MOCK_DATA=true`.
- At the end of implementation work, start the app with the real Tauri/local backend (`npm run tauri dev`, without `VITE_MOCK_DATA=true`) and confirm that the development build completes and the app launches without dependency-resolution errors. Stop the dev process after verification.
- When changing features, behavior, UI/UX, APIs, data structures, or runtime responsibilities, update the matching specs/docs in the same change set. Use `Specs/feature-list.md` for feature inventory changes, `Specs/basic-design.md` for basic design changes, and the relevant detailed `Specs/*.md` or `docs/*.md` file for behavior-specific changes.
- When preparing a push, read `.codex/push.md` and apply its push-only checklist. For tag pushes, validate every locale file under `src/locales/`, not only English and Japanese.
- Name release tags using `v{major version}.{minor version}.{bugfix version}` (for example, `v1.2.3`).
- Before choosing or changing a release version, fetch Git tags and inspect the tags and release history reachable from the current branch. Base major, minor, or bugfix increments on the latest applicable Git release tag rather than only on version strings in working-tree files.
- Treat an instruction to update the version as authorization to validate and commit the release changes, push the current branch, create the matching `v{major}.{minor}.{bugfix}` tag, and push that tag unless the user explicitly limits the scope.
- Do not satisfy missing locale keys with English fallback text. Missing keys in non-English locale files must be translated, and placeholders such as `{count}` and `{message}` must match the English source.
- Treat `tasklist/` as local-only working notes. Do not stage, commit, or push files under `tasklist/` unless the user explicitly requests that exact path.
