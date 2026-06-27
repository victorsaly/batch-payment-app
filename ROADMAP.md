# PayBatch roadmap

PayBatch is built to support **multiple UK banks**. Each bank is a self-contained
format module (see [`src/santander.js`](src/santander.js) as the reference) plus an
entry in the bank registry ([`src/banks.js`](src/banks.js)).

> ⚠️ The formats below are **best-effort notes** gathered from public sources. Each
> one **must be confirmed against that bank's own import specification** (and a test
> upload) before it ships. Bank portals change their accepted formats over time.

## Supported now

| Bank | Channel | Format(s) |
|------|---------|-----------|
| ✅ **Santander** | Santander Connect | Bacs payment import (HEADER/PAYMENT/TRAILER) · Mixed payments (85-column CSV) |
| ✅ **Bacs Standard 18** | Cross-bank | Fixed-width credit records (transaction code 99). Tape-label wrappers (VOL1/HDR/UHL1/UTL1/EOF) not emitted — add per your bank's guidance if required. |
| ✅ **ISO 20022** | Cross-bank | XML credit transfers: **UK domestic GBP** (`pain.001.001.09`, sort/account) and **SEPA EUR** (`pain.001.001.03`, IBAN/BIC). International planned. Verify with a test upload. |
| ✅ **HSBC · Barclays · Lloyds · NatWest** | Corporate file upload | Selectable in the picker — each generates **Bacs Standard 18**, **ISO 20022** (UK GBP) and **SEPA** (EUR) using the cross-bank engines above. Per-bank CSV planned. Verify with a test upload. |

## Which banks & formats next

The full bank-by-bank matrix of accepted formats (high-street banks **and**
fintechs like Revolut/Wise) and what PayBatch supports lives in **[FORMATS.md](FORMATS.md)**.

The app's **bank picker** lists these as *coming soon*:

- **High-street:** TSB · Co-operative · Nationwide · Metro Bank
- **Fintech / business:** Revolut · Wise · Tide · Starling · Monzo
- **International:** Currencycloud

Build priority from there:

1. ✅ **Bacs Standard 18** *(done)* — unlocks BACS/FPS credits across HSBC, Barclays,
   Lloyds, NatWest and Bacs bureaus.
2. ✅ **ISO 20022 `pain.001` (XML)** — *done:* UK domestic GBP (`.09`) + SEPA EUR (`.03`,
   IBAN/BIC). Next: international / multi-currency, SCT Instant.
3. **Per-bank CSV templates** — starting with Lloyds CBO and Revolut Business.

## Done recently

- ✅ **UK modulus check** (VocaLink weight tables) — flags sort code/account
  combinations that can't be real accounts. ✅ **SEPA** euro credit transfers.

## Other planned improvements

- Official bank **logos** on the picker (currently brand-coloured initial tiles).
- **Auto-update** (download & install in-app) once the app is code-signed.
- Optional **CSV column-mapping** screen for arbitrary spreadsheet layouts.

## Want a bank prioritised?

Open an issue describing the bank, the channel you use, and — ideally — attach the
bank's import specification or a sample file.
