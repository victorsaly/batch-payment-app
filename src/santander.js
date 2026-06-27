/*
 * santander.js — generates the Santander Connect "Bacs payment import" file.
 * ---------------------------------------------------------------------------
 * Built directly from Santander's published spec:
 *   "Santander Connect Bacs payment import specification" (ref 60 20 273 AUG 18)
 *
 * The file is COMMA-SEPARATED text saved as a .txt and has THREE record types:
 *
 *   HEADER  : PAYMENT,HEADER,<creationDate ddmmyyyy>,<fileLocationId>,<seqNo>
 *   PAYMENT : PAYMENT,<BACS|MULTIBACS>,<debit 14n>,<name 35>,<sort 6n>,
 *             <account 8n>,<amount eg 150.50>,<paymentDate ddmmyyyy>,
 *             <reference 18>,<rti 4>
 *   TRAILER : PAYMENT,TRAILER,<hashTotal 15n pence>,<recordCount>
 *
 * Sample valid file from the spec:
 *   PAYMENT,HEADER,08122012,PAYMENT FILES,10
 *   PAYMENT,BACS,09012211223344,REDSKY LTD,909090,55667788,150.50,10122012,INVOICE 3344,/123
 *   PAYMENT,TRAILER,000000000005000,50
 *
 * Anything you might need to tweak lives in SPEC below.
 */
const SPEC = {
  fileType: 'PAYMENT',
  // Characters allowed in free-format fields (name / reference). Uppercase only.
  freeTextAllowed: /[^A-Z0-9 ./&-]/g,
  // RTI reference allows A-Z, 0-9, hyphen, full stop, solidus (no space, no &).
  rtiAllowed: /[^A-Z0-9./-]/g,
  maxNameLength: 35,        // only first 18 are passed to Bacs (we warn past 18)
  nameToBacs: 18,
  maxReferenceLength: 18,
  rtiLength: 4,
  lineEnding: '\r\n',
  fileExtension: 'txt'
};

const PAYMENT_TYPES = { SINGLE: 'BACS', MULTIPLE: 'MULTIBACS' };

// The app can emit two different Santander file layouts.
const OUTPUT_FORMATS = {
  BACS_IMPORT: 'BACS_IMPORT',   // the Connect Bacs import spec (HEADER/PAYMENT/TRAILER)
  MIXED: 'MIXED'                // the wide 85-column "mixed payments" layout
};

/*
 * MIXED layout — reverse-engineered byte-for-byte from a real Santander
 * "mixed payments" sample (test-data.txt). 85 comma-separated columns per row,
 * headerless, LF line endings, no trailing newline, mixed-case text preserved.
 * Each row is one payment; data sits at these fixed column indexes:
 *
 *   [3]=type code "01"   [8]=reference   [12]=14-digit sequential id
 *   [16]=amount          [18]=date ddmmyyyy   [24]=sort code (6)
 *   [30]=account (8)     [32]=beneficiary name   [36]=reference
 *
 * Sample row:
 *   ,,,01,,,,,Test Payment,,,,00000000000001,,,,1000.00,,01012026,,,,,,100001,,,,,,90000001,,Test User 01,,,,Test Payment,,,,...
 */
const MIXED = {
  columns: 85,
  typeCode: '01',
  idx: { type: 3, ref1: 8, seq: 12, amount: 16, date: 18, sort: 24, account: 30, name: 32, ref2: 36 },
  seqLength: 14,
  lineEnding: '\n',
  trailingNewline: false,
  fileExtension: 'txt',
  illegal: /[,\r\n]/g       // only the delimiter / line breaks must go; case is kept
};

// Mixed format: strip commas and line breaks (the only characters that would
// corrupt the row), keep everything else including case and spaces.
function sanitizeMixedText(value, maxLen) {
  let s = String(value == null ? '' : value).replace(MIXED.illegal, '').trim();
  if (maxLen != null) s = s.slice(0, maxLen);
  return s;
}

// ----------------------------- helpers ------------------------------------

function onlyDigits(s) {
  return String(s == null ? '' : s).replace(/\D/g, '');
}

// Uppercase, strip any character the bank won't accept, then truncate.
function sanitizeFreeText(value, maxLen) {
  let s = String(value == null ? '' : value).toUpperCase().replace(SPEC.freeTextAllowed, '');
  if (maxLen != null) s = s.slice(0, maxLen);
  return s.trim();
}

