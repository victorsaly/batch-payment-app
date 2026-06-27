# UK bank payment file formats — by bank

This is PayBatch's working reference for **which bulk-payment import file each UK
bank accepts**, and which formats PayBatch supports today. It guides what we build
next.

> ⚠️ **There is no single UK-wide standard.** The mappings below are best-effort,
> gathered from public bank guidance and the sources at the bottom. **Every format
> must be confirmed against that bank's current import specification and a real test
> upload before PayBatch marks it "available."** ISO versions, Bacs Standard 18 label
> requirements, and CSV column layouts vary by bank and change over time.

Legend: ✅ supported in PayBatch · ⬜ planned · ⭐ recommended next build

## 1. Format families

| Format | Payment rails it covers | PayBatch | Notes |
|--------|-------------------------|----------|-------|
| **Bank CSV templates** (per-bank) | BACS, Faster Payments, CHAPS, international (varies) | ✅ Santander only | The most widely supported option — but every bank has its own columns. |
| **Bacs Standard 18** (BACSSTD18) | BACS Direct Credit **+ Faster Payments** | ✅ `src/standard18.js` | Pay.UK fixed-width standard. Accepted by many banks/bureaus. |
| **ISO 20022 `pain.001`** (XML) | BACS, FPS, CHAPS, **SEPA Credit Transfer**, international | ⬜ ⭐ | The modern standard. `pain.001.001.09` is current. One format covers the most rails. |
| **XLSX template** | varies | ⬜ | Used by some fintechs (e.g. Wise). |
| **SWIFT MT101** (legacy) | cross-border | ❌ not planned | Being retired — NatWest stops accepting MT import **Nov 2025**. |
| Santander **Bacs import** / **Mixed** (proprietary CSV) | BACS / Faster Payments | ✅ `src/santander.js` | Santander Connect only. |

## 2. By bank

### 2a. High-street / corporate banks

| Bank | Channel | Accepted bulk-import formats | PayBatch |
|------|---------|------------------------------|----------|
| **Santander** | Santander Connect | Santander Bacs import · Mixed payments · (Standard 18 via Bacs bureau) | ✅ Bacs import, Mixed |
| **HSBC** | HSBCnet | **BACSSTD18** (BACS + FPS) · **ISO 20022 XML** `pain.001` (all incl. SEPA) · CSV | ✅ Std 18 · ⬜ ISO |
| **Barclays** | Barclays.Net / iGTB iPortal | Bacs Standard 18 · ISO 20022 XML (MX / `pain.001`) · mapped CSV | ✅ Std 18 · ⬜ ISO / CSV |
| **Lloyds / Bank of Scotland** | Commercial Banking Online | CSV templates (BACS single, BACS multiple, Faster Payment) · Standard 18 (bureau) · ISO 20022 XML | ✅ Std 18 · ⬜ CSV / ISO |
| **NatWest / RBS / Ulster** | Bankline | Bacs Standard 18 · Bankline CSV · ISO 20022 **`pain.001.001.09`** (SWIFT MT retiring Nov 2025) | ✅ Std 18 · ⬜ ISO / CSV |
| **NatWest** | Bankline Direct (corporate) | ISO 20022 `pain.001.001.09` · Standard 18 · JSON · ISO 8583 · (SWIFT MT) | ✅ Std 18 · ⬜ ISO |
| **TSB / Co-operative / Nationwide / Metro** | Various | Bacs Standard 18 · CSV (varies) | ✅ Std 18 |

### 2b. Fintech / business accounts

| Provider | Channel | Accepted bulk formats | Notes | PayBatch |
|----------|---------|-----------------------|-------|----------|
| **Revolut Business** | Revolut portal / API | CSV template · XML · BACS-format | ~1,000 entries/file; columns vary by currency | ⬜ CSV |
| **Wise** | Wise platform | CSV · **XLSX** templates | FPS + international | ⬜ |
| **Currencycloud** | Currencycloud portal | CSV bulk upload | SEPA / international | ⬜ |
| **Tide / Starling / Monzo** | App / portal | Limited / varies — verify | bulk file upload not confirmed for all | — |

## 3. Recommended build order

1. ✅ **Bacs Standard 18** *(done)* — unlocks BACS/FPS credits across HSBC, Barclays,
   Lloyds, NatWest and Bacs bureaus.
2. ⭐ **ISO 20022 `pain.001.001.09` (XML)** — highest leverage: a single format unlocks
   CHAPS / SEPA / international across HSBC, Barclays, Lloyds and NatWest.
3. **Per-bank CSV templates** — start with **Lloyds CBO** (BACS single/multiple +
   Faster Payment CSV) and **Revolut Business** (well-documented templates, large SME base).
4. ✅ **Santander Connect** CSVs *(done)*.

Adding a format follows the pattern in [`CONTRIBUTING.md`](CONTRIBUTING.md): a module in
`src/`, an entry in [`src/banks.js`](src/banks.js), and byte-exact tests in `test/run.js`.

## Sources

These informed the tables above; always confirm against the bank's own current spec.

- [eqwire — Batch payment file upload for supplier & payroll (UK)](https://eqwire.com/news/batch-payment-file-upload-supplier-payroll-uk)
- [NatWest — Bankline ISO 20022 FAQs](https://www.natwest.com/business/ways-to-bank/bankline/help-and-support/bankline-iso-faqs.html)
- [RBS — Bankline XML (pain.001.001.09) import format guide (PDF)](https://www.rbs.co.uk/content/dam/rbs_co_uk/Business_and_Content/PDFs/Bankline/rbs-bankline-xml-standard-import-format.pdf)
- [NatWest — Bankline Direct ISO FAQs](https://www.natwest.com/corporates/everyday-banking/bankline-direct/bankline-direct-iso-faqs.html)
- [Barclays Corporate — ISO 20022 for corporates](https://www.barclayscorporate.com/insights/iso-for-corporates/)
- [Lloyds — Commercial Banking Online: importing payments (CSV)](https://resources.lloydsbank.com/cbonlineupgrade/importing-payments/)
- [Lloyds — Transaction Upload help](https://cbsecure.lloydsbank.com/cmphelpsupport/details/4-19)
- [Revolut — What are bulk payments?](https://help.revolut.com/business/help/receiving-payments/sending-money-to-an-external-bank-account/what-are-bulk-payments/)
- [Revolut — Create a file payment (developer docs)](https://developer.revolut.com/docs/guides/build-banking-apps/tutorials/create-a-file-payment)
- [AccountsIQ — Compatible bank payment file formats](https://aiq.helpjuice.com/bank-system/compatible-bank-statement-and-bank-payment-file-formats)
