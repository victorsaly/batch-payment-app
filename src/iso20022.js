/*
 * iso20022.js — ISO 20022 pain.001.001.09 (CustomerCreditTransferInitiation).
 * ---------------------------------------------------------------------------
 * Generates the modern XML credit-transfer file accepted (in some profile) by
 * HSBC, Barclays, Lloyds, NatWest and others.
 *
 * SCOPE (v1): UK DOMESTIC, GBP credit transfers identified by sort code +
 * account number (GBDSC clearing system). SEPA / IBAN / multi-currency /
 * international are NOT handled yet.
 *
 * ⚠️ Built best-effort from the public ISO 20022 schema — NOT verified against a
 * specific bank. Each bank uses its own pain.001 profile (mandatory tags,
 * service levels, charge bearer, BIC vs clearing id all vary). The tweakable
 * bits live in ISO below. ALWAYS do a test upload before relying on this.
 */
const ISO = {
  namespace: 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.09',
  clearingSystem: 'GBDSC',   // UK domestic sort code clearing system code
  currency: 'GBP',
  paymentMethod: 'TRF',
  batchBooking: true,
  indent: '  ',
  lineEnding: '\n'
};

function isoDigits(s) {
  return String(s == null ? '' : s).replace(/\D/g, '');
}

function xmlEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function isoAmount(amount) {
  const n = Number(amount);
  return (isFinite(n) ? n : 0).toFixed(2);
}

function isoTotal(payments) {
  return payments.reduce((sum, p) => {
    const n = Number(p.amount);
    return sum + (isFinite(n) ? n : 0);
  }, 0).toFixed(2);
}

// End-to-end id: a cleaned reference (max 35 chars), else the ISO convention.
function e2eId(reference, index) {
  const ref = String(reference == null ? '' : reference)
    .replace(/[^A-Za-z0-9./\- ]/g, '').trim().slice(0, 35);
  return ref || `NOTPROVIDED${index + 1}`.slice(0, 35);
}

// ----------------------------- builder ------------------------------------

// Tiny XML element builder with indentation.
function el(depth, tag, inner, attrs) {
  const pad = ISO.indent.repeat(depth);
  const a = attrs ? ' ' + attrs : '';
  if (inner === undefined || inner === null) return `${pad}<${tag}${a}/>`;
  if (typeof inner === 'string') return `${pad}<${tag}${a}>${inner}</${tag}>`;
  // inner is an array of already-rendered lines
  return [`${pad}<${tag}${a}>`, ...inner, `${pad}</${tag}>`].join(ISO.lineEnding);
}

// A UK agent block (sort code in the clearing-system member id).
function agent(depth, sortCode) {
  return el(depth, 'FinInstnId', [
    el(depth + 1, 'ClrSysMmbId', [
      el(depth + 2, 'ClrSysId', [el(depth + 3, 'Cd', ISO.clearingSystem)]),
      el(depth + 2, 'MmbId', isoDigits(sortCode))
    ])
  ]);
}

function creditTransfer(depth, p, index) {
  return el(depth, 'CdtTrfTxInf', [
    el(depth + 1, 'PmtId', [el(depth + 2, 'EndToEndId', xmlEscape(e2eId(p.reference, index)))]),
    el(depth + 1, 'Amt', [el(depth + 2, 'InstdAmt', isoAmount(p.amount), `Ccy="${ISO.currency}"`)]),
    el(depth + 1, 'CdtrAgt', [agent(depth + 2, p.sortCode)]),
    el(depth + 1, 'Cdtr', [el(depth + 2, 'Nm', xmlEscape(String(p.name || '').trim().slice(0, 140)))]),
    el(depth + 1, 'CdtrAcct', [
      el(depth + 2, 'Id', [el(depth + 3, 'Othr', [el(depth + 4, 'Id', isoDigits(p.accountNumber))])])
    ]),
    el(depth + 1, 'RmtInf', [el(depth + 2, 'Ustrd', xmlEscape(String(p.reference || '').trim().slice(0, 140)))])
  ]);
}

// settings: debtorName, debtorSort, debtorAccount, requestedExecutionDate
//   (yyyy-mm-dd), messageId, creationDateTime (ISO 8601). currency optional.
function buildPain001(settings, payments) {
  const count = String(payments.length);
  const ctrlSum = isoTotal(payments);
  const debtorName = xmlEscape(String(settings.debtorName || '').trim().slice(0, 140));
  const msgId = xmlEscape(String(settings.messageId || '').slice(0, 35));

  const grpHdr = el(2, 'GrpHdr', [
    el(3, 'MsgId', msgId),
    el(3, 'CreDtTm', xmlEscape(settings.creationDateTime || '')),
    el(3, 'NbOfTxs', count),
    el(3, 'CtrlSum', ctrlSum),
    el(3, 'InitgPty', [el(4, 'Nm', debtorName)])
  ]);

  const pmtInf = el(2, 'PmtInf', [
    el(3, 'PmtInfId', msgId),
    el(3, 'PmtMtd', ISO.paymentMethod),
    el(3, 'BtchBookg', String(ISO.batchBooking)),
    el(3, 'NbOfTxs', count),
    el(3, 'CtrlSum', ctrlSum),
    el(3, 'ReqdExctnDt', [el(4, 'Dt', xmlEscape(settings.requestedExecutionDate || ''))]),
    el(3, 'Dbtr', [el(4, 'Nm', debtorName)]),
    el(3, 'DbtrAcct', [
      el(4, 'Id', [el(5, 'Othr', [el(6, 'Id', isoDigits(settings.debtorAccount))])]),
      el(4, 'Ccy', ISO.currency)
    ]),
    el(3, 'DbtrAgt', [agent(4, settings.debtorSort)]),
    ...payments.map((p, i) => creditTransfer(3, p, i))
  ]);

  const doc = el(0, 'Document', [
    el(1, 'CstmrCdtTrfInitn', [grpHdr, pmtInf])
  ], `xmlns="${ISO.namespace}"`);

  return `<?xml version="1.0" encoding="UTF-8"?>${ISO.lineEnding}${doc}${ISO.lineEnding}`;
}

// --------------------------- validation -----------------------------------

function validateIso20022Settings(s) {
  const errors = [];
  if (!String(s.debtorName || '').trim()) errors.push('Your name (the payer) is required');
  if (isoDigits(s.debtorSort).length !== 6) errors.push('Your sort code must be 6 digits');
  if (isoDigits(s.debtorAccount).length !== 8) errors.push('Your account number must be 8 digits');
  return { errors, valid: errors.length === 0 };
}

// Named with an "Api" suffix so it can't collide with the renderer's
// `const ISO20022 = 'ISO20022'` format-id (classic scripts share global scope).
const ISO20022Api = {
  ISO,
  buildPain001,
  validateIso20022Settings,
  xmlEscape, isoAmount, isoTotal, e2eId
};

if (typeof window !== 'undefined') window.ISO20022 = ISO20022Api;
if (typeof module !== 'undefined' && module.exports) module.exports = ISO20022Api;
