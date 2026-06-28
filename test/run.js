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
const os = require('os');
const { execFileSync } = require('child_process');

const S = require('../src/santander.js');
const S18 = require('../src/standard18.js');
const ISO = require('../src/iso20022.js');
const Sepa = require('../src/sepa.js');
const Modulus = require('../src/modulus.js');
const F = S.OUTPUT_FORMATS;

let passed = 0;
let skipped = 0;
const SKIP = Symbol('skip');               // a test fn may `return SKIP` to skip
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ---- XSD validation helpers (libxml2 / xmllint) ----------------------------
// The official ISO 20022 schemas are vendored under test/schemas/. Validation
// shells out to xmllint so the test runner stays dependency-free. When xmllint
// isn't installed the relevant tests skip (CI installs libxml2-utils so they
// always run there).
const HAS_XMLLINT = (() => {
  try { execFileSync('xmllint', ['--version'], { stdio: 'ignore' }); return true; }
  catch (_) { return false; }
})();

let xsdTmpSeq = 0;
function validateXsd(xsdName, xml) {
  const tmp = path.join(os.tmpdir(), `paybatch-xsd-${process.pid}-${xsdTmpSeq++}.xml`);
  fs.writeFileSync(tmp, xml, 'utf8');
  try {
    execFileSync('xmllint', ['--noout', '--schema', path.join(__dirname, 'schemas', xsdName), tmp], { stdio: 'pipe' });
    return { valid: true };
  } catch (err) {
    return { valid: false, output: String((err && err.stderr) || (err && err.message) || err) };
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
}

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

// ---------------------------------------------------------------- SEPA (pain.001.001.03)
test('SEPA IBAN check accepts valid IBANs and rejects tampered ones', () => {
  assert.ok(Sepa.isValidIban('GB82 WEST 1234 5698 7654 32'));
  assert.ok(Sepa.isValidIban('DE89370400440532013000'));
  assert.ok(Sepa.isValidIban('FR1420041010050500013M02606'));
  assert.ok(!Sepa.isValidIban('DE89370400440532013001'));   // tampered check digit
  assert.ok(!Sepa.isValidIban('GB00WEST12345698765432'));   // bad checksum
  assert.ok(!Sepa.isValidIban('notaniban'));
});

test('SEPA BIC check accepts 8/11-char BICs and rejects malformed ones', () => {
  assert.ok(Sepa.isValidBic('DEUTDEFF'));
  assert.ok(Sepa.isValidBic('DEUTDEFF500'));
  assert.ok(!Sepa.isValidBic('DEUT1'));
  assert.ok(!Sepa.isValidBic('DEUTDEFF5'));   // 9 chars
});

test('SEPA builds valid pain.001.001.03 with EUR amounts and IBANs', () => {
  const settings = {
    debtorName: 'My Co', debtorIban: 'DE89370400440532013000', debtorBic: '',
    requestedExecutionDate: '2026-06-30', messageId: 'PB1', creationDateTime: '2026-06-27T14:30:00'
  };
  const payments = [
    { name: 'Acme GmbH', iban: 'DE89370400440532013000', bic: 'DEUTDEFF', amount: '150.50', reference: 'INV-1' },
    { name: 'Béta & Co', iban: 'FR1420041010050500013M02606', bic: '', amount: '87.00', reference: 'R&D' }
  ];
  const xml = Sepa.buildSepaPain001(settings, payments);
  assert.ok(xml.includes('urn:iso:std:iso:20022:tech:xsd:pain.001.001.03'));
  assert.ok(xml.includes('<Cd>SEPA</Cd>'));
  assert.ok(xml.includes('<InstdAmt Ccy="EUR">150.50</InstdAmt>'));
  assert.ok(xml.includes('<IBAN>DE89370400440532013000</IBAN>'));
  assert.ok(xml.includes('<CtrlSum>237.50</CtrlSum>'));
  assert.strictEqual((xml.match(/<CdtTrfTxInf>/g) || []).length, 2);
  assert.ok(xml.includes('Béta &amp; Co'));                 // XML-escaped
  assert.ok(xml.includes('<Id>NOTPROVIDED</Id>'));          // IBAN-only debtor agent
});

test('SEPA row validation: name + valid IBAN required, BIC optional', () => {
  const ok = Sepa.validateSepaPayment({ name: 'X', iban: 'DE89370400440532013000', amount: '10.00' });
  assert.ok(ok.valid);
  assert.ok(Sepa.validateSepaPayment({ name: '', iban: 'DE89370400440532013000', amount: '10' }).fieldErrors.name);
  assert.ok(Sepa.validateSepaPayment({ name: 'X', iban: 'DE0000', amount: '10' }).fieldErrors.iban);
  assert.ok(Sepa.validateSepaPayment({ name: 'X', iban: 'DE89370400440532013000', bic: 'BAD', amount: '10' }).fieldErrors.bic);
});

// ---------------------------------------------------------------- column mapping
test('analyzeImport suggests columns from a re-ordered header CSV', () => {
  const csv = 'Amount,Reference,Sort Code,Account Number,Beneficiary Name\n'
    + '"£1,234.56",WAGES,11-22-33,87654321,Bob Ltd';
  const a = S.analyzeImport(csv);
  assert.strictEqual(a.generated, false);
  assert.strictEqual(a.hasHeader, true);
  assert.strictEqual(a.suggestion.name, 4);
  assert.strictEqual(a.suggestion.sort, 2);
  assert.strictEqual(a.suggestion.account, 3);
  assert.strictEqual(a.suggestion.amount, 0);
  assert.strictEqual(a.suggestion.reference, 1);
  assert.strictEqual(a.dataRows.length, 1);
});

test('analyzeImport detects IBAN/BIC columns for SEPA-style files', () => {
  const csv = 'Name,IBAN,BIC,Amount,Reference\nAcme,DE89370400440532013000,DEUTDEFF,10.00,R1';
  const a = S.analyzeImport(csv);
  assert.strictEqual(a.suggestion.iban, 1);
  assert.strictEqual(a.suggestion.bic, 2);
});

test('analyzeImport returns generated:true for a file PayBatch made', () => {
  const built = S.buildFile(
    { paymentType: 'BACS', debitSortCode: '090122', debitAccountNumber: '11223344', creationDate: '2012-12-08', fileLocationId: 'X', sequenceNumber: '1', paymentDate: '2012-12-10' },
    [{ name: 'REDSKY LTD', sortCode: '909090', accountNumber: '55667788', amount: '150.50', reference: 'INV' }]);
  const a = S.analyzeImport(built);
  assert.strictEqual(a.generated, true);
  assert.strictEqual(a.payments.length, 1);
});

test('rowsToPayments applies a custom mapping and cleans the amount', () => {
  const rows = [['Bob Ltd', 'WAGES', '11-22-33', '87654321', '£1,234.56']];
  const out = S.rowsToPayments(rows, { name: 0, reference: 1, sort: 2, account: 3, amount: 4, iban: -1, bic: -1 });
  assert.deepStrictEqual(out[0], { name: 'Bob Ltd', amount: '1234.56', reference: 'WAGES', sortCode: '11-22-33', accountNumber: '87654321' });
});

// ---------------------------------------------------------------- XSD conformance
// Prove the generated XML is valid against the *official* ISO 20022 schemas,
// not just our own structural assertions. This catches element ordering,
// cardinality and datatype regressions that string checks would miss.
test('ISO 20022 output validates against the official pain.001.001.09 XSD', () => {
  if (!HAS_XMLLINT) return SKIP;
  const settings = {
    debtorName: 'My Company Ltd', debtorSort: '090122', debtorAccount: '11223344',
    requestedExecutionDate: '2026-06-30', messageId: 'PB-TEST-1', creationDateTime: '2026-06-27T14:30:00'
  };
  // Include characters that must be XML-escaped, to prove escaping stays valid.
  const payments = [
    { name: 'Acme Ltd', sortCode: '12-34-56', accountNumber: '12345678', amount: '150.50', reference: 'INV-1001' },
    { name: 'R&D <Co> "Ltd"', sortCode: '654321', accountNumber: '87654321', amount: '87.00', reference: 'WAGES & BONUS' }
  ];
  const r = validateXsd('pain.001.001.09.xsd', ISO.buildPain001(settings, payments));
  assert.ok(r.valid, 'ISO 20022 XML failed schema validation:\n' + r.output);
});

test('SEPA output validates against the official pain.001.001.03 XSD', () => {
  if (!HAS_XMLLINT) return SKIP;
  const settings = {
    debtorName: 'My Co', debtorIban: 'DE89370400440532013000', debtorBic: '',
    requestedExecutionDate: '2026-06-30', messageId: 'PB1', creationDateTime: '2026-06-27T14:30:00'
  };
  const payments = [
    { name: 'Acme GmbH', iban: 'DE89370400440532013000', bic: 'DEUTDEFF', amount: '150.50', reference: 'INV-1' },
    { name: 'Béta & Co <X>', iban: 'FR1420041010050500013M02606', bic: '', amount: '87.00', reference: 'R&D "2026"' }
  ];
  const r = validateXsd('pain.001.001.03.xsd', Sepa.buildSepaPain001(settings, payments));
  assert.ok(r.valid, 'SEPA XML failed schema validation:\n' + r.output);
});

// ---------------------------------------------------------------- modulus check
// The official VocaLink test cases (the canonical set covering MOD10/MOD11/DBLAL
// and the exceptions). These prove the algorithm + bundled weight tables.
test('Modulus check passes all official VocaLink valid test cases', () => {
  const valid = [
    ['180002', '00000190'], ['309070', '02355688'], ['086090', '06774744'], ['938611', '07806039'],
    ['871427', '09123496'], ['074456', '11104102'], ['074456', '12345112'], ['309070', '12345668'],
    ['309070', '12345677'], ['827101', '28748352'], ['070116', '34012583'], ['200915', '41011166'],
    ['938600', '42368003'], ['871427', '46238510'], ['872427', '46238510'], ['938063', '55065200'],
    ['202959', '63748472'], ['134020', '63849203'], ['118765', '64371389'], ['089999', '66374958'],
    ['820000', '73688637'], ['827999', '73988638'], ['107999', '88837491'], ['871427', '99123496'],
    ['309070', '99345694'], ['772798', '99345694']
  ];
  for (const [s, a] of valid) {
    const r = Modulus.check(s, a);
    assert.ok(r.checked && r.valid, `expected VALID: ${s} ${a} → ${JSON.stringify(r)}`);
  }
});

test('Modulus check rejects all official VocaLink invalid test cases', () => {
  const invalid = [
    ['938063', '15763217'], ['938063', '15764264'], ['938063', '15764273'], ['203099', '58716970'],
    ['118765', '64371388'], ['089999', '66374959'], ['203099', '66831036'], ['107999', '88837493']
  ];
  for (const [s, a] of invalid) {
    const r = Modulus.check(s, a);
    assert.ok(r.checked && !r.valid, `expected INVALID: ${s} ${a} → ${JSON.stringify(r)}`);
  }
});

test('Modulus check returns checked:false for an unlisted sort code', () => {
  // 000000 is not in any weight-table range → cannot be checked.
  const r = Modulus.check('000000', '12345678');
  assert.strictEqual(r.checked, false);
  assert.strictEqual(r.valid, true);
});

// ---------------------------------------------------------------- safety net
// The core engine scripts each assign to a window global and are also imported
// by the React renderer (src/renderer-src/core.js). A top-level const/let/class
// with the same name across two of them would collide if ever loaded as classic
// scripts; this guard catches that class of bug. (The old monolithic
// renderer.js was retired in the React migration.)
test('No top-level const/let/class name collides across engine scripts', () => {
  const files = ['banks.js', 'santander.js', 'standard18.js', 'iso20022.js', 'sepa.js', 'modulus-data.js', 'modulus.js'];
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
  try {
    if (t.fn() === SKIP) { skipped++; console.log('  ⊘ ' + t.name + ' (skipped)'); }
    else { passed++; console.log('  ✓ ' + t.name); }
  }
  catch (err) { failures++; console.log('  ✗ ' + t.name + '\n      ' + err.message); }
}
console.log(`\n${passed}/${tests.length} passed${skipped ? `, ${skipped} skipped` : ''}${failures ? `, ${failures} FAILED` : ''}`);
if (skipped) console.log('  (skipped tests need xmllint — `brew install libxml2` / `apt-get install libxml2-utils`)');
process.exit(failures ? 1 : 0);
