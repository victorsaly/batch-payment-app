# Changelog

All notable changes to **PayBatch** are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project follows [Semantic Versioning](https://semver.org/).

## v1.2.0 — 2026-06-28

### Changed
- **Rebuilt the interface on React + Vite** (with Radix UI for accessible dialogs/menus),
  keeping the v1.1.0 design system. The pure payment-format engines (Bacs, Standard 18,
  ISO 20022, SEPA, modulus) are unchanged, so **every exported file is byte-identical**.
- **Home is now a guided wizard** with a timeline: ① Choose your bank → ② Start your
  batch → ③ Build & export.
- **Bank picker is a scannable list** that shows each option's supported formats, and now
  clearly separates **Banks** from **Cross-bank formats** (Bacs Standard 18, ISO 20022).
- App window fills the full height with the footer pinned to the bottom; the status bar
  shows a clean "Encrypted & stored on this device" (full path on hover).
- App icon rebranded to the new indigo identity.

### Developer
- Renderer dev server with hot-reload (`npm run dev`); packaged builds load the static
  bundle under the same strict, network-free CSP. `npm test` remains the format guard.

## v1.1.0 — 2026-06-28

### Changed
- **Refreshed design — calmer, more focused, 1Password-inspired.** A new semantic
  design-token system (neutral palette with a single indigo accent) replaces the
  Santander-red identity; each bank keeps its own brand colour on its picker tile.
- **Persistent left sidebar** replaces the top tab bar for navigation (Home, Build
  batch, Saved payees, History, with Help pinned at the bottom).
- **Dark mode** — a new theme toggle cycles System / Light / Dark and remembers your
  choice. Defaults to following your operating system.
- **Real icon set** — replaced emoji/unicode glyphs with clean inline SVG icons.
- Improved text contrast across both themes (WCAG AA) and softened cards, shadows and
  spacing for a more spacious feel.

> No changes to file formats or validation — every export (Bacs, Standard 18,
> ISO 20022, SEPA) is byte-identical to v1.0.6.

## v1.0.6 — 2026-06-28

### Added
- **Encrypted backup & restore** — save a portable backup of your payees, batches and
  settings, protected by a password you choose (**AES-256-GCM**). The on-disk store is
  locked to one machine; a backup lets you move your data to a new computer or keep a
  safe copy, and the file is unreadable without the password.
- **Column-mapping on import** — importing a CSV/spreadsheet now opens a "Match your
  columns" screen, pre-filled with PayBatch's best guess, with a live preview. Map
  arbitrary spreadsheet layouts (sort code/account, or IBAN/BIC for SEPA) instead of
  relying on a fixed column order.
- **In-app auto-update** — PayBatch can now download and install updates itself (with
  your consent) and restart into the new version, instead of just linking to the
  Releases page. Available on signed builds.

### Changed
- **ISO 20022 / SEPA XML is now validated against the official ISO 20022 schemas**
  (`pain.001.001.09` / `pain.001.001.03`) in the test suite, guarding against format
  regressions.

## v1.0.5 — 2026-06-27

### Changed
- **macOS builds are now code-signed with a Developer ID and notarized by Apple** —
  no more "PayBatch is damaged" / Gatekeeper warning on download; the app opens with a
  normal double-click.

## v1.0.4 — 2026-06-27

A big multi-bank, multi-format release.

### Added
- **10 banks now generate files** — Santander (Bacs import + mixed) plus, via the
  cross-bank engines below, **HSBC, Barclays, Lloyds, NatWest, TSB, Co-operative and
  Metro Bank**. Each is marked "verify with a test upload".
- **ISO 20022 `pain.001` (XML)** — the modern cross-bank standard. UK domestic GBP
  credit transfers (`pain.001.001.09`, sort code + account).
- **SEPA credit transfers** — pay **euros to IBANs** across the EU/EEA
  (`pain.001.001.03`). The grid swaps to **IBAN/BIC** columns, IBANs are
  checksum-validated, and BIC is optional (IBAN-only).
- **UK modulus checking** — the official VocaLink / Pay.UK check on every sort code +
  account number; an **amber warning** flags combinations that can't be real accounts
  (likely typos). It's a warning, not a block. Validated against VocaLink's official
  test cases.
- **Searchable bank picker** — a responsive card grid grouped into **Available** and
  **Coming soon**, with a search box. Coming-soon tiles for Nationwide and the fintechs
  (Revolut, Wise, Tide, Starling, Monzo, Currencycloud).
- **Bank-by-bank format reference** ([FORMATS.md](FORMATS.md)).

### Notes
- The new formats are best-effort from public specifications (not bank-supplied
  samples). **Always do one test upload before a real payment run.**

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
