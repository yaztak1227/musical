# Next Task

## Current Status

- Added `npm run dev:public` to start the Vite dev server on `0.0.0.0`.
- Updated Tauri dev startup so `npm run tauri dev` uses `npm run dev:public`.
- Added a Vite dev-only API at `/api/public-dev-tunnel`.
- The app now shows a setting checkbox in the left panel:
  - English: `Publish this dev session`
  - Japanese: `この開発セッションを公開`
- When the checkbox is enabled, the dev API starts a Cloudflare Quick Tunnel and returns a public URL.
- When the checkbox is disabled, the dev API closes the tunnel.
- The public URL is rendered as a QR code in the bottom of the left panel.
- The QR panel uses sticky positioning so it stays at the bottom of the left panel without being hidden by the player bar.

## Changed Files

- `.gitignore`
- `package.json`
- `package-lock.json`
- `scripts/public-dev.mjs`
- `vite.config.ts`
- `src/App.tsx`
- `src/App.css`
- `src/i18n.ts`
- `src/locales/en.xml`
- `src/locales/ja.xml`
- `src-tauri/tauri.conf.json`

## Verification Done

- `npm run build` passes.
- `npm audit --audit-level=high` reports `found 0 vulnerabilities`.
- Playwright verified:
  - Checkbox can trigger public URL generation.
  - QR code renders from a generated `data:image/png` URL.
  - QR panel appears at the bottom of the left panel.
  - Checkbox off closes the public tunnel.

## Notes

- Run with:

```bash
npm run dev:public
```

- Or run the full desktop app with:

```bash
npm run tauri dev
```

- Then enable the public-session checkbox in the left panel to generate the public URL and QR code.
- Test tunnel and dev server were stopped after verification.
