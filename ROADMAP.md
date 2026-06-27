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

## Planned banks

| Bank | Channel | Likely format(s) to support | Notes |
|------|---------|-----------------------------|-------|
| **Lloyds / Bank of Scotland** | Commercial Banking Online (CBO), LloydsLink | Bulk List CSV import · Bacs Standard 18 | CBO offers a CSV "bulk list" upload; Standard 18 for Bacs bureaus. |
| **Barclays** | Barclays.Net / iPortal | CSV import · Bacs Standard 18 | iPortal accepts mapped CSV templates and Standard 18. |
| **HSBC** | HSBCnet | Bacs Standard 18 · ISO 20022 pain.001 (XML) | HSBCnet increasingly favours ISO 20022 XML. |
| **NatWest / RBS** | Bankline | Bankline Import (Standard 18) · bulk-payment CSV | Bankline has a well-documented fixed-width import. |
| **TSB / Co-operative / Metro** | Various | Bacs Standard 18 · CSV | Lower priority; mostly Standard 18. |

## Cross-bank formats worth prioritising

Two formats are accepted by **many** UK banks, so building them once unlocks
several banks at a time:

1. **Bacs Standard 18** — the long-standing fixed-width UK bank-to-bank file used by
   Bacs-approved bureaus. Broadly accepted (Bankline, iPortal, Standard 18 uploads).
2. **ISO 20022 `pain.001.001.03`** — the modern XML credit-transfer standard that
   most banks are moving toward for bulk/file payments.

## Other planned improvements

- Official bank **logos** on the picker (currently brand-coloured initial tiles).
- **UK modulus check** (Vocalink weight tables) to validate that a sort code +
  account number combination is actually a possible account — catches typos that
  pass the digit-count check.
- **Auto-update** (download & install in-app) once the app is code-signed.
- Optional **CSV column-mapping** screen for arbitrary spreadsheet layouts.

## Want a bank prioritised?

Open an issue describing the bank, the channel you use, and — ideally — attach the
bank's import specification or a sample file.
