/*
 * modulus.js — UK sort code + account number modulus checking.
 * ---------------------------------------------------------------------------
 * Implements the VocaLink / Pay.UK "Validating account numbers" algorithm
 * (MOD10 / MOD11 / DBLAL double-alternate, plus the 14 exceptions) against the
 * official weight tables bundled in modulus-data.js. Used to flag a sort code +
 * account number combination that can't be a real account (i.e. a likely typo).
 *
 * Algorithm follows the published VocaLink spec; the exception logic was
 * cross-checked against the MIT-licensed reference implementation
 * github.com/uphold/uk-modulus-checking and verified against VocaLink's official
 * test cases (see test/run.js).
 */
const POS = { u: 0, v: 1, w: 2, x: 3, y: 4, z: 5, a: 6, b: 7, c: 8, d: 9, e: 10, f: 11, g: 12, h: 13 };

const DATA = (typeof window !== 'undefined' && window.ModulusData)
  ? window.ModulusData
  : (typeof require !== 'undefined' ? require('./modulus-data.js') : { weights: [], substitutions: {} });

function digit(number, name) { return parseInt(number.charAt(POS[name]), 10); }
function wt(check, name) { return check.weights[POS[name]]; }   // weight at a named position

// The (up to two) weight-table rows whose range contains this sort code.
function sortCodeChecks(sortCode) {
  const sc = parseInt(sortCode, 10);
  const checks = [];
  for (const c of DATA.weights) {
    if (sc >= parseInt(c.start, 10) && sc <= parseInt(c.end, 10)) checks.push(c);
    if (checks.length === 2) break;
  }
  return checks;
}

// The 14-digit string (sort code + account), with substitutions for some exceptions.
function buildNumber(check, sortCode, accountNumber) {
  let sc = sortCode;
  if (check.exception === 5) sc = DATA.substitutions[sortCode] || sortCode;
  else if (check.exception === 8) sc = '090126';
  else if (check.exception === 9) sc = '309634';
  return sc + accountNumber;
}

// The weights to use, accounting for exceptions that override them.
function checkWeights(check, number) {
  if (check.exception === 2) {
    if (digit(number, 'a') !== 0 && digit(number, 'g') !== 9) return [0, 0, 1, 2, 5, 3, 6, 4, 8, 7, 10, 9, 3, 1];
    if (digit(number, 'a') !== 0 && digit(number, 'g') === 9) return [0, 0, 0, 0, 0, 0, 0, 0, 8, 7, 10, 9, 3, 1];
  }
  if (check.exception === 7 && digit(number, 'g') === 9) {
    return [0, 0, 0, 0, 0, 0, 0, 0, wt(check, 'c'), wt(check, 'd'), wt(check, 'e'), wt(check, 'f'), wt(check, 'g'), wt(check, 'h')];
  }
  if (check.exception === 10) {
    const ab = number.charAt(POS.a) + number.charAt(POS.b);
    if (ab === '09' || ab === '99') {
      return [0, 0, 0, 0, 0, 0, 0, 0, wt(check, 'c'), wt(check, 'd'), wt(check, 'e'), wt(check, 'f'), wt(check, 'g'), wt(check, 'h')];
    }
  }
  return check.weights;
}

function isSkippable(check, number) {
  if (check.exception === 3 && (digit(number, 'c') === 6 || digit(number, 'c') === 9)) return true;
  if (check.exception === 6 && digit(number, 'a') >= 4 && digit(number, 'a') <= 8
    && digit(number, 'g') === digit(number, 'h')) return true;
  return false;
}

function isCheckValid(check, sortCode, accountNumber) {
  const number = buildNumber(check, sortCode, accountNumber);
  if (isSkippable(check, number)) return true;

  const modulus = check.method === 'MOD11' ? 11 : 10;
  const weights = checkWeights(check, number);

  let products = [];
  for (let i = 0; i < 14; i++) products[i] = parseInt(number.charAt(i), 10) * weights[i];

  // Double-alternate: sum the individual digits of every product, not the products.
  if (check.method === 'DBLAL') products = products.join('').split('');

  let total = products.reduce((sum, n) => sum + parseInt(n, 10), 0);
  if (check.exception === 1) total += 27;   // notional 580149 prefix, also alternate-doubled

  const remainder = total % modulus;

  if (check.exception === 4) return remainder === digit(number, 'g') + digit(number, 'h');

  if (check.exception === 5) {
    if (check.method === 'DBLAL') {
      if (remainder === 0 && digit(number, 'h') === 0) return true;
      return digit(number, 'h') === 10 - remainder;
    }
    if (remainder === 1) return false;
    if (remainder === 0 && digit(number, 'g') === 0) return true;
    return digit(number, 'g') === 11 - remainder;
  }

  return remainder === 0;
}

// Exceptions where, if the first check passes, the account is valid regardless
// of the second check (or where a failing first check still allows the second).
const FIRST_PASS_WINS = [2, 9, 10, 11, 12, 13, 14];

function isValid(sortCode, accountNumber) {
  const checks = sortCodeChecks(sortCode);
  if (checks.length === 0) return null;   // no range → can't be modulus-checked
  const first = checks[0];

  if (isCheckValid(first, sortCode, accountNumber)) {
    if (checks.length === 1 || FIRST_PASS_WINS.indexOf(first.exception) !== -1) return true;
    return isCheckValid(checks[1], sortCode, accountNumber);
  }

  // Exception 14: if the first check fails and the 8th digit is 0/1/9, retry with
  // a shifted account number.
  if (first.exception === 14) {
    if ([0, 1, 9].indexOf(parseInt(accountNumber.charAt(7), 10)) === -1) return false;
    return isCheckValid(first, sortCode, '0' + accountNumber.slice(0, 7));
  }

  if (checks.length === 1 || FIRST_PASS_WINS.indexOf(first.exception) === -1) return false;
  return isCheckValid(checks[1], sortCode, accountNumber);
}

// Public API: returns { checked, valid }. checked=false means the sort code isn't
// in the weight table, so no judgement can be made (treat as fine).
function check(sortCode, accountNumber) {
  const sc = String(sortCode == null ? '' : sortCode).replace(/\D/g, '');
  const acc = String(accountNumber == null ? '' : accountNumber).replace(/\D/g, '');
  if (sc.length !== 6 || acc.length < 6 || acc.length > 10) return { checked: false, valid: true };
  const result = isValid(sc, acc);
  if (result === null) return { checked: false, valid: true };
  return { checked: true, valid: result };
}

const Modulus = { check, isValid };

if (typeof window !== 'undefined') window.Modulus = Modulus;
if (typeof module !== 'undefined' && module.exports) module.exports = Modulus;
