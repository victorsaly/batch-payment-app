/*
 * sepa.js — SEPA Credit Transfer, ISO 20022 pain.001.001.03 (EUR / IBAN).
 * ---------------------------------------------------------------------------
 * Pays euros to EU/EEA IBANs. BIC is optional ("IBAN-only" SEPA): supplied BICs
 * are validated and included; otherwise the creditor agent is omitted and the
 * debtor agent is marked NOTPROVIDED.
 *
 * ⚠️ Built best-effort from the public ISO 20022 SEPA rulebook — NOT verified
 * against a specific bank. Profiles vary (BIC requirements, service levels,
 * batch booking). ALWAYS do a test upload before relying on this.
 */
const SEPACFG = {
  namespace: 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.03',
  currency: 'EUR',
  serviceLevel: 'SEPA',
  chargeBearer: 'SLEV',
  paymentMethod: 'TRF',
  batchBooking: true,
  indent: '  ',
  lineEnding: '\n'
};

function xmlEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function sepaAmount(amount) {
  const n = Number(amount);
  return (isFinite(n) ? n : 0).toFixed(2);
}

function sepaTotal(payments) {
  return payments.reduce((sum, p) => {
    const n = Number(p.amount);
    return sum + (isFinite(n) ? n : 0);
  }, 0).toFixed(2);
}

function cleanIban(iban) {
  return String(iban == null ? '' : iban).replace(/\s+/g, '').toUpperCase();
}

function cleanBic(bic) {
  return String(bic == null ? '' : bic).replace(/\s+/g, '').toUpperCase();
}

// IBAN check: structure + ISO 7064 mod-97-10 (valid IBANs leave remainder 1).
function isValidIban(iban) {
  const s = cleanIban(iban);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(s) || s.length < 15 || s.length > 34) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  const expanded = rearranged.replace(/[A-Z]/g, (c) => (c.charCodeAt(0) - 55).toString());
  let remainder = 0;
  for (let i = 0; i < expanded.length; i++) remainder = (remainder * 10 + (expanded.charCodeAt(i) - 48)) % 97;
  return remainder === 1;
}

// BIC: 4 bank + 2 country + 2 location (+ optional 3 branch) = 8 or 11 chars.
function isValidBic(bic) {
  return /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(cleanBic(bic));
}

function e2eId(reference, index) {
  const ref = String(reference == null ? '' : reference)
    .replace(/[^A-Za-z0-9./\- ]/g, '').trim().slice(0, 35);
  return ref || `NOTPROVIDED${index + 1}`.slice(0, 35);
}

// ----------------------------- XML builder --------------------------------

function el(depth, tag, inner, attrs) {
  const pad = SEPACFG.indent.repeat(depth);
  const a = attrs ? ' ' + attrs : '';
  if (inner === undefined || inner === null) return `${pad}<${tag}${a}/>`;
  if (typeof inner === 'string') return `${pad}<${tag}${a}>${inner}</${tag}>`;
  return [`${pad}<${tag}${a}>`, ...inner, `${pad}</${tag}>`].join(SEPACFG.lineEnding);
}

// Agent block: <BIC> when supplied, else IBAN-only marker.
function agent(depth, bic) {
  const b = cleanBic(bic);
  return el(depth, 'FinInstnId', b
    ? [el(depth + 1, 'BIC', xmlEscape(b))]
    : [el(depth + 1, 'Othr', [el(depth + 2, 'Id', 'NOTPROVIDED')])]);
}

function creditTransfer(depth, p, index) {
  const lines = [
    el(depth + 1, 'PmtId', [el(depth + 2, 'EndToEndId', xmlEscape(e2eId(p.reference, index)))]),
    el(depth + 1, 'Amt', [el(depth + 2, 'InstdAmt', sepaAmount(p.amount), `Ccy="${SEPACFG.currency}"`)])
  ];
  if (cleanBic(p.bic)) lines.push(el(depth + 1, 'CdtrAgt', [agent(depth + 2, p.bic)]));
  lines.push(
    el(depth + 1, 'Cdtr', [el(depth + 2, 'Nm', xmlEscape(String(p.name || '').trim().slice(0, 70)))]),
    el(depth + 1, 'CdtrAcct', [el(depth + 2, 'Id', [el(depth + 3, 'IBAN', xmlEscape(cleanIban(p.iban)))])]),
    el(depth + 1, 'RmtInf', [el(depth + 2, 'Ustrd', xmlEscape(String(p.reference || '').trim().slice(0, 140)))])
  );
  return el(depth, 'CdtTrfTxInf', lines);
}

