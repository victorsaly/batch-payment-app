/*
 * Dependency-free test runner for the payment-file engine.
 * Run with:  npm test
 *
 * Covers the financially-critical logic: byte-exact reproduction of both
 * Santander layouts, validation rules, and CSV import.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const S = require('../src/santander.js');
const S18 = require('../src/standard18.js');
const ISO = require('../src/iso20022.js');
const F = S.OUTPUT_FORMATS;

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ---------------------------------------------------------------- Bacs format
test('Bacs header line matches the published spec sample', () => {
  const settings = {
    paymentType: 'BACS', debitSortCode: '090122', debitAccountNumber: '11223344',
    creationDate: '2012-12-08', fileLocationId: 'PAYMENT FILES', sequenceNumber: '10',
    paymentDate: '2012-12-10'
  };
  assert.strictEqual(S.buildHeaderLine(settings), 'PAYMENT,HEADER,08122012,PAYMENT FILES,10');
});

test('Bacs payment line matches the published spec sample', () => {
  const settings = {
    paymentType: 'BACS', debitSortCode: '090122', debitAccountNumber: '11223344',
    paymentDate: '2012-12-10'
  };
  const p = { name: 'REDSKY LTD', sortCode: '909090', accountNumber: '55667788',
    amount: '150.50', reference: 'INVOICE 3344', rti: '/123' };
  assert.strictEqual(
    S.buildPaymentLine(settings, p),
    'PAYMENT,BACS,09012211223344,REDSKY LTD,909090,55667788,150.50,10122012,INVOICE 3344,/123'
  );
});

test('Bacs trailer hash total is the value in pence, zero-padded to 15', () => {
  assert.strictEqual(S.hashTotal([{ amount: '50.00' }]), '000000000005000');
  assert.strictEqual(S.hashTotal([{ amount: '150.50' }, { amount: '9.49' }]), '000000000015999');
});

test('Bacs full file is HEADER + PAYMENT + TRAILER, CRLF terminated', () => {
  const settings = {
    paymentType: 'BACS', debitSortCode: '090122', debitAccountNumber: '11223344',
    creationDate: '2012-12-08', fileLocationId: 'PAYMENT FILES', sequenceNumber: '10',
    paymentDate: '2012-12-10'
  };
  const file = S.buildFile(settings, [{ name: 'REDSKY LTD', sortCode: '909090',
    accountNumber: '55667788', amount: '150.50', reference: 'INVOICE 3344', rti: '/123' }]);
  const lines = file.split('\r\n').filter(Boolean);
  assert.strictEqual(lines.length, 3);
  assert.strictEqual(lines[2], 'PAYMENT,TRAILER,000000000015050,1');
  assert.ok(file.endsWith('\r\n'));
});

// ---------------------------------------------------------------- Mixed format
test('Mixed format reproduces the sample fixture byte-for-byte', () => {
  const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'mixed-sample.txt'), 'utf8')
    .replace(/\r\n/g, '\n').replace(/\n+$/, '');
  const rows = S.parseCsv(fixture);
  const payments = rows.map((r) => ({
    name: r[32], sortCode: r[24], accountNumber: r[30], amount: r[16], reference: r[36]
  }));
  // sample payment date is 01012026 (ddmmyyyy) -> 2026-01-01
  const built = S.buildMixedFile({ paymentDate: '2026-01-01' }, payments);
  assert.strictEqual(built, fixture);
});

test('Mixed import auto-detects the wide layout', () => {
  const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'mixed-sample.txt'), 'utf8');
  const imported = S.importPayments(fixture);
  assert.strictEqual(imported.length, 3);
  assert.strictEqual(imported[0].name, 'Test User 01');
  assert.strictEqual(imported[0].sortCode, '100001');
  assert.strictEqual(imported[0].accountNumber, '90000001');
  assert.strictEqual(imported[0].amount, '1000.00');
});

// ---------------------------------------------------------------- Standard 18 (Beta)
test('Standard 18 record is 100 chars with fields in the right positions', () => {
  const settings = { originatorSort: '090122', originatorAccount: '11223344', originatorName: 'ACME LTD' };
  const p = { sortCode: '12-34-56', accountNumber: '12345678', amount: '150.50', reference: 'INV-1001', name: 'Beneficiary Ltd' };
  const rec = S18.buildStandard18Record(settings, p);
  assert.strictEqual(rec.length, 100);
  assert.strictEqual(rec.slice(0, 6), '123456');        // dest sort
  assert.strictEqual(rec.slice(6, 14), '12345678');     // dest account
  assert.strictEqual(rec.slice(14, 15), '0');           // account type
  assert.strictEqual(rec.slice(15, 17), '99');          // transaction code (credit)
  assert.strictEqual(rec.slice(17, 23), '090122');      // origin sort
  assert.strictEqual(rec.slice(23, 31), '11223344');    // origin account
  assert.strictEqual(rec.slice(35, 46), '00000015050'); // amount in pence
  assert.strictEqual(rec.slice(64, 82), 'INV-1001'.padEnd(18, ' '));
  assert.strictEqual(rec.slice(82, 100), 'BENEFICIARY LTD'.padEnd(18, ' '));
});

test('Standard 18 file: one CRLF-terminated 100-char line per payment', () => {
  const settings = { originatorSort: '090122', originatorAccount: '11223344', originatorName: '' };
  const file = S18.buildStandard18File(settings, [
    { sortCode: '123456', accountNumber: '12345678', amount: '10.00', reference: 'A', name: 'X' },
    { sortCode: '654321', accountNumber: '87654321', amount: '5.55', reference: 'B', name: 'Y' }
  ]);
  const lines = file.split('\r\n').filter(Boolean);
  assert.strictEqual(lines.length, 2);
  assert.ok(lines.every((l) => l.length === 100));
});

// ---------------------------------------------------------------- ISO 20022 (pain.001)
test('ISO 20022 builds valid pain.001.001.09 with correct header totals', () => {
  const settings = {
    debtorName: 'My Company Ltd', debtorSort: '090122', debtorAccount: '11223344',
    requestedExecutionDate: '2026-06-30', messageId: 'PB-TEST-1', creationDateTime: '2026-06-27T14:30:00'
  };
  const payments = [
    { name: 'Acme Ltd', sortCode: '12-34-56', accountNumber: '12345678', amount: '150.50', reference: 'INV-1001' },
    { name: 'Blue Oak Ltd', sortCode: '654321', accountNumber: '87654321', amount: '87.00', reference: 'WAGES' }
  ];
  const xml = ISO.buildPain001(settings, payments);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes('urn:iso:std:iso:20022:tech:xsd:pain.001.001.09'));
  assert.strictEqual((xml.match(/<NbOfTxs>2<\/NbOfTxs>/g) || []).length, 2); // GrpHdr + PmtInf
  assert.ok(xml.includes('<CtrlSum>237.50</CtrlSum>'));
  assert.strictEqual((xml.match(/<CdtTrfTxInf>/g) || []).length, 2);
  assert.strictEqual((xml.match(/<CdtTrfTxInf>/g) || []).length, (xml.match(/<\/CdtTrfTxInf>/g) || []).length);
});

test('ISO 20022 places UK sort code + account and amount correctly', () => {
  const settings = { debtorName: 'X Ltd', debtorSort: '090122', debtorAccount: '11223344', requestedExecutionDate: '2026-06-30', messageId: 'M', creationDateTime: '2026-06-27T00:00:00' };
  const xml = ISO.buildPain001(settings, [{ name: 'Acme', sortCode: '123456', accountNumber: '12345678', amount: '10.5', reference: 'R' }]);
  assert.ok(xml.includes('<Cd>GBDSC</Cd>'));
  assert.ok(xml.includes('<MmbId>123456</MmbId>'));      // creditor sort
  assert.ok(xml.includes('<MmbId>090122</MmbId>'));      // debtor sort
  assert.ok(xml.includes('<Id>12345678</Id>'));          // creditor account
  assert.ok(xml.includes('<InstdAmt Ccy="GBP">10.50</InstdAmt>'));
});

test('ISO 20022 XML-escapes names and references', () => {
  const settings = { debtorName: 'A & B', debtorSort: '090122', debtorAccount: '11223344', requestedExecutionDate: '2026-06-30', messageId: 'M', creationDateTime: '2026-06-27T00:00:00' };
  const xml = ISO.buildPain001(settings, [{ name: 'R&D <Co>', sortCode: '123456', accountNumber: '12345678', amount: '5', reference: 'A & "B"' }]);
  assert.ok(xml.includes('<Nm>R&amp;D &lt;Co&gt;</Nm>'));
  assert.ok(xml.includes('A &amp; &quot;B&quot;'));
  assert.ok(!/<Nm>[^<]*&(?!amp;|lt;|gt;|quot;|apos;)/.test(xml)); // no raw unescaped &
});

test('ISO 20022 settings validation: debtor sort 6, account 8, name required', () => {
  assert.ok(ISO.validateIso20022Settings({ debtorName: 'X', debtorSort: '090122', debtorAccount: '11223344' }).valid);
  assert.ok(!ISO.validateIso20022Settings({ debtorName: '', debtorSort: '090122', debtorAccount: '11223344' }).valid);
  assert.ok(!ISO.validateIso20022Settings({ debtorName: 'X', debtorSort: '0901', debtorAccount: '11223344' }).valid);
});

// ---------------------------------------------------------------- validation
test('Field-level errors map to the offending field', () => {
  const r = S.validatePayment(
    { name: '', sortCode: '123', accountNumber: '1', amount: '-5', reference: '' },
    'MULTIBACS', F.BACS_IMPORT);
  assert.ok(r.fieldErrors.name);
  assert.ok(r.fieldErrors.sortCode);
  assert.ok(r.fieldErrors.accountNumber);
  assert.ok(r.fieldErrors.amount);
  assert.ok(r.fieldErrors.reference);
  assert.strictEqual(r.valid, false);
});

test('A clean Bacs row validates with no field errors', () => {
  const r = S.validatePayment(
    { name: 'ACME LTD', sortCode: '12-34-56', accountNumber: '12345678', amount: '150.50', reference: 'INV1' },
    'BACS', F.BACS_IMPORT);
  assert.strictEqual(r.valid, true);
  assert.strictEqual(Object.keys(r.fieldErrors).length, 0);
});

test('Amount must be pounds and pence (rejects 3 decimals)', () => {
  const bad = S.validatePayment({ name: 'X', sortCode: '123456', accountNumber: '12345678', amount: '10.123', reference: 'R' }, 'BACS', F.BACS_IMPORT);
  assert.ok(bad.fieldErrors.amount);
  const ok = S.validatePayment({ name: 'X', sortCode: '123456', accountNumber: '12345678', amount: '10.50', reference: 'R' }, 'BACS', F.BACS_IMPORT);
  assert.ok(!ok.fieldErrors.amount);
});

test('MULTIBACS requires a reference; BACS does not', () => {
  const base = { name: 'X', sortCode: '123456', accountNumber: '12345678', amount: '10.00', reference: '' };
  assert.strictEqual(S.validatePayment(base, 'MULTIBACS', F.BACS_IMPORT).valid, false);
  assert.strictEqual(S.validatePayment(base, 'BACS', F.BACS_IMPORT).valid, true);
});

test('Mixed reference is optional (warns) and keeps case', () => {
  const r = S.validatePayment({ name: 'Test User 01', sortCode: '100001', accountNumber: '90000001', amount: '1000.00' }, null, F.MIXED);
  assert.strictEqual(r.valid, true);
  assert.ok(r.fieldWarnings.reference);
  assert.strictEqual(S.sanitizeMixedText('Test, User 01'), 'Test User 01');
});

test('Settings validation: Bacs needs debit account + sequence; Mixed needs only a date', () => {
  const bacs = { paymentType: 'BACS', debitSortCode: '090122', debitAccountNumber: '11223344', sequenceNumber: '1', paymentDate: '2026-01-01' };
  assert.ok(S.validateSettings(bacs, F.BACS_IMPORT).valid);
  assert.ok(!S.validateSettings({ ...bacs, debitSortCode: '12' }, F.BACS_IMPORT).valid);
  assert.ok(S.validateSettings({ paymentDate: '2026-01-01' }, F.MIXED).valid);
  assert.ok(!S.validateSettings({}, F.MIXED).valid);
});

// ---------------------------------------------------------------- import / template
test('Excel-style CSV import strips currency symbols and detects headers', () => {
  const csv = 'Beneficiary Name,Sort Code,Account,Amount,Reference\nBob Ltd,11-22-33,87654321,"£1,234.56",WAGES';
  const imp = S.importPayments(csv);
  assert.strictEqual(imp.length, 1);
  assert.strictEqual(imp[0].amount, '1234.56');
  assert.strictEqual(imp[0].accountNumber, '87654321');
});

test('Template is valid and re-imports to its example rows', () => {
  const tpl = S.buildTemplate();
  assert.ok(tpl.startsWith('Beneficiary Name,Sort Code,Account Number,Amount,Reference'));
  assert.strictEqual(S.importPayments(tpl).length, 2);
});

// ---------------------------------------------------------------- safety net
// The src/*.js browser scripts share one global scope at runtime, so a top-level
// const/let/class with the same name in two files is a fatal SyntaxError that
// ESLint can't see (it lints per-file). This guard catches that class of bug.
test('No top-level const/let/class name collides across browser scripts', () => {
  const files = ['banks.js', 'santander.js', 'standard18.js', 'iso20022.js', 'renderer.js'];
  const seen = {};
  const dupes = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
    const names = (src.match(/^(?:const|let|class)\s+([A-Za-z_$][\w$]*)/gm) || [])
      .map((m) => m.replace(/^(?:const|let|class)\s+/, ''));
    for (const n of names) {
      if (seen[n]) dupes.push(`${n} (${seen[n]} & ${f})`);
      else seen[n] = f;
    }
  }
  assert.strictEqual(dupes.length, 0, 'Duplicate top-level declarations: ' + dupes.join(', '));
});

// ---------------------------------------------------------------- run
let failures = 0;
for (const t of tests) {
  try { t.fn(); passed++; console.log('  ✓ ' + t.name); }
  catch (err) { failures++; console.log('  ✗ ' + t.name + '\n      ' + err.message); }
}
console.log(`\n${passed}/${tests.length} passed${failures ? `, ${failures} FAILED` : ''}`);
process.exit(failures ? 1 : 0);
