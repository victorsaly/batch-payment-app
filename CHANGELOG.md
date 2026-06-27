# Changelog

All notable changes to **PayBatch** are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project follows [Semantic Versioning](https://semver.org/).

## v1.0.2 — 2026-06-27

### Added
- **Bank chip** on the Build screen showing the selected bank, with a quick
  "Change ▸" back to the home screen to switch bank.

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
