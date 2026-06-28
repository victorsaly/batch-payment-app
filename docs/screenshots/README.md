# Screenshots

Drop real app screenshots here (PNG). They're referenced by the root `README.md`
(and can be used in `docs/index.html`).

Current shots (v1.2.0 UX), referenced by the root `README.md`:

| File | Shows |
| --- | --- |
| `home-wizard.png` | Home — guided wizard, Step 1 "Choose your bank" (light) |
| `build.png` | Build batch screen (settings + add-payment form + grid), light |
| `home-dark.png` | Home — guided wizard (dark) |
| `build-dark.png` | Build batch screen (dark) |

These are captured headlessly from the built renderer via Electron's
`webContents.capturePage()` (see `scripts/`-style helper used during the React
migration). To refresh them, rebuild the renderer and re-run that capture, or grab a
clean window shot on macOS with **Cmd + Shift + 4 → Space → click the window**.
