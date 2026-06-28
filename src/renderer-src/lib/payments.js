/* Shared payment helpers — format constants and row validation, ported from
 * the original renderer.js so the same rules apply across screens. All actual
 * format/validation logic lives in the pure core engines. */
import * as Core from '../core.js';

const S = Core.Santander;

export const STANDARD18 = 'STANDARD18';
export const ISO20022 = 'ISO20022';
export const SEPA = 'SEPA';

export const FORMAT_LABELS = {
  BACS_IMPORT: 'Bacs import (.txt)',
  MIXED: 'Mixed payments (.txt)',
  STANDARD18: 'Standard 18 (.txt)',
  ISO20022: 'UK domestic (.xml)',
  SEPA: 'SEPA EUR (.xml)'
};

export const EXPORT_LABELS = {
  BACS_IMPORT: 'Export Bacs file (.txt)',
  MIXED: 'Export Mixed file (.txt)',
  STANDARD18: 'Export Standard 18 (.txt)',
  ISO20022: 'Export ISO 20022 (.xml)',
  SEPA: 'Export SEPA (.xml)'
};

// Standard 18 and ISO 20022 validate their rows like the Mixed format.
export function validationFormat(outputFormat) {
  return (outputFormat === STANDARD18 || outputFormat === ISO20022)
    ? S.OUTPUT_FORMATS.MIXED : outputFormat;
}

// Validate a row, augmenting with a UK modulus check (amber warning, not error).
export function validateRow(p, settings) {
  if (settings.outputFormat === SEPA) return Core.Sepa.validateSepaPayment(p);
  const r = S.validatePayment(p, settings.paymentType, validationFormat(settings.outputFormat));
  const sort = onlyDigits(p.sortCode);
  const acct = onlyDigits(p.accountNumber);
  if (Core.Modulus && sort.length === 6 && acct.length === 8
    && !r.fieldErrors.accountNumber && !r.fieldWarnings.accountNumber) {
    const m = Core.Modulus.check(sort, acct);
    if (m.checked && !m.valid) {
      r.fieldWarnings.accountNumber = 'Sort code / account fails the bank modulus check — likely a typo';
      r.warnings = Object.values(r.fieldWarnings);
    }
  }
  return r;
}

export function onlyDigits(s) { return String(s == null ? '' : s).replace(/\D/g, ''); }

export function emptyPayment() {
  return { name: '', sortCode: '', accountNumber: '', iban: '', bic: '', amount: '', reference: '', rti: '' };
}
