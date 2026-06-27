/*
 * standard18.js — Bacs Standard 18 credit records (BETA).
 * ---------------------------------------------------------------------------
 * Standard 18 is the long-standing fixed-width UK Bacs file accepted (in some
 * form) by many banks and bureaus. This module produces the 100-character
 * CREDIT data records (transaction code 99). Field layout (1-indexed):
 *
 *   1–6    Destination sort code        (6n)
 *   7–14   Destination account number   (8n)
 *   15     Destination account type     (1n, '0')
 *   16–17  Transaction code             (2n, '99' = direct credit)
 *   18–23  Originating sort code        (6n)
 *   24–31  Originating account number   (8n)
 *   32–35  Free format                  (4, spaces)
 *   36–46  Amount in pence              (11n, leading zeros)
 *   47–64  Originator's name            (18, left-justified)
 *   65–82  Payment reference            (18)
 *   83–100 Destination account name     (18)
 *
 * Note: many banks also require tape-label records (VOL1/HDR/UHL1/UTL1/EOF)
 * wrapped around the data — those vary by bank/SUN and are intentionally NOT
 * added here. Check your bank's upload guidance.
 */
const STD18 = {
  recordLength: 100,
  transactionCode: '99',
  accountType: '0',
  freeFormat: '    ',
  illegal: /[^A-Z0-9 .&/-]/g,
  lineEnding: '\r\n'
};

function s18Digits(s) { return String(s == null ? '' : s).replace(/\D/g, ''); }

// Fixed-width text: uppercase, strip illegal chars, left-justify, space-pad.
function s18Text(value, len) {
  const s = String(value == null ? '' : value).toUpperCase().replace(STD18.illegal, '').slice(0, len);
  return s.padEnd(len, ' ');
}

// Fixed-width number: digits only, right-justify, zero-pad.
function s18Num(value, len) {
  return s18Digits(value).slice(-len).padStart(len, '0');
}

function s18AmountPence(amount) {
  const pence = Math.round(Number(amount) * 100);
  return String(isFinite(pence) ? pence : 0).padStart(11, '0');
}

// Build a single 100-char credit record.
function buildStandard18Record(settings, p) {
  const rec =
    s18Num(p.sortCode, 6) +                         // 1–6
    s18Num(p.accountNumber, 8) +                    // 7–14
    STD18.accountType +                             // 15
    STD18.transactionCode +                         // 16–17
    s18Num(settings.originatorSort, 6) +            // 18–23
    s18Num(settings.originatorAccount, 8) +         // 24–31
    STD18.freeFormat +                              // 32–35
    s18AmountPence(p.amount) +                      // 36–46
    s18Text(settings.originatorName, 18) +          // 47–64
    s18Text(p.reference, 18) +                      // 65–82
    s18Text(p.name, 18);                            // 83–100
  return rec;
}

function buildStandard18File(settings, payments) {
  return payments.map((p) => buildStandard18Record(settings, p)).join(STD18.lineEnding) + STD18.lineEnding;
}

// settings: originatorSort (6), originatorAccount (8). Payment date isn't part
// of the data record (it lives in the UHL1 label, which we don't emit).
function validateStandard18Settings(s) {
  const errors = [];
  if (s18Digits(s.originatorSort).length !== 6) errors.push('Your sort code must be 6 digits');
  if (s18Digits(s.originatorAccount).length !== 8) errors.push('Your account number must be 8 digits');
  return { errors, valid: errors.length === 0 };
}

const Standard18 = {
  STD18,
  buildStandard18File,
  buildStandard18Record,
  validateStandard18Settings,
  s18Text, s18Num, s18AmountPence
};

if (typeof window !== 'undefined') window.Standard18 = Standard18;
if (typeof module !== 'undefined' && module.exports) module.exports = Standard18;
