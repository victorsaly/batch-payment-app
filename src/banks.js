/*
 * banks.js — the registry of banks PayBatch can target.
 *
 * Only `santander` is implemented today (its file engine lives in santander.js).
 * Each new bank gets: an entry here, its own format module, and wiring in
 * renderer/export. `status: 'coming-soon'` banks show on the picker but are
 * disabled. Brand colours drive the picker tiles; swap in official logo files
 * later by adding `logo: 'banks/<id>.svg'` and rendering an <img>.
 *
 * Format notes are best-effort and MUST be confirmed against each bank's own
 * import specification before implementing — see ROADMAP.md.
 *
 * `kind` separates real banks from cross-bank standards/formats (Bacs Standard
 * 18, ISO 20022) so the bank picker can group and label them clearly:
 *   'bank'   — a specific bank/provider that expects its own file layout.
 *   'format' — a generic, cross-bank standard you can pick directly.
 */
const BANKS = [
  {
    id: 'santander',
    name: 'Santander',
    kind: 'bank',
    color: '#ec0000',
    initial: 'S',
    status: 'available',
    formats: ['BACS_IMPORT', 'MIXED'],
    note: 'Santander Connect — Bacs payment import (HEADER/PAYMENT/TRAILER) and the wide “mixed payments” layout.'
  },
  {
    id: 'bacs18',
    name: 'Bacs Standard 18',
    kind: 'format',
    color: '#3b5566',
    initial: '18',
    status: 'available',
    formats: ['STANDARD18'],
    note: 'Bacs Standard 18 — the cross-bank fixed-width credit file accepted by many UK banks and bureaus.'
  },
  {
    id: 'iso20022',
    name: 'ISO 20022 / SEPA',
    kind: 'format',
    color: '#1f6f6f',
    initial: 'XML',
    status: 'available',
    formats: ['ISO20022', 'SEPA'],
    note: 'ISO 20022 pain.001 (XML) — the modern cross-bank standard (HSBC, Barclays, Lloyds, NatWest). UK domestic GBP + SEPA euro (IBAN); verify with your bank.'
  },
  {
    id: 'lloyds',
    name: 'Lloyds',
    kind: 'bank',
    color: '#024731',
    initial: 'L',
    status: 'available',
    formats: ['STANDARD18', 'ISO20022', 'SEPA'],
    note: 'Lloyds Commercial Banking Online — generates Bacs Standard 18, ISO 20022 XML (UK GBP) and SEPA (EUR). CSV templates planned. Verify with a test upload.'
  },
  {
    id: 'barclays',
    name: 'Barclays',
    kind: 'bank',
    color: '#00aeef',
    initial: 'B',
    status: 'available',
    formats: ['STANDARD18', 'ISO20022', 'SEPA'],
    note: 'Barclays.Net / iPortal — generates Bacs Standard 18, ISO 20022 XML (UK GBP) and SEPA (EUR). Verify with a test upload.'
  },
  {
    id: 'hsbc',
    name: 'HSBC',
    kind: 'bank',
    color: '#db0011',
    initial: 'H',
    status: 'available',
    formats: ['STANDARD18', 'ISO20022', 'SEPA'],
    note: 'HSBCnet — generates Bacs Standard 18 (BACS + Faster Payments), ISO 20022 XML (UK GBP) and SEPA (EUR). Verify with a test upload.'
  },
  {
    id: 'natwest',
    name: 'NatWest',
    kind: 'bank',
    color: '#5a2d81',
    initial: 'N',
    status: 'available',
    formats: ['STANDARD18', 'ISO20022', 'SEPA'],
    note: 'NatWest Bankline — generates Bacs Standard 18 and ISO 20022 XML (UK GBP, pain.001.001.09) and SEPA (EUR). Bankline CSV planned. Verify with a test upload.'
  },

  // --- more UK high-street banks (planned) ---
  {
    id: 'tsb',
    name: 'TSB',
    kind: 'bank',
    color: '#1c3f94',
    initial: 'TSB',
    status: 'available',
    formats: ['STANDARD18'],
    note: 'TSB — generates Bacs Standard 18. CSV planned. Verify with a test upload.'
  },
  {
    id: 'coop',
    name: 'Co-operative',
    kind: 'bank',
    color: '#00a1de',
    initial: 'Co',
    status: 'available',
    formats: ['STANDARD18'],
    note: 'The Co-operative Bank — generates Bacs Standard 18. CSV planned. Verify with a test upload.'
  },
  {
    id: 'nationwide',
    name: 'Nationwide',
    kind: 'bank',
    color: '#15144b',
    initial: 'NW',
    status: 'coming-soon',
    formats: [],
    note: 'Nationwide — Bacs Standard 18 / CSV (business).'
  },
  {
    id: 'metro',
    name: 'Metro Bank',
    kind: 'bank',
    color: '#002d72',
    initial: 'M',
    status: 'available',
    formats: ['STANDARD18'],
    note: 'Metro Bank — generates Bacs Standard 18. CSV planned. Verify with a test upload.'
  },

  // --- fintech / business accounts (planned) ---
  {
    id: 'revolut',
    name: 'Revolut',
    kind: 'bank',
    color: '#0666eb',
    initial: 'R',
    status: 'coming-soon',
    formats: [],
    note: 'Revolut Business — CSV template, XML, and BACS-format (up to ~1,000 entries/file).'
  },
  {
    id: 'wise',
    name: 'Wise',
    kind: 'bank',
    color: '#163300',
    initial: 'W',
    status: 'coming-soon',
    formats: [],
    note: 'Wise — CSV and XLSX batch templates (Faster Payments + international).'
  },
  {
    id: 'tide',
    name: 'Tide',
    kind: 'bank',
    color: '#4050ff',
    initial: 'T',
    status: 'coming-soon',
    formats: [],
    note: 'Tide — bulk payment CSV (where supported).'
  },
  {
    id: 'starling',
    name: 'Starling',
    kind: 'bank',
    color: '#6935d3',
    initial: 'St',
    status: 'coming-soon',
    formats: [],
    note: 'Starling Bank — bulk payments (limited; verify).'
  },
  {
    id: 'monzo',
    name: 'Monzo',
    kind: 'bank',
    color: '#14233c',
    initial: 'Mo',
    status: 'coming-soon',
    formats: [],
    note: 'Monzo Business — bulk payments (limited; verify).'
  },

  // --- international / multi-currency (planned) ---
  {
    id: 'currencycloud',
    name: 'Currencycloud',
    kind: 'bank',
    color: '#2b3a8c',
    initial: 'Cc',
    status: 'coming-soon',
    formats: [],
    note: 'Currencycloud — CSV bulk upload (SEPA / international).'
  }
];

const Banks = {
  BANKS,
  get: (id) => BANKS.find((b) => b.id === id),
  isAvailable: (id) => (BANKS.find((b) => b.id === id) || {}).status === 'available'
};

if (typeof window !== 'undefined') window.Banks = Banks;
if (typeof module !== 'undefined' && module.exports) module.exports = Banks;