// settings: debtorName, debtorIban, debtorBic (optional), requestedExecutionDate
//   (yyyy-mm-dd), messageId, creationDateTime (ISO 8601).
function buildSepaPain001(settings, payments) {
  const count = String(payments.length);
  const ctrlSum = sepaTotal(payments);
  const debtorName = xmlEscape(String(settings.debtorName || '').trim().slice(0, 70));
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
    el(3, 'PmtMtd', SEPACFG.paymentMethod),
    el(3, 'BtchBookg', String(SEPACFG.batchBooking)),
    el(3, 'NbOfTxs', count),
    el(3, 'CtrlSum', ctrlSum),
    el(3, 'PmtTpInf', [el(4, 'SvcLvl', [el(5, 'Cd', SEPACFG.serviceLevel)])]),
    el(3, 'ReqdExctnDt', xmlEscape(settings.requestedExecutionDate || '')),
    el(3, 'Dbtr', [el(4, 'Nm', debtorName)]),
    el(3, 'DbtrAcct', [el(4, 'Id', [el(5, 'IBAN', xmlEscape(cleanIban(settings.debtorIban)))])]),
    el(3, 'DbtrAgt', [agent(4, settings.debtorBic)]),
    el(3, 'ChrgBr', SEPACFG.chargeBearer),
    ...payments.map((p, i) => creditTransfer(3, p, i))
  ]);

  const doc = el(0, 'Document', [el(1, 'CstmrCdtTrfInitn', [grpHdr, pmtInf])], `xmlns="${SEPACFG.namespace}"`);
  return `<?xml version="1.0" encoding="UTF-8"?>${SEPACFG.lineEnding}${doc}${SEPACFG.lineEnding}`;
}

// --------------------------- validation -----------------------------------

// One beneficiary row. Field keys match the grid (name, iban, bic, amount, reference).
function validateSepaPayment(p) {
  const fe = {}, fw = {};
  if (!String(p.name || '').trim()) fe.name = 'Name is required';

  const iban = cleanIban(p.iban);
  if (!iban) fe.iban = 'IBAN is required';
  else if (!isValidIban(iban)) fe.iban = 'IBAN is not valid — check the digits';

  if (cleanBic(p.bic) && !isValidBic(p.bic)) fe.bic = 'BIC must be 8 or 11 characters';

  const amount = Number(p.amount);
  if (!p.amount && p.amount !== 0) fe.amount = 'Amount is required';
  else if (!isFinite(amount)) fe.amount = 'Amount must be a number';
  else if (amount <= 0) fe.amount = 'Amount must be greater than 0';
  else if (!/^\d+(\.\d{1,2})?$/.test(String(p.amount).trim())) fe.amount = 'Amount must be euros and cents, e.g. 150.50';

  return {
    fieldErrors: fe, fieldWarnings: fw,
    errors: Object.values(fe), warnings: Object.values(fw),
    valid: Object.keys(fe).length === 0
  };
}

function validateSepaSettings(s) {
  const errors = [];
  if (!String(s.debtorName || '').trim()) errors.push('Your name (the payer) is required');
  if (!isValidIban(s.debtorIban)) errors.push('Your IBAN is not valid');
  if (cleanBic(s.debtorBic) && !isValidBic(s.debtorBic)) errors.push('Your BIC is not valid');
  return { errors, valid: errors.length === 0 };
}

const Sepa = {
  SEPACFG,
  buildSepaPain001,
  validateSepaSettings, validateSepaPayment,
  isValidIban, isValidBic,
  xmlEscape, sepaAmount, sepaTotal, cleanIban, cleanBic, e2eId
};

if (typeof window !== 'undefined') window.Sepa = Sepa;
if (typeof module !== 'undefined' && module.exports) module.exports = Sepa;
