/* ESM adapter over the pure format engines in ../*.js.
 *
 * Those files are dual-target: they assign to `window.X` for the browser and
 * `module.exports` for the Node test suite. We import them for their side
 * effect (setting the window globals, in dependency order) and re-export the
 * resulting objects so React code gets clean named imports — without touching
 * the engines themselves (so `npm test` and the XSD CI keep working as-is). */
import '../banks.js';
import '../santander.js';
import '../standard18.js';
import '../iso20022.js';
import '../sepa.js';
import '../modulus-data.js';
import '../modulus.js';

export const Banks = window.Banks;
export const Santander = window.Santander;
export const Standard18 = window.Standard18;
export const ISO20022 = window.ISO20022;
export const Sepa = window.Sepa;
export const Modulus = window.Modulus;
