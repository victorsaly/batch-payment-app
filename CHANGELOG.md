# Changelog

All notable changes to **PayBatch** are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project follows [Semantic Versioning](https://semver.org/).

## Unreleased

### Added
- **UK modulus checking** — PayBatch now runs the official VocaLink / Pay.UK modulus
  check on each sort code + account number and shows an **amber warning** when a
  combination can't be a real account (a likely typo). It's a warning, not a block —
  you can still export. Validated against VocaLink's official test cases.
- **ISO 20022 `pain.001` (XML)** — a new cross-bank format (the modern standard used by
  HSBC, Barclays, Lloyds and NatWest). v1 covers **UK domestic GBP** credit transfers
  (sort code + account). Pick the **ISO 20022** bank to use it. SEPA/international are
  planned; do a test upload to confirm your bank's profile before relying on it.
- New **bank-by-bank format reference** ([FORMATS.md](FORMATS.md)).

## v1.0.3 — 2026-06-27

### Added
- **Privacy at a glance** — Home now shows 🔒 Encrypted · 📴 Works fully offline ·
  🚫 Never uploaded, making it clear your data stays on your computer.
- **“Created by Victor Saly”** credit in the footer and Help.
- Releases now include a **`SHA256SUMS.txt`** so downloads can be verified.

### Changed
- **Cleaner Home screen** — bank picker on a single row, removed the duplicate logo,
  tighter, more professional hero.
- **Bacs Standard 18** is no longer marked Beta.

### Behind the scenes
- Project is now **public / open source**, with a website and privacy policy.
- macOS builds are **signing-ready** (hardened runtime + notarization wired); builds
  stay unsigned until signing certificates are added (see `SIGNING.md`).

## v1.0.2 — 2026-06-27

### Added
- **Bank chip** on the Build screen showing the selected bank, with a quick
  "Change ▸" back to the home screen to switch bank.
- **Paste from Excel / Sheets** — copy cells and press Cmd/Ctrl + V on the Build
  screen to load them straight into the batch.
- **Bacs Standard 18** — a second, cross-bank fixed-width credit format,
  selectable from the bank picker.
- **Error tracking** — problems are logged locally with a short reference code
  (e.g. `ERR-AB12C`); view or clear the log under Help › Report a problem.
- **FAQ** in Help; **smooth view transitions** and busy spinners on export/import.
- App **version** shown in the footer (click for the changelog) and in Help.

### Fixed
- Smarter import header detection (a single pasted row whose reference contained
  “ref” was wrongly treated as a header).

### Changed
- Release pipeline now builds each platform, then publishes all installers from
  a single job — so macOS, Windows and Linux always land in the same release
  (previously the macOS build could be missed due to a publish race).

## v1.0.1 — 2026-06-27

### Added
- **Home / landing screen** — pick your bank and jump straight into a new batch,
  an import, or the template, with a summary of your saved data.
- **Loading splash** on start-up.

### Fixed
- App was unresponsive (tabs/buttons did nothing) due to a script error
  (`Banks` declared twice). Resolved — the whole UI is interactive again.

## v1.0.0 — 2026-06-27

First public release. 🎉

### Added
- **Santander Connect — Bacs payment import** format (HEADER / PAYMENT / TRAILER),
  reproduced byte-for-byte from the published specification.
- **Santander Connect — Mixed payments** format (the wide 85-column layout).
- **Bank picker** — choose the bank to target. Santander is available now;
  **Lloyds, Barclays, HSBC and NatWest** are shown as *coming soon*.
- **Inline, per-field validation** — invalid cells are highlighted with the reason;
  the Export button stays disabled until every row is valid.
- **Editable batch grid** plus a quick-add form and reusable **saved payees**.
- **Import** an Excel/CSV export (columns auto-detected) and a **downloadable template**.
- **Batch history** — save runs and reload them later.
- **Encrypted local storage** via the OS keychain (Electron `safeStorage`); fully offline.
- Generated files **open automatically** after export.
- **Update notifications** and an in-app **changelog viewer**.
- **macOS, Windows and Linux** installers built and published via GitHub Actions.
