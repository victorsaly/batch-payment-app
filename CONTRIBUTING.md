# Contributing to PayBatch

Thanks for taking a look! PayBatch is a small, dependency-light Electron app, kept
deliberately simple so it's easy to audit (it handles bank payment data).

## Getting started

```bash
npm install
npm start        # run the app
npm test         # run the dependency-free test suite
npm run lint     # check code style
npm run lint:fix # auto-fix what it can
```

Node.js 18+ is required.

## Project layout

| Path | Purpose |
|------|---------|
| `main.js` | Electron main process — window, encrypted storage, dialogs, update/error IPC |
| `preload.js` | The only bridge between the UI and the system (contextIsolation on) |
| `src/santander.js` | Santander formats (Bacs import + mixed) + validation |
| `src/standard18.js` | Bacs Standard 18 format |
| `src/iso20022.js` | ISO 20022 pain.001 (XML) format |
| `src/modulus.js` · `modulus-data.js` | UK sort code/account modulus check + bundled VocaLink tables |
| `src/banks.js` | The bank registry (which banks/formats are available) |
| `src/renderer.js` · `index.html` · `styles.css` | The user interface |
| `test/run.js` | Tests (run with `npm test`) |
| `docs/` | The GitHub Pages website |

## Code standards

- **Style is enforced by ESLint** (`eslint.config.js`) and `.editorconfig`:
  2-space indent, LF endings, semicolons, `const`/`let` (never `var`),
  single quotes. Run `npm run lint` before committing — CI runs it too.
- **No new runtime dependencies** without a good reason. The app ships with zero
  production `dependencies`; everything is built-in or a dev tool.
- **The renderer never touches Node/the filesystem directly** — it only calls the
  small API exposed in `preload.js`. Keep it that way (it's a security boundary).
- **Format engines must stay pure and tested.** Anything that changes how a bank
  file is generated needs a test in `test/run.js` (ideally byte-exact).
- Keep functions small and named; prefer clarity over cleverness. Match the
  surrounding comment density.

## Adding a bank or format

1. Add a format module under `src/` (see `standard18.js` as the template),
   exporting for both the browser (`window.X`) and Node (`module.exports`).
2. Register the bank in `src/banks.js`.
3. Add tests in `test/run.js`.
4. **Always verify against the bank's real import spec and a test upload** before
   marking a format available — see `ROADMAP.md`.

## Refreshing the modulus-check tables

The UK modulus check (`src/modulus.js`) uses VocaLink/Pay.UK weight tables bundled
in `src/modulus-data.js`. Pay.UK updates these periodically (~quarterly). To refresh:

```bash
node scripts/build-modulus-data.js   # re-fetches and regenerates src/modulus-data.js
npm test                             # the official VocaLink test cases must still pass
```

## Releasing

Bump `version` in `package.json`, add a `CHANGELOG.md` entry, then:

```bash
git tag vX.Y.Z && git push origin vX.Y.Z
```

CI builds installers for macOS/Windows/Linux and attaches them (with checksums)
to a draft GitHub Release. See `SIGNING.md` for code-signing.
