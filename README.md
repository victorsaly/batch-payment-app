<div align="center">
  <img src="build/icon.png" width="120" alt="PayBatch logo" />
  <h1>PayBatch</h1>
  <p><strong>A local, offline desktop app that builds and exports your bank's
  bulk-payment import files — replacing the clunky Excel process.</strong></p>
  <p><em>Supports Santander Connect and Bacs Standard 18. More banks planned.</em></p>

  <p>
    <a href="https://victorsaly.github.io/batch-payment-app/"><strong>🌐 Website</strong></a> ·
    <a href="https://github.com/victorsaly/batch-payment-app/releases/latest"><strong>⬇️ Download</strong></a> ·
    <a href="CHANGELOG.md"><strong>Changelog</strong></a> ·
    <a href="ROADMAP.md"><strong>Roadmap</strong></a>
  </p>

  <p>
    <a href="https://github.com/victorsaly/batch-payment-app/actions/workflows/ci.yml">
      <img src="https://github.com/victorsaly/batch-payment-app/actions/workflows/ci.yml/badge.svg" alt="CI status" />
    </a>
    <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue" alt="Platforms" />
    <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT license" />
    <img src="https://img.shields.io/badge/data-encrypted%20%26%20offline-success" alt="Encrypted & offline" />
  </p>
</div>

---

Enter payments (or import an Excel/CSV), fix any problems with **inline validation**,
and export the exact file Santander Connect expects. Everything runs on your own
machine — **no data ever leaves your computer**, and what's stored is **encrypted**.

## Features

- ✅ **Two output formats** — official **Bacs import** (HEADER/PAYMENT/TRAILER) and the
  wide **mixed payments** 85-column layout. Both reproduced to the byte.
- ✅ **Inline, per-field validation** — bad cells are highlighted with the reason; the
  Export button stays disabled until everything is clean.
- ✅ **Editable grid** — type straight into the table, or use the quick-add form.
- ✅ **Import & template** — load your existing Excel/CSV (columns auto-detected), or grab
  a ready-made template to fill in.
- ✅ **Saved payees & batch history** — reuse beneficiaries and reload past runs.
- ✅ **Encrypted local storage** — payees, batches and settings are encrypted with your
  OS keychain (`safeStorage`). Fully offline.
- ✅ **Auto-opens the generated file** so you can eyeball it before uploading.

## Download & install

Grab the latest installer for your OS from the
[**Releases**](https://github.com/victorsaly/batch-payment-app/releases) page:

| OS | File |
|----|------|
| macOS | `PayBatch-x.y.z.dmg` |
| Windows | `PayBatch-Setup-x.y.z.exe` |
| Linux | `PayBatch-x.y.z.AppImage` / `.deb` |

> **First launch on macOS** — the app isn't code-signed, so right-click the app →
> **Open** → **Open** to bypass Gatekeeper the first time.
> **Windows** — if SmartScreen appears, click **More info → Run anyway**.

## Run from source

```bash
git clone https://github.com/victorsaly/batch-payment-app.git
cd batch-payment-app
npm install
npm start
```

Requires Node.js 18+.

## Build installers locally

```bash
npm run dist:mac     # macOS .dmg + .zip
npm run dist:win     # Windows NSIS installer
npm run dist:linux   # Linux AppImage + .deb
```

Output lands in `dist/`.

## Releasing new versions (CI)

Pushing a version tag triggers [`.github/workflows/release.yml`](.github/workflows/release.yml),
which builds on macOS, Windows and Linux runners and uploads the installers to a
GitHub Release (created as a **draft** for you to review and publish):

```bash
# bump "version" in package.json first, then:
git tag v1.0.0
git push origin v1.0.0
```

No secrets to configure — it uses the built-in `GITHUB_TOKEN`.

## The two file formats

Pick the **Output format** at the top of the Build batch screen.

### Bacs import (Santander Connect spec)

Comma-separated `.txt`, three record types:

```
PAYMENT,HEADER,<creationDate ddmmyyyy>,<fileLocationId>,<sequenceNo>
PAYMENT,<BACS|MULTIBACS>,<debit 6n+8n>,<name 35>,<sort 6n>,<account 8n>,<amount>,<paymentDate ddmmyyyy>,<reference 18>,<rti>
PAYMENT,TRAILER,<hashTotal 15n in pence>,<recordCount>
```

`BACS` = single payments; `MULTIBACS` = multiple payments sharing one debit account
and date (reference becomes mandatory). Free-text fields are uppercased and limited to
`A–Z 0–9 . - / & space`; the hash total is the value in pence, zero-padded to 15.

### Mixed payments (wide 85-column layout)

Headerless, one row per payment, LF line endings, mixed-case preserved. Reverse-engineered
byte-for-byte from a real sample. Only a payment date and the beneficiary rows are needed.

> ⚠️ The mixed format has no published spec — it's matched against a sample. **Always do
> one small test upload** in Santander Connect before relying on either format.

The complete layout for both formats lives in one file:
[`src/santander.js`](src/santander.js) (`SPEC` and `MIXED` blocks).

## Validation rules

| Field | Rule |
|------|------|
| Beneficiary name | Required. Bacs: uppercased, max 35 (first 18 reach Bacs). Allowed: `A–Z 0–9 . - / & space`. |
| Sort code | Exactly 6 digits (dashes/spaces ignored). |
| Account number | Exactly 8 digits. |
| Amount | Greater than 0, pounds & pence (e.g. `150.50`). |
| Reference | Max 18 chars. Mandatory for MULTIBACS; optional otherwise. |
| RTI reference | Bacs only, optional. Starts with `/`, e.g. `/123`. |

## Data & security

- All data is stored only on your computer, encrypted via the OS keychain
  (Keychain on macOS, DPAPI on Windows) using Electron `safeStorage`.
- The app makes **no network requests** (enforced with a strict Content-Security-Policy).
- An older plaintext data file is migrated to the encrypted store on launch.
- The renderer has no Node/filesystem access — it talks to disk only through a small,
  explicit IPC bridge ([`preload.js`](preload.js)).

## Project layout

| File | Purpose |
|------|---------|
| `main.js` | Electron main process — window, encrypted storage, import/export dialogs |
| `preload.js` | Secure IPC bridge between UI and filesystem |
| `src/santander.js` | **Format engines + validation** (`SPEC` / `MIXED`) |
| `src/index.html` · `styles.css` · `renderer.js` | The user interface |
| `test/run.js` | Dependency-free test suite (`npm test`) |
| `.github/workflows/` | CI + release pipelines |

## Testing

```bash
npm test
```

Covers byte-exact reproduction of both formats, validation rules, and CSV import.

## Disclaimer

This is an independent tool, **not affiliated with, endorsed by, or supported by
Santander**. Provided "as is" without warranty (see [LICENSE](LICENSE)). You are
responsible for verifying every payment detail and reconciling totals before
submitting a file to your bank.

## License

[MIT](LICENSE) © 2026 Victor Saly