function sanitizeRti(value) {
  if (!value) return '';
  return String(value).toUpperCase().replace(SPEC.rtiAllowed, '').slice(0, SPEC.rtiLength);
}

function formatSortCode(sortCode) {
  return onlyDigits(sortCode);
}

function formatAmount(amount) {
  const n = Number(amount);
  if (!isFinite(n)) return '';
  return n.toFixed(2);
}

// 'YYYY-MM-DD' (from an <input type=date>) -> 'ddmmyyyy'. Empty stays empty.
function toDDMMYYYY(isoDate) {
  if (!isoDate) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return onlyDigits(isoDate); // already ddmmyyyy or similar
  return m[3] + m[2] + m[1];
}

// 'ddmmyyyy' -> 'YYYY-MM-DD' for putting back into an <input type=date>.
function fromDDMMYYYY(d) {
  const s = onlyDigits(d);
  if (s.length !== 8) return '';
  return `${s.slice(4, 8)}-${s.slice(2, 4)}-${s.slice(0, 2)}`;
}

function todayISO() {
  const now = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

// A ready-to-fill CSV the user can open in Excel, paste rows into, and import.
// Headers match what importPayments() auto-detects.
function buildTemplate() {
  return [
    'Beneficiary Name,Sort Code,Account Number,Amount,Reference',
    'ACME LTD,12-34-56,12345678,150.00,INV-1001',
    'EXAMPLE PAYEE,09-01-22,11223344,75.50,WAGES JAN'
  ].join('\r\n') + '\r\n';
}

function totalAmount(payments) {
  return payments.reduce((sum, p) => {
    const n = Number(p.amount);
    return sum + (isFinite(n) ? n : 0);
  }, 0);
}

// Hash total = total value in PENCE, zero-padded to 15 numeric characters.
function hashTotal(payments) {
  const pence = Math.round(totalAmount(payments) * 100);
  return String(pence).padStart(15, '0');
}

// --------------------------- validation -----------------------------------

// File-level settings shared by every payment in the run.
// The mixed format only needs a payment date (no header/debit account in-file).
function validateSettings(s, format) {
  const errors = [];
  if (!s.paymentDate) errors.push('Payment date is required');

  if (format === OUTPUT_FORMATS.MIXED) return { errors, valid: errors.length === 0 };

  if (s.paymentType !== PAYMENT_TYPES.SINGLE && s.paymentType !== PAYMENT_TYPES.MULTIPLE)
    errors.push('Choose a payment type (single or multiple)');
  if (onlyDigits(s.debitSortCode).length !== 6) errors.push('Debit sort code must be 6 digits');
  if (onlyDigits(s.debitAccountNumber).length !== 8) errors.push('Debit account number must be 8 digits');
  const seq = Number(s.sequenceNumber);
  if (!Number.isInteger(seq) || seq < 1 || seq > 9999)
    errors.push('File sequence number must be a whole number from 1 to 9999');
  return { errors, valid: errors.length === 0 };
}

// Bundle field-keyed errors/warnings into the shape the UI consumes. Each of
// fieldErrors / fieldWarnings maps a field name (name, sortCode, accountNumber,
// amount, reference, rti) to a single message, so the table can highlight the
// exact input that's wrong.
function result(fieldErrors, fieldWarnings) {
  return {
    fieldErrors,
    fieldWarnings,
    errors: Object.values(fieldErrors),
    warnings: Object.values(fieldWarnings),
    valid: Object.keys(fieldErrors).length === 0
  };
}

// Shared numeric/account checks used by both formats.
function coreFieldChecks(p, fe) {
  if (onlyDigits(p.sortCode).length !== 6) fe.sortCode = 'Sort code must be 6 digits';
  if (onlyDigits(p.accountNumber).length !== 8) fe.accountNumber = 'Account number must be 8 digits';

  const amountNum = Number(p.amount);
  if (!p.amount && p.amount !== 0) fe.amount = 'Amount is required';
  else if (!isFinite(amountNum)) fe.amount = 'Amount must be a number';
  else if (amountNum <= 0) fe.amount = 'Amount must be greater than 0';
  else if (!/^\d+(\.\d{1,2})?$/.test(String(p.amount).trim()))
    fe.amount = 'Amount must be pounds and pence, e.g. 150.50';
}

// One beneficiary/payment row. `paymentType` decides if reference is mandatory
// (Bacs format); `format` selects which layout's rules apply.
function validatePayment(p, paymentType, format) {
  if (format === OUTPUT_FORMATS.MIXED) return validateMixedPayment(p);

  const fe = {}, fw = {};
  const rawName = (p.name || '').trim();
  const name = sanitizeFreeText(p.name, SPEC.maxNameLength);
  const rawRef = (p.reference || '').trim();
  const reference = sanitizeFreeText(p.reference, SPEC.maxReferenceLength);

  if (!name) fe.name = 'Name is required (allowed: A–Z 0–9 . - / & space)';
  else if (rawName.toUpperCase().replace(/\s+/g, ' ') !== name)
    fw.name = 'Will be cleaned to: ' + name;
  if (rawName.length > SPEC.nameToBacs)
    fw.name = (fw.name ? fw.name + '. ' : '') + `Only the first ${SPEC.nameToBacs} characters reach Bacs`;

  coreFieldChecks(p, fe);

  const refRequired = paymentType === PAYMENT_TYPES.MULTIPLE;
  if (refRequired && !reference) fe.reference = 'Reference is required for MULTIBACS payments';
  else if (rawRef && rawRef.toUpperCase() !== reference)
    fw.reference = 'Will be cleaned to: ' + (reference || '(empty)');

  if (p.rti) {
    const rti = sanitizeRti(p.rti);
    if (!rti.startsWith('/')) fw.rti = 'RTI should start with "/" (e.g. /123)';
    else if (rti !== String(p.rti).toUpperCase()) fw.rti = 'Will be cleaned to: ' + rti;
  }

  return result(fe, fw);
}

// Mixed format: name/sort/account/amount required; reference optional (warns).
function validateMixedPayment(p) {
  const fe = {}, fw = {};
  const name = sanitizeMixedText(p.name);
  const rawRef = (p.reference || '').trim();

  if (!name) fe.name = 'Name is required';
  else if ((p.name || '').includes(',')) fw.name = 'Commas will be removed';

  coreFieldChecks(p, fe);

  if (!rawRef) fw.reference = 'No reference — both reference columns will be blank';
  else if (rawRef.includes(',')) fw.reference = 'Commas will be removed';

  return result(fe, fw);
}

function validateBatch(payments, paymentType, format) {
  return payments.map((p, i) => ({ index: i, ...validatePayment(p, paymentType, format) }));
}

// --------------------------- file output ----------------------------------

function buildHeaderLine(s) {
  return [
    SPEC.fileType,
    'HEADER',
    toDDMMYYYY(s.creationDate || todayISO()),
    sanitizeFreeText(s.fileLocationId || '', 18),
    String(Number(s.sequenceNumber))
  ].join(',');
}

function buildPaymentLine(s, p) {
  const debit = onlyDigits(s.debitSortCode) + onlyDigits(s.debitAccountNumber); // 14n
  return [
    SPEC.fileType,
    s.paymentType,
    debit,
    sanitizeFreeText(p.name, SPEC.maxNameLength),
    onlyDigits(p.sortCode),
    onlyDigits(p.accountNumber),
    formatAmount(p.amount),
    toDDMMYYYY(s.paymentDate),
    sanitizeFreeText(p.reference, SPEC.maxReferenceLength),
    sanitizeRti(p.rti)
  ].join(',');
}

function buildTrailerLine(payments) {
  return [SPEC.fileType, 'TRAILER', hashTotal(payments), String(payments.length)].join(',');
}

// Returns the full file contents (string). `settings` = file-level fields.
function buildFile(settings, payments) {
  const lines = [buildHeaderLine(settings)];
  for (const p of payments) lines.push(buildPaymentLine(settings, p));
  lines.push(buildTrailerLine(payments));
  return lines.join(SPEC.lineEnding) + SPEC.lineEnding;
}

// --------------------- mixed-format file output ---------------------------

function buildMixedLine(p, seqNum, dateDDMMYYYY) {
  const f = new Array(MIXED.columns).fill('');
  const I = MIXED.idx;
  const ref = sanitizeMixedText(p.reference);
  f[I.type] = MIXED.typeCode;
  f[I.ref1] = ref;
  f[I.seq] = String(seqNum).padStart(MIXED.seqLength, '0');
  f[I.amount] = formatAmount(p.amount);
  f[I.date] = dateDDMMYYYY;
  f[I.sort] = onlyDigits(p.sortCode);
  f[I.account] = onlyDigits(p.accountNumber);
  f[I.name] = sanitizeMixedText(p.name);
  f[I.ref2] = ref;
  return f.join(',');
}

// settings only needs `paymentDate`. Sequence ids are 1..N within the file.
function buildMixedFile(settings, payments) {
  const date = toDDMMYYYY(settings.paymentDate);
  const lines = payments.map((p, i) => buildMixedLine(p, i + 1, date));
  return lines.join(MIXED.lineEnding) + (MIXED.trailingNewline ? MIXED.lineEnding : '');
}

// Dispatch to the right builder for the chosen output format.
function buildOutput(format, settings, payments) {
  return format === OUTPUT_FORMATS.MIXED
    ? buildMixedFile(settings, payments)
    : buildFile(settings, payments);
}

// --------------------------- import ---------------------------------------
// Imports a simple beneficiary list (e.g. your existing Excel export saved as
// CSV): name, sort code, account number, amount, reference. Header optional.

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

function importPayments(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];

  // A generated MIXED file: wide rows with type code "01" at column index 3.
  const isMixedRow = (r) => r.length >= 37 && (r[MIXED.idx.type] || '').trim() === MIXED.typeCode
    && (r[MIXED.idx.name] || '').trim() !== '';
  if (rows.some(isMixedRow)) {
    const I = MIXED.idx;
    return rows.filter(isMixedRow).map(r => ({
      name: (r[I.name] || '').trim(),
      sortCode: (r[I.sort] || '').trim(),
      accountNumber: (r[I.account] || '').trim(),
      amount: (r[I.amount] || '').trim(),
      reference: (r[I.ref2] || r[I.ref1] || '').trim()
    }));
  }

  // Skip a Santander HEADER/TRAILER if someone re-imports a generated file.
  const isControl = (r) => /^payment$/i.test((r[0] || '').trim()) &&
    /^(header|trailer)$/i.test((r[1] || '').trim());

  // A generated PAYMENT line: PAYMENT,BACS,<14n>,name,sort,account,amount,date,ref,rti
  const isGeneratedPayment = (r) => /^payment$/i.test((r[0] || '').trim()) &&
    /^(bacs|multibacs)$/i.test((r[1] || '').trim());

  if (rows.some(isGeneratedPayment)) {
    return rows.filter(isGeneratedPayment).map(r => ({
      name: (r[3] || '').trim(),
      sortCode: (r[4] || '').trim(),
      accountNumber: (r[5] || '').trim(),
      amount: (r[6] || '').trim(),
      reference: (r[8] || '').trim(),
      rti: (r[9] || '').trim()
    }));
  }

  const header = rows[0].map(h => h.trim().toLowerCase());
  const looksLikeHeader = header.some(h => /name|sort|account|amount|reference|payee|ref/.test(h));
  const find = (...keys) => header.findIndex(h => keys.some(k => h.includes(k)));

  let idx = { name: 0, sort: 1, account: 2, amount: 3, reference: 4 };
  let dataRows = rows.filter(r => !isControl(r));
  if (looksLikeHeader) {
    idx = {
      name: find('beneficiary', 'payee', 'name'),
      sort: find('sort'),
      account: find('account'),
      amount: find('amount', 'value'),
      reference: find('reference', 'ref')
    };
    dataRows = dataRows.slice(1);
  }
  const col = (r, i) => (i >= 0 && i < r.length ? r[i].trim() : '');
  return dataRows.map(r => ({
    name: col(r, idx.name),
    sortCode: col(r, idx.sort),
    accountNumber: col(r, idx.account),
    amount: col(r, idx.amount).replace(/[£,]/g, ''),
    reference: col(r, idx.reference)
  }));
}

const Santander = {
  SPEC, MIXED, PAYMENT_TYPES, OUTPUT_FORMATS,
  validateSettings, validatePayment, validateMixedPayment, validateBatch,
  buildFile, buildHeaderLine, buildPaymentLine, buildTrailerLine,
  buildMixedFile, buildMixedLine, buildOutput,
  importPayments, parseCsv, buildTemplate,
  sanitizeFreeText, sanitizeMixedText, sanitizeRti, formatSortCode, formatAmount,
  toDDMMYYYY, fromDDMMYYYY, todayISO, totalAmount, hashTotal
};

// Browser (renderer) gets a global; Node (tests) can require() it.
if (typeof window !== 'undefined') window.Santander = Santander;
if (typeof module !== 'undefined' && module.exports) module.exports = Santander;
