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
 */
const BANKS = [
  {
    id: 'santander',
    name: 'Santander',
    color: '#ec0000',
    initial: 'S',
    status: 'available',
    formats: ['BACS_IMPORT', 'MIXED'],
    note: 'Santander Connect — Bacs payment import (HEADER/PAYMENT/TRAILER) and the wide “mixed payments” layout.'
  },
  {
    id: 'bacs18',
    name: 'Standard 18',
    color: '#3b5566',
    initial: '18',
    status: 'available',
    formats: ['STANDARD18'],
    note: 'Bacs Standard 18 — the cross-bank fixed-width credit file accepted by many UK banks and bureaus.'
  },
  {
    id: 'iso20022',
    name: 'ISO 20022',
    color: '#1f6f6f',
    initial: 'XML',
    status: 'available',
    formats: ['ISO20022', 'SEPA'],
    note: 'ISO 20022 pain.001 (XML) — the modern cross-bank standard (HSBC, Barclays, Lloyds, NatWest). UK domestic GBP + SEPA euro (IBAN); verify with your bank.'
  },
  {
    id: 'lloyds',
    name: 'Lloyds',
    color: '#024731',
    initial: 'L',
    status: 'coming-soon',
    formats: [],
    note: 'Lloyds Commercial Banking Online — CSV templates (BACS & Faster Payment), Bacs Standard 18, and ISO 20022 XML.'
  },
  {
    id: 'barclays',
    name: 'Barclays',
    color: '#00aeef',
    initial: 'B',
    status: 'coming-soon',
    formats: [],
    note: 'Barclays.Net / iPortal — Bacs Standard 18, ISO 20022 XML, and mapped CSV.'
  },
  {
    id: 'hsbc',
    name: 'HSBC',
    color: '#db0011',
    initial: 'H',
    status: 'coming-soon',
    formats: [],
    note: 'HSBCnet — Bacs Standard 18 (BACS + Faster Payments) and ISO 20022 XML (all payments incl. SEPA).'
  },
  {
    id: 'natwest',
    name: 'NatWest',
    color: '#5a2d81',
    initial: 'N',
    status: 'coming-soon',
    formats: [],
    note: 'NatWest Bankline — Bacs Standard 18, Bankline CSV, and ISO 20022 XML (pain.001.001.09).'
  },

  // --- more UK high-street banks (planned) ---
  {
    id: 'tsb',
    name: 'TSB',
    color: '#1c3f94',
    initial: 'TSB',
    status: 'coming-soon',
    formats: [],
    note: 'TSB — Bacs Standard 18 and CSV (varies).'
  },
  {
    id: 'coop',
    name: 'Co-operative',
    color: '#00a1de',
    initial: 'Co',
    status: 'coming-soon',
    formats: [],
    note: 'The Co-operative Bank — Bacs Standard 18 and CSV.'
  },
  {
    id: 'nationwide',
    name: 'Nationwide',
    color: '#15144b',
    initial: 'NW',
    status: 'coming-soon',
    formats: [],
    note: 'Nationwide — Bacs Standard 18 / CSV (business).'
  },
  {
    id: 'metro',
    name: 'Metro Bank',
    color: '#002d72',
    initial: 'M',
    status: 'coming-soon',
    formats: [],
    note: 'Metro Bank — Bacs Standard 18 and CSV.'
  },

  // --- fintech / business accounts (planned) ---
  {
    id: 'revolut',
    name: 'Revolut',
    color: '#0666eb',
    initial: 'R',
    status: 'coming-soon',
    formats: [],
    note: 'Revolut Business — CSV template, XML, and BACS-format (up to ~1,000 entries/file).'
  },
  {
    id: 'wise',
    name: 'Wise',
    color: '#163300',
    initial: 'W',
    status: 'coming-soon',
    formats: [],
    note: 'Wise — CSV and XLSX batch templates (Faster Payments + international).'
  },
  {
    id: 'tide',
    name: 'Tide',
    color: '#4050ff',
    initial: 'T',
    status: 'coming-soon',
    formats: [],
    note: 'Tide — bulk payment CSV (where supported).'
  },
  {
    id: 'starling',
    name: 'Starling',
    color: '#6935d3',
    initial: 'St',
    status: 'coming-soon',
    formats: [],
    note: 'Starling Bank — bulk payments (limited; verify).'
  },
  {
    id: 'monzo',
    name: 'Monzo',
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
